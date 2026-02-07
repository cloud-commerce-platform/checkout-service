import type { Outbox } from "@/domain/entities/Outbox";
import type { MessagingService } from "../ports/MessagingService";
import type { OutboxRepository } from "../ports/OutboxRepository";

export class ProcessOutboxUseCase {
	private static readonly LIMIT_QUERY = 100;
	constructor(
		private readonly outboxRepository: OutboxRepository,
		private readonly messagingService: MessagingService
	) {}

	async execute(): Promise<void> {
		const outboxes = await this.outboxRepository.getPending(
			ProcessOutboxUseCase.LIMIT_QUERY
		);

		for (const outbox of outboxes) {
			try {
				await this.publishOutbox(outbox);
				console.log("Event Sent: ", outbox);
				outbox.markAsProcessed();
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "Unknown error";
				console.error(
					`❌ Failed to process outbox ${outbox.getEventId()}: ${errorMessage}`
				);
				outbox.incrementRetry(errorMessage);
			}
		}

		await this.outboxRepository.saveMany(outboxes);
	}

	private async publishOutbox(outbox: Outbox): Promise<void> {
		const event = {
			eventId: outbox.getEventId(),
			eventType: outbox.getEventType(),
			payload: outbox.getPayload(),
			correlationId: outbox.getCorrelationId(),
			version: outbox.getVersion(),
			occurredAt: outbox.getOccurredAt().toISOString(),
			exchange: outbox.getExchange(),
			routingKey: outbox.getRoutingKey(),
			source: outbox.getSource(),
		};

		await this.messagingService.publish(
			outbox.getExchange(),
			outbox.getRoutingKey(),
			event
		);
	}
}
