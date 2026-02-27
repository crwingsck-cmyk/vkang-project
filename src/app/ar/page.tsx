'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ReceivableService } from '@/services/database/receivables';
import { UserService } from '@/services/database/users';
import { Receivable, ReceivableStatus, UserRole, User } from '@/types/models';

const statusLabel: Record<ReceivableStatus, string> = {
  [ReceivableStatus.OUTSTANDING]: '未收',
  [ReceivableStatus.PARTIAL_PAID]: '部分已收',
  [ReceivableStatus.PAID]: '已收清',
};

const statusColors: Record<ReceivableStatus, string> = {
  [ReceivableStatus.OUTSTANDING]: 'bg-red-900/40 text-red-300',
  [ReceivableStatus.PARTIAL_PAID]: 'bg-yellow-900/40 text-yellow-300',
  [ReceivableStatus.PAID]: 'bg-green-900/40 text-green-300',
};

function agingLabel(createdAt?: number): string {
  if (!createdAt) return '—';
  const days = Math.floor((Date.now() - createdAt) / 86400000);
  if (days <= 30) return `${days}天`;
  if (days <= 60) return `${days}天 ⚠️`;
  return `${days}天 🔴`;
}

export default function ARPage() {
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [customers, setCustomers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCustomer, setFilterCustomer] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState<ReceivableStatus | 'ALL'>('ALL');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, custs] = await Promise.all([
        ReceivableService.getAll(),
        UserService.getByRole(UserRole.CUSTOMER),
      ]);
      setReceivables(list);
      setCustomers(custs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = receivables.filter((r) => {
    if (filterCustomer !== 'ALL' && r.customerId !== filterCustomer) return false;
    if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;
    return true;
  });

  const totalOutstanding = receivables
    .filter((r) => r.status !== ReceivableStatus.PAID)
    .reduce((s, r) => s + r.remainingAmount, 0);
  const countPartial = receivables.filter((r) => r.status === ReceivableStatus.PARTIAL_PAID).length;
  const countPaid = receivables.filter((r) => r.status === ReceivableStatus.PAID).length;

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-txt-primary tracking-tight">應收款台帳</h1>
          <p className="text-sm text-txt-subtle mt-0.5">追蹤每筆發貨單的應收、已收、未收金額</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-bold tabular-nums text-red-400">
              {totalOutstanding.toFixed(0)}
            </p>
            <p className="text-xs text-txt-subtle mt-1">未收總額</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-bold tabular-nums text-yellow-400">{countPartial}</p>
            <p className="text-xs text-txt-subtle mt-1">部分已收</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-bold tabular-nums text-green-400">{countPaid}</p>
            <p className="text-xs text-txt-subtle mt-1">已收清</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filterCustomer}
            onChange={(e) => setFilterCustomer(e.target.value)}
            className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-txt-primary focus:outline-none focus:border-accent"
          >
            <option value="ALL">所有客戶</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.displayName}</option>
            ))}
          </select>
          <div className="flex gap-2">
            {(['ALL', ...Object.values(ReceivableStatus)] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  filterStatus === s
                    ? 'bg-accent/20 text-accent-text border border-accent/40'
                    : 'text-txt-subtle hover:text-txt-primary hover:bg-surface-2 border border-transparent'
                }`}
              >
                {s === 'ALL' ? '全部' : statusLabel[s]}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3" />
            <p className="text-txt-subtle text-sm">載入中...</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <p className="text-txt-subtle text-sm">沒有符合條件的應收款記錄</p>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-txt-subtle text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">發貨單號</th>
                  <th className="px-4 py-3 text-left">銷售訂單</th>
                  <th className="px-4 py-3 text-left">客戶</th>
                  <th className="px-4 py-3 text-left">發貨日</th>
                  <th className="px-4 py-3 text-right">總額</th>
                  <th className="px-4 py-3 text-right">已收</th>
                  <th className="px-4 py-3 text-right">未收</th>
                  <th className="px-4 py-3 text-center">狀態</th>
                  <th className="px-4 py-3 text-center">帳齡</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-2/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-accent-text">{r.deliveryNoteNo}</td>
                    <td className="px-4 py-3 font-mono text-xs text-txt-subtle">{r.salesOrderNo}</td>
                    <td className="px-4 py-3 text-txt-primary">{r.customerName}</td>
                    <td className="px-4 py-3 text-txt-subtle">
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString('zh-TW') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {r.currency ?? 'MYR'} {r.totalAmount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-400">
                      {r.paidAmount > 0 ? `${r.paidAmount.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-400 font-medium">
                      {r.remainingAmount > 0 ? `${r.remainingAmount.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[r.status]}`}>
                        {statusLabel[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-txt-subtle">
                      {r.status !== ReceivableStatus.PAID ? agingLabel(r.createdAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
