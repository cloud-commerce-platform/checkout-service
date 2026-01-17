import type { OrderDomainEvent } from "../events/OrderDomainEvents";
import Entity from "./Entity";

export interface OrderItems {
	id: string;
	price: number;
	quantity: number;
	totalAmount: number;
}

// to-do: piensa esto mejor
export enum OrderStatus {
	PENDING = "PENDING",
	CONFIRMED = "CONFIRMED",
	COMPLETED = "COMPLETED",
	CANCELLED = "CANCELLED",
}

// to-do: tiene potencial a mejorar, me da pereza xd
export const ORDER_STATE_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
	[OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
	[OrderStatus.CONFIRMED]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],

	[OrderStatus.COMPLETED]: [],
	[OrderStatus.CANCELLED]: [],
};

export enum CancellationReason {
	PAYMENT_FAILED = "PAYMENT_FAILED",
	OUT_OF_STOCK = "OUT_OF_STOCK",
	INVENTORY_UNAVAILABLE = "INVENTORY_UNAVAILABLE",
	SYSTEM_ERROR = "SYSTEM_ERROR",
	ITEMS_NOT_FOUND = "ITEMS_NOT_FOUND",
}

export class Order extends Entity<OrderDomainEvent> {
	static loadOrder(
		id: string,
		customerId: string,
		items: OrderItems[],
		status: OrderStatus
	): Order {
		const order = new Order(customerId, items);
		order.setId(id);
		order.setWasUpdated(false);

		order.status = status;
		order.clearDomainEvents();
		return order;
	}

	private customerId: string;
	private items: OrderItems[];
	private status: OrderStatus;
	private wasUpdated: boolean;

	constructor(customerId: string, items: OrderItems[]) {
		super();
		this.customerId = customerId;
		this.items = items;
		this.status = OrderStatus.PENDING;
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

	public transitionTo(
		newStatus: OrderStatus,
		details?: { reason?: string; cancelationReason?: CancellationReason }
	): void {
		const allowedTransitions = ORDER_STATE_TRANSITIONS[this.status];

		if (!allowedTransitions.includes(newStatus)) {
			throw new Error(`CANNOT_TRASITION_FROM_${this.status}_TO_${newStatus}`);
		}

		const previousStatus = this.status;
		this.setStatus(newStatus);

		this.addSpecificEvents(newStatus, previousStatus, details);
	}

	//CAMBIAR oldStatus
	private addSpecificEvents(
		newStatus: OrderStatus,
		_: OrderStatus,
		details?: { reason?: string; cancelationReason?: CancellationReason }
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

		if (
			newStatus === OrderStatus.CANCELLED &&
			details?.cancelationReason === CancellationReason.PAYMENT_FAILED
		) {
			this.addDomainEvent({
				type: "ORDER_PAYMENT_VERIFICATION_FAILED",
				timestamp: new Date(),
				aggregateId: this.getId(),
				aggregateType: "Order",
				data: {
					orderId: this.getId(),
					reason: CancellationReason.PAYMENT_FAILED,
					details: details.reason ?? "Tarjeta declinada por fondos insuficientes",
				},
			});
		}
		/*
        if (
          newStatus === OrderStatus.CANCELLED &&
          details?.cancelationReason === CancellationReason.INVENTORY_UNAVAILABLE
        ) {
          this.addDomainEvent({
            type: "ORDER_INVENTORY_RESERVATION_FAILED",
            timestamp: new Date(),
            aggregateId: this.getId(),
            aggregateType: "Order",
            data: {
              orderId: this.getId(),
              reason: CancellationReason.INVENTORY_UNAVAILABLE,
              unavailableItems: [{ itemId: "" }],
            },
          });
        }
    
        if (
          newStatus === OrderStatus.CANCELLED &&
          details?.cancelationReason === CancellationReason.OUT_OF_STOCK
        ) {
          this.addDomainEvent({
            type: "ORDER_INVENTORY_RESERVATION_FAILED",
            timestamp: new Date(),
            aggregateId: this.getId(),
            aggregateType: "Order",
            data: {
              orderId: this.getId(),
              reason: "OUT_OF_STOCK",
              unavailableItems: this.getItems().map((item) => ({ itemId: item.id })),
            },
          });
        }
        */
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

	public setStatus(newStatus: OrderStatus) {
		this.status = newStatus;

		this.wasUpdated = true;
	}

	public setWasUpdated(wasUpdated: boolean) {
		this.wasUpdated = wasUpdated;
	}
}
