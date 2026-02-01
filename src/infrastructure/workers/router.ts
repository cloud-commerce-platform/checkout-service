import { v4 as uuidv4 } from "uuid";
import { RabbitMQMessagingService } from "../messaging/adapters/RabbitMQMessagingService";

interface IncomingEvent {
  eventId?: string;
  eventType: string;
  payload: {
    orderId: string;
    [key: string]: any;
  };
  correlationId?: string;
  occurredAt: string;
}

interface NormalizedEvent {
  eventId: string;
  orderId: string;
  eventType: string;
  originalEvent: IncomingEvent;
  occurredAt: Date;
  partition: number;
}

// FNV-1a hash implementation (deterministic)
function fnv1aHash(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

function calculatePartition(orderId: string, partitionCount: number): number {
  const hash = fnv1aHash(orderId);
  return (hash % partitionCount) + 1; // 1-based partition
}

function normalizeEvent(event: IncomingEvent): NormalizedEvent {
  const orderId = event.payload.orderId;
  const partitionCount = 1; // MVP: 1 partition
  const partition = calculatePartition(orderId, partitionCount);
  const eventType = event.eventType;

  return {
    eventId: uuidv4(), // Generate new event ID for deduplication
    orderId,
    eventType,
    originalEvent: event,
    occurredAt: new Date(),
    partition,
  };
}

async function startEventRouter() {
  const messagingService = new RabbitMQMessagingService();
  await messagingService.connect();

  // Create exchanges
  await messagingService.assertExchange("order_processing", "x-consistent-hash", {
    durable: true,
  });
  await messagingService.assertExchange("order_processing.dlq", "topic", {
    durable: true,
  });

  // Create queues
  await messagingService.assertQueue("worker_queue", {
    durable: true,
    arguments: {
      "x-dead-letter-exchange": "order_processing.dlq",
      "x-dead-letter-routing-key": "worker.dlq",
    },
  });
  await messagingService.assertQueue("worker_dlq", { durable: true });

  // Create bindings
  await messagingService.bindQueue("worker_queue", "order_processing", "1");
  await messagingService.bindQueue("worker_dlq", "order_processing.dlq", "worker.dlq");

  // Subscribe to payment events
  await messagingService.assertExchange("payment_events", "topic", {
    durable: false,
  });
  await messagingService.assertQueue("event_router_payment_queue", {
    durable: false,
  });
  await messagingService.bindQueue(
    "event_router_payment_queue",
    "payment_events",
    "payment.verification.verified"
  );
  await messagingService.bindQueue(
    "event_router_payment_queue",
    "payment_events",
    "payment.verification.failed"
  );

  // Consume payment events
  const channel = messagingService.getChannel();
  if (!channel) throw new Error("Channel not available");

  await channel.consume("event_router_payment_queue", async (msg) => {
    if (!msg) return;

    try {
      const content = JSON.parse(msg.content.toString()) as IncomingEvent;
      console.log(
        `Evento de Payment: ${content.eventType} (order: ${content.payload.orderId})`
      );

      const normalizedEvent = normalizeEvent(content);
      const routingKey = normalizedEvent.partition.toString();

      await messagingService.publish("order_processing", routingKey, normalizedEvent);

      console.log(`Ruteado a partition ${routingKey}: ${normalizedEvent.eventType}`);
      channel.ack(msg);
    } catch (error) {
      console.error("Error procesando evento de Payment:", error);
      channel.nack(msg, false, false);
    }
  });

  // Subscribe to inventory events
  await messagingService.assertExchange("inventory_events", "topic", {
    durable: false,
  });
  await messagingService.assertQueue("event_router_inventory_queue", {
    durable: false,
  });
  await messagingService.bindQueue(
    "event_router_inventory_queue",
    "inventory_events",
    "inventory.reservation.response"
  );

  // Consume inventory events
  await channel.consume("event_router_inventory_queue", async (msg) => {
    if (!msg) return;

    try {
      const content = JSON.parse(msg.content.toString()) as IncomingEvent;
      console.log(
        `Evento de Inventory: ${content.eventType} (order: ${content.payload.orderId})`
      );

      const normalizedEvent = normalizeEvent(content);
      const routingKey = normalizedEvent.partition.toString();

      // Publish to consistent-hash exchange
      await messagingService.publish("order_processing", routingKey, normalizedEvent);

      console.log(`Ruteado a partition ${routingKey}: ${normalizedEvent.eventType}`);
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
