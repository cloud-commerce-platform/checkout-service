import type { OrderDomainEvent } from "@alejotamayo28/event-contracts";
import type { OutgoingIntegrationEvent } from "@/infrastructure/events/IntegrationEvents";

export interface IntegrationEventMapper {
	map(event: OrderDomainEvent): OutgoingIntegrationEvent | null;
}
