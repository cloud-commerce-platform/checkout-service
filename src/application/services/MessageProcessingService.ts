import type {
	NormalizedEventMapper,
	NormalizedOrderEvent,
} from "@application/mappers/NormalizedEventMapper";
import type { DuplicateChecker } from "@application/ports/DuplicateChecker";
import type { RetryManager } from "@application/ports/RetryManager";
import type { OrderService } from "@application/services/OrderService";
import { DomainError } from "@domain/errors/DomainError";

export class MessageProcessingService {
	constructor(
		private duplicateChecker: DuplicateChecker,
		private retryManager: RetryManager,
		private orderService: OrderService,
		private eventMapper: NormalizedEventMapper,
		private maxRetries: number = 3
	) {}

	async process(event: NormalizedOrderEvent): Promise<boolean> {
		const isDuplicate = await this.duplicateChecker.isDuplicate(event.eventId);
		if (isDuplicate) {
			console.log(`DUPLICATE_EVENT_IGNORED:${event.eventId}`);
			return true; // -> ACK
		}

		try {
			const integrationEvent = this.eventMapper.toIncomingIntegrationEvent(event);
			const checkType = this.eventMapper.extractCheckType(event.eventType);
			const status = this.eventMapper.extractStatus(event.eventType);

			await this.orderService.handleIntegrationEvent(integrationEvent, checkType, status);

			await this.duplicateChecker.markAsProcessed(event.eventId);
			await this.retryManager.clearRetry(event.orderId, event.eventType);
			return true; // -> ACK
		} catch (error) {
			return await this.handleError(error as Error, event);
		}
	}

	private async handleError(error: Error, event: NormalizedOrderEvent): Promise<boolean> {
		if (error instanceof DomainError) {
			if (!error.retryable) {
				console.log(`PERMANENT_ERROR:${error.code}`);
				return false;
			}
			return await this.handleRetryableError(error, event);
		}

		if (this.isConnectionError(error)) {
			return await this.handleRetryableError(error, event);
		}

		console.log(`UNKNOWN_ERROR:${error.message}`);
		return false; // -> DLQ
	}

	private async handleRetryableError(
		error: Error,
		event: NormalizedOrderEvent
	): Promise<boolean> {
		const retryResult = await this.retryManager.shouldRetry(
			event.orderId,
			event.eventType
		);

		if (!retryResult.shouldRetry) {
			console.log(`MAX_RETRIES_REACHED:${event.orderId}`);
			await this.retryManager.clearRetry(event.orderId, event.eventType);
			return false; // -> DLQ
		}

		const newCount = await this.retryManager.incrementRetry(
			event.orderId,
			event.eventType
		);
		console.log(`RETRYING:${newCount}/${this.maxRetries}:${error.message}`);

		// Lanzar excepción, worker -> NACK con requeue
		throw new Error(`RETRY:${event.orderId}:${event.eventType}`);
	}

	private isConnectionError(error: Error): boolean {
		const connectionPatterns = [
			"ETIMEDOUT",
			"ECONNREFUSED",
			"ECONNRESET",
			"Connection lost",
			"Channel closed",
			"ENOTFOUND",
			"Connection terminated",
			"Connection refused",
		];

		return connectionPatterns.some((pattern) => error.message.includes(pattern));
	}
}
