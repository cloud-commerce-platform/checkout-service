import type { Order } from "@/domain/entities/Order";
import type {
	IncomingEvents,
	IncomingIntegrationEvent,
} from "@/infrastructure/events/IntegrationEvents";
import type { OrderCheckRepository } from "../ports/OrderCheckRepository";

export class UpdateOrderStatusUseCase {
	constructor(private readonly orderCheckRepository: OrderCheckRepository) {}

	async execute<T extends IncomingEvents>(
		eventMessage: IncomingIntegrationEvent<T>,
		order: Order
	): Promise<void> {
		const { payload } = eventMessage;

		switch (payload.type) {
			case "INVENTORY_RESERVATION_COMPLETED":
				break;

			case "PAYMENT_DEDUCTION_COMPLETED":
				break;

			case "INVENTORY_RESERVATION_FAILED":
				await this.orderCheckRepository.updateInventoryReason(
					order.getId(),
					payload.reason
				);
				break;

			case "PAYMENT_DEDUCTION_FAILED":
				await this.orderCheckRepository.updatePaymentReason(
					order.getId(),
					payload.reason
				);
				break;
		}
	}
}
