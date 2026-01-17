import type { TransactionManager } from "@application/ports/TransactionManager";
import { onSession, onTransaction } from "./config";
import { DbContext } from "./dbContext";

export class PostgresTransactionManager implements TransactionManager {
	async runInTransaction<T>(operation: () => Promise<T>): Promise<T> {
		return onTransaction(async (poolClient) => {
			return DbContext.run(poolClient, operation);
		});
	}
	runInSession<T>(operation: () => Promise<T>): Promise<T> {
		return onSession(async (poolClient) => {
			return DbContext.run(poolClient, operation);
		});
	}
}
