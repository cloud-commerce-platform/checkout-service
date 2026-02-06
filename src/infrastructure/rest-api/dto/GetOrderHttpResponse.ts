import type { CancellationReason, OrderStatus } from "@alejotamayo28/event-contracts";

export interface GetOrderHttpResponse {
	id: string;
	customer_id: string;
	items: {
		id: string;
		price: number;
		quantity: number;
		total_amount: number;
	}[];
	status: OrderStatus;
	cancelattion_reasons: CancellationReason[];
}
