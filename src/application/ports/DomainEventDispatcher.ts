export interface DomainEventDispatcher {
	dispatch(events: any[]): Promise<void>;
}
