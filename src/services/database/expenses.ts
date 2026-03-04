import { where, orderBy, limit } from 'firebase/firestore';
import { FirestoreService } from './base';
import { Expense, ExpenseType } from '@/types/models';

const COLLECTION = 'expenses';

export const ExpenseService = {
  async create(e: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>): Promise<Expense & { id: string }> {
    const now = Date.now();
    return FirestoreService.add<Expense>(COLLECTION, {
      ...e,
      createdAt: now,
      updatedAt: now,
    });
  },

  async getById(id: string): Promise<(Expense & { id: string }) | null> {
    return FirestoreService.get<Expense>(COLLECTION, id);
  },

  async getAll(pageLimit = 200): Promise<(Expense & { id: string })[]> {
    return FirestoreService.query<Expense>(COLLECTION, [
      orderBy('paymentDate', 'desc'),
      limit(pageLimit),
    ]);
  },

  async getByType(type: ExpenseType, pageLimit = 200): Promise<(Expense & { id: string })[]> {
    return FirestoreService.query<Expense>(COLLECTION, [
      where('type', '==', type),
      orderBy('paymentDate', 'desc'),
      limit(pageLimit),
    ]);
  },

  async update(id: string, updates: Partial<Expense>): Promise<void> {
    await FirestoreService.update<Expense>(COLLECTION, id, {
      ...updates,
      updatedAt: Date.now(),
    });
  },

  async delete(id: string): Promise<void> {
    await FirestoreService.delete(COLLECTION, id);
  },

  async getAllExpenseNos(): Promise<string[]> {
    const all = await FirestoreService.query<Expense>(COLLECTION, [
      orderBy('createdAt', 'desc'),
      limit(500),
    ]);
    return all.map((e) => e.expenseNo);
  },
};
