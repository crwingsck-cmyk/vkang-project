import { where, orderBy, limit } from 'firebase/firestore';
import { FirestoreService } from './base';
import { DeliveryNote, DeliveryNoteStatus, ReceivableStatus } from '@/types/models';
import { InventorySyncService } from './inventorySync';
import { ReceivableService } from './receivables';

const COLLECTION = 'deliveryNotes';

export const DeliveryNoteService = {
  async create(dn: Omit<DeliveryNote, 'id' | 'createdAt' | 'updatedAt'>): Promise<DeliveryNote> {
    const now = Date.now();
    return FirestoreService.add<DeliveryNote>(COLLECTION, {
      ...dn,
      createdAt: now,
      updatedAt: now,
    });
  },

  async getById(id: string): Promise<DeliveryNote | null> {
    return FirestoreService.get<DeliveryNote>(COLLECTION, id);
  },

  async getAll(pageLimit = 200): Promise<DeliveryNote[]> {
    return FirestoreService.query<DeliveryNote>(COLLECTION, [
      orderBy('createdAt', 'desc'),
      limit(pageLimit),
    ]);
  },

  async getBySalesOrder(salesOrderId: string): Promise<DeliveryNote[]> {
    return FirestoreService.query<DeliveryNote>(COLLECTION, [
      where('salesOrderId', '==', salesOrderId),
      orderBy('createdAt', 'desc'),
    ]);
  },

  async getByToUser(toUserId: string, pageLimit = 200): Promise<DeliveryNote[]> {
    return FirestoreService.query<DeliveryNote>(COLLECTION, [
      where('toUserId', '==', toUserId),
      orderBy('createdAt', 'desc'),
      limit(pageLimit),
    ]);
  },

  /**
   * 倉庫審核：PENDING → WAREHOUSE_APPROVED，同時扣減賣方庫存、增加買方庫存
   */
  async warehouseApprove(id: string, approvedByUserId: string): Promise<void> {
    const dn = await FirestoreService.get<DeliveryNote>(COLLECTION, id);
    if (!dn) throw new Error('發貨單不存在');
    if (dn.status !== DeliveryNoteStatus.PENDING) {
      throw new Error('只有待審核狀態的發貨單可進行倉庫審核');
    }

    // 扣賣方庫存、加買方庫存（複用現有 InventorySyncService）
    await InventorySyncService.onTransferCompleted(
      dn.fromUserId,
      dn.toUserId,
      dn.items,
      `DN:${id}`
    );

    await FirestoreService.update<DeliveryNote>(COLLECTION, id, {
      status: DeliveryNoteStatus.WAREHOUSE_APPROVED,
      warehouseApprovedBy: approvedByUserId,
      warehouseApprovedAt: Date.now(),
    });

    // 自動生成應收款
    await ReceivableService.create({
      deliveryNoteId: id,
      deliveryNoteNo: dn.deliveryNo,
      salesOrderId: dn.salesOrderId,
      salesOrderNo: dn.salesOrderNo,
      customerId: dn.toUserId,
      customerName: dn.toUserName,
      fromUserId: dn.fromUserId,
      totalAmount: dn.totals.grandTotal,
      paidAmount: 0,
      remainingAmount: dn.totals.grandTotal,
      status: ReceivableStatus.OUTSTANDING,
    });
  },

  async markDelivered(id: string): Promise<void> {
    const dn = await FirestoreService.get<DeliveryNote>(COLLECTION, id);
    await FirestoreService.update<DeliveryNote>(COLLECTION, id, {
      status: DeliveryNoteStatus.DELIVERED,
      logistics: {
        ...(dn?.logistics ?? {}),
        deliveredDate: Date.now(),
      },
    });
  },

  async cancel(id: string): Promise<void> {
    await FirestoreService.update<DeliveryNote>(COLLECTION, id, {
      status: DeliveryNoteStatus.CANCELLED,
    });
  },

  async update(id: string, updates: Partial<DeliveryNote>): Promise<void> {
    await FirestoreService.update<DeliveryNote>(COLLECTION, id, updates);
  },

  /** 取得所有現有 DN 的 deliveryNo，用於生成下一個不衝突的單號 */
  async getAllDeliveryNos(): Promise<string[]> {
    const all = await FirestoreService.query<DeliveryNote>(COLLECTION, [
      orderBy('createdAt', 'desc'),
      limit(500),
    ]);
    return all.map((dn) => dn.deliveryNo);
  },
};
