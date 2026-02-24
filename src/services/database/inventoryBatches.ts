import { where, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { FirestoreService } from './base';
import { InventoryBatch } from '@/types/models';

const COLLECTION = 'inventoryBatches';

export const InventoryBatchService = {
  /**
   * 新增批次（進貨時）
   */
  async addBatch(
    userId: string,
    productId: string,
    quantity: number,
    unitCost: number,
    purchaseOrderId: string
  ): Promise<InventoryBatch & { id: string }> {
    const now = Date.now();
    const id = this._generateId();
    const data: Omit<InventoryBatch, 'id'> = {
      userId,
      productId,
      purchaseOrderId,
      quantity,
      unitCost,
      receivedAt: now,
      createdAt: now,
    };
    const result = await FirestoreService.set(COLLECTION, id, data);
    return result as InventoryBatch & { id: string };
  },

  _generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `batch_${timestamp}_${random}`;
  },

  /**
   * 查詢某產品所有批次（依 receivedAt 升序，FIFO 用）
   */
  async getBatchesByUserAndProduct(
    userId: string,
    productId: string
  ): Promise<(InventoryBatch & { id: string })[]> {
    const constraints = [
      where('userId', '==', userId),
      where('productId', '==', productId),
      orderBy('receivedAt', 'asc'),
      firestoreLimit(100),
    ];
    const results = await FirestoreService.query<InventoryBatch>(
      COLLECTION,
      constraints
    );
    return results.filter((b) => b.quantity > 0);
  },

  /**
   * FIFO 扣減：從最早批次開始扣，回傳實際扣減數量與使用的成本
   */
  async deductFifo(
    userId: string,
    productId: string,
    quantity: number
  ): Promise<{ deducted: number; costUsed: number }> {
    const batches = await this.getBatchesByUserAndProduct(userId, productId);
    let remaining = quantity;
    let totalCostUsed = 0;

    for (const batch of batches) {
      if (remaining <= 0 || !batch.id) break;
      const deductFromBatch = Math.min(remaining, batch.quantity);
      if (deductFromBatch <= 0) continue;

      const newQty = batch.quantity - deductFromBatch;
      totalCostUsed += deductFromBatch * batch.unitCost;
      remaining -= deductFromBatch;

      if (newQty <= 0) {
        await FirestoreService.update(COLLECTION, batch.id, {
          quantity: 0,
        } as Partial<InventoryBatch>);
      } else {
        await FirestoreService.update(COLLECTION, batch.id, {
          quantity: newQty,
        } as Partial<InventoryBatch>);
      }
    }

    return {
      deducted: quantity - remaining,
      costUsed: totalCostUsed,
    };
  },

  /**
   * 取得某產品批次總數量（用於驗證）
   */
  async getTotalQuantity(
    userId: string,
    productId: string
  ): Promise<number> {
    const batches = await this.getBatchesByUserAndProduct(userId, productId);
    return batches.reduce((sum, b) => sum + b.quantity, 0);
  },
};
