import { where, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { FirestoreService } from './base';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
  TransactionItem,
  PaymentMethod,
  PaymentStatus,
  ShippingStatus,
} from '@/types/models';

const COLLECTION = 'transactions';

export const OrderService = {
  /**
   * Create a new order (SALE transaction)
   * @param order - Order data
   * @param options - Optional custom order ID and/or createdAt timestamp
   */
  async create(
    order: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>,
    options?: { customId?: string; createdAt?: number }
  ) {
    const timestamp = options?.createdAt ?? Date.now();
    const data: Transaction = {
      ...order,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const customId = options?.customId?.trim();
    if (customId) {
      const docId = customId.replace(/\s+/g, '-').replace(/\//g, '-');
      return FirestoreService.set(COLLECTION, docId, data);
    }
    // No customId → let Firestore generate a unique document ID (prevents same-date collisions)
    return FirestoreService.add(COLLECTION, data);
  },

  /**
   * Get order by ID
   */
  async getById(id: string) {
    return FirestoreService.get<Transaction>(COLLECTION, id);
  },

  /**
   * Get all orders (admin view)
   */
  async getAll(pageLimit = 100) {
    const constraints = [
      orderBy('createdAt', 'desc'),
      firestoreLimit(pageLimit),
    ];
    return FirestoreService.query<Transaction>(COLLECTION, constraints);
  },

  /**
   * Get orders by sender (stockist's sales)
   */
  async getByFromUser(userId: string, pageLimit = 100) {
    const constraints = [
      where('fromUser.userId', '==', userId),
      orderBy('createdAt', 'desc'),
      firestoreLimit(pageLimit),
    ];
    return FirestoreService.query<Transaction>(COLLECTION, constraints);
  },

  /**
   * Get orders by receiver (customer's purchases)
   */
  async getByToUser(userId: string, pageLimit = 100) {
    const constraints = [
      where('toUser.userId', '==', userId),
      orderBy('createdAt', 'desc'),
      firestoreLimit(pageLimit),
    ];
    return FirestoreService.query<Transaction>(COLLECTION, constraints);
  },

  /**
   * Get all transactions where user is fromUser or toUser (for stock ledger)
   * Merged and sorted by createdAt desc
   */
  async getByUserRelated(userId: string, pageLimit = 200) {
    const [fromList, toList] = await Promise.all([
      this.getByFromUser(userId, pageLimit),
      this.getByToUser(userId, pageLimit),
    ]);
    const seen = new Set<string>();
    const merged: Transaction[] = [];
    for (const t of [...fromList, ...toList]) {
      const id = (t as Transaction & { id: string }).id;
      if (id && !seen.has(id)) {
        seen.add(id);
        merged.push(t);
      }
    }
    merged.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return merged.slice(0, pageLimit);
  },

  /**
   * Get orders by status
   */
  async getByStatus(status: TransactionStatus, pageLimit = 100) {
    const constraints = [
      where('status', '==', status),
      orderBy('createdAt', 'desc'),
      firestoreLimit(pageLimit),
    ];
    return FirestoreService.query<Transaction>(COLLECTION, constraints);
  },

  /**
   * Get orders by type (SALE, PURCHASE, TRANSFER, etc.)
   */
  async getByType(type: TransactionType, pageLimit = 100) {
    const constraints = [
      where('transactionType', '==', type),
      orderBy('createdAt', 'desc'),
      firestoreLimit(pageLimit),
    ];
    return FirestoreService.query<Transaction>(COLLECTION, constraints);
  },

  /**
   * Update transaction (for ledger edit - allows updating completed transactions)
   */
  async updateTransaction(id: string, updates: Partial<Transaction>) {
    return FirestoreService.update<Transaction>(COLLECTION, id, updates);
  },

  /**
   * Update order status
   */
  async updateStatus(id: string, status: TransactionStatus) {
    return FirestoreService.update<Transaction>(COLLECTION, id, { status });
  },

  /**
   * Update order (poNumber, items, status, paymentDetails)
   * 僅限 pending 訂單可編輯
   */
  async updateOrder(
    id: string,
    updates: Partial<Pick<Transaction, 'poNumber' | 'items' | 'status' | 'paymentDetails'>>
  ) {
    const po = await this.getById(id);
    if (!po) throw new Error('訂單不存在');
    if (po.status !== TransactionStatus.PENDING) {
      throw new Error('僅待處理訂單可編輯');
    }
    const data: Partial<Transaction> = { ...updates };
    if (updates.items) {
      const itemsWithTotal: TransactionItem[] = updates.items.map((i) => ({
        ...i,
        total: i.quantity * i.unitPrice,
      }));
      const subtotal = itemsWithTotal.reduce((s, i) => s + i.total, 0);
      data.items = itemsWithTotal;
      data.totals = { ...po.totals, subtotal, grandTotal: subtotal };
      if (data.paymentDetails === undefined && po.paymentDetails) {
        data.paymentDetails = { ...po.paymentDetails, amount: subtotal };
      }
    }
    if (updates.paymentDetails && !updates.items && po.paymentDetails) {
      data.paymentDetails = { ...po.paymentDetails, ...updates.paymentDetails };
    }
    return FirestoreService.update<Transaction>(COLLECTION, id, data);
  },

  /**
   * Update shipping status
   */
  async updateShipping(
    id: string,
    shippingDetails: Transaction['shippingDetails']
  ) {
    return FirestoreService.update<Transaction>(COLLECTION, id, { shippingDetails });
  },

  /**
   * Update payment details
   */
  async updatePayment(
    id: string,
    paymentDetails: Transaction['paymentDetails']
  ) {
    return FirestoreService.update<Transaction>(COLLECTION, id, { paymentDetails });
  },

  /**
   * Cancel an order (set status to CANCELLED)
   */
  async cancel(id: string) {
    return FirestoreService.update<Transaction>(COLLECTION, id, {
      status: TransactionStatus.CANCELLED,
    });
  },

  /**
   * Delete a transaction by ID
   */
  async delete(id: string) {
    return FirestoreService.delete(COLLECTION, id);
  },

  /**
   * Helper: build a SALE transaction object
   */
  buildSaleOrder(params: {
    fromUserId: string;
    fromUserName: string;
    toUserId: string;
    toUserName: string;
    items: TransactionItem[];
    paymentMethod: PaymentMethod;
    notes?: string;
    createdBy: string;
  }): Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'> {
    const subtotal = params.items.reduce((sum, item) => sum + item.total, 0);

    return {
      transactionType: TransactionType.SALE,
      status: TransactionStatus.PENDING,
      description: params.notes,
      fromUser: {
        userId: params.fromUserId,
        userName: params.fromUserName,
      },
      toUser: {
        userId: params.toUserId,
        userName: params.toUserName,
      },
      items: params.items,
      totals: {
        subtotal,
        grandTotal: subtotal,
      },
      shippingDetails: {
        status: ShippingStatus.PENDING,
      },
      paymentDetails: {
        method: params.paymentMethod,
        status: PaymentStatus.PENDING,
        amount: subtotal,
      },
      createdBy: params.createdBy,
    };
  },
};
