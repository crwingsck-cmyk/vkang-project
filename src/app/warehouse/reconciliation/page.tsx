'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { InventoryService } from '@/services/database/inventory';
import { UserService } from '@/services/database/users';
import { Inventory, InventoryStatus, User, UserRole } from '@/types/models';
import Link from 'next/link';

const statusColors: Record<InventoryStatus, string> = {
  [InventoryStatus.IN_STOCK]: 'bg-green-900/30 text-green-300',
  [InventoryStatus.LOW_STOCK]: 'bg-yellow-900/30 text-yellow-300',
  [InventoryStatus.OUT_OF_STOCK]: 'bg-red-900/30 text-red-300',
};

export default function ReconciliationPage() {
  useAuth();
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [stockists, setStockists] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStockist, setFilterStockist] = useState('');
  const [filterStatus, setFilterStatus] = useState<InventoryStatus | ''>('');
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustForm, setAdjustForm] = useState({ physicalCount: '', reference: '' });
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [inv, stock] = await Promise.all([
        InventoryService.getAll(),
        UserService.getStockists(),
      ]);
      setInventory(inv);
      setStockists(stock);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function startAdjust(item: Inventory) {
    setAdjustingId(item.id!);
    setAdjustForm({ physicalCount: item.quantityOnHand.toString(), reference: '' });
    setSuccessMsg('');
    setError('');
  }

  function cancelAdjust() {
    setAdjustingId(null);
  }

  async function handleReconcile(item: Inventory) {
    const physicalCount = parseInt(adjustForm.physicalCount);
    if (isNaN(physicalCount) || physicalCount < 0) {
      setError('Enter a valid physical count.');
      return;
    }
    const diff = physicalCount - item.quantityOnHand;
    if (diff === 0) {
      setSuccessMsg('No difference — inventory is already reconciled.');
      setAdjustingId(null);
      return;
    }
    if (!adjustForm.reference.trim()) {
      setError('Enter a reconciliation reference.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await InventoryService.adjust(
        item.id!,
        diff,
        `RECON: ${adjustForm.reference.trim()}`,
        item
      );
      setSuccessMsg(`Reconciled: adjusted by ${diff > 0 ? '+' : ''}${diff} units.`);
      setAdjustingId(null);
      await loadData();
    } catch (err: any) {
      setError(err?.message || 'Failed to reconcile.');
    } finally {
      setSaving(false);
    }
  }

  const filtered = inventory.filter((item) => {
    if (filterStockist && item.userId !== filterStockist) return false;
    if (filterStatus && item.status !== filterStatus) return false;
    return true;
  });

  const discrepancies = filtered.filter(
    (item) => item.status === InventoryStatus.OUT_OF_STOCK || item.status === InventoryStatus.LOW_STOCK
  );

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/warehouse" className="text-gray-400 hover:text-gray-200 text-sm">&larr; Warehouse</Link>
            </div>
            <h1 className="text-3xl font-bold text-gray-100">Stock Reconciliation</h1>
            <p className="text-gray-400 mt-1">Verify and correct inventory counts across all warehouses</p>
          </div>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm"
          >
            Refresh
          </button>
        </div>

        {successMsg && (
          <div className="bg-green-900/30 border border-green-700 text-green-300 px-4 py-3 rounded-lg text-sm">
            {successMsg}
          </div>
        )}
        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Total Items</p>
            <p className="text-2xl font-bold text-gray-100">{inventory.length}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">In Stock</p>
            <p className="text-2xl font-bold text-green-400">
              {inventory.filter((i) => i.status === InventoryStatus.IN_STOCK).length}
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Low Stock</p>
            <p className="text-2xl font-bold text-yellow-400">
              {inventory.filter((i) => i.status === InventoryStatus.LOW_STOCK).length}
            </p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">Out of Stock</p>
            <p className="text-2xl font-bold text-red-400">
              {inventory.filter((i) => i.status === InventoryStatus.OUT_OF_STOCK).length}
            </p>
          </div>
        </div>

        {/* Alert for items needing attention */}
        {discrepancies.length > 0 && (
          <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-4">
            <p className="text-yellow-300 font-medium text-sm">
              {discrepancies.length} item{discrepancies.length > 1 ? 's' : ''} need attention (low or out of stock).
            </p>
          </div>
        )}

        {/* Filters */}
        <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Filter by Stockist</label>
              <select
                value={filterStockist}
                onChange={(e) => setFilterStockist(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">All Stockists</option>
                {stockists.map((s) => (
                  <option key={s.id} value={s.id}>{s.displayName} {s.company?.name ? `(${s.company.name})` : ''}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Filter by Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as InventoryStatus | '')}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="">All Statuses</option>
                <option value={InventoryStatus.IN_STOCK}>In Stock</option>
                <option value={InventoryStatus.LOW_STOCK}>Low Stock</option>
                <option value={InventoryStatus.OUT_OF_STOCK}>Out of Stock</option>
              </select>
            </div>
          </div>
        </div>

        {/* Inventory Table */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <p className="text-gray-400">Loading inventory...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center p-12">
              <p className="text-gray-400">No inventory records found.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-700 border-b border-gray-600">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-200">Product</th>
                  <th className="px-6 py-3 text-left text-sm font-medium text-gray-200">Stockist</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-200">On Hand</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-200">Available</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-200">Allocated</th>
                  <th className="px-6 py-3 text-right text-sm font-medium text-gray-200">Reorder At</th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-gray-200">Status</th>
                  <th className="px-6 py-3 text-center text-sm font-medium text-gray-200">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {filtered.map((item) => {
                  const stockist = stockists.find((s) => s.id === item.userId);
                  return (
                    <tr key={item.id} className={`hover:bg-gray-700/50 ${item.status !== InventoryStatus.IN_STOCK ? 'bg-gray-750' : ''}`}>
                      {adjustingId === item.id ? (
                        <>
                          <td className="px-6 py-3 text-sm text-gray-100 font-medium">{item.productId}</td>
                          <td className="px-6 py-3 text-sm text-gray-300">{stockist?.displayName || item.userId}</td>
                          <td className="px-3 py-3" colSpan={2}>
                            <div className="space-y-2">
                              <div>
                                <label className="text-xs text-gray-400 mb-1 block">Physical Count</label>
                                <input
                                  type="number"
                                  value={adjustForm.physicalCount}
                                  onChange={(e) => setAdjustForm((p) => ({ ...p, physicalCount: e.target.value }))}
                                  min="0"
                                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm text-right focus:outline-none focus:border-blue-500"
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3" colSpan={2}>
                            <div className="space-y-2">
                              <div>
                                <label className="text-xs text-gray-400 mb-1 block">Reference</label>
                                <input
                                  type="text"
                                  value={adjustForm.reference}
                                  onChange={(e) => setAdjustForm((p) => ({ ...p, reference: e.target.value }))}
                                  placeholder="e.g. Monthly count Jan 2026"
                                  className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                                />
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-center text-xs text-gray-400">
                            {parseInt(adjustForm.physicalCount || '0') !== item.quantityOnHand && (
                              <span className={parseInt(adjustForm.physicalCount || '0') > item.quantityOnHand ? 'text-green-400' : 'text-red-400'}>
                                Diff: {parseInt(adjustForm.physicalCount || '0') - item.quantityOnHand > 0 ? '+' : ''}
                                {parseInt(adjustForm.physicalCount || '0') - item.quantityOnHand}
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleReconcile(item)}
                                disabled={saving}
                                className="px-3 py-1 text-xs bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded"
                              >
                                {saving ? '...' : 'Apply'}
                              </button>
                              <button
                                onClick={cancelAdjust}
                                className="px-3 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-gray-200 rounded"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-6 py-4 text-sm">
                            <div>
                              <p className="text-gray-100 font-medium">{item.productId}</p>
                              <p className="text-gray-500 text-xs">{item.productId}</p>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-300">
                            {stockist?.displayName || item.userId}
                            {stockist?.company?.name && (
                              <span className="text-gray-500 text-xs ml-1">({stockist.company.name})</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-100 text-right font-medium">{item.quantityOnHand}</td>
                          <td className="px-6 py-4 text-sm text-gray-300 text-right">{item.quantityAvailable}</td>
                          <td className="px-6 py-4 text-sm text-gray-400 text-right">{item.quantityAllocated}</td>
                          <td className="px-6 py-4 text-sm text-gray-400 text-right">{item.reorderLevel}</td>
                          <td className="px-6 py-4 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[item.status]}`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              onClick={() => startAdjust(item)}
                              className="px-3 py-1 text-xs bg-orange-700 hover:bg-orange-600 text-white rounded"
                            >
                              Reconcile
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Last Updated */}
        <p className="text-gray-500 text-xs text-right">
          Data as of {new Date().toLocaleString()}
        </p>
      </div>
    </ProtectedRoute>
  );
}
