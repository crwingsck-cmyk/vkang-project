'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { User, UserRole } from '@/types/models';
import Link from 'next/link';
import UserHierarchyTree from '@/components/users/UserHierarchyTree';

type ViewMode = 'list' | 'hierarchy';

export default function UsersPage() {
  useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterRole, setFilterRole] = useState<UserRole | ''>('');

  useEffect(() => {
    loadUsers();
  }, [filterRole]);

  async function loadUsers() {
    try {
      setLoading(true);
      const data = filterRole
        ? await UserService.getByRole(filterRole as UserRole)
        : await UserService.getAll();
      setUsers(data);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  }

  const roleBadge: Record<UserRole, string> = {
    [UserRole.ADMIN]:    'bg-error/10 text-error border border-error/20',
    [UserRole.STOCKIST]: 'bg-info/10 text-info border border-info/20',
    [UserRole.CUSTOMER]: 'bg-success/10 text-success border border-success/20',
  };

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-5">

        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-txt-primary">User Management</h1>
            <p className="text-xs text-txt-subtle mt-0.5">Manage system users and permissions</p>
          </div>
          <Link
            href="/users/create"
            className="px-3.5 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition-colors"
          >
            + Add User
          </Link>
        </div>

        {/* View Mode Tabs */}
        <div className="flex gap-2 border-b border-border pb-2">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              viewMode === 'list'
                ? 'bg-surface-1 border border-border border-b-0 -mb-0.5 text-accent-text'
                : 'text-txt-subtle hover:text-txt-primary'
            }`}
          >
            列表
          </button>
          <button
            type="button"
            onClick={() => setViewMode('hierarchy')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              viewMode === 'hierarchy'
                ? 'bg-surface-1 border border-border border-b-0 -mb-0.5 text-accent-text'
                : 'text-txt-subtle hover:text-txt-primary'
            }`}
          >
            金三角架構
          </button>
        </div>

        {/* Toolbar - only for list view */}
        {viewMode === 'list' && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Role</span>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value as UserRole | '')}
              className="px-3 py-1.5 bg-surface-1 border border-border rounded-lg text-xs text-txt-primary focus:outline-none focus:border-accent"
            >
              <option value="">All Roles</option>
              <option value={UserRole.ADMIN}>Admin</option>
              <option value={UserRole.STOCKIST}>Stockist</option>
              <option value={UserRole.CUSTOMER}>Customer</option>
            </select>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <StatChip label="Total"     value={users.length}                                                  color="text-txt-primary" />
            <StatChip label="Admins"    value={users.filter((u) => u.role === UserRole.ADMIN).length}    color="text-error" />
            <StatChip label="Stockists" value={users.filter((u) => u.role === UserRole.STOCKIST).length} color="text-info" />
            <StatChip label="Customers" value={users.filter((u) => u.role === UserRole.CUSTOMER).length} color="text-success" />
          </div>
        </div>
        )}

        {/* Content */}
        {viewMode === 'hierarchy' ? (
          <UserHierarchyTree />
        ) : (
        /* Table */
        <div className="bg-surface-1 rounded-xl border border-border overflow-hidden">
          {loading ? (
            <div className="py-16 text-center">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3"></div>
              <p className="text-txt-subtle text-sm">Loading users...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-txt-subtle text-sm">No users found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-base">
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Name</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Email</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest w-28">Role</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Company</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest w-28">Phone</th>
                  <th className="px-5 py-2.5 text-center text-[10px] font-semibold text-txt-subtle uppercase tracking-widest w-24">Status</th>
                  <th className="px-5 py-2.5 text-center text-[10px] font-semibold text-txt-subtle uppercase tracking-widest w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {users.map((user) => (
                  <tr key={user.id || user.email} className="hover:bg-surface-2 transition-colors">
                    <td className="px-5 py-3 font-semibold text-txt-primary">{user.displayName}</td>
                    <td className="px-5 py-3 text-txt-secondary font-mono text-xs">{user.email}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${roleBadge[user.role as UserRole] || 'bg-gray-500/10 text-gray-400'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-txt-secondary">{user.company?.name || '—'}</td>
                    <td className="px-5 py-3 text-txt-subtle font-mono text-xs">{user.phoneNumber || '—'}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${
                        user.isActive
                          ? 'bg-success/10 text-success border border-success/20'
                          : 'bg-error/10 text-error border border-error/20'
                      }`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      {user.role === UserRole.STOCKIST && (
                        <Link
                          href={`/stockists/${user.id || user.email}`}
                          className="inline-flex px-2.5 py-1 text-[10px] font-semibold bg-accent/20 hover:bg-accent/30 text-accent-text border border-accent/40 rounded-md transition-colors uppercase tracking-wider mr-1"
                        >
                          營運
                        </Link>
                      )}
                      <Link
                        href={`/users/${user.id || user.email}`}
                        className="inline-flex px-2.5 py-1 text-[10px] font-semibold bg-surface-2 hover:bg-surface-3 text-txt-secondary hover:text-txt-primary border border-border rounded-md transition-colors uppercase tracking-wider"
                      >
                        修改
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        )}

      </div>
    </ProtectedRoute>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-1 border border-border rounded-lg">
      <span className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}
