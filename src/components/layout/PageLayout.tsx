'use client';

import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { useAuth } from '@/context/AuthContext';

interface PageLayoutProps {
  children: React.ReactNode;
}

export function PageLayout({ children }: PageLayoutProps) {
  const { isAuthenticated, isLoading } = useAuth();

  if (!isAuthenticated || isLoading) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col h-screen bg-surface-base">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto relative bg-white">
          <div className="px-6 py-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
