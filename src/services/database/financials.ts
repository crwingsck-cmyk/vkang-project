import { where, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { FirestoreService } from './base';
import { Financial, FinancialType, FinancialCategory } from '@/types/models';

const COLLECTION = 'financials';

export const FinancialService = {
  /**
   * Create a financial record
   */
  async create(record: Omit<Financial, 'id' | 'createdAt' | 'updatedAt'>) {
    const timestamp = Date.now();
    const id = `FIN-${timestamp}`;
    const data: Financial = {
      ...record,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return FirestoreService.set(COLLECTION, id, data);
  },

  /**
   * Get financial record by ID
   */
  async getById(id: string) {
    return FirestoreService.get<Financial>(COLLECTION, id);
  },

  /**
   * Get all financial records (admin)
   */
  async getAll(pageLimit = 200) {
    const constraints = [
      orderBy('createdAt', 'desc'),
      firestoreLimit(pageLimit),
    ];
    return FirestoreService.query<Financial>(COLLECTION, constraints);
  },

  /**
   * Get financials by type (INCOME / EXPENSE)
   */
  async getByType(type: FinancialType, pageLimit = 100) {
    const constraints = [
      where('type', '==', type),
      orderBy('createdAt', 'desc'),
      firestoreLimit(pageLimit),
    ];
    return FirestoreService.query<Financial>(COLLECTION, constraints);
  },

  /**
   * Get financials by category
   */
  async getByCategory(category: FinancialCategory, pageLimit = 100) {
    const constraints = [
      where('category', '==', category),
      orderBy('createdAt', 'desc'),
      firestoreLimit(pageLimit),
    ];
    return FirestoreService.query<Financial>(COLLECTION, constraints);
  },

  /**
   * Get financials related to a user
   */
  async getByUser(userId: string, pageLimit = 100) {
    const constraints = [
      where('relatedUser.userId', '==', userId),
      orderBy('createdAt', 'desc'),
      firestoreLimit(pageLimit),
    ];
    return FirestoreService.query<Financial>(COLLECTION, constraints);
  },

  /**
   * Get unreconciled records
   */
  async getUnreconciled(pageLimit = 100) {
    const constraints = [
      where('reconciled', '==', false),
      orderBy('createdAt', 'desc'),
      firestoreLimit(pageLimit),
    ];
    return FirestoreService.query<Financial>(COLLECTION, constraints);
  },

  /**
   * Update financial record
   */
  async update(id: string, updates: Partial<Financial>) {
    return FirestoreService.update<Financial>(COLLECTION, id, updates);
  },

  /**
   * Mark as reconciled
   */
  async reconcile(id: string) {
    return FirestoreService.update<Financial>(COLLECTION, id, {
      reconciled: true,
      reconciliationDate: Date.now(),
    });
  },

  /**
   * Get summary stats (income/expense totals)
   */
  async getSummary(): Promise<{ totalIncome: number; totalExpense: number; net: number }> {
    const all = await this.getAll(500);
    const totalIncome = all
      .filter((r) => r.type === FinancialType.INCOME)
      .reduce((sum, r) => sum + r.amount, 0);
    const totalExpense = all
      .filter((r) => r.type === FinancialType.EXPENSE)
      .reduce((sum, r) => sum + r.amount, 0);
    return { totalIncome, totalExpense, net: totalIncome - totalExpense };
  },
};
