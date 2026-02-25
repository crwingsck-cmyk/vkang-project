// Firestore Document Types for Vkang ERP System

// ========== ENUM TYPES ==========
export enum UserRole {
  ADMIN = 'ADMIN',
  STOCKIST = 'STOCKIST',
  CUSTOMER = 'CUSTOMER',
  TAIWAN = 'TAIWAN', // 保留以相容既有使用者
}

export enum TransactionType {
  PURCHASE = 'purchase',
  SALE = 'sale',
  TRANSFER = 'transfer',
  LOAN = 'loan',
  RETURN = 'return',
  ADJUSTMENT = 'adjustment',
}

export enum TransactionStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum ShippingStatus {
  PENDING = 'pending',
  SHIPPED = 'shipped',
  IN_TRANSIT = 'in-transit',
  DELIVERED = 'delivered',
}

export enum InventoryStatus {
  IN_STOCK = 'in-stock',
  LOW_STOCK = 'low-stock',
  OUT_OF_STOCK = 'out-of-stock',
}

export enum PaymentMethod {
  CASH = 'cash',
  BANK = 'bank',
  CARD = 'card',
  CREDIT = 'credit',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum FinancialType {
  INCOME = 'income',
  EXPENSE = 'expense',
}

export enum FinancialCategory {
  SALES = 'sales',
  PURCHASE = 'purchase',
  SHIPPING = 'shipping',
  OPERATIONAL = 'operational',
  REFUND = 'refund',
}

export enum PurchaseOrderStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  PARTIAL = 'partial',
  RECEIVED = 'received',
  CANCELLED = 'cancelled',
}

export enum CostingMethod {
  WEIGHTED_AVG = 'weighted_avg',
  FIFO = 'fifo',
}

// ========== DOCUMENT TYPES ==========
export interface Product {
  id?: string;
  sku: string;
  name: string;
  category: string;
  description?: string;
  unitPrice: number;
  costPrice: number;
  priceNote?: string; // 價格備註，如「每次進貨成本不同」「售價依訂單為準」
  unit: string; // e.g., "pcs", "box", "kg"
  packsPerBox?: number; // 一盒有幾包
  reorderLevel: number;
  reorderQuantity: number;
  isActive: boolean;
  images?: string[];
  barcode?: string;
  supplier?: {
    supplierId: string;
    supplierName: string;
    leadTime: number;
    lastOrderDate?: number;
  };
  specifications?: Record<string, string>;
  createdAt?: number;
  updatedAt?: number;
  createdBy?: string;
}

export interface User {
  id?: string;
  email: string;
  displayName: string;
  role: UserRole;
  phoneNumber?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  company?: {
    name: string;
    taxId?: string;
    registrationNumber?: string;
    type?: string;
  };
  warehouse?: {
    warehouseId: string;
    warehouseName: string;
  };
  permissions: string[];
  creditLimit?: number;
  creditUsed?: number;
  isActive: boolean;
  isVerified: boolean;
  parentUserId?: string; // For hierarchical relationships
  metadata?: {
    lastLogin?: number;
    loginCount: number;
    lastActivityDate?: number;
  };
  profilePicture?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface Inventory {
  id?: string;
  userId: string;
  productId: string;
  warehouse?: {
    warehouseId: string;
    warehouseName: string;
  };
  quantityOnHand: number;
  quantityAllocated: number;
  quantityAvailable: number;
  quantityBorrowed: number;
  quantityLent: number;
  quantityDamaged?: number;
  lastBarcodeCount?: number;
  lastCountDate?: number;
  reorderLevel: number;
  lastReplenishmentDate?: number;
  costingMethod?: CostingMethod;
  cost: number;
  marketValue: number;
  status: InventoryStatus;
  lastMovementDate: number;
  movements?: InventoryMovement[];
  createdAt?: number;
  updatedAt?: number;
}

export interface InventoryMovement {
  date: number;
  type: 'in' | 'out' | 'adjustment' | 'borrow' | 'return';
  quantity: number;
  reference: string; // transactionId
}

export interface TransactionItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  costPrice?: number;
  discount?: number;
  tax?: number;
  total: number;
  notes?: string;
  receivedAt?: number; // 該品項進貨日期（可與訂單日期不同）
}

export interface Transaction {
  id?: string;
  poNumber?: string; // 發貨號碼（顯示用，可自訂）
  transactionType: TransactionType;
  status: TransactionStatus;
  description?: string;
  fromUser?: {
    userId: string;
    userName: string;
    warehouse?: string;
  };
  toUser?: {
    userId: string;
    userName: string;
    warehouse?: string;
  };
  items: TransactionItem[];
  totals: {
    subtotal: number;
    discount?: number;
    tax?: number;
    shippingCost?: number;
    grandTotal: number;
  };
  shippingDetails?: {
    trackingNumber?: string;
    carrier?: string;
    shippingAddress?: string;
    estimatedDelivery?: number;
    actualDelivery?: number;
    status: ShippingStatus;
  };
  paymentDetails?: {
    method: PaymentMethod;
    reference?: string;
    status: PaymentStatus;
    paidDate?: number;
    amount: number;
  };
  approvalChain?: ApprovalRecord[];
  loanDetails?: {
    loanId: string;
    loanDate: number;
    returnDueDate?: number;
    actualReturnDate?: number;
    status: 'active' | 'returned' | 'overdue';
  };
  auditTrail?: AuditEntry[];
  createdAt?: number;
  updatedAt?: number;
  createdBy?: string;
}

export interface ApprovalRecord {
  approverUserId: string;
  approverName: string;
  status: 'approved' | 'rejected' | 'pending';
  timestamp: number;
  notes?: string;
}

export interface AuditEntry {
  action: string;
  changedBy: string;
  timestamp: number;
  changes?: Record<string, { old: any; new: any }>;
  notes?: string;
}

export interface Financial {
  id?: string;
  transactionId?: string;
  type: FinancialType;
  category: FinancialCategory;
  amount: number;
  currency: string;
  description?: string;
  account?: {
    accountId: string;
    accountName: string;
    accountType: 'bank' | 'cash' | 'credit_card';
  };
  relatedUser?: {
    userId: string;
    userName: string;
  };
  paymentStatus: PaymentStatus;
  reconciled: boolean;
  reconciliationDate?: number;
  notes?: string;
  attachments?: Attachment[];
  createdAt?: number;
  updatedAt?: number;
  createdBy?: string;
}

export interface Attachment {
  url: string;
  name: string;
  uploadedAt: number;
}

export interface Warehouse {
  id?: string;
  name: string;
  location?: {
    address: string;
    city: string;
    coordinates?: { lat: number; lng: number };
    timeZone?: string;
  };
  capacity?: {
    maxItems: number;
    currentItems: number;
  };
  manager?: {
    userId: string;
    userName: string;
  };
  type: 'primary' | 'secondary' | 'regional';
  isActive: boolean;
  createdAt?: number;
  updatedAt?: number;
}

export interface AuditLog {
  id?: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, { old: any; new: any }>;
  ipAddress?: string;
  userAgent?: string;
  status: 'success' | 'failure';
  errorMessage?: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface SystemConfig {
  companyName: string;
  companyLogo?: string;
  timezone: string;
  currency: string;
  financialYearStart?: string;
  taxRate?: number;
  features?: {
    loansEnabled: boolean;
    multiWarehouseEnabled: boolean;
    advancedReportingEnabled: boolean;
    autoInventoryForecastingEnabled?: boolean;
  };
  notificationSettings?: {
    lowStockAlert: boolean;
    orderStatusEmail: boolean;
    dailyReportEmail: boolean;
    defaultNotificationEmail?: string;
  };
  updatedAt?: number;
  updatedBy?: string;
}

export interface Role {
  id?: string;
  name: string;
  permissions: string[];
  description?: string;
}

// ========== 批次進貨與成本追蹤 ==========
export interface PurchaseOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  receivedQuantity?: number;
  total: number;
}

export interface PurchaseOrder {
  id?: string;
  poNumber: string;
  status: PurchaseOrderStatus;
  supplierId?: string;
  supplierName?: string;
  warehouseId?: string;
  fromUserId?: string; // 向總經銷商進貨時，來源使用者 ID（ADMIN）
  userId: string; // 收貨人（經銷商）
  useFifo?: boolean; // 本進貨單使用 FIFO 成本計算
  items: PurchaseOrderItem[];
  totals: { subtotal: number; tax?: number; grandTotal: number };
  receivedAt?: number;
  notes?: string;
  createdAt?: number;
  updatedAt?: number;
  createdBy?: string;
}

export interface InventoryBatch {
  id?: string;
  userId: string;
  productId: string;
  purchaseOrderId: string; // 進貨單 ID 或來源參考如 "TRANSFER:txId"
  quantity: number;
  unitCost: number;
  receivedAt: number;
  createdAt?: number;
}

