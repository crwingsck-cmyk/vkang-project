'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { InventoryService } from '@/services/database/inventory';
import { ProductService } from '@/services/database/products';
import { Inventory, InventoryStatus, Product, UserRole } from '@/types/models';
import Link from 'next/link';

type EntryItem = { productId: string; productName: string; quantity: number; unitCost: number; currentQty: number };

export default function InventoryEntryPage() {
  const { user, role } = useAuth();
  const [products, setProducts] = useState<(Product & { id: string })[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [entries, setEntries] = useState<EntryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const userId = user?.id ?? '';

  useEffect(() => {
    if (userId && role === UserRole.ADMIN) loadData();
  }, [userId, role]);

  async function loadData() {
    if (!userId) return;
    setLoading(true);
    setError('');
    try {
      const [prods, inv] = await Promise.all([
        ProductService.getAll(undefined, 200),
        InventoryService.getByUser(userId, 200),
      ]);
      setProducts(prods);
      setInventory(inv);
      const invByProduct: Record<string, Inventory> = {};
      for (const i of inv) invByProduct[i.productId] = i;
      setEntries(
        prods.map((p) => ({
          productId: p.sku,
          productName: p.name,
          quantity: invByProduct[p.sku]?.quantityOnHand ?? 0,
          unitCost: invByProduct[p.sku]?.cost ?? p.costPrice ?? 0,
          currentQty: invByProduct[p.sku]?.quantityOnHand ?? 0,
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }

  function updateEntry(index: number, field: 'quantity' | 'unitCost', value: number) {
    setEntries((prev) =>
      prev.map((e, i) => (i === index ? { ...e, [field]: value } : e))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setError('');
    setSuccessMsg('');
    const toSave = entries.filter((e) => e.quantity >= 0);
    if (toSave.length === 0) {
      setError('請至少填寫一筆產品數量');
      return;
    }

    setSaving(true);
    try {
      const now = Date.now();
      const reference = `MANUAL-ENTRY:${now}`;
      const invByProduct: Record<string, Inventory> = {};
      for (const i of inventory) invByProduct[i.productId] = i;

      for (const entry of toSave) {
        const existing = invByProduct[entry.productId];
        const targetQty = Math.floor(entry.quantity) || 0;
        const unitCost = entry.unitCost >= 0 ? entry.unitCost : 0;

        if (existing?.id) {
          const diff = targetQty - existing.quantityOnHand;
          if (diff !== 0) {
            await InventoryService.adjust(
              existing.id!,
              diff,
              reference,
              existing
            );
          }
        } else if (targetQty > 0) {
          await InventoryService.create({
            userId,
            productId: entry.productId,
            quantityOnHand: targetQty,
            quantityAllocated: 0,
            quantityAvailable: targetQty,
            quantityBorrowed: 0,
            quantityLent: 0,
            reorderLevel: 10,
            cost: unitCost,
            marketValue: targetQty * unitCost,
            status: InventoryStatus.IN_STOCK,
            costingMethod: 'fifo',
            lastMovementDate: now,
            movements: [
              { date: now, type: 'in', quantity: targetQty, reference },
            ],
          });
        }
      }

      setSuccessMsg('庫存已更新');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  if (role !== UserRole.ADMIN) return null;

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/warehouse" className="text-gray-400 hover:text-gray-200 text-sm">
              &larr; 返回倉庫
            </Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-100">手動填寫庫存</h1>
          <p className="text-gray-400 mt-1">
            總經銷商可在此填寫各產品的庫存數量與單位成本
          </p>
        </div>

        {successMsg && (
          <div className="bg-green-900/30 border border-green-700 text-green-300 px-4 py-3 rounded-lg text-sm">
            {successMsg}
          </div>
        )}
        {error && (
          <div className="msg-error px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        {loading ? (
          <div className="py-12 text-center text-gray-400">載入中...</div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-600 bg-gray-800">
                    <th className="px-4 py-3 text-left text-xs text-gray-400 font-medium">產品</th>
                    <th className="px-4 py-3 text-right text-xs text-gray-400 font-medium">目前庫存</th>
                    <th className="px-4 py-3 text-right text-xs text-gray-400 font-medium">數量</th>
                    <th className="px-4 py-3 text-right text-xs text-gray-400 font-medium">單位成本</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {entries.map((e, i) => (
                    <tr key={e.productId} className="hover:bg-gray-700/30">
                      <td className="px-4 py-2 text-gray-200">
                        {e.productName} <span className="text-gray-500 text-xs">({e.productId})</span>
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-gray-400">
                        {e.currentQty}
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min="0"
                          value={e.quantity === 0 ? '' : e.quantity}
                          onChange={(ev) =>
                            updateEntry(i, 'quantity', parseInt(ev.target.value) || 0)
                          }
                          placeholder="0"
                          className="w-24 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-right"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={e.unitCost === 0 ? '' : e.unitCost}
                          onChange={(ev) =>
                            updateEntry(i, 'unitCost', parseFloat(ev.target.value) || 0)
                          }
                          placeholder="0"
                          className="w-24 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-right"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 border-t border-gray-600 bg-gray-800 flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg"
              >
                {saving ? '儲存中...' : '儲存庫存'}
              </button>
              <button
                type="button"
                onClick={loadData}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg"
              >
                重新載入
              </button>
            </div>
          </form>
        )}
      </div>
    </ProtectedRoute>
  );
}
