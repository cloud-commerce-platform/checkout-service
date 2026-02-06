import type { MessagingService } from "@application/ports/MessagingService";

export class EventRouterSetup {
	constructor(private messagingService: MessagingService) {}

	async initialize(): Promise<void> {
		await this.setupOrderProcessingExchange();
		await this.setupDeadLetterExchange();
		await this.setupPaymentEventsSubscription();
		await this.setupInventoryEventsSubscription();
	}

	private async setupOrderProcessingExchange(): Promise<void> {
		await this.messagingService.assertExchange("order_processing", "x-consistent-hash", {
			durable: true,
		});
	}

	private async setupDeadLetterExchange(): Promise<void> {
		await this.messagingService.assertExchange("order_processing.dlq", "topic", {
			durable: true,
		});

		await this.messagingService.assertQueue("worker_queue", {
			durable: true,
			arguments: {
				"x-dead-letter-exchange": "order_processing.dlq",
				"x-dead-letter-routing-key": "worker.dlq",
			},
		});

		await this.messagingService.assertQueue("worker_dlq", { durable: true });

		await this.messagingService.bindQueue("worker_queue", "order_processing", "1");
		await this.messagingService.bindQueue(
			"worker_dlq",
			"order_processing.dlq",
			"worker.dlq"
		);
	}

	private async setupPaymentEventsSubscription(): Promise<void> {
		await this.messagingService.assertExchange("payment_events", "topic", {
			durable: false,
		});

		await this.messagingService.assertQueue("event_router_payment_queue", {
			durable: false,
		});

		await this.messagingService.bindQueue(
			"event_router_payment_queue",
			"payment_events",
			"payment.verification.verified"
		);

		await this.messagingService.bindQueue(
			"event_router_payment_queue",
			"payment_events",
			"payment.verification.failed"
		);
	}

	private async setupInventoryEventsSubscription(): Promise<void> {
		await this.messagingService.assertExchange("inventory_events", "topic", {
			durable: false,
		});

		await this.messagingService.assertQueue("event_router_inventory_queue", {
			durable: false,
		});

		await this.messagingService.bindQueue(
			"event_router_inventory_queue",
			"inventory_events",
			"inventory.reservation.response"
		);
	}
}
