import type {
	InventoryCheckStatus,
	OrderCheckRepository,
	OrderChecks,
	PaymentCheckStatus,
} from "@application/ports/OrderCheckRepository";
import type { RedisClientType } from "redis";

export class RedisOrderCheckRepository implements OrderCheckRepository {
	constructor(private readonly client: RedisClientType) {}

	async initialize(orderId: string): Promise<void> {
		const key = `order:${orderId}:checks`;

		await this.client.hSet(key, {
			payment: "pending",
			inventory: "pending",
			createdAt: Date.now().toString(),
		});

		await this.client.expire(key, 600);
	}

	async get(orderId: string): Promise<OrderChecks | null> {
		const key = `order:${orderId}:checks`;
		const data = await this.client.hGetAll(key);

		if (Object.keys(data).length === 0) return null;

		return {
			payment: data.payment as PaymentCheckStatus,
			inventory: data.inventory as InventoryCheckStatus,
			createdAt: Number(data.createdAt),
		};
	}

	async updatePaymentCheck(orderId: string, status: PaymentCheckStatus): Promise<void> {
		await this.client.hSet(`order:${orderId}:checks`, "payment", status);
	}

	async updateInventoryCheck(
		orderId: string,
		status: InventoryCheckStatus
	): Promise<void> {
		await this.client.hSet(`order:${orderId}:checks`, "inventory", status);
	}

	async delete(orderId: string): Promise<void> {
		await this.client.del(`order:${orderId}:checks`);
	}
}
