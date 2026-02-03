import { OrderProcessManager } from "./application/order/OrderProcessManager";
import type { MessagingService } from "./application/ports/MessagingService";
import { OrderService } from "./application/services/OrderService";
import { CreateOrderUseCase } from "./application/use-cases/CreateOrderUseCase";
import { GetOrderByIdUseCase } from "./application/use-cases/GetOrderByIdUseCase";
import { GetOrdersByCustomerIdUseCase } from "./application/use-cases/GetOrdersByCustomerIdUseCase";
import { ProcessOutboxUseCase } from "./application/use-cases/ProcessOutboxUseCase";
import { UpdateOrderStatusUseCase } from "./application/use-cases/UpdateOrderStatusUseCase";
import { PostgresTransactionManager } from "./infrastructure/data-access/postgres/PostgresTransactionManager";
import { PostgreEventRepository } from "./infrastructure/data-access/postgres/repositories/PostgreEventRepository";
import { PostgreOrderRepository } from "./infrastructure/data-access/postgres/repositories/PostgreOrderRepository";
import { PostgreOutboxRepository } from "./infrastructure/data-access/postgres/repositories/PostgreOutboxRepository";
import { RedisOrderCheckRepository } from "./infrastructure/data-access/redis/RedisOrderCheckRepository";
import { RedisClientProvider } from "./infrastructure/data-access/redis/redis-client.provider";
import { RabbitMQIntegrationEventMapper } from "./infrastructure/events/RabbitMQIntegrationEventMapper";
import { RabbitMQDomainEventDispatcher } from "./infrastructure/messaging/adapters/rabbitMQDomainEventDispatcher";

export class CompositionRoot {
	static async configure(messagingService: MessagingService): Promise<OrderService> {
		// Bb (PostgreSQL)
		const orderRepository = new PostgreOrderRepository();
		const postgresTransactionManager = new PostgresTransactionManager();

		// Cache (Redis)
		const redisClient = await RedisClientProvider.getClient();
		const redisOrderCheckRepository = new RedisOrderCheckRepository(redisClient);

		//Messaging (RabbitMQ)
		const domainEventDispatcher = new RabbitMQDomainEventDispatcher(messagingService);
		const integrationEvenMapper = new RabbitMQIntegrationEventMapper();

		// Use cases
		const createOrderUseCase = new CreateOrderUseCase(orderRepository);
		const getOrderByIdUseCase = new GetOrderByIdUseCase(
			orderRepository,
			postgresTransactionManager
		);
		const getOrdersByCustomerIdUseCase = new GetOrdersByCustomerIdUseCase(
			orderRepository,
			postgresTransactionManager
		);
		const updateOrderStatusUseCase = new UpdateOrderStatusUseCase(
			redisOrderCheckRepository
		);

		const outboxRepository = new PostgreOutboxRepository();
		const eventRepository = new PostgreEventRepository();

		const orderProcessManager = new OrderProcessManager(
			orderRepository,
			redisOrderCheckRepository,
			postgresTransactionManager,
			updateOrderStatusUseCase,
			outboxRepository,
			integrationEvenMapper,
			eventRepository
		);

		// Application service
		return new OrderService(
			createOrderUseCase,
			getOrderByIdUseCase,
			getOrdersByCustomerIdUseCase,
			redisOrderCheckRepository,
			orderProcessManager,
			postgresTransactionManager,
			outboxRepository,
			integrationEvenMapper,
			eventRepository
		);
	}
}
