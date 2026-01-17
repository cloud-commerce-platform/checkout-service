export interface TransactionManager {
	runInTransaction<T>(operation: () => Promise<T>): Promise<T>;
	runInSession<T>(operation: () => Promise<T>): Promise<T>;
}
