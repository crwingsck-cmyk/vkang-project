import { where, orderBy, limit } from 'firebase/firestore';
import { FirestoreService } from './base';
import { PaymentReceipt, PaymentReceiptStatus } from '@/types/models';
import { ReceivableService } from './receivables';

const COLLECTION = 'paymentReceipts';

export const PaymentReceiptService = {
  async create(pr: Omit<PaymentReceipt, 'id' | 'createdAt' | 'updatedAt'>): Promise<PaymentReceipt> {
    const now = Date.now();
    return FirestoreService.add<PaymentReceipt>(COLLECTION, {
      ...pr,
      createdAt: now,
      updatedAt: now,
    });
  },

  async getById(id: string): Promise<PaymentReceipt | null> {
    return FirestoreService.get<PaymentReceipt>(COLLECTION, id);
  },

  async getAll(pageLimit = 200): Promise<PaymentReceipt[]> {
    return FirestoreService.query<PaymentReceipt>(COLLECTION, [
      orderBy('createdAt', 'desc'),
      limit(pageLimit),
    ]);
  },

  async getByCustomer(customerId: string): Promise<PaymentReceipt[]> {
    return FirestoreService.query<PaymentReceipt>(COLLECTION, [
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc'),
    ]);
  },

  async submit(id: string): Promise<void> {
    await FirestoreService.update<PaymentReceipt>(COLLECTION, id, {
      status: PaymentReceiptStatus.SUBMITTED,
    });
  },

  /**
   * 審核通過：批量核銷應收款，更新收款單狀態
   */
  async approve(id: string, approvedBy: string): Promise<void> {
    const pr = await FirestoreService.get<PaymentReceipt>(COLLECTION, id);
    if (!pr) throw new Error('收款單不存在');
    if (pr.status !== PaymentReceiptStatus.SUBMITTED) {
      throw new Error('只有待審核狀態的收款單可進行審核');
    }

    // 批量核銷每一筆應收款
    for (const item of pr.items) {
      await ReceivableService.applyPayment(item.receivableId, item.appliedAmount);
    }

    await FirestoreService.update<PaymentReceipt>(COLLECTION, id, {
      status: PaymentReceiptStatus.APPROVED,
      approvedBy,
      approvedAt: Date.now(),
    });
  },

  async cancel(id: string): Promise<void> {
    await FirestoreService.update<PaymentReceipt>(COLLECTION, id, {
      status: PaymentReceiptStatus.CANCELLED,
    });
  },

  /** 取得所有現有 PR 單號（用於生成下一個不衝突的單號）*/
  async getAllReceiptNos(): Promise<string[]> {
    const all = await FirestoreService.query<PaymentReceipt>(COLLECTION, [
      orderBy('createdAt', 'desc'),
      limit(500),
    ]);
    return all.map((pr) => pr.receiptNo);
  },
};
