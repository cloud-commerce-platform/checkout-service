import { v4 as uuidv4 } from "uuid";

export interface RawEvent {
	eventId?: string;
	eventType: string;
	payload: {
		orderId: string;
		[key: string]: any;
	};
	correlationId?: string;
	occurredAt: string;
}

export interface NormalizedEvent {
	eventId: string;
	orderId: string;
	eventType: string;
	originalEvent: RawEvent;
	occurredAt: Date;
}

export class EventNormalizationService {
	normalize(event: RawEvent): NormalizedEvent {
		return {
			eventId: uuidv4(),
			orderId: event.payload.orderId,
			eventType: event.eventType,
			originalEvent: event,
			occurredAt: new Date(),
		};
	}
}
