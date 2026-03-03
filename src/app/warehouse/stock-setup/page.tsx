'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { InventoryService } from '@/services/database/inventory';
import { UserService } from '@/services/database/users';
import { ProductService } from '@/services/database/products';
import { useToast } from '@/context/ToastContext';
import { UserRole, InventoryStatus } from '@/types/models';
import Link from 'next/link';

// Fixed locations — edit these if the users or locations change
const LOC1_DISPLAY_NAME = 'Tan Sun Sun';
const LOC1_LOCATION = 'KL';
const LOC2_DISPLAY_NAME = 'Tan Ai Sun';
const LOC2_LOCATION = 'SETIA ALAM';

type StockRow = {
  productId: string;
  productName: string;
  qty1: string;
  cost1: string;
  qty2: string;
  cost2: string;
};

async function loadExistingInv(userId: string): Promise<Record<string, { qty: number; cost: number }>> {
  if (!userId) return {};
  const existing = await InventoryService.getByUser(userId, 300);
  const map: Record<string, { qty: number; cost: number }> = {};
  for (const inv of existing) {
    map[inv.productId] = { qty: inv.quantityOnHand, cost: inv.cost };
  }
  return map;
}

export default function StockSetupPage() {
  const { success: toastSuccess, error: toastError } = useToast();

  const [rows, setRows] = useState<StockRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId1, setUserId1] = useState('');
  const [userId2, setUserId2] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [allUsers, allProducts] = await Promise.all([
          UserService.getAll(500),
          ProductService.getAll(undefined, 200),
        ]);

        // Auto-find the two fixed users by display name (case-insensitive)
        const u1 = allUsers.find((u) => u.displayName?.toLowerCase().includes(LOC1_DISPLAY_NAME.toLowerCase()));
        const u2 = allUsers.find((u) => u.displayName?.toLowerCase().includes(LOC2_DISPLAY_NAME.toLowerCase()));
        const id1 = u1?.id ?? '';
        const id2 = u2?.id ?? '';
        setUserId1(id1);
        setUserId2(id2);

        // Load existing inventory for both users
        const [map1, map2] = await Promise.all([
          loadExistingInv(id1),
          loadExistingInv(id2),
        ]);

        setRows(
          allProducts.map((p) => ({
            productId: p.sku,
            productName: p.name,
            qty1: map1[p.sku] != null ? String(map1[p.sku].qty) : '',
            cost1: map1[p.sku] != null ? String(map1[p.sku].cost) : (p.costPrice != null ? String(p.costPrice) : ''),
            qty2: map2[p.sku] != null ? String(map2[p.sku].qty) : '',
            cost2: map2[p.sku] != null ? String(map2[p.sku].cost) : (p.costPrice != null ? String(p.costPrice) : ''),
          }))
        );
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function updateRow(productId: string, field: keyof StockRow, value: string) {
    setRows((prev) => prev.map((r) => (r.productId === productId ? { ...r, [field]: value } : r)));
  }

  async function saveUserInv(userId: string, qtyField: 'qty1' | 'qty2', costField: 'cost1' | 'cost2') {
    const now = Date.now();
    const toSave = rows.filter((r) => r[qtyField] !== '' && Number(r[qtyField]) >= 0);
    for (const r of toSave) {
      const qty = Math.max(0, Number(r[qtyField]) || 0);
      const cost = Math.max(0, Number(r[costField]) || 0);
      let status: InventoryStatus = InventoryStatus.IN_STOCK;
      if (qty === 0) status = InventoryStatus.OUT_OF_STOCK;
      else if (qty <= 10) status = InventoryStatus.LOW_STOCK;

      await InventoryService.create({
        userId,
        productId: r.productId,
        quantityOnHand: qty,
        quantityAllocated: 0,
        quantityAvailable: qty,
        quantityBorrowed: 0,
        quantityLent: 0,
        reorderLevel: 10,
        cost,
        marketValue: qty * cost,
        status,
        lastMovementDate: now,
        movements: [{ date: now, type: 'adjustment', quantity: qty, reference: 'OPENING STOCK' }],
      });
    }
    return toSave.length;
  }

  async function handleSave() {
    setSaving(true);
    try {
      let saved = 0;
      if (userId1) saved += await saveUserInv(userId1, 'qty1', 'cost1');
      if (userId2) saved += await saveUserInv(userId2, 'qty2', 'cost2');
      toastSuccess(`已儲存 ${saved} 筆庫存`);
    } catch (err) {
      console.error(err);
      toastError('儲存失敗，請再試一次');
    } finally {
      setSaving(false);
    }
  }

  const filled1 = rows.filter((r) => r.qty1 !== '' && Number(r.qty1) > 0).length;
  const filled2 = rows.filter((r) => r.qty2 !== '' && Number(r.qty2) > 0).length;

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/warehouse" className="text-txt-subtle hover:text-txt-primary text-sm">
            ← Warehouse
          </Link>
        </div>

        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-bold text-txt-primary tracking-tight">Opening Stock</h1>
            <p className="text-sm text-txt-subtle mt-0.5">手動設定各地點的現有庫存數量</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? '儲存中...' : '儲存庫存'}
          </button>
        </div>

        {/* Fixed location info cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-5 rounded-xl border border-indigo-200 bg-indigo-50/70 space-y-1.5">
            <p className="text-sm font-semibold text-gray-900 uppercase tracking-wide">地點 1</p>
            <p className="text-xl font-bold text-gray-900">{LOC1_LOCATION}</p>
            <p className="text-base text-gray-900">{LOC1_DISPLAY_NAME}</p>
            {filled1 > 0 && (
              <p className="text-sm text-gray-900 font-medium pt-1">{filled1} 項已填寫</p>
            )}
            {!userId1 && !loading && (
              <p className="text-sm text-red-500">⚠ 找不到此用戶</p>
            )}
          </div>
          <div className="p-5 rounded-xl border border-cyan-200 bg-cyan-50/70 space-y-1.5">
            <p className="text-sm font-semibold text-gray-900 uppercase tracking-wide">地點 2</p>
            <p className="text-xl font-bold text-gray-900">{LOC2_LOCATION}</p>
            <p className="text-base text-gray-900">{LOC2_DISPLAY_NAME}</p>
            {filled2 > 0 && (
              <p className="text-sm text-gray-900 font-medium pt-1">{filled2} 項已填寫</p>
            )}
            {!userId2 && !loading && (
              <p className="text-sm text-red-500">⚠ 找不到此用戶</p>
            )}
          </div>
        </div>

        {/* Product table */}
        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3" />
            <p className="text-txt-subtle text-sm">載入中...</p>
          </div>
        ) : (
          <div className="glass-panel overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-base">
                  <th className="px-4 py-2.5 text-left text-sm font-semibold text-txt-subtle uppercase" rowSpan={2}>產品</th>
                  <th className="px-4 py-2.5 text-left text-sm font-semibold text-txt-subtle uppercase" rowSpan={2}>SKU</th>
                  <th className="px-4 py-2 text-center text-sm font-semibold uppercase border-l border-border text-indigo-500" colSpan={2}>
                    {LOC1_LOCATION}
                    <span className="ml-1.5 font-normal normal-case opacity-70 text-xs">({LOC1_DISPLAY_NAME})</span>
                  </th>
                  <th className="px-4 py-2 text-center text-sm font-semibold uppercase border-l border-border text-cyan-500" colSpan={2}>
                    {LOC2_LOCATION}
                    <span className="ml-1.5 font-normal normal-case opacity-70 text-xs">({LOC2_DISPLAY_NAME})</span>
                  </th>
                </tr>
                <tr className="border-b border-border bg-surface-base">
                  <th className="px-4 py-2 text-right text-sm font-semibold text-txt-subtle uppercase border-l border-border w-28">數量</th>
                  <th className="px-4 py-2 text-right text-sm font-semibold text-txt-subtle uppercase w-28">成本(RM)</th>
                  <th className="px-4 py-2 text-right text-sm font-semibold text-txt-subtle uppercase border-l border-border w-28">數量</th>
                  <th className="px-4 py-2 text-right text-sm font-semibold text-txt-subtle uppercase w-28">成本(RM)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {rows.map((r) => {
                  const has1 = r.qty1 !== '' && Number(r.qty1) > 0;
                  const has2 = r.qty2 !== '' && Number(r.qty2) > 0;
                  return (
                    <tr key={r.productId} className={has1 || has2 ? 'bg-green-50/10' : 'hover:bg-surface-2/40'}>
                      <td className="px-4 py-2.5 text-txt-primary font-medium">{r.productName}</td>
                      <td className="px-4 py-2.5 text-txt-subtle font-mono text-xs">{r.productId}</td>
                      {/* Location 1 inputs */}
                      <td className="px-4 py-2.5 text-right border-l border-border/50">
                        <input
                          type="number"
                          min="0"
                          value={r.qty1}
                          onChange={(e) => updateRow(r.productId, 'qty1', e.target.value)}
                          placeholder="—"
                          disabled={!userId1}
                          className="w-24 text-right bg-surface-2 border border-border rounded-md px-2 py-1 text-sm text-txt-primary focus:outline-none focus:border-indigo-400 tabular-nums disabled:opacity-30 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={r.cost1}
                          onChange={(e) => updateRow(r.productId, 'cost1', e.target.value)}
                          placeholder="0.00"
                          disabled={!userId1}
                          className="w-24 text-right bg-surface-2 border border-border rounded-md px-2 py-1 text-sm text-txt-primary focus:outline-none focus:border-indigo-400 tabular-nums disabled:opacity-30 disabled:cursor-not-allowed"
                        />
                      </td>
                      {/* Location 2 inputs */}
                      <td className="px-4 py-2.5 text-right border-l border-border/50">
                        <input
                          type="number"
                          min="0"
                          value={r.qty2}
                          onChange={(e) => updateRow(r.productId, 'qty2', e.target.value)}
                          placeholder="—"
                          disabled={!userId2}
                          className="w-24 text-right bg-surface-2 border border-border rounded-md px-2 py-1 text-sm text-txt-primary focus:outline-none focus:border-cyan-400 tabular-nums disabled:opacity-30 disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={r.cost2}
                          onChange={(e) => updateRow(r.productId, 'cost2', e.target.value)}
                          placeholder="0.00"
                          disabled={!userId2}
                          className="w-24 text-right bg-surface-2 border border-border rounded-md px-2 py-1 text-sm text-txt-primary focus:outline-none focus:border-cyan-400 tabular-nums disabled:opacity-30 disabled:cursor-not-allowed"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}


      </div>
    </ProtectedRoute>
  );
}
