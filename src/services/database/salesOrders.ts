import { where, orderBy, limit } from 'firebase/firestore';
import { FirestoreService } from './base';
import { SalesOrder, SalesOrderStatus } from '@/types/models';

const COLLECTION = 'salesOrders';

export const SalesOrderService = {
  async create(so: Omit<SalesOrder, 'id' | 'createdAt' | 'updatedAt'>): Promise<SalesOrder> {
    const now = Date.now();
    return FirestoreService.add<SalesOrder>(COLLECTION, {
      ...so,
      createdAt: now,
      updatedAt: now,
    });
  },

  async getById(id: string): Promise<SalesOrder | null> {
    return FirestoreService.get<SalesOrder>(COLLECTION, id);
  },

  async getAll(pageLimit = 200): Promise<SalesOrder[]> {
    return FirestoreService.query<SalesOrder>(COLLECTION, [
      orderBy('createdAt', 'desc'),
      limit(pageLimit),
    ]);
  },

  async getByFromUser(userId: string, pageLimit = 200): Promise<SalesOrder[]> {
    return FirestoreService.query<SalesOrder>(COLLECTION, [
      where('fromUserId', '==', userId),
      orderBy('createdAt', 'desc'),
      limit(pageLimit),
    ]);
  },

  async getApproved(): Promise<SalesOrder[]> {
    return FirestoreService.query<SalesOrder>(COLLECTION, [
      where('status', '==', SalesOrderStatus.APPROVED),
      orderBy('createdAt', 'desc'),
      limit(500),
    ]);
  },

  async update(id: string, updates: Partial<SalesOrder>): Promise<void> {
    await FirestoreService.update<SalesOrder>(COLLECTION, id, updates);
  },

  async updateStatus(id: string, status: SalesOrderStatus): Promise<void> {
    await FirestoreService.update<SalesOrder>(COLLECTION, id, { status });
  },

  async submit(id: string): Promise<void> {
    await FirestoreService.update<SalesOrder>(COLLECTION, id, {
      status: SalesOrderStatus.SUBMITTED,
    });
  },

  async approve(id: string): Promise<void> {
    await FirestoreService.update<SalesOrder>(COLLECTION, id, {
      status: SalesOrderStatus.APPROVED,
    });
  },

  async cancel(id: string): Promise<void> {
    await FirestoreService.update<SalesOrder>(COLLECTION, id, {
      status: SalesOrderStatus.CANCELLED,
    });
  },

  async linkDeliveryNote(id: string, dnId: string, existingIds: string[]): Promise<void> {
    await FirestoreService.update<SalesOrder>(COLLECTION, id, {
      linkedDeliveryNoteIds: [...existingIds, dnId],
    });
  },

  /** 取得所有現有 SO 的 orderNo，用於生成下一個不衝突的單號 */
  async getAllOrderNos(): Promise<string[]> {
    const all = await FirestoreService.query<SalesOrder>(COLLECTION, [
      orderBy('createdAt', 'desc'),
      limit(500),
    ]);
    return all.map((so) => so.orderNo);
  },
};
