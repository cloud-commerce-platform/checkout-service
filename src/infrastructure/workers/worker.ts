import { WorkerDependencies } from "@application/services/dependencies/WorkerDependencies";
import type { MessageProcessingService } from "@application/services/MessageProcessingService";
import { createClient } from "redis";
import { RabbitMQMessagingService } from "../messaging/adapters/RabbitMQMessagingService";

const WORKER_PREFETCH = 1;

class OrderProcessingWorker {
	private messagingService!: RabbitMQMessagingService;
	private messageProcessingService!: MessageProcessingService;
	private redisClient!: ReturnType<typeof createClient>;

	async start(): Promise<void> {
		this.redisClient = createClient({
			url: process.env.REDIS_URL || "redis://localhost:6379",
		});
		await this.redisClient.connect();

		const deps = new WorkerDependencies(this.redisClient);
		this.messageProcessingService = deps.createMessageProcessingService();

		this.messagingService = new RabbitMQMessagingService();
		await this.messagingService.connect();
		await this.messagingService.prefetch(WORKER_PREFETCH);

		const channel = this.messagingService.getChannel();
		if (!channel) throw new Error("CHANNEL_NOT_AVAILABLE");

		await channel.consume("worker_queue", async (msg) => {
			if (!msg) return;

			try {
				const event = JSON.parse(msg.content.toString());
				const success = await this.messageProcessingService.process(event);

				if (success) {
					channel.ack(msg);
				} else {
					await this.sendToDLQ(event, "Processing failed");
					channel.nack(msg, false, false); // No requeue -> DLQ
				}
			} catch (error) {
				// Error retryable -> reencolar
				channel.nack(msg, false, true); // Requeue -> NACK
			}
		});

		process.on("SIGINT", async () => {
			console.log("CLOSING_WORKER");
			await this.redisClient.disconnect();
			process.exit(0);
		});
	}

	private async sendToDLQ(event: any, reason: string): Promise<void> {
		const dlqMessage = {
			...event,
			dlqInfo: {
				reason,
				timestamp: new Date().toISOString(),
				retryCount: 3,
			},
		};
		await this.messagingService.publish("order_processing.dlq", "worker.dlq", dlqMessage);
	}
}

const worker = new OrderProcessingWorker();
worker.start().catch((error) => {
	console.error("Error fatal:", error);
	process.exit(1);
});
