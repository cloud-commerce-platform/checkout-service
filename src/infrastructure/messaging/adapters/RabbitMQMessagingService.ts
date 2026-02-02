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

			this.connection.on("error", (err) => {
				console.error("RabbitMQ connection error:", err.message);
				this.cleanup();
			});

			this.connection.on("close", () => {
				console.warn("RabbitMQ connection closed");
				this.cleanup();
			});

			console.log("✅ Connected to RabbitMQ");
		} catch (error) {
			this.cleanup();
			console.error("❌ Failed to connect to RabbitMQ", error);
			throw error;
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
			this.channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(message)));
			console.log(`PUBLISHED_TO_${exchange}_WITH_ROUTING_KEY_${routingKey}`);
		} catch (error) {
			console.error("❌ ERROR_PUBLISHING_EVENT", {
				to_exchange: exchange,
				to_routingKey: routingKey,
				error: error instanceof Error ? error.message : "Unknown Error",
			});
			throw error;
		}
	}

	async subscribe<T = any>(
		exchange: string,
		queue: string,
		routingKeys: string[],
		handler: (message: T) => void
	): Promise<void> {
		if (!this.channel) {
			throw new Error("RabbitMQ channel is not available.");
		}
		await this.channel.assertExchange(exchange, "topic", { durable: false });
		await this.channel.assertQueue(queue, { durable: false });

		for (const routingKey of routingKeys) {
			await this.channel.bindQueue(queue, exchange, routingKey);
		}

		this.channel.consume(queue, (msg) => {
			if (msg) {
				try {
					const content = JSON.parse(msg.content.toString());
					handler(content);
					this.channel?.ack(msg);
				} catch (error) {
					console.error("❌ ERROR_PROCESSING_EVENT:", {
						from_exchange: exchange,
						from_routingKey: routingKeys,
						error: error instanceof Error ? error.message : "Unknown Error",
					});
					this.channel?.nack(msg, false, false);
				}
			}
		});
	}

	private cleanup() {
		this.channel = null;
		this.connection = null;
	}

	async assertExchange(
		exchange: string,
		type: string,
		options?: { durable?: boolean; arguments?: Record<string, any> }
	): Promise<void> {
		if (!this.channel) {
			throw new Error("RabbitMQ channel is not available.");
		}
		await this.channel.assertExchange(exchange, type, {
			durable: options?.durable ?? true,
			arguments: options?.arguments,
		});
	}

	async assertQueue(
		queue: string,
		options?: { durable?: boolean; arguments?: Record<string, any> }
	): Promise<void> {
		if (!this.channel) {
			throw new Error("RabbitMQ channel is not available.");
		}
		await this.channel.assertQueue(queue, {
			durable: options?.durable ?? true,
			arguments: options?.arguments,
		});
	}

	async bindQueue(queue: string, exchange: string, routingKey: string): Promise<void> {
		if (!this.channel) {
			throw new Error("RabbitMQ channel is not available.");
		}
		await this.channel.bindQueue(queue, exchange, routingKey);
	}

	async prefetch(count: number): Promise<void> {
		if (!this.channel) {
			throw new Error("RabbitMQ channel is not available.");
		}
		await this.channel.prefetch(count);
	}

	async consume<T>(queue: string, handler: (msg: any) => Promise<void>): Promise<void> {
		if (!this.channel) {
			throw new Error("RabbitMQ channel is not available.");
		}
		await this.channel.consume(queue, async (msg) => {
			if (msg) {
				try {
					const content = JSON.parse(msg.content.toString());
					await handler(content);
					this.channel?.ack(msg);
				} catch (error) {
					console.error("❌ Error processing message:", error);
					this.channel?.nack(msg, false, false);
				}
			}
		});
	}

	ack(message: any): void {
		if (!this.channel) {
			throw new Error("RabbitMQ channel is not available.");
		}
		this.channel.ack(message);
	}

	nack(message: any, allUpTo?: boolean, requeue?: boolean): void {
		if (!this.channel) {
			throw new Error("RabbitMQ channel is not available.");
		}
		this.channel.nack(message, allUpTo, requeue);
	}
}
