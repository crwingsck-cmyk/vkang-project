'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { OrderService } from '@/services/database/orders';
import { UserService } from '@/services/database/users';
import { Transaction, UserRole, TransactionStatus, User } from '@/types/models';
import { sortByNameEnglishFirst } from '@/lib/sortUsers';
import Link from 'next/link';

const statusBadge: Record<TransactionStatus, string> = {
  [TransactionStatus.PENDING]:   'bg-chip-yellow text-gray-800 border border-amber-200',
  [TransactionStatus.COMPLETED]: 'bg-chip-cyan text-gray-800 border border-cyan-200',
  [TransactionStatus.CANCELLED]: 'bg-chip-dark text-white border border-chip-dark',
};

export default function OrdersPage() {
  const { user, role, firebaseUser } = useAuth();
  const [orders, setOrders] = useState<Transaction[]>([]);
  const [stockists, setStockists] = useState<User[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<TransactionStatus | ''>('');
  const [filterStockist, setFilterStockist] = useState('');
  const [filterTo, setFilterTo] = useState('');

  useEffect(() => {
    if (user?.id) loadOrders();
  }, [user?.id, filterStatus, filterStockist, filterTo]);

  useEffect(() => {
    if (role === UserRole.ADMIN) {
      UserService.getStockists().then(setStockists).catch(console.error);
      UserService.getAllForAdmin(200).then(setAllUsers).catch(() => setAllUsers([]));
    }
  }, [role]);

  const fromOptions = allUsers.filter((u) => u.role === UserRole.ADMIN || u.role === UserRole.STOCKIST);

  async function loadOrders() {
    if (!user?.id) return;
    setLoading(true);
    try {
      let data: Transaction[];
      if (role === UserRole.ADMIN) {
        if (filterStockist && filterTo) {
          data = await OrderService.getByFromUser(filterStockist);
          data = data.filter((o) => o.toUser?.userId === filterTo);
        } else if (filterStockist) {
          data = await OrderService.getByFromUser(filterStockist);
        } else if (filterTo) {
          data = await OrderService.getByToUser(filterTo);
        } else {
          data = await OrderService.getAll();
        }
      } else if (filterStatus) {
        data = await OrderService.getByStatus(filterStatus as TransactionStatus);
      } else if (role === UserRole.STOCKIST) {
        data = await OrderService.getByFromUser(user.id);
      } else {
        data = await OrderService.getByToUser(user.id);
      }
      if (filterStatus && data.length > 0) {
        data = data.filter((o) => o.status === filterStatus);
      }
      setOrders(data);
    } catch (err) {
      console.error('Error loading orders:', err);
    } finally {
      setLoading(false);
    }
  }

  const pendingCount   = orders.filter((o) => o.status === TransactionStatus.PENDING).length;
  const completedCount = orders.filter((o) => o.status === TransactionStatus.COMPLETED).length;
  const cancelledCount = orders.filter((o) => o.status === TransactionStatus.CANCELLED).length;

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST, UserRole.CUSTOMER]}>
      <div className="space-y-5">

        {/* Page Header */}
        <div>
          <h1 className="text-xl font-bold text-txt-primary tracking-tight">Orders</h1>
          <p className="text-sm text-txt-subtle mt-0.5">Manage and track your orders</p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl border shadow-sm bg-blue-50 border-blue-200">
            <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1.5">Total</p>
            <p className="text-2xl font-bold tabular-nums text-txt-primary">{orders.length}</p>
          </div>
          <div className="p-4 rounded-xl border shadow-sm bg-amber-50 border-amber-200">
            <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1.5">Pending</p>
            <p className="text-2xl font-bold tabular-nums text-warning">{pendingCount}</p>
          </div>
          <div className="p-4 rounded-xl border shadow-sm bg-green-50 border-green-200">
            <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1.5">Completed</p>
            <p className="text-2xl font-bold tabular-nums text-success">{completedCount}</p>
          </div>
          <div className="p-4 rounded-xl border shadow-sm bg-red-50 border-red-200">
            <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1.5">Cancelled</p>
            <p className="text-2xl font-bold tabular-nums text-error">{cancelledCount}</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 glass-panel px-4 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            {role === UserRole.ADMIN && (
              <>
                <select
                  value={filterStockist}
                  onChange={(e) => setFilterStockist(e.target.value)}
                  className="px-3 py-1.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-xs focus:outline-none focus:border-accent"
                  title="From"
                >
                  <option value="">From: All</option>
                  {sortByNameEnglishFirst(fromOptions).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName}
                    </option>
                  ))}
                </select>
                <select
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                  className="px-3 py-1.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-xs focus:outline-none focus:border-accent"
                  title="To"
                >
                  <option value="">To: All</option>
                  {sortByNameEnglishFirst(allUsers).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}
                    </option>
                  ))}
                </select>
              </>
            )}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as TransactionStatus | '')}
              className="px-3 py-1.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-xs focus:outline-none focus:border-accent"
            >
              <option value="">All Status</option>
              <option value={TransactionStatus.PENDING}>Pending</option>
              <option value={TransactionStatus.COMPLETED}>Completed</option>
              <option value={TransactionStatus.CANCELLED}>Cancelled</option>
            </select>
          </div>
          {role !== UserRole.CUSTOMER && (
            <Link
              href="/orders/create"
              className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition-colors"
            >
              + Create Order
            </Link>
          )}
        </div>

        {/* Table */}
        <div className="glass-panel overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-10">
              <p className="text-txt-subtle text-sm">Loading orders...</p>
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-14 gap-3">
              <p className="text-txt-subtle text-sm">No orders found</p>
              {role !== UserRole.CUSTOMER && (
                <Link href="/orders/create" className="text-accent-text hover:underline text-xs">
                  Create your first order
                </Link>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-surface-2 border-b border-border">
                <tr>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest whitespace-nowrap">日期</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest whitespace-nowrap">發貨號碼</th>
                  {role === UserRole.ADMIN && (
                    <th className="px-5 py-3 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">From / To</th>
                  )}
                  <th className="px-5 py-3 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest min-w-[140px]">產品</th>
                  <th className="px-5 py-3 text-right text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Total</th>
                  <th className="px-5 py-3 text-center text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Status</th>
                  <th className="px-5 py-3 text-center text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-surface-2/50 transition-colors">
                    <td className="px-5 py-3.5 text-xs text-txt-subtle tabular-nums whitespace-nowrap">
                      {order.createdAt ? new Date(order.createdAt).toLocaleDateString('zh-TW') : '-'}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-txt-primary font-medium font-mono whitespace-nowrap">
                      <Link href={`/orders/${order.id}`} className="text-accent-text hover:underline">
                        {order.id}
                      </Link>
                    </td>
                    {role === UserRole.ADMIN && (
                      <td className="px-5 py-3.5 text-xs text-txt-subtle">
                        <span className="text-txt-secondary name-lowercase">{order.fromUser?.userName || '-'}</span>
                        {' → '}
                        <span className="text-txt-secondary name-lowercase">{order.toUser?.userName || '-'}</span>
                      </td>
                    )}
                    <td className="px-5 py-3.5 text-xs text-txt-secondary max-w-[200px]">
                      {order.items?.length
                        ? order.items.map((i, idx) => (
                            <div key={idx}>
                              {i.productName || i.productId} ×{i.quantity}
                            </div>
                          ))
                        : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-txt-secondary text-right font-medium tabular-nums">
                      USD {order.totals.grandTotal.toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${statusBadge[order.status]}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Link
                          href={`/orders/${order.id}`}
                          className="inline-block px-3 py-1 text-xs bg-blue-400 hover:bg-blue-500 text-white border border-blue-500 rounded-lg transition-colors"
                        >
                          修改
                        </Link>
                        {role !== UserRole.CUSTOMER && order.status !== TransactionStatus.CANCELLED && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm(`確定要刪除（取消）訂單 ${order.id} 嗎？此操作無法復原。`)) return;
                              try {
                                await OrderService.cancel(order.id!);
                                await loadOrders();
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
