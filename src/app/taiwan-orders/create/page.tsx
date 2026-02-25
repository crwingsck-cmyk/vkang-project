'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { getCurrentToken } from '@/services/firebase/auth';
import { UserRole } from '@/types/models';
import Link from 'next/link';

export default function CreateTaiwanOrderPage() {
  const router = useRouter();
  const { user, firebaseUser } = useAuth();
  const [totalOrdered, setTotalOrdered] = useState(100);
  const [poNumber, setPoNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!user?.id && !firebaseUser?.uid) {
      setError('請先登入');
      return;
    }
    if (totalOrdered <= 0) {
      setError('訂購數量須大於 0');
      return;
    }

    const token = await getCurrentToken();
    if (!token) {
      setError('請重新登入後再試');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/taiwan-orders/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          totalOrdered,
          poNumber: poNumber.trim() || undefined,
          notes: notes.trim() || undefined,
          userName: user?.displayName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '建立失敗');
      }
      router.push('/taiwan-orders');
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/taiwan-orders" className="text-gray-400 hover:text-gray-200 text-sm">
            &larr; 返回台灣訂單
          </Link>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-gray-900">向台灣訂貨</h1>
          <p className="text-gray-400 mt-1">
            僅填寫數量，不指定產品。待下線有明確需求時，再從此訂單池分配產品入庫。
          </p>
        </div>

        {error && (
          <div className="msg-error px-4 py-3 rounded-lg">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                訂購數量（套） <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={totalOrdered}
                onChange={(e) => setTotalOrdered(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">1 套 = 1 單位，之後可分配至任一產品</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">台灣發貨號碼</label>
              <input
                type="text"
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="選填，拿到台灣發貨號碼後可填"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">備註</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="選填"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium"
            >
              {saving ? '建立中...' : '建立台灣訂單'}
            </button>
            <Link
              href="/taiwan-orders"
              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg font-medium"
            >
              取消
            </Link>
          </div>
        </form>
      </div>
    </ProtectedRoute>
  );
}
