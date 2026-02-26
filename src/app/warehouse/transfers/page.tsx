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

function CreateTransferModal({
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
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ productId: '', productName: '', quantity: 1, unitPrice: 0 }]);

  useEffect(() => {
    UserService.getStockists().then(setStockists).catch(console.error);
    ProductService.getAll().then(setProducts).catch(console.error);
  }, []);

  function addItem() {
    setItems((prev) => [...prev, { productId: '', productName: '', quantity: 1, unitPrice: 0 }]);
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

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
    if (!toUserId) { setError('Select a destination stockist.'); return; }
    if (toUserId === fromUser.id) { setError('Cannot transfer to yourself.'); return; }
    if (items.some((i) => !i.productId)) { setError('Select a product for each item.'); return; }
    if (items.some((i) => i.quantity <= 0)) { setError('Quantity must be greater than 0.'); return; }

    const toUser = stockists.find((s) => s.id === toUserId);
    if (!toUser) { setError('Destination user not found.'); return; }

    setSaving(true);
    try {
      const txItems: TransactionItem[] = items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.quantity * item.unitPrice,
      }));
      const subtotal = txItems.reduce((s, i) => s + i.total, 0);

      await OrderService.create({
        transactionType: TransactionType.TRANSFER,
        status: TransactionStatus.PENDING,
        description: notes.trim() || undefined,
        fromUser: { userId: fromUser.id!, userName: fromUser.displayName },
        toUser: { userId: toUser.id!, userName: toUser.displayName },
        items: txItems,
        totals: { subtotal, grandTotal: subtotal },
        paymentDetails: { method: PaymentMethod.BANK, status: 'pending' as any, amount: subtotal },
        createdBy: fromUser.id,
      });
      onDone();
    } catch (err: any) {
      setError(err?.message || 'Failed to create transfer.');
    } finally {
      setSaving(false);
    }
  }

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-2xl p-6 space-y-4 my-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-100">Create Transfer</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl">x</button>
        </div>

        {error && (
          <div className="msg-error px-3 py-2 rounded-lg text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">To Stockist</label>
            <select
              value={toUserId}
              onChange={(e) => setToUserId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500 name-lowercase"
            >
              <option value="">Select destination...</option>
              {stockists.filter((s) => s.id !== fromUser.id).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName} {s.company?.name ? `(${s.company.name})` : ''}
                </option>
              ))}
            </select>
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
                onClick={addItem}
                className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded"
              >
                + Add Item
              </button>
            </div>

            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  <select
                    value={item.productId}
                    onChange={(e) => updateItem(index, 'productId', e.target.value)}
                    className="w-full px-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Select product...</option>
                    {products.map((p) => (
                      <option key={p.sku} value={p.sku}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                    min="1"
                    className="w-full px-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div className="col-span-3 text-sm text-gray-400 py-2">
                  Cost: {item.unitPrice} / ea
                </div>
                <div className="col-span-2">
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="w-full py-2 text-xs bg-red-900/30 hover:bg-red-900/60 text-red-400 rounded-lg"
                    >
                      x
                    </button>
                  )}
                </div>
              </div>
            ))}

            <div className="text-right text-sm text-gray-400">
              Total value: <span className="text-gray-100 font-medium">USD {subtotal.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
            >
              {saving ? 'Creating...' : 'Create Transfer'}
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

export default function TransfersPage() {
  const { user, role } = useAuth();
  const toast = useToast();
  const [transfers, setTransfers] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (user?.id) loadTransfers();
  }, [user?.id]);

  async function loadTransfers() {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await OrderService.getByType(TransactionType.TRANSFER);
      // Stockists only see their transfers
      const filtered = role === UserRole.ADMIN
        ? data
        : data.filter((t) => t.fromUser?.userId === user.id || t.toUser?.userId === user.id);
      setTransfers(filtered);
    } catch (err) {
      console.error('Error loading transfers:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(transfer: Transaction) {
    const ok = await toast.confirm('Approve this transfer? Inventory will be moved.');
    if (!ok) return;
    try {
      await OrderService.updateStatus(transfer.id!, TransactionStatus.COMPLETED);
      if (transfer.fromUser?.userId && transfer.toUser?.userId) {
        await InventorySyncService.onTransferCompleted(
          transfer.fromUser.userId,
          transfer.toUser.userId,
          transfer.items,
          transfer.id!
        );
      }
      toast.success('Transfer approved. Inventory updated.');
      await loadTransfers();
    } catch (err) {
      console.error(err);
      toast.error('Failed to approve transfer.');
    }
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
      {showModal && user && (
        <CreateTransferModal
          fromUser={user}
          onClose={() => setShowModal(false)}
          onDone={() => { setShowModal(false); loadTransfers(); }}
        />
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/warehouse" className="text-gray-500 hover:text-gray-800 text-sm">&larr; Warehouse</Link>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Warehouse Transfers</h1>
            <p className="text-gray-500 mt-1">Transfer inventory between stockists</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
          >
            New Transfer
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Total Transfers</p>
            <p className="text-2xl font-bold text-gray-100">{transfers.length}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Pending</p>
            <p className="text-2xl font-bold text-yellow-400">
              {transfers.filter((t) => t.status === TransactionStatus.PENDING).length}
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Completed</p>
            <p className="text-2xl font-bold text-green-400">
              {transfers.filter((t) => t.status === TransactionStatus.COMPLETED).length}
            </p>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <p className="text-gray-400">Loading transfers...</p>
            </div>
          ) : transfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 gap-3">
              <p className="text-gray-400">No transfers found</p>
              <button onClick={() => setShowModal(true)} className="text-blue-400 hover:underline text-sm">
                Create your first transfer
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-700 border-b border-gray-600">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-200">Date</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-200">From</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-200">To</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-200">Items</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-200">Value</th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-gray-200">Status</th>
                  {role === UserRole.ADMIN && (
                    <th className="px-6 py-3 text-center text-sm font-medium text-gray-200">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {transfers.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-700/50">
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-300">{t.fromUser?.userName || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-300">{t.toUser?.userName || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-300 text-right">{t.items.length}</td>
                    <td className="px-6 py-4 text-sm text-gray-300 text-right">
                      USD {t.totals.grandTotal.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[t.status]}`}>
                        {t.status}
                      </span>
                    </td>
                    {role === UserRole.ADMIN && (
                      <td className="px-6 py-4 text-center">
                        {t.status === TransactionStatus.PENDING && (
                          <button
                            onClick={() => handleApprove(t)}
                            className="px-3 py-1 text-xs bg-green-700 hover:bg-green-600 text-white rounded"
                          >
                            Approve
                          </button>
                        )}
                      </td>
                    )}
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
