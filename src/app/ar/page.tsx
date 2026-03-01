'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ReceivableService } from '@/services/database/receivables';
import { UserService } from '@/services/database/users';
import { Receivable, ReceivableStatus, UserRole, User } from '@/types/models';
import Link from 'next/link';

const statusLabel: Record<ReceivableStatus, string> = {
  [ReceivableStatus.OUTSTANDING]: 'Outstanding',
  [ReceivableStatus.PARTIAL_PAID]: 'Partial Paid',
  [ReceivableStatus.PAID]: 'Paid',
};

const statusColors: Record<ReceivableStatus, string> = {
  [ReceivableStatus.OUTSTANDING]: 'bg-red-100 text-red-700 border border-red-200',
  [ReceivableStatus.PARTIAL_PAID]: 'bg-yellow-100 text-yellow-700 border border-yellow-200',
  [ReceivableStatus.PAID]: 'bg-green-100 text-green-700 border border-green-200',
};

function agingLabel(createdAt?: number): string {
  if (!createdAt) return '—';
  const days = Math.floor((Date.now() - createdAt) / 86400000);
  if (days <= 30) return `${days}d`;
  if (days <= 60) return `${days}d ⚠`;
  return `${days}d 🔴`;
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
        UserService.getAll(),
      ]);
      setReceivables(list);
      setCustomers(custs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this receivable record? This action cannot be undone.')) return;
    await ReceivableService.delete(id);
    await load();
  };

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
  const countOutstanding = receivables.filter((r) => r.status === ReceivableStatus.OUTSTANDING).length;

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-6">

        {/* Page header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">Accounts Receivable</h1>
            <p className="text-sm text-gray-500 mt-0.5">Track outstanding, partial, and cleared receivables per delivery</p>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl bg-red-50 border border-red-200 p-5 text-center shadow-sm">
            <p className="text-3xl font-bold tabular-nums text-red-600 leading-none">
              {totalOutstanding.toFixed(0)}
            </p>
            <p className="text-xs text-red-500 mt-2 font-medium uppercase tracking-wide">Outstanding Balance</p>
          </div>
          <div className="rounded-2xl bg-gray-50 border border-gray-200 p-5 text-center shadow-sm">
            <p className="text-3xl font-bold tabular-nums text-yellow-600 leading-none">{countPartial}</p>
            <p className="text-xs text-gray-500 mt-2 font-medium uppercase tracking-wide">Partial Paid</p>
          </div>
          <div className="rounded-2xl bg-green-50 border border-green-200 p-5 text-center shadow-sm">
            <p className="text-3xl font-bold tabular-nums text-green-600 leading-none">{countPaid}</p>
            <p className="text-xs text-green-500 mt-2 font-medium uppercase tracking-wide">Fully Paid</p>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-xl bg-white border border-gray-200 px-4 py-3 flex flex-wrap items-center gap-3 shadow-sm">
          <select
            value={filterCustomer}
            onChange={(e) => setFilterCustomer(e.target.value)}
            className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:border-violet-500"
          >
            <option value="ALL">所有人</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.displayName}</option>
            ))}
          </select>

          <div className="flex gap-1.5">
            {([
              { key: 'ALL', label: 'All', count: receivables.length },
              { key: ReceivableStatus.OUTSTANDING, label: 'Outstanding', count: countOutstanding },
              { key: ReceivableStatus.PARTIAL_PAID, label: 'Partial', count: countPartial },
              { key: ReceivableStatus.PAID, label: 'Paid', count: countPaid },
            ] as { key: ReceivableStatus | 'ALL'; label: string; count: number }[]).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilterStatus(f.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filterStatus === f.key
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                }`}
              >
                {f.label}
                <span className={`text-[10px] tabular-nums ${filterStatus === f.key ? 'text-gray-300' : 'text-gray-400'}`}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-violet-600 mb-3" />
            <p className="text-gray-500 text-sm">Loading...</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="rounded-2xl bg-white border border-gray-200 py-16 text-center shadow-sm">
            <p className="text-gray-400 text-sm">No receivables match the current filter</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            {/* Table header strip */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">Receivables</span>
                <span className="text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium tabular-nums">{visible.length}</span>
              </div>
              {totalOutstanding > 0 && (
                <span className="text-xs font-semibold text-red-600 tabular-nums">
                  Total Outstanding: {totalOutstanding.toFixed(2)}
                </span>
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 text-[11px] uppercase tracking-wide">
                  <th className="px-5 py-3 text-left">DN No.</th>
                  <th className="px-5 py-3 text-left">Sales Order</th>
                  <th className="px-5 py-3 text-left">Customer</th>
                  <th className="px-5 py-3 text-left">Date</th>
                  <th className="px-5 py-3 text-right">Total</th>
                  <th className="px-5 py-3 text-right">Paid</th>
                  <th className="px-5 py-3 text-right">Outstanding</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3 text-center">Aging</th>
                  <th className="px-5 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs text-gray-900 font-bold">
                      <Link href={`/customers/${r.customerId}`} className="hover:text-violet-700 transition-colors">
                        {r.deliveryNoteNo}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-gray-500">{r.salesOrderNo || '—'}</td>
                    <td className="px-5 py-3.5 font-semibold text-gray-900 name-lowercase">
                      <Link href={`/customers/${r.customerId}`} className="hover:text-violet-700 transition-colors">
                        {r.customerName}
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600 text-xs">
                      {r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-MY') : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums font-bold text-gray-900">
                      RM {r.totalAmount.toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-gray-700 font-semibold">
                      {r.paidAmount > 0 ? r.paidAmount.toFixed(2) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums text-gray-900 font-bold">
                      {r.remainingAmount > 0 ? r.remainingAmount.toFixed(2) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${statusColors[r.status]}`}>
                        {statusLabel[r.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center text-xs text-gray-600 font-medium">
                      {r.status !== ReceivableStatus.PAID ? agingLabel(r.createdAt) : '—'}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <button
                        onClick={() => handleDelete(r.id!)}
                        className="text-[11px] px-2.5 py-1 rounded-md bg-red-700 text-white hover:bg-red-800 transition-colors font-medium"
                      >
                        Delete
                      </button>
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
