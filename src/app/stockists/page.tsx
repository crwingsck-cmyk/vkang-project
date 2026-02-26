'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { InventoryService } from '@/services/database/inventory';
import { User, UserRole } from '@/types/models';
import Link from 'next/link';

function DistributorCard({
  user,
  stats,
  cardClass,
  badge,
}: {
  user: User;
  stats: { invValue: number; totalQuantity: number };
  cardClass: string;
  badge?: string;
}) {
  return (
    <Link
      href={`/stockists/${user.id}`}
      className={`block p-5 rounded-xl border ${cardClass} hover:border-accent/40 transition-all shadow-sm relative`}
    >
      {badge && (
        <span className="absolute top-3 right-10 text-[10px] font-medium text-txt-subtle bg-surface-2 px-1.5 py-0.5 rounded">
          {badge}
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-txt-primary name-lowercase truncate">{user.displayName}</h2>
          <p className="text-xs text-txt-subtle mt-0.5 truncate">
            {user.email}
          </p>
          {user.company?.name && (
            <p className="text-xs text-txt-subtle mt-0.5 truncate">{user.company.name}</p>
          )}
        </div>
        <span className="text-accent-text text-xs shrink-0">查看 →</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-chip-dark py-2">
          <p className="text-xs text-gray-300">庫存價值</p>
          <p className="text-sm font-semibold text-white tabular-nums">
            ${stats.invValue.toFixed(0)}
          </p>
        </div>
        <div className="rounded-lg bg-chip-dark py-2">
          <p className="text-xs text-gray-300">庫存總數</p>
          <p className="text-sm font-semibold text-white tabular-nums">
            {stats.totalQuantity}
          </p>
        </div>
      </div>
    </Link>
  );
}

export default function StockistsPage() {
  const { role } = useAuth();
  const [admins, setAdmins] = useState<User[]>([]);
  const [stockists, setStockists] = useState<User[]>([]);
  const [stats, setStats] = useState<Record<string, { invValue: number; totalQuantity: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role !== UserRole.ADMIN) return;
    load();
  }, [role]);

  async function loadUserStats(userId: string): Promise<{ invValue: number; totalQuantity: number }> {
    try {
      const inv = await InventoryService.getByUser(userId, 200);
      const invValue = inv.reduce(
        (sum, i) => sum + (i.quantityOnHand === 0 ? 0 : (i.marketValue ?? i.cost * i.quantityOnHand)),
        0
      );
      const totalQuantity = inv.reduce((sum, i) => sum + i.quantityOnHand, 0);
      return { invValue, totalQuantity };
    } catch {
      return { invValue: 0, totalQuantity: 0 };
    }
  }

  async function load() {
    setLoading(true);
    try {
      const [adminList, stockistList] = await Promise.all([
        UserService.getAdmins(),
        UserService.getStockists(),
      ]);
      setAdmins(adminList);
      setStockists(stockistList);

      const s: Record<string, { invValue: number; totalQuantity: number }> = {};
      const allUsers = [...adminList, ...stockistList];
      await Promise.all(
        allUsers.map(async (u) => {
          if (!u.id) return;
          s[u.id] = await loadUserStats(u.id);
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
          <p className="text-sm text-txt-subtle mt-0.5">查看總經銷商與每位經銷商的庫存與營運狀況</p>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3" />
            <p className="text-txt-subtle text-sm">載入中...</p>
          </div>
        ) : admins.length === 0 && stockists.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <p className="text-txt-subtle text-sm">尚無總經銷商或經銷商</p>
            <Link href="/users" className="mt-2 inline-block text-xs text-accent-text hover:underline">
              至使用者管理建立 →
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {admins.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-txt-subtle uppercase tracking-widest mb-3">總經銷商</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {admins.map((a, idx) => {
                    const st = stats[a.id!] ?? { invValue: 0, totalQuantity: 0 };
                    const adminCardColors = [
                      'bg-emerald-50 border-emerald-200/60 hover:bg-emerald-100/80',
                      'bg-violet-50 border-violet-200/60 hover:bg-violet-100/80',
                    ];
                    return (
                      <DistributorCard
                        key={a.id}
                        user={a}
                        stats={st}
                        cardClass={adminCardColors[idx % 2]}
                        badge="總經銷商"
                      />
                    );
                  })}
                </div>
              </section>
            )}

            {stockists.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-txt-subtle uppercase tracking-widest mb-3">經銷商</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {stockists.map((s, idx) => {
                    const st = stats[s.id!] ?? { invValue: 0, totalQuantity: 0 };
                    const cardColors = [
                      'bg-amber-50 border-amber-200/60 hover:bg-amber-100/80',
                      'bg-blue-50 border-blue-200/60 hover:bg-blue-100/80',
                      'bg-red-50 border-red-200/60 hover:bg-red-100/80',
                    ];
                    return (
                      <DistributorCard
                        key={s.id}
                        user={s}
                        stats={st}
                        cardClass={cardColors[idx % 3]}
                      />
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
