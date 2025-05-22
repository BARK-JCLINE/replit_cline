import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertOrderConfigurationSchema, insertOrderBatchSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Order Configuration routes
  app.get("/api/configurations", async (req, res) => {
    try {
      const configurations = await storage.getAllOrderConfigurations();
      res.json(configurations);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch configurations" });
    }
  });

  app.post("/api/configurations", async (req, res) => {
    try {
      const validatedData = insertOrderConfigurationSchema.parse(req.body);
      const configuration = await storage.createOrderConfiguration(validatedData);
      res.status(201).json(configuration);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation failed", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create configuration" });
      }
    }
  });

  app.get("/api/configurations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const configuration = await storage.getOrderConfiguration(id);
      if (!configuration) {
        return res.status(404).json({ error: "Configuration not found" });
      }
      res.json(configuration);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch configuration" });
    }
  });

  // Order Batch routes
  app.get("/api/batches", async (req, res) => {
    try {
      const batches = await storage.getAllOrderBatches();
      res.json(batches);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch order batches" });
    }
  });

  app.post("/api/batches", async (req, res) => {
    try {
      const validatedData = insertOrderBatchSchema.parse(req.body);
      const batch = await storage.createOrderBatch(validatedData);
      res.status(201).json(batch);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation failed", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to create order batch" });
      }
    }
  });

  app.get("/api/batches/:batchId", async (req, res) => {
    try {
      const batch = await storage.getOrderBatchByBatchId(req.params.batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }
      res.json(batch);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch batch" });
    }
  });

  // Create orders endpoint - simulates Shopify order creation
  app.post("/api/orders/create", async (req, res) => {
    try {
      const { configurationId, batchId } = req.body;
      
      const configuration = await storage.getOrderConfiguration(configurationId);
      if (!configuration) {
        return res.status(404).json({ error: "Configuration not found" });
      }

      const batch = await storage.getOrderBatchByBatchId(batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }

      // Update batch status to processing
      await storage.updateOrderBatchProgress(batchId, 0, "processing");

      // Simulate order creation process
      const { orderCount, orderDelay } = configuration;
      const createdOrders = [];

      for (let i = 0; i < orderCount; i++) {
        // Simulate API delay
        await new Promise(resolve => setTimeout(resolve, orderDelay * 1000));

        // Simulate order creation (in real implementation, this would call Shopify API)
        const orderId = `${configuration.orderPrefix}-${Date.now()}-${i + 1}`;
        const order = {
          id: orderId,
          warehouse: configuration.warehouse,
          shippingRegion: configuration.shippingRegion,
          lineItems: configuration.lineItems,
          tags: [
            configuration.subscriptionType,
            configuration.customerSegment,
            ...(configuration.customTags ? configuration.customTags.split(',').map(tag => tag.trim()) : [])
          ].filter(Boolean),
          address: {
            template: configuration.addressTemplate,
            stateProvince: configuration.stateProvince
          },
          createdAt: new Date().toISOString()
        };

        createdOrders.push(order);

        // Update progress
        const progress = Math.round(((i + 1) / orderCount) * 100);
        await storage.updateOrderBatchProgress(batchId, progress);
      }

      // Complete the batch
      await storage.completeOrderBatch(batchId, createdOrders);

      res.json({ 
        success: true, 
        batchId,
        ordersCreated: createdOrders.length,
        orders: createdOrders 
      });
    } catch (error) {
      console.error("Order creation failed:", error);
      
      // Mark batch as failed if batchId exists
      if (req.body.batchId) {
        await storage.completeOrderBatch(req.body.batchId, [], error.message);
      }
      
      res.status(500).json({ error: "Failed to create orders", details: error.message });
    }
  });

  // Validation endpoint
  app.post("/api/validate-configuration", async (req, res) => {
    try {
      const validatedData = insertOrderConfigurationSchema.parse(req.body);
      res.json({ valid: true, configuration: validatedData });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }));
        res.status(400).json({ valid: false, errors });
      } else {
        res.status(500).json({ valid: false, error: "Validation failed" });
      }
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
