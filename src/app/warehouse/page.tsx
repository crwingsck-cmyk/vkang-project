'use client';

import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserRole } from '@/types/models';
import Link from 'next/link';

const hubItems = [
  {
    href: '/warehouse/transfers',
    badge: 'TRANSFER',
    badgeColor: 'text-info bg-info/10 border-info/20',
    title: 'Warehouse Transfers',
    desc: 'Transfer inventory between warehouse locations with full traceability.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
      </svg>
    ),
    roles: ['ADMIN', 'STOCKIST'],
  },
  {
    href: '/warehouse/loans',
    badge: 'LOANS',
    badgeColor: 'text-accent-text bg-accent-muted border-accent/20',
    title: 'Inter-Warehouse Loans',
    desc: 'Manage inventory loans and returns between locations with due dates.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
    ),
    roles: ['ADMIN', 'STOCKIST'],
  },
  {
    href: '/warehouse/config',
    badge: 'CONFIG',
    badgeColor: 'text-warning bg-warning/10 border-warning/20',
    title: 'Warehouse Configuration',
    desc: 'Manage warehouse locations, zones, and operational settings.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
      </svg>
    ),
    roles: ['ADMIN'],
  },
  {
    href: '/warehouse/reconciliation',
    badge: 'RECONCILE',
    badgeColor: 'text-success bg-success/10 border-success/20',
    title: 'Stock Reconciliation',
    desc: 'Verify physical counts against system records and resolve discrepancies.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    ),
    roles: ['ADMIN'],
  },
];

export default function WarehousePage() {
  const { role } = useAuth();

  const visibleItems = hubItems.filter((item) => item.roles.includes(role || ''));

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
      <div className="space-y-5">

        {/* Page Header */}
        <div>
          <h1 className="text-xl font-bold text-txt-primary tracking-tight">Warehouse Management</h1>
          <p className="text-sm text-txt-subtle mt-0.5">Manage transfers and multi-warehouse operations</p>
        </div>

        {/* Hub Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {visibleItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group bg-surface-1 border border-border rounded-2xl p-5 flex flex-col gap-4 hover:border-border-strong hover:bg-surface-2 transition-all"
            >
              {/* Badge + Icon */}
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-widest ${item.badgeColor}`}>
                  {item.badge}
                </span>
                <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-surface-2 text-txt-subtle group-hover:text-txt-primary group-hover:bg-surface-3 transition-colors">
                  {item.icon}
                </div>
              </div>

              {/* Title + Desc */}
              <div>
                <h2 className="text-sm font-bold text-txt-primary mb-1.5 group-hover:text-accent-text transition-colors">
                  {item.title}
                </h2>
                <p className="text-xs text-txt-secondary leading-relaxed">
                  {item.desc}
                </p>
              </div>

              {/* Arrow hint */}
              <div className="flex items-center gap-1 text-[10px] font-medium text-txt-subtle group-hover:text-accent-text transition-colors">
                <span>Open</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
                </svg>
              </div>
            </Link>
          ))}
        </div>

        {/* Quick Stats */}
        <div className="bg-surface-1 rounded-xl border border-border p-5">
          <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-4">Quick Stats</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1">Warehouses</p>
              <p className="text-2xl font-bold tabular-nums text-txt-primary">3</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1">Active Transfers</p>
              <p className="text-2xl font-bold tabular-nums text-info">2</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-1">Pending Loans</p>
              <p className="text-2xl font-bold tabular-nums text-accent-text">1</p>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
