import type { OrderDomainEvent } from "@alejotamayo28/event-contracts";
import { type Order, OrderStatus } from "@/domain/entities/Order";
import type { OrderRepository } from "@/domain/repositories/OrderRepository";
import type {
	IncomingEvents,
	IncomingIntegrationEvent,
} from "@/infrastructure/events/IntegrationEvents";
import type { IntegrationEventMapper } from "../ports/IntegrationEventMapper";
import type { OrderCheckRepository } from "../ports/OrderCheckRepository";
import type { OutboxRepository } from "../ports/OutboxRepository";
import type { TransactionManager } from "../ports/TransactionManager";
import type { UpdateOrderStatusUseCase } from "../use-cases/UpdateOrderStatusUseCase";

interface OrderProcessContext {
	order: Order;
	checkState: OrderCheckState;
	domainEvents: OrderDomainEvent[];
}

export type PaymentStatus = "pending" | "approved" | "rejected";

export type InventoryStatus = "pending" | "reserved" | "unavailable";

export interface OrderCheckState {
	payment: PaymentStatus;
	inventory: InventoryStatus;
	createdAt: number;
}

export class OrderProcessManager {
	private static readonly ORDER_TIMEOUT_MS = 60_000;

	constructor(
		private readonly orderRepository: OrderRepository,
		private readonly orderCheckRepository: OrderCheckRepository,
		private readonly transactionManager: TransactionManager,
		private readonly updateOrderStatus: UpdateOrderStatusUseCase,
		private readonly outboxRepository: OutboxRepository,
		private readonly integrationEventMapper: IntegrationEventMapper
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

		this.decide(context);
		await this.apply(context);
	}

	private async loadContext(orderId: string): Promise<OrderProcessContext | null> {
		const checkState = await this.orderCheckRepository.get(orderId);
		if (!checkState) return null;

		const order = await this.orderRepository.findById(orderId);
		if (!order) return null;

		if (
			order.getStatus() === OrderStatus.CANCELLED ||
			order.getStatus() === OrderStatus.COMPLETED
		) {
			return null;
		}

		return {
			order,
			checkState,
			domainEvents: [],
		};
	}

	private decide(context: OrderProcessContext): void {
		const { order, checkState, domainEvents } = context;
		const { payment, inventory } = checkState;

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
			order.transitionTo(OrderStatus.CANCELLED);
			this.addCompensationEvents(order, payment, inventory, domainEvents);
		}
	}

	private async apply(context: OrderProcessContext): Promise<void> {
		const { order, domainEvents } = context;

		if (order.getWasUpdated()) {
			await this.orderRepository.update(order);
		}

		if (domainEvents.length > 0) {
			const integrationEvents = domainEvents.map((event) => {
				const mapped = this.integrationEventMapper.map(event);
				if (!mapped) {
					throw new Error("NO_MAPPER_FOUND_FOR_EVENT");
				}
				return mapped;
			});

			await this.outboxRepository.save(integrationEvents);
		}

		await this.orderCheckRepository.delete(order.getId());
	}

	private hasPending(payment: PaymentStatus, inventory: InventoryStatus): boolean {
		return payment === "pending" || inventory === "pending";
	}

	private isOrderStale(state: OrderCheckState): boolean {
		return Date.now() - state.createdAt >= OrderProcessManager.ORDER_TIMEOUT_MS;
	}

	private applyTimeout(state: OrderCheckState): void {
		if (state.payment === "pending") state.payment = "rejected";
		if (state.inventory === "pending") state.inventory = "unavailable";
	}

	private addCompensationEvents(
		order: Order,
		payment: PaymentStatus,
		inventory: InventoryStatus,
		events: OrderDomainEvent[]
	): void {
		if (order.needsPaymentRollback(payment, inventory)) {
			events.push({
				type: "ORDER_PAYMENT_ROLLBACK_REQUESTED",
				timestamp: new Date(),
				aggregateId: order.getId(),
				aggregateType: "Order",
				data: { orderId: order.getId() },
			});
		}

		if (order.needsInventoryRollback(payment, inventory)) {
			events.push({
				type: "ORDER_INVENTORY_ROLLBACK_REQUESTED",
				timestamp: new Date(),
				aggregateId: order.getId(),
				aggregateType: "Order",
				data: { orderId: order.getId() },
			});
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
