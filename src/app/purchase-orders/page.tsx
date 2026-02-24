'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PurchaseOrderService } from '@/services/database/purchaseOrders';
import { UserService } from '@/services/database/users';
import {
  PurchaseOrder,
  UserRole,
  PurchaseOrderStatus,
  User,
} from '@/types/models';
import Link from 'next/link';

const statusLabels: Record<PurchaseOrderStatus, string> = {
  [PurchaseOrderStatus.DRAFT]: '草稿',
  [PurchaseOrderStatus.SUBMITTED]: '已提交',
  [PurchaseOrderStatus.PARTIAL]: '部分收貨',
  [PurchaseOrderStatus.RECEIVED]: '已收貨',
  [PurchaseOrderStatus.CANCELLED]: '已取消',
};

const statusColors: Record<PurchaseOrderStatus, string> = {
  [PurchaseOrderStatus.DRAFT]: 'bg-chip-dark text-white border border-chip-dark',
  [PurchaseOrderStatus.SUBMITTED]: 'bg-chip-dark text-white border border-chip-dark',
  [PurchaseOrderStatus.PARTIAL]: 'bg-chip-dark text-white border border-chip-dark',
  [PurchaseOrderStatus.RECEIVED]: 'bg-blue-800 text-white border border-blue-800',
  [PurchaseOrderStatus.CANCELLED]: 'bg-red-600 text-white border border-red-600',
};

export default function PurchaseOrdersPage() {
  const { user, role, firebaseUser } = useAuth();
  const [orders, setOrders] = useState<(PurchaseOrder & { id: string })[]>([]);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [stockists, setStockists] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PurchaseOrderStatus | 'all'>('all');
  const [filterStockist, setFilterStockist] = useState('');

  useEffect(() => {
    load();
  }, [user?.id, role, filterStockist]);

  async function load() {
    if (!user?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [orderList, userList] = await Promise.all([
      role === UserRole.ADMIN && filterStockist
          ? PurchaseOrderService.getByUser(filterStockist, undefined, 100)
          : role === UserRole.ADMIN
            ? PurchaseOrderService.getAll(undefined, 100)
            : PurchaseOrderService.getByUser(user.id, undefined, 100),
        role === UserRole.ADMIN ? UserService.getStockists() : [],
      ]);
      setOrders(orderList);
      setStockists(userList);
      const userMap: Record<string, User> = {};
      userList.forEach((u) => {
        if (u.id) userMap[u.id] = u;
      });
      // 收貨人為目前登入者時，顯示姓名而非 UID
      const currentUserId = user?.id ?? firebaseUser?.uid;
      if (role === UserRole.ADMIN && currentUserId && user) {
        userMap[currentUserId] = user;
      }
      setUsers(userMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }

  const filtered = filter === 'all' ? orders : orders.filter((o) => o.status === filter);

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-txt-primary">進貨單</h1>
            <p className="text-xs text-txt-subtle mt-0.5">批次進貨與成本追蹤</p>
          </div>
          <Link
            href="/purchase-orders/create"
            className="px-3.5 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition-colors"
          >
            + 新增進貨單
          </Link>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {role === UserRole.ADMIN && stockists.length > 0 && (
            <select
              value={filterStockist}
              onChange={(e) => setFilterStockist(e.target.value)}
              className="px-3 py-1.5 bg-surface-1 border border-border rounded-lg text-txt-primary text-xs focus:outline-none focus:border-accent name-lowercase"
            >
              <option value="">All</option>
              {(user?.id ?? firebaseUser?.uid) && (
                <option value={user?.id ?? firebaseUser?.uid}>tan sun sun (Admin)</option>
              )}
              {stockists.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            {(['all', PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.RECEIVED] as const).map(
              (s) => (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filter === s
                      ? 'bg-accent/20 text-accent-text border border-accent/40'
                      : 'bg-surface-1 border border-border text-txt-secondary hover:text-txt-primary'
                  }`}
                >
                  {s === 'all' ? '全部' : statusLabels[s]}
                </button>
              )
            )}
          </div>
        </div>

        <div className="glass-panel overflow-hidden">
          {loading ? (
            <div className="py-16 text-center">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3"></div>
              <p className="text-txt-subtle text-sm">載入中...</p>
            </div>
          ) : error ? (
            <div className="py-16 text-center">
              <div className="msg-error px-4 py-3 rounded-lg text-sm mb-4 inline-block">{error}</div>
              <button
                onClick={load}
                className="text-xs text-accent-text hover:underline"
              >
                重新載入
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-txt-subtle text-sm">尚無進貨單</p>
              <Link
                href="/purchase-orders/create"
                className="mt-2 inline-block text-xs text-accent-text hover:underline"
              >
                建立第一張進貨單 →
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-base">
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest min-w-[7.5rem]">
                    進貨單號
                  </th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">
                    供應商 / 來源
                  </th>
                  {role === UserRole.ADMIN && (
                    <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">
                      收貨人
                    </th>
                  )}
                  <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-txt-subtle uppercase tracking-widest min-w-[5.5rem]">
                    金額
                  </th>
                  <th className="px-5 py-2.5 text-center text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">
                    狀態
                  </th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">
                    建立時間
                  </th>
                  <th className="px-5 py-2.5 text-center text-[10px] font-semibold text-txt-subtle uppercase tracking-widest w-20">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {filtered.map((po) => (
                  <tr key={po.id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-accent-text whitespace-nowrap">
                      <Link
                        href={`/purchase-orders/${po.id}`}
                        className="hover:underline"
                      >
                        {po.poNumber}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-txt-secondary name-lowercase">
                      {po.fromUserId ? (
                        <span className="text-blue-400">上線（內部調撥）</span>
                      ) : (
                        po.supplierName || '—'
                      )}
                    </td>
                    {role === UserRole.ADMIN && (
                      <td className="px-5 py-3 text-txt-secondary name-lowercase">
                        {users[po.userId]?.displayName || po.userId}
                      </td>
                    )}
                    <td className="px-5 py-3 text-txt-primary text-right tabular-nums font-medium whitespace-nowrap">
                      USD {po.totals.grandTotal.toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap ${
                          statusColors[po.status]
                        }`}
                      >
                        {statusLabels[po.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-txt-subtle text-xs whitespace-nowrap">
                      {po.createdAt
                        ? new Date(po.createdAt).toLocaleDateString('zh-TW')
                        : '—'}
                    </td>
                    <td className="px-5 py-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2 flex-nowrap">
                        <Link
                          href={`/purchase-orders/${po.id}`}
                          className="px-2 py-1 text-xs text-accent-text hover:underline"
                        >
                          查看
                        </Link>
                        {(po.status === PurchaseOrderStatus.DRAFT || po.status === PurchaseOrderStatus.SUBMITTED) && (
                          <Link
                            href={`/purchase-orders/${po.id}/edit`}
                            className="px-2 py-1 text-xs bg-blue-400 hover:bg-blue-500 text-white border border-blue-500 rounded transition-colors"
                          >
                            修改
                          </Link>
                        )}
                        {po.status !== PurchaseOrderStatus.RECEIVED && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm(`確定要刪除進貨單 ${po.poNumber} 嗎？${po.status === PurchaseOrderStatus.DRAFT ? '草稿將被移除。' : '已提交的進貨單將改為已取消。'}此操作無法復原。`)) return;
                              try {
                                if (po.status === PurchaseOrderStatus.DRAFT || po.status === PurchaseOrderStatus.CANCELLED) {
                                  await PurchaseOrderService.delete(po.id);
                                } else {
                                  await PurchaseOrderService.cancel(po.id);
                                }
                                await load();
                              } catch (err) {
                                alert(err instanceof Error ? err.message : '刪除失敗');
                              }
                            }}
                            className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                          >
                            刪除
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
