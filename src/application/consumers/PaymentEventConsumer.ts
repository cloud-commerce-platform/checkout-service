import type {
	PaymentDeductedCompletedEvent,
	PaymentDeductedFailedEvent,
	PaymentDomainEvent,
} from "@alejotamayo28/event-contracts";
import type { IncomingIntegrationEvent } from "@/infrastructure/events/IntegrationEvents";
import { BaseEventConsumer } from "./BaseEventConsumer";

export class PaymentEventConsumer extends BaseEventConsumer {
	protected setupEventListeners(): void {
		const { exchange, queue, routingKey } = this.setUpEventConfig(
			"payment_events",
			"order_service_payment_queue",
			["payment.verification.verified", "payment.verification.failed"]
		);

		this.messagingService.subscribe(
			exchange,
			queue,
			routingKey,
			async (message: IncomingIntegrationEvent<PaymentDomainEvent>) => {
				try {
					switch (message.eventType as PaymentDomainEvent["type"]) {
						case "PAYMENT_DEDUCTION_COMPLETED":
							await this.handlePaymentVerified(
								message as IncomingIntegrationEvent<PaymentDeductedCompletedEvent>
							);
							break;

						case "PAYMENT_DEDUCTION_FAILED":
							await this.handlePaymentFailed(
								message as IncomingIntegrationEvent<PaymentDeductedFailedEvent>
							);
							break;

						default:
							throw new Error(`UNKNOWN_EVENT_TYPE: ${message.eventType}`);
					}
				} catch (error) {
					console.error("Error processing payment event", error);
				}
			}
		);
	}

	private async handlePaymentVerified(
		message: IncomingIntegrationEvent<PaymentDeductedCompletedEvent>
	): Promise<void> {
		await this.orderService.handleIntegrationEvent(message, "paymentCheck", "completed");
	}

	private async handlePaymentFailed(
		message: IncomingIntegrationEvent<PaymentDeductedFailedEvent>
	): Promise<void> {
		await this.orderService.handleIntegrationEvent(message, "paymentCheck", "failed");
	}
}
