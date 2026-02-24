'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { InventoryService } from '@/services/database/inventory';
import { UserService } from '@/services/database/users';
import { Inventory, UserRole, InventoryStatus, CostingMethod, User } from '@/types/models';
import Link from 'next/link';

function EditModal({
  item,
  onClose,
  onDone,
}: {
  item: Inventory;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reorderLevel, setReorderLevel] = useState(item.reorderLevel.toString());
  const [costingMethod, setCostingMethod] = useState<CostingMethod>(item.costingMethod ?? CostingMethod.WEIGHTED_AVG);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const level = parseInt(reorderLevel);
    if (isNaN(level) || level < 0) {
      setError('請輸入有效的補貨點數量');
      return;
    }
    if (!item.id) return;
    setSaving(true);
    try {
      await InventoryService.update(item.id, { reorderLevel: level, costingMethod });
      onDone();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '儲存失敗');
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
        className="bg-surface-1 rounded-2xl border border-border-strong w-full max-w-md p-6 space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-txt-primary">修改庫存設定</h2>
            <p className="text-xs text-txt-subtle mt-0.5">產品: <span className="text-txt-secondary font-medium">{item.productId}</span></p>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-txt-subtle hover:text-txt-primary hover:bg-surface-2 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        {error && <div className="msg-error px-3 py-2 text-xs">{error}</div>}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-txt-secondary mb-1.5">補貨點 (Reorder Level)</label>
            <input
              type="number"
              min="0"
              value={reorderLevel}
              onChange={(e) => setReorderLevel(e.target.value)}
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-txt-primary text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-txt-secondary mb-1.5">成本計算方式</label>
            <select
              value={costingMethod}
              onChange={(e) => setCostingMethod(e.target.value as CostingMethod)}
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-txt-primary text-sm focus:outline-none focus:border-accent"
            >
              <option value={CostingMethod.WEIGHTED_AVG}>加權平均</option>
              <option value={CostingMethod.FIFO}>FIFO（先進先出）</option>
            </select>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="submit" disabled={saving} className="px-5 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors">
              {saving ? '儲存中...' : '儲存'}
            </button>
            <button type="button" onClick={onClose} className="px-5 py-2 bg-surface-2 hover:bg-surface-3 border border-border text-txt-secondary rounded-lg text-xs font-medium transition-colors">
              取消
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AdjustModal({
  item,
  onClose,
  onDone,
}: {
  item: Inventory;
  onClose: () => void;
  onDone: () => void;
}) {
  const [quantityChange, setQuantityChange] = useState('');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const change = parseInt(quantityChange);
    if (isNaN(change) || change === 0) { setError('Enter a non-zero quantity change.'); return; }
    if (!reference.trim()) { setError('Reference is required.'); return; }
    if (!item.id) { setError('Inventory item ID missing.'); return; }

    const newOnHand = item.quantityOnHand + change;
    if (newOnHand < 0) { setError('Adjustment would result in negative stock.'); return; }

    setSaving(true);
    try {
      await InventoryService.adjust(item.id, change, reference.trim(), item);
      onDone();
    } catch (err: any) {
      setError(err?.message || 'Failed to adjust inventory.');
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
        className="bg-surface-1 rounded-2xl border border-border-strong w-full max-w-md p-6 space-y-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold text-txt-primary">Adjust Inventory</h2>
            <p className="text-xs text-txt-subtle mt-0.5">Product: <span className="text-txt-secondary font-medium">{item.productId}</span></p>
            <p className="text-xs text-txt-subtle">Current stock: <span className="text-txt-secondary font-medium tabular-nums">{item.quantityOnHand}</span></p>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-txt-subtle hover:text-txt-primary hover:bg-surface-2 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {error && (
          <div className="msg-error px-3 py-2 text-xs">{error}</div>
        )}

        <form onSubmit={handleAdjust} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-txt-secondary mb-1.5">
              Quantity Change <span className="text-txt-subtle font-normal">(negative to reduce)</span>
            </label>
            <input
              type="number"
              value={quantityChange}
              onChange={(e) => setQuantityChange(e.target.value)}
              placeholder="e.g. +50 or -10"
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-txt-primary text-sm placeholder-txt-subtle focus:outline-none focus:border-accent"
            />
            {quantityChange && !isNaN(parseInt(quantityChange)) && (
              <p className="text-xs text-txt-subtle mt-1">
                New stock: <span className="text-txt-secondary font-medium tabular-nums">{item.quantityOnHand + parseInt(quantityChange)}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-txt-secondary mb-1.5">
              Reference <span className="text-error">*</span>
            </label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. ADJ-2026-001, Stock count"
              className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-txt-primary text-sm placeholder-txt-subtle focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors"
            >
              {saving ? 'Saving...' : 'Apply Adjustment'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-surface-2 hover:bg-surface-3 border border-border text-txt-secondary rounded-lg text-xs font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function InventoryPage() {
  const { user, role, firebaseUser } = useAuth();
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [stockists, setStockists] = useState<User[]>([]);
  const [userMap, setUserMap] = useState<Record<string, User>>({});
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<InventoryStatus | 'has_stock' | ''>('has_stock');
  const [filterStockist, setFilterStockist] = useState('');
  const [adjustItem, setAdjustItem] = useState<Inventory | null>(null);
  const [editItem, setEditItem] = useState<Inventory | null>(null);

  useEffect(() => {
    loadInventory();
  }, [filterStatus, filterStockist, user?.id]);

  useEffect(() => {
    if (role === UserRole.ADMIN) {
      Promise.all([UserService.getStockists(), UserService.getAdmins()]).then(([stockistList, adminList]) => {
        setStockists(stockistList);
        const m: Record<string, User> = {};
        [...adminList, ...stockistList].forEach((u) => { if (u.id) m[u.id] = u; });
        setUserMap(m);
      }).catch(console.error);
    }
  }, [role]);

  async function loadInventory() {
    if (!user?.id) return;
    try {
      setLoading(true);
      const data = role === UserRole.ADMIN && filterStockist
        ? await InventoryService.getByUser(filterStockist)
        : role === UserRole.ADMIN
          ? await InventoryService.getAll()
          : await InventoryService.getByUser(user?.id ?? firebaseUser?.uid ?? '');

      const filtered = !filterStatus
        ? data
        : filterStatus === 'has_stock'
          ? data.filter((item) => item.status !== InventoryStatus.OUT_OF_STOCK)
          : data.filter((item) => item.status === filterStatus);

      setInventory(filtered);
    } catch (error) {
      console.error('Error loading inventory:', error);
    } finally {
      setLoading(false);
    }
  }

  const statusBadge: Record<InventoryStatus, string> = {
    [InventoryStatus.IN_STOCK]:     'bg-chip-cyan text-gray-800 border border-cyan-200',
    [InventoryStatus.LOW_STOCK]:    'bg-chip-yellow text-gray-800 border border-amber-200',
    [InventoryStatus.OUT_OF_STOCK]: 'bg-chip-dark text-white border border-chip-dark',
  };

  const invItemValue = (i: Inventory) => (i.quantityOnHand === 0 ? 0 : (i.marketValue ?? i.cost * i.quantityOnHand));
  const totalValue    = inventory.reduce((sum, item) => sum + invItemValue(item), 0);
  const inStockCount  = inventory.filter((item) => item.status === InventoryStatus.IN_STOCK).length;
  const lowStockCount = inventory.filter((item) => item.status === InventoryStatus.LOW_STOCK).length;
  const outCount      = inventory.filter((item) => item.status === InventoryStatus.OUT_OF_STOCK).length;

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
      {adjustItem && (
        <AdjustModal
          item={adjustItem}
          onClose={() => setAdjustItem(null)}
          onDone={() => {
            setAdjustItem(null);
            loadInventory();
          }}
        />
      )}
      {editItem && (
        <EditModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onDone={() => {
            setEditItem(null);
            loadInventory();
          }}
        />
      )}

      <div className="space-y-5">

        {/* Page Header */}
        <div>
          <h1 className="text-xl font-bold text-txt-primary tracking-tight">Inventory</h1>
          <p className="text-sm text-txt-subtle mt-0.5">Track and manage your stock levels</p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl border shadow-sm bg-blue-50 border-blue-200">
            <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1.5">Total Value</p>
            <p className="text-2xl font-bold tabular-nums text-txt-primary">USD {totalValue.toFixed(0)}</p>
          </div>
          <div className="p-4 rounded-xl border shadow-sm bg-green-50 border-green-200">
            <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1.5">In Stock</p>
            <p className="text-2xl font-bold tabular-nums text-success">{inStockCount}</p>
          </div>
          <div className="p-4 rounded-xl border shadow-sm bg-amber-50 border-amber-200">
            <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1.5">Low Stock</p>
            <p className="text-2xl font-bold tabular-nums text-warning">{lowStockCount}</p>
          </div>
          <div className="p-4 rounded-xl border shadow-sm bg-red-50 border-red-200">
            <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1.5">Out of Stock</p>
            <p className="text-2xl font-bold tabular-nums text-error">{outCount}</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 glass-panel px-4 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            {role === UserRole.ADMIN && (
              <select
                value={filterStockist}
                onChange={(e) => setFilterStockist(e.target.value)}
                className="px-3 py-1.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-xs focus:outline-none focus:border-accent name-lowercase"
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
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as InventoryStatus | 'has_stock' | '')}
              className="px-3 py-1.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-xs focus:outline-none focus:border-accent"
            >
              <option value="has_stock">有庫存</option>
              <option value="">全部</option>
              <option value={InventoryStatus.IN_STOCK}>In Stock</option>
              <option value={InventoryStatus.LOW_STOCK}>Low Stock</option>
              <option value={InventoryStatus.OUT_OF_STOCK}>Out of Stock</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            {role === UserRole.ADMIN && (
              <Link
                href="/warehouse/transfers"
                className="px-3 py-1.5 bg-surface-2 hover:bg-surface-3 border border-border text-txt-secondary text-xs font-medium rounded-lg transition-colors"
              >
                Transfers
              </Link>
            )}
            <Link
              href="/warehouse"
              className="px-3 py-1.5 bg-surface-2 hover:bg-surface-3 border border-border text-txt-secondary text-xs font-medium rounded-lg transition-colors"
            >
              Warehouse
            </Link>
          </div>
        </div>

        {/* Table */}
        <div className="glass-panel overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center p-10">
              <p className="text-txt-subtle text-sm">Loading inventory...</p>
            </div>
          ) : inventory.length === 0 ? (
            <div className="flex items-center justify-center p-10">
              <p className="text-txt-subtle text-sm">No inventory items found</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-surface-2 border-b border-border">
                <tr>
                  {role === UserRole.ADMIN && !filterStockist && (
                    <th className="px-5 py-3 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">經銷商</th>
                  )}
                  <th className="px-5 py-3 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest min-w-[5.5rem]">Product</th>
                  <th className="px-5 py-3 text-right text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">On Hand</th>
                  <th className="px-5 py-3 text-right text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Available</th>
                  <th className="px-5 py-3 text-right text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Reorder Lvl</th>
                  <th className="px-5 py-3 text-center text-[10px] font-semibold text-txt-subtle uppercase tracking-widest min-w-[5.5rem]">Status</th>
                  <th className="px-5 py-3 text-right text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Value</th>
                  <th className="cost-method-cell px-5 py-3 text-center text-[10px] font-semibold text-txt-subtle uppercase tracking-widest min-w-[4rem]">
                    <span className="block whitespace-nowrap">成本</span>
                    <span className="block whitespace-nowrap">方式</span>
                  </th>
                  <th className="px-5 py-3 text-center text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {inventory.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-2/50 transition-colors">
                    {role === UserRole.ADMIN && !filterStockist && (
                      <td className="px-5 py-3.5 text-xs text-txt-subtle">
                        <Link
                          href={`/stockists/${item.userId}`}
                          className="text-accent-text hover:underline name-lowercase"
                        >
                          {userMap[item.userId]?.displayName || item.userId}
                        </Link>
                      </td>
                    )}
                    <td className="px-5 py-3.5 text-xs text-txt-primary font-medium font-mono whitespace-nowrap">
                      {item.productId}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-txt-secondary text-right tabular-nums">
                      {item.quantityOnHand}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-txt-secondary text-right tabular-nums">
                      {item.quantityAvailable}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-txt-subtle text-right tabular-nums">
                      {item.reorderLevel}
                    </td>
                    <td className="px-5 py-3.5 text-center whitespace-nowrap">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 ${statusBadge[item.status]}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-txt-secondary text-right tabular-nums">
                      USD {invItemValue(item).toFixed(2)}
                    </td>
                    <td className="cost-method-cell px-5 py-3.5 text-center text-xs text-txt-subtle min-w-[4rem]">
                      {item.costingMethod === CostingMethod.FIFO ? (
                        'FIFO'
                      ) : (
                        <span className="inline-block text-center">
                          <span className="block whitespace-nowrap">加權</span>
                          <span className="block whitespace-nowrap">平均</span>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setEditItem(item)}
                          className="px-3 py-1 text-xs bg-blue-400 hover:bg-blue-500 text-white border border-blue-500 rounded-lg transition-colors"
                        >
                          修改
                        </button>
                        <button
                          onClick={() => setAdjustItem(item)}
                          className="px-3 py-1 text-xs bg-surface-2 hover:bg-surface-3 border border-border text-txt-secondary rounded-lg transition-colors"
                        >
                          Adjust
                        </button>
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
