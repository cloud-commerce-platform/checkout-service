export interface RetryResult {
	shouldRetry: boolean;
	retryCount: number;
}

export interface RetryManager {
	shouldRetry(orderId: string, eventType: string): Promise<RetryResult>;
	incrementRetry(orderId: string, eventType: string): Promise<number>;
	clearRetry(orderId: string, eventType: string): Promise<void>;
}
