import { where, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { FirestoreService } from './base';
import {
  TaiwanOrderPool,
  TaiwanOrderAllocation,
  InventoryStatus,
} from '@/types/models';
import { InventoryService } from './inventory';
import { InventoryBatchService } from './inventoryBatches';
import { CostingMethod } from '@/types/models';

const POOL_COLLECTION = 'taiwanOrderPools';
const ALLOCATION_COLLECTION = 'taiwanOrderAllocations';

function generatePoolId(): string {
  const ts = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `tw_${ts}_${r}`;
}

export const TaiwanOrderPoolService = {
  /**
   * 建立台灣訂單池（總經銷商向台灣訂貨，僅數量不指定產品）
   */
  async create(input: {
    userId: string;
    userName?: string;
    totalOrdered: number;
    supplierName?: string;
    poNumber?: string;
    notes?: string;
    createdBy?: string;
  }): Promise<TaiwanOrderPool & { id: string }> {
    if (input.totalOrdered <= 0) throw new Error('訂購數量須大於 0');
    const now = Date.now();
    const pool: Omit<TaiwanOrderPool, 'id'> = {
      userId: input.userId,
      userName: input.userName,
      totalOrdered: input.totalOrdered,
      allocatedQuantity: 0,
      remaining: input.totalOrdered,
      supplierName: input.supplierName || '台灣',
      poNumber: input.poNumber,
      status: 'pending',
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
      createdBy: input.createdBy,
    };
    const id = generatePoolId();
    const result = await FirestoreService.set(POOL_COLLECTION, id, pool);
    return result as TaiwanOrderPool & { id: string };
  },

  async getById(poolId: string): Promise<(TaiwanOrderPool & { id: string }) | null> {
    return FirestoreService.get<TaiwanOrderPool>(POOL_COLLECTION, poolId);
  },

  /**
   * 取得某總經銷商的所有訂單池
   */
  async getByUser(userId: string, limit = 50): Promise<(TaiwanOrderPool & { id: string })[]> {
    const constraints = [
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      firestoreLimit(limit),
    ];
    return FirestoreService.query<TaiwanOrderPool>(POOL_COLLECTION, constraints);
  },

  /**
   * 取得所有訂單池（台灣角色或 Admin 檢視）
   */
  async getAll(limit = 100): Promise<(TaiwanOrderPool & { id: string })[]> {
    const constraints = [
      orderBy('createdAt', 'desc'),
      firestoreLimit(limit),
    ];
    return FirestoreService.query<TaiwanOrderPool>(POOL_COLLECTION, constraints);
  },

  /**
   * 取得某訂單池的分配記錄
   */
  async getAllocationsByPool(poolId: string): Promise<(TaiwanOrderAllocation & { id: string })[]> {
    const constraints = [
      where('poolId', '==', poolId),
      orderBy('createdAt', 'desc'),
    ];
    return FirestoreService.query<TaiwanOrderAllocation>(ALLOCATION_COLLECTION, constraints);
  },

  /**
   * 從訂單池分配入庫（僅填總數量，使用第一個產品作為 placeholder）
   */
  async allocate(
    poolId: string,
    quantity: number,
    createdBy?: string
  ): Promise<void> {
    const pool = await this.getById(poolId);
    if (!pool) throw new Error('訂單池不存在');
    if (pool.remaining <= 0) throw new Error('訂單池已無剩餘可分配');

    const totalQty = Math.floor(quantity) || 0;
    if (totalQty <= 0) throw new Error('請輸入有效的分配數量');
    if (totalQty > pool.remaining) {
      throw new Error(`剩餘可分配 ${pool.remaining} 單位，無法分配 ${totalQty} 單位`);
    }

    const { ProductService } = await import('./products');
    const TAIWAN_PLACEHOLDER = 'Wow+Joy123+Plus+Light-22';
    const allProducts = await ProductService.getAll(undefined, 200);
    const placeholder = allProducts.find((p) => p.name === TAIWAN_PLACEHOLDER || p.sku === TAIWAN_PLACEHOLDER) ?? allProducts[0];
    if (!placeholder) throw new Error('請先建立至少一個產品');

    const productId = placeholder.sku ?? placeholder.id;
    const productName = placeholder.name;
    const unitCost = placeholder.costPrice ?? 0;

    const now = Date.now();
    const reference = `TAIWAN-ALLOC:${poolId}`;

    const inv = await InventoryService.getByUserAndProduct(pool.userId, productId);

    if (inv?.id) {
      const newQty = inv.quantityOnHand + totalQty;
      const movement = {
        date: now,
        type: 'in' as const,
        quantity: totalQty,
        reference,
      };
      let status = InventoryStatus.IN_STOCK;
      if (inv.reorderLevel > 0 && newQty <= inv.reorderLevel) {
        status = InventoryStatus.LOW_STOCK;
      }
      await InventoryBatchService.addBatch(
        pool.userId,
        productId,
        totalQty,
        unitCost,
        poolId
      );
      await InventoryService.update(inv.id, {
        quantityOnHand: newQty,
        quantityAvailable: inv.quantityAvailable + totalQty,
        cost: unitCost,
        marketValue: newQty * unitCost,
        status,
        lastMovementDate: now,
        movements: [...(inv.movements || []), movement],
      });
    } else {
      await InventoryBatchService.addBatch(
        pool.userId,
        productId,
        totalQty,
        unitCost,
        poolId
      );
      await InventoryService.create({
        userId: pool.userId,
        productId,
        quantityOnHand: totalQty,
        quantityAllocated: 0,
        quantityAvailable: totalQty,
        quantityBorrowed: 0,
        quantityLent: 0,
        reorderLevel: 10,
        cost: unitCost,
        marketValue: unitCost * totalQty,
        status: InventoryStatus.IN_STOCK,
        costingMethod: CostingMethod.FIFO,
        lastMovementDate: now,
        movements: [{ date: now, type: 'in', quantity: totalQty, reference }],
      });
    }

    const allocId = `alloc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await FirestoreService.set(ALLOCATION_COLLECTION, allocId, {
      poolId,
      productId,
      productName,
      quantity: totalQty,
      unitCost,
      total: totalQty * unitCost,
      createdAt: now,
      createdBy,
    });

    const newAllocated = pool.allocatedQuantity + totalQty;
    const newRemaining = pool.totalOrdered - newAllocated;
    const newStatus: TaiwanOrderPool['status'] =
      newRemaining <= 0 ? 'fully_allocated' : 'partially_allocated';

    await FirestoreService.update(POOL_COLLECTION, poolId, {
      allocatedQuantity: newAllocated,
      remaining: newRemaining,
      status: newStatus,
      updatedAt: now,
    });
  },
};
