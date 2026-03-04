'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { UserRole } from '@/types/models';

function matchTanSunSun(displayName: string): boolean {
  const normalized = (displayName ?? '').toLowerCase().replace(/\s+/g, '');
  return normalized === 'tansunsun' || normalized.includes('tansunsun');
}

export default function ProfitIndexPage() {
  const router = useRouter();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    UserService.getAll().then((list) => {
      const tanSunSun = list.find((u) => matchTanSunSun(u.displayName ?? ''));
      if (tanSunSun?.id) {
        router.replace(`/profit/${tanSunSun.id}`);
      } else {
        setNotFound(true);
      }
    });
  }, [router]);

  if (notFound) {
    return (
      <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
        <div className="space-y-6 py-12 text-center">
          <h1 className="text-3xl font-bold text-txt-primary tracking-tight">Profit Report</h1>
          <p className="text-txt-subtle">TAN SUN SUN not found. Please create this user in User Management first.</p>
          <Link href="/users" className="text-accent-text hover:underline">Go to User Management →</Link>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-6 py-12 text-center">
        <h1 className="text-3xl font-bold text-txt-primary tracking-tight">Profit Report</h1>
        <p className="text-txt-subtle">Loading TAN SUN SUN income & expense report...</p>
      </div>
    </ProtectedRoute>
  );
}
