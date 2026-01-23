import type { CancellationReason, OrderItems, OrderStatus } from "../entities/Order";

export interface DomainEvent<
	TData = unknown,
	TAggregate extends string = string,
	TType extends string = string,
> {
	type: TType;
	timestamp: Date;
	aggregateId: string;
	aggregateType: TAggregate;
	data: TData;
}

export interface OrderCreatedPayload {
	orderId: string;
	customerId: string;
	items: OrderItems[];
	totalAmount: number;
	currency: string;
}

export interface OrderConfirmedPayload {
	orderId: string;
	confirmedAt: Date;
	customerId: string;
	totalAmount: number;
}

export interface OrderCancelledPayload {
	orderId: string;
	cancelledAt: Date;
	reason: string;
	cancelledBy: "customer" | "admin" | "system";
	previousStatus: OrderStatus;
	requiresRefund: boolean;
	requiresInventoryRollback: boolean;
}

export interface OrderCompletedPayload {
	orderId: string;
	completedAt: Date;
	deliveryDetails?: Record<string, any>;
}

export interface InventoryReservationFailedPayload {
	orderId: string;
	reason:
		| CancellationReason.INVENTORY_UNAVAILABLE
		| CancellationReason.INVENTORY_UNAVAILABLE;
	unavailableItems: { itemId: string }[];
}


export interface InventoryReservationCompletedPayload {
	orderId: string;
	reservationId: string;
}

export interface InventoryRollbackRequestedPayload {
	orderId: string;
	rollbackReason: string;
	items?: {
		productId: string;
		quantity: number;
	}[];
}

export interface PaymentRefundRequestedPayload {
	orderId: string;
}

// Creamos orden
export type OrderCreatedEvent = DomainEvent<
	OrderCreatedPayload,
	"Order",
	"ORDER_CREATED"
>;

// Confirma inventory y payment
export type OrderConfirmedEvent = DomainEvent<
	OrderConfirmedPayload,
	"Order",
	"ORDER_CONFIRMED"
>;

// Cancelamos orden
export type OrderCancelledEvent = DomainEvent<
	OrderCancelledPayload,
	"Order",
	"ORDER_CANCELLED"
>;

// Orden finalizada 
export type OrderCompletedEvent = DomainEvent<
	OrderCompletedPayload,
	"Order",
	"ORDER_COMPLETED"
>;

export type InventoryRollbackRequestedEvent = DomainEvent<
	InventoryRollbackRequestedPayload,
	"Order",
	"INVENTORY_ROLLBACK_REQUESTED"
>;

export type PaymentRefundRequestedEvent = DomainEvent<
	PaymentRefundRequestedPayload,
	"Order",
	"PAYMENT_ROLLBACK_REQUESTED"
>;

export type OrderDomainEvent =
	| OrderCreatedEvent
	| OrderConfirmedEvent
	| OrderCancelledEvent
	| OrderCompletedEvent
	| InventoryRollbackRequestedEvent
	| PaymentRefundRequestedEvent
