'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ProfitService, ProfitBreakdown } from '@/services/database/profit';
import { UserService } from '@/services/database/users';
import { User, UserRole } from '@/types/models';

export default function ProfitPage() {
  const params = useParams();
  const router = useRouter();
  const userId = (params?.userId ?? '') as string;

  const [user, setUser] = useState<User | null>(null);
  const [breakdown, setBreakdown] = useState<ProfitBreakdown | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      UserService.getById(userId),
      ProfitService.getBreakdown(userId),
    ]).then(([u, bd]) => {
      if (cancelled) return;
      setUser(u ?? null);
      setBreakdown(bd);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  if (!userId) {
    router.replace('/profit');
    return null;
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-txt-primary tracking-tight">
              {user?.displayName ?? '—'} — Income & Expense
            </h1>
            <p className="text-base text-txt-subtle mt-0.5">Profit = Income − Expense</p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/customers/${userId}`}
              className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Financials
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-accent mb-3" />
            <p className="text-txt-subtle text-sm">Loading...</p>
          </div>
        ) : breakdown ? (
          <>
            {/* 盈利總覽 */}
            <div className="rounded-2xl border-2 border-accent bg-accent/5 p-8 text-center">
              <p className="text-sm font-medium text-txt-subtle uppercase tracking-wide">Profit</p>
              <p className={`text-5xl font-bold tabular-nums mt-1 ${
                breakdown.profit >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                RM {breakdown.profit.toFixed(2)}
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 收入 */}
              <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-gray-200 bg-green-50">
                  <h2 className="text-lg font-semibold text-green-800">Income</h2>
                  <p className="text-2xl font-bold text-green-700 tabular-nums mt-1">
                    RM {breakdown.totalIncome.toFixed(2)}
                  </p>
                </div>
                <div className="p-6 space-y-4">
                  <Row label="From stockists & customers" value={breakdown.incomeFromReceivables} />
                  <Row label="From weighing scale & shipping" value={breakdown.incomeFromExpenseRecovery} />
                  <Row label="Self-use products" value={breakdown.incomeFromSelfUse} />
                </div>
              </div>

              {/* 支出 */}
              <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-gray-200 bg-red-50">
                  <h2 className="text-lg font-semibold text-red-800">Expense</h2>
                  <p className="text-2xl font-bold text-red-700 tabular-nums mt-1">
                    RM {breakdown.totalExpense.toFixed(2)}
                  </p>
                </div>
                <div className="p-6 space-y-4">
                  <Row label="Products to Taiwan" value={breakdown.expenseTaiwanProducts} />
                  <Row label="Weighing scale from Taiwan" value={breakdown.expenseWeighingScale} />
                  <Row label="Shipping costs" value={breakdown.expenseShipping} />
                  <Row label="Staff expenses" value={breakdown.expenseSalary} />
                </div>
              </div>
            </div>

            <p className="text-sm text-txt-subtle">
              ※ Weighing scale, shipping and staff expenses require selecting an owner when creating in Expense Management; products to Taiwan require filling in related user when creating in Financials.
            </p>
          </>
        ) : (
          <div className="py-16 text-center text-txt-subtle">Failed to load data</div>
        )}
      </div>
    </ProtectedRoute>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-gray-700">{label}</span>
      <span className="font-semibold tabular-nums text-gray-900">
        RM {value.toFixed(2)}
      </span>
    </div>
  );
}
