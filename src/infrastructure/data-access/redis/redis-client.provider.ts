import dotenv from "dotenv";
import { createClient, type RedisClientType } from "redis";

dotenv.config();

export class RedisClientProvider {
	private static client: RedisClientType;

	static async getClient(): Promise<RedisClientType> {
		if (!RedisClientProvider.client) {
			RedisClientProvider.client = createClient({
				socket: {
					host: process.env.REDIS_HOST,
					port: 6379,
				},
			});

			RedisClientProvider.client.on("error", (err) => {
				console.error("Redis Client Error:", err);
			});

			await RedisClientProvider.client.connect();
		}

		return RedisClientProvider.client;
	}
}
