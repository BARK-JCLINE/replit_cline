import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const orderConfigurations = pgTable("order_configurations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  warehouse: text("warehouse").notNull(),
  address: text("address").notNull(),
  lineItems: jsonb("line_items").notNull(),
  subscriptionType: text("subscription_type"),
  customerSegment: text("customer_segment"),
  customTags: text("custom_tags"),
  addressTemplate: text("address_template"),
  stateProvince: text("state_province"),
  customerFirstName: text("customer_first_name").notNull(),
  customerLastName: text("customer_last_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  orderCount: integer("order_count").notNull().default(1),
  orderDelay: integer("order_delay").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orderBatches = pgTable("order_batches", {
  id: serial("id").primaryKey(),
  batchId: text("batch_id").notNull().unique(),
  configurationId: integer("configuration_id").references(() => orderConfigurations.id),
  orderCount: integer("order_count").notNull(),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  progress: integer("progress").default(0),
  errorMessage: text("error_message"),
  createdOrders: jsonb("created_orders"), // Array of created order IDs
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

// Line Item Schema
export const lineItemSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  quantity: z.number().min(1).max(10),
});

// Order Configuration Schemas
export const insertOrderConfigurationSchema = createInsertSchema(orderConfigurations, {
  lineItems: z.array(lineItemSchema).min(1, "At least one line item is required"),
  warehouse: z.string().min(1, "Warehouse is required"),
  address: z.string().min(1, "Address is required"),
  customerFirstName: z.string().min(1, "First name is required"),
  customerLastName: z.string().min(1, "Last name is required"),
  customerEmail: z.string().email("Valid email is required"),
  orderCount: z.number().min(1).max(100),
  orderDelay: z.number().min(0).max(60),
}).omit({
  id: true,
  createdAt: true,
});

export const insertOrderBatchSchema = createInsertSchema(orderBatches, {
  batchId: z.string().min(1),
  orderCount: z.number().min(1).max(100),
  status: z.enum(["pending", "processing", "completed", "failed"]),
}).omit({
  id: true,
  createdAt: true,
  completedAt: true,
  progress: true,
});

export type LineItem = z.infer<typeof lineItemSchema>;
export type InsertOrderConfiguration = z.infer<typeof insertOrderConfigurationSchema>;
export type OrderConfiguration = typeof orderConfigurations.$inferSelect;
export type InsertOrderBatch = z.infer<typeof insertOrderBatchSchema>;
export type OrderBatch = typeof orderBatches.$inferSelect;

// Frontend-specific types
export type OrderPreview = {
  warehouse: string;
  region: string;
  lineItemCount: number;
  subType: string;
  orderCount: number;
};

export type OrderCreationProgress = {
  percentage: number;
  status: string;
  current: number;
  total: number;
};
