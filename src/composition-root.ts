import { OrderProcessManager } from "./application/order/OrderProcessManager";
import type { MessagingService } from "./application/ports/MessagingService";
import { OrderProjection } from "./application/projections/OrderProjection";
import { OrderService } from "./application/services/OrderService";
import { CreateOrderUseCase } from "./application/use-cases/CreateOrderUseCase";
import { GetOrderByIdUseCase } from "./application/use-cases/GetOrderByIdUseCase";
import { GetOrderEventsUseCase } from "./application/use-cases/GetOrderEventsUseCase";
import { GetOrdersByCustomerIdUseCase } from "./application/use-cases/GetOrdersByCustomerIdUseCase";
import { PostgresTransactionManager } from "./infrastructure/data-access/postgres/PostgresTransactionManager";
import { PostgreEventRepository } from "./infrastructure/data-access/postgres/repositories/PostgreEventRepository";
import { PostgreOrderRepository } from "./infrastructure/data-access/postgres/repositories/PostgreOrderRepository";
import { PostgreOutboxRepository } from "./infrastructure/data-access/postgres/repositories/PostgreOutboxRepository";
import { RabbitMQIntegrationEventMapper } from "./infrastructure/events/RabbitMQIntegrationEventMapper";

export class CompositionRoot {
	static async configure(messagingService: MessagingService): Promise<OrderService> {
		// Db (PostgreSQL)
		const orderRepository = new PostgreOrderRepository();
		const postgresTransactionManager = new PostgresTransactionManager();

		// Messaging (RabbitMQ)
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

		const outboxRepository = new PostgreOutboxRepository();
		const eventRepository = new PostgreEventRepository();

		const getOrderEventsUseCase = new GetOrderEventsUseCase(
			eventRepository,
			postgresTransactionManager
		);

		// Proyección para Event Sourcing
		const orderProjection = new OrderProjection(eventRepository, orderRepository);

		const orderProcessManager = new OrderProcessManager(
			orderRepository,
			orderProjection,
			postgresTransactionManager,
			outboxRepository,
			integrationEvenMapper,
			eventRepository
		);

		// Application service
		return new OrderService(
			createOrderUseCase,
			getOrderByIdUseCase,
			getOrdersByCustomerIdUseCase,
			orderProcessManager,
			postgresTransactionManager,
			outboxRepository,
			integrationEvenMapper,
			eventRepository,
			getOrderEventsUseCase
		);
	}
}
