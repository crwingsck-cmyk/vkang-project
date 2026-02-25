'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { TaiwanOrderPoolService } from '@/services/database/taiwanOrderPools';
import { UserService } from '@/services/database/users';
import { TaiwanOrderPool, UserRole, User } from '@/types/models';
import Link from 'next/link';

const statusLabels: Record<TaiwanOrderPool['status'], string> = {
  pending: '待分配',
  partially_allocated: '部分已分配',
  fully_allocated: '已全部分配',
};

export default function TaiwanOrdersPage() {
  const { user, role, firebaseUser } = useAuth();
  const [pools, setPools] = useState<(TaiwanOrderPool & { id: string })[]>([]);
  const [users, setUsers] = useState<Record<string, User>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterUser, setFilterUser] = useState('');

  useEffect(() => {
    load();
  }, [user?.id, role, filterUser]);

  async function load() {
    if (!user?.id && role !== UserRole.TAIWAN) return;
    setLoading(true);
    setError(null);
    try {
      const [poolList, adminList] = await Promise.all([
        role === UserRole.TAIWAN
          ? TaiwanOrderPoolService.getAll(100)
          : filterUser === 'all'
            ? TaiwanOrderPoolService.getAll(100)
            : filterUser
              ? TaiwanOrderPoolService.getByUser(filterUser, 100)
              : TaiwanOrderPoolService.getByUser(user!.id!, 100),
        role === UserRole.ADMIN ? UserService.getAdmins() : [],
      ]);
      setPools(poolList);
      const userMap: Record<string, User> = {};
      adminList.forEach((u) => {
        if (u.id) userMap[u.id] = u;
      });
      if (role === UserRole.ADMIN && user) {
        userMap[user.id!] = user;
      }
      setUsers(userMap);
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.TAIWAN]}>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-txt-primary">台灣訂單</h1>
            <p className="text-xs text-txt-subtle mt-0.5">
              {role === UserRole.TAIWAN
                ? '檢視各總經銷商向台灣訂購的數量與分配狀況'
                : '向台灣訂貨（僅數量），待下線有需求時再分配產品入庫'}
            </p>
          </div>
          {role === UserRole.ADMIN && (
            <Link
              href="/taiwan-orders/create"
              className="px-3.5 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition-colors"
            >
              + 向台灣訂貨
            </Link>
          )}
        </div>

        {role === UserRole.ADMIN && (
          <div className="flex items-center gap-4 flex-wrap">
            <select
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
              className="px-3 py-1.5 bg-surface-1 border border-border rounded-lg text-txt-primary text-xs focus:outline-none focus:border-accent name-lowercase"
            >
              <option value="">我的訂單</option>
              <option value="all">全部總經銷商</option>
              {(user?.id ?? firebaseUser?.uid) && (
                <option value={user?.id ?? firebaseUser?.uid}>
                  {user?.displayName || '我'}
                </option>
              )}
            </select>
          </div>
        )}

        <div className="glass-panel overflow-hidden">
          {loading ? (
            <div className="py-16 text-center">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3"></div>
              <p className="text-txt-subtle text-sm">載入中...</p>
            </div>
          ) : error ? (
            <div className="py-16 text-center">
              <div className="msg-error px-4 py-3 rounded-lg text-sm mb-4 inline-block">{error}</div>
              <button onClick={load} className="text-xs text-accent-text hover:underline">
                重新載入
              </button>
            </div>
          ) : pools.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-txt-subtle text-sm">尚無台灣訂單</p>
              {role === UserRole.ADMIN && (
                <Link
                  href="/taiwan-orders/create"
                  className="mt-2 inline-block text-xs text-accent-text hover:underline"
                >
                  建立第一筆台灣訂單 →
                </Link>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-base">
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">
                    訂單池 ID
                  </th>
                  {(role === UserRole.TAIWAN || filterUser === 'all' || (filterUser && filterUser !== (user?.id ?? firebaseUser?.uid))) && (
                    <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">
                      總經銷商
                    </th>
                  )}
                  <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">
                    訂購量
                  </th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">
                    已分配
                  </th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">
                    剩餘
                  </th>
                  <th className="px-5 py-2.5 text-center text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">
                    狀態
                  </th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">
                    建立日期
                  </th>
                  <th className="px-5 py-2.5 text-center text-[10px] font-semibold text-txt-subtle uppercase tracking-widest w-20">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {pools.map((pool) => (
                  <tr key={pool.id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-accent-text whitespace-nowrap">
                      <Link href={`/taiwan-orders/${pool.id}`} className="hover:underline">
                        {pool.id}
                      </Link>
                    </td>
                    {(role === UserRole.TAIWAN || filterUser === 'all' || (filterUser && filterUser !== (user?.id ?? firebaseUser?.uid))) && (
                      <td className="px-5 py-3 text-txt-secondary name-lowercase">
                        {pool.userName || users[pool.userId]?.displayName || pool.userId}
                      </td>
                    )}
                    <td className="px-5 py-3 text-txt-primary text-right tabular-nums font-medium">
                      {pool.totalOrdered} 套
                    </td>
                    <td className="px-5 py-3 text-txt-secondary text-right tabular-nums">
                      {pool.allocatedQuantity} 套
                    </td>
                    <td className="px-5 py-3 text-txt-secondary text-right tabular-nums">
                      {pool.remaining} 套
                    </td>
                    <td className="px-5 py-3 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                          pool.status === 'fully_allocated'
                            ? 'bg-blue-800 text-white'
                            : pool.status === 'partially_allocated'
                              ? 'bg-amber-800/50 text-amber-200'
                              : 'bg-chip-dark text-white'
                        }`}
                      >
                        {statusLabels[pool.status]}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-txt-subtle text-xs whitespace-nowrap">
                      {pool.createdAt
                        ? new Date(pool.createdAt).toLocaleDateString('zh-TW')
                        : '—'}
                    </td>
                    <td className="px-5 py-3 text-center whitespace-nowrap">
                      <Link
                        href={`/taiwan-orders/${pool.id}`}
                        className="px-2 py-1 text-xs text-accent-text hover:underline"
                      >
                        查看
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
