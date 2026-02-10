import {
	type CancellationReason,
	type OrderDomainEvent,
	OrderStatus,
} from "@alejotamayo28/event-contracts";
import type {
	InventoryStatus,
	PaymentStatus,
} from "@/application/projections/OrderProjection";
import { type CancelContext, OrderEvents } from "../events/OrderEvents";
import Entity from "./Entity";

export interface OrderItems {
	id: string;
	price: number;
	quantity: number;
	totalAmount: number;
}

export const ORDER_STATE_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
	[OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],

	[OrderStatus.CONFIRMED]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],

	[OrderStatus.CANCELLED]: [OrderStatus.COMPENSATION_PENDING, OrderStatus.COMPENSATED],

	[OrderStatus.COMPENSATION_PENDING]: [OrderStatus.COMPENSATED],

	[OrderStatus.COMPENSATED]: [],

	[OrderStatus.COMPLETED]: [],
};

export class Order extends Entity<OrderDomainEvent> {
	static loadOrder(
		id: string,
		customerId: string,
		items: OrderItems[],
		status: OrderStatus,
		cancellationReasons: CancellationReason[]
	): Order {
		const order = new Order(customerId, items, cancellationReasons);
		order.setId(id);
		order.setWasUpdated(false);

		order.status = status;
		order.clearDomainEvents();
		return order;
	}

	private customerId: string;
	private items: OrderItems[];
	private status: OrderStatus;
	private cancellationReasons: CancellationReason[];
	private wasUpdated: boolean;

	constructor(
		customerId: string,
		items: OrderItems[],
		cancellationReasons: CancellationReason[] = []
	) {
		super();
		this.customerId = customerId;
		this.items = items;
		this.status = OrderStatus.PENDING;
		this.cancellationReasons = cancellationReasons;
		this.wasUpdated = true;

		this.addDomainEvent(OrderEvents.created(this));
	}

	public transitionTo(newStatus: OrderStatus, context?: CancelContext): void {
		if (this.status === newStatus) return;
		const allowedTransitions = ORDER_STATE_TRANSITIONS[this.status];

		if (!allowedTransitions.includes(newStatus)) {
			throw new Error(`CANNOT_TRASITION_FROM_${this.status}_TO_${newStatus}`);
		}
		const previousStatus = this.getStatus();
		this.setStatus(newStatus);

		const event = this.buildEvent(newStatus, context, previousStatus);
		if (!event) return;

		if (Array.isArray(event)) {
			event.forEach((event) => this.addDomainEvent(event));
			return;
		}

		return this.addDomainEvent(event);
	}

	private buildEvent(
		status: OrderStatus,
		context?: CancelContext,
		previousStatus?: OrderStatus
	) {
		switch (status) {
			case OrderStatus.CONFIRMED:
				return OrderEvents.confirmed(this);

			case OrderStatus.COMPLETED:
				return OrderEvents.completed(this);

			case OrderStatus.CANCELLED:
				if (!context) throw new Error("CANCEL_CONTEXT_REQUIRED");
				return OrderEvents.cancelled(this, {
					...context,
					previousStatus,
				});

			case OrderStatus.COMPENSATION_PENDING:
				if (!context) throw new Error("CANCEL_CONTEXT_REQUIRED");
				return OrderEvents.compensationStarted(this, {
					...context,
					previousStatus,
				});

			default:
				return null;
		}
	}

	public markInventoryAsFailed(reason: CancellationReason): void {
		this.addCancellationReasons(reason);
		this.wasUpdated = true;
	}

	public markPaymentAsFailed(reason: CancellationReason): void {
		this.addCancellationReasons(reason);
		this.wasUpdated = true;
	}

	public markInventoryReservationFailed(reason: string): void {
		this.addCancellationReasons(reason as CancellationReason);
		this.wasUpdated = true;
		this.addDomainEvent(
			OrderEvents.inventoryReservationFailed(this, reason as CancellationReason)
		);
	}

	public markPaymentVerificationFailed(reason: string): void {
		this.addCancellationReasons(reason as CancellationReason);
		this.wasUpdated = true;
		this.addDomainEvent(
			OrderEvents.paymentVerificationFailed(this, reason as CancellationReason)
		);
	}

	public markPaymentDeductionCompleted(): void {
		this.wasUpdated = true;
		this.addDomainEvent(OrderEvents.paymentDeductionCompleted(this));
	}

	public markInventoryReservationCompleted(): void {
		this.wasUpdated = true;
		this.addDomainEvent(OrderEvents.inventoryReservationCompleted(this));
	}

	public markInventoryRollbackCompleted(): void {
		this.wasUpdated = true;
		this.addDomainEvent(OrderEvents.compensationCompletd(this));
	}

	public needsPaymentRollback(
		paymentStatus: PaymentStatus,
		inventoryStatus: InventoryStatus
	): boolean {
		return (
			paymentStatus === "approved" &&
			(inventoryStatus === "unavailable" || this.status === OrderStatus.CANCELLED)
		);
	}

	public needsInventoryRollback(
		paymentStatus: PaymentStatus,
		inventoryStatus: InventoryStatus
	): boolean {
		return (
			inventoryStatus === "reserved" &&
			(paymentStatus === "rejected" || this.status === OrderStatus.CANCELLED)
		);
	}

	public cancel(paymentStatus: PaymentStatus, inventoryStatus: InventoryStatus) {
		const requiresPaymentRefund = this.needsPaymentRollback(
			paymentStatus,
			inventoryStatus
		);
		const requiresInventoryRollback = this.needsInventoryRollback(
			paymentStatus,
			inventoryStatus
		);

		const context: CancelContext = {
			paymentStatus,
			inventoryStatus,
			requiresPaymentRefund,
			requiresInventoryRollback,
		};

		this.transitionTo(OrderStatus.CANCELLED, context);
		if (this.requiresCompensation(context)) {
			this.transitionTo(OrderStatus.COMPENSATION_PENDING, context);
		}
	}

	private requiresCompensation(context: CancelContext): boolean {
		if (
			context.requiresInventoryRollback === undefined ||
			context.requiresPaymentRefund === undefined
		) {
			throw new Error("CANCEL_CONTEXT_ROLLBACK_FLAGS_REQUIRED");
		}
		return context.requiresInventoryRollback || context.requiresPaymentRefund;
	}

	public calculateTotal(): number {
		return this.items.reduce((total, item) => total + item.totalAmount, 0);
	}

	public getCustomerId(): string {
		return this.customerId;
	}

	public getItems(): OrderItems[] {
		return this.items;
	}

	public getStatus(): OrderStatus {
		return this.status;
	}

	public getWasUpdated(): boolean {
		return this.wasUpdated;
	}

	public getCancellationReasons(): CancellationReason[] {
		return this.cancellationReasons;
	}

	public setStatus(newStatus: OrderStatus) {
		this.status = newStatus;

		this.wasUpdated = true;
	}

	public addCancellationReasons(reason: CancellationReason) {
		this.cancellationReasons ??= [];

		if (!this.cancellationReasons.includes(reason)) {
			this.cancellationReasons.push(reason);
			this.wasUpdated = true;
		}
	}

	public setWasUpdated(wasUpdated: boolean) {
		this.wasUpdated = wasUpdated;
	}
}
