import type {
	CancellationReason,
	OrderDomainEvent,
} from "@alejotamayo28/event-contracts";
import type {
	InventoryStatus,
	PaymentStatus,
} from "@/application/order/OrderProcessManager";
import Entity from "./Entity";

export interface OrderItems {
	id: string;
	price: number;
	quantity: number;
	totalAmount: number;
}

export enum OrderStatus {
	PENDING = "PENDING",
	CONFIRMED = "CONFIRMED",
	COMPLETED = "COMPLETED",
	CANCELLED = "CANCELLED",
	REJECTING = "REJECTING",
}

export const ORDER_STATE_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
	[OrderStatus.PENDING]: [
		OrderStatus.CONFIRMED,
		OrderStatus.CANCELLED,
		OrderStatus.REJECTING,
	],

	[OrderStatus.CONFIRMED]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
	[OrderStatus.REJECTING]: [OrderStatus.CANCELLED],

	[OrderStatus.CANCELLED]: [],
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

		this.addDomainEvent({
			type: "ORDER_CREATED",
			timestamp: new Date(),
			aggregateId: this.getId(),
			aggregateType: "Order",
			data: {
				orderId: this.getId(),
				customerId: this.getCustomerId(),
				items: this.getItems(),
				totalAmount: this.calculateTotal(),
				currency: "COP",
			},
		});
	}

	public transitionTo(newStatus: OrderStatus): void {
		if (this.status === newStatus) return;
		const allowedTransitions = ORDER_STATE_TRANSITIONS[this.status];

		if (!allowedTransitions.includes(newStatus)) {
			throw new Error(`CANNOT_TRASITION_FROM_${this.status}_TO_${newStatus}`);
		}

		this.setStatus(newStatus);
		this.addSpecificEvents(newStatus, this.getCancellationReasons());
	}

	private addSpecificEvents(
		newStatus: OrderStatus,
		cancellationReasons?: CancellationReason[]
	): void {
		if (newStatus === OrderStatus.CONFIRMED) {
			this.addDomainEvent({
				type: "ORDER_CONFIRMED",
				timestamp: new Date(),
				aggregateId: this.getId(),
				aggregateType: "Order",
				data: {
					orderId: this.getId(),
					confirmedAt: new Date(),
					customerId: "alejandro:id",
					totalAmount: this.calculateTotal(),
				},
			});
		}

		if (newStatus === OrderStatus.COMPLETED) {
			this.addDomainEvent({
				type: "ORDER_COMPLETED",
				timestamp: new Date(),
				aggregateId: this.getId(),
				aggregateType: "Order",
				data: {
					orderId: this.getId(),
					completedAt: new Date(),
					deliveryDetails: { "acomodar esto": { reason: "acomodar esto" } },
				},
			});
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
