import dotenv from "dotenv";
import { Pool, type PoolClient } from "pg";

dotenv.config();

export const pool = new Pool({
	connectionString: process.env.DATABASE_URL || process.env.DEV_DATABASE_URL,
	ssl: {
		rejectUnauthorized: false,
	},
});

export const newSession = async (): Promise<PoolClient> => {
	return pool.connect();
};

export const closeSession = (client: PoolClient): void => {
	return client.release(true);
};

export const onTransaction = async <T>(
	operation: (client: PoolClient) => Promise<T>
): Promise<T> => {
	const client = await newSession();
	try {
		await client.query("BEGIN");
		const value = await operation(client);
		await client.query("COMMIT");
		return value;
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		closeSession(client);
	}
};

export const onSession = async <T>(
	operation: (client: PoolClient) => Promise<T>
): Promise<T> => {
	const client = await newSession();
	try {
		const result = await operation(client);
		return result;
	} catch (error) {
		throw error;
	} finally {
		closeSession(client);
	}
};

export const closePool = async (): Promise<void> => {
	return pool.end();
};
