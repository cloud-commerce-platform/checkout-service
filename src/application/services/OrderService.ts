import type { OrderCheckRepository } from "@application/ports/OrderCheckRepository";
import type { Order } from "@domain/entities/Order";
import { Outbox } from "@/domain/entities/Outbox";
import type {
	IncomingEvents,
	IncomingIntegrationEvent,
} from "@/infrastructure/events/IntegrationEvents";
import type { CreateOrderRequest } from "@/infrastructure/rest-api/controllers/OrderController";
import type { OrderProcessManager } from "../order/OrderProcessManager";
import type { EventRepository } from "../ports/EventRepository";
import type { IntegrationEventMapper } from "../ports/IntegrationEventMapper";
import type { OutboxRepository } from "../ports/OutboxRepository";
import type { TransactionManager } from "../ports/TransactionManager";
import type { CreateOrderUseCase } from "../use-cases/CreateOrderUseCase";
import type { GetOrderByIdUseCase } from "../use-cases/GetOrderByIdUseCase";
import type { GetOrdersByCustomerIdUseCase } from "../use-cases/GetOrdersByCustomerIdUseCase";

export class OrderService {
	constructor(
		private readonly createOrderUseCase: CreateOrderUseCase,
		private readonly getOrderByIdUseCase: GetOrderByIdUseCase,
		private readonly getOrdersByCustomerIdUseCase: GetOrdersByCustomerIdUseCase,
		private readonly orderCheckRepository: OrderCheckRepository,
		private readonly orderProcessManager: OrderProcessManager,
		private readonly transactionManager: TransactionManager,
		private readonly outboxRepository: OutboxRepository,
		private readonly integrationEventMapper: IntegrationEventMapper,
		private readonly eventRepository: EventRepository
	) {}

	public async getOrderById(id: string): Promise<Order> {
		return this.getOrderByIdUseCase.execute(id);
	}

	public async getOrdersByCustomer(customerId: string): Promise<Order[]> {
		return this.getOrdersByCustomerIdUseCase.execute(customerId);
	}

	public async createOrder(createOrderRequest: CreateOrderRequest): Promise<void> {
		await this.transactionManager.runInTransaction(async () => {
			const order = await this.createOrderUseCase.execute(createOrderRequest);

			await this.orderCheckRepository.initialize(order.getId());

			const [domainEvent] = order.getDomainEvents();
			if (!domainEvent) return;

			const mappedEvent = this.integrationEventMapper.map(domainEvent);
			if (!mappedEvent) {
				throw new Error("NO_MAPPER_FOUND_FOR_EVENT");
			}

			await this.eventRepository.append(order, 0);

			const outbox = new Outbox(
				mappedEvent.eventType,
				mappedEvent.payload,
				mappedEvent.correlationId,
				mappedEvent.version,
				new Date(mappedEvent.occurredAt),
				mappedEvent.exchange,
				mappedEvent.routingKey,
				mappedEvent.source
			);

			await this.outboxRepository.save(outbox);

			order.clearDomainEvents();
		});
	}

	public async handleIntegrationEvent<T extends IncomingEvents>(
		eventMessage: IncomingIntegrationEvent<T>,
		checkType: "paymentCheck" | "inventoryCheck",
		status: "pending" | "completed" | "failed"
	): Promise<void> {
		await this.orderProcessManager.handle<T>(eventMessage, checkType, status);
	}
}
