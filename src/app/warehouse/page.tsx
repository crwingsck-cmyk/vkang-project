'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserRole, TransactionStatus, TransactionType } from '@/types/models';
import { UserService } from '@/services/database/users';
import { OrderService } from '@/services/database/orders';
import Link from 'next/link';

const hubItems = [
  {
    href: '/warehouse/transfers',
    badge: 'DISPATCH',
    badgeColor: 'text-blue-700 bg-blue-100 border-blue-200',
    cardBg: 'bg-blue-50 border-blue-200 hover:bg-blue-100',
    title: 'Manual Dispatch',
    desc: 'Manually dispatch inventory to downlines.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
      </svg>
    ),
    roles: ['ADMIN', 'STOCKIST'],
  },
  {
    href: '/warehouse/swap',
    badge: 'SWAP',
    badgeColor: 'text-teal-700 bg-teal-100 border-teal-200',
    cardBg: 'bg-teal-50 border-teal-200 hover:bg-teal-100',
    title: 'Product Swap',
    desc: 'Exchange products between two parties simultaneously. Both sides update at once.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 16V4m0 0L3 8m4-4 4 4"/><path d="M17 8v12m0 0 4-4m-4 4-4-4"/>
      </svg>
    ),
    roles: ['ADMIN', 'STOCKIST'],
  },
  {
    href: '/warehouse/loans',
    badge: 'LOANS',
    badgeColor: 'text-violet-700 bg-violet-100 border-violet-200',
    cardBg: 'bg-violet-50 border-violet-200 hover:bg-violet-100',
    title: 'Inter-Warehouse Loans',
    desc: 'Manage inventory loans and returns between locations with due dates.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
      </svg>
    ),
    roles: ['ADMIN', 'STOCKIST'],
  },
  {
    href: '/warehouse/config',
    badge: 'CONFIG',
    badgeColor: 'text-amber-700 bg-amber-100 border-amber-200',
    cardBg: 'bg-amber-50 border-amber-200 hover:bg-amber-100',
    title: 'Warehouse Configuration',
    desc: 'Manage warehouse locations, zones, and operational settings.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
      </svg>
    ),
    roles: [],
  },
  {
    href: '/warehouse/reconciliation',
    badge: 'RECONCILE',
    badgeColor: 'text-green-700 bg-green-100 border-green-200',
    cardBg: 'bg-green-50 border-green-200 hover:bg-green-100',
    title: 'Stock Reconciliation',
    desc: 'Verify physical counts against system records and resolve discrepancies.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    ),
    roles: [],
  },
  {
    href: '/warehouse/product-conversion',
    badge: 'TR',
    badgeColor: 'text-white bg-purple-600 border-purple-700',
    cardBg: 'bg-purple-50 border-purple-200 hover:bg-purple-100',
    title: 'Product Conversion',
    desc: 'Convert placeholder SKUs (e.g. TEMP-PLACE-001) into real products. Supports one-to-many with quantity conservation.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 16V4m0 0L3 8m4-4 4 4"/><path d="M17 8v12m0 0 4-4m-4 4-4-4"/>
      </svg>
    ),
    roles: ['ADMIN', 'STOCKIST'],
  },
  {
    href: '/warehouse/stock-setup',
    badge: 'SETUP',
    badgeColor: 'text-orange-700 bg-orange-100 border-orange-200',
    cardBg: 'bg-orange-50 border-orange-200 hover:bg-orange-100',
    title: 'Opening Stock',
    desc: 'Set opening stock quantities for KL and Setia Alam. Use this before going live to record existing inventory.',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/>
        <path d="M7 7h.01"/>
      </svg>
    ),
    roles: ['ADMIN'],
  },
];

export default function WarehousePage() {
  const { user, role } = useAuth();
  const [warehouseCount, setWarehouseCount] = useState(0);
  const [activeTransfers, setActiveTransfers] = useState(0);
  const [pendingLoans, setPendingLoans] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      setLoading(true);
      try {
        const [stockists, transfers, loans] = await Promise.all([
          UserService.getStockists(),
          OrderService.getByType(TransactionType.TRANSFER),
          OrderService.getByType(TransactionType.LOAN),
        ]);
        setWarehouseCount(stockists.length);
        const transfersFiltered = role === UserRole.ADMIN
          ? transfers
          : transfers.filter((t) => t.fromUser?.userId === user?.id || t.toUser?.userId === user?.id);
        const loansFiltered = role === UserRole.ADMIN
          ? loans
          : loans.filter((t) => t.fromUser?.userId === user?.id || t.toUser?.userId === user?.id);
        setActiveTransfers(transfersFiltered.filter((t) => t.status === TransactionStatus.PENDING).length);
        setPendingLoans(loansFiltered.filter((l) => l.status === TransactionStatus.PENDING).length);
      } catch (err) {
        console.error('Error loading warehouse stats:', err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, [user?.id, role]);

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
              className={`group border rounded-2xl p-6 flex flex-col gap-4 transition-all ${item.cardBg}`}
            >
              {/* Badge + Icon */}
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center px-3 py-1 rounded-lg border text-sm font-bold uppercase tracking-widest ${item.badgeColor}`}>
                  {item.badge}
                </span>
                <div className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/60 text-gray-500 group-hover:text-gray-800 transition-colors">
                  {item.icon}
                </div>
              </div>

              {/* Title + Desc */}
              <div>
                <h2 className="text-lg font-bold text-gray-800 mb-2">
                  {item.title}
                </h2>
                <p className="text-base text-gray-600 leading-relaxed">
                  {item.desc}
                </p>
              </div>

              {/* Arrow hint */}
              <div className="flex items-center gap-1 text-sm font-medium text-gray-500 group-hover:text-gray-800 transition-colors">
                <span>Open</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
                </svg>
              </div>
            </Link>
          ))}
        </div>

        {/* Quick Stats */}
        <div className="inline-flex bg-gray-900 rounded-2xl p-4 gap-6">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">Warehouses</p>
            <p className="text-xl font-bold tabular-nums text-white">{loading ? '...' : warehouseCount}</p>
          </div>
          <div className="w-px bg-gray-700" />
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">Active Transfers</p>
            <p className="text-xl font-bold tabular-nums text-blue-400">{loading ? '...' : activeTransfers}</p>
          </div>
          <div className="w-px bg-gray-700" />
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-0.5">Pending Loans</p>
            <p className="text-xl font-bold tabular-nums text-violet-400">{loading ? '...' : pendingLoans}</p>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
