import { InventoryEventConsumer } from "@application/consumers/InventoryEventConsumer";
import { PaymentEventConsumer } from "@application/consumers/PaymentEventConsumer";
import { NormalizedEventMapper } from "@application/mappers/NormalizedEventMapper";
import { OrderProcessManager } from "@application/order/OrderProcessManager";
import { OrderProjection } from "@application/projections/OrderProjection";
import { PostgresTransactionManager } from "@infrastructure/data-access/postgres/PostgresTransactionManager";
import { PostgreEventRepository } from "@infrastructure/data-access/postgres/repositories/PostgreEventRepository";
import { PostgreOrderRepository } from "@infrastructure/data-access/postgres/repositories/PostgreOrderRepository";
import { PostgreOutboxRepository } from "@infrastructure/data-access/postgres/repositories/PostgreOutboxRepository";
import { RabbitMQIntegrationEventMapper } from "@infrastructure/events/RabbitMQIntegrationEventMapper";
import { RedisDuplicateChecker } from "@infrastructure/messaging/adapters/RedisDuplicateChecker";
import { RedisRetryManager } from "@infrastructure/messaging/adapters/RedisRetryManager";
import { MessageProcessingService } from "../MessageProcessingService";

export class WorkerDependencies {
	constructor(private redisClient: any) {}

	createMessageProcessingService(): MessageProcessingService {
		// Repositories
		const orderRepository = new PostgreOrderRepository();
		const postgresTransactionManager = new PostgresTransactionManager();
		const outboxRepository = new PostgreOutboxRepository();
		const integrationEventMapper = new RabbitMQIntegrationEventMapper();
		const eventRepository = new PostgreEventRepository();

		// Projection
		const orderProjection = new OrderProjection(eventRepository, orderRepository);

		// Process Manager
		const orderProcessManager = new OrderProcessManager(
			orderRepository,
			orderProjection,
			postgresTransactionManager,
			outboxRepository,
			integrationEventMapper,
			eventRepository
		);

		// Redis-based services
		const duplicateChecker = new RedisDuplicateChecker(this.redisClient);
		const retryManager = new RedisRetryManager(this.redisClient);
		const eventMapper = new NormalizedEventMapper();

		// Consumers (solo reciben OrderProcessManager)
		const inventoryEventConsumer = new InventoryEventConsumer(orderProcessManager);
		const paymentEventConsumer = new PaymentEventConsumer(orderProcessManager);

		return new MessageProcessingService(
			duplicateChecker,
			retryManager,
			inventoryEventConsumer,
			paymentEventConsumer,
			eventMapper
		);
	}
}
