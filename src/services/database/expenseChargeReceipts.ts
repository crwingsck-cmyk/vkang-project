import { where, orderBy, limit } from 'firebase/firestore';
import { FirestoreService } from './base';
import {
  ExpenseChargeReceipt,
  ExpenseChargeReceiptStatus,
} from '@/types/models';
import { ExpenseChargeService } from './expenseCharges';

const COLLECTION = 'expenseChargeReceipts';

export const ExpenseChargeReceiptService = {
  async create(
    r: Omit<ExpenseChargeReceipt, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ExpenseChargeReceipt & { id: string }> {
    const now = Date.now();
    return FirestoreService.add<ExpenseChargeReceipt>(COLLECTION, {
      ...r,
      createdAt: now,
      updatedAt: now,
    });
  },

  async getById(id: string): Promise<(ExpenseChargeReceipt & { id: string }) | null> {
    return FirestoreService.get<ExpenseChargeReceipt>(COLLECTION, id);
  },

  async getAll(pageLimit = 200): Promise<(ExpenseChargeReceipt & { id: string })[]> {
    return FirestoreService.query<ExpenseChargeReceipt>(COLLECTION, [
      orderBy('createdAt', 'desc'),
      limit(pageLimit),
    ]);
  },

  async getByCustomer(customerId: string): Promise<(ExpenseChargeReceipt & { id: string })[]> {
    return FirestoreService.query<ExpenseChargeReceipt>(COLLECTION, [
      where('customerId', '==', customerId),
      orderBy('createdAt', 'desc'),
    ]);
  },

  async submit(id: string): Promise<void> {
    await FirestoreService.update<ExpenseChargeReceipt>(COLLECTION, id, {
      status: ExpenseChargeReceiptStatus.SUBMITTED,
      updatedAt: Date.now(),
    });
  },

  async approve(id: string, approvedBy: string): Promise<void> {
    const r = await FirestoreService.get<ExpenseChargeReceipt>(COLLECTION, id);
    if (!r) throw new Error('費用收款單不存在');
    if (r.status !== ExpenseChargeReceiptStatus.SUBMITTED) {
      throw new Error('只有待審核狀態的收款單可進行審核');
    }

    for (const item of r.items) {
      await ExpenseChargeService.applyPayment(item.chargeId, item.appliedAmount);
    }

    await FirestoreService.update<ExpenseChargeReceipt>(COLLECTION, id, {
      status: ExpenseChargeReceiptStatus.APPROVED,
      approvedBy,
      approvedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },

  async cancel(id: string): Promise<void> {
    await FirestoreService.update<ExpenseChargeReceipt>(COLLECTION, id, {
      status: ExpenseChargeReceiptStatus.CANCELLED,
      updatedAt: Date.now(),
    });
  },

  async delete(id: string): Promise<void> {
    const r = await FirestoreService.get<ExpenseChargeReceipt>(COLLECTION, id);
    if (!r) throw new Error('費用收款單不存在');

    if (r.status === ExpenseChargeReceiptStatus.APPROVED) {
      for (const item of r.items) {
        const charge = await ExpenseChargeService.getById(item.chargeId);
        if (charge) {
          await ExpenseChargeService.reversePayment(item.chargeId, item.appliedAmount);
        }
      }
    }

    await FirestoreService.delete(COLLECTION, id);
  },

  async getAllReceiptNos(): Promise<string[]> {
    const all = await FirestoreService.query<ExpenseChargeReceipt>(COLLECTION, [
      orderBy('createdAt', 'desc'),
      limit(500),
    ]);
    return all.map((r) => r.receiptNo);
  },
};
