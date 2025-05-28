import { orderConfigurations, orderBatches, type OrderConfiguration, type InsertOrderConfiguration, type OrderBatch, type InsertOrderBatch } from "@shared/schema";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Order Configuration methods
  createOrderConfiguration(config: InsertOrderConfiguration): Promise<OrderConfiguration>;
  getOrderConfiguration(id: number): Promise<OrderConfiguration | undefined>;
  getAllOrderConfigurations(): Promise<OrderConfiguration[]>;
  updateOrderConfiguration(id: number, config: Partial<InsertOrderConfiguration>): Promise<OrderConfiguration | undefined>;
  deleteOrderConfiguration(id: number): Promise<boolean>;

  // Order Batch methods
  createOrderBatch(batch: InsertOrderBatch): Promise<OrderBatch>;
  getOrderBatch(id: number): Promise<OrderBatch | undefined>;
  getOrderBatchByBatchId(batchId: string): Promise<OrderBatch | undefined>;
  getAllOrderBatches(): Promise<OrderBatch[]>;
  updateOrderBatch(id: number, batch: Partial<InsertOrderBatch>): Promise<OrderBatch | undefined>;
  updateOrderBatchProgress(batchId: string, progress: number, status?: string): Promise<OrderBatch | undefined>;
  completeOrderBatch(batchId: string, createdOrders: any[], errorMessage?: string): Promise<OrderBatch | undefined>;
  deleteOrderBatch(id: number): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private orderConfigurations: Map<number, OrderConfiguration>;
  private orderBatches: Map<number, OrderBatch>;
  private currentConfigId: number;
  private currentBatchId: number;

  constructor() {
    this.orderConfigurations = new Map();
    this.orderBatches = new Map();
    this.currentConfigId = 1;
    this.currentBatchId = 1;
  }

  // Order Configuration methods
  async createOrderConfiguration(insertConfig: InsertOrderConfiguration): Promise<OrderConfiguration> {
    const id = this.currentConfigId++;
    const config: OrderConfiguration = {
      ...insertConfig,
      id,
      createdAt: new Date(),
    };
    this.orderConfigurations.set(id, config);
    return config;
  }

  async getOrderConfiguration(id: number): Promise<OrderConfiguration | undefined> {
    return this.orderConfigurations.get(id);
  }

  async getAllOrderConfigurations(): Promise<OrderConfiguration[]> {
    return Array.from(this.orderConfigurations.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async updateOrderConfiguration(id: number, updates: Partial<InsertOrderConfiguration>): Promise<OrderConfiguration | undefined> {
    const existing = this.orderConfigurations.get(id);
    if (!existing) return undefined;

    const updated: OrderConfiguration = { ...existing, ...updates };
    this.orderConfigurations.set(id, updated);
    return updated;
  }

  async deleteOrderConfiguration(id: number): Promise<boolean> {
    return this.orderConfigurations.delete(id);
  }

  // Order Batch methods
  async createOrderBatch(insertBatch: InsertOrderBatch): Promise<OrderBatch> {
    const id = this.currentBatchId++;
    const batch: OrderBatch = {
      ...insertBatch,
      id,
      createdAt: new Date(),
      completedAt: null,
      progress: 0,
      errorMessage: null,
      createdOrders: null,
    };
    this.orderBatches.set(id, batch);
    return batch;
  }

  async getOrderBatch(id: number): Promise<OrderBatch | undefined> {
    return this.orderBatches.get(id);
  }

  async getOrderBatchByBatchId(batchId: string): Promise<OrderBatch | undefined> {
    return Array.from(this.orderBatches.values()).find(batch => batch.batchId === batchId);
  }

  async getAllOrderBatches(): Promise<OrderBatch[]> {
    return Array.from(this.orderBatches.values()).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async updateOrderBatch(id: number, updates: Partial<InsertOrderBatch>): Promise<OrderBatch | undefined> {
    const existing = this.orderBatches.get(id);
    if (!existing) return undefined;

    const updated: OrderBatch = { ...existing, ...updates };
    this.orderBatches.set(id, updated);
    return updated;
  }

  async updateOrderBatchProgress(batchId: string, progress: number, status?: string): Promise<OrderBatch | undefined> {
    const batch = await this.getOrderBatchByBatchId(batchId);
    if (!batch) return undefined;

    const updates: Partial<OrderBatch> = { progress };
    if (status) updates.status = status;

    const updated: OrderBatch = { ...batch, ...updates };
    this.orderBatches.set(batch.id, updated);
    return updated;
  }

  async completeOrderBatch(batchId: string, createdOrders: any[], errorMessage?: string): Promise<OrderBatch | undefined> {
    const batch = await this.getOrderBatchByBatchId(batchId);
    if (!batch) return undefined;

    const updated: OrderBatch = {
      ...batch,
      status: errorMessage ? "failed" : "completed",
      progress: 100,
      createdOrders,
      errorMessage,
      completedAt: new Date(),
    };
    this.orderBatches.set(batch.id, updated);
    return updated;
  }

  async deleteOrderBatch(id: number): Promise<boolean> {
    return this.orderBatches.delete(id);
  }
}

// Database storage implementation for permanent data persistence
class DatabaseStorage implements IStorage {
  private db;

  constructor() {
    const sql = neon(process.env.DATABASE_URL!);
    this.db = drizzle(sql);
  }

  async createOrderConfiguration(insertConfig: InsertOrderConfiguration): Promise<OrderConfiguration> {
    const [config] = await this.db.insert(orderConfigurations).values(insertConfig).returning();
    return config;
  }

  async getOrderConfiguration(id: number): Promise<OrderConfiguration | undefined> {
    const [config] = await this.db.select().from(orderConfigurations).where(eq(orderConfigurations.id, id));
    return config;
  }

  async getAllOrderConfigurations(): Promise<OrderConfiguration[]> {
    return await this.db.select().from(orderConfigurations);
  }

  async updateOrderConfiguration(id: number, updates: Partial<InsertOrderConfiguration>): Promise<OrderConfiguration | undefined> {
    const [updated] = await this.db.update(orderConfigurations).set(updates).where(eq(orderConfigurations.id, id)).returning();
    return updated;
  }

  async deleteOrderConfiguration(id: number): Promise<boolean> {
    const result = await this.db.delete(orderConfigurations).where(eq(orderConfigurations.id, id));
    return result.rowCount > 0;
  }

  async createOrderBatch(insertBatch: InsertOrderBatch): Promise<OrderBatch> {
    const [batch] = await this.db.insert(orderBatches).values(insertBatch).returning();
    return batch;
  }

  async getOrderBatch(id: number): Promise<OrderBatch | undefined> {
    const [batch] = await this.db.select().from(orderBatches).where(eq(orderBatches.id, id));
    return batch;
  }

  async getOrderBatchByBatchId(batchId: string): Promise<OrderBatch | undefined> {
    const [batch] = await this.db.select().from(orderBatches).where(eq(orderBatches.batchId, batchId));
    return batch;
  }

  async getAllOrderBatches(): Promise<OrderBatch[]> {
    return await this.db.select().from(orderBatches);
  }

  async updateOrderBatch(id: number, updates: Partial<InsertOrderBatch>): Promise<OrderBatch | undefined> {
    const [updated] = await this.db.update(orderBatches).set(updates).where(eq(orderBatches.id, id)).returning();
    return updated;
  }

  async updateOrderBatchProgress(batchId: string, progress: number, status?: string): Promise<OrderBatch | undefined> {
    const updates: any = { progress };
    if (status) updates.status = status;

    const [updated] = await this.db.update(orderBatches).set(updates).where(eq(orderBatches.batchId, batchId)).returning();
    return updated;
  }

  async completeOrderBatch(batchId: string, createdOrders: any[], errorMessage?: string, status?: string): Promise<OrderBatch | undefined> {
    const updates: any = {
      status: status || (errorMessage ? "failed" : "completed"),
      progress: 100,
      completedAt: new Date(),
      createdOrders,
    };

    if (errorMessage) {
      updates.errorMessage = errorMessage;
    }

    const [updated] = await this.db.update(orderBatches).set(updates).where(eq(orderBatches.batchId, batchId)).returning();
    return updated;
  }

  async deleteOrderBatch(id: number): Promise<boolean> {
    const result = await this.db.delete(orderBatches).where(eq(orderBatches.id, id));
    return result.rowCount > 0;
  }
}

// Use database storage for permanent persistence
export const storage = new DatabaseStorage();