'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { DeliveryNoteService } from '@/services/database/deliveryNotes';
import { ReceivableService } from '@/services/database/receivables';
import { PaymentReceiptService } from '@/services/database/paymentReceipts';
import { DepositService } from '@/services/database/deposits';
import { ExpenseChargeService } from '@/services/database/expenseCharges';
import {
  User, UserRole,
  DeliveryNote, DeliveryNoteStatus,
  Receivable, ReceivableStatus,
  PaymentReceipt, PaymentReceiptStatus,
  Deposit,
  ExpenseCharge,
  ExpenseType,
} from '@/types/models';

const dnStatusLabel: Record<DeliveryNoteStatus, string> = {
  [DeliveryNoteStatus.PENDING]: '待倉庫審核',
  [DeliveryNoteStatus.WAREHOUSE_APPROVED]: '已出庫',
  [DeliveryNoteStatus.DELIVERED]: '已送達',
  [DeliveryNoteStatus.CANCELLED]: '已取消',
};
const dnStatusColor: Record<DeliveryNoteStatus, string> = {
  [DeliveryNoteStatus.PENDING]: 'bg-yellow-100 text-yellow-700',
  [DeliveryNoteStatus.WAREHOUSE_APPROVED]: 'bg-blue-800 text-white',
  [DeliveryNoteStatus.DELIVERED]: 'bg-green-100 text-green-700',
  [DeliveryNoteStatus.CANCELLED]: 'bg-gray-100 text-gray-500',
};

const arStatusLabel: Record<ReceivableStatus, string> = {
  [ReceivableStatus.OUTSTANDING]: 'Outstanding',
  [ReceivableStatus.PARTIAL_PAID]: 'Partial Paid',
  [ReceivableStatus.PAID]: 'Paid',
};
const arStatusColor: Record<ReceivableStatus, string> = {
  [ReceivableStatus.OUTSTANDING]: 'bg-red-100 text-red-700',
  [ReceivableStatus.PARTIAL_PAID]: 'bg-yellow-100 text-yellow-700',
  [ReceivableStatus.PAID]: 'bg-green-100 text-green-700',
};

const prStatusLabel: Record<PaymentReceiptStatus, string> = {
  [PaymentReceiptStatus.DRAFT]: 'Draft',
  [PaymentReceiptStatus.SUBMITTED]: 'Submitted',
  [PaymentReceiptStatus.APPROVED]: 'Approved',
  [PaymentReceiptStatus.CANCELLED]: 'Cancelled',
};
const prStatusColor: Record<PaymentReceiptStatus, string> = {
  [PaymentReceiptStatus.DRAFT]: 'bg-gray-100 text-gray-500',
  [PaymentReceiptStatus.SUBMITTED]: 'bg-yellow-100 text-yellow-700',
  [PaymentReceiptStatus.APPROVED]: 'bg-green-100 text-green-700',
  [PaymentReceiptStatus.CANCELLED]: 'bg-red-100 text-red-500',
};

const expenseTypeLabel: Record<ExpenseType, string> = {
  [ExpenseType.WEIGHING_SCALE]: '體重稱',
  [ExpenseType.SHIPPING]: '郵寄',
  [ExpenseType.SALARY]: '薪水',
};

function fmtDate(ts?: number) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-GB');
}

export default function CustomerFinancialPage() {
  const params = useParams();
  const customerId = (params?.id ?? '') as string;

  const [customer, setCustomer] = useState<User | null>(null);
  const [dns, setDns] = useState<DeliveryNote[]>([]);
  const [ars, setArs] = useState<Receivable[]>([]);
  const [prs, setPrs] = useState<PaymentReceipt[]>([]);
  const [deposits, setDeposits] = useState<(Deposit & { id: string })[]>([]);
  const [expenseCharges, setExpenseCharges] = useState<(ExpenseCharge & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDN, setEditDN] = useState<DeliveryNote | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [savingDN, setSavingDN] = useState(false);
  const [deletingPR, setDeletingPR] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const [u, dnList, arList, prList, depList, chargeList] = await Promise.all([
        UserService.getById(customerId),
        DeliveryNoteService.getByToUser(customerId),
        ReceivableService.getByCustomer(customerId),
        PaymentReceiptService.getByCustomer(customerId),
        DepositService.getByCustomer(customerId),
        ExpenseChargeService.getByCustomer(customerId),
      ]);
      setCustomer(u ?? null);
      setDns(dnList);
      setArs(arList);
      setPrs(prList);
      setDeposits(depList);
      setExpenseCharges(chargeList);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  async function handleSaveDNAmount() {
    if (!editDN?.id) return;
    const newAmount = parseFloat(editAmount) || 0;
    setSavingDN(true);
    try {
      await DeliveryNoteService.update(editDN.id, { totals: { grandTotal: newAmount } });

      // 尋找對應的 AR（優先以 DN 號碼匹配，其次以 salesOrderId 匹配）
      const matchingAR = ars.find(
        (ar) =>
          ar.deliveryNoteNo === editDN.deliveryNo ||
          (editDN.salesOrderId && ar.deliveryNoteId === editDN.salesOrderId)
      ) as (Receivable & { id: string }) | undefined;

      if (matchingAR?.id) {
        const newRemaining = Math.max(0, newAmount - matchingAR.paidAmount);
        await ReceivableService.update(matchingAR.id, {
          totalAmount: newAmount,
          remainingAmount: newRemaining,
          status:
            newRemaining <= 0
              ? ReceivableStatus.PAID
              : matchingAR.paidAmount > 0
              ? ReceivableStatus.PARTIAL_PAID
              : ReceivableStatus.OUTSTANDING,
        });
      } else if (newAmount > 0) {
        await ReceivableService.create({
          deliveryNoteId: editDN.id,
          deliveryNoteNo: editDN.deliveryNo,
          salesOrderId: '',
          salesOrderNo: editDN.salesOrderNo ?? '',
          customerId,
          customerName: customer?.displayName ?? '',
          fromUserId: editDN.fromUserId,
          totalAmount: newAmount,
          paidAmount: 0,
          remainingAmount: newAmount,
          status: ReceivableStatus.OUTSTANDING,
        });
      }
      setEditDN(null);
      load();
    } catch (err) {
      console.error('Failed to save DN amount:', err);
    } finally {
      setSavingDN(false);
    }
  }

  const totalBilled = ars.reduce((s, r) => s + r.totalAmount, 0);
  const totalPaid = ars.reduce((s, r) => s + r.paidAmount, 0);
  const totalOutstanding = ars.reduce((s, r) => s + r.remainingAmount, 0);

  const handleDeletePR = async (pr: PaymentReceipt) => {
    if (!pr.id) return;
    if (!confirm(`確定刪除收款單 ${pr.receiptNo}？此操作不可復原。`)) return;
    setActionError('');
    setDeletingPR(pr.id);
    try {
      await PaymentReceiptService.delete(pr.id);
      await load();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : '刪除失敗');
    } finally {
      setDeletingPR(null);
    }
  };

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight name-lowercase">
              {customer?.displayName ?? '—'} — 財務表
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">發貨單 · 應收款 · 收款記錄 · 訂金 · 費用分攤</p>
          </div>
          <Link
            href={`/hierarchy/${customerId}`}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
            ← 庫存台帳
          </Link>
        </div>

        {actionError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {actionError}
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-violet-600 mb-3" />
            <p className="text-gray-500 text-sm">Loading...</p>
          </div>
        ) : (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div className="rounded-2xl bg-gray-50 border border-gray-200 p-5 text-center shadow-sm">
                <p className="text-2xl font-bold tabular-nums text-gray-900 leading-none">
                  RM {totalBilled.toFixed(2)}
                </p>
                <p className="text-xs text-gray-500 mt-2 font-medium uppercase tracking-wide">總發貨金額</p>
              </div>
              <div className="rounded-2xl bg-green-50 border border-green-200 p-5 text-center shadow-sm">
                <p className="text-2xl font-bold tabular-nums text-green-700 leading-none">
                  RM {totalPaid.toFixed(2)}
                </p>
                <p className="text-xs text-green-500 mt-2 font-medium uppercase tracking-wide">已收款</p>
              </div>
              <div className="rounded-2xl bg-red-50 border border-red-200 p-5 text-center shadow-sm">
                <p className="text-2xl font-bold tabular-nums text-red-600 leading-none">
                  RM {totalOutstanding.toFixed(2)}
                </p>
                <p className="text-xs text-red-500 mt-2 font-medium uppercase tracking-wide">未收餘額</p>
              </div>
              <div className="rounded-2xl bg-blue-50 border border-blue-200 p-5 text-center shadow-sm">
                <p className="text-2xl font-bold tabular-nums text-blue-700 leading-none">
                  RM {deposits.reduce((s, d) => s + d.balance, 0).toFixed(2)}
                </p>
                <p className="text-xs text-blue-500 mt-2 font-medium uppercase tracking-wide">訂金餘額</p>
              </div>
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5 text-center shadow-sm">
                <p className="text-2xl font-bold tabular-nums text-amber-700 leading-none">
                  RM {expenseCharges.reduce((s, c) => s + c.remainingAmount, 0).toFixed(2)}
                </p>
                <p className="text-xs text-amber-500 mt-2 font-medium uppercase tracking-wide">費用未收</p>
              </div>
            </div>

            {/* Product Usage Summary */}
            {(() => {
              const summary: Record<string, { productName: string; quantity: number }> = {};
              for (const dn of dns) {
                if (dn.status === DeliveryNoteStatus.CANCELLED) continue;
                for (const item of dn.items) {
                  if (!summary[item.productId]) summary[item.productId] = { productName: item.productName, quantity: 0 };
                  summary[item.productId].quantity += item.quantity;
                }
              }
              const list = Object.entries(summary)
                .map(([productId, { productName, quantity }]) => ({ productId, productName, quantity }))
                .sort((a, b) => b.quantity - a.quantity);
              if (list.length === 0) return null;
              const totalQty = list.reduce((s, r) => s + r.quantity, 0);
              return (
                <Section title="產品彙總" count={list.length}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 text-[11px] uppercase tracking-wide">
                        <th className="px-4 py-3 text-left">產品</th>
                        <th className="px-4 py-3 text-right">數量</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {list.map((r) => (
                        <tr key={r.productId} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {r.productName}
                            <span className="text-xs text-gray-400 ml-1.5 font-mono">({r.productId})</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="inline-block px-3 py-1 rounded-full bg-teal-100 text-teal-800 font-bold tabular-nums">
                              {r.quantity}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold">
                        <td className="px-4 py-3 text-gray-700">總計</td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-block px-3 py-1 rounded-full bg-teal-600 text-white font-bold tabular-nums">
                            {totalQty}
                          </span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </Section>
              );
            })()}

            {/* Delivery Notes */}
            <Section title="發貨單 (DN)" count={dns.length}>
              {dns.length === 0 ? (
                <EmptyRow text="暫無發貨記錄" />
              ) : (
                <table className="w-full text-base">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 text-sm uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">DN No.</th>
                      <th className="px-4 py-3 text-left">Sales Order</th>
                      <th className="px-4 py-3 text-left">來源</th>
                      <th className="px-4 py-3 text-left">日期</th>
                      <th className="px-4 py-3 text-right">金額</th>
                      <th className="px-4 py-3 text-center">狀態</th>
                      <th className="px-4 py-3 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {dns.map((dn) => (
                      <tr key={dn.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-sm font-bold text-gray-900">{dn.deliveryNo}</td>
                        <td className="px-4 py-3 font-mono text-sm text-gray-500">{dn.salesOrderNo || '—'}</td>
                        <td className="px-4 py-3 text-base text-gray-700 name-lowercase">{dn.fromUserName}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{fmtDate(dn.createdAt)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                          RM {dn.totals.grandTotal.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-sm font-semibold ${dnStatusColor[dn.status]}`}>
                            {dnStatusLabel[dn.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => { setEditDN(dn); setEditAmount(dn.totals.grandTotal.toFixed(2)); }}
                            className="px-3 py-1 text-xs font-semibold bg-gray-800 hover:bg-gray-700 text-white rounded-lg whitespace-nowrap"
                          >
                            修改金額
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* Accounts Receivable */}
            <Section title="應收款 (AR)" count={ars.length}>
              {ars.length === 0 ? (
                <EmptyRow text="暫無應收款記錄" />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 text-[11px] uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">DN No.</th>
                      <th className="px-4 py-3 text-left">日期</th>
                      <th className="px-4 py-3 text-right">應收金額</th>
                      <th className="px-4 py-3 text-right">已收</th>
                      <th className="px-4 py-3 text-right">餘額</th>
                      <th className="px-4 py-3 text-center">狀態</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ars.map((ar) => (
                      <tr key={ar.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-bold text-gray-900">{ar.deliveryNoteNo}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">{fmtDate(ar.createdAt)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                          RM {ar.totalAmount.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-green-700 font-semibold">
                          {ar.paidAmount > 0 ? `RM ${ar.paidAmount.toFixed(2)}` : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-red-600">
                          {ar.remainingAmount > 0 ? `RM ${ar.remainingAmount.toFixed(2)}` : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${arStatusColor[ar.status]}`}>
                            {arStatusLabel[ar.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold text-sm">
                      <td className="px-4 py-3 text-gray-700" colSpan={2}>合計</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900">RM {totalBilled.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-green-700">RM {totalPaid.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-red-600">RM {totalOutstanding.toFixed(2)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
            </Section>

            {/* Payment Receipts */}
            <Section title="收款記錄 (PR)" count={prs.length}>
              {prs.length === 0 ? (
                <EmptyRow text="暫無收款記錄" />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 text-[11px] uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Receipt No.</th>
                      <th className="px-4 py-3 text-left">日期</th>
                      <th className="px-4 py-3 text-left">付款方式</th>
                      <th className="px-4 py-3 text-right">收款金額</th>
                      <th className="px-4 py-3 text-center">狀態</th>
                      <th className="px-4 py-3 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {prs.map((pr) => (
                      <tr key={pr.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-bold text-gray-900">{pr.receiptNo}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">{fmtDate(pr.paymentDate ?? pr.createdAt)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{pr.paymentMethod ?? '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-green-700">
                          RM {pr.totalAmount.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${prStatusColor[pr.status]}`}>
                            {prStatusLabel[pr.status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleDeletePR(pr)}
                            disabled={deletingPR === pr.id}
                            className="px-3 py-1 text-xs font-semibold bg-red-100 hover:bg-red-200 text-red-700 rounded-lg whitespace-nowrap disabled:opacity-50"
                          >
                            {deletingPR === pr.id ? '刪除中...' : '刪除'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* Deposits */}
            <Section title="訂金 (Deposit)" count={deposits.length}>
              {deposits.length === 0 ? (
                <EmptyRow text="暫無訂金記錄" />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 text-[11px] uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">Deposit No.</th>
                      <th className="px-4 py-3 text-left">日期</th>
                      <th className="px-4 py-3 text-right">收取金額</th>
                      <th className="px-4 py-3 text-right">可扣抵餘額</th>
                      <th className="px-4 py-3 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {deposits.map((d) => (
                      <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-bold text-gray-900">{d.depositNo}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">{fmtDate(d.paymentDate)}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                          RM {d.amount.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-blue-700">
                          RM {d.balance.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Link
                            href="/deposits"
                            className="text-xs font-medium text-accent-text hover:underline"
                          >
                            管理訂金 →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* Expense Charges */}
            <Section title="費用分攤" count={expenseCharges.length}>
              {expenseCharges.length === 0 ? (
                <EmptyRow text="暫無費用分攤" />
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 text-[11px] uppercase tracking-wide">
                      <th className="px-4 py-3 text-left">費用單號</th>
                      <th className="px-4 py-3 text-left">類型</th>
                      <th className="px-4 py-3 text-right">分攤金額</th>
                      <th className="px-4 py-3 text-right">未收餘額</th>
                      <th className="px-4 py-3 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {expenseCharges.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs font-bold text-gray-900">{c.expenseNo}</td>
                        <td className="px-4 py-3 text-xs text-gray-600">{expenseTypeLabel[c.expenseType]}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                          RM {c.amount.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-amber-600">
                          RM {c.remainingAmount.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Link
                            href="/expense-receipts"
                            className="text-xs font-medium text-accent-text hover:underline"
                          >
                            費用收款 →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
          </>
        )}
      </div>

      {/* 修改 DN 金額 Modal */}
      {editDN && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6">
            <h3 className="text-base font-bold text-gray-900 mb-1">修改發貨金額</h3>
            <p className="text-xs text-gray-500 mb-4 font-mono">{editDN.deliveryNo}</p>
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-600 mb-1">金額 (RM)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1">儲存後若金額 &gt; 0 且尚無應收款，將自動建立 AR</p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setEditDN(null)}
                disabled={savingDN}
                className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveDNAmount}
                disabled={savingDN}
                className="flex-1 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold"
              >
                {savingDN ? '儲存中...' : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-gray-200 bg-gray-50">
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        <span className="text-[11px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium tabular-nums">{count}</span>
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="py-10 text-center text-sm text-gray-400">{text}</div>
  );
}
