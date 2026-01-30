import { ProcessOutboxUseCase } from "@/application/use-cases/ProcessOutboxUseCase";
import { pool } from "../data-access/postgres/config";
import { DbContext } from "../data-access/postgres/dbContext";
import { PostgreOutboxRepository } from "../data-access/postgres/repositories/PostgreOutboxRepository";
import { RabbitMQMessagingService } from "../messaging/adapters/RabbitMQMessagingService";

const INTERVAL_MS = 5_000;
const MAX_RETRIES = 15;
const RETRY_DELAY_MS = 5_000;

const messagingService = new RabbitMQMessagingService();
const useCase = new ProcessOutboxUseCase(new PostgreOutboxRepository(), messagingService);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectToRabbitMQ(): Promise<void> {
	let retries = 0;
	while (retries < MAX_RETRIES) {
		await messagingService.connect();
		if (messagingService.isConnected()) {
			console.log("✅ Outbox worker connected to RabbitMQ");
			return;
		}
		retries++;
		console.log(
			`⏳ Outbox worker retrying connection to RabbitMQ (attempt ${retries}/${MAX_RETRIES})`
		);
		await sleep(RETRY_DELAY_MS);
	}
	throw new Error("Could not connect to RabbitMQ after multiple attempts");
}

async function start() {
	await connectToRabbitMQ();

	while (true) {
		const client = await pool.connect();

		try {
			await DbContext.run(client, async () => {
				await useCase.execute();
			});
		} catch (err) {
			console.error("❌ Outbox worker error:", err);

			if (!messagingService.isConnected()) {
				console.log("🔄 Attempting to reconnect to RabbitMQ...");
				try {
					await connectToRabbitMQ();
				} catch (reconnectError) {
					console.error("Failed to reconnect:", reconnectError);
				}
			}
		} finally {
			client.release();
		}

		await sleep(INTERVAL_MS);
	}
}

start();
