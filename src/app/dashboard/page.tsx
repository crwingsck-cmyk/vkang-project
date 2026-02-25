'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProductService } from '@/services/database/products';
import { UserService } from '@/services/database/users';
import { InventoryService } from '@/services/database/inventory';
import { FinancialService } from '@/services/database/financials';
import { UserRole, InventoryStatus, FinancialType } from '@/types/models';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default function DashboardPage() {
  const { user, role, isLoading, isAuthenticated } = useAuth();
  const [stats, setStats] = useState<Record<string, number | string>>({});
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (user?.id && role) loadStats();
  }, [user?.id, role]);

  async function loadStats() {
    setStatsLoading(true);
    try {
      if (role === UserRole.ADMIN) {
        const [products, stockists, financials] = await Promise.all([
          ProductService.getAll(),
          UserService.getStockists(),
          FinancialService.getAll(200),
        ]);
        const income = financials
          .filter((f) => f.type === FinancialType.INCOME)
          .reduce((s, f) => s + f.amount, 0);
        setStats({
          totalProducts: products.length,
          activeStockists: stockists.filter((s) => s.isActive).length,
          monthlyRevenue: `USD ${income.toFixed(0)}`,
        });

      } else if (role === UserRole.STOCKIST && user?.id) {
        const inventory = await InventoryService.getByUser(user.id);
        const invValue = inventory.reduce((s, i) => s + i.cost * i.quantityOnHand, 0);
        const lowStock = inventory.filter(
          (i) => i.status === InventoryStatus.LOW_STOCK || i.status === InventoryStatus.OUT_OF_STOCK
        ).length;
        setStats({
          inventoryValue: `USD ${invValue.toFixed(0)}`,
          lowStockItems: lowStock,
        });

      } else if (role === UserRole.CUSTOMER && user?.id) {
        setStats({});
      }
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setStatsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-accent"></div>
          <p className="mt-3 text-txt-subtle text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    redirect('/auth/login');
  }

  return (
    <div className="space-y-5">
      {/* Welcome Banner — subtle gradient, not overwhelming */}
      <div className="glass-card p-6">
        <p className="text-[10px] font-semibold text-accent-text uppercase tracking-[0.15em] mb-1">
          {role === UserRole.ADMIN    && 'Administrator Dashboard'}
          {role === UserRole.STOCKIST && 'Stockist Console'}
          {role === UserRole.CUSTOMER && 'Customer Portal'}
        </p>
        <h1 className="text-2xl font-bold text-txt-primary">
          Welcome back, <span className="text-accent-text name-lowercase">{user?.displayName}</span>
        </h1>
      </div>

      {/* Stats */}
      {statsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card p-5 animate-pulse">
              <div className="h-2.5 bg-surface-2 rounded w-20 mb-4"></div>
              <div className="h-7 bg-surface-2 rounded w-16"></div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {role === UserRole.ADMIN && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StatCard title="Total Products"    value={String(stats.totalProducts ?? 0)}       textColor="text-info"    bgClass="bg-blue-50 border-blue-200" />
              <StatCard title="Active Stockists"  value={String(stats.activeStockists ?? 0)}      textColor="text-success" bgClass="bg-green-50 border-green-200" />
              <StatCard title="Total Revenue"     value={String(stats.monthlyRevenue ?? 'USD 0')} textColor="text-accent-text" bgClass="bg-amber-50 border-amber-200" />
            </div>
          )}
          {role === UserRole.STOCKIST && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <StatCard title="Inventory Value"    value={String(stats.inventoryValue ?? 'USD 0')} textColor="text-info"    bgClass="bg-blue-50 border-blue-200" />
              <StatCard title="Low / Out of Stock" value={String(stats.lowStockItems ?? 0)}        textColor="text-warning" bgClass="bg-amber-50 border-amber-200" />
            </div>
          )}
          {role === UserRole.CUSTOMER && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <StatCard title="Welcome" value="Customer Portal" textColor="text-info" bgClass="bg-blue-50 border-blue-200" />
            </div>
          )}
        </>
      )}

      {/* Quick Actions */}
      <div className="glass-card p-5">
        <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <ActionButton href="/products"   label="Products" />
          {role === UserRole.ADMIN        && <ActionButton href="/users"      label="Users" />}
          {role !== UserRole.CUSTOMER && <ActionButton href="/financials" label="Financials" />}
          {role !== UserRole.CUSTOMER && <ActionButton href="/warehouse"  label="Warehouse" />}
          <ActionButton href="/settings"   label="Settings" />
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, textColor, bgClass }: { title: string; value: string; textColor: string; bgClass?: string }) {
  return (
    <div className={`p-5 rounded-xl border shadow-sm transition-colors ${bgClass ?? 'bg-surface-1 border-border'}`}>
      <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-2">{title}</p>
      <p className={`text-2xl font-bold tabular-nums ${textColor}`}>{value}</p>
    </div>
  );
}

function ActionButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="bg-surface-2 hover:bg-surface-3 border border-border hover:border-border-strong rounded-lg px-3 py-2.5 text-center block transition-all"
    >
      <p className="text-txt-secondary hover:text-txt-primary font-medium text-xs">{label}</p>
    </Link>
  );
}
