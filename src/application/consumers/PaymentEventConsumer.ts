import type {
	PaymentDeductedCompletedEvent,
	PaymentDeductedFailedEvent,
	PaymentDomainEvent,
} from "@alejotamayo28/event-contracts";
import type { OrderProcessManager } from "@/application/order/OrderProcessManager";
import type { IncomingIntegrationEvent } from "@/infrastructure/events/IntegrationEvents";

export class PaymentEventConsumer {
	constructor(private readonly orderProcessManager: OrderProcessManager) {}

	async process(message: IncomingIntegrationEvent<PaymentDomainEvent>): Promise<void> {
		switch (message.eventType as PaymentDomainEvent["type"]) {
			case "PAYMENT_DEDUCTION_COMPLETED":
				await this.orderProcessManager.handlePaymentDeductedCompleted(
					message as IncomingIntegrationEvent<PaymentDeductedCompletedEvent>
				);
				break;

			case "PAYMENT_DEDUCTION_FAILED":
				await this.orderProcessManager.handlePaymentDeductedFailed(
					message as IncomingIntegrationEvent<PaymentDeductedFailedEvent>
				);
				break;

			default:
				throw new Error(`UNKNOWN_PAYMENT_EVENT_TYPE:${message.eventType}`);
		}
	}
}
