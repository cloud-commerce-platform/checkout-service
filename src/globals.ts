import type { OrderService } from "@application/services/OrderService";

export let orderService: OrderService;

export function setOrderService(service: OrderService) {
	orderService = service;
}
