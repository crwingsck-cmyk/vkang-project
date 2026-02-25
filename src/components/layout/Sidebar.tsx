'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { label: 'Dashboard',  href: '/dashboard',  roles: ['ADMIN', 'STOCKIST', 'CUSTOMER', 'TAIWAN'] },
  { label: 'Products',   href: '/products',   roles: ['ADMIN', 'STOCKIST'] },
  { label: 'Users',      href: '/users',      roles: ['ADMIN'] },
  { label: 'Stockists',  href: '/stockists',  roles: ['ADMIN'] },
  { label: 'Orders',     href: '/orders',     roles: ['ADMIN', 'STOCKIST', 'CUSTOMER'] },
  { label: 'Warehouse',  href: '/warehouse',  roles: ['ADMIN', 'STOCKIST'] },
  { label: 'Financials', href: '/financials', roles: ['ADMIN', 'STOCKIST'] },
  { label: 'Settings',   href: '/settings',   roles: ['ADMIN', 'STOCKIST', 'CUSTOMER', 'TAIWAN'] },
];

export function Sidebar() {
  const { role, isAuthenticated } = useAuth();
  const pathname = usePathname();

  if (!isAuthenticated || !role) return null;

  const visibleItems = NAV_ITEMS.filter((item) => item.roles.includes(role));

  return (
    <aside className="w-52 border-r border-border bg-surface-base hidden sm:flex sm:flex-col shrink-0">
      <nav className="p-2 space-y-0.5 flex-1 pt-3">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href || (pathname?.startsWith(item.href + '/') ?? false);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={
                isActive
                  ? 'flex items-center gap-2.5 px-3 py-2 rounded-md bg-accent/10 text-accent-text text-sm font-medium border-l-2 border-accent'
                  : 'flex items-center gap-2.5 px-3 py-2 rounded-md text-txt-secondary hover:bg-surface-2 hover:text-txt-primary text-sm transition-colors border-l-2 border-transparent'
              }
            >
              <span className={`w-1 h-1 rounded-full flex-shrink-0 ${isActive ? 'bg-accent-text' : 'bg-txt-subtle'}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
