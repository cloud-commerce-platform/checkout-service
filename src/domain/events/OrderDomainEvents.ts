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

export interface PaymentVerificationFailedPayload {
	orderId: string;
	reason: CancellationReason.PAYMENT_FAILED;
	details: string;
}

export interface InventoryReservationFailedPayload {
	orderId: string;
	reason:
		| CancellationReason.INVENTORY_UNAVAILABLE
		| CancellationReason.INVENTORY_UNAVAILABLE;
	unavailableItems: { itemId: string }[];
}

export interface InventoryDeductRequestedPayload {
	orderId: string;
	items: {
		productId: string;
		quantity: number;
	}[];
	deductFromReservation?: boolean;
}

export interface InventoryReservationCompletedPayload {
	orderId: string;
	reservationId: string;
}

export interface PaymentCaptureRequestedPayload {
	orderId: string;
	amount: number;
	currency: string;
	paymentMethod: string;
	customerId: string;
	billingDetails?: {
		name: string;
		email: string;
		address?: string;
	};
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
	refundAmount: number;
	currency: string;
	refundReason: string;
	originalTransactionId?: string;
}

export type OrderCreatedEvent = DomainEvent<
	OrderCreatedPayload,
	"Order",
	"ORDER_CREATED"
>;

export type OrderConfirmedEvent = DomainEvent<
	OrderConfirmedPayload,
	"Order",
	"ORDER_CONFIRMED"
>;

export type OrderCancelledEvent = DomainEvent<
	OrderCancelledPayload,
	"Order",
	"ORDER_CANCELLED"
>;

export type OrderCompletedEvent = DomainEvent<
	OrderCompletedPayload,
	"Order",
	"ORDER_COMPLETED"
>;

export type PaymentVerificationFailedEvent = DomainEvent<
	PaymentVerificationFailedPayload,
	"Order",
	"ORDER_PAYMENT_VERIFICATION_FAILED"
>;

export type InventoryReservationCompletedEvent = DomainEvent<
	InventoryReservationCompletedPayload,
	"Order",
	"ORDER_INVENTORY_RESERVATION_COMPLETED"
>;

export type InventoryDeductRequestedEvent = DomainEvent<
	InventoryDeductRequestedPayload,
	"Order",
	"INVENTORY_DEDUCT_REQUESTED"
>;

export type PaymentCaptureRequestedEvent = DomainEvent<
	PaymentCaptureRequestedPayload,
	"Order",
	"PAYMENT_CAPTURE_REQUESTED"
>;

export type InventoryRollbackRequestedEvent = DomainEvent<
	InventoryRollbackRequestedPayload,
	"Order",
	"INVENTORY_ROLLBACK_REQUESTED"
>;

export type PaymentRefundRequestedEvent = DomainEvent<
	PaymentRefundRequestedPayload,
	"Order",
	"PAYMENT_REFUND_REQUESTED"
>;

export type OrderDomainEvent =
	| OrderCreatedEvent
	| OrderConfirmedEvent
	| OrderCancelledEvent
	| OrderCompletedEvent
	| PaymentVerificationFailedEvent
	| InventoryDeductRequestedEvent
	| PaymentCaptureRequestedEvent
	| InventoryRollbackRequestedEvent
	| PaymentRefundRequestedEvent
	| InventoryReservationCompletedEvent;
