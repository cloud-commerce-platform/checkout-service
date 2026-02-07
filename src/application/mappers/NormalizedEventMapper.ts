import { CURRENT_EVENT_VERSION } from "@/infrastructure/events/EventVersion";
import type { IncomingIntegrationEvent } from "@/infrastructure/events/IntegrationEvents";

export interface NormalizedOrderEvent {
	eventId: string;
	orderId: string;
	eventType:
		| "PAYMENT_DEDUCTION_COMPLETED"
		| "PAYMENT_DEDUCTION_FAILED"
		| "INVENTORY_RESERVATION_COMPLETED"
		| "INVENTORY_RESERVATION_FAILED";
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

	extractCheckType(
		eventType: NormalizedOrderEvent["eventType"]
	): "paymentCheck" | "inventoryCheck" {
		return eventType.startsWith("PAYMENT") ? "paymentCheck" : "inventoryCheck";
	}

	extractStatus(eventType: NormalizedOrderEvent["eventType"]): "completed" | "failed" {
		return eventType.endsWith("COMPLETED") ? "completed" : "failed";
	}
}
