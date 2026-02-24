'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { FinancialService } from '@/services/database/financials';
import {
  Financial,
  UserRole,
  FinancialType,
  FinancialCategory,
  PaymentStatus,
} from '@/types/models';

const typeBadge: Record<FinancialType, string> = {
  [FinancialType.INCOME]:  'bg-success/10 text-success border border-success/20',
  [FinancialType.EXPENSE]: 'bg-error/10 text-error border border-error/20',
};

const paymentBadge: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]:  'bg-warning/10 text-warning border border-warning/20',
  [PaymentStatus.PAID]:     'bg-success/10 text-success border border-success/20',
  [PaymentStatus.FAILED]:   'bg-error/10 text-error border border-error/20',
  [PaymentStatus.REFUNDED]: 'bg-accent/10 text-accent-text border border-accent/20',
};

function AddRecordModal({
  userId,
  onClose,
  onDone,
}: {
  userId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    type: FinancialType.INCOME,
    category: FinancialCategory.SALES,
    amount: '',
    description: '',
    paymentStatus: PaymentStatus.PAID,
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.amount || isNaN(parseFloat(form.amount))) {
      setError('Enter a valid amount.');
      return;
    }
    setSaving(true);
    try {
      await FinancialService.create({
        type: form.type as FinancialType,
        category: form.category as FinancialCategory,
        amount: parseFloat(form.amount),
        currency: 'USD',
        description: form.description.trim() || undefined,
        paymentStatus: form.paymentStatus as PaymentStatus,
        reconciled: false,
        createdBy: userId,
        relatedUser: { userId, userName: '' },
      });
      onDone();
    } catch (err: any) {
      setError(err?.message || 'Failed to create record.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-md p-6 space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-gray-100">Add Financial Record</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {error && (
          <div className="msg-error px-3 py-2 rounded-lg text-xs">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5">Type</label>
              <select
                name="type"
                value={form.type}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-xs focus:outline-none focus:border-blue-500"
              >
                <option value={FinancialType.INCOME}>Income</option>
                <option value={FinancialType.EXPENSE}>Expense</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1.5">Category</label>
              <select
                name="category"
                value={form.category}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-xs focus:outline-none focus:border-blue-500"
              >
                <option value={FinancialCategory.SALES}>Sales</option>
                <option value={FinancialCategory.PURCHASE}>Purchase</option>
                <option value={FinancialCategory.SHIPPING}>Shipping</option>
                <option value={FinancialCategory.OPERATIONAL}>Operational</option>
                <option value={FinancialCategory.REFUND}>Refund</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">
              Amount (USD) <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              name="amount"
              value={form.amount}
              onChange={handleChange}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">Description</label>
            <input
              type="text"
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="Optional"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1.5">Payment Status</label>
            <select
              name="paymentStatus"
              value={form.paymentStatus}
              onChange={handleChange}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-xs focus:outline-none focus:border-blue-500"
            >
              <option value={PaymentStatus.PAID}>Paid</option>
              <option value={PaymentStatus.PENDING}>Pending</option>
              <option value={PaymentStatus.FAILED}>Failed</option>
              <option value={PaymentStatus.REFUNDED}>Refunded</option>
            </select>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              {saving ? 'Saving...' : 'Add Record'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 text-gray-200 rounded-lg text-xs font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function FinancialsPage() {
  const { user, role } = useAuth();
  const [records, setRecords] = useState<Financial[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<FinancialType | ''>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [summary, setSummary] = useState({ totalIncome: 0, totalExpense: 0, net: 0 });

  useEffect(() => {
    if (user?.id) loadRecords();
  }, [user?.id, filterType]);

  async function loadRecords() {
    if (!user?.id) return;
    setLoading(true);
    try {
      let data: Financial[];
      if (filterType) {
        data = await FinancialService.getByType(filterType as FinancialType);
      } else if (role === UserRole.ADMIN) {
        data = await FinancialService.getAll();
      } else {
        data = await FinancialService.getByUser(user.id);
      }
      setRecords(data);

      const income  = data.filter((r) => r.type === FinancialType.INCOME).reduce((s, r) => s + r.amount, 0);
      const expense = data.filter((r) => r.type === FinancialType.EXPENSE).reduce((s, r) => s + r.amount, 0);
      setSummary({ totalIncome: income, totalExpense: expense, net: income - expense });
    } catch (err) {
      console.error('Error loading financials:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
      {showAddModal && user && (
        <AddRecordModal
          userId={user.id!}
          onClose={() => setShowAddModal(false)}
          onDone={() => { setShowAddModal(false); loadRecords(); }}
        />
      )}

      <div className="space-y-5">

        {/* Page Header */}
        <div>
          <h1 className="text-xl font-bold text-txt-primary tracking-tight">Financials</h1>
          <p className="text-sm text-txt-subtle mt-0.5">Track income and expenses</p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="p-4 rounded-xl border shadow-sm bg-green-50 border-green-200">
            <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1.5">Total Income</p>
            <p className="text-2xl font-bold tabular-nums text-success">USD {summary.totalIncome.toFixed(2)}</p>
          </div>
          <div className="p-4 rounded-xl border shadow-sm bg-red-50 border-red-200">
            <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1.5">Total Expense</p>
            <p className="text-2xl font-bold tabular-nums text-error">USD {summary.totalExpense.toFixed(2)}</p>
          </div>
          <div className="p-4 rounded-xl border shadow-sm bg-blue-50 border-blue-200">
            <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1.5">Net P&amp;L</p>
            <p className={`text-2xl font-bold tabular-nums ${summary.net >= 0 ? 'text-success' : 'text-error'}`}>
              USD {summary.net.toFixed(2)}
            </p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 bg-surface-1 border border-border rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as FinancialType | '')}
              className="px-3 py-1.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-xs focus:outline-none focus:border-accent"
            >
              <option value="">All Types</option>
              <option value={FinancialType.INCOME}>Income</option>
              <option value={FinancialType.EXPENSE}>Expense</option>
            </select>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition-colors"
          >
            + Add Record
          </button>
        </div>

        {/* Table */}
        <div className="glass-panel overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-10">
              <p className="text-txt-subtle text-sm">Loading records...</p>
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-14 gap-3">
              <p className="text-txt-subtle text-sm">No financial records found</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="text-accent-text hover:underline text-xs"
              >
                Add your first record
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-surface-2 border-b border-border">
                <tr>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Date</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Type</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Category</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Description</th>
                  <th className="px-5 py-3 text-right text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Amount</th>
                  <th className="px-5 py-3 text-center text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Status</th>
                  <th className="px-5 py-3 text-center text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Reconciled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((record) => (
                  <tr key={record.id} className="hover:bg-surface-2/50 transition-colors">
                    <td className="px-5 py-3.5 text-xs text-txt-subtle">
                      {record.createdAt ? new Date(record.createdAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${typeBadge[record.type]}`}>
                        {record.type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-txt-subtle capitalize">{record.category}</td>
                    <td className="px-5 py-3.5 text-xs text-txt-secondary">{record.description || '-'}</td>
                    <td className="px-5 py-3.5 text-xs text-txt-primary text-right font-semibold tabular-nums">
                      USD {record.amount.toFixed(2)}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${paymentBadge[record.paymentStatus]}`}>
                        {record.paymentStatus}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center text-xs">
                      {record.reconciled ? (
                        <span className="text-success font-medium">Yes</span>
                      ) : (
                        <span className="text-txt-subtle">No</span>
                      )}
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
