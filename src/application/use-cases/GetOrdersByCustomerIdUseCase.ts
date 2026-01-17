import type { Order } from "@/domain/entities/Order";
import type { OrderRepository } from "@/domain/repositories/OrderRepository";
import type { TransactionManager } from "../ports/TransactionManager";

export class GetOrdersByCustomerIdUseCase {
	constructor(
		private readonly orderRepository: OrderRepository,
		private readonly transactionManager: TransactionManager
	) {}
	async execute(id: string): Promise<Order[]> {
		const orders = this.transactionManager.runInSession(async () => {
			return this.orderRepository.findByCustomerId(id);
		});

		if (!orders) {
			throw new Error("Orders not found by customer id");
		}

		return orders;
	}
}
