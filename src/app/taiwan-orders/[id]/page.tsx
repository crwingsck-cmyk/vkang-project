'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { getCurrentToken } from '@/services/firebase/auth';
import { TaiwanOrderPool, TaiwanOrderAllocation, UserRole } from '@/types/models';
import Link from 'next/link';

const statusLabels: Record<TaiwanOrderPool['status'], string> = {
  pending: '待分配',
  partially_allocated: '部分已分配',
  fully_allocated: '已全部分配',
};

export default function TaiwanOrderDetailPage() {
  const params = useParams();
  const poolId = (params?.id ?? '') as string;
  const { role } = useAuth();
  const [pool, setPool] = useState<(TaiwanOrderPool & { id: string }) | null>(null);
  const [allocations, setAllocations] = useState<(TaiwanOrderAllocation & { id: string })[]>([]);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [allocating, setAllocating] = useState(false);
  const [showAllocateForm, setShowAllocateForm] = useState(false);
  const [allocQuantity, setAllocQuantity] = useState(0);

  useEffect(() => {
    load();
  }, [poolId]);

  useEffect(() => {
    if (pool && pool.remaining > 0) setAllocQuantity(pool.remaining);
  }, [pool?.remaining]);

  async function load() {
    if (!poolId) return;
    setLoading(true);
    setError('');
    try {
      const token = await getCurrentToken();
      if (!token) {
        setError('請重新登入');
        setLoading(false);
        return;
      }
      const res = await fetch(`/api/taiwan-orders/${poolId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '載入失敗');
      }
      setPool(data.pool);
      setAllocations(data.allocations || []);
      setUserName(data.pool?.userName || data.pool?.userId || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }

  async function handleAllocate(e: React.FormEvent) {
    e.preventDefault();
    if (!pool || pool.remaining <= 0) return;
    setError('');
    const qty = Math.floor(allocQuantity) || 0;
    if (qty <= 0) {
      setError('請輸入分配數量');
      return;
    }
    if (qty > pool.remaining) {
      setError(`剩餘可分配 ${pool.remaining} 單位，無法分配 ${qty} 單位`);
      return;
    }

    setAllocating(true);
    try {
      const token = await getCurrentToken();
      if (!token) {
        setError('請重新登入');
        setAllocating(false);
        return;
      }
      const res = await fetch(`/api/taiwan-orders/${poolId}/allocate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ quantity: qty }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '分配失敗');
      }
      setShowAllocateForm(false);
      setAllocQuantity(pool.remaining);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '分配失敗');
    } finally {
      setAllocating(false);
    }
  }

  const canAllocate = role === UserRole.ADMIN && pool && pool.remaining > 0;

  if (loading) {
    return (
      <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.TAIWAN]}>
        <div className="max-w-3xl mx-auto py-12 text-center text-gray-400">載入中...</div>
      </ProtectedRoute>
    );
  }

  if (!pool) {
    return (
      <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.TAIWAN]}>
        <div className="max-w-3xl mx-auto space-y-6">
          <Link href="/taiwan-orders" className="text-gray-400 hover:text-gray-200 text-sm">
            &larr; 返回台灣訂單
          </Link>
          <div className="msg-error px-4 py-3 rounded-lg">{error || '訂單池不存在'}</div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.TAIWAN]}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/taiwan-orders" className="text-gray-400 hover:text-gray-200 text-sm">
            &larr; 返回台灣訂單
          </Link>
        </div>

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h1 className="text-xl font-bold text-gray-100">台灣訂單池</h1>
          <p className="text-gray-400 text-sm mt-0.5 font-mono">{pool.id}</p>

          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-lg bg-chip-dark p-4">
              <p className="text-xs text-gray-300">總經銷商</p>
              <p className="text-lg font-semibold text-white mt-1 name-lowercase">
                {userName || pool.userName || pool.userId}
              </p>
            </div>
            <div className="rounded-lg bg-chip-dark p-4">
              <p className="text-xs text-gray-300">訂購量</p>
              <p className="text-xl font-bold text-white tabular-nums mt-1">
                {pool.totalOrdered} 套
              </p>
            </div>
            <div className="rounded-lg bg-chip-dark p-4">
              <p className="text-xs text-gray-300">已分配</p>
              <p className="text-xl font-bold text-white tabular-nums mt-1">
                {pool.allocatedQuantity} 套
              </p>
            </div>
            <div className="rounded-lg bg-chip-dark p-4">
              <p className="text-xs text-gray-300">剩餘可分配</p>
              <p
                className={`text-xl font-bold tabular-nums mt-1 ${
                  pool.remaining > 0 ? 'text-amber-300' : 'text-white'
                }`}
              >
                {pool.remaining} 套
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2">
            <span
              className={`inline-flex px-2 py-0.5 rounded-md text-xs font-semibold ${
                pool.status === 'fully_allocated'
                  ? 'bg-blue-800 text-white'
                  : pool.status === 'partially_allocated'
                    ? 'bg-amber-800/50 text-amber-200'
                    : 'bg-chip-dark text-white'
              }`}
            >
              {statusLabels[pool.status]}
            </span>
            {pool.poNumber && (
              <span className="text-xs text-gray-400">發貨號碼：{pool.poNumber}</span>
            )}
          </div>
        </div>

        {canAllocate && (
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
            {!showAllocateForm ? (
              <button
                type="button"
                onClick={() => setShowAllocateForm(true)}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg"
              >
                分配入庫
              </button>
            ) : (
              <form onSubmit={handleAllocate} className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-200">分配入庫</h2>
                {error && <div className="msg-error px-4 py-3 rounded-lg text-sm">{error}</div>}
                <p className="text-xs text-gray-400">
                  剩餘 {pool.remaining} 套可分配，分配後將加入總經銷商庫存（僅填總數量）
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">分配數量（套）</label>
                  <input
                    type="number"
                    min="1"
                    max={pool.remaining}
                    value={allocQuantity}
                    onChange={(e) => setAllocQuantity(parseInt(e.target.value) || 0)}
                    className="w-32 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={allocating}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
                  >
                    {allocating ? '分配中...' : '確認分配'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAllocateForm(false);
                      setError('');
                    }}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg"
                  >
                    取消
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <h2 className="text-lg font-semibold text-gray-200 mb-4">分配記錄</h2>
          {allocations.length === 0 ? (
            <p className="text-gray-400 text-sm">尚無分配記錄</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-600">
                  <th className="px-4 py-2 text-left text-xs text-gray-400">產品</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-400">數量</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-400">單位成本</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-400">小計</th>
                  <th className="px-4 py-2 text-left text-xs text-gray-400">分配時間</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {allocations.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2 text-txt-secondary">{a.productName}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{a.quantity}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      USD {a.unitCost.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      USD {a.total.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-gray-400 text-xs">
                      {a.createdAt
                        ? new Date(a.createdAt).toLocaleString('zh-TW')
                        : '—'}
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
