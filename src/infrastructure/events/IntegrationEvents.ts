import type { IncomingInventoryEvent } from "@/application/consumers/types/InventoryEvents";
import type { IncomingPaymentEvent } from "@/application/consumers/types/PaymentEvents";
import type { DomainEvent } from "@/domain/events/OrderDomainEvents";

export type IncomingEvents = IncomingInventoryEvent | IncomingPaymentEvent;

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
	eventType: string;
	payload: T;
	correlationId?: string;
	version: string;
	occurredAt: string;
	exchange: string;
	routingKey: string;
	source: string;
}
