import { OrderRepository } from "@/domain/repositories/OrderRepository";
import { OrderCheckRepository } from "../ports/OrderCheckRepository";
import { DomainEventDispatcher } from "../ports/DomainEventDispatcher";
import { TransactionManager } from "../ports/TransactionManager";
import {
	IncomingEvents,
	IncomingIntegrationEvent,
} from "@/infrastructure/events/IntegrationEvents";
import { OrderDomainEvent, OrderStatus } from "@alejotamayo28/event-contracts";
import { Order } from "@/domain/entities/Order";
import { UpdateOrderStatusUseCase } from "../use-cases/UpdateOrderStatusUseCase";

export type PaymentStatus = "pending" | "approved" | "rejected";
export type InventoryStatus = "pending" | "reserved" | "unavailable";

interface OrderCheckState {
	payment: PaymentStatus;
	inventory: InventoryStatus;
	createdAt: number;
}

export class OrderProcessManager {
	private static readonly ORDER_TIMEOUT_MS = 60_000;

	constructor(
		private readonly orderRepository: OrderRepository,
		private readonly orderCheckRepository: OrderCheckRepository,
		private readonly domainEventDispatcher: DomainEventDispatcher,
		private readonly transactionManager: TransactionManager,
		private readonly updateOrderStatus: UpdateOrderStatusUseCase
	) {}

	public async handle<T extends IncomingEvents>(
		eventMessage: IncomingIntegrationEvent<T>,
		checkType: "paymentCheck" | "inventoryCheck",
		status: "pending" | "completed" | "failed"
	): Promise<void> {
		await this.updateChecks(eventMessage, checkType, status);
		await this.evaluateOrder<T>(eventMessage);
	}

	private async updateChecks<T extends IncomingEvents>(
		eventMessage: IncomingIntegrationEvent<T>,
		checkType: "paymentCheck" | "inventoryCheck",
		status: "pending" | "completed" | "failed"
	): Promise<void> {
		const { payload } = eventMessage;
		const orderId = payload.orderId;

		if (checkType === "paymentCheck") {
			const paymentStatus =
				status === "completed"
					? "approved"
					: status === "failed"
						? "rejected"
						: "pending";
			await this.orderCheckRepository.updatePaymentCheck(orderId, paymentStatus);
		} else {
			const inventoryStatus =
				status === "completed"
					? "reserved"
					: status === "failed"
						? "unavailable"
						: "pending";
			await this.orderCheckRepository.updateInventoryCheck(orderId, inventoryStatus);
		}
	}

	private async evaluateOrder<T extends IncomingEvents>(
		eventMessage: IncomingIntegrationEvent<T>
	): Promise<void> {
		const orderId = eventMessage.payload.orderId;
		const state = await this.orderCheckRepository.get(orderId);
		if (!state) return;

		const { payment: paymentStatus, inventory: inventoryStatus } = state;

		await this.transactionManager.runInTransaction(async () => {
			const order = await this.orderRepository.findById(orderId);
			if (!order) return;

			await this.updateOrderStatus.execute(eventMessage, order);

			if (paymentStatus === "pending" || inventoryStatus === "pending") {
				if (this.isOrderStale(state)) {
					await this.handleTimeout(orderId, state);
					return;
				}
				await this.orderRepository.update(order);
				return;
			}

			switch (true) {
				case paymentStatus === "approved" && inventoryStatus === "reserved":
					order.transitionTo(OrderStatus.CONFIRMED);
					await this.orderRepository.update(order);
					break;

				case paymentStatus === "rejected" && inventoryStatus === "reserved":
					order.transitionTo(OrderStatus.CANCELLED);
					await this.handleRollback(order, paymentStatus, inventoryStatus);
					break;

				case paymentStatus === "approved" && inventoryStatus === "unavailable":
					order.transitionTo(OrderStatus.CANCELLED);
					await this.handleRollback(order, paymentStatus, inventoryStatus);
					break;

				case paymentStatus === "rejected" && inventoryStatus === "unavailable":
					order.transitionTo(OrderStatus.CANCELLED);
					break;
			}

			await this.persistAndDispatch(order);
		});
	}

	private async handleRollback(
		order: Order,
		payment: PaymentStatus,
		inventory: InventoryStatus
	): Promise<void> {
		const compensationEvents: OrderDomainEvent[] = [];

		if (order.needsPaymentRollback(payment, inventory)) {
			compensationEvents.push({
				type: "ORDER_PAYMENT_ROLLBACK_REQUESTED",
				timestamp: new Date(),
				aggregateId: order.getId(),
				aggregateType: "Order",
				data: { orderId: order.getId() },
			});
		}

		if (order.needsInventoryRollback(payment, inventory)) {
			compensationEvents.push({
				type: "ORDER_INVENTORY_ROLLBACK_REQUESTED",
				timestamp: new Date(),
				aggregateId: order.getId(),
				aggregateType: "Order",
				data: { orderId: order.getId() },
			});
		}

		if (compensationEvents.length > 0) {
			await this.domainEventDispatcher.dispatch(compensationEvents);
		}
	}
	private async handleTimeout(orderId: string, state: OrderCheckState): Promise<void> {
		const finalPayment: PaymentStatus =
			state.payment === "pending" ? "rejected" : state.payment;

		const finalInventory: InventoryStatus =
			state.inventory === "pending" ? "unavailable" : state.inventory;

		await this.orderCheckRepository.updatePaymentCheck(orderId, finalPayment);
		await this.orderCheckRepository.updateInventoryCheck(orderId, finalInventory);

		await this.evaluateOrder({
			payload: { orderId, type: "TIMEOUT" },
		} as any);
	}

	private isOrderStale(state: OrderCheckState): boolean {
		return Date.now() - state.createdAt >= OrderProcessManager.ORDER_TIMEOUT_MS;
	}

	private async persistAndDispatch(order: Order): Promise<void> {
		if (order.getWasUpdated()) {
			await this.orderRepository.update(order);
		}

		if (order.hasPendingEvents()) {
			await this.domainEventDispatcher.dispatch(order.getDomainEvents());
			order.clearDomainEvents();
		}
	}
}
