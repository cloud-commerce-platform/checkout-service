export type PaymentCheckStatus = "pending" | "approved" | "rejected";
export type InventoryCheckStatus = "pending" | "reserved" | "unavailable";

export interface OrderChecks {
	payment: PaymentCheckStatus;
	inventory: InventoryCheckStatus;
}

export interface OrderCheckRepository {
	initialize(orderId: string): Promise<void>;
	updatePaymentCheck(orderId: string, status: PaymentCheckStatus): Promise<void>;
	updateInventoryCheck(orderId: string, status: InventoryCheckStatus): Promise<void>;
	get(orderId: string): Promise<OrderChecks | null>;
	delete(orderId: string): Promise<void>;
}
