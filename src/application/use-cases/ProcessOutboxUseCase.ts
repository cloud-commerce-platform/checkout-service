import type { MessagingService } from "../ports/MessagingService";
import type { OutboxRepository } from "../ports/OutboxRepository";

export class ProcessOutboxUseCase {
	private static readonly LIMIT_QUERY = 100;
	constructor(
		private readonly outboxRepository: OutboxRepository,
		private readonly messagingService: MessagingService
	) {}

	async execute(): Promise<void> {
		const events = await this.outboxRepository.getPending(
			ProcessOutboxUseCase.LIMIT_QUERY
		);

		for (const event of events) {
			try {
				await this.messagingService.publish(event.exchange, event.routingKey, event);
				await this.outboxRepository.markAsProcessed(event.eventId);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "Unknown error";
				console.error(`❌ Failed to process event ${event.eventId}: ${errorMessage}`);
				await this.outboxRepository.incrementRetryWithMessage(
					event.eventId,
					errorMessage
				);
			}
		}
	}
}
