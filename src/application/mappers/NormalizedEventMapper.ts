import type {
	InventoryDomainEvent,
	PaymentDomainEvent,
} from "@alejotamayo28/event-contracts";
import { CURRENT_EVENT_VERSION } from "@/infrastructure/events/EventVersion";
import type { IncomingIntegrationEvent } from "@/infrastructure/events/IntegrationEvents";
import type {
	IntegrationCheckType,
	IntegrationEventStatus,
} from "../ports/IntegrationEventTypes";

export interface NormalizedOrderEvent {
	eventId: string;
	orderId: string;
	eventType: InventoryDomainEvent["type"] | PaymentDomainEvent["type"];
	originalEvent: any;
	occurredAt: string;
	partition: string;
}

export class NormalizedEventMapper {
	toIncomingIntegrationEvent(event: NormalizedOrderEvent): IncomingIntegrationEvent<any> {
		return {
			eventId: event.eventId,
			eventType: event.eventType,
			payload: event.originalEvent.payload,
			occurredAt: event.occurredAt,
			exchange: "order_processing",
			routingKey: event.partition,
			source: "event_router",
			version: CURRENT_EVENT_VERSION,
		};
	}

	extractCheckType(eventType: NormalizedOrderEvent["eventType"]): IntegrationCheckType {
		return eventType.startsWith("PAYMENT") ? "paymentCheck" : "inventoryCheck";
	}

	extractStatus(
		eventType: NormalizedOrderEvent["eventType"]
	): Partial<IntegrationEventStatus> {
		return eventType.endsWith("COMPLETED") ? "completed" : "failed";
	}
}
