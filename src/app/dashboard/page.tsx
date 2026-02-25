'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProductService } from '@/services/database/products';
import { UserService } from '@/services/database/users';
import { InventoryService } from '@/services/database/inventory';
import { OrderService } from '@/services/database/orders';
import { FinancialService } from '@/services/database/financials';
import {
  UserRole,
  TransactionStatus,
  TransactionType,
  InventoryStatus,
  FinancialType,
  Transaction,
} from '@/types/models';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default function DashboardPage() {
  const { user, role, isLoading, isAuthenticated } = useAuth();
  const [stats, setStats] = useState<Record<string, number | string>>({});
  const [recentOrders, setRecentOrders] = useState<Transaction[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (user?.id && role) loadStats();
  }, [user?.id, role]);

  async function loadStats() {
    setStatsLoading(true);
    try {
      if (role === UserRole.ADMIN) {
        const [products, stockists, orders, financials] = await Promise.all([
          ProductService.getAll(),
          UserService.getStockists(),
          OrderService.getAll(50),
          FinancialService.getAll(200),
        ]);
        const pendingOrders = orders.filter((o) => o.status === TransactionStatus.PENDING).length;
        const income = financials
          .filter((f) => f.type === FinancialType.INCOME)
          .reduce((s, f) => s + f.amount, 0);
        setStats({
          totalProducts: products.length,
          activeStockists: stockists.filter((s) => s.isActive).length,
          monthlyRevenue: `USD ${income.toFixed(0)}`,
          pendingOrders,
        });
        setRecentOrders(orders.slice(0, 5));

      } else if (role === UserRole.STOCKIST && user?.id) {
        const [inventory, orders] = await Promise.all([
          InventoryService.getByUser(user.id),
          OrderService.getByFromUser(user.id, 20),
        ]);
        const invValue = inventory.reduce((s, i) => s + i.cost * i.quantityOnHand, 0);
        const lowStock = inventory.filter(
          (i) => i.status === InventoryStatus.LOW_STOCK || i.status === InventoryStatus.OUT_OF_STOCK
        ).length;
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const recentSales = orders
          .filter((o) => o.transactionType === TransactionType.SALE && (o.createdAt ?? 0) > thirtyDaysAgo)
          .reduce((s, o) => s + o.totals.grandTotal, 0);
        setStats({
          inventoryValue: `USD ${invValue.toFixed(0)}`,
          lowStockItems: lowStock,
          recentSales: `USD ${recentSales.toFixed(0)}`,
        });
        setRecentOrders(orders.slice(0, 5));

      } else if (role === UserRole.CUSTOMER && user?.id) {
        const orders = await OrderService.getByToUser(user.id, 20);
        const activeOrders = orders.filter((o) => o.status === TransactionStatus.PENDING).length;
        const totalPurchased = orders
          .filter((o) => o.status === TransactionStatus.COMPLETED)
          .reduce((s, o) => s + o.totals.grandTotal, 0);
        setStats({
          activeOrders,
          totalPurchased: `USD ${totalPurchased.toFixed(0)}`,
        });
        setRecentOrders(orders.slice(0, 5));

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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard title="Total Products"    value={String(stats.totalProducts ?? 0)}       textColor="text-info"    bgClass="bg-blue-50 border-blue-200" />
              <StatCard title="Active Stockists"  value={String(stats.activeStockists ?? 0)}      textColor="text-success" bgClass="bg-green-50 border-green-200" />
              <StatCard title="Total Revenue"     value={String(stats.monthlyRevenue ?? 'USD 0')} textColor="text-accent-text" bgClass="bg-amber-50 border-amber-200" />
              <StatCard title="Pending Orders"    value={String(stats.pendingOrders ?? 0)}        textColor="text-warning" bgClass="bg-cyan-50 border-cyan-200" />
            </div>
          )}
          {role === UserRole.STOCKIST && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <StatCard title="Inventory Value"    value={String(stats.inventoryValue ?? 'USD 0')} textColor="text-info"    bgClass="bg-blue-50 border-blue-200" />
              <StatCard title="Low / Out of Stock" value={String(stats.lowStockItems ?? 0)}        textColor="text-warning" bgClass="bg-amber-50 border-amber-200" />
              <StatCard title="Sales (30d)"        value={String(stats.recentSales ?? 'USD 0')}    textColor="text-success" bgClass="bg-green-50 border-green-200" />
            </div>
          )}
          {role === UserRole.CUSTOMER && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <StatCard title="Active Orders"   value={String(stats.activeOrders ?? 0)}           textColor="text-info"    bgClass="bg-blue-50 border-blue-200" />
              <StatCard title="Total Purchased" value={String(stats.totalPurchased ?? 'USD 0')}   textColor="text-success" bgClass="bg-green-50 border-green-200" />
            </div>
          )}
        </>
      )}

      {/* Quick Actions */}
      <div className="glass-card p-5">
        <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-3">Quick Actions</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <ActionButton href="/products"   label="Products" />
          <ActionButton href="/orders"     label="Orders" />
          {role === UserRole.ADMIN        && <ActionButton href="/users"      label="Users" />}
          {role !== UserRole.CUSTOMER && <ActionButton href="/financials" label="Financials" />}
          {role !== UserRole.CUSTOMER && <ActionButton href="/warehouse"  label="Warehouse" />}
          <ActionButton href="/settings"   label="Settings" />
        </div>
      </div>

      {/* Recent Orders */}
      <div className="glass-panel overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
          <p className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">
            Recent Orders
          </p>
          <Link
            href="/orders"
            className="text-xs text-accent-text hover:text-accent transition-colors font-medium"
          >
            View all →
          </Link>
        </div>

        {statsLoading ? (
          <div className="p-6 text-txt-subtle text-center text-sm">Loading...</div>
        ) : recentOrders.length === 0 ? (
          <div className="p-10 text-txt-subtle text-center text-sm">
            No orders yet.{' '}
            <Link href="/orders/create-bulk" className="text-accent-text hover:underline">建立訂單</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-base">
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">日期</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">發貨號碼</th>
                <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Type</th>
                <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Total</th>
                <th className="px-5 py-2.5 text-center text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-muted">
              {recentOrders.map((order) => (
                <tr key={order.id} className="hover:bg-surface-2 transition-colors group">
                  <td className="px-5 py-3 text-txt-subtle tabular-nums whitespace-nowrap">
                    {order.createdAt ? new Date(order.createdAt).toLocaleDateString('zh-TW') : '—'}
                  </td>
                  <td className="px-5 py-3 font-mono text-xs">
                    <Link href={`/orders/${order.id}`} className="text-accent-text hover:underline">
                      {order.id}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-txt-secondary capitalize">{order.transactionType}</td>
                  <td className="px-5 py-3 text-txt-primary text-right font-semibold tabular-nums">
                    USD {order.totals.grandTotal.toFixed(2)}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <StatusBadge status={order.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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

function StatusBadge({ status }: { status: TransactionStatus }) {
  const styles = {
[TransactionStatus.COMPLETED]: 'bg-chip-cyan text-gray-800 border border-cyan-200',
  [TransactionStatus.CANCELLED]: 'bg-chip-dark text-white border border-chip-dark',
  [TransactionStatus.PENDING]:   'bg-chip-yellow text-gray-800 border border-amber-200',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${styles[status] ?? 'bg-surface-2 text-txt-subtle'}`}>
      {status}
    </span>
  );
}
