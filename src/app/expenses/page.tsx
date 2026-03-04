'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ExpenseService } from '@/services/database/expenses';
import { ExpenseChargeService } from '@/services/database/expenseCharges';
import { UserService } from '@/services/database/users';
import {
  Expense,
  ExpenseType,
  ExpenseCharge,
  ExpenseChargeStatus,
  User,
  UserRole,
} from '@/types/models';
import { generateDocumentNumber } from '@/lib/documentNumber';
import Link from 'next/link';

const EXPENSE_TYPE_LABEL: Record<ExpenseType, string> = {
  [ExpenseType.WEIGHING_SCALE]: 'Weighing Scale',
  [ExpenseType.SHIPPING]: 'Shipping',
  [ExpenseType.SALARY]: 'Salary',
};

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'credit', label: 'Cheque' },
];

function fmtDate(ts?: number) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-GB');
}

export default function ExpensesPage() {
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<(Expense & { id: string })[]>([]);
  const [charges, setCharges] = useState<(ExpenseCharge & { id: string })[]>([]);
  const [customers, setCustomers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<ExpenseType | 'ALL'>('ALL');

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addType, setAddType] = useState<ExpenseType>(ExpenseType.WEIGHING_SCALE);
  const [addAmount, setAddAmount] = useState('');
  const [addPaidTo, setAddPaidTo] = useState('');
  const [addDate, setAddDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [addPayMethod, setAddPayMethod] = useState('bank');
  const [addPayRef, setAddPayRef] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  // Allocate modal
  const [showAllocModal, setShowAllocModal] = useState(false);
  const [allocExpense, setAllocExpense] = useState<(Expense & { id: string }) | null>(null);
  const [allocCustomerId, setAllocCustomerId] = useState('');
  const [allocAmount, setAllocAmount] = useState('');
  const [allocSaving, setAllocSaving] = useState(false);
  const [allocError, setAllocError] = useState('');

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editExpense, setEditExpense] = useState<(Expense & { id: string }) | null>(null);
  const [editType, setEditType] = useState<ExpenseType>(ExpenseType.WEIGHING_SCALE);
  const [editAmount, setEditAmount] = useState('');
  const [editPaidTo, setEditPaidTo] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editPayMethod, setEditPayMethod] = useState('bank');
  const [editPayRef, setEditPayRef] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<(Expense & { id: string }) | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [expList, chargeList, custs] = await Promise.all([
        ExpenseService.getAll(),
        ExpenseChargeService.getAll(),
        UserService.getAll(),
      ]);
      setExpenses(expList);
      setCharges(chargeList);
      setCustomers(custs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = expenses.filter(
    (e) => filterType === 'ALL' || e.type === filterType
  );

  const openAddModal = async () => {
    setShowAddModal(true);
    setAddType(ExpenseType.WEIGHING_SCALE);
    setAddAmount('');
    setAddPaidTo('');
    setAddDate(new Date().toISOString().slice(0, 10));
    setAddPayMethod('bank');
    setAddPayRef('');
    setAddDesc('');
    setAddError('');
    const custs = await UserService.getAll();
    setCustomers(custs);
  };

  const handleAdd = async () => {
    const amount = parseFloat(addAmount);
    if (!addPaidTo.trim()) { setAddError('Please enter payee'); return; }
    if (!amount || amount <= 0) { setAddError('Please enter a valid amount'); return; }

    setAddSaving(true);
    setAddError('');
    try {
      const isRecoverable = addType !== ExpenseType.SALARY;
      const existingNos = await ExpenseService.getAllExpenseNos();
      const expenseNo = generateDocumentNumber('EX', existingNos);

      await ExpenseService.create({
        expenseNo,
        type: addType,
        amount,
        paidTo: addPaidTo.trim(),
        paymentDate: new Date(addDate + 'T12:00:00').getTime(),
        paymentMethod: addPayMethod,
        paymentReference: addPayRef || undefined,
        description: addDesc || undefined,
        isRecoverable,
        ownerId: undefined,
        createdBy: user?.id,
      });
      setShowAddModal(false);
      await load();
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setAddSaving(false);
    }
  };

  const openEditModal = (exp: Expense & { id: string }) => {
    setEditExpense(exp);
    setEditType(exp.type);
    setEditAmount(exp.amount.toString());
    setEditPaidTo(exp.paidTo);
    setEditDate(exp.paymentDate ? new Date(exp.paymentDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    setEditPayMethod(exp.paymentMethod ?? 'bank');
    setEditPayRef(exp.paymentReference ?? '');
    setEditDesc(exp.description ?? '');
    setEditError('');
    setShowEditModal(true);
  };

  const handleEdit = async () => {
    if (!editExpense) return;
    const amount = parseFloat(editAmount);
    if (!editPaidTo.trim()) { setEditError('Please enter payee'); return; }
    if (!amount || amount <= 0) { setEditError('Please enter a valid amount'); return; }

    setEditSaving(true);
    setEditError('');
    try {
      await ExpenseService.update(editExpense.id!, {
        type: editType,
        amount,
        paidTo: editPaidTo.trim(),
        paymentDate: new Date(editDate + 'T12:00:00').getTime(),
        paymentMethod: editPayMethod,
        paymentReference: editPayRef || undefined,
        description: editDesc || undefined,
        isRecoverable: editType !== ExpenseType.SALARY,
        ownerId: undefined,
      });
      setShowEditModal(false);
      setEditExpense(null);
      await load();
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteSaving(true);
    try {
      const expCharges = charges.filter((c) => c.expenseId === deleteTarget.id);
      if (expCharges.length > 0) {
        setDeleteTarget(null);
        alert('This expense has allocation records. Please remove allocations first.');
        return;
      }
      await ExpenseService.delete(deleteTarget.id!);
      setDeleteTarget(null);
      await load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleteSaving(false);
    }
  };

  const openAllocModal = (exp: Expense & { id: string }) => {
    if (!exp.isRecoverable) return;
    setAllocExpense(exp);
    setAllocCustomerId('');
    setAllocAmount('');
    setAllocError('');
    setShowAllocModal(true);
  };

  const handleAlloc = async () => {
    if (!allocExpense) return;
    const amount = parseFloat(allocAmount);
    if (!allocCustomerId) { setAllocError('Please select customer'); return; }
    if (!amount || amount <= 0) { setAllocError('Please enter a valid amount'); return; }

    const existingCharges = charges.filter((c) => c.expenseId === allocExpense.id);
    const alreadyAllocated = existingCharges.reduce((s, c) => s + c.amount, 0);
    if (amount > allocExpense.amount - alreadyAllocated + 0.001) {
      setAllocError(`Exceeds allocatable amount (remaining ${(allocExpense.amount - alreadyAllocated).toFixed(2)})`);
      return;
    }

    setAllocSaving(true);
    setAllocError('');
    try {
      const cust = customers.find((c) => c.id === allocCustomerId);
      await ExpenseChargeService.create({
        expenseId: allocExpense.id!,
        expenseNo: allocExpense.expenseNo,
        expenseType: allocExpense.type,
        customerId: allocCustomerId,
        customerName: cust?.displayName ?? '',
        amount,
        paidAmount: 0,
        remainingAmount: amount,
        status: ExpenseChargeStatus.OUTSTANDING,
        createdBy: user?.id,
      });
      setShowAllocModal(false);
      setAllocExpense(null);
      await load();
    } catch (e: unknown) {
      setAllocError(e instanceof Error ? e.message : 'Allocation failed');
    } finally {
      setAllocSaving(false);
    }
  };

  const getChargesForExpense = (expenseId: string) =>
    charges.filter((c) => c.expenseId === expenseId);

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-txt-primary tracking-tight">Expense Management</h1>
            <p className="text-base text-txt-subtle mt-0.5">Weighing scale, shipping, salary — recoverable expenses can be allocated to stockists/customers</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/expense-receipts"
              className="px-4 py-2.5 border border-accent text-accent-text rounded-lg text-base font-medium hover:bg-accent/10 transition-colors"
            >
              Expense Receipts
            </Link>
            <button
              onClick={openAddModal}
              className="px-5 py-2.5 bg-accent text-white rounded-lg text-base font-medium hover:bg-accent-hover transition-colors"
            >
              + Add Expense
            </button>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          {(['ALL', ExpenseType.WEIGHING_SCALE, ExpenseType.SHIPPING, ExpenseType.SALARY] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                filterType === t
                  ? 'bg-accent/20 text-accent-text border border-accent/40'
                  : 'text-txt-subtle hover:text-txt-primary hover:bg-surface-2 border border-transparent'
              }`}
            >
              {t === 'ALL' ? 'All' : EXPENSE_TYPE_LABEL[t]}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3" />
            <p className="text-txt-subtle text-sm">Loading...</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <p className="text-txt-subtle text-sm">No expense records yet</p>
            <button
              onClick={openAddModal}
              className="mt-4 px-4 py-2 text-sm font-medium text-accent-text hover:underline"
            >
              + Add first expense
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-base">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-sm uppercase tracking-wide border-b border-gray-200">
                  <th className="px-4 py-3 text-left">Expense ID</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Payee</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-left">Allocation</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((e) => {
                  const expCharges = getChargesForExpense(e.id!);
                  const allocated = expCharges.reduce((s, c) => s + c.amount, 0);
                  return (
                    <tr key={e.id} className="bg-white hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-sm font-bold text-gray-900">{e.expenseNo}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {EXPENSE_TYPE_LABEL[e.type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{fmtDate(e.paymentDate)}</td>
                      <td className="px-4 py-3 text-gray-900">{e.paidTo}</td>
                      <td className="px-4 py-3 text-right font-bold tabular-nums text-gray-900">
                        RM {e.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {expCharges.length > 0 ? (
                          <span>
                            Allocated {allocated.toFixed(2)} / {e.amount.toFixed(2)}
                            {expCharges.map((c) => (
                              <span key={c.id} className="flex items-center gap-1.5 text-xs text-gray-500">
                                → {c.customerName} RM {c.amount.toFixed(2)}
                                <span className="text-gray-400 font-mono">({c.expenseNo})</span>
                                {c.paidAmount <= 0 ? (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      if (!confirm(`Remove allocation to ${c.customerName}?`)) return;
                                      try {
                                        await ExpenseChargeService.delete(c.id!);
                                        await load();
                                      } catch (err) {
                                        alert(err instanceof Error ? err.message : 'Remove failed');
                                      }
                                    }}
                                    className="text-red-500 hover:text-red-700 hover:underline"
                                    title="Remove allocation"
                                  >
                                    Remove
                                  </button>
                                ) : (
                                  <span className="text-amber-600" title="Cannot remove - payment received">(paid)</span>
                                )}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditModal(e)}
                            className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeleteTarget(e)}
                            className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                          >
                            Delete
                          </button>
                          {e.isRecoverable && (
                            <button
                              onClick={() => openAllocModal(e)}
                              className="text-xs px-2 py-1 rounded bg-accent text-white hover:bg-accent-hover"
                            >
                              Allocate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Add Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md shadow-2xl my-8 flex flex-col max-h-[calc(100vh-4rem)]">
              <div className="px-6 py-4 border-b border-gray-200 shrink-0">
                <h2 className="text-lg font-semibold text-gray-900">Add Expense</h2>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expense Type *</label>
                  <select
                    value={addType}
                    onChange={(e) => setAddType(e.target.value as ExpenseType)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  >
                    {Object.entries(EXPENSE_TYPE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payee *</label>
                  <input
                    type="text"
                    value={addPaidTo}
                    onChange={(e) => setAddPaidTo(e.target.value)}
                    placeholder="Vendor, courier, employee name, etc."
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date *</label>
                  <input
                    type="date"
                    value={addDate}
                    onChange={(e) => setAddDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (RM) *</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                  <select
                    value={addPayMethod}
                    onChange={(e) => setAddPayMethod(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks (optional)</label>
                  <textarea
                    value={addDesc}
                    onChange={(e) => setAddDesc(e.target.value)}
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  />
                </div>
                {addError && <p className="text-sm text-red-600">{addError}</p>}
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 shrink-0 bg-white rounded-b-2xl">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={addSaving}
                  className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover disabled:opacity-50 rounded-lg"
                >
                  {addSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Allocate Modal */}
        {showAllocModal && allocExpense && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md shadow-2xl">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Allocate Expense</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {allocExpense.expenseNo} · {EXPENSE_TYPE_LABEL[allocExpense.type]} · RM {allocExpense.amount.toFixed(2)}
                </p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Allocate to *</label>
                  <select
                    value={allocCustomerId}
                    onChange={(e) => setAllocCustomerId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  >
                    <option value="">— Select stockist/customer —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.displayName} ({c.role === UserRole.STOCKIST ? 'Stockist' : 'Customer'})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Allocation Amount (RM) *</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={allocAmount}
                    onChange={(e) => setAllocAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  />
                </div>
                {allocError && <p className="text-sm text-red-600">{allocError}</p>}
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setShowAllocModal(false); setAllocExpense(null); }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAlloc}
                  disabled={allocSaving}
                  className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover disabled:opacity-50 rounded-lg"
                >
                  {allocSaving ? 'Allocating...' : 'Confirm Allocation'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Modal */}
        {showEditModal && editExpense && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md shadow-2xl my-8 flex flex-col max-h-[calc(100vh-4rem)]">
              <div className="px-6 py-4 border-b border-gray-200 shrink-0">
                <h2 className="text-lg font-semibold text-gray-900">Edit Expense</h2>
                <p className="text-sm text-gray-500 mt-0.5">{editExpense.expenseNo}</p>
              </div>
              <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expense Type *</label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as ExpenseType)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  >
                    {Object.entries(EXPENSE_TYPE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payee *</label>
                  <input
                    type="text"
                    value={editPaidTo}
                    onChange={(e) => setEditPaidTo(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date *</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (RM) *</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                  <select
                    value={editPayMethod}
                    onChange={(e) => setEditPayMethod(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks (optional)</label>
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  />
                </div>
                {editError && <p className="text-sm text-red-600">{editError}</p>}
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setEditExpense(null); }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleEdit}
                  disabled={editSaving}
                  className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover disabled:opacity-50 rounded-lg"
                >
                  {editSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation */}
        {deleteTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-sm shadow-2xl p-6">
              <h2 className="text-lg font-semibold text-gray-900">Confirm Delete</h2>
              <p className="mt-2 text-sm text-gray-600">
                Are you sure you want to delete expense &quot;{deleteTarget.expenseNo}&quot;? This cannot be undone.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleteSaving}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleteSaving}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50"
                >
                  {deleteSaving ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
