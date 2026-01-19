import type { MessagingService } from "@application/ports/MessagingService";
import * as amqp from "amqplib";
import { rabbitmqConfig } from "../config/config";

export class RabbitMQMessagingService implements MessagingService {
	private connection: amqp.Connection | null = null;
	private channel: amqp.Channel | null = null;

	constructor() {}

	public isConnected(): boolean {
		return this.connection !== null && this.channel !== null;
	}

	public getChannel(): amqp.Channel | null {
		return this.channel;
	}

	async connect() {
		try {
			this.connection = await amqp.connect(rabbitmqConfig.url!);
			this.channel = await this.connection.createChannel();
			console.log("Connected to RabbitMQ");
		} catch (error) {
			console.error("Failed to connect to RabbitMQ", error);
		}
	}

	async publish<T = any>(
		exchange: string,
		routingKey: string,
		message: T
	): Promise<void> {
		if (!this.channel) {
			throw new Error("RabbitMQ channel is not available.");
		}
		try {
			await this.channel.assertExchange(exchange, "topic", { durable: false });
			console.log(
				"RabbitMQ. Evento publicado:",
				JSON.stringify(
					{
						exchange,
						routingKey,
						message,
					},
					null,
					2
				)
			);

			this.channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(message)));
		} catch (error) {
			console.error("ERROR_PUBLISHING_EVENT", {
				to_exchange: exchange,
				to_routingKey: routingKey,
				error,
			});
		}
	}

	async subscribe<T = any>(
		exchange: string,
		queue: string,
		routingKey: string,
		handler: (message: T) => void
	): Promise<void> {
		if (!this.channel) {
			throw new Error("RabbitMQ channel is not available.");
		}
		await this.channel.assertExchange(exchange, "topic", { durable: false });
		await this.channel.assertQueue(queue, { durable: false });

		await this.channel.bindQueue(queue, exchange, routingKey);

		this.channel.consume(queue, (msg) => {
			if (msg) {
				try {
					const content = JSON.parse(msg.content.toString());
					console.log(
						"RabbitMQ. Evento recibido:",
						JSON.stringify(
							{
								exchange,
								routingKey,
								content,
							},
							null,
							2
						)
					);
					handler(content);
					this.channel?.ack(msg);
				} catch (error) {
					console.error("ERROR_PROCESING_EVENT:", {
						from_exchange: exchange,
						from_routingKey: routingKey,
						error,
					});
					this.channel?.nack(msg, false, false);
				}
			}
		});
	}
}
