import type {
	InventoryDomainEvent,
	PaymentDomainEvent,
} from "@alejotamayo28/event-contracts";

export type IncomingEvents = PaymentDomainEvent | InventoryDomainEvent;

export interface OutgoingIntegrationEvent<T = unknown> {
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
	payload: T["data"];
	correlationId?: string;
	version: string;
	occurredAt: string;
	exchange: string;
	routingKey: string;
	source: string;
}
