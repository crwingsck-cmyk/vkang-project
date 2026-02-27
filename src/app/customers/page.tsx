'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { OrderService } from '@/services/database/orders';
import { User, UserRole, TransactionType } from '@/types/models';
import Link from 'next/link';

interface Stats {
  totalValue: number;
  totalQty: number;
}

function CustomerCard({ user, stats, idx }: { user: User; stats: Stats; idx: number }) {
  const cardColors = [
    'bg-sky-50 border-sky-200/60 hover:bg-sky-100/80',
    'bg-teal-50 border-teal-200/60 hover:bg-teal-100/80',
    'bg-cyan-50 border-cyan-200/60 hover:bg-cyan-100/80',
  ];
  return (
    <Link
      href={`/hierarchy/${user.id}`}
      className={`block p-5 rounded-xl border ${cardColors[idx % 3]} hover:border-accent/40 transition-all shadow-sm relative`}
    >
      <span className="absolute top-3 right-10 text-[10px] font-medium text-txt-subtle bg-surface-2 px-1.5 py-0.5 rounded">
        客戶
      </span>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-txt-primary name-lowercase truncate">{user.displayName}</h2>
          <p className="text-xs text-txt-subtle mt-0.5 truncate">{user.email}</p>
          {user.company?.name && (
            <p className="text-xs text-txt-subtle mt-0.5 truncate">{user.company.name}</p>
          )}
        </div>
        <span className="text-accent-text text-xs shrink-0">查看 →</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-chip-dark py-2">
          <p className="text-xs text-gray-300">購買總額</p>
          <p className="text-sm font-semibold text-white tabular-nums">${stats.totalValue.toFixed(0)}</p>
        </div>
        <div className="rounded-lg bg-chip-dark py-2">
          <p className="text-xs text-gray-300">購買總數</p>
          <p className="text-sm font-semibold text-white tabular-nums">{stats.totalQty}</p>
        </div>
      </div>
    </Link>
  );
}

function SelfUseCard({ user, stats, idx }: { user: User; stats: Stats; idx: number }) {
  const cardColors = [
    'bg-orange-50 border-orange-200/60 hover:bg-orange-100/80',
    'bg-amber-50 border-amber-200/60 hover:bg-amber-100/80',
    'bg-yellow-50 border-yellow-200/60 hover:bg-yellow-100/80',
  ];
  return (
    <Link
      href={`/hierarchy/${user.id}`}
      className={`block p-5 rounded-xl border ${cardColors[idx % 3]} hover:border-accent/40 transition-all shadow-sm relative`}
    >
      <span className="absolute top-3 right-10 text-[10px] font-medium text-txt-subtle bg-surface-2 px-1.5 py-0.5 rounded">
        自用
      </span>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-txt-primary name-lowercase truncate">{user.displayName}</h2>
          <p className="text-xs text-txt-subtle mt-0.5 truncate">{user.email}</p>
          {user.company?.name && (
            <p className="text-xs text-txt-subtle mt-0.5 truncate">{user.company.name}</p>
          )}
        </div>
        <span className="text-accent-text text-xs shrink-0">查看 →</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-chip-dark py-2">
          <p className="text-xs text-gray-300">自用總額</p>
          <p className="text-sm font-semibold text-white tabular-nums">${stats.totalValue.toFixed(0)}</p>
        </div>
        <div className="rounded-lg bg-chip-dark py-2">
          <p className="text-xs text-gray-300">自用總數</p>
          <p className="text-sm font-semibold text-white tabular-nums">{stats.totalQty}</p>
        </div>
      </div>
    </Link>
  );
}

export default function CustomersPage() {
  const { role } = useAuth();
  const [customers, setCustomers] = useState<User[]>([]);
  const [selfUseUsers, setSelfUseUsers] = useState<User[]>([]);
  const [customerStats, setCustomerStats] = useState<Record<string, Stats>>({});
  const [selfUseStats, setSelfUseStats] = useState<Record<string, Stats>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role !== UserRole.ADMIN) return;
    load();
  }, [role]);

  async function load() {
    setLoading(true);
    try {
      const [customerList, adminList, stockistList, allTransfers, allAdjustments] = await Promise.all([
        UserService.getByRole(UserRole.CUSTOMER),
        UserService.getAdmins(),
        UserService.getStockists(),
        OrderService.getByType(TransactionType.TRANSFER, 2000),
        OrderService.getByType(TransactionType.ADJUSTMENT, 1000),
      ]);

      setCustomers(customerList);

      // Customer stats: TRANSFER transactions where toUser is a CUSTOMER
      const customerIdSet = new Set(customerList.map((c) => c.id!));
      const cStats: Record<string, Stats> = {};
      for (const txn of allTransfers) {
        const uid = txn.toUser?.userId;
        if (!uid || !customerIdSet.has(uid)) continue;
        if (!cStats[uid]) cStats[uid] = { totalValue: 0, totalQty: 0 };
        cStats[uid].totalValue += txn.totals?.grandTotal ?? 0;
        cStats[uid].totalQty += (txn.items ?? []).reduce((s, i) => s + (i.quantity ?? 0), 0);
      }
      setCustomerStats(cStats);

      // Self-use stats: ADJUSTMENT where description='自用' AND fromUser.userId === toUser.userId
      const allUsers = [...adminList, ...stockistList];
      const userMap = new Map(allUsers.map((u) => [u.id!, u]));
      const suStats: Record<string, Stats> = {};
      for (const txn of allAdjustments) {
        const fromUid = txn.fromUser?.userId;
        const toUid = txn.toUser?.userId;
        if (!fromUid || fromUid !== toUid) continue;
        if (txn.description !== '自用') continue;
        if (!suStats[fromUid]) suStats[fromUid] = { totalValue: 0, totalQty: 0 };
        suStats[fromUid].totalValue += txn.totals?.grandTotal ?? 0;
        suStats[fromUid].totalQty += (txn.items ?? []).reduce((s, i) => s + (i.quantity ?? 0), 0);
      }
      setSelfUseStats(suStats);

      // Only show self-use cards for users who have records
      const suUserList = Object.keys(suStats)
        .map((uid) => userMap.get(uid))
        .filter((u): u is NonNullable<typeof u> => !!u)
        .sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));
      setSelfUseUsers(suUserList);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (role !== UserRole.ADMIN) return null;

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-txt-primary tracking-tight">客戶購買 &amp; 自用總覽</h1>
          <p className="text-sm text-txt-subtle mt-0.5">查看所有客戶購買記錄及經銷商自用消費數量</p>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3" />
            <p className="text-txt-subtle text-sm">載入中...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Section 1: Customers */}
            <section>
              <h2 className="text-sm font-semibold text-txt-subtle uppercase tracking-widest mb-3">
                客戶（{customers.length}）
              </h2>
              {customers.length === 0 ? (
                <div className="glass-card p-8 text-center">
                  <p className="text-txt-subtle text-sm">尚無客戶</p>
                  <Link href="/users" className="mt-2 inline-block text-xs text-accent-text hover:underline">
                    至使用者管理建立 →
                  </Link>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {customers.map((c, idx) => (
                    <CustomerCard
                      key={c.id}
                      user={c}
                      stats={customerStats[c.id!] ?? { totalValue: 0, totalQty: 0 }}
                      idx={idx}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Section 2: Self-use by distributors */}
            <section>
              <h2 className="text-sm font-semibold text-txt-subtle uppercase tracking-widest mb-3">
                經銷商自用（{selfUseUsers.length}）
              </h2>
              {selfUseUsers.length === 0 ? (
                <div className="glass-card p-8 text-center">
                  <p className="text-txt-subtle text-sm">尚無自用記錄</p>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {selfUseUsers.map((u, idx) => (
                    <SelfUseCard
                      key={u.id}
                      user={u}
                      stats={selfUseStats[u.id!] ?? { totalValue: 0, totalQty: 0 }}
                      idx={idx}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
