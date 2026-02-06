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

export type PaymentStatus = "pending" | "approved" | "rejected";
export type InventoryStatus = "pending" | "reserved" | "unavailable";

export class OrderProcessManager {
	private static readonly ORDER_TIMEOUT_MS = 60_000;

	constructor(
		private readonly orderRepository: OrderRepository,
		private readonly orderProjection: OrderProjection,
		private readonly transactionManager: TransactionManager,
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
			await this.saveExternalEvent(eventMessage, checkType, status);

			const orderId = eventMessage.payload.orderId;
			const state = await this.orderProjection.reconstruct(orderId);

			if (!state) {
				throw new Error(`NO_STATE_FOUND_FOR_ORDER_${orderId}`);
			}

			const order = await this.orderRepository.findById(orderId);
			if (!order) {
				throw new Error(`ORDER_NOT_FOUND_${orderId}`);
			}

			await this.applyBusinessLogic(order, state);
			await this.appendDomainEvents(order);
			await this.orderProjection.update(order);
			await this.createOutboxEntries(order);

			order.clearDomainEvents();
		});
	}

	private async saveExternalEvent<T extends IncomingEvents>(
		eventMessage: IncomingIntegrationEvent<T>,
		checkType: "paymentCheck" | "inventoryCheck",
		status: "pending" | "completed" | "failed"
	): Promise<void> {
		const orderId = eventMessage.payload.orderId;
		const order = await this.orderRepository.findById(orderId);

		if (!order) {
			throw new Error(`ORDER_NOT_FOUND_${orderId}`);
		}

		if (checkType === "paymentCheck") {
			if (status === "completed") {
				order.markPaymentDeductionCompleted();
			} else if (status === "failed") {
				const reason = this.extractReasonFromPayload(eventMessage);
				order.markPaymentVerificationFailed(reason);
			}
		} else {
			if (status === "completed") {
				order.markInventoryReservationCompleted();
			} else if (status === "failed") {
				const reason = this.extractReasonFromPayload(eventMessage);
				order.markInventoryReservationFailed(reason);
			}
		}

		const lastEvent = await this.eventRepository.getLastVersion(orderId);
		const lastVersion = lastEvent?.getVersion() ?? 0;
		await this.eventRepository.append(order, lastVersion);

		order.clearDomainEvents();
	}

	private async applyBusinessLogic(order: Order, state: OrderState): Promise<void> {
		if (state.hasPending) {
			if (this.isOrderStale(state)) {
				this.applyTimeout(order, state);
			}
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

	private async appendDomainEvents(order: Order): Promise<void> {
		if (order.getDomainEvents().length === 0) {
			return;
		}

		const lastEvent = await this.eventRepository.getLastVersion(order.getId());
		const lastVersion = lastEvent?.getVersion() ?? 0;

		await this.eventRepository.append(order, lastVersion);
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

	private isOrderStale(state: OrderState): boolean {
		return Date.now() - state.createdAt.getTime() >= OrderProcessManager.ORDER_TIMEOUT_MS;
	}

	private applyTimeout(order: Order, state: OrderState): void {
		if (state.payment === "pending") {
			order.markPaymentVerificationFailed("TIMEOUT");
		}
		if (state.inventory === "pending") {
			order.markInventoryReservationFailed("TIMEOUT");
		}
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

	private extractReasonFromPayload<T extends IncomingEvents>(
		eventMessage: IncomingIntegrationEvent<T>
	): string {
		const payload = eventMessage.payload as any;
		return payload?.reason || payload?.error || "UNKNOWN_REASON";
	}
}
