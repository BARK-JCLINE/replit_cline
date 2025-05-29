import { OrderConfiguration } from "@shared/schema";

export interface ShopifyLineItem {
  variant_id?: number;
  product_id?: number;
  title: string;
  quantity: number;
  price: string;
  sku?: string;
  fulfillment_service?: string;
  properties?: Array<{
    name: string;
    value: string;
  }>;
}

export interface ShopifyOrder {
  line_items: ShopifyLineItem[];
  customer?: {
    first_name: string;
    last_name: string;
    email: string;
  };
  billing_address?: ShopifyAddress;
  shipping_address?: ShopifyAddress;
  tags?: string;
  note?: string;
  source_name: "QA Test Generator";
  financial_status: "paid";
  fulfillment_status?: string;
  location_id?: number; // Add location_id to specify warehouse
  metafields?: Array<{
    namespace: string;
    key: string;
    value: string;
    type: string;
  }>;
}

export interface ShopifyAddress {
  first_name: string;
  last_name: string;
  address1: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone?: string;
}

export class ShopifyAPI {
  private baseUrl: string;
  private accessToken: string;
  private apiVersion: string;

  constructor() {
    this.baseUrl = "https://dev-bark-co.myshopify.com";
    this.accessToken = process.env.access_token || "";
    this.apiVersion = "2024-01";
  }

  private async makeRequest(endpoint: string, method: string = "GET", data?: any) {
    const url = `${this.baseUrl}/admin/api/${this.apiVersion}${endpoint}`;

    const headers: Record<string, string> = {
      "X-Shopify-Access-Token": this.accessToken,
      "Content-Type": "application/json",
    };

    const options: RequestInit = {
      method,
      headers,
    };

    if (data) {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Shopify API Error: ${response.status} - ${errorText}`);
    }

    // For DELETE requests, there might not be a JSON response
    if (method === "DELETE" && response.status === 200) {
      return { success: true };
    }

    return response.json();
  }

  async createOrder(orderData: ShopifyOrder) {
    const response = await this.makeRequest("/orders.json", "POST", { order: orderData });
    
    if (!response.order) {
      throw new Error("Order creation failed - no order returned");
    }

    return response;
  }

  private getWarehouseNameFromId(locationId: number): string {
    const warehouseMap: Record<number, string> = {
      96010764563: "BBL",
      105521053971: "BBH", 
      101212520723: "BBP"
    };
    return warehouseMap[locationId] || "UNKNOWN";
  }

  async updateOrderLocationFromTags(orderId: number, locationId: number) {
    console.log("🏷️ Updating order location using tag information");

    // Try multiple approaches to update the location
    const approaches = [
      // Approach 1: Direct order update
      async () => {
        console.log("🔄 Approach 1: Direct order location update");
        const updateData = { order: { location_id: locationId } };
        return await this.makeRequest(`/orders/${orderId}.json`, "PUT", updateData);
      },

      // Approach 2: Update via metafields
      async () => {
        console.log("🔄 Approach 2: Setting location via metafields");
        const metafieldData = {
          metafield: {
            namespace: "warehouse",
            key: "location_id", 
            value: locationId.toString(),
            type: "single_line_text_field"
          }
        };
        return await this.makeRequest(`/orders/${orderId}/metafields.json`, "POST", metafieldData);
      },

      // Approach 3: Update line items with location
      async () => {
        console.log("🔄 Approach 3: Updating line items with location");
        const order = await this.makeRequest(`/orders/${orderId}.json`);
        for (const lineItem of order.order.line_items) {
          const updateData = { 
            line_item: { 
              fulfillment_service: "manual",
              vendor: `WAREHOUSE_${this.getWarehouseNameFromId(locationId)}`
            } 
          };
          await this.makeRequest(`/orders/${orderId}/line_items/${lineItem.id}.json`, "PUT", updateData);
        }
        return { success: true };
      }
    ];

    for (let i = 0; i < approaches.length; i++) {
      try {
        const result = await approaches[i]();
        console.log(`✅ Approach ${i + 1} succeeded!`);
        return result;
      } catch (error) {
        console.log(`❌ Approach ${i + 1} failed:`, error.message);
        if (i === approaches.length - 1) {
          throw error; // Re-throw if all approaches failed
        }
      }
    }
  }

  async getFulfillments(orderId: number) {
    try {
      const response = await this.makeRequest(`/orders/${orderId}/fulfillments.json`);
      return response.fulfillments || [];
    } catch (error) {
      console.log("📋 No existing fulfillments found");
      return [];
    }
  }

  async getFulfillmentOrders(orderId: number) {
    try {
      const response = await this.makeRequest(`/orders/${orderId}/fulfillment_orders.json`);
      return response.fulfillment_orders || [];
    } catch (error) {
      console.error("Error fetching fulfillment orders:", error);
      return [];
    }
  }

  async cancelFulfillmentOrder(fulfillmentOrderId: number) {
    try {
      const response = await this.makeRequest(`/fulfillment_orders/${fulfillmentOrderId}/cancel.json`, "POST");
      return response;
    } catch (error) {
      console.error("Error cancelling fulfillment order:", error);
      throw error;
    }
  }

  async moveToLocation(fulfillmentOrderId: number, locationId: number) {
    try {
      const response = await this.makeRequest(`/fulfillment_orders/${fulfillmentOrderId}/move.json`, "POST", {
        fulfillment_order: {
          new_location_id: locationId
        }
      });
      return response;
    } catch (error) {
      console.error("Error moving fulfillment order:", error);
      throw error;
    }
  }

  async fulfillFromLocation(fulfillmentOrderId: number, locationId: number) {
    try {
      const response = await this.makeRequest(`/fulfillment_orders/${fulfillmentOrderId}/fulfillments.json`, "POST", {
        fulfillment: {
          location_id: locationId,
          notify_customer: false,
          tracking_info: {
            number: "",
            company: ""
          }
        }
      });
      return response;
    } catch (error) {
      console.error("Error fulfilling from location:", error);
      throw error;
    }
  }

  async cancelFulfillment(orderId: number, fulfillmentId: number) {
    return this.makeRequest(`/orders/${orderId}/fulfillments/${fulfillmentId}/cancel.json`, "POST", {});
  }

  async assignLocationWithCredentials(orderId: number, locationId: number, apiKey: string, apiSecret: string) {
    console.log("🔑 Using location API credentials for warehouse assignment");

    // Create fulfillment using the location API credentials
    const fulfillmentData = {
      fulfillment: {
        location_id: locationId,
        notify_customer: false,
        tracking_numbers: []
      }
    };

    const options: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": apiKey,
        "Authorization": `Bearer ${apiSecret}`
      },
      body: JSON.stringify(fulfillmentData)
    };

    const shopDomain = process.env.SHOPIFY_SHOP_DOMAIN;
    const url = `https://${shopDomain}/admin/api/${this.apiVersion}/orders/${orderId}/fulfillments.json`;

    console.log("🚚 Creating fulfillment with location API credentials...");
    const response = await fetch(url, options);

    if (!response.ok) {
      console.error("❌ Location API request failed:", response.status, await response.text());
      throw new Error(`Location API Error: ${response.status}`);
    }

    return response.json();
  }

  async updateLineItemLocation(orderId: number, lineItemId: number, locationId: number) {
    const updateData = {
      line_item: {
        id: lineItemId,
        fulfillment_service: "manual",
        location_id: locationId
      }
    };

    return this.makeRequest(`/orders/${orderId}/line_items/${lineItemId}.json`, "PUT", updateData);
  }

  async createFulfillment(orderId: number, locationId: number, lineItems?: any[]) {
    // Get fresh order data to ensure we have correct line item IDs
    const orderData = await this.makeRequest(`/orders/${orderId}.json`);
    const orderLineItems = orderData.order.line_items;

    const fulfillmentData = {
      fulfillment: {
        location_id: locationId,
        notify_customer: false,
        line_items: orderLineItems.map((item: any) => ({ 
          id: item.id, 
          quantity: item.quantity 
        }))
      }
    };

    console.log("🔧 Fulfillment data:", JSON.stringify(fulfillmentData, null, 2));
    return this.makeRequest(`/orders/${orderId}/fulfillments.json`, "POST", fulfillmentData);
  }

  async fulfillOrderFromWarehouse(orderId: number, warehouse: string) {
    try {
      console.log("🔧 Starting fulfillment process for order:", orderId, "warehouse:", warehouse);

      // Get location ID from warehouse
      const locationId = getLocationIdFromWarehouse(warehouse);
      if (!locationId) {
        throw new Error(`Unknown warehouse: ${warehouse}`);
      }

      console.log("🎯 Warehouse mapping:", warehouse, "->", locationId);

      // Get fulfillment orders for this order
      const fulfillmentOrders = await this.getFulfillmentOrders(orderId);
      console.log("📦 Found fulfillment orders:", fulfillmentOrders.length);

      if (fulfillmentOrders.length === 0) {
        throw new Error("No fulfillment orders found for this order");
      }

      // Process each fulfillment order
      for (const fulfillmentOrder of fulfillmentOrders) {
        if (fulfillmentOrder.status === "open" || fulfillmentOrder.status === "scheduled") {
          console.log("🔄 Moving fulfillment order", fulfillmentOrder.id, "to location:", locationId);

          try {
            // Move to correct location
            await this.moveToLocation(fulfillmentOrder.id, locationId);
            console.log("✅ Moved to warehouse:", this.getWarehouseNameFromId(locationId));

            // Wait a moment for the move to process
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Request fulfillment from the location  
            console.log("📦 Requesting fulfillment from warehouse:", this.getWarehouseNameFromId(locationId));
            const fulfillment = await this.makeRequest(`/fulfillment_orders/${fulfillmentOrder.id}/fulfillment_request.json`, "POST", {
              fulfillment_request: {
                message: "Request fulfillment from warehouse"
              }
            });
            console.log("✅ Order fulfillment requested from:", this.getWarehouseNameFromId(locationId));

            return fulfillment;

          } catch (error) {
            console.error("⚠️ Failed to process fulfillment order:", error);
            throw error;
          }
        }
      }

    } catch (error) {
      console.error("❌ Fulfillment process failed:", error);
      throw error;
    }
  }

  async getProducts(limit: number = 50) {
    return this.makeRequest(`/products.json?limit=${limit}`);
  }

  async getVariants(productId: number) {
    return this.makeRequest(`/products/${productId}/variants.json`);
  }

  async searchProductBySku(sku: string) {
    // First, get all products to search for SKU
    const products = await this.makeRequest("/products.json?limit=250");

    for (const product of products.products) {
      for (const variant of product.variants) {
        if (variant.sku === sku) {
          return {
            product,
            variant,
            product_id: product.id,
            variant_id: variant.id,
            title: product.title,
            price: variant.price,
          };
        }
      }
    }

    return null;
  }

  async getLastOrderNumber() {
    try {
      // Get the most recent orders to find the last BARK order number
      const orders = await this.makeRequest("/orders.json?limit=50&status=any");

      let lastBarkNumber = 271007; // Default starting number if no BARK orders found

      for (const order of orders.orders) {
        if (order.name && order.name.startsWith("BARK-")) {
          const numberPart = order.name.replace("BARK-", "");
          const orderNumber = parseInt(numberPart);
          if (!isNaN(orderNumber) && orderNumber > lastBarkNumber) {
            lastBarkNumber = orderNumber;
          }
        }
      }

      return lastBarkNumber;
    } catch (error) {
      console.error("Failed to get last order number:", error);
      // Return default starting number if API call fails
      return 271007;
    }
  }

  async deleteOrder(orderId: string) {
    try {
      console.log(`🗑️ SHOPIFY DELETE: Starting deletion process for order ${orderId}`);

      // Validate orderId format
      if (!orderId || orderId.trim() === '') {
        throw new Error("Invalid order ID provided");
      }

      // Clean orderId - ensure it's just the numeric ID
      const cleanOrderId = orderId.toString().trim();
      console.log(`🔍 SHOPIFY DELETE: Using clean order ID: ${cleanOrderId}`);

      // First, try to get the order to confirm it exists
      let orderExists = false;
      try {
        await this.makeRequest(`/orders/${cleanOrderId}.json`, "GET");
        orderExists = true;
        console.log(`✅ SHOPIFY DELETE: Order ${cleanOrderId} confirmed to exist`);
      } catch (checkError) {
        console.log(`⚠️ SHOPIFY DELETE: Order ${cleanOrderId} not found - may already be deleted`);
        return { success: true, message: "Order not found or already deleted" };
      }

      if (orderExists) {
        // Perform the actual deletion using explicit DELETE method
        console.log(`🗑️ SHOPIFY DELETE: Executing DELETE request for order ${cleanOrderId}`);

        try {
          // Use the makeRequest method with explicit DELETE 
          await this.makeRequest(`/orders/${cleanOrderId}.json`, "DELETE", undefined);
          console.log(`✅ SHOPIFY DELETE: Successfully sent DELETE request for order ${cleanOrderId}`);

          // Verify deletion by trying to get the order again
          try {
            await this.makeRequest(`/orders/${cleanOrderId}.json`, "GET");
            console.log(`⚠️ SHOPIFY DELETE: Order ${cleanOrderId} still exists after deletion attempt`);
            return { success: false, message: "Order deletion may have failed - order still exists" };
          } catch (verifyError) {
            console.log(`✅ SHOPIFY DELETE: Order ${cleanOrderId} successfully deleted - no longer accessible`);
            return { success: true, message: "Order successfully deleted from Shopify" };
          }

        } catch (deleteError) {
          console.error(`❌ SHOPIFY DELETE: DELETE request failed for order ${cleanOrderId}:`, deleteError);
          throw deleteError;
        }
      }

    } catch (error) {
      console.error(`💥 SHOPIFY DELETE: Critical error deleting order ${orderId}:`, error);

      // Handle specific error cases
      if (error instanceof Error) {
        if (error.message.includes("404")) {
          console.log(`⚠️ SHOPIFY DELETE: Order ${orderId} was already deleted (404 error)`);
          return { success: true, message: "Order was already deleted" };
        }

        if (error.message.includes("403")) {
          throw new Error(`Permission denied - cannot delete order ${orderId}. Check API permissions.`);
        }
      }

      throw new Error(`Failed to delete order ${orderId} from Shopify: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getLocations() {
    return this.makeRequest("/locations.json");
  }

  

  
}

// Map warehouse codes to Shopify location IDs
function getLocationIdFromWarehouse(warehouse: string): number | undefined {
  const warehouseMap: Record<string, number> = {
    "om-bbl": 96010764563, // OM Fulfillment Service BBL
    "om-bbh": 105521053971, // OM Fulfillment Service BBH
    "om-bbp": 101212520723, // OM Fulfillment Service BBP
  };

  return warehouseMap[warehouse];
}

// Cache for product lookups to avoid repeated API calls
const productCache = new Map<string, any>();

export async function createShopifyOrderFromConfig(config: OrderConfiguration): Promise<ShopifyOrder> {
  // Map addresses and use customer details from config
  const getAddressFromConfig = (addressKey: string): ShopifyAddress => {
    const baseAddress = {
      first_name: config.customerFirstName,
      last_name: config.customerLastName,
    };

    switch (addressKey) {
      case "us-columbus":
        return {
          ...baseAddress,
          address1: "500 W Broad St",
          city: "Columbus",
          province: "OH",
          country: "United States",
          zip: "43215",
          phone: "+1-614-555-0123",
        };
      case "ca-ottawa":
        return {
          ...baseAddress,
          address1: "123 Maple Grove Rd",
          city: "Ottawa",
          province: "ON",
          country: "Canada",
          zip: "K2P 1L4",
          phone: "+1-613-555-0123",
        };
      default:
        return {
          ...baseAddress,
          address1: "123 Test Street",
          city: "Test City",
          province: "Test Province",
          country: "United States",
          zip: "12345",
        };
    }
  };

  const address = getAddressFromConfig(config.address);
  const locationId = getLocationIdFromWarehouse(config.warehouse);
  const fulfillmentService = getFulfillmentServiceFromWarehouse(config.warehouse);

  // Convert line items with proper product lookup
  const lineItems: ShopifyLineItem[] = [];
  const shopifyInstance = new ShopifyAPI();

  for (const item of config.lineItems as any[]) {
    // Check cache first
    if (productCache.has(item.productId)) {
      const cachedProduct = productCache.get(item.productId);
      lineItems.push({
        variant_id: cachedProduct.variant_id,
        product_id: cachedProduct.product_id,
        title: cachedProduct.title,
        quantity: item.quantity,
        price: cachedProduct.price,
        sku: item.productId,
        fulfillment_service: fulfillmentService,
      });
      continue;
    }

    // Actually look up the product in Shopify
    try {
      const productData = await shopifyInstance.searchProductBySku(item.productId);
      
      if (productData) {
        // Found real product - use actual data
        const lineItem = {
          variant_id: productData.variant_id,
          product_id: productData.product_id,
          title: productData.title,
          quantity: item.quantity,
          price: productData.price,
          sku: item.productId,
          fulfillment_service: fulfillmentService,
        };

        // Cache the real product data
        productCache.set(item.productId, {
          variant_id: productData.variant_id,
          product_id: productData.product_id,
          title: productData.title,
          price: productData.price,
        });

        lineItems.push(lineItem);
      } else {
        // Product not found - create with SKU only (let Shopify handle it)
        console.warn(`Product with SKU ${item.productId} not found in Shopify`);
        const lineItem = {
          title: `Product ${item.productId}`,
          quantity: item.quantity,
          price: "0.00", // Let Shopify use product price
          sku: item.productId,
          fulfillment_service: fulfillmentService,
        };

        lineItems.push(lineItem);
      }
    } catch (error) {
      console.error(`Error looking up product ${item.productId}:`, error);
      // Fallback to SKU-only line item
      const lineItem = {
        title: `Product ${item.productId}`,
        quantity: item.quantity,
        price: "0.00",
        sku: item.productId,
        fulfillment_service: fulfillmentService,
      };

      lineItems.push(lineItem);
    }
  }

  // Create simple tags from configuration
  const allTags = [
    ...(config.customTags || []),
    "replit",
    `warehouse_${config.warehouse}`,
  ];
  const tags = allTags.join(", ");

  const orderData: ShopifyOrder = {
    line_items: lineItems,
    customer: {
      first_name: config.customerFirstName,
      last_name: config.customerLastName,
      email: config.customerEmail,
    },
    billing_address: address,
    shipping_address: address,
    tags,
    note: `Created with Replit tool - Warehouse: ${config.warehouse.toUpperCase()}`,
    source_name: "QA Test Generator",
    financial_status: "paid",
    location_id: locationId,
  };

  return orderData;
}

function getFulfillmentServiceFromWarehouse(warehouse: string): string {
  // Use manual fulfillment service for all warehouses to avoid invalid service errors
  // The location_id will handle the warehouse assignment correctly
  return "manual";
}



export const shopifyAPI = new ShopifyAPI();