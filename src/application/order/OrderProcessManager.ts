import type {
	InventoryReservedEvent,
	InventoryRollbackCompletedEvent,
	InventoryUnavailableEvent,
	PaymentDeductedCompletedEvent,
	PaymentDeductedFailedEvent,
} from "@alejotamayo28/event-contracts";
import { type CancellationReason, OrderStatus } from "@alejotamayo28/event-contracts";
import type { Order } from "@/domain/entities/Order";
import { Outbox } from "@/domain/entities/Outbox";
import type { OrderRepository } from "@/domain/repositories/OrderRepository";
import type {
	IncomingEvents,
	IncomingIntegrationEvent,
} from "@/infrastructure/events/IntegrationEvents";
import type { EventRepository } from "../ports/EventRepository";
import type { IntegrationEventMapper } from "../ports/IntegrationEventMapper";
import type { OutboxRepository } from "../ports/OutboxRepository";
import type { TransactionManager } from "../ports/TransactionManager";
import type { OrderProjection, OrderState } from "../projections/OrderProjection";

export class OrderProcessManager {
	constructor(
		private readonly orderRepository: OrderRepository,
		private readonly orderProjection: OrderProjection,
		private readonly transactionManager: TransactionManager,
		private readonly outboxRepository: OutboxRepository,
		private readonly integrationEventMapper: IntegrationEventMapper,
		private readonly eventRepository: EventRepository
	) {}

	async handleInventoryReservationCompleted(
		message: IncomingIntegrationEvent<InventoryReservedEvent>
	): Promise<void> {
		return this.processEvent(message, async (order, state) => {
			order.markInventoryReservationCompleted();
			state.inventory = "reserved";
			state.hasPending = state.payment === "pending";
			await this.evaluateOrderCompletion(order, state);
		});
	}

	async handleInventoryReservationFailed(
		message: IncomingIntegrationEvent<InventoryUnavailableEvent>
	): Promise<void> {
		return this.processEvent(message, async (order, state) => {
			const reason = this.extractReasonFromPayload(message);
			order.markInventoryReservationFailed(reason);
			state.inventory = "unavailable";
			state.inventoryReason = reason;
			state.hasPending = state.payment === "pending";
			await this.evaluateOrderCompletion(order, state);
		});
	}

	async handleInventoryRollbackCompleted(
		message: IncomingIntegrationEvent<InventoryRollbackCompletedEvent>
	): Promise<void> {
		return this.processEvent(message, async (order, _state) => {
			order.markInventoryRollbackCompleted();
			order.transitionTo(OrderStatus.COMPENSATED);
		});
	}

	async handlePaymentDeductedCompleted(
		message: IncomingIntegrationEvent<PaymentDeductedCompletedEvent>
	): Promise<void> {
		return this.processEvent(message, async (order, state) => {
			order.markPaymentDeductionCompleted();
			state.payment = "approved";
			state.hasPending = state.inventory === "pending";
			await this.evaluateOrderCompletion(order, state);
		});
	}

	async handlePaymentDeductedFailed(
		message: IncomingIntegrationEvent<PaymentDeductedFailedEvent>
	): Promise<void> {
		return this.processEvent(message, async (order, state) => {
			const reason = this.extractReasonFromPayload(message);
			order.markPaymentVerificationFailed(reason);
			state.payment = "rejected";
			state.paymentReason = reason;
			state.hasPending = state.inventory === "pending";
			await this.evaluateOrderCompletion(order, state);
		});
	}

	private async evaluateOrderCompletion(order: Order, state: OrderState): Promise<void> {
		if (state.hasPending) {
			return;
		}

		if (state.payment === "approved" && state.inventory === "reserved") {
			order.transitionTo(OrderStatus.CONFIRMED);
		} else if (state.payment === "rejected" || state.inventory === "unavailable") {
			this.reconstructCancellationReasons(
				order,
				state.paymentReason as CancellationReason | null,
				state.inventoryReason as CancellationReason | null
			);
			order.cancel(state.payment, state.inventory);
		}
	}

	private async processEvent<T extends IncomingEvents>(
		message: IncomingIntegrationEvent<T>,
		eventLogic: (order: Order, state: OrderState) => Promise<void>
	): Promise<void> {
		await this.transactionManager.runInTransaction(async () => {
			const order = await this.loadOrder(message.payload.orderId);

			const state = await this.orderProjection.reconstruct(order.getId());
			if (!state) {
				throw new Error(`NO_STATE_FOUND_FOR_ORDER_${order.getId()}`);
			}

			await eventLogic(order, state);
			await this.persistAllChanges(order);
		});
	}

	private async loadOrder(orderId: string): Promise<Order> {
		const order = await this.orderRepository.findById(orderId);
		if (!order) {
			throw new Error(`ORDER_NOT_FOUND_${orderId}`);
		}
		return order;
	}

	private async persistAllChanges(order: Order): Promise<void> {
		const domainEvents = order.getDomainEvents();
		if (domainEvents.length === 0) {
			return;
		}

		const lastEvent = await this.eventRepository.getLastVersion(order.getId());
		const lastVersion = lastEvent?.getVersion() ?? 0;
		await this.eventRepository.append(order, lastVersion);

		await this.orderProjection.update(order);

		await this.createOutboxEntries(order);

		order.clearDomainEvents();
	}

	private async createOutboxEntries(order: Order): Promise<void> {
		const domainEvents = order.getDomainEvents();
		if (domainEvents.length === 0) {
			return;
		}

		const integrationEvents = domainEvents.map((event) => {
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
	}

	private extractReasonFromPayload<T extends IncomingEvents>(
		message: IncomingIntegrationEvent<T>
	): string {
		const payload = message.payload as any;
		return payload?.reason || payload?.error || "UNKNOWN_REASON";
	}

	private reconstructCancellationReasons(
		order: Order,
		paymentReason?: CancellationReason | null,
		inventoryReason?: CancellationReason | null
	): void {
		if (paymentReason) {
			order.addCancellationReasons(paymentReason);
		}
		if (inventoryReason) {
			order.addCancellationReasons(inventoryReason);
		}
	}
}
