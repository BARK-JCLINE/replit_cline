import { OrderConfiguration } from "@shared/schema";

export interface ShopifyLineItem {
  variant_id?: number;
  product_id?: number;
  title: string;
  quantity: number;
  price: string;
  sku?: string;
  fulfillment_service?: string;
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
    this.apiVersion = "2024-07";
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

    return response.json();
  }

  async createOrder(orderData: ShopifyOrder) {
    try {
      console.log("🔧 Creating Shopify order for warehouse:", orderData.tags);
      
      // Get location ID from warehouse tag (format: "contains_kibble, replit, warehouse_om-bbh")
      const warehouseTag = orderData.tags?.split(',').find(tag => tag.trim().startsWith('warehouse_'));
      const warehouse = warehouseTag?.trim().replace('warehouse_', '');
      const locationId = warehouse ? getLocationIdFromWarehouse(warehouse) : undefined;
      console.log("🎯 Warehouse mapping:", warehouse, "->", locationId);

      // Step 1: Create the order normally (let Shopify assign default location)
      const response = await this.makeRequest("/orders.json", "POST", { order: orderData });
      
      if (!response.order) {
        throw new Error("Order creation failed - no order returned");
      }

      console.log("📋 Order created:", response.order.id);
      console.log("🏪 Initial location_id:", response.order.location_id);
      
      // Step 2: If we have a specific warehouse, try inventory-based assignment
      if (locationId) {
        console.log("📦 Attempting inventory-based warehouse assignment to:", locationId);
        
        try {
          // Get the product variants from the order
          const lineItems = response.order.line_items;
          
          for (const item of lineItems) {
            if (item.variant_id) {
              console.log(`🔄 Setting inventory for variant ${item.variant_id} at location ${locationId}`);
              
              // Try to set inventory at the target location
              await this.makeRequest(`/inventory_levels/set.json`, "POST", {
                location_id: locationId,
                inventory_item_id: item.variant_id,
                available: 100 // Ensure stock is available at target location
              });
              
              console.log(`✅ Inventory set for variant ${item.variant_id}`);
            }
          }
          
          console.log("🎯 Inventory-based assignment completed for:", this.getWarehouseNameFromId(locationId));
        } catch (inventoryError) {
          console.error("⚠️ Inventory assignment failed:", inventoryError);
          console.log("📦 Order created but location assignment may have failed");
        }
      }
      
      return response;
    } catch (error) {
      console.error("❌ Error in createOrder:", error);
      throw error;
    }
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
    const fulfillmentData = {
      fulfillment: {
        location_id: locationId,
        notify_customer: false,
        tracking_numbers: [],
        line_items: lineItems ? lineItems.map(item => ({ 
          id: item.id, 
          quantity: item.quantity 
        })) : []
      }
    };
    
    console.log("🔧 Fulfillment data:", JSON.stringify(fulfillmentData, null, 2));
    return this.makeRequest(`/orders/${orderId}/fulfillments.json`, "POST", fulfillmentData);
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
      const response = await this.makeRequest(`/orders/${orderId}.json`, "DELETE");
      return { success: true, message: "Order deleted from Shopify" };
    } catch (error) {
      console.error("Failed to delete order from Shopify:", error);
      throw new Error("Failed to delete order from Shopify");
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

export function createShopifyOrderFromConfig(config: OrderConfiguration): ShopifyOrder {
  console.log("🔧 Creating Shopify order for warehouse:", config.warehouse);
  
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
  
  // Get the Shopify location ID for the selected warehouse
  const locationId = getLocationIdFromWarehouse(config.warehouse);
  console.log("🎯 Warehouse mapping:", config.warehouse, "->", locationId);

  // Get the specific fulfillment service for the warehouse
  const fulfillmentService = getFulfillmentServiceFromWarehouse(config.warehouse);
  console.log("🚚 Using fulfillment service:", fulfillmentService, "for warehouse:", config.warehouse);

  // Convert line items using customer's line items data with specific fulfillment service
  const lineItems: ShopifyLineItem[] = (config.lineItems as any[]).map((item: any) => ({
    title: `Product ${item.productId}`,
    quantity: item.quantity,
    price: "10.00", // Default price - will be updated when we find actual product
    sku: item.productId,
    fulfillment_service: fulfillmentService, // Use specific OM fulfillment service
  }));

  // Create tags from configuration (only use customTags, not subscriptionType)
  const allTags = [
    ...(config.customTags || []),
    "replit",
    `warehouse_${config.warehouse}`, // Add warehouse location to tags
  ];
  const tags = allTags.join(", ");

  return {
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
    location_id: locationId, // Set fulfillment warehouse before auto-fulfillment
  };
}

function getFulfillmentServiceFromWarehouse(warehouse: string): number | string {
  // Use the actual fulfillment service IDs from your Shopify store
  const fulfillmentServiceMap: Record<string, number> = {
    "om-bbl": 67412590867, // OM Fulfillment Service BBL
    "om-bbh": 69071995155, // OM Fulfillment Service BBH
    "om-bbp": 68309319955  // OM Fulfillment Service BBP
  };
  return fulfillmentServiceMap[warehouse] || "manual";
}

export const shopifyAPI = new ShopifyAPI();