/**
 * API Request/Response Types
 */

import { User, Product, Transaction, Inventory, Financial } from './models';

// ============================================
// AUTH API
// ============================================
export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  refreshToken: string;
  user: User;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  company?: string;
  phoneNumber?: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface ResetPasswordRequest {
  email: string;
}

export interface ResetPasswordConfirmRequest {
  token: string;
  newPassword: string;
}

// ============================================
// PRODUCT API
// ============================================
export interface CreateProductRequest {
  sku: string;
  name: string;
  category: string;
  unitPrice: number;
  costPrice: number;
  reorderLevel: number;
  description?: string;
  unit?: string;
  supplier?: any;
}

export interface UpdateProductRequest {
  name?: string;
  category?: string;
  unitPrice?: number;
  costPrice?: number;
  reorderLevel?: number;
  description?: string;
  isActive?: boolean;
}

export interface ProductListResponse {
  products: Product[];
  total: number;
  page: number;
  hasMore: boolean;
}

// ============================================
// USER API
// ============================================
export interface CreateUserRequest {
  email: string;
  displayName: string;
  role: 'ADMIN' | 'STOCKIST' | 'CUSTOMER';
  phoneNumber?: string;
  company?: any;
  warehouseId?: string;
}

export interface UpdateUserRequest {
  displayName?: string;
  phoneNumber?: string;
  role?: 'ADMIN' | 'STOCKIST' | 'CUSTOMER';
  isActive?: boolean;
  creditLimit?: number;
}

export interface UserListResponse {
  users: User[];
  total: number;
  page: number;
  hasMore: boolean;
}

// ============================================
// ORDER API
// ============================================
export interface CreateOrderRequest {
  toUserId: string;
  items: OrderItem[];
  notes?: string;
  shippingAddress?: string;
}

export interface OrderItem {
  productId: string;
  quantity: number;
}

export interface UpdateOrderRequest {
  status?: string;
  paymentStatus?: string;
  notes?: string;
}

export interface OrderListResponse {
  orders: Transaction[];
  total: number;
  page: number;
  hasMore: boolean;
}

// ============================================
// INVENTORY API
// ============================================
export interface AdjustInventoryRequest {
  userId: string;
  productId: string;
  quantity: number; // 可正可負
  reason: string; // 調整原因
  notes?: string;
}

export interface TransferInventoryRequest {
  fromUserId: string;
  toUserId: string;
  items: {
    productId: string;
    quantity: number;
  }[];
  notes?: string;
}

export interface BorrowInventoryRequest {
  fromUserId: string;
  toUserId: string;
  items: {
    productId: string;
    quantity: number;
  }[];
  returnDueDate: Date;
  notes?: string;
}

export interface InventoryListResponse {
  inventory: Inventory[];
  totals: {
    total: number;
    allocated: number;
    available: number;
  };
}

// ============================================
// FINANCIAL API
// ============================================
export interface CreateFinancialRequest {
  transactionId?: string;
  type: 'income' | 'expense';
  category: string;
  amount: number;
  account?: any;
  description?: string;
  relatedUserId?: string;
}

export interface FinancialListResponse {
  transactions: Financial[];
  total: number;
  page: number;
  hasMore: boolean;
}

// ============================================
// DASHBOARD API
// ============================================
export interface DashboardSummaryResponse {
  totalInventoryValue: number;
  lowStockCount: number;
  pendingOrders: number;
  monthlyRevenue: number;
  topProducts: Product[];
}

export interface RevenueChartData {
  date: string;
  amount: number;
}

export interface RevenueResponse {
  daily: RevenueChartData[];
  total: number;
}

export interface TopProductsResponse {
  products: {
    productId: string;
    productName: string;
    quantitySold: number;
    revenue: number;
  }[];
}
