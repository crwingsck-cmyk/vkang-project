'use client';

import { useState, useEffect, useCallback } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PaymentReceiptService } from '@/services/database/paymentReceipts';
import { FinancialService } from '@/services/database/financials';
import { PaymentReceipt, PaymentReceiptStatus, Financial, FinancialType, UserRole } from '@/types/models';

// ─── helpers ─────────────────────────────────────────────────────────────────

function monthKey(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string): string {
  if (!key) return '';
  const [y, m] = key.split('-');
  return `${y} 年 ${Number(m)} 月`;
}

/** Generate a list of month keys covering the range of data, newest first */
function buildMonthOptions(items: { createdAt?: number }[]): string[] {
  const keys = new Set(items.map((i) => monthKey(i.createdAt)).filter(Boolean));
  return Array.from(keys).sort().reverse();
}

interface ExpenseRow {
  category: string;
  description: string;
  amount: number;
  date: number;
}

interface RevenueRow {
  receiptNo: string;
  customerName: string;
  deliveryNotes: string;
  amount: number;
  date: number;
}

// ─── component ───────────────────────────────────────────────────────────────

export default function FinancialReportPage() {
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [financials, setFinancials] = useState<Financial[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<string>('');
  const [showDetail, setShowDetail] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pr, fin] = await Promise.all([
        PaymentReceiptService.getAll(500),
        FinancialService.getAll(500),
      ]);
      setReceipts(pr);
      setFinancials(fin);
      // Default to latest month with data
      const allItems = [
        ...pr.map((r) => ({ createdAt: r.createdAt })),
        ...fin.map((f) => ({ createdAt: f.createdAt })),
      ];
      const opts = buildMonthOptions(allItems);
      if (opts.length > 0) setPeriod(opts[0]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Filter to selected period ──────────────────────────────────────────────
  const approvedReceipts = receipts.filter(
    (r) => r.status === PaymentReceiptStatus.APPROVED && monthKey(r.createdAt) === period
  );
  const periodExpenses = financials.filter(
    (f) => f.type === FinancialType.EXPENSE && monthKey(f.createdAt) === period
  );

  // ── Revenue rows ───────────────────────────────────────────────────────────
  const revenueRows: RevenueRow[] = approvedReceipts.map((r) => ({
    receiptNo: r.receiptNo,
    customerName: r.customerName,
    deliveryNotes: r.items.map((i) => i.deliveryNoteNo).join(', '),
    amount: r.totalAmount,
    date: r.createdAt ?? 0,
  }));

  // ── Expense rows ───────────────────────────────────────────────────────────
  const expenseRows: ExpenseRow[] = periodExpenses.map((f) => ({
    category: f.category,
    description: f.description ?? '',
    amount: f.amount,
    date: f.createdAt ?? 0,
  }));

  // ── Expense summary by category ────────────────────────────────────────────
  const expenseByCat: Record<string, number> = {};
  for (const row of expenseRows) {
    expenseByCat[row.category] = (expenseByCat[row.category] ?? 0) + row.amount;
  }

  const totalRevenue = revenueRows.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expenseRows.reduce((s, r) => s + r.amount, 0);
  const netProfit = totalRevenue - totalExpense;

  // ── Month options ──────────────────────────────────────────────────────────
  const allItems = [
    ...receipts.map((r) => ({ createdAt: r.createdAt })),
    ...financials.map((f) => ({ createdAt: f.createdAt })),
  ];
  const monthOptions = buildMonthOptions(allItems);

  const catLabel: Record<string, string> = {
    sales: '銷售收入',
    purchase: '採購成本',
    shipping: '物流運費',
    operational: '營運費用',
    refund: '退款',
  };

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
          <div>
            <h1 className="text-xl font-bold text-txt-primary tracking-tight">收入支出表</h1>
            <p className="text-sm text-txt-subtle mt-0.5">自動彙總已審核收款單及費用支出</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-txt-primary focus:outline-none focus:border-accent"
            >
              {monthOptions.length === 0 ? (
                <option value="">（尚無資料）</option>
              ) : (
                monthOptions.map((m) => (
                  <option key={m} value={m}>{monthLabel(m)}</option>
                ))
              )}
            </select>
            <button
              onClick={() => setShowDetail((v) => !v)}
              className="text-xs px-3 py-1.5 rounded-md border border-gray-600 text-txt-secondary hover:text-txt-primary hover:border-accent/40 transition-colors"
            >
              {showDetail ? '隱藏明細' : '顯示明細'}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3" />
            <p className="text-txt-subtle text-sm">載入中...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* P&L Summary Card */}
            <div className="glass-card p-6 space-y-4">
              <h2 className="text-sm font-semibold text-txt-subtle uppercase tracking-widest">
                {period ? monthLabel(period) : '—'} ／ 損益摘要
              </h2>

              {/* Revenue */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-sm font-semibold text-txt-primary border-b border-border pb-1">
                  <span>營業收入</span>
                  <span className="tabular-nums text-green-400">{totalRevenue.toFixed(2)}</span>
                </div>
                <div className="pl-4 text-sm text-txt-secondary flex justify-between">
                  <span>客戶收款（已審核收款單）</span>
                  <span className="tabular-nums">{totalRevenue.toFixed(2)}</span>
                </div>
              </div>

              {/* Expenses by category */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-sm font-semibold text-txt-primary border-b border-border pb-1">
                  <span>營業費用</span>
                  <span className="tabular-nums text-red-400">({totalExpense.toFixed(2)})</span>
                </div>
                {Object.entries(expenseByCat).length === 0 ? (
                  <div className="pl-4 text-sm text-txt-subtle">本期無費用記錄</div>
                ) : (
                  Object.entries(expenseByCat).map(([cat, amt]) => (
                    <div key={cat} className="pl-4 text-sm text-txt-secondary flex justify-between">
                      <span>{catLabel[cat] ?? cat}</span>
                      <span className="tabular-nums">({amt.toFixed(2)})</span>
                    </div>
                  ))
                )}
              </div>

              {/* Net */}
              <div className={`flex justify-between items-center pt-3 border-t border-border text-base font-bold ${netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                <span>本期淨利 / 淨損</span>
                <span className="tabular-nums">
                  {netProfit >= 0 ? '' : '('}
                  {Math.abs(netProfit).toFixed(2)}
                  {netProfit < 0 ? ')' : ''}
                </span>
              </div>
            </div>

            {/* Detail Tables (toggleable) */}
            {showDetail && (
              <div className="space-y-6">
                {/* Revenue detail */}
                <section>
                  <h3 className="text-xs font-semibold text-txt-subtle uppercase tracking-widest mb-3">
                    收款明細（{revenueRows.length} 筆）
                  </h3>
                  {revenueRows.length === 0 ? (
                    <div className="glass-card p-6 text-center text-sm text-txt-subtle">
                      本期無已審核收款單
                    </div>
                  ) : (
                    <div className="glass-card overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-txt-subtle text-xs uppercase tracking-wide">
                            <th className="px-4 py-3 text-left">收款單號</th>
                            <th className="px-4 py-3 text-left">客戶</th>
                            <th className="px-4 py-3 text-left">核銷發貨單</th>
                            <th className="px-4 py-3 text-left">日期</th>
                            <th className="px-4 py-3 text-right">金額</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {revenueRows.map((r) => (
                            <tr key={r.receiptNo} className="hover:bg-surface-2/50">
                              <td className="px-4 py-2.5 font-mono text-xs text-accent-text">{r.receiptNo}</td>
                              <td className="px-4 py-2.5 text-txt-primary">{r.customerName}</td>
                              <td className="px-4 py-2.5 text-xs text-txt-subtle font-mono">{r.deliveryNotes}</td>
                              <td className="px-4 py-2.5 text-txt-subtle text-xs">
                                {r.date ? new Date(r.date).toLocaleDateString('zh-TW') : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums font-medium text-green-400">
                                {r.amount.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-border bg-surface-2/30">
                            <td colSpan={4} className="px-4 py-2.5 text-sm font-semibold text-txt-primary">合計</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-bold text-green-400">
                              {totalRevenue.toFixed(2)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </section>

                {/* Expense detail */}
                <section>
                  <h3 className="text-xs font-semibold text-txt-subtle uppercase tracking-widest mb-3">
                    費用明細（{expenseRows.length} 筆）
                  </h3>
                  {expenseRows.length === 0 ? (
                    <div className="glass-card p-6 text-center text-sm text-txt-subtle">
                      本期無費用記錄，請至「Financials」頁面新增
                    </div>
                  ) : (
                    <div className="glass-card overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-txt-subtle text-xs uppercase tracking-wide">
                            <th className="px-4 py-3 text-left">類別</th>
                            <th className="px-4 py-3 text-left">說明</th>
                            <th className="px-4 py-3 text-left">日期</th>
                            <th className="px-4 py-3 text-right">金額</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {expenseRows.map((r, idx) => (
                            <tr key={idx} className="hover:bg-surface-2/50">
                              <td className="px-4 py-2.5 text-txt-secondary">{catLabel[r.category] ?? r.category}</td>
                              <td className="px-4 py-2.5 text-txt-primary">{r.description || '—'}</td>
                              <td className="px-4 py-2.5 text-txt-subtle text-xs">
                                {r.date ? new Date(r.date).toLocaleDateString('zh-TW') : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-red-400">
                                ({r.amount.toFixed(2)})
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-border bg-surface-2/30">
                            <td colSpan={3} className="px-4 py-2.5 text-sm font-semibold text-txt-primary">合計</td>
                            <td className="px-4 py-2.5 text-right tabular-nums font-bold text-red-400">
                              ({totalExpense.toFixed(2)})
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
