import moment from "moment";
import type { PoolClient } from "pg";
import format from "pg-format";

export interface OrderItemsJSONDbStructure {
	id: string;
	price: number;
	quantity: number;
	total_amount: number;
}

export interface OrderDbStructure {
	id: string;
	status: string;
	customer_id: string;
	currency: string;
	total_amount: number;
	items: string;
	cancellation_reasons: string;
}

export interface OutboxEventDbStructure {
	event_id: string;
	event_type: string;
	payload: string;
	correlation_id?: string;
	version: number;
	occurred_at: Date;
	exchange: string;
	routing_key: string;
	source: string;
	retry_count: number;
	error: string | null;
	created_at: Date;
	processed_at: Date | null;
	updated_at?: Date;
}

export interface EventDbStructure {
	id: string;
	aggregate_id: string;
	aggregate_type: string;
	event_type: string;
	payload: string;
	version: number;
}

export type entitiesDbStructure =
	| OrderDbStructure
	| OutboxEventDbStructure
	| EventDbStructure;

export const saveStructures = async (
	structures: entitiesDbStructure[],
	tableName: string,
	client: PoolClient
): Promise<any> => {
	return saveStructuresWithConflictKey(structures, tableName, "(id)", client);
};

export const saveStructuresWithConflictKey = async (
	structures: entitiesDbStructure[],
	tableName: string,
	onConflictStatement: string,
	client: PoolClient
): Promise<any> => {
	if (structures.length === 0) {
		return;
	}

	structures.forEach((structure) => {
		(structure as any).updated_at = moment.utc().toDate();
	});

	const columns = Object.keys(structures[0])
		.map((key) => {
			return `"${key}"`;
		})
		.join(",");
	const conflict = Object.keys(structures[0])
		.map((key) => {
			return `"${key}" = excluded."${key}"`;
		})
		.join(",");
	try {
		const sql = format(
			`
        INSERT INTO ${tableName} (${columns})
        VALUES %L
        ON CONFLICT ${onConflictStatement} DO UPDATE
        SET ${conflict}
      `,
			structures.map((structure) => {
				return Object.keys(structure).map((key) => {
					return (structure as any)[key];
				});
			})
		);

		await client.query(sql);
	} catch (error) {
		console.log(error);
		throw new Error("COULD_NOT_SAVE_DB_STRUCTURE");
	}
};

export type Grouping = Map<string, any[]>;

export const makeGrouping = (column: string, rows: any[]): Grouping => {
	const grouping = new Map<string, any[]>();

	rows.forEach((row) => {
		if (!row[column]) {
			return;
		}

		if (!grouping.has(row[column])) {
			grouping.set(row[column], []);
		}

		(grouping.get(row[column]) as any[]).push(row);
	});

	return grouping;
};
