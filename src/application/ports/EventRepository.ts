import type { Event } from "@/domain/entities/Event";
import type { Order } from "@/domain/entities/Order";

export interface EventRepository {
	append(order: Order, expectedVersion: number): Promise<void>;
	save(event: Event): Promise<void>;
	saveMany(events: Event[]): Promise<void>;
	getByAggregateId(aggregateId: string): Promise<Event[]>;
	getLastVersion(aggregateId: string): Promise<Event | null>;
	exists(aggregateId: string): Promise<boolean>;
}
