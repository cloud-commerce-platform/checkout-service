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
		const initial: OrderChecks = {
			payment: "pending",
			inventory: "pending",
		};

		await this.client.set(key, JSON.stringify(initial), { EX: 600 });
	}

	async get(orderId: string): Promise<OrderChecks | null> {
		const value = await this.client.get(`order:${orderId}:checks`);

		return value ? JSON.parse(value) : null;
	}

	async updatePaymentCheck(orderId: string, status: PaymentCheckStatus): Promise<void> {
		const checks = await this.get(orderId);
		if (!checks) {
			throw new Error(`ORDER_CHECK_NOT_INITIALIZED_${orderId}`);
		}

		checks.payment = status;
		await this.client.set(`order:${orderId}:checks`, JSON.stringify(checks));
	}

	async updateInventoryCheck(
		orderId: string,
		status: InventoryCheckStatus
	): Promise<void> {
		const checks = await this.get(orderId);
		if (!checks) {
			throw new Error(`ORDER_CHECK_NOT_INITIALIZED_${orderId}`);
		}

		checks.inventory = status;
		await this.client.set(`order:${orderId}:checks`, JSON.stringify(checks));
	}

	async delete(orderId: string): Promise<void> {
		const key = `order:${orderId}:checks`;

		await this.client.del(key);
	}
}
