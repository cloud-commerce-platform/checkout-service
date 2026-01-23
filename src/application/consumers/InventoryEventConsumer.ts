import type { IncomingIntegrationEvent } from "@/infrastructure/events/IntegrationEvents";
import { BaseEventConsumer } from "./BaseEventConsumer";
import type {
	IncomingInventoryEvent,
	InventoryReservationConfirmedEvent,
	InventoryReservationFailedEvent,
} from "./types/InventoryEvents";

export class InventoryEventConsumer extends BaseEventConsumer {
	protected setupEventListeners(): void {
		const { exchange, queue, routingKey } = this.setUpEventConfig(
			"inventory_events",
			"order_service_inventory_queue",
			["inventory.reservation.response"]
		);

		this.messagingService.subscribe(
			exchange,
			queue,
			routingKey,
			async (message: IncomingIntegrationEvent<IncomingInventoryEvent>) => {
				try {
					switch (message.eventType) {
						case "INVENTORY_RESERVED":
							await this.handleReservationConfirmed(
								message as IncomingIntegrationEvent<InventoryReservationConfirmedEvent>
							);
							break;

						case "INVENTORY_UNAVAILABLE":
							await this.handleReservationFailed(
								message as IncomingIntegrationEvent<InventoryReservationFailedEvent>
							);
							break;

						default:
							throw new Error(`UNKOWN_EVENT_TYPE:${message.eventType}`);
					}
				} catch (error) {
					console.error("Error processing inventory event:", error);
				}
			}
		);
	}

	private async handleReservationConfirmed(
		message: IncomingIntegrationEvent<InventoryReservationConfirmedEvent>
	): Promise<void> {
		await this.orderService.updateOrderCheck<InventoryReservationConfirmedEvent>(
			message,
			"inventoryCheck",
			"completed"
		);
	}

	private async handleReservationFailed(
		message: IncomingIntegrationEvent<InventoryReservationFailedEvent>
	): Promise<void> {
		await this.orderService.updateOrderCheck(message, "inventoryCheck", "failed");
	}
}
