import type { CancellationReason } from "@alejotamayo28/event-contracts";
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
			paymentReason: "",
			inventoryReason: "",
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
			paymentReason: data.paymentReason
				? (data.paymentReason as CancellationReason)
				: null,
			inventoryReason: data.inventoryReason
				? (data.inventoryReason as CancellationReason)
				: null,
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

	async updatePaymentReason(
		orderId: string,
		reason: CancellationReason | null
	): Promise<void> {
		const key = `order:${orderId}:checks`;
		await this.client.hSet(key, "paymentReason", reason || "");
	}

	async updateInventoryReason(
		orderId: string,
		reason: CancellationReason | null
	): Promise<void> {
		const key = `order:${orderId}:checks`;
		await this.client.hSet(key, "inventoryReason", reason || "");
	}

	async delete(orderId: string): Promise<void> {
		await this.client.del(`order:${orderId}:checks`);
	}
}
