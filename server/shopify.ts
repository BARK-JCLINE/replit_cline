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
}

export function createShopifyOrderFromConfig(config: OrderConfiguration): ShopifyOrder {
  // Map addresses
  const getAddressFromConfig = (addressKey: string): ShopifyAddress => {
    switch (addressKey) {
      case "us-columbus":
        return {
          first_name: "Test",
          last_name: "Customer",
          address1: "500 W Broad St",
          city: "Columbus",
          province: "OH",
          country: "United States",
          zip: "43215",
          phone: "+1-614-555-0123",
        };
      case "ca-ottawa":
        return {
          first_name: "Test",
          last_name: "Customer",
          address1: "123 Maple Grove Rd",
          city: "Ottawa",
          province: "ON",
          country: "Canada",
          zip: "K2P 1L4",
          phone: "+1-613-555-0123",
        };
      default:
        return {
          first_name: "Test",
          last_name: "Customer",
          address1: "123 Test Street",
          city: "Test City",
          province: "Test Province",
          country: "United States",
          zip: "12345",
        };
    }
  };

  const address = getAddressFromConfig(config.address);
  
  // Convert line items - for now we'll use SKU as title and set a default price
  const lineItems: ShopifyLineItem[] = config.lineItems.map((item) => ({
    title: `Product ${item.productId}`,
    quantity: item.quantity,
    price: "10.00", // Default price - will be updated when we find actual product
    sku: item.productId,
  }));

  // Create tags from configuration
  const tags = [
    config.subscriptionType,
    config.customTags,
    "QA-Test",
    `Warehouse-${config.warehouse}`,
  ].filter(Boolean).join(", ");

  return {
    line_items: lineItems,
    customer: {
      first_name: address.first_name,
      last_name: address.last_name,
      email: "test@example.com",
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