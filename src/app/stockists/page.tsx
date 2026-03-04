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
    <div className={`p-5 rounded-xl border ${cardClass} shadow-sm relative`}>
      {badge && (
        <span className="absolute top-3 right-3 text-[10px] font-medium text-txt-subtle bg-surface-2 px-1.5 py-0.5 rounded">
          {badge}
        </span>
      )}
      <div className="min-w-0 pr-16">
        <h2 className="font-semibold text-txt-primary name-lowercase truncate">{user.displayName}</h2>
        <p className="text-xs text-txt-subtle mt-0.5 truncate">{user.email}</p>
        {user.company?.name && (
          <p className="text-xs text-txt-subtle mt-0.5 truncate">{user.company.name}</p>
        )}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-chip-dark py-2">
          <p className="text-xs text-gray-300">Inventory Value</p>
          <p className="text-lg font-bold text-white tabular-nums">
            RM {stats.invValue.toFixed(0)}
          </p>
        </div>
        <div className="rounded-lg bg-chip-dark py-2">
          <p className="text-xs text-gray-300">Total Stock</p>
          <p className="text-lg font-bold text-white tabular-nums">
            {stats.totalQuantity}
          </p>
        </div>
      </div>
    </div>
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
      const invList = await InventoryService.getByUser(userId, 200);
      let totalQuantity = 0;
      let invValue = 0;
      for (const inv of invList) {
        totalQuantity += inv.quantityOnHand ?? 0;
        invValue += inv.marketValue ?? 0;
      }
      return { invValue: Math.max(0, invValue), totalQuantity: Math.max(0, totalQuantity) };
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
          <h1 className="text-xl font-bold text-txt-primary tracking-tight">Stockist Overview</h1>
          <p className="text-sm text-txt-subtle mt-0.5">View master distributors and stockists inventory & operations</p>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3" />
            <p className="text-txt-subtle text-sm">Loading...</p>
          </div>
        ) : admins.length === 0 && stockists.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <p className="text-txt-subtle text-sm">No master distributors or stockists yet</p>
            <Link href="/users" className="mt-2 inline-block text-xs text-accent-text hover:underline">
              Create in User Management →
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {admins.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-txt-subtle uppercase tracking-widest mb-3">Master Distributors</h2>
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
                        badge="Master Distributor"
                      />
                    );
                  })}
                </div>
              </section>
            )}

            {stockists.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-txt-subtle uppercase tracking-widest mb-3">Stockists</h2>
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
