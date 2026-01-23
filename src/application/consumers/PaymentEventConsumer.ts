import type { IncomingIntegrationEvent } from "@/infrastructure/events/IntegrationEvents";
import { BaseEventConsumer } from "./BaseEventConsumer";
import type {
	IncomingPaymentEvent,
	PaymentCheckingConfirmedEvent,
	PaymentCheckingFailedEvent,
} from "./types/PaymentEvents";

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
			async (message: IncomingIntegrationEvent<IncomingPaymentEvent>) => {
				try {
					switch (message.eventType) {
						case "PAYMENT_VERIFIED":
							await this.handlePaymentVerified(
								message as IncomingIntegrationEvent<PaymentCheckingConfirmedEvent>
							);
							break;

						case "PAYMENT_FAILED":
							await this.handlePaymentFailed(
								message as IncomingIntegrationEvent<PaymentCheckingFailedEvent>
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
		message: IncomingIntegrationEvent<PaymentCheckingConfirmedEvent>
	): Promise<void> {
		await this.orderService.updateOrderCheck(message, "paymentCheck", "completed");
	}

	private async handlePaymentFailed(
		message: IncomingIntegrationEvent<PaymentCheckingFailedEvent>
	): Promise<void> {
		await this.orderService.updateOrderCheck(message, "paymentCheck", "failed");
	}
}
