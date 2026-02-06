import type { Event } from "@/domain/entities/Event";
import type { EventRepository } from "../ports/EventRepository";
import type { TransactionManager } from "../ports/TransactionManager";

export class GetOrderEventsUseCase {
	constructor(
		private readonly eventRepository: EventRepository,
		private readonly transactionManager: TransactionManager
	) {}

	async execute(orderId: string): Promise<Event[]> {
		return await this.transactionManager.runInSession(async () => {
			return this.eventRepository.getByAggregateId(orderId);
		});
	}
}
