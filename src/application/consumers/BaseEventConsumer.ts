import type { MessagingService } from "@application/ports/MessagingService";
import type { OrderService } from "@application/services/OrderService";

interface boundEvent {
	exchange: string;
	queue: string;
	routingKey: string[];
}

export abstract class BaseEventConsumer {
	protected orderService: OrderService;

	constructor(
		protected messagingService: MessagingService,
		orderService: OrderService
	) {
		this.orderService = orderService;
		this.setupEventListeners();
	}

	protected setUpEventConfig(
		exchange: string,
		queue: string,
		routingKey: string[]
	): boundEvent {
		return {
			exchange,
			queue,
			routingKey,
		};
	}

	protected abstract setupEventListeners(): void;
}
