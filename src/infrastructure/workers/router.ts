import { EventNormalizationService } from "@application/services/EventNormalizationService";
import { RoutingService } from "@application/services/RoutingService";
import { RabbitMQMessagingService } from "../messaging/adapters/RabbitMQMessagingService";
import { EventRouterSetup } from "../messaging/setup/EventRouterSetup";

const PARTITION_COUNT = Number(process.env.PARTITION_COUNT) ?? 2;

if (isNaN(PARTITION_COUNT) || PARTITION_COUNT < 1) {
	console.error("PARTITION_COUNT must be a number >= 1");
	process.exit(1);
}

async function startEventRouter() {
	const messagingService = new RabbitMQMessagingService();
	const setup = new EventRouterSetup(messagingService, PARTITION_COUNT);
	const normalizationService = new EventNormalizationService();
	const routingService = new RoutingService(PARTITION_COUNT);

	await messagingService.connect();
	await setup.initialize();

	const channel = messagingService.getChannel();
	if (!channel) throw new Error("Channel not available");

	await channel.consume("event_router_payment_queue", async (msg) => {
		if (!msg) return;

		try {
			const content = JSON.parse(msg.content.toString());
			const normalizedEvent = normalizationService.normalize(content);
			const partition = routingService.calculatePartition(normalizedEvent.orderId);

			await messagingService.publish(
				"order_processing",
				partition.toString(),
				normalizedEvent
			);
			channel.ack(msg);
		} catch (error) {
			channel.nack(msg, false, false);
		}
	});

	await channel.consume("event_router_inventory_queue", async (msg) => {
		if (!msg) return;

		try {
			const content = JSON.parse(msg.content.toString());
			const normalizedEvent = normalizationService.normalize(content);
			const partition = routingService.calculatePartition(normalizedEvent.orderId);

			await messagingService.publish(
				"order_processing",
				partition.toString(),
				normalizedEvent
			);
			channel.ack(msg);
		} catch (error) {
			console.error("❌ Error procesando evento de Inventory:", error);
			channel.nack(msg, false, false);
		}
	});

	console.log("Event Router iniciado y escuchando...");

	process.on("SIGINT", async () => {
		console.log("\n🛑 Cerrando Event Router...");
		process.exit(0);
	});
}

startEventRouter().catch((error) => {
	console.error("❌ Error fatal en Event Router:", error);
	process.exit(1);
});
