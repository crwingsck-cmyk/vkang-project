'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { OrderService } from '@/services/database/orders';
import { ProductService } from '@/services/database/products';
import { UserService } from '@/services/database/users';
import { InventorySyncService } from '@/services/database/inventorySync';
import { useToast } from '@/context/ToastContext';
import {
  Transaction,
  UserRole,
  TransactionStatus,
  TransactionType,
  PaymentMethod,
  TransactionItem,
  Product,
  User,
} from '@/types/models';
import Link from 'next/link';

const statusColors: Record<TransactionStatus, string> = {
  [TransactionStatus.PENDING]: 'bg-yellow-900/30 text-yellow-300',
  [TransactionStatus.COMPLETED]: 'bg-green-900/30 text-green-300',
  [TransactionStatus.CANCELLED]: 'bg-red-900/30 text-red-300',
};

function CreateLoanModal({
  fromUser,
  onClose,
  onDone,
}: {
  fromUser: User;
  onClose: () => void;
  onDone: () => void;
}) {
  const [stockists, setStockists] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [toUserId, setToUserId] = useState('');
  const [returnDueDays, setReturnDueDays] = useState('30');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ productId: '', productName: '', quantity: 1, unitPrice: 0 }]);

  useEffect(() => {
    UserService.getStockists().then(setStockists).catch(console.error);
    ProductService.getAll().then(setProducts).catch(console.error);
  }, []);

  function updateItem(index: number, field: string, value: string | number) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        if (field === 'productId') {
          const p = products.find((p) => p.sku === value);
          return { ...item, productId: p?.sku || '', productName: p?.name || '', unitPrice: p?.costPrice || 0 };
        }
        return { ...item, [field]: value };
      })
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!toUserId) { setError('Select a borrower.'); return; }
    if (toUserId === fromUser.id) { setError('Cannot loan to yourself.'); return; }
    if (items.some((i) => !i.productId)) { setError('Select a product for each item.'); return; }

    const toUser = stockists.find((s) => s.id === toUserId);
    if (!toUser) { setError('Borrower not found.'); return; }

    setSaving(true);
    try {
      const now = Date.now();
      const returnDueDate = now + parseInt(returnDueDays) * 24 * 60 * 60 * 1000;
      const txItems: TransactionItem[] = items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.quantity * item.unitPrice,
      }));
      const subtotal = txItems.reduce((s, i) => s + i.total, 0);

      const created = await OrderService.create({
        transactionType: TransactionType.LOAN,
        status: TransactionStatus.PENDING,
        description: notes.trim() || undefined,
        fromUser: { userId: fromUser.id!, userName: fromUser.displayName },
        toUser: { userId: toUser.id!, userName: toUser.displayName },
        items: txItems,
        totals: { subtotal, grandTotal: subtotal },
        paymentDetails: { method: PaymentMethod.CREDIT, status: 'pending' as any, amount: subtotal },
        loanDetails: {
          loanId: `LOAN-${now}`,
          loanDate: now,
          returnDueDate,
          status: 'active',
        },
        createdBy: fromUser.id,
      });
      // Deduct from lender, add to borrower
      await InventorySyncService.onLoanCreated(fromUser.id!, toUser.id!, txItems, created.id);
      onDone();
    } catch (err: any) {
      setError(err?.message || 'Failed to create loan.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-xl p-6 space-y-4 my-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-100">Create Loan</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl">x</button>
        </div>

        {error && (
          <div className="msg-error px-3 py-2 rounded-lg text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Lend To</label>
              <select
                value={toUserId}
                onChange={(e) => setToUserId(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500 name-lowercase"
              >
                <option value="">Select borrower...</option>
                {stockists.filter((s) => s.id !== fromUser.id).map((s) => (
                  <option key={s.id} value={s.id}>{s.displayName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Return Due (days)</label>
              <input
                type="number"
                value={returnDueDays}
                onChange={(e) => setReturnDueDays(e.target.value)}
                min="1"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-300">Items</label>
              <button
                type="button"
                onClick={() => setItems((p) => [...p, { productId: '', productName: '', quantity: 1, unitPrice: 0 }])}
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
              >
                + Add
              </button>
            </div>
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-10 gap-2 items-center">
                <div className="col-span-6">
                  <select
                    value={item.productId}
                    onChange={(e) => updateItem(index, 'productId', e.target.value)}
                    className="w-full px-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Product...</option>
                    {products.map((p) => (
                      <option key={p.sku} value={p.sku}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-3">
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                    min="1"
                    placeholder="Qty"
                    className="w-full px-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="col-span-1">
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setItems((p) => p.filter((_, i) => i !== index))}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      x
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              {saving ? 'Creating...' : 'Create Loan'}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function LoansPage() {
  const { user, role } = useAuth();
  const toast = useToast();
  const [loans, setLoans] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (user?.id) loadLoans();
  }, [user?.id]);

  async function loadLoans() {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await OrderService.getByType(TransactionType.LOAN);
      const filtered = role === UserRole.ADMIN
        ? data
        : data.filter((t) => t.fromUser?.userId === user.id || t.toUser?.userId === user.id);
      setLoans(filtered);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleReturn(loan: Transaction) {
    const ok = await toast.confirm('Mark this loan as returned? Inventory will be moved back.');
    if (!ok) return;
    try {
      await OrderService.updateStatus(loan.id!, TransactionStatus.COMPLETED);
      if (loan.fromUser?.userId && loan.toUser?.userId) {
        await InventorySyncService.onLoanReturned(
          loan.fromUser.userId,
          loan.toUser.userId,
          loan.items,
          loan.id!
        );
      }
      toast.success('Loan marked as returned. Inventory restored.');
      await loadLoans();
    } catch (err) {
      console.error(err);
      toast.error('Failed to mark loan as returned.');
    }
  }

  const activeLoans = loans.filter((l) => l.status === TransactionStatus.PENDING);
  const now = Date.now();
  const overdueLoans = activeLoans.filter(
    (l) => l.loanDetails?.returnDueDate && l.loanDetails.returnDueDate < now
  );

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
      {showModal && user && (
        <CreateLoanModal
          fromUser={user}
          onClose={() => setShowModal(false)}
          onDone={() => { setShowModal(false); loadLoans(); }}
        />
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/warehouse" className="text-gray-500 hover:text-gray-800 text-sm">&larr; Warehouse</Link>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Inter-Warehouse Loans</h1>
            <p className="text-gray-500 mt-1">Manage inventory loans between stockists</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
          >
            New Loan
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Total Loans</p>
            <p className="text-2xl font-bold text-gray-100">{loans.length}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Active</p>
            <p className="text-2xl font-bold text-blue-400">{activeLoans.length}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Overdue</p>
            <p className="text-2xl font-bold text-red-400">{overdueLoans.length}</p>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <p className="text-gray-400">Loading loans...</p>
            </div>
          ) : loans.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 gap-3">
              <p className="text-gray-400">No loans found</p>
              <button onClick={() => setShowModal(true)} className="text-blue-400 hover:underline text-sm">
                Create your first loan
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-700 border-b border-gray-600">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-200">Date</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-200">Lender</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-200">Borrower</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-200">Due Date</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-200">Items</th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-gray-200">Status</th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-gray-200">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {loans.map((loan) => {
                  const isOverdue = loan.status === TransactionStatus.PENDING
                    && loan.loanDetails?.returnDueDate
                    && loan.loanDetails.returnDueDate < now;
                  return (
                    <tr key={loan.id} className="hover:bg-gray-700/50">
                      <td className="px-6 py-4 text-sm text-gray-400">
                        {loan.createdAt ? new Date(loan.createdAt).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-300">{loan.fromUser?.userName || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-300">{loan.toUser?.userName || '-'}</td>
                      <td className="px-6 py-4 text-sm">
                        {loan.loanDetails?.returnDueDate ? (
                          <span className={isOverdue ? 'text-red-400 font-medium' : 'text-gray-400'}>
                            {new Date(loan.loanDetails.returnDueDate).toLocaleDateString()}
                            {isOverdue && ' (Overdue)'}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-300 text-right">{loan.items.length}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[loan.status]}`}>
                          {loan.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {loan.status === TransactionStatus.PENDING && (
                          <button
                            onClick={() => handleReturn(loan)}
                            className="px-3 py-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded"
                          >
                            Mark Returned
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
