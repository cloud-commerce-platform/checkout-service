import type { OrderDomainEvent } from "@alejotamayo28/event-contracts";
import { v7 as uuid } from "uuid";
import type { DomainEventDispatcher } from "@/application/ports/DomainEventDispatcher";
import type { MessagingService } from "@/application/ports/MessagingService";
import type { OutgoingIntegrationEvent } from "@/infrastructure/events/IntegrationEvents";

export class RabbitMQDomainEventDispatcher implements DomainEventDispatcher {
	constructor(private readonly messagingService: MessagingService) {}

	async dispatch(events: OrderDomainEvent[]): Promise<void> {
		for (const event of events) {
			const mainMapping = this.getMainEventMapping(event);

			if (!mainMapping) {
				throw new Error(`NO_MAPPING_FOR_EVENT_TYPE_${event.type}`);
			}

			const outgoing: OutgoingIntegrationEvent<typeof event.data> = {
				eventId: uuid(),
				eventType: event.type,
				payload: event.data,
				correlationId: event.aggregateId,
				version: "1.0",
				occurredAt: new Date().toISOString(),
				exchange: mainMapping.exchange,
				routingKey: mainMapping.routingKey,
				source: "order-service",
			};

			await this.messagingService.publish(
				outgoing.exchange,
				outgoing.routingKey,
				outgoing
			);
		}
	}

	private getMainEventMapping(event: OrderDomainEvent): {
		exchange: string;
		routingKey: string;
	} | null {
		const eventMappings: Record<
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
		};
		return eventMappings[event.type] ?? null;
	}
}
