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

  async delete(id: string): Promise<void> {
    const pr = await FirestoreService.get<PaymentReceipt>(COLLECTION, id);
    if (!pr) throw new Error('收款單不存在');

    // 若已審核，先反轉每筆 AR 核銷（若應收款已不存在則略過，避免刪除失敗）
    if (pr.status === PaymentReceiptStatus.APPROVED) {
      for (const item of pr.items) {
        const ar = await ReceivableService.getById(item.receivableId);
        if (ar) {
          await ReceivableService.reversePayment(item.receivableId, item.appliedAmount);
        }
      }
    }

    await FirestoreService.delete(COLLECTION, id);
  },

  async updateDetails(id: string, updates: { paymentMethod?: string; paymentReference?: string; notes?: string }): Promise<void> {
    await FirestoreService.update<PaymentReceipt>(COLLECTION, id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },

  /**
   * 修改已審核收款單金額：反轉舊 AR → 重新分配新金額 → 重新核銷 AR
   */
  async updateAmount(id: string, newAmount: number): Promise<void> {
    const pr = await FirestoreService.get<PaymentReceipt>(COLLECTION, id);
    if (!pr) throw new Error('收款單不存在');
    if (pr.status !== PaymentReceiptStatus.APPROVED) throw new Error('只有已審核的收款單可修改金額');

    // 1. 反轉所有舊 AR 核銷
    for (const item of pr.items) {
      await ReceivableService.reversePayment(item.receivableId, item.appliedAmount);
    }

    // 2. 重新取得各應收款可用餘額（反轉後）
    const receivables = await Promise.all(
      pr.items.map((item) => ReceivableService.getById(item.receivableId))
    );
    const maxAmount = receivables.reduce((sum, r) => sum + (r?.remainingAmount ?? 0), 0);

    if (newAmount > maxAmount + 0.001) {
      // 還原舊狀態
      for (const item of pr.items) {
        await ReceivableService.applyPayment(item.receivableId, item.appliedAmount);
      }
      throw new Error(`修改金額超過可核銷上限（${maxAmount.toFixed(2)}），已還原`);
    }

    // 3. 按比例重新分配新金額
    const newItems = [...pr.items];
    let remaining = newAmount;
    for (let i = 0; i < newItems.length; i++) {
      const available = receivables[i]?.remainingAmount ?? 0;
      const apply = Math.round(Math.min(available, remaining) * 100) / 100;
      newItems[i] = { ...newItems[i], appliedAmount: apply };
      remaining -= apply;
      if (remaining <= 0.001) break;
    }

    // 4. 重新核銷 AR
    for (const item of newItems) {
      if (item.appliedAmount > 0) {
        await ReceivableService.applyPayment(item.receivableId, item.appliedAmount);
      }
    }

    // 5. 更新 PR
    await FirestoreService.update<PaymentReceipt>(COLLECTION, id, {
      totalAmount: newAmount,
      items: newItems,
      updatedAt: Date.now(),
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
