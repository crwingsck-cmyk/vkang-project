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

function ItemsEditor({
  items,
  products,
  onChange,
}: {
  items: { productId: string; productName: string; quantity: number; unitPrice: number }[];
  products: Product[];
  onChange: (items: { productId: string; productName: string; quantity: number; unitPrice: number }[]) => void;
}) {
  function updateItem(index: number, field: string, value: string | number) {
    onChange(
      items.map((item, i) => {
        if (i !== index) return item;
        if (field === 'productId') {
          const p = products.find((p) => p.sku === value);
          return { ...item, productId: p?.sku || '', productName: p?.name || '', unitPrice: p?.costPrice || 0 };
        }
        return { ...item, [field]: value };
      })
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="grid grid-cols-12 gap-2 items-center">
          <div className="col-span-6">
            <select
              value={item.productId}
              onChange={(e) => updateItem(index, 'productId', e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
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
              className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="col-span-2 text-xs text-gray-400 text-center">
            ×{item.unitPrice > 0 ? `RM${item.unitPrice}` : '-'}
          </div>
          <div className="col-span-1">
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
                className="text-red-400 hover:text-red-300 text-sm w-full text-center"
              >
                ×
              </button>
            )}
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { productId: '', productName: '', quantity: 1, unitPrice: 0 }])}
        className="text-xs text-blue-400 hover:text-blue-300"
      >
        + Add item
      </button>
    </div>
  );
}

function CreateSwapModal({
  currentUser,
  onClose,
  onDone,
}: {
  currentUser: User;
  onClose: () => void;
  onDone: () => void;
}) {
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [partyAId, setPartyAId] = useState(currentUser.id || '');
  const [partyBId, setPartyBId] = useState('');
  const [notes, setNotes] = useState('');
  const [aItems, setAItems] = useState([{ productId: '', productName: '', quantity: 1, unitPrice: 0 }]);
  const [bItems, setBItems] = useState([{ productId: '', productName: '', quantity: 1, unitPrice: 0 }]);

  useEffect(() => {
    UserService.getAll(500).then(setAllUsers).catch(console.error);
    ProductService.getAll().then(setProducts).catch(console.error);
  }, []);

  const partyA = allUsers.find((u) => u.id === partyAId);
  const partyB = allUsers.find((u) => u.id === partyBId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!partyAId) { setError('Select Party A.'); return; }
    if (!partyBId) { setError('Select Party B.'); return; }
    if (partyAId === partyBId) { setError('Party A and Party B must be different.'); return; }
    if (aItems.some((i) => !i.productId)) { setError('Select a product for each item (Party A).'); return; }
    if (bItems.some((i) => !i.productId)) { setError('Select a product for each item (Party B).'); return; }
    if (aItems.some((i) => i.quantity <= 0) || bItems.some((i) => i.quantity <= 0)) {
      setError('All quantities must be greater than 0.'); return;
    }
    if (!partyA || !partyB) { setError('User not found.'); return; }

    setSaving(true);
    try {
      const txAItems: TransactionItem[] = aItems.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.quantity * item.unitPrice,
      }));
      const txBItems: TransactionItem[] = bItems.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.quantity * item.unitPrice,
      }));
      const aTotal = txAItems.reduce((s, i) => s + i.total, 0);
      const bTotal = txBItems.reduce((s, i) => s + i.total, 0);

      const created = await OrderService.create({
        transactionType: TransactionType.SWAP,
        status: TransactionStatus.COMPLETED,
        description: notes.trim() || undefined,
        fromUser: { userId: partyA.id!, userName: partyA.displayName },
        toUser: { userId: partyB.id!, userName: partyB.displayName },
        items: txAItems,
        swapItems: txBItems,
        totals: { subtotal: aTotal, grandTotal: Math.max(aTotal, bTotal) },
        createdBy: currentUser.id,
      });

      await InventorySyncService.onSwapCompleted(
        partyA.id!,
        partyB.id!,
        txAItems,
        txBItems,
        created.id
      );
      onDone();
    } catch (err: any) {
      setError(err?.message || 'Failed to create swap.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-2xl p-7 space-y-5 my-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-100">New Product Swap</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-2xl">×</button>
        </div>

        {error && <div className="msg-error px-4 py-3 rounded-lg text-base">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Party selectors */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-base font-medium text-gray-300 mb-1.5">Party A</label>
              <select
                value={partyAId}
                onChange={(e) => setPartyAId(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-base focus:outline-none focus:border-blue-500"
              >
                <option value="">Select...</option>
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.displayName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-base font-medium text-gray-300 mb-1.5">Party B</label>
              <select
                value={partyBId}
                onChange={(e) => setPartyBId(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-base focus:outline-none focus:border-blue-500"
              >
                <option value="">Select...</option>
                {allUsers.filter((u) => u.id !== partyAId).map((u) => (
                  <option key={u.id} value={u.id}>{u.displayName}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Items */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-blue-400">
                {partyA?.displayName || 'Party A'} gives:
              </p>
              <ItemsEditor items={aItems} products={products} onChange={setAItems} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-purple-400">
                {partyB?.displayName || 'Party B'} gives:
              </p>
              <ItemsEditor items={bItems} products={products} onChange={setBItems} />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-base font-medium text-gray-300 mb-1.5">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-base placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg text-base font-medium"
            >
              {saving ? 'Processing...' : 'Confirm Swap'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-base font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SwapPage() {
  const { user, role } = useAuth();
  const toast = useToast();
  const [swaps, setSwaps] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (user?.id) loadSwaps();
  }, [user?.id]);

  async function loadSwaps() {
    setLoading(true);
    try {
      const data = await OrderService.getByType(TransactionType.SWAP);
      const filtered = role === UserRole.ADMIN
        ? data
        : data.filter((t) => t.fromUser?.userId === user!.id || t.toUser?.userId === user!.id);
      setSwaps(filtered);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(swap: Transaction) {
    const ok = await toast.confirm(`Delete this swap record? This only removes the record — inventory is NOT reversed.`);
    if (!ok) return;
    try {
      await OrderService.delete(swap.id!);
      toast.success('Record deleted.');
      await loadSwaps();
    } catch (err) {
      console.error(err);
      toast.error('Failed to delete record.');
    }
  }

  async function handleRevert(swap: Transaction) {
    const ok = await toast.confirm(`Revert this swap? Both parties' inventory will be restored.`);
    if (!ok) return;
    try {
      if (swap.fromUser?.userId && swap.toUser?.userId) {
        // Reverse: B's items back to B, A's items back to A
        await InventorySyncService.onSwapCompleted(
          swap.toUser.userId,
          swap.fromUser.userId,
          swap.swapItems ?? [],
          swap.items,
          `REVERT-${swap.id!}`
        );
      }
      await OrderService.updateStatus(swap.id!, TransactionStatus.CANCELLED);
      toast.success('Swap reverted. Inventory restored.');
      await loadSwaps();
    } catch (err) {
      console.error(err);
      toast.error('Failed to revert swap.');
    }
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
      {showModal && user && (
        <CreateSwapModal
          currentUser={user}
          onClose={() => setShowModal(false)}
          onDone={() => { setShowModal(false); loadSwaps(); }}
        />
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/warehouse" className="text-gray-500 hover:text-gray-800 text-sm">&larr; Warehouse</Link>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Product Swap</h1>
            <p className="text-gray-500 mt-1">Exchange products between two parties simultaneously.</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg"
          >
            + New Swap
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Total Swaps</p>
            <p className="text-2xl font-bold text-gray-100">{swaps.length}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Completed</p>
            <p className="text-2xl font-bold text-green-400">
              {swaps.filter((s) => s.status === TransactionStatus.COMPLETED).length}
            </p>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <p className="text-gray-400">Loading swaps...</p>
            </div>
          ) : swaps.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 gap-3">
              <p className="text-gray-400">No swaps found</p>
              <button onClick={() => setShowModal(true)} className="text-blue-400 hover:underline text-sm">
                Create your first swap
              </button>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-700 border-b border-gray-600">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-200">Date</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-200">Party A</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-200">Party A gives</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-200">Party B</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-200">Party B gives</th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-gray-200">Status</th>
                  {role === UserRole.ADMIN && (
                    <th className="px-6 py-3 text-center text-sm font-medium text-gray-200">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {swaps.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-700/50">
                    <td className="px-6 py-4 text-sm text-gray-400">
                      {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-300">{s.fromUser?.userName || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-300">
                      {s.items.map((i) => `${i.productName} ×${i.quantity}`).join(', ')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-300">{s.toUser?.userName || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-300">
                      {(s.swapItems ?? []).map((i) => `${i.productName} ×${i.quantity}`).join(', ')}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[s.status]}`}>
                        {s.status}
                      </span>
                    </td>
                    {role === UserRole.ADMIN && (
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {s.status === TransactionStatus.COMPLETED && (
                            <button
                              onClick={() => handleRevert(s)}
                              className="px-3 py-1 text-xs bg-orange-700 hover:bg-orange-600 text-white rounded"
                            >
                              Revert
                            </button>
                          )}
                          <button
                            onClick={() => handleDelete(s)}
                            className="px-3 py-1 text-xs bg-red-800 hover:bg-red-700 text-white rounded"
                          >
                            Del
                          </button>
                        </div>
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
