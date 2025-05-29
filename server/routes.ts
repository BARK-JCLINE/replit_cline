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

      // Pre-create the order template once to avoid repeated processing
      const orderTemplate = await createShopifyOrderFromConfig(orderConfig);
      const processedLineItems = orderTemplate.line_items.map(lineItem => ({
        variant_id: lineItem.variant_id,
        product_id: lineItem.product_id,
        title: lineItem.title,
        quantity: lineItem.quantity,
        price: lineItem.price,
        sku: lineItem.sku,
        fulfillment_service: "manual"
      }));

      const createdOrders = [];
      const BATCH_SIZE = 10; // Process 10 orders simultaneously

      // Process orders in parallel batches
      for (let batchStart = 0; batchStart < orderCount; batchStart += BATCH_SIZE) {
        const batchEnd = Math.min(batchStart + BATCH_SIZE, orderCount);
        
        // Check for cancellation once per batch
        const currentBatch = await storage.getOrderBatchByBatchId(batchId);
        if (currentBatch && currentBatch.status === 'failed' && currentBatch.errorMessage === 'Cancelled by user') {
          console.log(`🛑 ORDER CREATION: Batch ${batchId} was cancelled, stopping at order ${batchStart + 1}/${orderCount}`);
          break;
        }

        // Create promises for this batch
        const batchPromises = [];
        for (let i = batchStart; i < batchEnd; i++) {
          const orderPromise = (async (orderIndex: number) => {
            try {
              // Clone the template instead of recreating it
              const shopifyOrderData = {
                ...orderTemplate,
                line_items: [...processedLineItems]
              };

              const shopifyResponse = await shopifyAPI.createOrder(shopifyOrderData);

              return {
                id: shopifyResponse.order.id,
                shopify_order_number: shopifyResponse.order.order_number,
                shopify_order_name: shopifyResponse.order.name,
                name: shopifyResponse.order.name,
                warehouse: orderConfig.warehouse,
                address: orderConfig.address,
                lineItems: orderConfig.lineItems,
                tags: shopifyResponse.order.tags,
                total_price: shopifyResponse.order.total_price,
                financial_status: shopifyResponse.order.financial_status,
                fulfillment_status: shopifyResponse.order.fulfillment_status,
                createdAt: shopifyResponse.order.created_at,
                shopify_admin_url: `https://dev-bark-co.myshopify.com/admin/orders/${shopifyResponse.order.id}`
              };
            } catch (orderError) {
              console.error(`Failed to create order ${orderIndex + 1}:`, orderError);
              return {
                error: true,
                message: `Failed to create order ${orderIndex + 1}: ${orderError instanceof Error ? orderError.message : 'Unknown error'}`,
                orderIndex: orderIndex + 1
              };
            }
          })(i);

          batchPromises.push(orderPromise);
        }

        // Wait for all orders in this batch to complete
        const batchResults = await Promise.all(batchPromises);
        createdOrders.push(...batchResults);

        // Update progress after each batch
        const progress = Math.round((batchEnd / orderCount) * 100);
        await storage.updateOrderBatchProgress(batchId, progress);

        console.log(`📦 Completed batch ${Math.floor(batchStart/BATCH_SIZE) + 1}: ${batchEnd}/${orderCount} orders processed`);
      }

      // Complete the batch
      const currentBatch = await storage.getOrderBatchByBatchId(batchId);
      const wasCancelled = currentBatch && currentBatch.status === 'failed' && currentBatch.errorMessage === 'Cancelled by user';
      const hasErrors = createdOrders.some((order: any) => order.error);
      const successfulOrders = createdOrders.filter((order: any) => !order.error);

      // Determine final status
      let finalStatus = 'completed';
      let errorMessage = undefined;

      if (wasCancelled) {
        if (successfulOrders.length === 0) {
          // No orders created before cancellation
          finalStatus = 'failed';
          errorMessage = "Cancelled by user";
        } else {
          // Some orders were created before cancellation
          finalStatus = 'partial';
          errorMessage = `Cancelled by user - ${successfulOrders.length} of ${orderCount} orders created`;
        }
      } else if (hasErrors) {
        if (successfulOrders.length === 0) {
          // All orders failed
          finalStatus = 'failed';
          errorMessage = "All orders failed to create";
        } else if (successfulOrders.length < orderCount) {
          // Some orders succeeded, some failed - new partial status
          finalStatus = 'partial';
          errorMessage = `${successfulOrders.length} of ${orderCount} orders created successfully`;
        }
      }

      // Always update the batch with the final status and created orders
      await storage.completeOrderBatch(batchId, createdOrders, errorMessage, finalStatus);

      const finalBatch = await storage.getOrderBatchByBatchId(batchId);
      const finalWasCancelled = finalBatch && finalBatch.status === 'failed' && finalBatch.errorMessage === 'Cancelled by user';

      res.json({ 
        success: !finalWasCancelled, 
        batchId,
        ordersCreated: successfulOrders.length,
        orders: createdOrders,
        hasErrors: hasErrors || finalWasCancelled,
        cancelled: finalWasCancelled
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

        // Process deletions in parallel batches for speed
        const BATCH_SIZE = 5; // Process 5 deletions at a time
        const validOrders = batch.createdOrders.filter(order => 
          order.id && (typeof order.id === 'string' || typeof order.id === 'number')
        );

        console.log(`📊 DELETE BATCH: Processing ${validOrders.length} valid orders in batches of ${BATCH_SIZE}`);

        for (let i = 0; i < validOrders.length; i += BATCH_SIZE) {
          const batchOrders = validOrders.slice(i, i + BATCH_SIZE);

          // Process this batch in parallel
          const batchPromises = batchOrders.map(async (order, index) => {
            try {
              console.log(`🗑️ DELETE BATCH: Deleting Shopify order ${order.id} (${i + index + 1}/${validOrders.length})`);
              await shopifyAPI.deleteOrder(order.id.toString());
              console.log(`✅ DELETE BATCH: Successfully deleted order ${order.id}`);
              return { success: true, orderId: order.id };
            } catch (shopifyError) {
              console.error(`❌ DELETE BATCH: Failed to delete order ${order.id}:`, shopifyError);
              return { success: false, orderId: order.id, error: shopifyError };
            }
          });

          // Wait for this batch to complete
          const batchResults = await Promise.all(batchPromises);

          // Update counters
          batchResults.forEach(result => {
            if (result.success) {
              shopifyDeletionResults.deletedCount++;
            } else {
              shopifyDeletionResults.failedCount++;
            }
          });

          // Small delay between batches to avoid overwhelming the API
          if (i + BATCH_SIZE < validOrders.length) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }

        // Account for invalid orders
        shopifyDeletionResults.failedCount += (batch.createdOrders.length - validOrders.length);

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

  // Generate CSV for Matrixify
  app.post("/api/generate-csv", async (req, res) => {
    try {
      const config = req.body as any;

      // If randomizeData is true, we don't need to validate specific fields
      if (!config.randomizeData && (!config.warehouse || !config.address || !config.lineItems?.length)) {
        return res.status(400).json({ error: "Missing required fields: warehouse, address, and line items" });
      }

      // SKU to Variant ID mapping - based on actual Shopify data
      const skuToVariantId: Record<string, string> = {
        "B0-A0-B-M": "51747934634259",
        "S0-A0-B-S": "50680349688083", 
        "213114": "50680349720851",
        "209749-LN": "50680349753619",
        // Add more mappings as needed
      };

      // Function to get variant ID from SKU or return the original if it's already a variant ID
      const getVariantId = (productId: string): string => {
        // If it's already a numeric variant ID, return as-is
        if (/^\d+$/.test(productId)) {
          return productId;
        }
        // Otherwise look up the SKU mapping
        return skuToVariantId[productId] || "50680349688083"; // Default variant ID
      };

      // Random data generators
      const getRandomName = () => {
        const firstNames = ["Alex", "Jamie", "Taylor", "Jordan", "Casey", "Riley", "Avery", "Morgan", "Quinn", "Sage"];
        const lastNames = ["Smith", "Johnson", "Brown", "Davis", "Wilson", "Miller", "Moore", "Taylor", "Anderson", "Thomas"];
        return {
          first: firstNames[Math.floor(Math.random() * firstNames.length)],
          last: lastNames[Math.floor(Math.random() * lastNames.length)]
        };
      };

      const getRandomEmail = (firstName: string, lastName: string) => {
        const domains = ["example.com", "test.com", "demo.com"];
        return `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domains[Math.floor(Math.random() * domains.length)]}`;
      };

      const getRandomAddress = () => {
        const addresses = [
          { address1: "123 Main St", city: "New York", zip: "10001", province: "NY", country: "US" },
          { address1: "456 Oak Ave", city: "Los Angeles", zip: "90210", province: "CA", country: "US" },
          { address1: "789 Pine St", city: "Chicago", zip: "60601", province: "IL", country: "US" },
          { address1: "321 Elm Dr", city: "Houston", zip: "77001", province: "TX", country: "US" },
          { address1: "654 Maple Ln", city: "Phoenix", zip: "85001", province: "AZ", country: "US" }
        ];
        return addresses[Math.floor(Math.random() * addresses.length)];
      };

      const getRandomWarehouse = () => {
        const warehouses = ["om-bbl", "om-bbh", "om-bbp"];
        return warehouses[Math.floor(Math.random() * warehouses.length)];
      };

      const getRandomProductId = () => {
        const products = ["51747934634259", "50680349688083", "50680349720851", "50680349753619"];
        return products[Math.floor(Math.random() * products.length)];
      };

      // Helper function to get address from config or random
      const getAddressFromConfig = (addressType: string) => {
        if (config.randomizeData) {
          return getRandomAddress();
        }

        const addressTemplates = {
          "us-midwest": {
            address1: "500 W Broad St",
            address2: "",
            city: "Columbus",
            zip: "43215",
            province: "OH",
            country: "US"
          },
          "us-west": {
            address1: "123 Main St",
            address2: "",
            city: "Los Angeles", 
            zip: "90210",
            province: "CA",
            country: "US"
          },
          "us-east": {
            address1: "456 Broadway",
            address2: "",
            city: "New York",
            zip: "10001", 
            province: "NY",
            country: "US"
          }
        };

        return addressTemplates[addressType as keyof typeof addressTemplates] || {
          address1: "500 W Broad St",
          address2: "",
          city: "Columbus",
          zip: "43215",
          province: "OH",
          country: "US"
        };
      };

      // Get fulfillment location
      const getLocationFromWarehouse = (warehouse: string) => {
        const warehouseMap: Record<string, string> = {
          "om-bbl": "OM Fulfillment Service BBL",
          "om-bbh": "OM Fulfillment Service BBH", 
          "om-bbp": "OM Fulfillment Service BBP"
        };
        return warehouseMap[warehouse] || "OM Fulfillment Service BBL";
      };

      // Generate CSV content
      const csvHeaders = [
        "Command",
        "Number", 
        "Customer: Email",
        "Shipping: Name",
        "Shipping: Address 1",
        "Shipping: Address 2", 
        "Shipping: City",
        "Shipping: Zip",
        "Shipping: Province",
        "Shipping: Country",
        "Line: Type",
        "Line: Variant ID",
        "Line: Quantity", 
        "Line: Price",
        "Tags",
        "Note",
        "Payment Status",
        "Fulfillment: Status",
        "Fulfillment: Location"
      ];

      const csvRows = [];

      // Generate rows for each order
      for (let orderNum = 1; orderNum <= config.orderCount; orderNum++) {
        // Generate data for this order (randomized or from config)
        let customerName, customerEmail, address, warehouse, lineItems;

        if (config.randomizeData) {
          const randomName = getRandomName();
          customerName = `${randomName.first} ${randomName.last}`;
          customerEmail = getRandomEmail(randomName.first, randomName.last);
          address = getRandomAddress();
          warehouse = getRandomWarehouse();
          lineItems = [{ productId: getRandomProductId(), quantity: Math.floor(Math.random() * 3) + 1 }];
        } else {
          customerName = `${config.customerFirstName || "Jackie"} ${config.customerLastName || "Cline"}`;
          customerEmail = config.customerEmail || "jcline+replit@barkbox.com";
          address = getAddressFromConfig(config.address);
          warehouse = config.warehouse;
          lineItems = config.lineItems || [{ productId: "B0-A0-B-M", quantity: 1 }];
        }

        const location = getLocationFromWarehouse(warehouse);

        // Create tags
        const allTags = [
          ...(config.randomizeData ? ["random-data"] : (config.customTags || [])),
          "replit",
          `warehouse_${warehouse}`
        ];
        const tags = allTags.join(", ");

        // For each line item in the order
        for (let itemIndex = 0; itemIndex < lineItems.length; itemIndex++) {
          const lineItem = lineItems[itemIndex];

          const row = [
            "New",
            "", // Number - let Shopify auto-generate
            customerEmail,
            customerName,
            address.address1,
            address.address2 || "",
            address.city, 
            address.zip,
            address.province,
            address.country,
            "Line Item",
            getVariantId(lineItem.productId), // Convert SKU to variant ID
            lineItem.quantity,
            "0", // Price - let Shopify use product price
            tags,
            `Created with Replit tool - Warehouse: ${warehouse.toUpperCase()}${config.randomizeData ? " (Random Data)" : ""}`,
            "paid",
            "success",
            location
          ];

          csvRows.push(row);
        }
      }

      // Convert to CSV format
      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.map(cell => `"${cell}"`).join(","))
        .join("\n");

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="shopify-orders.csv"');
      res.send(csvContent);
    } catch (error) {
      console.error("CSV generation failed:", error);
      res.status(500).json({ error: "Failed to generate CSV" });
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