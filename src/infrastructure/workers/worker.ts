import { createClient } from "redis";
import { OrderProcessManager } from "../../application/order/OrderProcessManager";
import { OrderService } from "../../application/services/OrderService";
import { UpdateOrderStatusUseCase } from "../../application/use-cases/UpdateOrderStatusUseCase";
import { PostgresTransactionManager } from "../data-access/postgres/PostgresTransactionManager";
import { PostgreOrderRepository } from "../data-access/postgres/repositories/PostgreOrderRepository";
import { PostgreOutboxRepository } from "../data-access/postgres/repositories/PostgreOutboxRepository";
import { RedisOrderCheckRepository } from "../data-access/redis/RedisOrderCheckRepository";
import { RedisClientProvider } from "../data-access/redis/redis-client.provider";
import type { IncomingIntegrationEvent } from "../events/IntegrationEvents";
import { RabbitMQIntegrationEventMapper } from "../events/RabbitMQIntegrationEventMapper";
import { RabbitMQMessagingService } from "../messaging/adapters/RabbitMQMessagingService";

interface NormalizedOrderEvent {
	eventId: string;
	orderId: string;
	eventType:
		| "PAYMENT_DEDUCTION_COMPLETED"
		| "PAYMENT_DEDUCTION_FAILED"
		| "INVENTORY_RESERVATION_COMPLETED"
		| "INVENTORY_RESERVATION_FAILED";
	originalEvent: any;
	occurredAt: string;
	partition: number;
}

const MAX_RETRIES = 3;
const RETRY_TTL_SECONDS = 3600;
const DEDUPLICATION_TTL_SECONDS = 1800;
const WORKER_PREFETCH = 1;

class OrderProcessingWorker {
	private messagingService: RabbitMQMessagingService | null = null;
	private redisClient: ReturnType<typeof createClient> | null = null;
	private orderService: OrderService | null = null;

	async start(): Promise<void> {
		this.redisClient = createClient({
			url: process.env.REDIS_URL || "redis://localhost:6379",
		});
		await this.redisClient.connect();

		const orderRepository = new PostgreOrderRepository();
		const postgresTransactionManager = new PostgresTransactionManager();
		const redisClient = await RedisClientProvider.getClient();
		const redisOrderCheckRepository = new RedisOrderCheckRepository(redisClient);
		const outboxRepository = new PostgreOutboxRepository();
		const updateOrderStatusUseCase = new UpdateOrderStatusUseCase();
		const integrationEventMapper = new RabbitMQIntegrationEventMapper();

		const orderProcessManager = new OrderProcessManager(
			orderRepository,
			redisOrderCheckRepository,
			postgresTransactionManager,
			updateOrderStatusUseCase,
			outboxRepository,
			integrationEventMapper
		);

		const createOrderUseCase = {} as any;
		const getOrderByIdUseCase = {} as any;
		const getOrdersByCustomerIdUseCase = {} as any;

		this.orderService = new OrderService(
			createOrderUseCase,
			getOrderByIdUseCase,
			getOrdersByCustomerIdUseCase,
			redisOrderCheckRepository,
			orderProcessManager,
			postgresTransactionManager,
			outboxRepository,
			integrationEventMapper
		);

		this.messagingService = new RabbitMQMessagingService();
		await this.messagingService.connect();

		await this.messagingService.prefetch(WORKER_PREFETCH);

		const channel = this.messagingService.getChannel();
		if (!channel) throw new Error("CHANNEL_NOT_AVAILABLE");

		await channel.consume("worker_queue", async (msg) => {
			if (!msg) return;
			await this.processMessage(msg);
		});

		process.on("SIGINT", async () => {
			console.log("CLOSING_WORKER");
			if (this.redisClient) await this.redisClient.disconnect();
			process.exit(0);
		});
	}

	private async processMessage(msg: any): Promise<void> {
		if (!this.messagingService || !this.redisClient || !this.orderService) {
			return;
		}

		const channel = this.messagingService.getChannel();
		if (!channel) return;

		try {
			const event: NormalizedOrderEvent = JSON.parse(msg.content.toString());
			const isDuplicate = await this.isDuplicate(event.eventId);
			if (isDuplicate) {
				console.log(`DUPLICATE_EVENT_IGNORED:${event.eventId}`);
				channel.ack(msg);
				return;
			}

			// Check retry count
			const retryKey = `retry:${event.orderId}:${event.eventType}`;
			const retryData = await this.redisClient.get(retryKey);
			const retryCount = retryData ? JSON.parse(retryData).count : 0;

			if (retryCount >= MAX_RETRIES) {
				console.log(`MAX_RETRIES_REACHED_FOR_${event.orderId}_SENDING_TO_DLQ`);
				await this.sendToDLQ(event, "MAX_TRIES_EXCEEDED");
				channel.ack(msg);
				await this.redisClient.del(retryKey);
				return;
			}

			await this.processEvent(event);
			await this.markAsProcessed(event.eventId);
			await this.redisClient.del(retryKey);
			channel.ack(msg);
		} catch (error) {
			let event: NormalizedOrderEvent;
			try {
				event = JSON.parse(msg.content.toString());
			} catch {
				channel.nack(msg, false, false);
				return;
			}

			const retryKey = `retry:${event.orderId}:${event.eventType}`;
			const retryData = await this.redisClient.get(retryKey);
			const currentRetry = retryData ? JSON.parse(retryData).count : 0;
			const newRetryCount = currentRetry + 1;

			if (newRetryCount >= MAX_RETRIES) {
				console.log(`MAX_RETRIES_${MAX_RETRIES}_REACHED_SENDING_TO_DLQ`);
				await this.sendToDLQ(
					event,
					error instanceof Error ? error.message : "Unknown error"
				);
				channel.ack(msg);
				await this.redisClient.del(retryKey);
			} else {
				console.log(`Reintento ${newRetryCount}/${MAX_RETRIES}`);
				await this.redisClient.setEx(
					retryKey,
					RETRY_TTL_SECONDS,
					JSON.stringify({ count: newRetryCount, lastAttempt: new Date() })
				);
				channel.nack(msg, false, true);
			}
		}
	}

	private async processEvent(event: NormalizedOrderEvent): Promise<void> {
		if (!this.orderService) throw new Error("OrderService not initialized");
		let checkType: "paymentCheck" | "inventoryCheck";
		let status: "completed" | "failed";

		switch (event.eventType) {
			case "PAYMENT_DEDUCTION_COMPLETED":
				checkType = "paymentCheck";
				status = "completed";
				break;
			case "PAYMENT_DEDUCTION_FAILED":
				checkType = "paymentCheck";
				status = "failed";
				break;
			case "INVENTORY_RESERVATION_COMPLETED":
				checkType = "inventoryCheck";
				status = "completed";
				break;
			case "INVENTORY_RESERVATION_FAILED":
				checkType = "inventoryCheck";
				status = "failed";
				break;
			default:
				throw new Error(`Unknown event type: ${event.eventType}`);
		}

		const integrationEvent: IncomingIntegrationEvent<any> = {
			eventId: event.eventId,
			eventType: event.eventType,
			payload: event.originalEvent.payload,
			occurredAt: event.occurredAt,
			exchange: "order_processing",
			routingKey: event.partition.toString(),
			source: "event_router",
			version: "1.0",
		};

		await this.orderService.handleIntegrationEvent(integrationEvent, checkType, status);
	}

	private async isDuplicate(eventId: string): Promise<boolean> {
		if (!this.redisClient) return false;
		const exists = await this.redisClient.get(`dedup:${eventId}`);
		return exists !== null;
	}

	private async markAsProcessed(eventId: string): Promise<void> {
		if (!this.redisClient) return;
		await this.redisClient.setEx(`dedup:${eventId}`, DEDUPLICATION_TTL_SECONDS, "1");
	}

	private async sendToDLQ(event: NormalizedOrderEvent, reason: string): Promise<void> {
		if (!this.messagingService) return;

		const dlqMessage = {
			...event,
			dlqInfo: {
				reason,
				timestamp: new Date().toISOString(),
				retryCount: MAX_RETRIES,
			},
		};

		await this.messagingService.publish("order_processing.dlq", "worker.dlq", dlqMessage);
	}
}

const worker = new OrderProcessingWorker();
worker.start().catch((error) => {
	console.error("Error fatal en Worker:", error);
	process.exit(1);
});
