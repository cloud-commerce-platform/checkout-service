import type {
	CancellationReason,
	OrderDomainEvent,
	OrderStatus,
} from "@alejotamayo28/event-contracts";
import type {
	InventoryStatus,
	PaymentStatus,
} from "@/application/projections/OrderProjection";
import type { Order } from "../entities/Order";

export type CancelContext = {
	paymentStatus: PaymentStatus;
	inventoryStatus: InventoryStatus;
	previousStatus?: OrderStatus;
	requiresPaymentRefund?: boolean;
	requiresInventoryRollback?: boolean;
};

export class OrderEvents {
	static created(order: Order): OrderDomainEvent {
		return {
			type: "ORDER_CREATED",
			timestamp: new Date(),
			aggregateId: order.getId(),
			aggregateType: "Order",
			data: {
				orderId: order.getId(),
				customerId: order.getCustomerId(),
				items: order.getItems(),
				totalAmount: order.calculateTotal(),
				currency: "COP",
			},
		};
	}

	static confirmed(order: Order): OrderDomainEvent {
		return {
			type: "ORDER_CONFIRMED",
			timestamp: new Date(),
			aggregateId: order.getId(),
			aggregateType: "Order",
			data: {
				orderId: order.getId(),
				confirmedAt: new Date(),
				customerId: order.getCustomerId(),
				totalAmount: order.calculateTotal(),
			},
		};
	}

	static completed(order: Order): OrderDomainEvent {
		return {
			type: "ORDER_COMPLETED",
			timestamp: new Date(),
			aggregateId: order.getId(),
			aggregateType: "Order",
			data: {
				orderId: order.getId(),
				completedAt: new Date(),
				deliveryDetails: {},
			},
		};
	}

	static cancelled(order: Order, cancelContext: CancelContext): OrderDomainEvent {
		if (!cancelContext.previousStatus) {
			throw new Error("PREVIOUS_STATE_ON_CANCEL_CONTEXT_REQUIRED");
		}

		const now = new Date();

		const needsPaymentRollback = order.needsPaymentRollback(
			cancelContext.paymentStatus,
			cancelContext.inventoryStatus
		);

		const needsInventoryRollback = order.needsInventoryRollback(
			cancelContext.paymentStatus,
			cancelContext.inventoryStatus
		);

		return {
			type: "ORDER_CANCELLED",
			timestamp: now,
			aggregateId: order.getId(),
			aggregateType: "Order",
			data: {
				orderId: order.getId(),
				cancelledAt: now,
				cancelledBy: "system",
				reason: order.getCancellationReasons(),
				previousStatus: cancelContext.previousStatus,
				requiresRefund: needsPaymentRollback,
				requiresInventoryRollback: needsInventoryRollback,
			},
		};
	}

	static paymentRollbackRequested(order: Order): OrderDomainEvent {
		return {
			type: "ORDER_PAYMENT_ROLLBACK_REQUESTED",
			timestamp: new Date(),
			aggregateId: order.getId(),
			aggregateType: "Order",
			data: {
				orderId: order.getId(),
			},
		};
	}

	static inventoryRollbackRequested(order: Order): OrderDomainEvent {
		return {
			type: "ORDER_INVENTORY_ROLLBACK_REQUESTED",
			timestamp: new Date(),
			aggregateId: order.getId(),
			aggregateType: "Order",
			data: { orderId: order.getId() },
		};
	}

	static inventoryReservationFailed(
		order: Order,
		reason: CancellationReason
	): OrderDomainEvent {
		return {
			type: "ORDER_INVENTORY_RESERVATION_FAILED",
			timestamp: new Date(),
			aggregateId: order.getId(),
			aggregateType: "Order",
			data: {
				orderId: order.getId(),
				reason: reason,
				failedAt: new Date(),
			},
		};
	}

	static paymentVerificationFailed(
		order: Order,
		reason: CancellationReason
	): OrderDomainEvent {
		return {
			type: "ORDER_PAYMENT_VERIFICATION_FAILED",
			timestamp: new Date(),
			aggregateId: order.getId(),
			aggregateType: "Order",
			data: {
				orderId: order.getId(),
				reason: reason,
				failedAt: new Date(),
			},
		};
	}

	static paymentDeductionCompleted(order: Order): OrderDomainEvent {
		return {
			type: "ORDER_PAYMENT_DEDUCTION_COMPLETED",
			timestamp: new Date(),
			aggregateId: order.getId(),
			aggregateType: "Order",
			data: {
				orderId: order.getId(),
				completedAt: new Date(),
			},
		};
	}

	static inventoryReservationCompleted(order: Order): OrderDomainEvent {
		return {
			type: "ORDER_INVENTORY_RESERVATION_COMPLETED",
			timestamp: new Date(),
			aggregateId: order.getId(),
			aggregateType: "Order",
			data: {
				orderId: order.getId(),
				completedAt: new Date(),
			},
		};
	}

	static compensationStarted(
		order: Order,
		cancelContext: CancelContext
	): OrderDomainEvent[] {
		if (
			cancelContext.requiresInventoryRollback === undefined ||
			cancelContext.requiresPaymentRefund === undefined
		) {
			throw new Error("COMPENSATION_CONTEXT_FLAGS_REQUIRED");
		}

		if (
			!cancelContext.requiresInventoryRollback &&
			!cancelContext.requiresPaymentRefund
		) {
			throw new Error("ORDER_COMPENSATION_WITHOUT_REQUIRED_ROLLBACK");
		}

		const events: OrderDomainEvent[] = [];

		events.push({
			type: "ORDER_COMPENSATION_STARTED",
			timestamp: new Date(),
			aggregateId: order.getId(),
			aggregateType: "Order",
			data: {
				orderId: order.getId(),
			},
		});

		if (cancelContext.requiresPaymentRefund) {
			events.push(OrderEvents.paymentRollbackRequested(order));
		}

		if (cancelContext.requiresInventoryRollback) {
			events.push(OrderEvents.inventoryRollbackRequested(order));
		}

		return events;
	}

	static compensationCompletd(order: Order): OrderDomainEvent {
		return {
			type: "ORDER_COMPENSATION_COMPLETED",
			timestamp: new Date(),
			aggregateId: order.getId(),
			aggregateType: "Order",
			data: {
				orderId: order.getId(),
			},
		};
	}
}
