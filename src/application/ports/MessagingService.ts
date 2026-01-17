// Acomdar esto, deberia ir separado
export interface MessagingService {
	publish(exchange: string, routingKey: string, message: any): Promise<void>;
	subscribe(
		exchange: string,
		queue: string,
		routingKey: string,
		handler: (message: any) => void
	): void;
}
