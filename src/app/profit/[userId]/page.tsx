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
  const [users, setUsers] = useState<User[]>([]);
  const [breakdown, setBreakdown] = useState<ProfitBreakdown | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      UserService.getById(userId),
      UserService.getAll(),
      ProfitService.getBreakdown(userId),
    ]).then(([u, all, bd]) => {
      if (cancelled) return;
      setUser(u ?? null);
      setUsers(all);
      setBreakdown(bd);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  const handleUserChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (id) router.push(`/profit/${id}`);
  };

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
              {user?.displayName ?? '—'} — 收入支出表
            </h1>
            <p className="text-base text-txt-subtle mt-0.5">盈利 = 收入 − 支出</p>
          </div>
          <div className="flex gap-2">
            <select
              value={userId}
              onChange={handleUserChange}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.displayName}</option>
              ))}
            </select>
            <Link
              href={`/customers/${userId}`}
              className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              財務表
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-accent mb-3" />
            <p className="text-txt-subtle text-sm">載入中...</p>
          </div>
        ) : breakdown ? (
          <>
            {/* 盈利總覽 */}
            <div className="rounded-2xl border-2 border-accent bg-accent/5 p-8 text-center">
              <p className="text-sm font-medium text-txt-subtle uppercase tracking-wide">盈利</p>
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
                  <h2 className="text-lg font-semibold text-green-800">收入</h2>
                  <p className="text-2xl font-bold text-green-700 tabular-nums mt-1">
                    RM {breakdown.totalIncome.toFixed(2)}
                  </p>
                </div>
                <div className="p-6 space-y-4">
                  <Row label="收經銷商及顧客的錢" value={breakdown.incomeFromReceivables} />
                  <Row label="顧客的體重秤及郵寄的錢" value={breakdown.incomeFromExpenseRecovery} />
                  <Row label="自用產品（自己付自己錢）" value={breakdown.incomeFromSelfUse} />
                </div>
              </div>

              {/* 支出 */}
              <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-gray-200 bg-red-50">
                  <h2 className="text-lg font-semibold text-red-800">支出</h2>
                  <p className="text-2xl font-bold text-red-700 tabular-nums mt-1">
                    RM {breakdown.totalExpense.toFixed(2)}
                  </p>
                </div>
                <div className="p-6 space-y-4">
                  <Row label="給台灣的產品貨" value={breakdown.expenseTaiwanProducts} />
                  <Row label="向台灣買體重秤" value={breakdown.expenseWeighingScale} />
                  <Row label="付郵寄產品費用" value={breakdown.expenseShipping} />
                  <Row label="員工的費用" value={breakdown.expenseSalary} />
                </div>
              </div>
            </div>

            <p className="text-sm text-txt-subtle">
              ※ 支出中的體重秤、郵寄、員工費用需在「費用管理」建立時選擇歸屬人；給台灣的產品貨需在「財務」建立時填寫相關用戶。
            </p>
          </>
        ) : (
          <div className="py-16 text-center text-txt-subtle">無法載入資料</div>
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
