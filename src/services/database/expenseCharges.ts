import { where, orderBy, limit } from 'firebase/firestore';
import { FirestoreService } from './base';
import { ExpenseCharge, ExpenseChargeStatus } from '@/types/models';

const COLLECTION = 'expenseCharges';

export const ExpenseChargeService = {
  async create(c: Omit<ExpenseCharge, 'id' | 'createdAt' | 'updatedAt'>): Promise<ExpenseCharge & { id: string }> {
    const now = Date.now();
    return FirestoreService.add<ExpenseCharge>(COLLECTION, {
      ...c,
      createdAt: now,
      updatedAt: now,
    });
  },

  async getById(id: string): Promise<(ExpenseCharge & { id: string }) | null> {
    return FirestoreService.get<ExpenseCharge>(COLLECTION, id);
  },

  async getAll(pageLimit = 300): Promise<(ExpenseCharge & { id: string })[]> {
    return FirestoreService.query<ExpenseCharge>(COLLECTION, [
      orderBy('createdAt', 'desc'),
      limit(pageLimit),
    ]);
  },

  async getByCustomer(customerId: string): Promise<(ExpenseCharge & { id: string })[]> {
    return FirestoreService.query<ExpenseCharge>(COLLECTION, [
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc'),
    ]);
  },

  /** 取得客戶未收 / 部分收的費用分攤 */
  async getOutstandingByCustomer(customerId: string): Promise<(ExpenseCharge & { id: string })[]> {
    const all = await this.getByCustomer(customerId);
    return all.filter(
      (c) =>
        c.status === ExpenseChargeStatus.OUTSTANDING ||
        c.status === ExpenseChargeStatus.PARTIAL_PAID
    );
  },

  async getByExpense(expenseId: string): Promise<(ExpenseCharge & { id: string })[]> {
    return FirestoreService.query<ExpenseCharge>(COLLECTION, [
      where('expenseId', '==', expenseId),
      orderBy('createdAt', 'desc'),
    ]);
  },

  async update(id: string, updates: Partial<ExpenseCharge>): Promise<void> {
    await FirestoreService.update<ExpenseCharge>(COLLECTION, id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },

  /** 核銷費用分攤（收款時呼叫）*/
  async applyPayment(id: string, amount: number): Promise<void> {
    const c = await FirestoreService.get<ExpenseCharge>(COLLECTION, id);
    if (!c) throw new Error('Expense charge not found');

    const newPaid = c.paidAmount + amount;
    const newRemaining = Math.max(0, c.amount - newPaid);

    let status: ExpenseChargeStatus;
    if (newRemaining <= 0) {
      status = ExpenseChargeStatus.PAID;
    } else {
      status = ExpenseChargeStatus.PARTIAL_PAID;
    }

    await FirestoreService.update<ExpenseCharge>(COLLECTION, id, {
      paidAmount: newPaid,
      remainingAmount: newRemaining,
      status,
    });
  },

  /** 反轉核銷（刪除已審核收款單時呼叫）*/
  async reversePayment(id: string, amount: number): Promise<void> {
    const c = await FirestoreService.get<ExpenseCharge>(COLLECTION, id);
    if (!c) throw new Error('Expense charge not found');

    const newPaid = Math.max(0, c.paidAmount - amount);
    const newRemaining = c.amount - newPaid;

    let status: ExpenseChargeStatus;
    if (newRemaining >= c.amount - 0.001) {
      status = ExpenseChargeStatus.OUTSTANDING;
    } else {
      status = ExpenseChargeStatus.PARTIAL_PAID;
    }

    await FirestoreService.update<ExpenseCharge>(COLLECTION, id, {
      paidAmount: newPaid,
      remainingAmount: Math.max(0, newRemaining),
      status,
    });
  },
};
