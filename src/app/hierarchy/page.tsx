'use client';

import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserRole } from '@/types/models';
import UserHierarchyTree from '@/components/users/UserHierarchyTree';

export default function HierarchyPage() {
  useAuth();

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold text-txt-primary tracking-tight">Multi-tier distribution structure</h1>
          <p className="text-sm text-txt-subtle mt-0.5">Master distributor → downlines → sub-downlines. Click name for details.</p>
        </div>
        <UserHierarchyTree />
      </div>
    </ProtectedRoute>
  );
}
