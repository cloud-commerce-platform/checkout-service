import type { OrderCheckRepository } from "@application/ports/OrderCheckRepository";
import { type Order, OrderStatus } from "@domain/entities/Order";
import type {
	IncomingEvents,
	IncomingIntegrationEvent,
} from "@/infrastructure/events/IntegrationEvents";
import type { CreateOrderRequest } from "@/infrastructure/rest-api/controllers/OrderController";
import type { DomainEventDispatcher } from "../ports/DomainEventDispatcher";
import type { CreateOrderUseCase } from "../use-cases/CreateOrderUseCase";
import type { GetOrderByIdUseCase } from "../use-cases/GetOrderByIdUseCase";
import type { GetOrdersByCustomerIdUseCase } from "../use-cases/GetOrdersByCustomerIdUseCase";
import type { UpdateOrderStatusUseCase } from "../use-cases/UpdateOrderStatusUseCase";
import { PaymentCheckingFailedEvent } from "../consumers/types/PaymentEvents";

export class OrderService {
	constructor(
		private readonly createOrderUseCase: CreateOrderUseCase,
		private readonly getOrderByIdUseCase: GetOrderByIdUseCase,
		private readonly getOrdersByCustomerIdUseCase: GetOrdersByCustomerIdUseCase,
		private readonly updateOrderStatusUseCase: UpdateOrderStatusUseCase,
		private readonly domainEventDispatcher: DomainEventDispatcher,
		private readonly orderCheckRepository: OrderCheckRepository
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

	public async updateOrderStatus<T extends IncomingEvents>(
		eventMessage: IncomingIntegrationEvent<T>,
		status: OrderStatus
	): Promise<void> {
		const order = await this.updateOrderStatusUseCase.execute(eventMessage, status);

		await this.domainEventDispatcher.dispatch(order.getDomainEvents());
		order.clearDomainEvents();
	}

	public async updateOrderCheck<T extends IncomingEvents>(
		eventMessage: IncomingIntegrationEvent<T>,
		checkType: "paymentCheck" | "inventoryCheck",
		status: "pending" | "completed" | "failed"
	): Promise<void> {
		const orderId = eventMessage.payload.orderId;

		if (checkType === "paymentCheck") {
			const paymentStatus =
				status === "completed"
					? "approved"
					: status === "failed"
						? "rejected"
						: "pending";
			await this.orderCheckRepository.updatePaymentCheck(orderId, paymentStatus);
		} else {
			const inventoryStatus =
				status === "completed"
					? "reserved"
					: status === "failed"
						? "unavailable"
						: "pending";
			await this.orderCheckRepository.updateInventoryCheck(orderId, inventoryStatus);
		}

		const orderStatus = await this.orderCheckRepository.get(orderId);
		if (!orderStatus) {
			return;
		}

		console.log("[Order-Status]: ", orderStatus);
		const { payment: paymentStatus, inventory: inventoryStatus } = orderStatus;

		if (paymentStatus === "rejected" || inventoryStatus === "unavailable") {
			if (paymentStatus === "rejected" && inventoryStatus === "reserved") {
				await this.updateOrderStatus(eventMessage, OrderStatus.CANCELLED);
				// TODO: rollback inventory
			}

			if (paymentStatus === "approved" && inventoryStatus === "unavailable") {
				await this.updateOrderStatus<T>(eventMessage, OrderStatus.CANCELLED);
				// TODO: rollback payment
			}

			await this.orderCheckRepository.delete(orderId);
			return;
		}

		if (paymentStatus === "approved" && inventoryStatus === "reserved") {
			await this.updateOrderStatus<T>(eventMessage, OrderStatus.CONFIRMED);
			await this.orderCheckRepository.delete(orderId);
			return;
		}
	}
}
