import { OrderConfiguration } from "@shared/schema";

export interface ShopifyLineItem {
  variant_id?: number;
  product_id?: number;
  title: string;
  quantity: number;
  price: string;
  sku?: string;
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
    return this.makeRequest("/orders.json", "POST", { order: orderData });
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
}

export function createShopifyOrderFromConfig(config: OrderConfiguration): ShopifyOrder {
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
  
  // Convert line items using customer's line items data
  const lineItems: ShopifyLineItem[] = (config.lineItems as any[]).map((item: any) => ({
    title: `Product ${item.productId}`,
    quantity: item.quantity,
    price: "10.00", // Default price - will be updated when we find actual product
    sku: item.productId,
  }));

  // Create tags from configuration (only use customTags, not subscriptionType)
  const allTags = [
    ...(config.customTags || []),
    "replit",
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
    note: `QA Test Order - Config: ${config.name}, Warehouse: ${config.warehouse}`,
    source_name: "QA Test Generator",
    financial_status: "paid",
  };
}

export const shopifyAPI = new ShopifyAPI();