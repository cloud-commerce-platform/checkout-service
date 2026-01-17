export interface PaymentCheckingConfirmedEvent {
	type: "PAYMENT_CHECKING_COMPLETED";
	orderId: string;
}
export interface PaymentCheckingFailedEvent {
	type: "PAYMENT_CHECKING_FAILED";
	orderId: string;
}

export type IncomingPaymentEvent =
	| PaymentCheckingFailedEvent
	| PaymentCheckingConfirmedEvent;
