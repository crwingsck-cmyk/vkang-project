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
    const customId = options?.customId?.trim();
    const docId = customId
      ? customId.replace(/\s+/g, '-').replace(/\//g, '-')
      : `TXN-${timestamp}`;
    const data: Transaction = {
      ...order,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    return FirestoreService.set(COLLECTION, docId, data);
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
   * Update order status
   */
  async updateStatus(id: string, status: TransactionStatus) {
    return FirestoreService.update<Transaction>(COLLECTION, id, { status });
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
