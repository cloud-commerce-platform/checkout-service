import type { CancellationReason } from "@alejotamayo28/event-contracts";

export type PaymentCheckStatus = "pending" | "approved" | "rejected";
export type InventoryCheckStatus = "pending" | "reserved" | "unavailable";

export interface OrderChecks {
	payment: PaymentCheckStatus;
	inventory: InventoryCheckStatus;
	paymentReason?: CancellationReason | null;
	inventoryReason?: CancellationReason | null;
	createdAt: Date;
}

export interface OrderCheckRepository {
	initialize(orderId: string): Promise<void>;
	updatePaymentCheck(orderId: string, status: PaymentCheckStatus): Promise<void>;
	updateInventoryCheck(orderId: string, status: InventoryCheckStatus): Promise<void>;
	updatePaymentReason(orderId: string, reason: CancellationReason | null): Promise<void>;
	updateInventoryReason(
		orderId: string,
		reason: CancellationReason | null
	): Promise<void>;
	get(orderId: string): Promise<OrderChecks | null>;
	delete(orderId: string): Promise<void>;
}
