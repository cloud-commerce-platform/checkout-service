import type { OrderCheckRepository } from "@application/ports/OrderCheckRepository";
import { type Order } from "@domain/entities/Order";
import type {
	IncomingEvents,
	IncomingIntegrationEvent,
} from "@/infrastructure/events/IntegrationEvents";
import type { CreateOrderRequest } from "@/infrastructure/rest-api/controllers/OrderController";
import type { DomainEventDispatcher } from "../ports/DomainEventDispatcher";
import type { CreateOrderUseCase } from "../use-cases/CreateOrderUseCase";
import type { GetOrderByIdUseCase } from "../use-cases/GetOrderByIdUseCase";
import type { GetOrdersByCustomerIdUseCase } from "../use-cases/GetOrdersByCustomerIdUseCase";
import { OrderProcessManager } from "../order/OrderProcessManager";

export class OrderService {
	constructor(
		private readonly createOrderUseCase: CreateOrderUseCase,
		private readonly getOrderByIdUseCase: GetOrderByIdUseCase,
		private readonly getOrdersByCustomerIdUseCase: GetOrdersByCustomerIdUseCase,
		private readonly domainEventDispatcher: DomainEventDispatcher,
		private readonly orderCheckRepository: OrderCheckRepository,
		private readonly orderProcessManager: OrderProcessManager
	) {}

	public async getOrderById(id: string): Promise<Order> {
		return this.getOrderByIdUseCase.execute(id);
	}

	public async getOrdersByCustomer(customerId: string): Promise<Order[]> {
		return this.getOrdersByCustomerIdUseCase.execute(customerId);
	}

	public async createOrder(createOrderRequest: CreateOrderRequest): Promise<void> {
		const order = await this.createOrderUseCase.execute(createOrderRequest);

		await this.orderCheckRepository.initialize(order.getId());
		await this.domainEventDispatcher.dispatch(order.getDomainEvents());
		order.clearDomainEvents();
	}

	public async handleIntegrationEvent<T extends IncomingEvents>(
		eventMessage: IncomingIntegrationEvent<T>,
		checkType: "paymentCheck" | "inventoryCheck",
		status: "pending" | "completed" | "failed"
	): Promise<void> {
		await this.orderProcessManager.handle<T>(eventMessage, checkType, status);
	}
}
