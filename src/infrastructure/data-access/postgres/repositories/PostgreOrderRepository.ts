import { Order } from "@domain/entities/Order";
import type { OrderRepository } from "@domain/repositories/OrderRepository";
import type { PoolClient } from "pg";
import { type OrderDbStructure, saveStructures } from "../bulkOperations";
import { DbContext } from "../dbContext";

export class PostgreOrderRepository implements OrderRepository {
	static orderSql = `
  orders.id AS orders_id,
  orders.customer_id AS orders_customer_id,
  orders.status AS orders_status,
  orders.currency AS orders_currency,
  orders.total_amount AS orders_total_amount,
  orders.items AS orders_items,
  orders.cancellation_reasons AS orders_cancellation_reasons
`;

	private loadOrder(row: any): Order {
		return Order.loadOrder(
			row.orders_id,
			row.orders_customer_id,
			row.orders_items,
			row.orders_status,
			row.orders_cancellation_reasons
		);
	}

	private getOrderDbStructure(order: Order): OrderDbStructure {
		return {
			id: order.getId(),
			status: order.getStatus(),
			customer_id: order.getCustomerId(),
			currency: "COP",
			total_amount: order.calculateTotal(),
			items: JSON.stringify(
				order.getItems().map((item) => ({
					id: item.id,
					price: item.price,
					quantity: item.quantity,
					total_amount: item.totalAmount,
				}))
			),
			cancellation_reasons: JSON.stringify(order.getCancellationReasons()),
		};
	}

	private async saveOrder(order: Order, poolClient: PoolClient) {
		try {
			await this.saveOrders([order], poolClient);
		} catch (error) {
			console.error(`Error saving order ${order.getId()}:`, error);
			throw new Error(
				`Failed to save order: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	private async saveOrders(orders: Order[], poolClient: PoolClient) {
		try {
			await saveStructures(
				orders
					.filter((order) => {
						return order.getWasUpdated();
					})
					.map((order) => {
						return this.getOrderDbStructure(order);
					}),
				"operations.orders",
				poolClient
			);
		} catch (error) {
			console.error("Error saving multiple orders:", error);
			throw new Error(
				`Failed to save orders: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	async findById(id: string): Promise<Order | null> {
		try {
			const sql = `
    SELECT
      ${PostgreOrderRepository.orderSql}
    FROM operations.orders
    WHERE orders.id = $1
    FOR UPDATE
`;
			const client = DbContext.getClient();
			const { rows, rowCount } = await client.query(sql, [id]);

			if (rowCount === 0) {
				return null;
			}

			return this.loadOrder(rows[0]);
		} catch (error) {
			console.error(`Error finding order by id ${id}:`, error);
			throw new Error(
				`Failed to find order: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	async findByCustomerId(customerId: string): Promise<Order[]> {
		try {
			const sql = `
    SELECT
      ${PostgreOrderRepository.orderSql}
    FROM operations.orders
    WHERE operations.order.customer_id = $1
`;

			const client = DbContext.getClient();
			const { rows, rowCount } = await client.query(sql, [customerId]);

			if (rowCount === 0) {
				return [];
			}

			return rows.map(this.loadOrder);
		} catch (error) {
			console.error(`Error finding orders by customer id ${customerId}:`, error);
			throw new Error(
				`Failed to find orders: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	async save(order: Order): Promise<void> {
		try {
			const client = DbContext.getClient();
			await this.saveOrder(order, client);
		} catch (error) {
			console.error(`Error saving order ${order.getId()}:`, error);
			throw new Error(
				`Failed to save order: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	async saveMany(orders: Order[]): Promise<void> {
		try {
			const client = DbContext.getClient();
			await this.saveOrders(orders, client);
		} catch (error) {
			throw new Error(
				`Failed to save multiple orders: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	async update(order: Order): Promise<void> {
		try {
			const client = DbContext.getClient();
			await this.saveOrder(order, client);
		} catch (error) {
			throw new Error(
				`Failed to update order: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}

	async delete(id: string): Promise<void> {
		try {
			const client = DbContext.getClient();
			await client.query("DELETE FROM operations.orders WHERE id = $1", [id]);
		} catch (error) {
			throw new Error(
				`Failed to delete order: ${error instanceof Error ? error.message : "Unknown error"}`
			);
		}
	}
}
