import "reflect-metadata";

import cors from "cors";
import express from "express";
import { EventConsumerRegistry } from "./application/consumers/EventConsumerRegistry";
import { CompositionRoot } from "./composition-root";
import { setOrderService } from "./globals";
import { RabbitMQMessagingService } from "./infrastructure/messaging/adapters/RabbitMQMessagingService";
import { RegisterRoutes } from "./infrastructure/rest-api/routes";

async function start() {
  try {
    const messagingService = new RabbitMQMessagingService();

    // Connect to RabbitMQ with retry
    const MAX_RETRIES = 10;
    let retries = 0;
    while (retries < MAX_RETRIES) {
      await messagingService.connect();
      if (messagingService.isConnected()) {
        console.log("Successfully connected to RabbitMQ");
        break;
      }
      retries++;
      console.log(
        `Failed to connect to RabbitMQ (attempt ${retries}/${MAX_RETRIES}). Retrying in 5 seconds...`
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    if (!messagingService.isConnected()) {
      throw new Error("Could not connect to RabbitMQ after multiple attempts");
    }

    const orderService = await CompositionRoot.configure(messagingService);
    setOrderService(orderService);

    const eventConsumerRegistry = new EventConsumerRegistry(
      messagingService,
      orderService
    );
    await eventConsumerRegistry.initializeAllConsumers();

    const app = express();
    app.use(cors());
    app.use(express.json());

    RegisterRoutes(app);

    if (process.env.NODE_ENV !== "production") {
      const swaggerUi = await import("swagger-ui-express");
      const swaggerJson = (await import("@infrastructure/rest-api/swagger.json")).default;

      app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerJson));
    }

    app.use(
      (
        err: any,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction
      ) => {
        console.error(err);
        res.status(500).json({
          message: "Something went wrong!",
          error: err,
        });
      }
    );

    app.get("/health", (_req, res) => {
      res.json({ status: "OK", timestamp: new Date().toISOString() });
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start application:", error);
    process.exit(1);
  }
}

start();
