import type { MessagingService } from "@application/ports/MessagingService";
import type { OrderService } from "@application/services/OrderService";
import { InventoryEventConsumer } from "./InventoryEventConsumer";
import { PaymentEventConsumer } from "./PaymentEventConsumer";

export class EventConsumerRegistry {
	constructor(
		private messagingService: MessagingService,
		private orderService: OrderService
	) {}

	public async initializeAllConsumers(): Promise<void> {
		// Inicializamos consumidores y sus listeners
		new InventoryEventConsumer(this.messagingService, this.orderService);
		new PaymentEventConsumer(this.messagingService, this.orderService);
	}
}
