import { InventoryService } from './inventory';
import { InventoryBatchService } from './inventoryBatches';
import { TransactionItem, InventoryStatus, CostingMethod } from '@/types/models';

/**
 * Handles automatic inventory movements triggered by transaction status changes.
 *
 * Rules:
 *   SALE completed      → deduct from seller (fromUser), add to buyer (toUser)
 *   TRANSFER completed  → deduct from sender (fromUser), add to receiver (toUser)
 *   LOAN created        → deduct from lender (fromUser), add to borrower (toUser)
 *   LOAN returned       → add back to lender (fromUser), deduct from borrower (toUser)
 */
export const InventorySyncService = {
  /**
   * 檢查賣方庫存是否足夠，不足則拋錯
   * 「批量進貨」：檢查總庫存（不分產品），與經銷商總覽的庫存總數一致
   */
  async validateSaleInventory(
    fromUserId: string,
    items: TransactionItem[]
  ): Promise<{ ok: boolean; insufficient: { productId: string; productName: string; need: number; have: number }[] }> {
    const insufficient: { productId: string; productName: string; need: number; have: number }[] = [];
    const bulkItems = items.filter((i) => i.productName === '批量進貨');
    const normalItems = items.filter((i) => i.productName !== '批量進貨');

    if (bulkItems.length > 0) {
      const bulkNeed = bulkItems.reduce((s, i) => s + i.quantity, 0);
      const allInv = await InventoryService.getByUser(fromUserId, 200);
      const totalHave = allInv.reduce((s, i) => s + (i.quantityOnHand ?? 0), 0);
      if (totalHave < bulkNeed) {
        insufficient.push({
          productId: bulkItems[0].productId,
          productName: '批量進貨',
          need: bulkNeed,
          have: totalHave,
        });
      }
    }

    for (const item of normalItems) {
      const inv = await InventoryService.getByUserAndProduct(fromUserId, item.productId);
      const have = inv?.quantityOnHand ?? 0;
      if (have < item.quantity) {
        insufficient.push({
          productId: item.productId,
          productName: item.productName,
          need: item.quantity,
          have,
        });
      }
    }
    return { ok: insufficient.length === 0, insufficient };
  },

  async onSaleCompleted(
    fromUserId: string,
    toUserId: string | undefined,
    items: TransactionItem[],
    transactionId: string
  ) {
    const { ok, insufficient } = await this.validateSaleInventory(fromUserId, items);
    if (!ok) {
      const msg = insufficient
        .map((i) => `${i.productName} 需要 ${i.need}，庫存僅 ${i.have}`)
        .join('；');
      throw new Error(`賣方庫存不足：${msg}。請先至「進貨」補貨（總經銷商向台灣進貨、經銷商向總經銷商進貨）。`);
    }
    const ref = `SALE: ${transactionId}`;
    await _replenishPlaceholderForBulk(fromUserId, items, ref);
    await _deduct(fromUserId, items, ref);
    if (toUserId && toUserId !== fromUserId) {
      await _add(toUserId, items, ref);
    }
  },

  /**
   * 訂單從完成改回待處理時，恢復賣方庫存、扣除買方庫存
   */
  async onSaleReverted(
    fromUserId: string,
    toUserId: string | undefined,
    items: TransactionItem[],
    transactionId: string
  ) {
    await _add(fromUserId, items, `SALE-REVERT: ${transactionId}`);
    if (toUserId && toUserId !== fromUserId) {
      await _deduct(toUserId, items, `SALE-REVERT: ${transactionId}`);
    }
  },

  async onTransferCompleted(
    fromUserId: string,
    toUserId: string,
    items: TransactionItem[],
    transactionId: string
  ) {
    const ref = `TRANSFER: ${transactionId}`;
    await _deduct(fromUserId, items, ref);
    await _add(toUserId, items, ref);
  },

  async onLoanCreated(
    fromUserId: string,
    toUserId: string,
    items: TransactionItem[],
    transactionId: string
  ) {
    const ref = `LOAN-OUT: ${transactionId}`;
    await _deduct(fromUserId, items, ref);
    await _add(toUserId, items, ref);
  },

  async onLoanReturned(
    fromUserId: string,
    toUserId: string,
    items: TransactionItem[],
    transactionId: string
  ) {
    const ref = `LOAN-RETURN: ${transactionId}`;
    await _add(fromUserId, items, ref);
    await _deduct(toUserId, items, ref);
  },
};

async function _replenishPlaceholderForBulk(userId: string, items: TransactionItem[], reference: string) {
  const bulkItems = items.filter((i) => i.productName === '批量進貨');
  if (bulkItems.length === 0) return;
  const bulkNeed = bulkItems.reduce((s, i) => s + i.quantity, 0);
  const placeholderProductId = bulkItems[0].productId;
  let placeholderInv = await InventoryService.getByUserAndProduct(userId, placeholderProductId);
  const placeholderHave = placeholderInv?.quantityOnHand ?? 0;
  if (placeholderHave >= bulkNeed) return;

  let toMove = bulkNeed - placeholderHave;
  const allInv = await InventoryService.getByUser(userId, 200);
  const others = allInv
    .filter((i) => i.productId !== placeholderProductId && (i.quantityOnHand ?? 0) > 0)
    .sort((a, b) => (b.quantityOnHand ?? 0) - (a.quantityOnHand ?? 0));

  for (const inv of others) {
    if (toMove <= 0 || !inv.id) break;
    const moveQty = Math.min(inv.quantityOnHand ?? 0, toMove);
    if (moveQty <= 0) continue;
    await InventoryService.deduct(userId, inv.productId, moveQty, `${reference}-replenish`);
    placeholderInv = await InventoryService.getByUserAndProduct(userId, placeholderProductId);
    if (placeholderInv?.id) {
      await InventoryService.adjust(placeholderInv.id, moveQty, `${reference}-replenish`, placeholderInv);
    } else {
      const unitCost = inv.cost ?? 0;
      await InventoryService.create({
        userId,
        productId: placeholderProductId,
        quantityOnHand: moveQty,
        quantityAllocated: 0,
        quantityAvailable: moveQty,
        quantityBorrowed: 0,
        quantityLent: 0,
        reorderLevel: 10,
        cost: unitCost,
        marketValue: moveQty * unitCost,
        status: InventoryStatus.IN_STOCK,
        lastMovementDate: Date.now(),
        movements: [{ date: Date.now(), type: 'adjustment', quantity: moveQty, reference: `${reference}-replenish` }],
      });
    }
    toMove -= moveQty;
  }
}

async function _deduct(userId: string, items: TransactionItem[], reference: string) {
  for (const item of items) {
    await InventoryService.deduct(userId, item.productId, item.quantity, reference);
  }
}

async function _add(userId: string, items: TransactionItem[], reference: string) {
  const now = Date.now();
  for (const item of items) {
    const inv = await InventoryService.getByUserAndProduct(userId, item.productId);
    const unitCost = item.unitPrice ?? item.costPrice ?? 0;

    if (inv?.id) {
      if (inv.costingMethod === CostingMethod.FIFO) {
        await InventoryBatchService.addBatch(
          userId,
          item.productId,
          item.quantity,
          unitCost,
          reference
        );
        const newQty = inv.quantityOnHand + item.quantity;
        const movement = {
          date: now,
          type: 'in' as const,
          quantity: item.quantity,
          reference,
        };
        let status = InventoryStatus.IN_STOCK;
        if (inv.reorderLevel > 0 && newQty <= inv.reorderLevel) {
          status = InventoryStatus.LOW_STOCK;
        }
        await InventoryService.update(inv.id, {
          quantityOnHand: newQty,
          quantityAvailable: inv.quantityAvailable + item.quantity,
          cost: unitCost,
          marketValue: newQty * unitCost,
          status,
          lastMovementDate: now,
          movements: [...(inv.movements || []), movement],
        });
      } else {
        await InventoryService.adjust(inv.id, item.quantity, reference, inv);
      }
    } else {
      await InventoryService.create({
        userId,
        productId: item.productId,
        quantityOnHand: item.quantity,
        quantityAllocated: 0,
        quantityAvailable: item.quantity,
        quantityBorrowed: 0,
        quantityLent: 0,
        reorderLevel: 10,
        cost: unitCost,
        marketValue: unitCost * item.quantity,
        status: InventoryStatus.IN_STOCK,
        lastMovementDate: now,
        movements: [{ date: now, type: 'in', quantity: item.quantity, reference }],
      });
    }
  }
}
