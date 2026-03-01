import { OrderService } from './orders';
import { InventoryService } from './inventory';
import { Transaction, TransactionType, InventoryStatus } from '@/types/models';

export interface ReconcileChange {
  productId: string;
  oldQty: number;
  newQty: number;
}

/**
 * 從 transactions collection 重新計算每個 SKU 的庫存，
 * 與 hierarchy 頁面的運算邏輯一致（分 SKU 計算），
 * 用於修復 inventory collection 與 transactions 不同步的問題。
 */
export const InventoryReconcileService = {
  async reconcileFromTransactions(userId: string): Promise<ReconcileChange[]> {
    const txns = await OrderService.getByUserRelated(userId, 500);

    // 每個 SKU 的淨數量（與 hierarchy 頁面邏輯相同，分 SKU 計算）
    const netQty: Record<string, number> = {};

    for (const t of txns) {
      const txn = t as Transaction & { id: string };
      const isOut = txn.fromUser?.userId === userId;
      const isIn = txn.toUser?.userId === userId;
      if (!isIn && !isOut) continue;

      for (const item of txn.items ?? []) {
        const sku = item.productId;
        if (netQty[sku] === undefined) netQty[sku] = 0;

        let dir: 'in' | 'out';
        if (txn.transactionType === TransactionType.CONVERSION) {
          dir = item.productId === txn.conversionSource?.productId ? 'out' : 'in';
        } else {
          dir = isOut ? 'out' : 'in';
        }
        netQty[sku] += dir === 'in' ? item.quantity : -item.quantity;
      }
    }

    const changes: ReconcileChange[] = [];

    for (const [sku, qty] of Object.entries(netQty)) {
      const inv = await InventoryService.getByUserAndProduct(userId, sku);
      const oldQty = inv?.quantityOnHand ?? 0;
      const newQty = Math.max(0, qty);

      if (oldQty !== newQty) {
        changes.push({ productId: sku, oldQty, newQty });
        const allocated = inv?.quantityAllocated ?? 0;

        if (inv?.id) {
          await InventoryService.update(inv.id, {
            quantityOnHand: newQty,
            quantityAvailable: Math.max(0, newQty - allocated),
            status:
              newQty === 0
                ? InventoryStatus.OUT_OF_STOCK
                : newQty <= (inv.reorderLevel ?? 10)
                ? InventoryStatus.LOW_STOCK
                : InventoryStatus.IN_STOCK,
          });
        } else if (newQty > 0) {
          await InventoryService.create({
            userId,
            productId: sku,
            quantityOnHand: newQty,
            quantityAllocated: 0,
            quantityAvailable: newQty,
            quantityBorrowed: 0,
            quantityLent: 0,
            reorderLevel: 0,
            cost: 0,
            marketValue: 0,
            status: InventoryStatus.IN_STOCK,
            lastMovementDate: Date.now(),
          });
        }
      }
    }

    return changes;
  },
};
