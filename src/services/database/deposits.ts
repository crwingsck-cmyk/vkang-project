import { where, orderBy, limit } from 'firebase/firestore';
import { FirestoreService } from './base';
import { Deposit } from '@/types/models';
import { ReceivableService } from './receivables';

const COLLECTION = 'deposits';

export const DepositService = {
  async create(d: Omit<Deposit, 'id' | 'createdAt' | 'updatedAt'>): Promise<Deposit & { id: string }> {
    const now = Date.now();
    return FirestoreService.add<Deposit>(COLLECTION, {
      ...d,
      createdAt: now,
      updatedAt: now,
    });
  },

  async getById(id: string): Promise<(Deposit & { id: string }) | null> {
    return FirestoreService.get<Deposit>(COLLECTION, id);
  },

  async getAll(pageLimit = 200): Promise<(Deposit & { id: string })[]> {
    return FirestoreService.query<Deposit>(COLLECTION, [
      orderBy('createdAt', 'desc'),
      limit(pageLimit),
    ]);
  },

  async getByCustomer(customerId: string): Promise<(Deposit & { id: string })[]> {
    return FirestoreService.query<Deposit>(COLLECTION, [
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc'),
    ]);
  },

  /** 取得客戶尚有餘額的訂金（可扣抵用）*/
  async getAvailableByCustomer(customerId: string): Promise<(Deposit & { id: string })[]> {
    const list = await this.getByCustomer(customerId);
    return list.filter((d) => d.balance > 0.001);
  },

  /** 取得客戶訂金餘額總和 */
  async getTotalBalanceByCustomer(customerId: string): Promise<number> {
    const list = await this.getByCustomer(customerId);
    return list.reduce((s, d) => s + d.balance, 0);
  },

  async update(id: string, updates: Partial<Deposit>): Promise<void> {
    await FirestoreService.update<Deposit>(COLLECTION, id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },

  async delete(id: string): Promise<void> {
    const d = await FirestoreService.get<Deposit>(COLLECTION, id);
    if (!d) throw new Error('訂金記錄不存在');
    if (d.balance < d.amount - 0.001) {
      throw new Error('此訂金已部分扣抵，無法刪除。請先反轉扣抵紀錄。');
    }
    await FirestoreService.delete(COLLECTION, id);
  },

  /**
   * 將訂金扣抵至應收款
   * 同時更新 deposit.balance 與 AR 的 paidAmount
   */
  async applyToReceivable(
    depositId: string,
    receivableId: string,
    amount: number
  ): Promise<void> {
    const deposit = await FirestoreService.get<Deposit>(COLLECTION, depositId);
    if (!deposit) throw new Error('訂金不存在');
    if (deposit.balance < amount - 0.001) {
      throw new Error(`訂金餘額不足（剩餘 ${deposit.balance.toFixed(2)}）`);
    }

    await ReceivableService.applyPayment(receivableId, amount);
    await this.update(depositId, {
      balance: Math.round((deposit.balance - amount) * 100) / 100,
    });
  },

  /** 取得所有現有 DP 單號（用於生成下一個不衝突的單號）*/
  async getAllDepositNos(): Promise<string[]> {
    const all = await FirestoreService.query<Deposit>(COLLECTION, [
      orderBy('createdAt', 'desc'),
      limit(500),
    ]);
    return all.map((d) => d.depositNo);
  },
};
