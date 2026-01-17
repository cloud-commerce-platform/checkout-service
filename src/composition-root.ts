import type { MessagingService } from "./application/ports/MessagingService";
import { OrderService } from "./application/services/OrderService";
import { CreateOrderUseCase } from "./application/use-cases/CreateOrderUseCase";
import { GetOrderByIdUseCase } from "./application/use-cases/GetOrderByIdUseCase";
import { GetOrdersByCustomerIdUseCase } from "./application/use-cases/GetOrdersByCustomerIdUseCase";
import { UpdateOrderStatusUseCase } from "./application/use-cases/UpdateOrderStatusUseCase";
import { PostgresTransactionManager } from "./infrastructure/data-access/postgres/PostgresTransactionManager";
import { PostgreOrderRepository } from "./infrastructure/data-access/postgres/repositories/PostgreOrderRepository";
import { RedisOrderCheckRepository } from "./infrastructure/data-access/redis/RedisOrderCheckRepository";
import { RedisClientProvider } from "./infrastructure/data-access/redis/redis-client.provider";
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

		// Use cases
		const createOrderUseCase = new CreateOrderUseCase(
			orderRepository,
			postgresTransactionManager
		);
		const getOrderByIdUseCase = new GetOrderByIdUseCase(
			orderRepository,
			postgresTransactionManager
		);
		const getOrdersByCustomerIdUseCase = new GetOrdersByCustomerIdUseCase(
			orderRepository,
			postgresTransactionManager
		);
		const updateOrderStatusUseCase = new UpdateOrderStatusUseCase(
			orderRepository,
			postgresTransactionManager
		);

		// Application service
		return new OrderService(
			createOrderUseCase,
			getOrderByIdUseCase,
			getOrdersByCustomerIdUseCase,
			updateOrderStatusUseCase,
			domainEventDispatcher,
			redisOrderCheckRepository
		);
	}
}
