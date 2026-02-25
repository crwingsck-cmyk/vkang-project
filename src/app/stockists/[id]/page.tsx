'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { InventoryService } from '@/services/database/inventory';
import { ProductService } from '@/services/database/products';
import { User, UserRole, Inventory, InventoryStatus } from '@/types/models';
import Link from 'next/link';

export default function StockistDetailPage() {
  const params = useParams();
  const stockistId = (params?.id ?? '') as string;
  const { role } = useAuth();

  const [stockist, setStockist] = useState<User | null>(null);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role !== UserRole.ADMIN || !stockistId) return;
    load();
  }, [role, stockistId]);

  async function load() {
    setLoading(true);
    try {
      const [u, inv, products] = await Promise.all([
        UserService.getById(stockistId),
        InventoryService.getByUser(stockistId, 100),
        ProductService.getAll(undefined, 200),
      ]);
      setStockist(u ?? null);
      setInventory(inv);
      const names: Record<string, string> = {};
      for (const p of products) {
        if (p.sku) names[p.sku] = p.name || p.sku;
      }
      setProductNames(names);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (role !== UserRole.ADMIN) return null;

  const invItemValue = (i: { quantityOnHand: number; marketValue?: number; cost: number }) =>
    i.quantityOnHand === 0 ? 0 : (i.marketValue ?? i.cost * i.quantityOnHand);
  const invValue = inventory.reduce((s, i) => s + invItemValue(i), 0);
  const totalQuantity = inventory.reduce((s, i) => s + i.quantityOnHand, 0);

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-5">
        <div className="flex items-center gap-4">
          <Link
            href="/stockists"
            className="text-txt-subtle hover:text-txt-primary text-sm"
          >
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
                    USD {invValue.toFixed(0)}
                  </p>
                </div>
                <div className="rounded-lg bg-chip-dark p-4">
                  <p className="text-xs text-gray-300">庫存總數</p>
                  <p className="text-xl font-bold text-white tabular-nums mt-1">
                    {totalQuantity}
                  </p>
                </div>
              </div>
            </div>

            <div className="glass-panel overflow-hidden">
                {inventory.length === 0 ? (
                  <div className="p-12 text-center text-txt-subtle text-sm">尚無庫存</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface-base">
                        <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase">
                          產品
                        </th>
                        <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-txt-subtle uppercase">
                          現有
                        </th>
                        <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-txt-subtle uppercase">
                          可用
                        </th>
                        <th className="px-5 py-2.5 text-center text-[10px] font-semibold text-txt-subtle uppercase">
                          狀態
                        </th>
                        <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-txt-subtle uppercase">
                          價值
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-muted">
                      {inventory.map((i) => (
                        <tr key={i.id} className="hover:bg-surface-2/50">
                          <td className="px-5 py-3 text-txt-primary">
                            <span className="font-medium">{productNames[i.productId] || i.productId}</span>
                            <span className="font-mono text-xs text-txt-subtle ml-1">({i.productId})</span>
                          </td>
                          <td className="px-5 py-3 text-txt-secondary text-right tabular-nums">
                            {i.quantityOnHand}
                          </td>
                          <td className="px-5 py-3 text-txt-secondary text-right tabular-nums">
                            {i.quantityAvailable}
                          </td>
                          <td className="px-5 py-3 text-center whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap shrink-0 ${
                                i.status === InventoryStatus.IN_STOCK
                                  ? 'bg-success/10 text-success'
                                  : i.status === InventoryStatus.LOW_STOCK
                                    ? 'bg-warning/10 text-warning'
                                    : 'bg-error/10 text-error'
                              }`}
                            >
                              {i.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-txt-secondary text-right tabular-nums">
                            USD {invItemValue(i).toFixed(2)}
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
