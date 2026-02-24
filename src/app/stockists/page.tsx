'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { InventoryService } from '@/services/database/inventory';
import { OrderService } from '@/services/database/orders';
import { User, UserRole, TransactionType, InventoryStatus } from '@/types/models';
import Link from 'next/link';

export default function StockistsPage() {
  const { role } = useAuth();
  const [stockists, setStockists] = useState<User[]>([]);
  const [stats, setStats] = useState<Record<string, { invValue: number; orderCount: number; lowStock: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role !== UserRole.ADMIN) return;
    load();
  }, [role]);

  async function load() {
    setLoading(true);
    try {
      const list = await UserService.getStockists();
      setStockists(list);

      const s: Record<string, { invValue: number; orderCount: number; lowStock: number }> = {};
      await Promise.all(
        list.map(async (u) => {
          if (!u.id) return;
          try {
            const [inv, orders] = await Promise.all([
              InventoryService.getByUser(u.id, 200),
              OrderService.getByFromUser(u.id, 50),
            ]);
            const invValue = inv.reduce((sum, i) => sum + (i.marketValue ?? i.cost * i.quantityOnHand), 0);
            const sales = orders.filter((o) => o.transactionType === TransactionType.SALE);
            const lowStock = inv.filter(
              (i) => i.status === InventoryStatus.LOW_STOCK || i.status === InventoryStatus.OUT_OF_STOCK
            ).length;
            s[u.id] = { invValue, orderCount: sales.length, lowStock };
          } catch {
            s[u.id] = { invValue: 0, orderCount: 0, lowStock: 0 };
          }
        })
      );
      setStats(s);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (role !== UserRole.ADMIN) return null;

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold text-txt-primary tracking-tight">經銷商總覽</h1>
          <p className="text-sm text-txt-subtle mt-0.5">查看每位經銷商的訂單、庫存與營運狀況</p>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3" />
            <p className="text-txt-subtle text-sm">載入中...</p>
          </div>
        ) : stockists.length === 0 ? (
          <div className="bg-surface-1 rounded-xl border border-border p-12 text-center">
            <p className="text-txt-subtle text-sm">尚無經銷商</p>
            <Link href="/users" className="mt-2 inline-block text-xs text-accent-text hover:underline">
              至使用者管理建立經銷商 →
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {stockists.map((s) => {
              const st = stats[s.id!] ?? { invValue: 0, orderCount: 0, lowStock: 0 };
              return (
                <Link
                  key={s.id}
                  href={`/stockists/${s.id}`}
                  className="block bg-surface-1 rounded-xl border border-border hover:border-accent/40 p-5 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="font-semibold text-txt-primary">{s.displayName}</h2>
                      <p className="text-xs text-txt-subtle mt-0.5 truncate max-w-[200px]">
                        {s.email}
                      </p>
                      {s.company?.name && (
                        <p className="text-xs text-txt-subtle mt-0.5">{s.company.name}</p>
                      )}
                    </div>
                    <span className="text-accent-text text-xs">查看 →</span>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-surface-2/50 py-2">
                      <p className="text-[10px] text-txt-subtle uppercase">庫存價值</p>
                      <p className="text-sm font-semibold text-txt-primary tabular-nums">
                        ${st.invValue.toFixed(0)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-surface-2/50 py-2">
                      <p className="text-[10px] text-txt-subtle uppercase">訂單數</p>
                      <p className="text-sm font-semibold text-txt-primary tabular-nums">
                        {st.orderCount}
                      </p>
                    </div>
                    <div className="rounded-lg bg-surface-2/50 py-2">
                      <p className="text-[10px] text-txt-subtle uppercase">低庫存</p>
                      <p
                        className={`text-sm font-semibold tabular-nums ${
                          st.lowStock > 0 ? 'text-warning' : 'text-txt-primary'
                        }`}
                      >
                        {st.lowStock}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
