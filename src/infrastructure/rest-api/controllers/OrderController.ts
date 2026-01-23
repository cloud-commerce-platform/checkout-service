import type { OrderService } from "@application/services/OrderService";
import { Body, Controller, Get, Path, Post, Route, SuccessResponse } from "@tsoa/runtime";
import { Type } from "class-transformer";
import { IsArray, IsNotEmpty, IsNumber, IsUUID, ValidateNested } from "class-validator";
import { orderService } from "@/globals";
import type { UUID } from "@/infrastructure/utils";

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
	public async getOrderById(@Path() id: UUID): Promise<any> {
		return this.orderService.getOrderById(id);
	}
}
