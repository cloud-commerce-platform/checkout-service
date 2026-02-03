import type { PoolClient } from "pg";
import type { EventRepository } from "@/application/ports/EventRepository";
import { Event } from "@/domain/entities/Event";
import type { Order } from "@/domain/entities/Order";
import type { EventDbStructure } from "@/infrastructure/data-access/postgres/bulkOperations";
import { saveStructures } from "../bulkOperations";
import { DbContext } from "../dbContext";

export class PostgreEventRepository implements EventRepository {
	static eventSql = `
		events.id AS events_id,
		events.aggregate_id AS events_aggregate_id,
		events.aggregate_type AS events_aggregate_type,
		events.event_type AS events_event_type,
		events.payload AS events_payload,
		events.version AS events_version
	`;

	private loadEvent(row: any): Event {
		return Event.loadEvent(
			row.events_id,
			row.events_aggregate_id,
			row.events_aggregate_type,
			row.events_event_type,
			JSON.parse(row.events_payload),
			row.events_version
		);
	}

	private getEventDbStructure(event: Event): EventDbStructure {
		return {
			id: event.getId(),
			aggregate_id: event.getAggregateId(),
			aggregate_type: event.getAggregateType(),
			event_type: event.getEventType(),
			payload: JSON.stringify(event.getPayload()),
			version: event.getVersion(),
		};
	}

	async append(order: Order, expectedVersion: number): Promise<void> {
		try {
			const lastEvent = await this.getLastVersion(order.getId());
			const lastVersion = lastEvent?.getVersion() ?? 0;

			if (lastVersion !== expectedVersion) {
				throw new Error("CONCURRENCY_ERROR");
			}

			const events: Event[] = [];
			let version = lastVersion;

			order.getDomainEvents().forEach((domainEvent) => {
				version++;
				const event = new Event(
					order.getId(),
					"Order",
					domainEvent.type,
					domainEvent.data
				);

				event.setVersion(version);
				events.push(event);
			});

			await this.saveMany(events);
		} catch (error) {
			if (error instanceof Error) {
				throw error;
			}
			throw new Error("ERROR_APPENDING_EVENT");
		}
	}

	async save(event: Event): Promise<void> {
		try {
			const client = DbContext.getClient();
			await this.saveEvents([event], client);
		} catch (error) {
			console.error(`Error saving event ${event.getId()}:`, error);
			throw new Error(
				`Failed to save event: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	async saveMany(events: Event[]): Promise<void> {
		try {
			const client = DbContext.getClient();
			await this.saveEvents(events, client);
		} catch (error) {
			console.error("Error saving events:", error);
			throw new Error(
				`Failed to save events: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	private async saveEvents(events: Event[], client: PoolClient): Promise<void> {
		try {
			await saveStructures(
				events
					.filter((event) => event.getWasUpdated())
					.map((event) => this.getEventDbStructure(event)),
				"operations.events",
				client
			);
		} catch (error) {
			console.error("Error saving events:", error);
			throw new Error(
				`Failed to save events: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	async getByAggregateId(aggregateId: string): Promise<Event[]> {
		const sql = `
    SELECT ${PostgreEventRepository.eventSql}
		FROM operations.events
		WHERE events.aggregate_id = $1
	  ORDER BY events.version ASC
`;
		try {
			const client = DbContext.getClient();
			const result = await client.query(sql, [aggregateId]);

			return result.rows.map((row) => this.loadEvent(row));
		} catch (error) {
			console.error(`Error getting events for aggregate ${aggregateId}:`, error);
			throw new Error(
				`Failed to get events: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	async getLastVersion(aggregateId: string): Promise<Event | null> {
		const sql = `
  SELECT ${PostgreEventRepository.eventSql}
	FROM operations.events
	WHERE events.aggregate_id = $1
	ORDER BY events.version DESC
	LIMIT 1
`;
		try {
			const client = DbContext.getClient();
			const result = await client.query(sql, [aggregateId]);

			if (result.rows.length === 0) {
				return null;
			}

			return this.loadEvent(result.rows[0]);
		} catch (error) {
			console.error(`Error getting last version for aggregate ${aggregateId}:`, error);
			throw new Error(
				`Failed to get last version: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	async exists(aggregateId: string): Promise<boolean> {
		const sql = `
  SELECT EXISTS(
	SELECT 1 FROM operations.events 
	WHERE aggregate_id = $1) as exists
`;
		try {
			const client = DbContext.getClient();
			const result = await client.query(sql, [aggregateId]);

			return result.rows[0].exists;
		} catch (error) {
			console.error(`Error checking existence for aggregate ${aggregateId}:`, error);
			throw new Error(
				`Failed to check existence: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}
}
