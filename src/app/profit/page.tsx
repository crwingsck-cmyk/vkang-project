'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { UserRole } from '@/types/models';

export default function ProfitIndexPage() {
  const [users, setUsers] = useState<{ id: string; displayName: string; role: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    UserService.getAll().then((list) => {
      setUsers(list as { id: string; displayName: string; role: string }[]);
      setLoading(false);
    });
  }, []);

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-txt-primary tracking-tight">盈利表</h1>
        <p className="text-base text-txt-subtle">選擇經銷商查看其收入、支出與盈利</p>

        {loading ? (
          <div className="py-8">載入中...</div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {users.map((u) => (
              <Link
                key={u.id}
                href={`/profit/${u.id}`}
                className="block p-4 rounded-xl border border-gray-200 bg-white hover:border-accent hover:bg-accent/5 transition-colors"
              >
                <p className="font-semibold text-gray-900">{u.displayName}</p>
                <p className="text-sm text-txt-subtle mt-0.5">
                  {u.role === UserRole.STOCKIST ? '經銷商' : u.role === UserRole.ADMIN ? '管理員' : '顧客'}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
