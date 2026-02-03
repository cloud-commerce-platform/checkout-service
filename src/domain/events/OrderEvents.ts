import type {
	OrderCompletedEvent,
	OrderConfirmedEvent,
	OrderCreatedEvent,
	OrderDomainEvent,
	OrderInventoryRollbackEvent,
	OrderPaymentRollbackEvent,
	OrderStatus,
} from "@alejotamayo28/event-contracts";
import type {
	InventoryStatus,
	PaymentStatus,
} from "@/application/order/OrderProcessManager";
import type { Order } from "../entities/Order";

export type CancelContext = {
	paymentStatus: PaymentStatus;
	inventoryStatus: InventoryStatus;
	previousStatus?: OrderStatus;
};

export class OrderEvents {
	static created(order: Order): OrderCreatedEvent {
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

	static confirmed(order: Order): OrderConfirmedEvent {
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

	static completed(order: Order): OrderCompletedEvent {
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

	static cancelled(order: Order, cancelContext: CancelContext): OrderDomainEvent[] {
		if (!cancelContext.previousStatus) {
			throw new Error("PREVIOUS_STATE_ON_CANCEL_CONTEXT_REQUIRED");
		}
		const events: OrderDomainEvent[] = [];
		events.push({
			type: "ORDER_CANCELLED",
			timestamp: new Date(),
			aggregateId: order.getId(),
			aggregateType: "Order",
			data: {
				orderId: order.getId(),
				cancelledAt: new Date(),
				cancelledBy: "system",
				reason: "",
				previousStatus: cancelContext.previousStatus,
				requiresRefund: order.needsPaymentRollback(
					cancelContext.paymentStatus,
					cancelContext.inventoryStatus
				),
				requiresInventoryRollback: order.needsInventoryRollback(
					cancelContext.paymentStatus,
					cancelContext.inventoryStatus
				),
			},
		});

		if (
			order.needsPaymentRollback(
				cancelContext.paymentStatus,
				cancelContext.inventoryStatus
			)
		) {
			events.push(OrderEvents.paymentRollbackRequested(order));
		}

		if (
			order.needsInventoryRollback(
				cancelContext.paymentStatus,
				cancelContext.inventoryStatus
			)
		) {
			events.push(OrderEvents.inventoryRollbackRequested(order));
		}
		return events;
	}

	static paymentRollbackRequested(order: Order): OrderPaymentRollbackEvent {
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

	static inventoryRollbackRequested(order: Order): OrderInventoryRollbackEvent {
		return {
			type: "ORDER_INVENTORY_ROLLBACK_REQUESTED",
			timestamp: new Date(),
			aggregateId: order.getId(),
			aggregateType: "Order",
			data: { orderId: order.getId() },
		};
	}
}
