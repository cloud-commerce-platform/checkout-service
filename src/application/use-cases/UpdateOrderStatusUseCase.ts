import type { Order, OrderStatus } from "@/domain/entities/Order";
import type { OrderRepository } from "@/domain/repositories/OrderRepository";
import type {
	IncomingEvents,
	IncomingIntegrationEvent,
} from "@/infrastructure/events/IntegrationEvents";
import type { TransactionManager } from "../ports/TransactionManager";

export class UpdateOrderStatusUseCase {
	constructor(
		private readonly orderRepository: OrderRepository,
		private readonly transactionManager: TransactionManager
	) {}

	async execute<T extends IncomingEvents>(
		eventMessage: IncomingIntegrationEvent<T>,
		orderStatus: OrderStatus
	): Promise<Order> {
		return await this.transactionManager.runInTransaction(async () => {

			const order = await this.orderRepository.findById(eventMessage.payload.orderId);
			if (!order) {
				throw new Error("ORDER_NOT_FOUND");
			}

			// NO existe type en el payload de llegada
			switch (eventMessage.payload.type) {
				case "INVENTORY_RESERVATION_COMPLETED":
					break;

				case "INVENTORY_RESERVATION_FAILED":
					order.transitionTo(orderStatus, {
						reason: "MANUAL_STATUS_UPDATE",
						cancelationReason: eventMessage.payload.reason,
					});
					break;

				case "PAYMENT_FAILED":
					order.transitionTo(orderStatus, {
						reason: "MANUAL_STATUS_UPDATE",
						cancelationReason: eventMessage.payload.reason,
					});
					break;

				case "PAYMENT_COMPLETED":
					break;
			}

			await this.orderRepository.update(order);
			return order;
		});
	}
}
