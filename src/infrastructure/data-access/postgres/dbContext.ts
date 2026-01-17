import { AsyncLocalStorage } from "node:async_hooks";
import type { PoolClient } from "pg";

const storage = new AsyncLocalStorage<PoolClient>();

export const DbContext = {
	run<T>(client: PoolClient, fn: () => Promise<T>) {
		return storage.run(client, fn);
	},
	getClient(): PoolClient {
		const client = storage.getStore();
		if (!client) {
			throw new Error("DATABASE_CLIENT_NOT_FOUND_IN_CONTEXT");
		}
		return client;
	},
};
