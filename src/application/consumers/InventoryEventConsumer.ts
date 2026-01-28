import type {
	InventoryDomainEvent,
	InventoryReservedEvent,
	InventoryUnavailableEvent,
} from "@alejotamayo28/event-contracts";
import type { IncomingIntegrationEvent } from "@/infrastructure/events/IntegrationEvents";
import { BaseEventConsumer } from "./BaseEventConsumer";

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
			async (message: IncomingIntegrationEvent<InventoryDomainEvent>) => {
				try {
					switch (message.eventType as InventoryDomainEvent["type"]) {
						case "INVENTORY_RESERVED":
							await this.handleReservationConfirmed(
								message as IncomingIntegrationEvent<InventoryReservedEvent>
							);
							break;

						case "INVENTORY_UNAVAILABLE":
							await this.handleReservationFailed(
								message as IncomingIntegrationEvent<InventoryUnavailableEvent>
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
		message: IncomingIntegrationEvent<InventoryReservedEvent>
	): Promise<void> {
		await this.orderService.handleIntegrationEvent<InventoryReservedEvent>(
			message,
			"inventoryCheck",
			"completed"
		);
	}

	private async handleReservationFailed(
		message: IncomingIntegrationEvent<InventoryUnavailableEvent>
	): Promise<void> {
		await this.orderService.handleIntegrationEvent(message, "inventoryCheck", "failed");
	}
}
