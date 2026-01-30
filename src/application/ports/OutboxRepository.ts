import type { OutgoingIntegrationEvent } from "@/infrastructure/events/IntegrationEvents";

export interface OutboxRepository {
	getPending(limit: number): Promise<OutgoingIntegrationEvent[]>;
	markAsProcessed(id: string): Promise<void>;
	incrementRetry(id: string): Promise<void>;
	incrementRetryWithMessage(id: string, errorMessage: string): Promise<void>;
	save(event: OutgoingIntegrationEvent[]): Promise<void>;
}
