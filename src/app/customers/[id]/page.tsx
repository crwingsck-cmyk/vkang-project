'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { ProductService } from '@/services/database/products';
import { SalesOrderService } from '@/services/database/salesOrders';
import { DeliveryNoteService } from '@/services/database/deliveryNotes';
import { ReceivableService } from '@/services/database/receivables';
import { PaymentReceiptService } from '@/services/database/paymentReceipts';
import { OrderService } from '@/services/database/orders';
import {
  User, UserRole, Product, TransactionItem,
  Transaction, TransactionType,
  SalesOrder, SalesOrderStatus,
  DeliveryNote, DeliveryNoteStatus,
  Receivable, ReceivableStatus,
  PaymentReceipt, PaymentReceiptStatus, PaymentReceiptItem,
} from '@/types/models';
import { generateDocumentNumber } from '@/lib/documentNumber';
import Link from 'next/link';

// ─── Labels & colours ────────────────────────────────────────────────────────

const arLabel: Record<ReceivableStatus, string> = {
  [ReceivableStatus.OUTSTANDING]: '未收',
  [ReceivableStatus.PARTIAL_PAID]: '部分已收',
  [ReceivableStatus.PAID]: '已收清',
};
const arColor: Record<ReceivableStatus, string> = {
  [ReceivableStatus.OUTSTANDING]: 'bg-red-100 text-red-700',
  [ReceivableStatus.PARTIAL_PAID]: 'bg-yellow-100 text-yellow-700',
  [ReceivableStatus.PAID]: 'bg-green-100 text-green-700',
};
const prLabel: Record<PaymentReceiptStatus, string> = {
  [PaymentReceiptStatus.DRAFT]: '草稿',
  [PaymentReceiptStatus.SUBMITTED]: '待審核',
  [PaymentReceiptStatus.APPROVED]: '已審核',
  [PaymentReceiptStatus.CANCELLED]: '已取消',
};
const prColor: Record<PaymentReceiptStatus, string> = {
  [PaymentReceiptStatus.DRAFT]: 'bg-gray-100 text-gray-600',
  [PaymentReceiptStatus.SUBMITTED]: 'bg-yellow-100 text-yellow-700',
  [PaymentReceiptStatus.APPROVED]: 'bg-green-100 text-green-700',
  [PaymentReceiptStatus.CANCELLED]: 'bg-red-100 text-red-700',
};
const PAYMENT_METHODS = [
  { value: 'cash', label: '現金' },
  { value: 'bank', label: '銀行轉帳' },
  { value: 'credit', label: '支票' },
];
const EMPTY_ITEM: TransactionItem = { productId: '', productName: '', quantity: 1, unitPrice: 0, total: 0 };

function agingLabel(createdAt?: number): string {
  if (!createdAt) return '—';
  const days = Math.floor((Date.now() - createdAt) / 86400000);
  if (days <= 30) return `${days}天`;
  if (days <= 60) return `${days}天 ⚠️`;
  return `${days}天 🔴`;
}

type Tab = 'ar' | 'payments' | 'transactions';
type PRStep = 1 | 2;

// ─── Component ────────────────────────────────────────────────────────────────

export default function CustomerFinancialPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { user } = useAuth();

  const [customer, setCustomer] = useState<User | null>(null);
  const [, setOrders] = useState<SalesOrder[]>([]);
  const [, setDeliveries] = useState<DeliveryNote[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [saleTxns, setSaleTxns] = useState<Transaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('ar');
  const [actionError, setActionError] = useState('');

  // ── SO Modal ─────────────────────────────────────────────────────────────
  const [showSOModal, setShowSOModal] = useState(false);
  const [soItems, setSOItems] = useState<TransactionItem[]>([{ ...EMPTY_ITEM }]);
  const [soCurrency, setSOCurrency] = useState<'RM'>('RM');
  const [soNotes, setSONotes] = useState('');
  const [soSaving, setSOSaving] = useState(false);
  const [soError, setSOError] = useState('');
  const [creditWarning, setCreditWarning] = useState('');

  // ── DN Modal ─────────────────────────────────────────────────────────────
  const [showDNModal, setShowDNModal] = useState(false);
  const [approvedOrders] = useState<SalesOrder[]>([]);
  const [selOrder, setSelOrder] = useState<SalesOrder | null>(null);
  const [dnItems, setDnItems] = useState<TransactionItem[]>([]);
  const [carrier, setCarrier] = useState('');
  const [trackingNo, setTrackingNo] = useState('');
  const [dnNotes, setDNNotes] = useState('');
  const [dnSaving, setDNSaving] = useState(false);
  const [dnError, setDNError] = useState('');
  const [itemErrors, setItemErrors] = useState<string[]>([]);

  // ── PR Modal ─────────────────────────────────────────────────────────────
  const [showPRModal, setShowPRModal] = useState(false);
  const [prStep, setPRStep] = useState<PRStep>(1);
  const [outstanding, setOutstanding] = useState<Receivable[]>([]);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [prAmount, setPRAmount] = useState('');
  const [payMethod, setPayMethod] = useState('bank');
  const [payRef, setPayRef] = useState('');
  const [prNotes, setPRNotes] = useState('');
  const [prSaving, setPRSaving] = useState(false);
  const [prError, setPRError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [cust, sos, dns, ars, prs, prods, txns] = await Promise.all([
        UserService.getById(id).catch(() => null),
        SalesOrderService.getByCustomer(id).catch(() => [] as SalesOrder[]),
        DeliveryNoteService.getByToUser(id).catch(() => [] as DeliveryNote[]),
        ReceivableService.getByCustomer(id).catch(() => [] as Receivable[]),
        PaymentReceiptService.getByCustomer(id).catch(() => [] as PaymentReceipt[]),
        ProductService.getAll().catch(() => [] as Product[]),
        OrderService.getByToUser(id, 200).catch(() => [] as Transaction[]),
      ]);
      setCustomer(cust);
      setOrders(sos);
      setDeliveries(dns);
      setReceivables(ars);
      setReceipts(prs);
      setProducts(prods.filter((p) => !p.isTemporary));
      setSaleTxns(txns.filter((t) =>
        t.transactionType === TransactionType.SALE ||
        t.transactionType === TransactionType.TRANSFER ||
        // 自用：ADJUSTMENT + description='自用' + fromUser===toUser
        (t.transactionType === TransactionType.ADJUSTMENT &&
          t.description === '自用' &&
          t.fromUser?.userId === t.toUser?.userId)
      ));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // ── DN IDs that already have AR (to detect old DNs missing AR) ──────────
  const arDnIds = new Set(receivables.map((r) => r.deliveryNoteId));

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalOutstanding = receivables
    .filter((r) => r.status !== ReceivableStatus.PAID)
    .reduce((s, r) => s + r.remainingAmount, 0);
  const totalPaid = receivables.reduce((s, r) => s + r.paidAmount, 0);

  // ═════════════════════════════════════════════════════════════════════════
  // SO handlers
  // ═════════════════════════════════════════════════════════════════════════

  const soGrandTotal = soItems.reduce((s, i) => s + i.total, 0);

  const checkCredit = (total: number) => {
    if (!customer) return;
    const lim = customer.creditLimit ?? 0;
    const used = customer.creditUsed ?? 0;
    if (lim > 0 && used + total > lim) {
      setCreditWarning(`信用額度 ${soCurrency} ${lim.toFixed(0)}，已用 ${soCurrency} ${used.toFixed(0)}，本單 ${soCurrency} ${total.toFixed(0)}，超限 ${soCurrency} ${(used + total - lim).toFixed(0)}。`);
    } else {
      setCreditWarning('');
    }
  };

  const updateSOItem = (idx: number, field: keyof TransactionItem, value: string | number) => {
    setSOItems((prev) => {
      const next = [...prev];
      const row = { ...next[idx], [field]: value } as TransactionItem;
      if (field === 'productId') {
        const p = products.find((x) => x.id === value || x.sku === value);
        if (p) { row.productName = p.name; row.unitPrice = p.unitPrice; row.total = row.quantity * p.unitPrice; }
      }
      if (field === 'quantity' || field === 'unitPrice') row.total = Number(row.quantity) * Number(row.unitPrice);
      next[idx] = row;
      checkCredit(next.reduce((s, i) => s + i.total, 0));
      return next;
    });
  };

  const handleSOSave = async () => {
    if (soItems.some((i) => !i.productId)) { setSOError('請選擇每一行的商品'); return; }
    if (soItems.some((i) => i.quantity <= 0)) { setSOError('數量必須大於 0'); return; }
    setSOSaving(true); setSOError('');
    try {
      const existingNos = await SalesOrderService.getAllOrderNos();
      const orderNo = generateDocumentNumber('SO', existingNos);
      const subtotal = soItems.reduce((s, i) => s + i.total, 0);
      await SalesOrderService.create({
        orderNo,
        status: SalesOrderStatus.DRAFT,
        fromUserId: user?.id ?? '',
        fromUserName: user?.displayName ?? user?.email ?? '',
        customerId: id,
        customerName: customer?.displayName ?? '',
        items: soItems,
        totals: { subtotal, grandTotal: subtotal },
        currency: soCurrency,
        notes: soNotes || undefined,
        creditCheckPassed: creditWarning ? false : true,
        createdBy: user?.id,
      });
      setShowSOModal(false);
      await load();
    } catch (e: any) {
      setSOError(e.message ?? '儲存失敗');
    } finally {
      setSOSaving(false);
    }
  };

  // ═════════════════════════════════════════════════════════════════════════
  // DN handlers
  // ═════════════════════════════════════════════════════════════════════════

  const handleOrderSelect = (orderId: string) => {
    const order = approvedOrders.find((o) => o.id === orderId) ?? null;
    setSelOrder(order);
    if (order) {
      setDnItems(order.items.map((i) => ({ ...i })));
      setItemErrors(order.items.map(() => ''));
    } else {
      setDnItems([]); setItemErrors([]);
    }
  };

  const updateDnQty = (idx: number, qty: number) => {
    setDnItems((prev) => {
      const next = [...prev];
      const maxQty = selOrder?.items[idx]?.quantity ?? 0;
      next[idx] = { ...next[idx], quantity: qty, total: qty * next[idx].unitPrice };
      const errs = [...itemErrors];
      errs[idx] = qty > maxQty ? `最多 ${maxQty}，不可超過訂單數量` : '';
      setItemErrors(errs);
      return next;
    });
  };

  const hasQtyError = itemErrors.some((e) => !!e);

  const handleDNSave = async () => {
    if (!selOrder) { setDNError('請選擇訂單'); return; }
    if (hasQtyError) { setDNError('出貨數量不可超過訂單數量'); return; }
    if (dnItems.every((i) => i.quantity <= 0)) { setDNError('至少一個品項數量需大於 0'); return; }
    setDNSaving(true); setDNError('');
    try {
      const existingNos = await DeliveryNoteService.getAllDeliveryNos();
      const deliveryNo = generateDocumentNumber('DN', existingNos);
      const grandTotal = dnItems.reduce((s, i) => s + i.total, 0);
      await DeliveryNoteService.create({
        deliveryNo,
        salesOrderId: selOrder.id!,
        salesOrderNo: selOrder.orderNo,
        status: DeliveryNoteStatus.PENDING,
        fromUserId: selOrder.fromUserId,
        fromUserName: selOrder.fromUserName,
        toUserId: id,
        toUserName: customer?.displayName ?? '',
        items: dnItems.filter((i) => i.quantity > 0),
        totals: { grandTotal },
        logistics: { carrier: carrier || undefined, trackingNumber: trackingNo || undefined },
        notes: dnNotes || undefined,
        createdBy: user?.id,
      });
      await SalesOrderService.linkDeliveryNote(selOrder.id!, deliveryNo, selOrder.linkedDeliveryNoteIds ?? []);
      setShowDNModal(false);
      await load();
    } catch (e: any) {
      setDNError(e.message ?? '儲存失敗');
    } finally {
      setDNSaving(false);
    }
  };

  const handleDeleteAR = async (arId: string) => {
    if (!confirm('確定刪除此應收款記錄？此操作無法復原。')) return;
    try {
      await ReceivableService.delete(arId);
      await load();
    } catch (e: any) {
      setActionError(e.message ?? '刪除失敗');
    }
  };

  /** 從層級庫存表（SALE/TRANSFER/自用）補建應收款 */
  const handleBackfillARFromTxn = async (txn: Transaction & { id: string }) => {
    setActionError('');
    // 自用判斷：與 saleTxns filter 保持一致（description + fromUser===toUser）
    const isSelfUse = txn.description === '自用' && txn.fromUser?.userId === txn.toUser?.userId;
    const fromUserId = isSelfUse
      ? (customer?.parentUserId ?? txn.fromUser?.userId ?? '')
      : (txn.fromUser?.userId ?? '');
    try {
      await ReceivableService.create({
        deliveryNoteId: txn.id,
        deliveryNoteNo: txn.poNumber ?? txn.id,
        salesOrderId: '',
        salesOrderNo: '',
        customerId: txn.toUser?.userId ?? id,
        customerName: customer?.displayName ?? txn.toUser?.userName ?? '',
        fromUserId,
        totalAmount: txn.totals.grandTotal,
        paidAmount: 0,
        remainingAmount: txn.totals.grandTotal,
        status: ReceivableStatus.OUTSTANDING,
      });
      await load();
    } catch (e: any) {
      setActionError(e.message ?? '補建失敗');
    }
  };

  const handleTxnDelete = async (txn: Transaction & { id: string }) => {
    if (!confirm(`確定永久刪除交易記錄 ${txn.poNumber ?? txn.id}？此操作無法復原。`)) return;
    await OrderService.delete(txn.id); await load();
  };

  // ═════════════════════════════════════════════════════════════════════════
  // PR handlers
  // ═════════════════════════════════════════════════════════════════════════

  const openPRModal = () => {
    setShowPRModal(true); setPRStep(1); setPRError('');
    setOutstanding(receivables.filter(
      (r) => r.status === ReceivableStatus.OUTSTANDING || r.status === ReceivableStatus.PARTIAL_PAID
    ));
    setCheckedIds(new Set()); setPRAmount(''); setPayMethod('bank'); setPayRef(''); setPRNotes('');
  };

  const toggleCheck = (rid: string) => {
    setCheckedIds((prev) => { const next = new Set(prev); next.has(rid) ? next.delete(rid) : next.add(rid); return next; });
    setPRAmount(''); setPRError('');
  };

  const selectedReceivables = outstanding.filter((r) => checkedIds.has(r.id!));
  const maxPRAmount = selectedReceivables.reduce((s, r) => s + r.remainingAmount, 0);
  const prAmountNum = parseFloat(prAmount) || 0;
  const prOverLimit = prAmountNum > maxPRAmount;

  const handlePRSave = async () => {
    if (checkedIds.size === 0) { setPRError('請選擇發貨單號'); return; }
    if (!prAmountNum || prAmountNum <= 0) { setPRError('請填寫收款金額'); return; }
    if (prOverLimit) { setPRError(`核銷金額超過剩餘未收（上限 ${maxPRAmount.toFixed(2)}）`); return; }
    setPRSaving(true); setPRError('');
    try {
      const items: PaymentReceiptItem[] = [];
      let remaining = prAmountNum;
      for (const r of selectedReceivables) {
        const apply = Math.min(r.remainingAmount, remaining);
        if (apply <= 0) break;
        items.push({ receivableId: r.id!, deliveryNoteNo: r.deliveryNoteNo, appliedAmount: Math.round(apply * 100) / 100 });
        remaining -= apply;
        if (remaining <= 0) break;
      }
      const existingNos = await PaymentReceiptService.getAllReceiptNos();
      const receiptNo = generateDocumentNumber('PR', existingNos);
      await PaymentReceiptService.create({
        receiptNo,
        status: PaymentReceiptStatus.DRAFT,
        customerId: id,
        customerName: customer?.displayName ?? '',
        items,
        totalAmount: prAmountNum,
        paymentMethod: payMethod,
        paymentReference: payRef || undefined,
        notes: prNotes || undefined,
        createdBy: user?.id,
      });
      setShowPRModal(false);
      await load();
    } catch (e: any) {
      setPRError(e.message ?? '儲存失敗');
    } finally {
      setPRSaving(false);
    }
  };

  const handlePRSubmit = async (pr: PaymentReceipt) => { await PaymentReceiptService.submit(pr.id!); await load(); };
  const handlePRApprove = async (pr: PaymentReceipt) => {
    setActionError('');
    try { await PaymentReceiptService.approve(pr.id!, user?.id ?? ''); await load(); }
    catch (e: any) { setActionError(e.message ?? '審核失敗'); }
  };
  const handlePRCancel = async (pr: PaymentReceipt) => {
    if (!confirm(`確定取消收款單 ${pr.receiptNo}？`)) return;
    await PaymentReceiptService.cancel(pr.id!); await load();
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-6">

        {/* Back link */}
        <Link href="/customers" className="inline-flex items-center gap-1.5 text-sm text-txt-subtle hover:text-accent-text transition-colors">
          ← 返回客戶列表
        </Link>

        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-violet-600 mb-3" />
            <p className="text-gray-500 text-sm">載入中...</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 pt-6 pb-5">
                <div className="flex flex-col sm:flex-row sm:items-start gap-5 justify-between">
                  {/* Identity */}
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg">
                      <span className="text-xl font-bold text-white uppercase">
                        {(customer?.displayName ?? '?')[0]}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h1 className="text-lg font-bold text-gray-900 name-lowercase leading-tight">
                          {customer?.displayName ?? '—'}
                        </h1>
                        {customer?.role && (
                          <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
                            {customer.role === UserRole.CUSTOMER ? '顧客' : customer.role === UserRole.ADMIN ? '總經銷商' : '經銷商'}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">{customer?.email}</p>
                      {customer?.company?.name && (
                        <p className="text-xs text-gray-400 mt-0.5">{customer.company.name}</p>
                      )}
                    </div>
                  </div>
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-2 sm:gap-3">
                    <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 text-center min-w-[64px]">
                      <p className="text-lg font-bold text-red-600 tabular-nums leading-none">
                        {totalOutstanding > 0 ? totalOutstanding.toFixed(0) : '0'}
                      </p>
                      <p className="text-xs text-red-500 mt-1 font-medium">未收款</p>
                    </div>
                    <div className="rounded-xl bg-green-50 border border-green-200 px-3 py-2.5 text-center min-w-[64px]">
                      <p className="text-lg font-bold text-green-600 tabular-nums leading-none">
                        {totalPaid > 0 ? totalPaid.toFixed(0) : '0'}
                      </p>
                      <p className="text-xs text-green-500 mt-1 font-medium">已收款</p>
                    </div>
                  </div>
                </div>
              </div>
              {/* Tab bar inside header card */}
              <div className="flex items-center gap-0 border-t border-gray-200 px-2 overflow-x-auto">
                {([
                  { key: 'transactions', label: '交易記錄', count: saleTxns.length },
                  { key: 'ar',           label: '應收款',   count: receivables.length },
                  { key: 'payments',     label: '收款記錄', count: receipts.length },
                ] as { key: Tab; label: string; count: number }[]).map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-base font-bold border-b-2 whitespace-nowrap transition-all ${
                      tab === t.key
                        ? 'border-gray-900 text-gray-900'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {t.label}
                    <span className={`inline-flex items-center justify-center min-w-[18px] h-4.5 px-1 rounded text-xs font-bold ${
                      tab === t.key ? 'bg-gray-200 text-gray-900' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {t.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {actionError && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                <span className="text-base">⚠️</span> {actionError}
              </div>
            )}

            {/* ── Tab: 交易記錄（層級庫存表 SALE 交易）──────────────────── */}
            {tab === 'transactions' && (
              <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-gray-900">交易記錄</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium tabular-nums">{saleTxns.length}</span>
                  </div>
                  <span className="text-xs text-gray-400">資料來自層級庫存表</span>
                </div>
                {saleTxns.length === 0 ? (
                  <div className="py-14 text-center">
                    <p className="text-gray-400 text-sm">尚無交易記錄</p>
                  </div>
                ) : (
                  <table className="w-full text-base">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                        <th className="px-5 py-3 text-left">單號</th>
                        <th className="px-5 py-3 text-left">日期</th>
                        <th className="px-5 py-3 text-right">數量</th>
                        <th className="px-5 py-3 text-right">總額</th>
                        <th className="px-5 py-3 text-right">應收款</th>
                        <th className="px-5 py-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {saleTxns.map((txn) => {
                        const txnId = (txn as Transaction & { id: string }).id;
                        const hasAR = arDnIds.has(txnId);
                        const totalQty = (txn.items ?? []).reduce((s, i) => s + i.quantity, 0);
                        return (
                          <tr key={txnId} className="hover:bg-gray-50 transition-colors">
                            <td className="px-5 py-3.5 font-mono text-sm font-bold text-gray-900">{txn.poNumber ?? txnId}</td>
                            <td className="px-5 py-3.5 text-gray-500 text-sm">
                              {txn.createdAt ? new Date(txn.createdAt).toLocaleDateString('zh-TW') : '—'}
                            </td>
                            <td className="px-5 py-3.5 text-right text-gray-600 tabular-nums">{totalQty}</td>
                            <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-gray-900">{txn.totals.grandTotal.toFixed(2)}</td>
                            <td className="px-5 py-3.5 text-right">
                              {hasAR ? (
                                <span className="text-[11px] text-green-600 font-medium">已建應收款</span>
                              ) : (
                                <button
                                  onClick={() => handleBackfillARFromTxn(txn as Transaction & { id: string })}
                                  className="text-[11px] px-2.5 py-1 rounded-md bg-blue-900 text-white hover:bg-blue-800 transition-colors"
                                >
                                  補建應收款
                                </button>
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              <button onClick={() => handleTxnDelete(txn as Transaction & { id: string })} className="text-[11px] px-2.5 py-1 rounded-md bg-red-700 text-white hover:bg-red-800 transition-colors font-medium">Delete</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ── Tab: 應收款 ────────────────────────────────────────────── */}
            {tab === 'ar' && (
              <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-gray-900">Receivables</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium tabular-nums">{receivables.length}</span>
                  </div>
                  {totalOutstanding > 0 && (
                    <span className="text-sm font-semibold text-red-600 tabular-nums">Outstanding Total: {totalOutstanding.toFixed(2)}</span>
                  )}
                </div>
                {receivables.length === 0 ? (
                  <div className="py-14 text-center">
                    <p className="text-gray-400 text-sm">No receivables (auto-generated after warehouse approval)</p>
                  </div>
                ) : (
                  <table className="w-full text-base">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                        <th className="px-5 py-3 text-left">DN No.</th>
                        <th className="px-5 py-3 text-right">Total</th>
                        <th className="px-5 py-3 text-right">Paid</th>
                        <th className="px-5 py-3 text-right">Outstanding</th>
                        <th className="px-5 py-3 text-center">Status</th>
                        <th className="px-5 py-3 text-center">Aging</th>
                        <th className="px-5 py-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {receivables.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3.5 font-mono text-sm font-bold text-gray-900">{r.deliveryNoteNo}</td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-gray-600">{r.totalAmount.toFixed(2)}</td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-green-600 font-medium">
                            {r.paidAmount > 0 ? r.paidAmount.toFixed(2) : '—'}
                          </td>
                          <td className="px-5 py-3.5 text-right tabular-nums text-red-600 font-semibold">
                            {r.remainingAmount > 0 ? r.remainingAmount.toFixed(2) : '—'}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${arColor[r.status]}`}>
                              {arLabel[r.status]}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-center text-sm text-gray-500">
                            {r.status !== ReceivableStatus.PAID ? agingLabel(r.createdAt) : '—'}
                          </td>
                          <td className="px-5 py-3.5 text-center">
                            <button
                              onClick={() => handleDeleteAR(r.id!)}
                              className="text-[11px] px-2.5 py-1 rounded-md bg-red-700 text-white hover:bg-red-800 transition-colors font-medium"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ── Tab: 收款記錄 ───────────────────────────────────────────── */}
            {tab === 'payments' && (
              <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200 bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-gray-900">收款記錄</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium tabular-nums">{receipts.length}</span>
                  </div>
                  <button
                    onClick={openPRModal}
                    className="px-3.5 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    + 新增收款單
                  </button>
                </div>
                {receipts.length === 0 ? (
                  <div className="py-14 text-center">
                    <p className="text-gray-400 text-sm">尚無收款記錄</p>
                  </div>
                ) : (
                  <table className="w-full text-base">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                        <th className="px-5 py-3 text-left">收款單號</th>
                        <th className="px-5 py-3 text-left">日期</th>
                        <th className="px-5 py-3 text-left">核銷單號</th>
                        <th className="px-5 py-3 text-right">金額</th>
                        <th className="px-5 py-3 text-center">狀態</th>
                        <th className="px-5 py-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {receipts.map((pr) => (
                        <tr key={pr.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3.5 font-mono text-sm font-bold text-gray-900">{pr.receiptNo}</td>
                          <td className="px-5 py-3.5 text-gray-500 text-sm">
                            {pr.createdAt ? new Date(pr.createdAt).toLocaleDateString('zh-TW') : '—'}
                          </td>
                          <td className="px-5 py-3.5 text-sm text-gray-400 font-mono">{pr.items.map((i) => i.deliveryNoteNo).join(', ')}</td>
                          <td className="px-5 py-3.5 text-right font-semibold tabular-nums text-green-600">{pr.totalAmount.toFixed(2)}</td>
                          <td className="px-5 py-3.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${prColor[pr.status]}`}>
                              {prLabel[pr.status]}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {pr.status === PaymentReceiptStatus.DRAFT && (
                                <button onClick={() => handlePRSubmit(pr)} className="text-[11px] px-2.5 py-1 rounded-md bg-yellow-100 text-yellow-700 hover:bg-yellow-200 transition-colors">提交</button>
                              )}
                              {pr.status === PaymentReceiptStatus.SUBMITTED && (
                                <button onClick={() => handlePRApprove(pr)} className="text-[11px] px-2.5 py-1 rounded-md bg-green-100 text-green-700 hover:bg-green-200 transition-colors">審核</button>
                              )}
                              {(pr.status === PaymentReceiptStatus.DRAFT || pr.status === PaymentReceiptStatus.SUBMITTED) && (
                                <button onClick={() => handlePRCancel(pr)} className="text-[11px] px-2.5 py-1 rounded-md bg-red-100 text-red-700 hover:bg-red-200 transition-colors">取消</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══════════════ SO Modal ═══════════════ */}
      {showSOModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">新增訂貨單 — {customer?.displayName}</h2>
              <button onClick={() => setShowSOModal(false)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
              {creditWarning && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  ⚠️ 信用額度超限：{creditWarning}
                </div>
              )}
              {/* Currency */}
              <div>
                <label className="block text-sm text-gray-500 mb-1">幣別</label>
                <div className="flex gap-3">
                  {(['RM'] as const).map((cur) => (
                    <label key={cur} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
                      <input type="radio" name="so-currency" value={cur} checked={soCurrency === cur} onChange={() => setSOCurrency(cur)} className="accent-violet-600" />
                      {cur}
                    </label>
                  ))}
                </div>
              </div>
              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm text-gray-500">品項 *</label>
                  <button onClick={() => setSOItems((p) => [...p, { ...EMPTY_ITEM }])} className="text-xs text-violet-600 hover:underline">+ 新增一行</button>
                </div>
                <div className="space-y-2">
                  {soItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5">
                        <select value={item.productId} onChange={(e) => updateSOItem(idx, 'productId', e.target.value)}
                          className="w-full bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-violet-500">
                          <option value="">— 選商品 —</option>
                          {products.map((p) => <option key={p.id} value={p.id ?? p.sku}>{p.name}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <input type="number" min={1} value={item.quantity} onChange={(e) => updateSOItem(idx, 'quantity', Number(e.target.value))}
                          placeholder="數量" className="w-full bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-violet-500" />
                      </div>
                      <div className="col-span-3">
                        <input type="number" min={0} step="0.01" value={item.unitPrice} onChange={(e) => updateSOItem(idx, 'unitPrice', Number(e.target.value))}
                          placeholder="單價" className="w-full bg-white border border-gray-300 rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:border-violet-500" />
                      </div>
                      <div className="col-span-1 text-right text-xs text-gray-500 tabular-nums">{item.total.toFixed(0)}</div>
                      <div className="col-span-1 text-right">
                        {soItems.length > 1 && <button onClick={() => setSOItems((p) => p.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-700 text-xs">✕</button>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-right text-base font-semibold text-gray-900 tabular-nums">
                  總計：{soCurrency} {soGrandTotal.toFixed(2)}
                </div>
              </div>
              {/* Notes */}
              <div>
                <label className="block text-sm text-gray-500 mb-1">備注（選填）</label>
                <textarea value={soNotes} onChange={(e) => setSONotes(e.target.value)} rows={2}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-violet-500 resize-none" />
              </div>
              {soError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{soError}</p>}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <button onClick={() => setShowSOModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">取消</button>
              <button onClick={handleSOSave} disabled={soSaving}
                className="px-5 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-500 disabled:opacity-50 transition-colors">
                {soSaving ? '儲存中...' : '儲存草稿'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ DN Modal ═══════════════ */}
      {showDNModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900">新增發貨單 — {customer?.displayName}</h2>
              <button onClick={() => setShowDNModal(false)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
              <div>
                <label className="block text-sm text-gray-500 mb-1">關聯銷售訂單（已審核）*</label>
                <select value={selOrder?.id ?? ''} onChange={(e) => handleOrderSelect(e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-violet-500">
                  <option value="">— 選擇已審核訂單 —</option>
                  {approvedOrders.map((o) => (
                    <option key={o.id} value={o.id}>{o.orderNo} | RM {o.totals.grandTotal.toFixed(2)}</option>
                  ))}
                </select>
                {approvedOrders.length === 0 && (
                  <p className="mt-1 text-xs text-yellow-600">此客戶目前沒有已審核的訂單。</p>
                )}
              </div>
              {selOrder && dnItems.length > 0 && (
                <div>
                  <label className="block text-sm text-gray-500 mb-2">實際出貨數量（不可超過訂單數量）</label>
                  <div className="space-y-2">
                    {dnItems.map((item, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-6 text-sm text-gray-900">{item.productName}</div>
                          <div className="col-span-3">
                            <input type="number" min={0} max={selOrder.items[idx]?.quantity ?? 0} value={item.quantity}
                              onChange={(e) => updateDnQty(idx, Number(e.target.value))}
                              className={`w-full bg-white border rounded-lg px-2 py-1.5 text-xs text-gray-900 focus:outline-none ${itemErrors[idx] ? 'border-red-500' : 'border-gray-300 focus:border-violet-500'}`} />
                          </div>
                          <div className="col-span-2 text-xs text-gray-500 text-center">/ {selOrder.items[idx]?.quantity ?? 0}</div>
                          <div className="col-span-1 text-xs text-right tabular-nums text-gray-600">{item.total.toFixed(0)}</div>
                        </div>
                        {itemErrors[idx] && <p className="text-xs text-red-500">{itemErrors[idx]}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-right text-base font-semibold text-gray-900 tabular-nums">
                    總計：RM {dnItems.reduce((s, i) => s + i.total, 0).toFixed(2)}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">物流商（選填）</label>
                  <input type="text" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="e.g. J&T"
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-violet-500" />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">追蹤號碼（選填）</label>
                  <input type="text" value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} placeholder="e.g. JT123"
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-violet-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">備注（選填）</label>
                <textarea value={dnNotes} onChange={(e) => setDNNotes(e.target.value)} rows={2}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-violet-500 resize-none" />
              </div>
              {dnError && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{dnError}</p>}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
              <button onClick={() => setShowDNModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">取消</button>
              <button onClick={handleDNSave} disabled={dnSaving || !selOrder || hasQtyError}
                className="px-5 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-500 disabled:opacity-50 transition-colors">
                {dnSaving ? '儲存中...' : '建立發貨單'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ PR Modal ═══════════════ */}
      {showPRModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <h2 className="text-base font-semibold text-gray-900">新增收款單 — {customer?.displayName}</h2>
                <div className="flex items-center gap-2 mt-1">
                  {([1, 2] as PRStep[]).map((s) => (
                    <div key={s} className="flex items-center gap-1">
                      <div className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-medium ${prStep === s ? 'bg-violet-600 text-white' : prStep > s ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-500'}`}>{s}</div>
                      {s < 2 && <div className={`w-6 h-px ${prStep > s ? 'bg-green-600' : 'bg-gray-300'}`} />}
                    </div>
                  ))}
                  <span className="text-xs text-gray-500 ml-1">{prStep === 1 ? '選發貨單號' : '填寫收款'}</span>
                </div>
              </div>
              <button onClick={() => setShowPRModal(false)} className="text-gray-400 hover:text-gray-700 text-lg leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4">
              {/* Step 1: Select DNs */}
              {prStep === 1 && (
                <div className="space-y-4">
                  {outstanding.length === 0 ? (
                    <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-3">
                      <p className="text-yellow-700 text-sm font-medium">此客戶目前沒有未收的應收款</p>
                      <p className="text-yellow-600 text-xs mt-1">請確認已有已出庫的發貨單</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-gray-500">勾選要核銷的發貨單號（必須至少選一個）：</p>
                      <div className="space-y-2">
                        {outstanding.map((r) => (
                          <label key={r.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${checkedIds.has(r.id!) ? 'border-violet-300 bg-violet-50' : 'border-gray-200 hover:border-gray-300 bg-gray-50'}`}>
                            <input type="checkbox" checked={checkedIds.has(r.id!)} onChange={() => toggleCheck(r.id!)} className="accent-violet-600" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-mono font-bold text-gray-900">{r.deliveryNoteNo}</p>
                              <p className="text-xs text-gray-500">訂單：{r.salesOrderNo}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs text-gray-500">總額 {r.totalAmount.toFixed(2)}</p>
                              <p className="text-sm font-semibold text-red-600 tabular-nums">未收 {r.remainingAmount.toFixed(2)}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                      {checkedIds.size > 0 && (
                        <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-2 flex justify-between text-sm">
                          <span className="text-gray-500">可核銷上限：</span>
                          <span className="font-semibold text-gray-900 tabular-nums">{maxPRAmount.toFixed(2)}</span>
                        </div>
                      )}
                    </>
                  )}
                  {prError && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">⚠️ {prError}</div>}
                </div>
              )}
              {/* Step 2: Payment details */}
              {prStep === 2 && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-2 flex justify-between text-sm">
                    <span className="text-gray-500">可核銷上限：</span>
                    <span className="font-semibold text-gray-900 tabular-nums">{maxPRAmount.toFixed(2)}</span>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">本次收款金額 *</label>
                    <input type="number" min={0.01} max={maxPRAmount} step="0.01" value={prAmount}
                      onChange={(e) => { setPRAmount(e.target.value); setPRError(''); }}
                      placeholder={`最多 ${maxPRAmount.toFixed(2)}`}
                      className={`w-full bg-white border rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none ${prOverLimit ? 'border-red-500' : 'border-gray-300 focus:border-violet-500'}`} />
                    {prOverLimit && <p className="mt-1 text-xs text-red-600">⚠️ 核銷金額超過剩餘未收（{maxPRAmount.toFixed(2)}），請調整！</p>}
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">付款方式</label>
                    <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-violet-500">
                      {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">銀行流水號（選填）</label>
                    <input type="text" value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="e.g. TT2026022800001"
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-violet-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">備注（選填）</label>
                    <textarea value={prNotes} onChange={(e) => setPRNotes(e.target.value)} rows={2}
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-violet-500 resize-none" />
                  </div>
                  {prError && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">⚠️ {prError}</div>}
                </div>
              )}
            </div>
            <div className="flex justify-between gap-3 px-6 py-4 border-t border-gray-200">
              <div>
                {prStep > 1 && (
                  <button onClick={() => setPRStep((s) => (s - 1) as PRStep)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">← 上一步</button>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowPRModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">取消</button>
                {prStep === 1 && (
                  <button onClick={() => { if (checkedIds.size === 0) { setPRError('必須選擇至少一個發貨單號'); return; } setPRError(''); setPRStep(2); }}
                    disabled={outstanding.length === 0}
                    className="px-5 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-500 disabled:opacity-50 transition-colors">
                    下一步 →
                  </button>
                )}
                {prStep === 2 && (
                  <button onClick={handlePRSave} disabled={prSaving || !prAmountNum || prAmountNum <= 0 || prOverLimit}
                    className="px-5 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-500 disabled:opacity-50 transition-colors">
                    {prSaving ? '儲存中...' : '儲存草稿'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
