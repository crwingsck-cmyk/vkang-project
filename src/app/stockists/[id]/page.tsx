'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { InventoryService } from '@/services/database/inventory';
import { ProductService } from '@/services/database/products';
import { User, UserRole } from '@/types/models';
import Link from 'next/link';

type ComputedRow = {
  productId: string;
  productName: string;
  quantity: number;
  value: number;
};

export default function StockistDetailPage() {
  const params = useParams();
  const stockistId = (params?.id ?? '') as string;
  const { role } = useAuth();

  const [stockist, setStockist] = useState<User | null>(null);
  const [rows, setRows] = useState<ComputedRow[]>([]);
  const [runningTotal, setRunningTotal] = useState<{ qty: number; value: number }>({ qty: 0, value: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role !== UserRole.ADMIN || !stockistId) return;
    load();
  }, [role, stockistId]);

  async function load() {
    setLoading(true);
    try {
      const [u, products, invList] = await Promise.all([
        UserService.getById(stockistId),
        ProductService.getAll(undefined, 200),
        InventoryService.getByUser(stockistId, 200),
      ]);
      setStockist(u ?? null);

      const names: Record<string, string> = {};
      for (const p of products) {
        if (p.sku) names[p.sku] = p.name || p.sku;
      }

      const computed: ComputedRow[] = invList
        .filter((inv) => (inv.quantityOnHand ?? 0) > 0)
        .map((inv) => ({
          productId: inv.productId,
          productName: names[inv.productId] || inv.productId,
          quantity: inv.quantityOnHand,
          value: inv.marketValue ?? 0,
        }))
        .sort((a, b) => b.quantity - a.quantity);

      let runQty = 0;
      let runVal = 0;
      for (const inv of invList) {
        runQty += inv.quantityOnHand ?? 0;
        runVal += inv.marketValue ?? 0;
      }
      setRunningTotal({ qty: Math.max(0, runQty), value: Math.max(0, runVal) });
      setRows(computed);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (role !== UserRole.ADMIN) return null;

  const totalQty = runningTotal.qty;
  const totalValue = runningTotal.value;

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <Link href="/stockists" className="text-txt-subtle hover:text-txt-primary text-sm">
            ← Back to Stockists
          </Link>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3" />
            <p className="text-txt-subtle text-sm">Loading...</p>
          </div>
        ) : !stockist ? (
          <div className="glass-card p-12 text-center">
            <p className="text-txt-subtle text-sm">Stockist not found</p>
            <Link href="/stockists" className="mt-2 inline-block text-xs text-accent-text hover:underline">
              Back to Stockists
            </Link>
          </div>
        ) : (
          <>
            <div className="p-6 rounded-xl border border-border bg-gray-50/80 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-txt-primary name-lowercase">{stockist.displayName}</h1>
                  <p className="text-txt-subtle text-sm mt-0.5">{stockist.email}</p>
                  {stockist.company?.name && (
                    <p className="text-txt-subtle text-sm mt-0.5">{stockist.company.name}</p>
                  )}
                  {stockist.phoneNumber && (
                    <p className="text-txt-subtle text-sm mt-0.5">{stockist.phoneNumber}</p>
                  )}
                </div>
                <Link
                  href={`/users/${stockist.id}`}
                  className="px-3 py-1.5 bg-surface-2 hover:bg-surface-3 border border-border text-txt-secondary text-xs font-medium rounded-lg"
                >
                  Edit User
                </Link>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-chip-dark p-4">
                  <p className="text-xs text-gray-300">Inventory Value</p>
                  <p className="text-xl font-bold text-white tabular-nums mt-1">
                    RM {totalValue.toFixed(0)}
                  </p>
                </div>
                <div className="rounded-lg bg-chip-dark p-4">
                  <p className="text-xs text-gray-300">Total Stock</p>
                  <p className="text-xl font-bold text-white tabular-nums mt-1">
                    {totalQty}
                  </p>
                </div>
              </div>
            </div>

            <div className="glass-panel overflow-hidden">
              {rows.length === 0 ? (
                <div className="p-12 text-center text-txt-subtle text-sm">No inventory yet</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-base">
                      <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase">Product</th>
                      <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-txt-subtle uppercase">Qty</th>
                      <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-txt-subtle uppercase">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-muted">
                    {rows.map((r) => (
                      <tr key={r.productId} className="hover:bg-surface-2/50">
                        <td className="px-5 py-3 text-txt-primary">
                          <span className="font-medium">{r.productName}</span>
                          <span className="font-mono text-xs text-txt-subtle ml-1">({r.productId})</span>
                        </td>
                        <td className="px-5 py-3 text-txt-secondary text-right tabular-nums">{r.quantity}</td>
                        <td className="px-5 py-3 text-txt-secondary text-right tabular-nums">
                          RM {r.value.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
