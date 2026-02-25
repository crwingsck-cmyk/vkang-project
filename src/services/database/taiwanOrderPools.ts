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
   * 從訂單池分配產品入庫（指定產品與數量）
   */
  async allocate(
    poolId: string,
    items: { productId: string; productName: string; quantity: number; unitCost: number }[],
    createdBy?: string
  ): Promise<void> {
    const pool = await this.getById(poolId);
    if (!pool) throw new Error('訂單池不存在');
    if (pool.remaining <= 0) throw new Error('訂單池已無剩餘可分配');

    const validItems = items.filter((i) => i.productId && i.quantity > 0 && i.unitCost >= 0);
    const totalQty = validItems.reduce((s, i) => s + i.quantity, 0);
    if (totalQty <= 0) throw new Error('請至少分配一筆商品');
    if (totalQty > pool.remaining) {
      throw new Error(`剩餘可分配 ${pool.remaining} 單位，無法分配 ${totalQty} 單位`);
    }

    const now = Date.now();
    const reference = `TAIWAN-ALLOC:${poolId}`;

    for (const item of validItems) {
      const { productId, productName, quantity: qty, unitCost } = item;

      const inv = await InventoryService.getByUserAndProduct(pool.userId, productId);

      if (inv?.id) {
        const newQty = inv.quantityOnHand + qty;
        const movement = {
          date: now,
          type: 'in' as const,
          quantity: qty,
          reference,
        };
        let status = InventoryStatus.IN_STOCK;
        if (inv.reorderLevel > 0 && newQty <= inv.reorderLevel) {
          status = InventoryStatus.LOW_STOCK;
        }
        await InventoryBatchService.addBatch(
          pool.userId,
          productId,
          qty,
          unitCost,
          poolId
        );
        await InventoryService.update(inv.id, {
          quantityOnHand: newQty,
          quantityAvailable: inv.quantityAvailable + qty,
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
          qty,
          unitCost,
          poolId
        );
        await InventoryService.create({
          userId: pool.userId,
          productId,
          quantityOnHand: qty,
          quantityAllocated: 0,
          quantityAvailable: qty,
          quantityBorrowed: 0,
          quantityLent: 0,
          reorderLevel: 10,
          cost: unitCost,
          marketValue: unitCost * qty,
          status: InventoryStatus.IN_STOCK,
          costingMethod: CostingMethod.FIFO,
          lastMovementDate: now,
          movements: [{ date: now, type: 'in', quantity: qty, reference }],
        });
      }

      const allocId = `alloc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await FirestoreService.set(ALLOCATION_COLLECTION, allocId, {
        poolId,
        productId,
        productName,
        quantity: qty,
        unitCost,
        total: qty * unitCost,
        createdAt: now,
        createdBy,
      });
    }

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
