import type { DuplicateChecker } from "@application/ports/DuplicateChecker";
import type { RedisClientType } from "redis";

const DEDUPLICATION_TTL_SECONDS = 1800;

export class RedisDuplicateChecker implements DuplicateChecker {
	constructor(private redisClient: RedisClientType) {}

	async isDuplicate(eventId: string): Promise<boolean> {
		const exists = await this.redisClient.get(`dedup:${eventId}`);
		return exists !== null;
	}

	async markAsProcessed(eventId: string): Promise<void> {
		await this.redisClient.setEx(`dedup:${eventId}`, DEDUPLICATION_TTL_SECONDS, "1");
	}
}
