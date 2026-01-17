import { v7 as uuid } from "uuid";
import type { DomainEvent } from "../events/OrderDomainEvents";

abstract class Entity<TEvent extends DomainEvent> {
	private id: string;
	private domainEvents: TEvent[] = [];

	public constructor() {
		this.id = uuid();
	}

	public getId(): string {
		return this.id;
	}

	public setId(id: string) {
		this.id = id;
	}

	protected addDomainEvent(event: TEvent): void {
		this.domainEvents.push(event);
	}

	public getDomainEvents(): TEvent[] {
		return [...this.domainEvents];
	}

	public clearDomainEvents(): void {
		this.domainEvents = [];
	}

	public hasPendingEvents(): boolean {
		return this.domainEvents.length > 0;
	}
}

export default Entity;
