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
		| "PAYMENT_COMPLETED"
		| "PAYMENT_FAILED"
		| "INVENTORY_RESERVED"
		| "INVENTORY_UNAVAILABLE";
	originalEvent: any;
	occurredAt: string;
	partition: number;
}

const MAX_RETRIES = 3;
const RETRY_TTL_SECONDS = 3600; // 1 hour
const DEDUPLICATION_TTL_SECONDS = 1800; // 30 minutes

class OrderProcessingWorker {
	private messagingService: RabbitMQMessagingService | null = null;
	private redisClient: ReturnType<typeof createClient> | null = null;
	private orderService: OrderService | null = null;

	async start(): Promise<void> {
		console.log("🚀 Iniciando Order Processing Worker...");

		// Initialize Redis
		this.redisClient = createClient({
			url: process.env.REDIS_URL || "redis://localhost:6379",
		});
		await this.redisClient.connect();
		console.log("✅ Conectado a Redis");

		// Initialize dependencies
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

		// Create OrderService - minimal dependencies for worker
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

		// Connect to RabbitMQ using messaging service
		this.messagingService = new RabbitMQMessagingService();
		await this.messagingService.connect();

		// Configure prefetch = 1 (process one message at a time)
		await this.messagingService.prefetch(1);
		console.log("Prefetch configurado a 1");

		// Consume from worker_queue using custom handler
		const channel = this.messagingService.getChannel();
		if (!channel) throw new Error("Channel not available");

		await channel.consume("worker_queue", async (msg) => {
			if (!msg) return;
			await this.processMessage(msg);
		});

		console.log("✅ Worker escuchando en 'worker_queue'");
		console.log(`   - Max retries: ${MAX_RETRIES}`);
		console.log(`   - DLQ: order_processing.dlq`);

		// Graceful shutdown
		process.on("SIGINT", async () => {
			console.log("\n🛑 Cerrando Worker...");
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
			console.log(`📥 Procesando: ${event.eventType} (order: ${event.orderId})`);

			// Check for duplicates
			const isDuplicate = await this.isDuplicate(event.eventId);
			if (isDuplicate) {
				console.log(`⚠️  Evento duplicado ignorado: ${event.eventId}`);
				channel.ack(msg);
				return;
			}

			// Check retry count
			const retryKey = `retry:${event.orderId}:${event.eventType}`;
			const retryData = await this.redisClient.get(retryKey);
			const retryCount = retryData ? JSON.parse(retryData).count : 0;

			if (retryCount >= MAX_RETRIES) {
				console.log(`❌ Max retries alcanzado para ${event.orderId}, enviando a DLQ`);
				await this.sendToDLQ(event, "Max retries exceeded");
				channel.ack(msg);
				await this.redisClient.del(retryKey);
				return;
			}

			// Process the event
			await this.processEvent(event);

			// Mark as processed (deduplication)
			await this.markAsProcessed(event.eventId);

			// Clear retry counter on success
			await this.redisClient.del(retryKey);

			console.log(`✅ Procesado exitosamente: ${event.eventType}`);
			channel.ack(msg);
		} catch (error) {
			console.error(`❌ Error procesando mensaje:`, error);

			// Get event details for retry tracking
			let event: NormalizedOrderEvent;
			try {
				event = JSON.parse(msg.content.toString());
			} catch {
				// If we can't parse, send to DLQ immediately
				channel.nack(msg, false, false);
				return;
			}

			// Increment retry counter
			const retryKey = `retry:${event.orderId}:${event.eventType}`;
			const retryData = await this.redisClient.get(retryKey);
			const currentRetry = retryData ? JSON.parse(retryData).count : 0;
			const newRetryCount = currentRetry + 1;

			if (newRetryCount >= MAX_RETRIES) {
				console.log(`❌ Max retries (${MAX_RETRIES}) alcanzado, enviando a DLQ`);
				await this.sendToDLQ(
					event,
					error instanceof Error ? error.message : "Unknown error"
				);
				channel.ack(msg);
				await this.redisClient.del(retryKey);
			} else {
				console.log(`   Reintento ${newRetryCount}/${MAX_RETRIES}`);
				await this.redisClient.setEx(
					retryKey,
					RETRY_TTL_SECONDS,
					JSON.stringify({ count: newRetryCount, lastAttempt: new Date() })
				);
				// Requeue the message
				channel.nack(msg, false, true);
			}
		}
	}

	private async processEvent(event: NormalizedOrderEvent): Promise<void> {
		if (!this.orderService) throw new Error("OrderService not initialized");

		// Map to existing event format
		let checkType: "paymentCheck" | "inventoryCheck";
		let status: "completed" | "failed";

		switch (event.eventType) {
			case "PAYMENT_COMPLETED":
				checkType = "paymentCheck";
				status = "completed";
				break;
			case "PAYMENT_FAILED":
				checkType = "paymentCheck";
				status = "failed";
				break;
			case "INVENTORY_RESERVED":
				checkType = "inventoryCheck";
				status = "completed";
				break;
			case "INVENTORY_UNAVAILABLE":
				checkType = "inventoryCheck";
				status = "failed";
				break;
			default:
				throw new Error(`Unknown event type: ${event.eventType}`);
		}

		// Create integration event format expected by OrderService
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

		// Use existing OrderService logic
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

		console.log(`📦 Evento enviado a DLQ: ${event.eventId}`);
	}
}

// Start worker
const worker = new OrderProcessingWorker();
worker.start().catch((error) => {
	console.error("❌ Error fatal en Worker:", error);
	process.exit(1);
});
