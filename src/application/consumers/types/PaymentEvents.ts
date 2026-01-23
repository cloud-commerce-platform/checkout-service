import { CancellationReason } from "@alejotamayo28/event-contracts";

export interface PaymentCheckingConfirmedEvent {
	type: "PAYMENT_COMPLETED";
	orderId: string;
}
export interface PaymentCheckingFailedEvent {
	type: "PAYMENT_FAILED";
	orderId: string;
  reason: CancellationReason
}

export type IncomingPaymentEvent =
	| PaymentCheckingFailedEvent
	| PaymentCheckingConfirmedEvent;
