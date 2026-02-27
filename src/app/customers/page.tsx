'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { OrderService } from '@/services/database/orders';
import { ReceivableService } from '@/services/database/receivables';
import { User, UserRole, TransactionType, ReceivableStatus } from '@/types/models';
import Link from 'next/link';

interface SelfUseStats {
  totalValue: number;
  totalQty: number;
}

interface ARStats {
  outstanding: number;
  paid: number;
}

function CustomerCard({ user, arStats, idx }: { user: User; arStats: ARStats; idx: number }) {
  const cardColors = [
    'bg-sky-50 border-sky-200/60 hover:bg-sky-100/80',
    'bg-teal-50 border-teal-200/60 hover:bg-teal-100/80',
    'bg-cyan-50 border-cyan-200/60 hover:bg-cyan-100/80',
  ];
  return (
    <Link
      href={`/customers/${user.id}`}
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
        <span className="text-accent-text text-xs shrink-0">財務 →</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-chip-dark py-2">
          <p className="text-xs text-gray-300">未收款</p>
          <p className="text-sm font-semibold text-red-400 tabular-nums">
            {arStats.outstanding > 0 ? arStats.outstanding.toFixed(0) : '—'}
          </p>
        </div>
        <div className="rounded-lg bg-chip-dark py-2">
          <p className="text-xs text-gray-300">已收款</p>
          <p className="text-sm font-semibold text-green-400 tabular-nums">
            {arStats.paid > 0 ? arStats.paid.toFixed(0) : '—'}
          </p>
        </div>
      </div>
    </Link>
  );
}

function SelfUseCard({ user, stats, idx }: { user: User; stats: SelfUseStats; idx: number }) {
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
  const [customerARStats, setCustomerARStats] = useState<Record<string, ARStats>>({});
  const [selfUseStats, setSelfUseStats] = useState<Record<string, SelfUseStats>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role !== UserRole.ADMIN) return;
    load();
  }, [role]);

  async function load() {
    setLoading(true);
    try {
      const [customerList, adminList, stockistList, allAdjustments, allReceivables] = await Promise.all([
        UserService.getByRole(UserRole.CUSTOMER),
        UserService.getAdmins(),
        UserService.getStockists(),
        OrderService.getByType(TransactionType.ADJUSTMENT, 1000),
        ReceivableService.getAll(1000),
      ]);

      setCustomers(customerList);

      // Customer AR stats from receivables
      const arStats: Record<string, ARStats> = {};
      for (const r of allReceivables) {
        const cid = r.customerId;
        if (!arStats[cid]) arStats[cid] = { outstanding: 0, paid: 0 };
        if (r.status !== ReceivableStatus.PAID) {
          arStats[cid].outstanding += r.remainingAmount;
        }
        arStats[cid].paid += r.paidAmount;
      }
      setCustomerARStats(arStats);

      // Self-use stats: ADJUSTMENT where description='自用' AND fromUser.userId === toUser.userId
      const allUsers = [...adminList, ...stockistList];
      const userMap = new Map(allUsers.map((u) => [u.id!, u]));
      const suStats: Record<string, SelfUseStats> = {};
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
          <h1 className="text-xl font-bold text-txt-primary tracking-tight">客戶財務總覽</h1>
          <p className="text-sm text-txt-subtle mt-0.5">點擊客戶卡片查看訂貨、發貨、應收款及收款記錄</p>
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
                      arStats={customerARStats[c.id!] ?? { outstanding: 0, paid: 0 }}
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
