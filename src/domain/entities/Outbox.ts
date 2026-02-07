import type { DomainEvent } from "@alejotamayo28/event-contracts";
import Entity from "./Entity";

export class Outbox extends Entity<DomainEvent> {
	static loadOutboxEvent(
		eventId: string,
		eventType: string,
		payload: any,
		correlationId: string | undefined,
		version: number,
		occurredAt: Date,
		exchange: string,
		routingKey: string,
		source: string,
		retryCount: number,
		error: string | null,
		createdAt: Date,
		processedAt: Date | null
	): Outbox {
		const outbox = new Outbox(
			eventType,
			payload,
			correlationId,
			version,
			occurredAt,
			exchange,
			routingKey,
			source
		);
		outbox.setId(eventId);
		outbox.setWasUpdated(false);
		outbox.retryCount = retryCount;
		outbox.error = error;
		outbox.createdAt = createdAt;
		outbox.processedAt = processedAt;
		return outbox;
	}

	private eventType: string;
	private payload: unknown;
	private correlationId?: string;
	private version: number;
	private occurredAt: Date;
	private exchange: string;
	private routingKey: string;
	private source: string;
	private retryCount: number;
	private error: string | null;
	private createdAt: Date;
	private processedAt: Date | null;
	private wasUpdated: boolean;

	constructor(
		eventType: string,
		payload: unknown,
		correlationId: string | undefined,
		version: number,
		occurredAt: Date,
		exchange: string,
		routingKey: string,
		source: string
	) {
		super();
		this.eventType = eventType;
		this.payload = payload;
		this.correlationId = correlationId;
		this.version = version;
		this.occurredAt = occurredAt;
		this.exchange = exchange;
		this.routingKey = routingKey;
		this.source = source;
		this.retryCount = 0;
		this.error = null;
		this.createdAt = new Date();
		this.processedAt = null;
		this.wasUpdated = true;
	}

	public getEventId(): string {
		return this.getId();
	}

	public getEventType(): string {
		return this.eventType;
	}

	public getPayload(): unknown {
		return this.payload;
	}

	public getCorrelationId(): string | undefined {
		return this.correlationId;
	}

	public getVersion(): number {
		return this.version;
	}

	public getOccurredAt(): Date {
		return this.occurredAt;
	}

	public getExchange(): string {
		return this.exchange;
	}

	public getRoutingKey(): string {
		return this.routingKey;
	}

	public getSource(): string {
		return this.source;
	}

	public getRetryCount(): number {
		return this.retryCount;
	}

	public getError(): string | null {
		return this.error;
	}

	public getCreatedAt(): Date {
		return this.createdAt;
	}

	public getProcessedAt(): Date | null {
		return this.processedAt;
	}

	public getWasUpdated(): boolean {
		return this.wasUpdated;
	}

	public setWasUpdated(wasUpdated: boolean): void {
		this.wasUpdated = wasUpdated;
	}

	public isPending(): boolean {
		return this.processedAt === null && this.retryCount < 5;
	}

	public markAsProcessed(): void {
		this.processedAt = new Date();
		this.wasUpdated = true;
	}

	public incrementRetry(errorMessage?: string): void {
		this.retryCount++;
		if (errorMessage) {
			this.error = errorMessage;
		}
		this.wasUpdated = true;
	}
}
