import { orderConfigurations, orderBatches, type OrderConfiguration, type InsertOrderConfiguration, type OrderBatch, type InsertOrderBatch } from "@shared/schema";

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

export const storage = new MemStorage();
