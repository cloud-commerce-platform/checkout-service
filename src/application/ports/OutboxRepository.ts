import type { Outbox } from "@/domain/entities/Outbox";

export interface OutboxRepository {
	getPending(limit: number): Promise<Outbox[]>;
	save(outbox: Outbox): Promise<void>;
	saveMany(outboxes: Outbox[]): Promise<void>;
}
