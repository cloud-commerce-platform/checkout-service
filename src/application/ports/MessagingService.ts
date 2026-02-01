export interface MessagingService {
	publish(exchange: string, routingKey: string, message: any): Promise<void>;
	subscribe(
		exchange: string,
		queue: string,
		routingKeys: string[],
		handler: (message: any) => void
	): void;

	// Infrastructure management
	assertExchange(
		exchange: string,
		type: string,
		options?: { durable?: boolean; arguments?: Record<string, any> }
	): Promise<void>;
	assertQueue(
		queue: string,
		options?: { durable?: boolean; arguments?: Record<string, any> }
	): Promise<void>;
	bindQueue(queue: string, exchange: string, routingKey: string): Promise<void>;
	prefetch(count: number): Promise<void>;
	consume<T>(queue: string, handler: (msg: any) => Promise<void>): Promise<void>;
	ack(message: any): void;
	nack(message: any, allUpTo?: boolean, requeue?: boolean): void;
}
