'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { InventoryService } from '@/services/database/inventory';
import { OrderService } from '@/services/database/orders';
import { PurchaseOrderService } from '@/services/database/purchaseOrders';
import {
  User,
  UserRole,
  Inventory,
  Transaction,
  TransactionStatus,
  TransactionType,
  InventoryStatus,
  PurchaseOrder,
  PurchaseOrderStatus,
} from '@/types/models';
import Link from 'next/link';

const statusBadge: Record<TransactionStatus, string> = {
  [TransactionStatus.PENDING]: 'bg-warning/10 text-warning border border-warning/20',
  [TransactionStatus.COMPLETED]: 'bg-success/10 text-success border border-success/20',
  [TransactionStatus.CANCELLED]: 'bg-error/10 text-error border border-error/20',
};

const poStatusLabels: Record<PurchaseOrderStatus, string> = {
  [PurchaseOrderStatus.DRAFT]: '草稿',
  [PurchaseOrderStatus.SUBMITTED]: '已提交',
  [PurchaseOrderStatus.PARTIAL]: '部分收貨',
  [PurchaseOrderStatus.RECEIVED]: '已收貨',
  [PurchaseOrderStatus.CANCELLED]: '已取消',
};

export default function StockistDetailPage() {
  const params = useParams();
  const stockistId = (params?.id ?? '') as string;
  const { role } = useAuth();

  const [stockist, setStockist] = useState<User | null>(null);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [orders, setOrders] = useState<Transaction[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<(PurchaseOrder & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'orders' | 'inventory' | 'purchase'>('orders');

  useEffect(() => {
    if (role !== UserRole.ADMIN || !stockistId) return;
    load();
  }, [role, stockistId]);

  async function load() {
    setLoading(true);
    try {
      const [u, inv, ord, po] = await Promise.all([
        UserService.getById(stockistId),
        InventoryService.getByUser(stockistId, 100),
        OrderService.getByFromUser(stockistId, 50),
        PurchaseOrderService.getByUser(stockistId, undefined, 50),
      ]);
      setStockist(u ?? null);
      setInventory(inv);
      setOrders(ord.filter((o) => o.transactionType === TransactionType.SALE));
      setPurchaseOrders(po);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (role !== UserRole.ADMIN) return null;

  const invItemValue = (i: { quantityOnHand: number; marketValue?: number; cost: number }) =>
    i.quantityOnHand === 0 ? 0 : (i.marketValue ?? i.cost * i.quantityOnHand);
  const invValue = inventory.reduce((s, i) => s + invItemValue(i), 0);
  const lowStockCount = inventory.filter(
    (i) => i.status === InventoryStatus.LOW_STOCK || i.status === InventoryStatus.OUT_OF_STOCK
  ).length;
  const pendingOrders = orders.filter((o) => o.status === TransactionStatus.PENDING).length;

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <Link
            href="/stockists"
            className="text-txt-subtle hover:text-txt-primary text-sm"
          >
            ← 返回經銷商總覽
          </Link>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3" />
            <p className="text-txt-subtle text-sm">載入中...</p>
          </div>
        ) : !stockist ? (
          <div className="glass-card p-12 text-center">
            <p className="text-txt-subtle text-sm">找不到此經銷商</p>
            <Link href="/stockists" className="mt-2 inline-block text-xs text-accent-text hover:underline">
              返回經銷商總覽
            </Link>
          </div>
        ) : (
          <>
            <div className="p-6 rounded-xl border border-border bg-gray-50/80 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-txt-primary name-lowercase">{stockist.displayName}</h1>
                  <p className="text-txt-subtle text-sm mt-0.5">{stockist.email}</p>
                  {stockist.company?.name && (
                    <p className="text-txt-subtle text-sm mt-0.5">{stockist.company.name}</p>
                  )}
                  {stockist.phoneNumber && (
                    <p className="text-txt-subtle text-sm mt-0.5">{stockist.phoneNumber}</p>
                  )}
                </div>
                <Link
                  href={`/users/${stockist.id}`}
                  className="px-3 py-1.5 bg-surface-2 hover:bg-surface-3 border border-border text-txt-secondary text-xs font-medium rounded-lg"
                >
                  編輯使用者
                </Link>
              </div>

              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-lg bg-chip-dark p-4">
                  <p className="text-xs text-gray-300">庫存價值</p>
                  <p className="text-xl font-bold text-white tabular-nums mt-1">
                    USD {invValue.toFixed(0)}
                  </p>
                </div>
                <div className="rounded-lg bg-chip-dark p-4">
                  <p className="text-xs text-gray-300">待處理訂單</p>
                  <p className="text-xl font-bold text-white tabular-nums mt-1">
                    {pendingOrders}
                  </p>
                </div>
                <div className="rounded-lg bg-chip-dark p-4">
                  <p className="text-xs text-gray-300">現有庫存品項</p>
                  <p
                    className={`text-xl font-bold tabular-nums mt-1 ${
                      lowStockCount > 0 ? 'text-amber-300' : 'text-white'
                    }`}
                  >
                    {lowStockCount}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2 border-b border-border pb-2">
              {(['orders', 'inventory', 'purchase'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                    activeTab === tab
                      ? 'bg-surface-1 border border-border border-b-0 -mb-0.5 text-accent-text'
                      : 'text-txt-subtle hover:text-txt-primary'
                  }`}
                >
                  {tab === 'orders' && '訂單'}
                  {tab === 'inventory' && '庫存'}
                  {tab === 'purchase' && '進貨單'}
                </button>
              ))}
            </div>

            {activeTab === 'orders' && (
              <div className="glass-panel overflow-hidden">
                {orders.length === 0 ? (
                  <div className="p-12 text-center text-txt-subtle text-sm">尚無訂單</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-base">
                        <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase whitespace-nowrap">
                          日期
                        </th>
                        <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase whitespace-nowrap">
                          發貨號碼
                        </th>
                        <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase">
                          買方
                        </th>
                        <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-txt-subtle uppercase">
                          金額
                        </th>
                        <th className="px-5 py-2.5 text-center text-[10px] font-semibold text-txt-subtle uppercase">
                          狀態
                        </th>
                        <th className="px-5 py-2.5 text-center text-[10px] font-semibold text-txt-subtle uppercase w-20">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-muted">
                      {orders.map((o) => (
                        <tr key={o.id} className="hover:bg-surface-2/50">
                          <td className="px-5 py-3 text-txt-subtle text-xs tabular-nums whitespace-nowrap">
                            {o.createdAt ? new Date(o.createdAt).toLocaleDateString('zh-TW') : '-'}
                          </td>
                          <td className="px-5 py-3 font-mono text-xs text-txt-primary">
                            <Link href={`/orders/${o.id}`} className="text-accent-text hover:underline">
                              {o.id}
                            </Link>
                          </td>
                          <td className="px-5 py-3 text-txt-secondary text-xs">
                            {o.toUser?.userName || '-'}
                          </td>
                          <td className="px-5 py-3 text-txt-primary text-right tabular-nums font-medium">
                            USD {o.totals?.grandTotal?.toFixed(2) ?? '0.00'}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold ${statusBadge[o.status]}`}
                            >
                              {o.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-center">
                            <Link
                              href={`/orders/${o.id}`}
                              className="text-accent-text hover:underline text-xs"
                            >
                              查看
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab === 'inventory' && (
              <div className="glass-panel overflow-hidden">
                {inventory.length === 0 ? (
                  <div className="p-12 text-center text-txt-subtle text-sm">尚無庫存</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-base">
                        <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase">
                          產品
                        </th>
                        <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-txt-subtle uppercase">
                          現有
                        </th>
                        <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-txt-subtle uppercase">
                          可用
                        </th>
                        <th className="px-5 py-2.5 text-center text-[10px] font-semibold text-txt-subtle uppercase">
                          狀態
                        </th>
                        <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-txt-subtle uppercase">
                          價值
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-muted">
                      {inventory.map((i) => (
                        <tr key={i.id} className="hover:bg-surface-2/50">
                          <td className="px-5 py-3 font-mono text-xs text-txt-primary whitespace-nowrap">
                            {i.productId}
                          </td>
                          <td className="px-5 py-3 text-txt-secondary text-right tabular-nums">
                            {i.quantityOnHand}
                          </td>
                          <td className="px-5 py-3 text-txt-secondary text-right tabular-nums">
                            {i.quantityAvailable}
                          </td>
                          <td className="px-5 py-3 text-center whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap shrink-0 ${
                                i.status === InventoryStatus.IN_STOCK
                                  ? 'bg-success/10 text-success'
                                  : i.status === InventoryStatus.LOW_STOCK
                                    ? 'bg-warning/10 text-warning'
                                    : 'bg-error/10 text-error'
                              }`}
                            >
                              {i.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-txt-secondary text-right tabular-nums">
                            USD {invItemValue(i).toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab === 'purchase' && (
              <div className="glass-panel overflow-hidden">
                {purchaseOrders.length === 0 ? (
                  <div className="p-12 text-center text-txt-subtle text-sm">尚無進貨單</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-base">
                        <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase min-w-[7.5rem]">
                          進貨單號
                        </th>
                        <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase">
                          供應商 / 來源
                        </th>
                        <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-txt-subtle uppercase min-w-[5.5rem]">
                          金額
                        </th>
                        <th className="px-5 py-2.5 text-center text-[10px] font-semibold text-txt-subtle uppercase">
                          狀態
                        </th>
                        <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase">
                          進貨日期
                        </th>
                        <th className="px-5 py-2.5 text-center text-[10px] font-semibold text-txt-subtle uppercase w-20">
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-muted">
                      {purchaseOrders.map((po) => (
                        <tr key={po.id} className="hover:bg-surface-2/50">
                          <td className="px-5 py-3 font-mono text-xs text-accent-text whitespace-nowrap">
                            <Link href={`/purchase-orders/${po.id}`} className="hover:underline">
                              {po.poNumber}
                            </Link>
                          </td>
                          <td className="px-5 py-3 text-txt-secondary text-xs name-lowercase">
                            {po.fromUserId ? '上線（內部調撥）' : po.supplierName || '—'}
                          </td>
                          <td className="px-5 py-3 text-txt-primary text-right tabular-nums font-medium whitespace-nowrap">
                            USD {po.totals.grandTotal.toFixed(2)}
                          </td>
                          <td className="px-5 py-3 text-center whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap ${
                                po.status === PurchaseOrderStatus.CANCELLED
                                  ? 'bg-red-600 text-white'
                                  : po.status === PurchaseOrderStatus.RECEIVED
                                    ? 'bg-blue-800 text-white'
                                    : 'bg-chip-dark text-white'
                              }`}
                            >
                              {poStatusLabels[po.status]}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-txt-subtle text-xs whitespace-nowrap">
                            {po.createdAt
                              ? new Date(po.createdAt).toLocaleDateString('zh-TW')
                              : '—'}
                          </td>
                          <td className="px-5 py-3 text-center whitespace-nowrap">
                            <Link
                              href={`/purchase-orders/${po.id}`}
                              className="text-accent-text hover:underline text-xs inline"
                            >
                              查看
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
