import type { CancellationReason } from "@/domain/entities/Order";

export interface InventoryReservationConfirmedEvent {
	type: "INVENTORY_RESERVATION_COMPLETED";
	orderId: string;
	items: {
		productId: string;
		quantity: number;
	}[];
	customerId: string;
}

export interface InventoryReservationFailedEvent {
	type: "INVENTORY_RESERVATION_FAILED";
	orderId: string;
	reason: CancellationReason;
	unavailableItems: { itemId: string }[];
}

export type IncomingInventoryEvent =
	| InventoryReservationConfirmedEvent
	| InventoryReservationFailedEvent;
