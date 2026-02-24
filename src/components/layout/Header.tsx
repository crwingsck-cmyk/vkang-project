'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

export function Header() {
  const { user, logout, isAuthenticated } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/auth/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface-1/95 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center space-x-2.5">
          <div className="w-7 h-7 bg-chip-dark rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">V</span>
          </div>
          <span className="text-sm font-semibold text-txt-primary tracking-tight">Vkang ERP</span>
        </Link>

        {/* User section */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-medium text-txt-primary leading-tight name-lowercase">{user?.displayName}</p>
            <p className="text-[10px] text-txt-subtle uppercase tracking-widest leading-tight">{user?.role}</p>
          </div>
          <div className="w-7 h-7 rounded-full bg-chip-dark flex items-center justify-center text-white font-semibold text-xs">
            {user?.displayName?.charAt(0)?.toUpperCase() ?? 'U'}
          </div>
          <button
            onClick={handleLogout}
            className="px-2.5 py-1 text-xs font-medium text-txt-secondary hover:text-txt-primary border border-border hover:border-border-strong rounded-md transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}
