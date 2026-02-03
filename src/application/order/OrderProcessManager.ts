import {
	type CancellationReason,
	type OrderDomainEvent,
	OrderStatus,
} from "@alejotamayo28/event-contracts";
import type { Order } from "@/domain/entities/Order";
import { Outbox } from "@/domain/entities/Outbox";
import type { OrderRepository } from "@/domain/repositories/OrderRepository";
import type {
	IncomingEvents,
	IncomingIntegrationEvent,
} from "@/infrastructure/events/IntegrationEvents";
import type { EventRepository } from "../ports/EventRepository";
import type { IntegrationEventMapper } from "../ports/IntegrationEventMapper";
import type { OrderCheckRepository, OrderChecks } from "../ports/OrderCheckRepository";
import type { OutboxRepository } from "../ports/OutboxRepository";
import type { TransactionManager } from "../ports/TransactionManager";
import type { UpdateOrderStatusUseCase } from "../use-cases/UpdateOrderStatusUseCase";

interface OrderProcessContext {
	order: Order;
	checkState: OrderChecks;
	domainEvents: OrderDomainEvent[];
}

export type PaymentStatus = "pending" | "approved" | "rejected";

export type InventoryStatus = "pending" | "reserved" | "unavailable";

export class OrderProcessManager {
	private static readonly ORDER_TIMEOUT_MS = 60_000;

	constructor(
		private readonly orderRepository: OrderRepository,
		private readonly orderCheckRepository: OrderCheckRepository,
		private readonly transactionManager: TransactionManager,
		private readonly updateOrderStatus: UpdateOrderStatusUseCase,
		private readonly outboxRepository: OutboxRepository,
		private readonly integrationEventMapper: IntegrationEventMapper,
		private readonly eventRepository: EventRepository
	) {}

	public async handle<T extends IncomingEvents>(
		eventMessage: IncomingIntegrationEvent<T>,
		checkType: "paymentCheck" | "inventoryCheck",
		status: "pending" | "completed" | "failed"
	): Promise<void> {
		await this.transactionManager.runInTransaction(async () => {
			await this.updateChecks(eventMessage, checkType, status);
			await this.processOrder<T>(eventMessage);
		});
	}

	private async processOrder<T extends IncomingEvents>(
		eventMessage: IncomingIntegrationEvent<T>
	): Promise<void> {
		const context = await this.loadContext(eventMessage.payload.orderId);
		if (!context) return;

		await this.updateOrderStatus.execute(eventMessage, context.order);

		const updatedCheckState = await this.orderCheckRepository.get(
			eventMessage.payload.orderId
		);
		if (updatedCheckState) {
			context.checkState = updatedCheckState;
		}

		this.decide(context);
		await this.apply(context);
	}

	private async loadContext(orderId: string): Promise<OrderProcessContext | null> {
		const checkState = await this.orderCheckRepository.get(orderId);
		if (!checkState) return null;

		const order = await this.orderRepository.findById(orderId);
		if (!order) return null;

		return {
			order,
			checkState,
			domainEvents: [],
		};
	}

	private decide(context: OrderProcessContext): void {
		const { order, checkState } = context;
		const { payment, inventory, paymentReason, inventoryReason } = checkState;

		if (this.hasPending(payment, inventory)) {
			if (this.isOrderStale(checkState)) {
				this.applyTimeout(checkState);
			}
			return;
		}

		if (payment === "approved" && inventory === "reserved") {
			order.transitionTo(OrderStatus.CONFIRMED);
			return;
		}

		if (payment === "rejected" || inventory === "unavailable") {
			this.reconstructCancellationReasons(order, paymentReason, inventoryReason);
			order.transitionTo(OrderStatus.CANCELLED, {
				paymentStatus: payment,
				inventoryStatus: inventory,
			});
		}
	}

	private async apply(context: OrderProcessContext): Promise<void> {
		const { order } = context;

		if (order.getWasUpdated()) {
			await this.orderRepository.update(order);
		}

		if (order.getDomainEvents().length > 0) {
			const lastEvent = await this.eventRepository.getLastVersion(order.getId());
			const lastVersion = lastEvent?.getVersion() ?? 0;

			await this.eventRepository.append(order, lastVersion);

			const integrationEvents = order.getDomainEvents().map((event) => {
				const mapped = this.integrationEventMapper.map(event);
				if (!mapped) {
					throw new Error("NO_MAPPER_FOUND_FOR_EVENT");
				}
				return mapped;
			});

			const outboxes = integrationEvents.map(
				(event) =>
					new Outbox(
						event.eventType,
						event.payload,
						event.correlationId,
						event.version,
						new Date(event.occurredAt),
						event.exchange,
						event.routingKey,
						event.source
					)
			);

			await this.outboxRepository.saveMany(outboxes);

			order.clearDomainEvents();
		}

		if (!this.hasPending(context.checkState.payment, context.checkState.inventory)) {
			await this.orderCheckRepository.delete(order.getId());
		}
	}

	private hasPending(payment: PaymentStatus, inventory: InventoryStatus): boolean {
		return payment === "pending" || inventory === "pending";
	}

	private isOrderStale(state: OrderChecks): boolean {
		return Date.now() - state.createdAt >= OrderProcessManager.ORDER_TIMEOUT_MS;
	}

	private applyTimeout(state: OrderChecks): void {
		if (state.payment === "pending") state.payment = "rejected";
		if (state.inventory === "pending") state.inventory = "unavailable";
	}

	private reconstructCancellationReasons(
		order: Order,
		paymentReason?: CancellationReason | null,
		inventoryReason?: CancellationReason | null
	): void {
		const reasons: CancellationReason[] = [];

		if (paymentReason) {
			reasons.push(paymentReason);
		}

		if (inventoryReason) {
			reasons.push(inventoryReason);
		}

		if (reasons.length > 0) {
			for (const reason of reasons) {
				order.addCancellationReasons(reason);
			}
		}
	}

	private async updateChecks<T extends IncomingEvents>(
		eventMessage: IncomingIntegrationEvent<T>,
		checkType: "paymentCheck" | "inventoryCheck",
		status: "pending" | "completed" | "failed"
	): Promise<void> {
		const orderId = eventMessage.payload.orderId;

		if (checkType === "paymentCheck") {
			const paymentStatus: PaymentStatus =
				status === "completed"
					? "approved"
					: status === "failed"
						? "rejected"
						: "pending";

			await this.orderCheckRepository.updatePaymentCheck(orderId, paymentStatus);
		} else {
			const inventoryStatus: InventoryStatus =
				status === "completed"
					? "reserved"
					: status === "failed"
						? "unavailable"
						: "pending";

			await this.orderCheckRepository.updateInventoryCheck(orderId, inventoryStatus);
		}
	}
}
