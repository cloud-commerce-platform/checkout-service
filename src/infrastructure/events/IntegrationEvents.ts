import type {
	IncomingInventoryEvent,
	InventoryReservationConfirmedEvent,
	InventoryReservationFailedEvent,
} from "@/application/consumers/types/InventoryEvents";
import type {
	IncomingPaymentEvent,
	PaymentCheckingConfirmedEvent,
	PaymentCheckingFailedEvent,
} from "@/application/consumers/types/PaymentEvents";
import type { DomainEvent } from "@/domain/events/OrderDomainEvents";

export type IncomingEvents =
	| InventoryReservationConfirmedEvent
	| InventoryReservationFailedEvent
	| PaymentCheckingFailedEvent
	| PaymentCheckingConfirmedEvent;

export interface OutgoingIntegrationEvent<T = DomainEvent> {
	eventId: string;
	eventType: string;
	payload: T;
	correlationId?: string;
	version: string;
	occurredAt: string;
	exchange: string;
	routingKey: string;
	source: string;
}

export interface IncomingIntegrationEvent<T extends IncomingEvents> {
	eventId: string;
	eventType: T["type"];
	payload: T;
	correlationId?: string;
	version: string;
	occurredAt: string;
	exchange: string;
	routingKey: string;
	source: string;
}
