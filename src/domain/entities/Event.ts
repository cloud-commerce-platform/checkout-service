import Entity from "./Entity";

export class Event extends Entity<any> {
	static loadEvent(
		id: string,
		aggregateId: string,
		aggregateType: string,
		eventType: string,
		payload: any,
		version: number
	): Event {
		const event = new Event(aggregateId, aggregateType, eventType, payload);
		event.setId(id);
		event.setWasUpdated(false);
		event.setVersion(version);

		return event;
	}

	private aggregateId: string;
	private aggregateType: string;
	private eventType: string;
	private payload: any;
	private version?: number;
	private wasUpdated: boolean;

	constructor(
		aggregateId: string,
		aggregateType: string,
		eventType: string,
		payload: any
	) {
		super();
		this.aggregateId = aggregateId;
		this.aggregateType = aggregateType;
		this.eventType = eventType;
		this.payload = payload;
		this.wasUpdated = true;
	}

	getAggregateId(): string {
		return this.aggregateId;
	}

	getAggregateType(): string {
		return this.aggregateType;
	}

	getEventType(): string {
		return this.eventType;
	}

	getPayload(): any {
		return this.payload;
	}

	getVersion(): number {
		if (this.version === undefined) {
			throw new Error("EVENT_VERSION_NOT_ASSIGNED");
		}
		return this.version;
	}

	public getWasUpdated(): boolean {
		return this.wasUpdated;
	}

	public setWasUpdated(wasUpdated: boolean) {
		this.wasUpdated = wasUpdated;
	}

	public setVersion(version: number) {
		if (this.version !== undefined) {
			throw new Error("EVENT_VERSION_ALREADY_ASSIGN");
		}
		this.version = version;
	}
}
