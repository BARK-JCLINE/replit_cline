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

      // Validate and limit order count
      const { orderCount: rawOrderCount, orderDelay } = orderConfig;
      const orderCount = Math.min(Math.max(Number(rawOrderCount) || 1, 1), 30000);
      
      console.log(`🔢 ORDER CREATION: Requested ${rawOrderCount}, validated to ${orderCount} orders for batch ${batchId}`);

      // Update batch status to processing
      await storage.updateOrderBatchProgress(batchId, 0, "processing");

      const createdOrders = [];

      for (let i = 0; i < orderCount; i++) {
        // Check if batch has been cancelled
        const currentBatch = await storage.getOrderBatchByBatchId(batchId);
        if (currentBatch && currentBatch.status === 'failed' && currentBatch.errorMessage === 'Cancelled by user') {
          console.log(`🛑 ORDER CREATION: Batch ${batchId} was cancelled, stopping at order ${i + 1}/${orderCount}`);
          break;
        }

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
                  price: lineItem.price,
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

          // Fulfill the order after creation
          try {
            console.log("🚚 Attempting to fulfill order:", shopifyResponse.order.id, "from warehouse:", configuration.warehouse);

            // Get fulfillment orders for this order
            const fulfillmentOrders = await shopifyAPI.getFulfillmentOrders(shopifyResponse.order.id);

            if (fulfillmentOrders.length > 0) {
              const fulfillmentOrder = fulfillmentOrders[0];
              console.log("📦 Requesting fulfillment for fulfillment order:", fulfillmentOrder.id);

              await shopifyAPI.makeRequest(`/fulfillment_orders/${fulfillmentOrder.id}/fulfillment_request.json`, "POST", {
                fulfillment_request: {
                  message: "Request fulfillment from warehouse"
                }
              });

              console.log("✅ Order fulfillment requested successfully");
            }
          } catch (fulfillError) {
            console.error("⚠️ Failed to fulfill order:", fulfillError);
            // Don't fail the entire process if fulfillment fails
          }

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
      const currentBatch = await storage.getOrderBatchByBatchId(batchId);
      const wasCancelled = currentBatch && currentBatch.status === 'failed' && currentBatch.errorMessage === 'Cancelled by user';
      
      if (!wasCancelled) {
        const hasErrors = createdOrders.some((order: any) => order.error);
        await storage.completeOrderBatch(batchId, createdOrders, hasErrors ? "Some orders failed to create" : undefined);
      } else {
        // Update the cancelled batch with whatever orders were created before cancellation
        await storage.completeOrderBatch(batchId, createdOrders, "Cancelled by user");
      }

      const successfulOrders = createdOrders.filter((order: any) => !order.error);
      const finalBatch = await storage.getOrderBatchByBatchId(batchId);
      const wasCancelled = finalBatch && finalBatch.status === 'failed' && finalBatch.errorMessage === 'Cancelled by user';
      
      res.json({ 
        success: !wasCancelled, 
        batchId,
        ordersCreated: successfulOrders.length,
        orders: createdOrders,
        hasErrors: hasErrors || wasCancelled,
        cancelled: wasCancelled
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

    console.log(`🗑️ DELETE BATCH: Starting deletion for batch ${batchId}, deleteFromShopify: ${deleteFromShopify}`);

    try {
      // Get the batch to access created orders
      const batch = await storage.getOrderBatch(batchId);
      if (!batch) {
        console.log(`❌ DELETE BATCH: Batch ${batchId} not found in storage`);
        return res.status(404).json({ error: "Batch not found" });
      }

      console.log(`✅ DELETE BATCH: Found batch ${batchId} with ${batch.createdOrders?.length || 0} orders`);

      let shopifyDeletionResults = { deletedCount: 0, failedCount: 0 };

      // If deleteFromShopify is true, try to delete orders from Shopify FIRST
      if (deleteFromShopify && Array.isArray(batch.createdOrders) && batch.createdOrders.length > 0) {
        console.log(`🛒 DELETE BATCH: Attempting to delete ${batch.createdOrders.length} orders from Shopify`);
        
        for (let i = 0; i < batch.createdOrders.length; i++) {
          const order = batch.createdOrders[i];
          
          // Skip orders that don't have valid IDs
          if (!order.id || (typeof order.id !== 'string' && typeof order.id !== 'number')) {
            console.log(`⚠️ DELETE BATCH: Skipping order with invalid ID:`, order.id);
            shopifyDeletionResults.failedCount++;
            continue;
          }

          try {
            console.log(`🗑️ DELETE BATCH: Deleting Shopify order ${order.id} (${i + 1}/${batch.createdOrders.length})`);
            
            // Use a more specific deletion method
            const deleteResult = await shopifyAPI.deleteOrder(order.id.toString());
            
            shopifyDeletionResults.deletedCount++;
            console.log(`✅ DELETE BATCH: Successfully deleted order ${order.id} from Shopify`);
            
            // Add delay between deletions to avoid rate limits
            if (i < batch.createdOrders.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
          } catch (shopifyError) {
            shopifyDeletionResults.failedCount++;
            console.error(`❌ DELETE BATCH: Failed to delete order ${order.id} from Shopify:`, shopifyError);
            
            // Add delay even on failure
            if (i < batch.createdOrders.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        }
        
        console.log(`🎯 DELETE BATCH: Shopify deletion complete - ${shopifyDeletionResults.deletedCount} deleted, ${shopifyDeletionResults.failedCount} failed`);
      }

      // Now delete the batch from our storage
      console.log(`🗃️ DELETE BATCH: Removing batch ${batchId} from local storage`);
      const deleted = await storage.deleteOrderBatch(batchId);

      if (!deleted) {
        console.log(`❌ DELETE BATCH: Storage deletion failed for batch ${batchId}`);
        return res.status(500).json({ error: "Failed to delete batch from storage" });
      }

      console.log(`🎉 DELETE BATCH: Successfully completed deletion for batch ${batchId}`);
      
      const responseMessage = deleteFromShopify 
        ? `Batch deleted successfully. Shopify orders: ${shopifyDeletionResults.deletedCount} deleted, ${shopifyDeletionResults.failedCount} failed.`
        : "Batch deleted successfully from local storage.";

      res.json({ 
        success: true, 
        message: responseMessage,
        shopifyResults: deleteFromShopify ? shopifyDeletionResults : null
      });
      
    } catch (error) {
      console.error("💥 DELETE BATCH: Critical error during deletion:", error);
      res.status(500).json({ 
        error: "Failed to delete batch", 
        details: (error as Error).message 
      });
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

  // Cancel order creation
  app.post("/api/orders/cancel", async (req, res) => {
    try {
      const { batchId } = req.body;

      if (!batchId) {
        return res.status(400).json({ error: "Batch ID is required" });
      }

      const batch = await storage.getOrderBatchByBatchId(batchId);

      if (!batch) {
        return res.status(404).json({ error: "Batch not found" });
      }

      // Mark batch as failed with cancellation message to stop ongoing creation
      await storage.updateOrderBatch(batch.id, { status: 'failed', errorMessage: 'Cancelled by user' });

      res.json({ 
        success: true, 
        message: "Order creation cancelled successfully",
        batch 
      });
    } catch (error) {
      console.error("❌ Error cancelling order creation:", error);
      res.status(500).json({ error: "Failed to cancel order creation" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}