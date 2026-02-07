import type { RetryManager, RetryResult } from "@application/ports/RetryManager";

const MAX_RETRIES = 3;
const RETRY_TTL_SECONDS = 3600;

export class RedisRetryManager implements RetryManager {
	constructor(private redisClient: any) {}

	async shouldRetry(orderId: string, eventType: string): Promise<RetryResult> {
		const retryKey = `retry:${orderId}:${eventType}`;
		const retryData = await this.redisClient.get(retryKey);
		const retryCount = retryData ? JSON.parse(retryData).count : 0;

		return {
			shouldRetry: retryCount < MAX_RETRIES,
			retryCount,
		};
	}

	async incrementRetry(orderId: string, eventType: string): Promise<number> {
		const retryKey = `retry:${orderId}:${eventType}`;
		const retryData = await this.redisClient.get(retryKey);
		const currentRetry = retryData ? JSON.parse(retryData).count : 0;
		const newRetryCount = currentRetry + 1;

		await this.redisClient.setEx(
			retryKey,
			RETRY_TTL_SECONDS,
			JSON.stringify({
				count: newRetryCount,
				lastAttempt: new Date(),
			})
		);

		return newRetryCount;
	}

	async clearRetry(orderId: string, eventType: string): Promise<void> {
		const retryKey = `retry:${orderId}:${eventType}`;
		await this.redisClient.del(retryKey);
	}
}
