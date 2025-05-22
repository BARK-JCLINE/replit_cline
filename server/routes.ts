import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertOrderConfigurationSchema, insertOrderBatchSchema } from "@shared/schema";
import { z } from "zod";
import { shopifyAPI, createShopifyOrderFromConfig } from "./shopify";

export async function registerRoutes(app: Express): Promise<Server> {
  // Add middleware to ensure API routes are handled first
  app.use('/api', (req, res, next) => {
    console.log(`API Route: ${req.method} ${req.path}`);
    next();
  });

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
      
      // Check for duplicate names
      const existingConfigurations = await storage.getAllOrderConfigurations();
      const isDuplicate = existingConfigurations.some(
        (config) => config.name.toLowerCase() === validatedData.name.toLowerCase()
      );
      
      if (isDuplicate) {
        return res.status(400).json({ 
          error: "Template name already exists", 
          message: "A template with this name already exists. Please choose a different name." 
        });
      }
      
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

  app.put("/api/configurations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertOrderConfigurationSchema.parse(req.body);
      const configuration = await storage.updateOrderConfiguration(id, validatedData);
      if (!configuration) {
        return res.status(404).json({ error: "Configuration not found" });
      }
      res.json(configuration);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: "Validation failed", details: error.errors });
      } else {
        res.status(500).json({ error: "Failed to update configuration" });
      }
    }
  });

  app.delete("/api/configurations/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      console.log(`Attempting to delete configuration with ID: ${id}`);
      
      // Check if it exists first
      const existing = await storage.getOrderConfiguration(id);
      console.log(`Configuration exists:`, existing ? 'YES' : 'NO');
      
      // First check if there are any batches using this configuration
      const allBatches = await storage.getAllOrderBatches();
      const linkedBatches = allBatches.filter(batch => batch.configurationId === id);
      console.log(`Found ${linkedBatches.length} batches linked to configuration ${id}`);
      
      if (linkedBatches.length > 0) {
        console.log(`Unlinking ${linkedBatches.length} batches from configuration ${id}`);
        // Update batches to remove the configuration reference instead of deleting
        for (const batch of linkedBatches) {
          console.log(`Updating batch ${batch.id} to remove config reference`);
          await storage.updateOrderBatch(batch.id, { configurationId: null });
        }
        console.log(`Successfully unlinked all batches from configuration ${id}`);
      }
      
      const success = await storage.deleteOrderConfiguration(id);
      console.log(`Delete operation result: ${success}`);
      
      if (!success) {
        return res.status(404).json({ error: "Configuration not found" });
      }
      
      // Verify it's gone
      const afterDelete = await storage.getOrderConfiguration(id);
      console.log(`Configuration after delete:`, afterDelete ? 'STILL EXISTS' : 'DELETED');
      
      res.json({ success: true, message: "Template deleted successfully" });
    } catch (error) {
      console.error('Delete error:', error);
      res.status(500).json({ error: "Failed to delete configuration" });
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
      // Remove progress field if it exists and validate
      const { progress, ...batchData } = req.body;
      const validatedData = insertOrderBatchSchema.parse(batchData);
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

  // Create orders endpoint - creates real Shopify orders
  app.post("/api/orders/create", async (req, res) => {
    try {
      const { configurationId, configuration, batchId } = req.body;
      
      // Use provided configuration or fetch from database
      let orderConfig;
      if (configuration) {
        // Direct configuration provided (for temporary orders)
        orderConfig = configuration;
      } else if (configurationId) {
        // Configuration ID provided (for saved templates)
        orderConfig = await storage.getOrderConfiguration(configurationId);
        if (!orderConfig) {
          return res.status(404).json({ error: "Configuration not found" });
        }
      } else {
        return res.status(400).json({ error: "Either configuration or configurationId must be provided" });
      }

      const batch = await storage.getOrderBatchByBatchId(batchId);
      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }

      // Update batch status to processing
      await storage.updateOrderBatchProgress(batchId, 0, "processing");

      const { orderCount, orderDelay } = orderConfig;
      const createdOrders = [];

      for (let i = 0; i < orderCount; i++) {
        try {
          // Add delay if configured
          if (orderDelay && orderDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, orderDelay * 1000));
          }

          // Create the Shopify order from configuration
          const shopifyOrderData = createShopifyOrderFromConfig(orderConfig);
          
          // Try to find actual products by SKU and update line items
          const updatedLineItems = [];
          for (const lineItem of shopifyOrderData.line_items) {
            try {
              const productInfo = await shopifyAPI.searchProductBySku(lineItem.sku || "");
              if (productInfo) {
                updatedLineItems.push({
                  variant_id: productInfo.variant_id,
                  product_id: productInfo.product_id,
                  title: productInfo.title,
                  quantity: lineItem.quantity,
                  price: productInfo.price,
                  sku: lineItem.sku,
                });
              } else {
                // If SKU not found, use the original line item
                updatedLineItems.push(lineItem);
              }
            } catch (skuError) {
              console.warn(`Could not find product for SKU ${lineItem.sku}:`, skuError);
              updatedLineItems.push(lineItem);
            }
          }
          
          shopifyOrderData.line_items = updatedLineItems;

          // Create the order in Shopify
          const shopifyResponse = await shopifyAPI.createOrder(shopifyOrderData);
          
          const order = {
            id: shopifyResponse.order.id,
            shopify_order_number: shopifyResponse.order.order_number,
            warehouse: configuration.warehouse,
            address: configuration.address,
            lineItems: configuration.lineItems,
            tags: shopifyResponse.order.tags,
            total_price: shopifyResponse.order.total_price,
            financial_status: shopifyResponse.order.financial_status,
            fulfillment_status: shopifyResponse.order.fulfillment_status,
            createdAt: shopifyResponse.order.created_at,
            shopify_admin_url: `https://dev-bark-co.myshopify.com/admin/orders/${shopifyResponse.order.id}`
          };

          createdOrders.push(order);

          // Update progress
          const progress = Math.round(((i + 1) / orderCount) * 100);
          await storage.updateOrderBatchProgress(batchId, progress);

        } catch (orderError) {
          console.error(`Failed to create order ${i + 1}:`, orderError);
          
          // Add failed order to results
          createdOrders.push({
            error: true,
            message: `Failed to create order ${i + 1}: ${orderError instanceof Error ? orderError.message : 'Unknown error'}`,
            orderIndex: i + 1
          });

          // Update progress even for failed orders
          const progress = Math.round(((i + 1) / orderCount) * 100);
          await storage.updateOrderBatchProgress(batchId, progress);
        }
      }

      // Complete the batch
      const hasErrors = createdOrders.some((order: any) => order.error);
      await storage.completeOrderBatch(batchId, createdOrders, hasErrors ? "Some orders failed to create" : undefined);

      res.json({ 
        success: true, 
        batchId,
        ordersCreated: createdOrders.filter((order: any) => !order.error).length,
        orders: createdOrders,
        hasErrors
      });
    } catch (error) {
      console.error("Order creation failed:", error);
      
      // Mark batch as failed if batchId exists
      if (req.body.batchId) {
        await storage.completeOrderBatch(req.body.batchId, [], (error as Error).message);
      }
      
      res.status(500).json({ error: "Failed to create orders", details: (error as Error).message });
    }
  });

  // Test Shopify connection endpoint
  app.get("/api/shopify/test", async (req, res) => {
    try {
      const products = await shopifyAPI.getProducts(5);
      res.json({ 
        success: true, 
        message: "Successfully connected to Shopify!", 
        productCount: products.products?.length || 0,
        store: "dev-bark-co.myshopify.com"
      });
    } catch (error) {
      console.error("Shopify connection test failed:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to connect to Shopify", 
        details: (error as Error).message 
      });
    }
  });

  // Get products from Shopify
  app.get("/api/shopify/products", async (req, res) => {
    try {
      const products = await shopifyAPI.getProducts(50);
      res.json(products);
    } catch (error) {
      console.error("Failed to fetch products:", error);
      res.status(500).json({ error: "Failed to fetch products", details: (error as Error).message });
    }
  });

  // Get next order number
  app.get("/api/shopify/next-order-number", async (req, res) => {
    try {
      const lastOrderNumber = await shopifyAPI.getLastOrderNumber();
      const nextOrderNumber = lastOrderNumber + 1;
      res.json({ 
        nextOrderNumber,
        formattedOrderNumber: `BARK-${nextOrderNumber}`,
        lastOrderNumber 
      });
    } catch (error) {
      console.error("Failed to get next order number:", error);
      res.status(500).json({ error: "Failed to get next order number", details: (error as Error).message });
    }
  });

  // Get Shopify locations for warehouse mapping
  app.get("/api/shopify/locations", async (req, res) => {
    try {
      const locations = await shopifyAPI.getLocations();
      res.json(locations);
    } catch (error) {
      console.error("Failed to fetch locations:", error);
      res.status(500).json({ error: "Failed to fetch locations", details: (error as Error).message });
    }
  });

  // Delete batch endpoint
  app.delete("/api/batches/:id", async (req, res) => {
    const batchId = parseInt(req.params.id);
    const { deleteFromShopify } = req.body || {};

    console.log(`🗑️ Delete request for batch ${batchId}, deleteFromShopify: ${deleteFromShopify}`);

    try {
      // First, let's see what batches actually exist
      const allBatches = await storage.getAllOrderBatches();
      console.log(`📋 All batches in storage:`, allBatches.map(b => ({ id: b.id, batchId: b.batchId })));

      // Get the batch to access created orders
      const batch = await storage.getOrderBatch(batchId);
      if (!batch) {
        console.log(`❌ Batch ${batchId} not found in storage`);
        return res.status(404).json({ error: "Batch not found" });
      }

      console.log(`✅ Found batch ${batchId}:`, { id: batch.id, batchId: batch.batchId, ordersCount: batch.createdOrders?.length });

      // If deleteFromShopify is true, try to delete orders from Shopify
      if (deleteFromShopify && Array.isArray(batch.createdOrders)) {
        console.log(`🛒 Attempting to delete ${batch.createdOrders.length} orders from Shopify`);
        for (const order of batch.createdOrders) {
          try {
            if (order.id) {
              await shopifyAPI.deleteOrder(order.id);
              console.log(`✅ Deleted order ${order.id} from Shopify`);
            }
          } catch (shopifyError) {
            console.warn(`⚠️ Failed to delete order ${order.id} from Shopify:`, shopifyError);
          }
        }
      }

      // Delete the batch from our storage
      console.log(`🗃️ Deleting batch ${batchId} from storage`);
      const deleted = await storage.deleteOrderBatch(batchId);
      console.log(`🎯 Batch deletion result:`, deleted);
      
      if (!deleted) {
        console.log(`❌ Storage deletion failed for batch ${batchId}`);
        return res.status(500).json({ error: "Failed to delete batch from storage" });
      }

      console.log(`🎉 Successfully deleted batch ${batchId}`);
      res.json({ success: true, message: "Batch deleted successfully" });
    } catch (error) {
      console.error("💥 Failed to delete batch:", error);
      res.status(500).json({ error: "Failed to delete batch", details: (error as Error).message });
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
