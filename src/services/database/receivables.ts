import { where, orderBy, limit } from 'firebase/firestore';
import { FirestoreService } from './base';
import { Receivable, ReceivableStatus } from '@/types/models';

const COLLECTION = 'receivables';

export const ReceivableService = {
  async create(r: Omit<Receivable, 'id' | 'createdAt' | 'updatedAt'>): Promise<Receivable> {
    const now = Date.now();
    return FirestoreService.add<Receivable>(COLLECTION, {
      ...r,
      createdAt: now,
      updatedAt: now,
    });
  },

  async getById(id: string): Promise<Receivable | null> {
    return FirestoreService.get<Receivable>(COLLECTION, id);
  },

  async getAll(pageLimit = 500): Promise<Receivable[]> {
    return FirestoreService.query<Receivable>(COLLECTION, [
      orderBy('createdAt', 'desc'),
      limit(pageLimit),
    ]);
  },

  async getByCustomer(customerId: string): Promise<Receivable[]> {
    return FirestoreService.query<Receivable>(COLLECTION, [
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc'),
    ]);
  },

  /** 查某經銷商發出的應收款（fromUserId = 賣方）*/
  async getByFromUser(fromUserId: string): Promise<(Receivable & { id: string })[]> {
    return FirestoreService.query<Receivable>(COLLECTION, [
      where('fromUserId', '==', fromUserId),
      orderBy('createdAt', 'desc'),
    ]);
  },

  /** 查客戶未收 / 部分收的應收款（用於建立收款單時的選單）*/
  async getOutstandingByCustomer(customerId: string): Promise<Receivable[]> {
    const all = await FirestoreService.query<Receivable>(COLLECTION, [
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc'),
    ]);
    return all.filter(
      (r) =>
        r.status === ReceivableStatus.OUTSTANDING ||
        r.status === ReceivableStatus.PARTIAL_PAID
    );
  },

  async update(id: string, updates: Partial<Receivable>): Promise<void> {
    await FirestoreService.update<Receivable>(COLLECTION, id, updates);
  },

  async delete(id: string): Promise<void> {
    await FirestoreService.delete(COLLECTION, id);
  },

  /** 刪除與某筆交易關聯的所有應收款（交易刪除時同步呼叫）*/
  async deleteByTransactionId(txnId: string): Promise<void> {
    const records = await FirestoreService.query<Receivable>(COLLECTION, [
      where('deliveryNoteId', '==', txnId),
    ]);
    await Promise.all(
      records.map((r) => FirestoreService.delete(COLLECTION, (r as Receivable & { id: string }).id))
    );
  },

  /**
   * 反轉核銷：還原 paidAmount / remainingAmount / status
   * 由 PaymentReceiptService.delete() 在刪除已審核收款單時呼叫
   */
  async reversePayment(id: string, amount: number): Promise<void> {
    const r = await FirestoreService.get<Receivable>(COLLECTION, id);
    if (!r) throw new Error(`應收款 ${id} 不存在`);

    const newPaid = Math.max(0, r.paidAmount - amount);
    const newRemaining = r.totalAmount - newPaid;

    let status: ReceivableStatus;
    if (newRemaining <= 0) {
      status = ReceivableStatus.PAID;
    } else if (newPaid > 0) {
      status = ReceivableStatus.PARTIAL_PAID;
    } else {
      status = ReceivableStatus.OUTSTANDING;
    }

    await FirestoreService.update<Receivable>(COLLECTION, id, {
      paidAmount: newPaid,
      remainingAmount: Math.max(0, newRemaining),
      status,
    });
  },

  /**
   * 核銷金額：更新 paidAmount / remainingAmount / status
   * 由 PaymentReceiptService.approve() 批量呼叫
   */
  async applyPayment(id: string, amount: number): Promise<void> {
    const r = await FirestoreService.get<Receivable>(COLLECTION, id);
    if (!r) throw new Error(`應收款 ${id} 不存在`);

    const newPaid = r.paidAmount + amount;
    const newRemaining = r.totalAmount - newPaid;

    let status: ReceivableStatus;
    if (newRemaining <= 0) {
      status = ReceivableStatus.PAID;
    } else if (newPaid > 0) {
      status = ReceivableStatus.PARTIAL_PAID;
    } else {
      status = ReceivableStatus.OUTSTANDING;
    }

    await FirestoreService.update<Receivable>(COLLECTION, id, {
      paidAmount: newPaid,
      remainingAmount: Math.max(0, newRemaining),
      status,
    });
  },
};
