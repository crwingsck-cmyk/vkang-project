'use client';

import { useState } from 'react';
import Link from 'next/link';

type Feature = {
  badge: string;
  badgeColor: string;
  title: string;
  desc: string;
  detail: string;
  tags: string[];
  href: string;
};

const features: Feature[] = [
  {
    badge: 'CATALOG',
    badgeColor: 'text-info bg-info/10 border-info/20',
    title: 'Product Management',
    desc: 'Centralize your entire product catalog — SKUs, pricing tiers, cost tracking, and batch operations.',
    detail: 'Define and manage every product in your distribution network. Each item carries a unique SKU, multiple price tiers (unit, bulk, promo), cost basis, and category classification. Batch import and export let you scale your catalog without manual data entry. Search and filter across thousands of items instantly.',
    tags: ['SKU Tracking', 'Batch Create', 'Price Tiers', 'Cost Analysis'],
    href: '/products',
  },
  {
    badge: 'ORDERS',
    badgeColor: 'text-accent-text bg-accent-muted border-accent/20',
    title: 'Order Management',
    desc: 'Create, assign, and track orders through their full lifecycle with configurable status workflows.',
    detail: 'Orders flow from creation through fulfillment with clear status transitions: Pending → Processing → Completed or Cancelled. Admins can assign orders between stockists and customers. Each order records line items, quantities, pricing, tax, and grand totals. Full order history is accessible at any time.',
    tags: ['Full Lifecycle', 'Multi-status', 'Line Items', 'Role-based'],
    href: '/orders',
  },
  {
    badge: 'FINANCE',
    badgeColor: 'text-warning bg-warning/10 border-warning/20',
    title: 'Financial Reports',
    desc: 'Automatic income and expense calculation with itemized transaction records and P&L visibility.',
    detail: 'Every transaction — order payments, inventory purchases, adjustments — is logged as a financial record. The system auto-categorizes income vs. expenses and generates running totals. Admins can review financial summaries by period, filter by type, and export records for external accounting.',
    tags: ['Auto P&L', 'Transactions', 'Audit Trail', 'Export'],
    href: '/financials',
  },
  {
    badge: 'OPS',
    badgeColor: 'text-error bg-error/10 border-error/20',
    title: 'Warehouse Operations',
    desc: 'Manage cross-warehouse transfers, inter-warehouse loans, and inventory reconciliation from one hub.',
    detail: 'Coordinate multi-location logistics without losing visibility. Transfer stock between warehouses with full traceability. Issue and track inter-warehouse loans with return deadlines. Run periodic reconciliation to match physical counts against system records and resolve discrepancies.',
    tags: ['Transfers', 'Loans', 'Reconciliation', 'Multi-location'],
    href: '/warehouse',
  },
  {
    badge: 'ACCESS',
    badgeColor: 'text-success bg-success/10 border-success/20',
    title: 'User Management',
    desc: 'Granular role-based access control separating Admin, Stockist, and Customer permission scopes.',
    detail: 'Three distinct roles govern what users can see and do. Admins have full system access. Stockists manage their own inventory and fulfill orders. Customers place orders and track their purchases. Each role sees only the data and actions relevant to their function, keeping the system clean and secure.',
    tags: ['Admin', 'Stockist', 'Customer', 'Permissions'],
    href: '/users',
  },
];

export default function FeatureCards() {
  const [selected, setSelected] = useState<Feature | null>(null);

  return (
    <>
      {/* Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {features.map((f) => (
          <div
            key={f.title}
            className="bg-surface-1 border border-border rounded-2xl p-5 flex flex-col gap-4 hover:border-border-strong hover:bg-surface-2 transition-all group relative"
          >
            {/* Badge row + eye button */}
            <div className="flex items-center justify-between">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-widest ${f.badgeColor}`}>
                {f.badge}
              </span>
              <button
                onClick={() => setSelected(f)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-txt-subtle hover:text-txt-primary hover:bg-surface-3 transition-colors opacity-0 group-hover:opacity-100"
                title="View details"
              >
                {/* Eye icon */}
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>

            {/* Title + Description */}
            <div className="flex-1">
              <h3 className="text-base font-bold text-txt-primary mb-2 leading-snug group-hover:text-accent-text transition-colors">
                {f.title}
              </h3>
              <p className="text-xs text-txt-secondary leading-relaxed line-clamp-3">
                {f.desc}
              </p>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5">
              {f.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-1 rounded-full text-[10px] font-medium text-txt-subtle border border-border bg-surface-2"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Modal — expanded detail view */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-md bg-surface-1 border border-border-strong rounded-2xl p-6 shadow-2xl flex flex-col gap-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-widest ${selected.badgeColor}`}>
                {selected.badge}
              </span>
              <button
                onClick={() => setSelected(null)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-txt-subtle hover:text-txt-primary hover:bg-surface-2 transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            {/* Title */}
            <h2 className="text-xl font-bold text-txt-primary leading-snug">
              {selected.title}
            </h2>

            {/* Full detail */}
            <p className="text-sm text-txt-secondary leading-relaxed">
              {selected.detail}
            </p>

            {/* All tags */}
            <div className="flex flex-wrap gap-2">
              {selected.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 rounded-full text-xs font-medium text-txt-subtle border border-border bg-surface-2"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* CTA */}
            <Link
              href="/auth/login"
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-surface-3 hover:bg-accent hover:text-white text-txt-primary font-semibold text-sm rounded-xl border border-border hover:border-accent transition-all"
              onClick={() => setSelected(null)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
              Sign in to explore
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
