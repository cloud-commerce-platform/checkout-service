import type {
	InventoryDomainEvent,
	InventoryReservedEvent,
	InventoryRollbackCompletedEvent,
	InventoryRollbackFailedEvent,
	InventoryUnavailableEvent,
} from "@alejotamayo28/event-contracts";
import type { OrderProcessManager } from "@/application/order/OrderProcessManager";
import type { IncomingIntegrationEvent } from "@/infrastructure/events/IntegrationEvents";

export class InventoryEventConsumer {
	constructor(private readonly orderProcessManager: OrderProcessManager) {}

	async process(message: IncomingIntegrationEvent<InventoryDomainEvent>): Promise<void> {
		switch (message.eventType as InventoryDomainEvent["type"]) {
			case "INVENTORY_RESERVATION_COMPLETED":
				await this.orderProcessManager.handleInventoryReservationCompleted(
					message as IncomingIntegrationEvent<InventoryReservedEvent>
				);
				break;

			case "INVENTORY_RESERVATION_FAILED":
				await this.orderProcessManager.handleInventoryReservationFailed(
					message as IncomingIntegrationEvent<InventoryUnavailableEvent>
				);
				break;

			case "INVENTORY_ROLLBACK_COMPLETED":
				await this.orderProcessManager.handleInventoryRollbackCompleted(
					message as IncomingIntegrationEvent<InventoryRollbackCompletedEvent>
				);
				break;

			case "INVENTORY_ROLLBACK_FAILED":
				await this.handleInventoryRollbackFailed(
					message as IncomingIntegrationEvent<InventoryRollbackFailedEvent>
				);
				break;

			default:
				throw new Error(`UNKNOWN_INVENTORY_EVENT_TYPE:${message.eventType}`);
		}
	}

	private async handleInventoryRollbackFailed(
		message: IncomingIntegrationEvent<InventoryRollbackFailedEvent>
	): Promise<void> {
		// Por ahora, el rollback fallido no requiere acción especial
		// podríamos loggear o enviar alerta
		console.error(`INVENTORY_ROLLBACK_FAILED for order ${message.payload.orderId}:`);
	}
}
