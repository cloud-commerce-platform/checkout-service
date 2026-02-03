import type { PoolClient } from "pg";
import type { OutboxRepository } from "@/application/ports/OutboxRepository";
import { Outbox } from "@/domain/entities/Outbox";
import {
	type OutboxEventDbStructure,
	saveStructuresWithConflictKey,
} from "../bulkOperations";
import { DbContext } from "../dbContext";

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
        outbox_events.source AS outbox_events_source,
        outbox_events.retry_count AS outbox_events_retry_count,
        outbox_events.error AS outbox_events_error,
        outbox_events.created_at AS outbox_events_created_at,
        outbox_events.processed_at AS outbox_events_processed_at
    `;

	private loadOutboxEvent(row: any): Outbox {
		return Outbox.loadOutboxEvent(
			row.outbox_events_event_id,
			row.outbox_events_event_type,
			row.outbox_events_payload,
			row.outbox_events_correlation_id,
			row.outbox_events_version,
			row.outbox_events_occurred_at,
			row.outbox_events_exchange,
			row.outbox_events_routing_key,
			row.outbox_events_source,
			row.outbox_events_retry_count,
			row.outbox_events_error,
			row.outbox_events_created_at,
			row.outbox_events_processed_at
		);
	}

	private getOutboxDbStructure(outbox: Outbox): OutboxEventDbStructure {
		return {
			event_id: outbox.getEventId(),
			event_type: outbox.getEventType(),
			payload: JSON.stringify(outbox.getPayload()),
			correlation_id: outbox.getCorrelationId(),
			version: outbox.getVersion(),
			occurred_at: outbox.getOccurredAt(),
			exchange: outbox.getExchange(),
			routing_key: outbox.getRoutingKey(),
			source: outbox.getSource(),
			retry_count: outbox.getRetryCount(),
			error: outbox.getError(),
			created_at: outbox.getCreatedAt(),
			processed_at: outbox.getProcessedAt(),
		};
	}

	async getPending(limit: number): Promise<Outbox[]> {
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

	async save(outbox: Outbox): Promise<void> {
		try {
			const client = DbContext.getClient();
			await this.saveOutboxes([outbox], client);
		} catch (error) {
			console.error(`Error saving outbox ${outbox.getEventId()}:`, error);
			throw new Error(
				`Failed to save outbox: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	async saveMany(outboxes: Outbox[]): Promise<void> {
		try {
			const client = DbContext.getClient();
			await this.saveOutboxes(outboxes, client);
		} catch (error) {
			console.error("Error saving outbox events:", error);
			throw new Error(
				`Failed to save outbox events: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	private async saveOutboxes(outboxes: Outbox[], poolClient: PoolClient) {
		try {
			await saveStructuresWithConflictKey(
				outboxes
					.filter((outbox) => {
						return outbox.getWasUpdated();
					})
					.map((outbox) => {
						return this.getOutboxDbStructure(outbox);
					}),
				"operations.outbox_events",
				"(event_id)",
				poolClient
			);
		} catch (error) {
			console.error("Error saving multiple outboxes:", error);
			throw new Error(
				`Failed to save outboxes: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}
}
