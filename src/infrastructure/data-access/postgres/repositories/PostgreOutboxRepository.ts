import moment from "moment";
import type { PoolClient } from "pg";
import format from "pg-format";
import type { OutboxRepository } from "@/application/ports/OutboxRepository";
import type { OutgoingIntegrationEvent } from "@/infrastructure/events/IntegrationEvents";
import { DbContext } from "../dbContext";

export interface OutboxEventDbStructure {
	event_id: string;
	event_type: string;
	payload: unknown;
	correlation_id?: string;
	version: string;
	occurred_at: Date;
	exchange: string;
	routing_key: string;
	source: string;
	retry_count: number;
	error?: string | null;
	created_at: Date;
	processed_at?: Date | null;
}

export class PostgreOutboxRepository implements OutboxRepository {
	static outboxEventSql = `
        outbox_events.event_id AS outbox_events_event_id,
        outbox_events.event_type AS outbox_events_event_type,
        outbox_events.payload AS outbox_events_payload,
        outbox_events.correlation_id AS outbox_events_correlation_id,
        outbox_events.version AS outbox_events_version,
        outbox_events.occurred_at AS outbox_events_occurred_at,
        outbox_events.exchange AS outbox_events_exchange,
        outbox_events.routing_key AS outbox_events_routing_key,
        outbox_events.source AS outbox_events_source
    `;

	private loadOutboxEvent(row: any): OutgoingIntegrationEvent {
		return {
			eventId: row.outbox_events_event_id,
			eventType: row.outbox_events_event_type,
			payload: row.outbox_events_payload,
			correlationId: row.outbox_events_correlation_id,
			version: row.outbox_events_version,
			occurredAt: row.outbox_events_occurred_at,
			exchange: row.outbox_events_exchange,
			routingKey: row.outbox_events_routing_key,
			source: row.outbox_events_source,
		};
	}

	private getOutboxEventDbStructure(
		event: OutgoingIntegrationEvent
	): OutboxEventDbStructure {
		return {
			event_id: event.eventId,
			event_type: event.eventType,
			payload: JSON.stringify(event.payload),
			correlation_id: event.correlationId,
			version: event.version,
			occurred_at: new Date(event.occurredAt),
			exchange: event.exchange,
			routing_key: event.routingKey,
			source: event.source,
			retry_count: 0,
			created_at: moment.utc().toDate(),
		};
	}

	private async saveOutboxEvents(
		events: OutgoingIntegrationEvent[],
		poolClient: PoolClient
	) {
		try {
			const structures = events.map((event) => this.getOutboxEventDbStructure(event));

			if (structures.length === 0) {
				return;
			}

			const columns = Object.keys(structures[0])
				.map((key) => `"${key}"`)
				.join(",");

			const conflict = Object.keys(structures[0])
				.map((key) => `"${key}" = EXCLUDED."${key}"`)
				.join(",");

			const sql = format(
				`
                INSERT INTO operations.outbox_events (${columns})
                VALUES %L
                ON CONFLICT (event_id) DO UPDATE
                SET ${conflict}
            `,
				structures.map((structure) =>
					Object.keys(structure).map((key) => (structure as any)[key])
				)
			);

			await poolClient.query(sql);
		} catch (error) {
			console.error("Error saving outbox events:", error);
			throw new Error(
				`Failed to save outbox events: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	async getPending(limit: number): Promise<OutgoingIntegrationEvent[]> {
		try {
			const sql = `
                SELECT
                    ${PostgreOutboxRepository.outboxEventSql}
                FROM operations.outbox_events
                WHERE processed_at IS NULL
                AND retry_count < 5
                ORDER BY created_at ASC
                LIMIT $1
                FOR UPDATE SKIP LOCKED
            `;

			const client = DbContext.getClient();
			const { rows, rowCount } = await client.query(sql, [limit]);

			if (rowCount === 0) {
				return [];
			}
			return rows.map((row) => this.loadOutboxEvent(row));
		} catch (error) {
			console.error(`Error getting pending outbox events with limit ${limit}:`, error);
			throw new Error(
				`Failed to get pending outbox events: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	async markAsProcessed(id: string): Promise<void> {
		try {
			const sql = `
                UPDATE operations.outbox_events
                SET processed_at = NOW()
                WHERE event_id = $1
            `;

			const client = DbContext.getClient();
			await client.query(sql, [id]);
		} catch (error) {
			console.error(`Error marking outbox event ${id} as processed:`, error);
			throw new Error(
				`Failed to mark outbox event as processed: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	async incrementRetry(id: string): Promise<void> {
		try {
			const sql = `
                UPDATE operations.outbox_events
                SET retry_count = retry_count + 1
                WHERE event_id = $1
            `;

			const client = DbContext.getClient();
			await client.query(sql, [id]);
		} catch (error) {
			console.error(`Error incrementing retry for outbox event ${id}:`, error);
			throw new Error(
				`Failed to increment retry: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	async incrementRetryWithMessage(id: string, errorMessage: string): Promise<void> {
		try {
			const sql = `
                UPDATE operations.outbox_events
                SET retry_count = retry_count + 1,
                    error = $2
                WHERE event_id = $1
            `;

			const client = DbContext.getClient();
			await client.query(sql, [id, errorMessage]);
		} catch (error) {
			console.error(`Error incrementing retry for outbox event ${id}:`, error);
			throw new Error(
				`Failed to increment retry: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	async save(events: OutgoingIntegrationEvent[]): Promise<void> {
		try {
			const client = DbContext.getClient();
			await this.saveOutboxEvents(events, client);
		} catch (error) {
			console.error("Error saving outbox events:", error);
			throw new Error(
				`Failed to save outbox events: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}
}
