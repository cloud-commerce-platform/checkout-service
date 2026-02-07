export interface DuplicateChecker {
	isDuplicate(eventId: string): Promise<boolean>;
	markAsProcessed(eventId: string): Promise<void>;
}
