import type { OrderCheckRepository } from "@application/ports/OrderCheckRepository";
import type { Order } from "@domain/entities/Order";
import type {
	IncomingEvents,
	IncomingIntegrationEvent,
} from "@/infrastructure/events/IntegrationEvents";
import type { CreateOrderRequest } from "@/infrastructure/rest-api/controllers/OrderController";
import type { OrderProcessManager } from "../order/OrderProcessManager";
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
		private readonly integrationEventMapper: IntegrationEventMapper
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

			const [event] = order.getDomainEvents();
			if (!event) return;

			const mappedEvent = this.integrationEventMapper.map(event);
			if (!mappedEvent) {
				throw new Error("NO_MAPPER_FOUND_FOR_EVENT");
			}

			const { Outbox } = await import("@/domain/entities/Outbox");
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
