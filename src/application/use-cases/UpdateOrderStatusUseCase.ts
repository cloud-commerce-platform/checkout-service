import { type Order, OrderStatus } from "@/domain/entities/Order";
import type { OrderRepository } from "@/domain/repositories/OrderRepository";
import type {
  IncomingEvents,
  IncomingIntegrationEvent,
} from "@/infrastructure/events/IntegrationEvents";

export class UpdateOrderStatusUseCase {
  constructor(private readonly orderRepository: OrderRepository) { }

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
        order.markInventoryAsFailed(payload.reason);
        break;

      case "PAYMENT_DEDUCTION_FAILED":
        order.markPaymentAsFailed(payload.reason);
        break;
    }
  }
}
