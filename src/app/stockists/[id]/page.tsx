'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { OrderService } from '@/services/database/orders';
import { ProductService } from '@/services/database/products';
import { User, UserRole, TransactionType, TransactionStatus } from '@/types/models';
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
      const [u, products, txns] = await Promise.all([
        UserService.getById(stockistId),
        ProductService.getAll(undefined, 200),
        OrderService.getByUserRelated(stockistId, 300),
      ]);
      setStockist(u ?? null);

      const names: Record<string, string> = {};
      const costs: Record<string, number> = {};
      for (const p of products) {
        if (p.sku) { names[p.sku] = p.name || p.sku; costs[p.sku] = p.costPrice ?? 0; }
      }

      // Compute per-product from transactions
      const perProduct: Record<string, { quantity: number; value: number }> = {};

      const add = (productId: string, qty: number, unitPrice: number, dir: 'in' | 'out') => {
        if (!perProduct[productId]) perProduct[productId] = { quantity: 0, value: 0 };
        const sign = dir === 'in' ? 1 : -1;
        perProduct[productId].quantity += sign * qty;
        perProduct[productId].value += sign * qty * unitPrice;
      };

      for (const txn of txns) {
        if (txn.status === TransactionStatus.CANCELLED) continue;
        if (txn.transactionType === TransactionType.LOAN && txn.status === TransactionStatus.COMPLETED) continue;

        const isOut = txn.fromUser?.userId === stockistId;
        const isIn = txn.toUser?.userId === stockistId;
        if (!isOut && !isIn) continue;
        const dir: 'in' | 'out' = isOut ? 'out' : 'in';

        if (txn.transactionType === TransactionType.SWAP) {
          for (const item of txn.items ?? []) {
            add(item.productId, item.quantity, item.unitPrice ?? costs[item.productId] ?? 0, dir);
          }
          const swapDir: 'in' | 'out' = dir === 'out' ? 'in' : 'out';
          for (const item of (txn as any).swapItems ?? []) {
            add(item.productId, item.quantity, item.unitPrice ?? costs[item.productId] ?? 0, swapDir);
          }
          continue;
        }

        for (const item of txn.items ?? []) {
          let itemDir = dir;
          if (txn.transactionType === TransactionType.CONVERSION) {
            itemDir = item.productId === (txn as any).conversionSource?.productId ? 'out' : 'in';
          }
          add(item.productId, item.quantity, item.unitPrice ?? costs[item.productId] ?? 0, itemDir);
        }
      }

      const computed: ComputedRow[] = Object.entries(perProduct)
        .map(([productId, { quantity, value }]) => ({
          productId,
          productName: names[productId] || productId,
          quantity: Math.max(0, quantity),
          value: Math.max(0, value),
        }))
        .filter((r) => r.quantity > 0)
        .sort((a, b) => b.quantity - a.quantity);

      // Single running total — matches hierarchy page
      let runQty = 0;
      let runVal = 0;
      for (const { quantity, value } of Object.values(perProduct)) {
        runQty += quantity;
        runVal += value;
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
            ← 返回經銷商總覽
          </Link>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3" />
            <p className="text-txt-subtle text-sm">載入中...</p>
          </div>
        ) : !stockist ? (
          <div className="glass-card p-12 text-center">
            <p className="text-txt-subtle text-sm">找不到此經銷商</p>
            <Link href="/stockists" className="mt-2 inline-block text-xs text-accent-text hover:underline">
              返回經銷商總覽
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
                  編輯使用者
                </Link>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-chip-dark p-4">
                  <p className="text-xs text-gray-300">庫存價值</p>
                  <p className="text-xl font-bold text-white tabular-nums mt-1">
                    RM {totalValue.toFixed(0)}
                  </p>
                </div>
                <div className="rounded-lg bg-chip-dark p-4">
                  <p className="text-xs text-gray-300">庫存總數</p>
                  <p className="text-xl font-bold text-white tabular-nums mt-1">
                    {totalQty}
                  </p>
                </div>
              </div>
            </div>

            <div className="glass-panel overflow-hidden">
              {rows.length === 0 ? (
                <div className="p-12 text-center text-txt-subtle text-sm">尚無庫存</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-base">
                      <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase">產品</th>
                      <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-txt-subtle uppercase">數量</th>
                      <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-txt-subtle uppercase">價值</th>
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
