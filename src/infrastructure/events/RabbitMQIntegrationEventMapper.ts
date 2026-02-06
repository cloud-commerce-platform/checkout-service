import type { OrderDomainEvent } from "@alejotamayo28/event-contracts";
import { v7 as uuid } from "uuid";
import type { IntegrationEventMapper } from "@/application/ports/IntegrationEventMapper";
import type { OutgoingIntegrationEvent } from "@/infrastructure/events/IntegrationEvents";

//to-do: Corregir esta monda (se guarda dentro de outbox)
export class RabbitMQIntegrationEventMapper implements IntegrationEventMapper {
	map(event: OrderDomainEvent): OutgoingIntegrationEvent | null {
		const mapping = this.getMainEventMapping(event);
		if (!mapping) return null;

		return {
			eventId: uuid(),
			eventType: event.type,
			payload: event.data,
			correlationId: event.aggregateId,
			version: "1.0",
			occurredAt: new Date().toISOString(),
			exchange: mapping.exchange,
			routingKey: mapping.routingKey,
			source: "order-service",
		};
	}

	private getMainEventMapping(
		event: OrderDomainEvent
	): { exchange: string; routingKey: string } | null {
		const mappings: Record<
			OrderDomainEvent["type"],
			{ exchange: string; routingKey: string }
		> = {
			ORDER_CREATED: {
				exchange: "order_events",
				routingKey: "status.created",
			},
			ORDER_CONFIRMED: {
				exchange: "order_events",
				routingKey: "status.confirmed",
			},
			ORDER_COMPLETED: {
				exchange: "order_events",
				routingKey: "status.completed",
			},
			ORDER_CANCELLED: {
				exchange: "order_events",
				routingKey: "status.cancelled",
			},
			ORDER_PAYMENT_ROLLBACK_REQUESTED: {
				exchange: "order_events",
				routingKey: "payment.rollback",
			},
			ORDER_INVENTORY_ROLLBACK_REQUESTED: {
				exchange: "order_events",
				routingKey: "inventory.rollback",
			},
			ORDER_PAYMENT_VERIFICATION_FAILED: {
				exchange: "order_events",
				routingKey: "payment.verification.order.failed",
			},
			ORDER_INVENTORY_RESERVATION_FAILED: {
				exchange: "order_events",
				routingKey: "inventory.reservation.order.failed",
			},
			ORDER_PAYMENT_DEDUCTION_COMPLETED: {
				exchange: "order_events",
				routingKey: "payment.deduction.completed",
			},
			ORDER_INVENTORY_RESERVATION_COMPLETED: {
				exchange: "order_events",
				routingKey: "inventory.reservation.completed",
			},
			ORDER_COMPENSATION_STARTED: {
				exchange: "order_events",
				routingKey: "status.compensation.started",
			},
		};

		return mappings[event.type] ?? null;
	}
}
