import type { Order } from "@/domain/entities/Order";
import type { OrderRepository } from "@/domain/repositories/OrderRepository";
import type { TransactionManager } from "../ports/TransactionManager";

export class GetOrderByIdUseCase {
	constructor(
		private readonly orderRepository: OrderRepository,
		private readonly transactionManager: TransactionManager
	) {}
	async execute(id: string): Promise<Order> {
		const order = await this.transactionManager.runInSession(async () => {
			return this.orderRepository.findById(id);
		});

		if (!order) {
			throw new Error("Order not found");
		}

		return order;
	}
}
