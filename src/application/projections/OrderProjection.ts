import type { Event } from "@/domain/entities/Event";
import type { Order } from "@/domain/entities/Order";
import type { OrderRepository } from "@/domain/repositories/OrderRepository";
import type { EventRepository } from "../ports/EventRepository";

export interface OrderState {
	orderId: string;
	customerId?: string;
	status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
	payment: "pending" | "approved" | "rejected";
	inventory: "pending" | "reserved" | "unavailable";
	paymentReason?: string | null;
	inventoryReason?: string | null;
	createdAt: Date;
	hasPending: boolean;
}

export class OrderProjection {
	constructor(
		private readonly eventRepository: EventRepository,
		private readonly orderRepository: OrderRepository
	) {}

	async reconstruct(orderId: string): Promise<OrderState | null> {
		const events = await this.eventRepository.getByAggregateId(orderId);

		if (!events || events.length === 0) {
			return null;
		}

		return this.applyEvents(events);
	}

	private applyEvents(events: Event[]): OrderState {
		const state: OrderState = {
			orderId: "",
			status: "PENDING",
			payment: "pending",
			inventory: "pending",
			paymentReason: null,
			inventoryReason: null,
			createdAt: new Date(),
			hasPending: true,
		};

		const sortedEvents = events.sort((a, b) => a.getVersion() - b.getVersion());

		for (const event of sortedEvents) {
			this.applyEvent(state, event);
		}

		state.hasPending = state.payment === "pending" || state.inventory === "pending";

		return state;
	}

	private applyEvent(state: OrderState, event: Event): void {
		const payload = event.getPayload();

		switch (event.getEventType()) {
			case "ORDER_CREATED":
				state.orderId = payload?.orderId || "";
				state.customerId = payload?.customerId;
				state.createdAt = new Date();
				break;

			case "ORDER_INVENTORY_RESERVATION_FAILED":
				state.inventory = "unavailable";
				state.inventoryReason = payload?.reason || null;
				break;

			case "ORDER_PAYMENT_VERIFICATION_FAILED":
				state.payment = "rejected";
				state.paymentReason = payload?.reason || null;
				break;

			case "ORDER_INVENTORY_RESERVATION_COMPLETED":
				state.inventory = "reserved";
				break;

			case "ORDER_PAYMENT_DEDUCTION_COMPLETED":
				state.payment = "approved";
				break;

			case "ORDER_CONFIRMED":
				state.status = "CONFIRMED";
				break;

			case "ORDER_CANCELLED":
				state.status = "CANCELLED";
				break;

			case "ORDER_COMPLETED":
				state.status = "COMPLETED";
				break;
		}
	}

	async update(order: Order): Promise<void> {
		if (order.getWasUpdated()) {
			await this.orderRepository.update(order);
		}
	}
}
