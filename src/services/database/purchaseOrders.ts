import { where, orderBy, limit as firestoreLimit, deleteField } from 'firebase/firestore';
import { FirestoreService } from './base';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
} from '@/types/models';
import { InventoryService } from './inventory';
import { InventoryBatchService } from './inventoryBatches';
import { UserService } from './users';
import { InventoryStatus, CostingMethod } from '@/types/models';

const COLLECTION = 'purchaseOrders';

function generatePoNumber(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, '0');
  return `PO-${dateStr}-${random}`;
}

export const PurchaseOrderService = {
  /**
   * 建立進貨單
   * @param po - 進貨單資料，可選 poNumber、createdAt 覆寫
   */
  async create(
    input: Omit<PurchaseOrder, 'id' | 'poNumber' | 'status' | 'createdAt' | 'updatedAt'> & {
      poNumber?: string;
      createdAt?: number;
    }
  ): Promise<PurchaseOrder & { id: string }> {
    const { poNumber: inputPoNumber, createdAt: inputCreatedAt, ...po } = input;
    const timestamp = inputCreatedAt ?? Date.now();
    const items = po.items.map((item) => ({
      ...item,
      total: item.quantity * item.unitCost,
    }));
    const subtotal = items.reduce((sum, i) => sum + i.total, 0);
    const poNumber = (inputPoNumber?.trim() || generatePoNumber()).toUpperCase();
    const data: Omit<PurchaseOrder, 'id'> = {
      ...po,
      poNumber,
      status: PurchaseOrderStatus.DRAFT,
      items,
      totals: { subtotal, grandTotal: subtotal },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const id = this._generateId();
    const result = await FirestoreService.set(COLLECTION, id, data);
    return result as PurchaseOrder & { id: string };
  },

  _generateId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);
    return `po_${timestamp}_${random}`;
  },

  /**
   * 確認收貨（觸發庫存更新，加權平均）
   */
  async receive(poId: string): Promise<void> {
    const po = await this.getById(poId);
    if (!po) throw new Error('進貨單不存在');
    if (po.status === PurchaseOrderStatus.RECEIVED) {
      throw new Error('此進貨單已收貨');
    }
    if (po.status === PurchaseOrderStatus.CANCELLED) {
      throw new Error('此進貨單已取消');
    }

    const reference = `PURCHASE: ${poId}`;
    const now = Date.now();

    const useFifo = po.useFifo === true;

    // 向總經銷商進貨：從 ADMIN 扣減並加入經銷商（內部調撥）
    if (po.fromUserId) {
      const fromUser = await UserService.getById(po.fromUserId);
      const fromUserName = fromUser?.displayName || po.fromUserId;
      for (const item of po.items) {
        const fromInv = await InventoryService.getByUserAndProduct(po.fromUserId, item.productId);
        if (!fromInv || fromInv.quantityOnHand < item.quantity) {
          throw new Error(
            `${fromUserName} 缺這個貨：${item.productName} (${item.productId}) 需要 ${item.quantity}，可用 ${fromInv?.quantityOnHand ?? 0}。請至「台灣訂單」向台灣訂貨。`
          );
        }
      }
      const txItems = po.items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitCost,
        total: i.total,
      }));
      const { InventorySyncService } = await import('./inventorySync');
      await InventorySyncService.onTransferCompleted(po.fromUserId, po.userId, txItems, poId);
    } else {
      // 外部供應商進貨：直接加入收貨人庫存
    for (const item of po.items) {
      const inv = await InventoryService.getByUserAndProduct(po.userId, item.productId);
      const qty = item.quantity;
      const unitCost = item.unitCost;
      const shouldUseFifo = useFifo || inv?.costingMethod === CostingMethod.FIFO;

      if (inv?.id) {
        if (shouldUseFifo) {
          // FIFO：新增批次
          await InventoryBatchService.addBatch(
            po.userId,
            item.productId,
            qty,
            unitCost,
            poId
          );
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
          await InventoryService.update(inv.id, {
            quantityOnHand: newQty,
            quantityAvailable: inv.quantityAvailable + qty,
            cost: unitCost,
            marketValue: newQty * unitCost,
            status,
            costingMethod: CostingMethod.FIFO,
            lastMovementDate: now,
            lastReplenishmentDate: now,
            movements: [...(inv.movements || []), movement],
          });
        } else {
          // 加權平均
          const oldQty = inv.quantityOnHand;
          const oldCost = inv.cost;
          const newQty = oldQty + qty;
          const newCost =
            newQty > 0
              ? (oldQty * oldCost + qty * unitCost) / newQty
              : unitCost;

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

          await InventoryService.update(inv.id, {
            quantityOnHand: newQty,
            quantityAvailable: inv.quantityAvailable + qty,
            cost: newCost,
            marketValue: newQty * newCost,
            status,
            lastMovementDate: now,
            lastReplenishmentDate: now,
            movements: [...(inv.movements || []), movement],
          });
        }
      } else {
        // 首次進貨
        if (shouldUseFifo) {
          await InventoryBatchService.addBatch(
            po.userId,
            item.productId,
            qty,
            unitCost,
            poId
          );
          await InventoryService.create({
            userId: po.userId,
            productId: item.productId,
            quantityOnHand: qty,
            quantityAllocated: 0,
            quantityAvailable: qty,
            quantityBorrowed: 0,
            quantityLent: 0,
            reorderLevel: 10,
            costingMethod: CostingMethod.FIFO,
            cost: unitCost,
            marketValue: qty * unitCost,
            status: InventoryStatus.IN_STOCK,
            lastMovementDate: now,
            movements: [{ date: now, type: 'in', quantity: qty, reference }],
          });
        } else {
          await InventoryService.create({
            userId: po.userId,
            productId: item.productId,
            quantityOnHand: qty,
            quantityAllocated: 0,
            quantityAvailable: qty,
            quantityBorrowed: 0,
            quantityLent: 0,
            reorderLevel: 10,
            cost: unitCost,
            marketValue: qty * unitCost,
            status: InventoryStatus.IN_STOCK,
            lastMovementDate: now,
            movements: [{ date: now, type: 'in', quantity: qty, reference }],
          });
        }
      }
    }
    }

    await FirestoreService.update(COLLECTION, poId, {
      status: PurchaseOrderStatus.RECEIVED,
      receivedAt: now,
    } as Partial<PurchaseOrder>);
  },

  /**
   * 取得進貨單
   */
  async getById(id: string): Promise<(PurchaseOrder & { id: string }) | null> {
    return FirestoreService.get<PurchaseOrder>(COLLECTION, id);
  },

  /**
   * 更新進貨單（僅限草稿或已提交，已收貨不可修改）
   */
  async update(
    poId: string,
    updates: Partial<Pick<PurchaseOrder, 'poNumber' | 'supplierName' | 'fromUserId' | 'userId' | 'useFifo' | 'notes' | 'items' | 'totals'>>
  ): Promise<void> {
    const po = await this.getById(poId);
    if (!po) throw new Error('進貨單不存在');
    if (po.status === PurchaseOrderStatus.RECEIVED || po.status === PurchaseOrderStatus.CANCELLED) {
      throw new Error('已收貨或已取消的進貨單無法修改');
    }
    const data: Partial<PurchaseOrder> = { ...updates };
    if (updates.items) {
      const items = updates.items.map((i) => ({
        ...i,
        total: i.quantity * i.unitCost,
      }));
      const grandTotal = items.reduce((s, i) => s + i.total, 0);
      data.items = items;
      data.totals = { subtotal: grandTotal, grandTotal };
    }
    await FirestoreService.update(COLLECTION, poId, data);
  },

  /**
   * 依使用者查詢進貨單（避免複合索引，status 於記憶體過濾）
   */
  async getByUser(
    userId: string,
    status?: PurchaseOrderStatus,
    pageLimit = 50
  ): Promise<(PurchaseOrder & { id: string })[]> {
    const constraints = [
      where('userId', '==', userId),
      orderBy('createdAt', 'desc'),
      firestoreLimit(pageLimit),
    ];
    const results = await FirestoreService.query<PurchaseOrder>(COLLECTION, constraints);
    if (status) {
      return results.filter((r) => r.status === status);
    }
    return results;
  },

  /**
   * 取得所有進貨單（Admin）
   */
  async getAll(
    status?: PurchaseOrderStatus,
    pageLimit = 100
  ): Promise<(PurchaseOrder & { id: string })[]> {
    const constraints = [
      orderBy('createdAt', 'desc'),
      firestoreLimit(pageLimit),
    ];
    const results = await FirestoreService.query<PurchaseOrder>(COLLECTION, constraints);
    if (status) {
      return results.filter((r) => r.status === status);
    }
    return results;
  },

  /**
   * 取消進貨單
   */
  async cancel(poId: string): Promise<void> {
    const po = await this.getById(poId);
    if (!po) throw new Error('進貨單不存在');
    if (po.status === PurchaseOrderStatus.RECEIVED) {
      throw new Error('已收貨的進貨單無法刪除');
    }
    await FirestoreService.update(COLLECTION, poId, {
      status: PurchaseOrderStatus.CANCELLED,
    } as Partial<PurchaseOrder>);
  },

  /**
   * 改回未收貨（撤銷誤按的收貨，恢復庫存）
   */
  async revertReceived(poId: string): Promise<void> {
    const po = await this.getById(poId);
    if (!po) throw new Error('進貨單不存在');
    if (po.status !== PurchaseOrderStatus.RECEIVED) {
      throw new Error('僅已收貨的進貨單可改回未收貨');
    }

    const reference = `PURCHASE-REVERT: ${poId}`;

    if (po.fromUserId) {
      // 向上線進貨：反向調撥（從收貨人扣回、加回上線）
      const txItems = po.items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitCost,
        total: i.total,
      }));
      const { InventorySyncService } = await import('./inventorySync');
      const { ok, insufficient } = await InventorySyncService.validateSaleInventory(po.userId, txItems);
      if (!ok) {
        const msg = insufficient
          .map((i) => `${i.productName} 需要 ${i.need}，庫存僅 ${i.have}`)
          .join('；');
        throw new Error(`收貨人庫存不足，無法撤銷：${msg}`);
      }
      await InventorySyncService.onTransferCompleted(po.userId, po.fromUserId, txItems, `${poId}-revert`);
    } else {
      // 外部進貨：從收貨人扣減
      for (const item of po.items) {
        const inv = await InventoryService.getByUserAndProduct(po.userId, item.productId);
        const have = inv?.quantityOnHand ?? 0;
        if (have < item.quantity) {
          throw new Error(
            `收貨人庫存不足：${item.productName} 需要 ${item.quantity}，庫存僅 ${have}。無法撤銷收貨。`
          );
        }
      }
      for (const item of po.items) {
        await InventoryService.deduct(po.userId, item.productId, item.quantity, reference);
      }
    }

    await FirestoreService.update(COLLECTION, poId, {
      status: PurchaseOrderStatus.SUBMITTED,
      receivedAt: deleteField(),
    } as unknown as Partial<PurchaseOrder>);
  },

  /**
   * 永久刪除進貨單（僅限草稿或已取消）
   */
  async delete(poId: string): Promise<void> {
    const po = await this.getById(poId);
    if (!po) throw new Error('進貨單不存在');
    if (po.status === PurchaseOrderStatus.RECEIVED) {
      throw new Error('已收貨的進貨單無法刪除');
    }
    await FirestoreService.delete(COLLECTION, poId);
  },
};
