'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { getCurrentToken } from '@/services/firebase/auth';
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
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [user?.id, role, filterUser]);

  async function load() {
    if (!user?.id && role !== UserRole.TAIWAN) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getCurrentToken();
      if (!token) {
        setError('請重新登入');
        setLoading(false);
        return;
      }
      const filterParam = role === UserRole.TAIWAN ? 'all' : (filterUser === 'all' ? 'all' : filterUser || (user?.id ?? ''));
      const res = await fetch(`/api/taiwan-orders/list?filterUser=${encodeURIComponent(filterParam)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '載入失敗');
      }
      setPools(data.pools || []);
      const userMap: Record<string, User> = {};
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

  async function handleDelete(poolId: string) {
    if (!confirm('確定要刪除此訂單池？此操作無法復原。')) return;
    setDeletingId(poolId);
    setError(null);
    try {
      const token = await getCurrentToken();
      if (!token) {
        setError('請重新登入');
        return;
      }
      const res = await fetch(`/api/taiwan-orders/${poolId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '刪除失敗');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.TAIWAN]}>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-txt-primary">Taiwan Orders</h1>
            <p className="text-xs text-txt-subtle mt-0.5">
              {role === UserRole.TAIWAN
                ? 'View each distributor\'s Taiwan order quantity and allocation status'
                : 'Order from Taiwan (quantity only), allocate products when needed'}
            </p>
          </div>
          {role === UserRole.ADMIN && (
            <Link
              href="/taiwan-orders/create"
              className="px-3.5 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition-colors"
            >
              + Order from Taiwan
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
              <option value="">tan sun sun</option>
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
              <p className="text-txt-subtle text-sm">No Taiwan orders yet</p>
              {role === UserRole.ADMIN && (
                <Link
                  href="/taiwan-orders/create"
                  className="mt-2 inline-block text-xs text-accent-text hover:underline"
                >
                  Create first Taiwan order →
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
                      <div className="flex items-center justify-center gap-2">
                        <Link
                          href={`/taiwan-orders/${pool.id}`}
                          className="px-2 py-1 text-xs text-accent-text hover:underline"
                        >
                          查看
                        </Link>
                        {role === UserRole.ADMIN && (pool.userId === user?.id || pool.userId === firebaseUser?.uid) && (
                          <button
                            type="button"
                            onClick={() => handleDelete(pool.id)}
                            disabled={deletingId === pool.id}
                            className="px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:underline disabled:opacity-50"
                          >
                            {deletingId === pool.id ? '刪除中...' : '刪除'}
                          </button>
                        )}
                      </div>
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
