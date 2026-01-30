export interface MessagingService {
	publish(exchange: string, routingKey: string, message: any): Promise<void>;
	subscribe(
		exchange: string,
		queue: string,
		routingKeys: string[],
		handler: (message: any) => void
	): void;
}
