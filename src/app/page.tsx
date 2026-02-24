import Link from 'next/link';
import FeatureCards from './FeatureCards';

export default function Home() {
  return (
    <main className="min-h-screen bg-surface-base text-txt-primary">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-accent rounded-lg flex items-center justify-center shadow-lg shadow-accent/25">
            <span className="text-white font-bold text-xs">V</span>
          </div>
          <span className="text-sm font-semibold text-txt-primary tracking-tight">
            Vkang <span className="text-accent-text">ERP</span>
          </span>
        </div>
        <Link
          href="/auth/login"
          className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition-colors"
        >
          Sign In
        </Link>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-6 py-24">
        <div className="inline-block px-3 py-1 mb-6 text-[10px] font-semibold tracking-[0.15em] text-accent-text bg-accent-muted border border-accent/20 rounded-full uppercase">
          Procurement · Inventory · Sales Platform
        </div>
        <h1 className="text-5xl sm:text-6xl font-extrabold text-txt-primary leading-tight mb-6">
          Manage Your Operations<br />
          <span className="text-accent-text">Smarter &amp; Clearer</span>
        </h1>
        <p className="max-w-xl text-base text-txt-secondary mb-10 leading-relaxed">
          Vkang ERP unifies products, inventory, orders, and financials — giving you
          real-time data to drive smarter business decisions.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/auth/login"
            className="px-8 py-2.5 bg-accent hover:bg-accent-hover text-white font-semibold rounded-xl transition-colors text-sm"
          >
            Sign In
          </Link>
          <Link
            href="/auth/register"
            className="px-8 py-2.5 bg-surface-2 hover:bg-surface-3 text-txt-secondary hover:text-txt-primary font-semibold rounded-xl border border-border hover:border-border-strong transition-colors text-sm"
          >
            Create Account
          </Link>
        </div>
      </section>

      {/* Feature Cards */}
      <section className="px-6 pb-24">
        <div className="max-w-5xl mx-auto">
          <p className="text-center text-[10px] font-semibold text-txt-subtle uppercase tracking-widest mb-10">
            Core Features
          </p>
          <FeatureCards />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-6 text-center text-xs text-txt-subtle">
        © {new Date().getFullYear()} Vkang ERP · Firebase + Next.js
      </footer>
    </main>
  );
}
