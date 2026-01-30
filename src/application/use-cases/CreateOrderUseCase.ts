import { Order, type OrderItems } from "@/domain/entities/Order";
import type { OrderRepository } from "@/domain/repositories/OrderRepository";
import type { CreateOrderRequest } from "@/infrastructure/rest-api/controllers/OrderController";

export class CreateOrderUseCase {
	constructor(private readonly orderRepository: OrderRepository) {}

	async execute(createOrderRequest: CreateOrderRequest): Promise<Order> {
		const items: OrderItems[] = createOrderRequest.items.map((item) => ({
			id: item.productId,
			price: item.unitPrice,
			quantity: item.quantity,
			totalAmount: item.unitPrice * item.quantity,
		}));

		const order = new Order(createOrderRequest.customerId, items, []);

		await this.orderRepository.save(order);

		return order;
	}
}
