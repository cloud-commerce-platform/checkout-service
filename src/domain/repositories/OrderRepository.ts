import type { Order } from "../entities/Order";

export interface OrderRepository {
	findById(id: string): Promise<Order | null>;
	findByCustomerId(customerId: string): Promise<Order[]>;
	save(order: Order): Promise<void>;
	saveMany(orders: Order[]): Promise<void>;
	update(order: Order): Promise<void>;
	delete(id: string): Promise<void>;
}
