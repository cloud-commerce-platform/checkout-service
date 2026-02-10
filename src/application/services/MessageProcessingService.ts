import type { InventoryEventConsumer } from "@application/consumers/InventoryEventConsumer";
import type { PaymentEventConsumer } from "@application/consumers/PaymentEventConsumer";
import type {
	NormalizedEventMapper,
	NormalizedOrderEvent,
} from "@application/mappers/NormalizedEventMapper";
import type { DuplicateChecker } from "@application/ports/DuplicateChecker";
import type { RetryManager } from "@application/ports/RetryManager";

export class MessageProcessingService {
	constructor(
		private duplicateChecker: DuplicateChecker,
		private retryManager: RetryManager,
		private inventoryEventConsumer: InventoryEventConsumer,
		private paymentEventConsumer: PaymentEventConsumer,
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

			const eventType = event.eventType;

			if (eventType.startsWith("INVENTORY_")) {
				await this.inventoryEventConsumer.process(integrationEvent);
			} else if (eventType.startsWith("PAYMENT_")) {
				await this.paymentEventConsumer.process(integrationEvent);
			} else {
				throw new Error(`UNKNOWN_EVENT_TYPE:${eventType}`);
			}

			await this.duplicateChecker.markAsProcessed(event.eventId);
			await this.retryManager.clearRetry(event.orderId, event.eventType);

			return true; // -> ACK
		} catch (error) {
			return await this.handleError(error as Error, event);
		}
	}

	private async handleError(error: Error, event: NormalizedOrderEvent): Promise<boolean> {
		if (
			error.message.includes("CANNOT_TRANSITION") ||
			error.message.includes("ORDER_NOT_FOUND") ||
			error.message.includes("NO_STATE_FOUND")
		) {
			console.log(`PERMANENT_ERROR:${error.message}`);
			return false; // -> DLQ
		}

		if (this.isConnectionError(error)) {
			return await this.handleRetryableError(error, event);
		}

		// Otros errores desconocidos
		console.error(`UNKNOWN_ERROR:${error.message}`);
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
