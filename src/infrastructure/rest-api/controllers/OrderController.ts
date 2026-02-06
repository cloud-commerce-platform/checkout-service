import type { OrderService } from "@application/services/OrderService";
import { Body, Controller, Get, Path, Post, Route, SuccessResponse } from "@tsoa/runtime";
import { Type } from "class-transformer";
import { IsArray, IsNotEmpty, IsNumber, IsUUID, ValidateNested } from "class-validator";
import type { Event } from "@/domain/entities/Event";
import { orderService } from "@/globals";
import type { UUID } from "@/infrastructure/utils";
import type { GetEventsHttpResponse } from "../dto/GetEventHttpResponse";
import type { GetOrderHttpResponse } from "../dto/GetOrderHttpResponse";

export class ItemRequest {
	@IsUUID("7")
	@IsNotEmpty()
	productId!: UUID;

	@IsNumber()
	@IsNotEmpty()
	quantity!: number;

	@IsNumber()
	@IsNotEmpty()
	unitPrice!: number;
}

export class CreateOrderRequest {
	@IsUUID("7")
	@IsNotEmpty()
	customerId!: UUID;

	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => ItemRequest)
	items!: ItemRequest[];
}

@Route("orders")
export class OrderController extends Controller {
	private readonly orderService: OrderService;

	constructor() {
		super();
		this.orderService = orderService;
	}

	@Post()
	@SuccessResponse(201, "Created")
	public async createOrder(@Body() body: CreateOrderRequest): Promise<void> {
		return this.orderService.createOrder(body);
	}

	@Get("{id}")
	@SuccessResponse("200", "Found")
	public async getOrderById(@Path() id: UUID): Promise<GetOrderHttpResponse> {
		const order = await this.orderService.getOrderById(id);

		return {
			id: order.getId(),
			customer_id: order.getCustomerId(),
			items: order.getItems().map((item) => {
				return {
					id: item.id,
					price: item.price,
					quantity: item.price,
					total_amount: item.totalAmount ?? 0,
				};
			}),
			status: order.getStatus(),
			cancelattion_reasons: order.getCancellationReasons(),
		};
	}

	@Get("{id}/events")
	@SuccessResponse("200", "Events found")
	public async getOrderEvents(@Path() id: UUID): Promise<GetEventsHttpResponse[]> {
		const event = await this.orderService.getOrderEvents(id);

		return event.map((event: Event) => {
			return {
				id: event.getId(),
				aggregate_id: event.getAggregateId(),
				event_type: event.getEventType(),
				version: event.getVersion(),
				payload: event.getPayload(),
			};
		});
	}
}
