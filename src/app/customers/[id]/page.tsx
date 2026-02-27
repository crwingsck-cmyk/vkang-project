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
import {
  User, UserRole, Product, TransactionItem,
  SalesOrder, SalesOrderStatus,
  DeliveryNote, DeliveryNoteStatus,
  Receivable, ReceivableStatus,
  PaymentReceipt, PaymentReceiptStatus, PaymentReceiptItem,
} from '@/types/models';
import { generateDocumentNumber } from '@/lib/documentNumber';
import Link from 'next/link';

// ─── Labels & colours ────────────────────────────────────────────────────────

const soLabel: Record<SalesOrderStatus, string> = {
  [SalesOrderStatus.DRAFT]: '草稿',
  [SalesOrderStatus.SUBMITTED]: '待審核',
  [SalesOrderStatus.APPROVED]: '已審核',
  [SalesOrderStatus.CANCELLED]: '已取消',
};
const soColor: Record<SalesOrderStatus, string> = {
  [SalesOrderStatus.DRAFT]: 'bg-gray-700/60 text-gray-300',
  [SalesOrderStatus.SUBMITTED]: 'bg-yellow-900/40 text-yellow-300',
  [SalesOrderStatus.APPROVED]: 'bg-green-900/40 text-green-300',
  [SalesOrderStatus.CANCELLED]: 'bg-red-900/40 text-red-300',
};
const dnLabel: Record<DeliveryNoteStatus, string> = {
  [DeliveryNoteStatus.PENDING]: '待倉庫審核',
  [DeliveryNoteStatus.WAREHOUSE_APPROVED]: '已出庫',
  [DeliveryNoteStatus.DELIVERED]: '已送達',
  [DeliveryNoteStatus.CANCELLED]: '已取消',
};
const dnColor: Record<DeliveryNoteStatus, string> = {
  [DeliveryNoteStatus.PENDING]: 'bg-yellow-900/40 text-yellow-300',
  [DeliveryNoteStatus.WAREHOUSE_APPROVED]: 'bg-blue-900/40 text-blue-300',
  [DeliveryNoteStatus.DELIVERED]: 'bg-green-900/40 text-green-300',
  [DeliveryNoteStatus.CANCELLED]: 'bg-red-900/40 text-red-300',
};
const arLabel: Record<ReceivableStatus, string> = {
  [ReceivableStatus.OUTSTANDING]: '未收',
  [ReceivableStatus.PARTIAL_PAID]: '部分已收',
  [ReceivableStatus.PAID]: '已收清',
};
const arColor: Record<ReceivableStatus, string> = {
  [ReceivableStatus.OUTSTANDING]: 'bg-red-900/40 text-red-300',
  [ReceivableStatus.PARTIAL_PAID]: 'bg-yellow-900/40 text-yellow-300',
  [ReceivableStatus.PAID]: 'bg-green-900/40 text-green-300',
};
const prLabel: Record<PaymentReceiptStatus, string> = {
  [PaymentReceiptStatus.DRAFT]: '草稿',
  [PaymentReceiptStatus.SUBMITTED]: '待審核',
  [PaymentReceiptStatus.APPROVED]: '已審核',
  [PaymentReceiptStatus.CANCELLED]: '已取消',
};
const prColor: Record<PaymentReceiptStatus, string> = {
  [PaymentReceiptStatus.DRAFT]: 'bg-gray-700/60 text-gray-300',
  [PaymentReceiptStatus.SUBMITTED]: 'bg-yellow-900/40 text-yellow-300',
  [PaymentReceiptStatus.APPROVED]: 'bg-green-900/40 text-green-300',
  [PaymentReceiptStatus.CANCELLED]: 'bg-red-900/40 text-red-300',
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

type Tab = 'orders' | 'deliveries' | 'ar' | 'payments';
type PRStep = 1 | 2;

// ─── Component ────────────────────────────────────────────────────────────────

export default function CustomerFinancialPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? '';
  const { user } = useAuth();

  const [customer, setCustomer] = useState<User | null>(null);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryNote[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('orders');
  const [actionError, setActionError] = useState('');
  const [bulkBackfilling, setBulkBackfilling] = useState(false);

  // ── SO Modal ─────────────────────────────────────────────────────────────
  const [showSOModal, setShowSOModal] = useState(false);
  const [soItems, setSOItems] = useState<TransactionItem[]>([{ ...EMPTY_ITEM }]);
  const [soCurrency, setSOCurrency] = useState<'USD' | 'MYR'>('MYR');
  const [soNotes, setSONotes] = useState('');
  const [soSaving, setSOSaving] = useState(false);
  const [soError, setSOError] = useState('');
  const [creditWarning, setCreditWarning] = useState('');

  // ── DN Modal ─────────────────────────────────────────────────────────────
  const [showDNModal, setShowDNModal] = useState(false);
  const [approvedOrders, setApprovedOrders] = useState<SalesOrder[]>([]);
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
      const [cust, sos, dns, ars, prs, prods] = await Promise.all([
        UserService.getById(id),
        SalesOrderService.getByCustomer(id),
        DeliveryNoteService.getByToUser(id),
        ReceivableService.getByCustomer(id),
        PaymentReceiptService.getByCustomer(id),
        ProductService.getAll(),
      ]);
      setCustomer(cust);
      setOrders(sos);
      setDeliveries(dns);
      setReceivables(ars);
      setReceipts(prs);
      setProducts(prods.filter((p) => !p.isTemporary));
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

  const openSOModal = () => {
    setShowSOModal(true);
    setSOItems([{ ...EMPTY_ITEM }]);
    setSOCurrency('MYR');
    setSONotes('');
    setSOError('');
    setCreditWarning('');
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

  const handleSOSubmit = async (so: SalesOrder) => { await SalesOrderService.submit(so.id!); await load(); };
  const handleSOApprove = async (so: SalesOrder) => { await SalesOrderService.approve(so.id!); await load(); };
  const handleSOCancel = async (so: SalesOrder) => {
    if (!confirm(`確定取消訂單 ${so.orderNo}？`)) return;
    await SalesOrderService.cancel(so.id!); await load();
  };

  // ═════════════════════════════════════════════════════════════════════════
  // DN handlers
  // ═════════════════════════════════════════════════════════════════════════

  const openDNModal = async () => {
    setShowDNModal(true); setDNError(''); setItemErrors([]);
    setSelOrder(null); setDnItems([]); setCarrier(''); setTrackingNo(''); setDNNotes('');
    const approved = await SalesOrderService.getApprovedByCustomer(id);
    setApprovedOrders(approved);
  };

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

  const handleDNWarehouseApprove = async (dn: DeliveryNote) => {
    setActionError('');
    try { await DeliveryNoteService.warehouseApprove(dn.id!, user?.id ?? ''); await load(); }
    catch (e: any) { setActionError(e.message ?? '審核失敗'); }
  };
  const handleDNMarkDelivered = async (dn: DeliveryNote) => { await DeliveryNoteService.markDelivered(dn.id!); await load(); };
  const handleDNCancel = async (dn: DeliveryNote) => {
    if (!confirm(`確定取消發貨單 ${dn.deliveryNo}？`)) return;
    await DeliveryNoteService.cancel(dn.id!); await load();
  };

  /** 為舊 DN（已出庫但缺少 AR）補建應收款記錄 */
  const handleBackfillAR = async (dn: DeliveryNote) => {
    setActionError('');
    try {
      await ReceivableService.create({
        deliveryNoteId: dn.id!,
        deliveryNoteNo: dn.deliveryNo,
        salesOrderId: dn.salesOrderId,
        salesOrderNo: dn.salesOrderNo,
        customerId: dn.toUserId,
        customerName: dn.toUserName,
        fromUserId: dn.fromUserId,
        totalAmount: dn.totals.grandTotal,
        paidAmount: 0,
        remainingAmount: dn.totals.grandTotal,
        status: ReceivableStatus.OUTSTANDING,
      });
      await load();
    } catch (e: any) {
      setActionError(e.message ?? '補建失敗');
    }
  };

  const handleBulkBackfillAR = async () => {
    const missing = deliveries.filter(
      (dn) =>
        (dn.status === DeliveryNoteStatus.WAREHOUSE_APPROVED || dn.status === DeliveryNoteStatus.DELIVERED) &&
        !arDnIds.has(dn.id!),
    );
    if (missing.length === 0) return;
    setBulkBackfilling(true);
    setActionError('');
    try {
      for (const dn of missing) {
        await ReceivableService.create({
          deliveryNoteId: dn.id!,
          deliveryNoteNo: dn.deliveryNo,
          salesOrderId: dn.salesOrderId,
          salesOrderNo: dn.salesOrderNo,
          customerId: dn.toUserId,
          customerName: dn.toUserName,
          fromUserId: dn.fromUserId,
          totalAmount: dn.totals.grandTotal,
          paidAmount: 0,
          remainingAmount: dn.totals.grandTotal,
          status: ReceivableStatus.OUTSTANDING,
        });
      }
      await load();
    } catch (e: any) {
      setActionError(e.message ?? '批量補建失敗');
    } finally {
      setBulkBackfilling(false);
    }
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
        <Link href="/customers" className="inline-flex items-center gap-1.5 text-xs text-txt-subtle hover:text-accent-text transition-colors">
          ← 返回客戶列表
        </Link>

        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3" />
            <p className="text-txt-subtle text-sm">載入中...</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="glass-card p-5">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <div>
                  <h1 className="text-xl font-bold text-txt-primary">{customer?.displayName ?? '—'}</h1>
                  <p className="text-sm text-txt-subtle">{customer?.email}</p>
                  {customer?.company?.name && (
                    <p className="text-xs text-txt-subtle mt-0.5">{customer.company.name}</p>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div>
                    <p className="text-xl font-bold text-red-400 tabular-nums">
                      {totalOutstanding > 0 ? totalOutstanding.toFixed(0) : '0'}
                    </p>
                    <p className="text-xs text-txt-subtle mt-0.5">未收款</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-txt-primary tabular-nums">{orders.length}</p>
                    <p className="text-xs text-txt-subtle mt-0.5">訂貨單</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-txt-primary tabular-nums">{deliveries.length}</p>
                    <p className="text-xs text-txt-subtle mt-0.5">發貨單</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-green-400 tabular-nums">
                      {totalPaid > 0 ? totalPaid.toFixed(0) : '0'}
                    </p>
                    <p className="text-xs text-txt-subtle mt-0.5">已收款</p>
                  </div>
                </div>
              </div>
            </div>

            {actionError && (
              <div className="rounded-lg bg-red-900/40 border border-red-600/50 px-4 py-3 text-sm text-red-300">
                {actionError}
              </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-border">
              {([
                { key: 'orders', label: `訂貨單（${orders.length}）` },
                { key: 'deliveries', label: `發貨單（${deliveries.length}）` },
                { key: 'ar', label: `應收款（${receivables.length}）` },
                { key: 'payments', label: `收款記錄（${receipts.length}）` },
              ] as { key: Tab; label: string }[]).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    tab === t.key
                      ? 'border-accent text-accent-text'
                      : 'border-transparent text-txt-subtle hover:text-txt-primary'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── Tab: 訂貨單 ────────────────────────────────────────────── */}
            {tab === 'orders' && (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <button
                    onClick={openSOModal}
                    className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
                  >
                    + 新增訂單
                  </button>
                </div>
                {orders.length === 0 ? (
                  <div className="glass-card p-10 text-center"><p className="text-txt-subtle text-sm">尚無訂貨單</p></div>
                ) : (
                  <div className="glass-card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-txt-subtle text-xs uppercase tracking-wide">
                          <th className="px-4 py-3 text-left">訂單號</th>
                          <th className="px-4 py-3 text-left">日期</th>
                          <th className="px-4 py-3 text-right">品項</th>
                          <th className="px-4 py-3 text-right">總額</th>
                          <th className="px-4 py-3 text-center">狀態</th>
                          <th className="px-4 py-3 text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {orders.map((so) => (
                          <tr key={so.id} className="hover:bg-surface-2/50 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs text-accent-text">{so.orderNo}</td>
                            <td className="px-4 py-3 text-txt-subtle text-xs">
                              {so.createdAt ? new Date(so.createdAt).toLocaleDateString('zh-TW') : '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-txt-secondary">{so.items.length}</td>
                            <td className="px-4 py-3 text-right font-medium tabular-nums">
                              {so.currency ?? 'MYR'} {so.totals.grandTotal.toFixed(2)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${soColor[so.status]}`}>
                                {soLabel[so.status]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {so.status === SalesOrderStatus.DRAFT && (
                                  <button onClick={() => handleSOSubmit(so)} className="text-xs px-2 py-1 rounded bg-yellow-800/40 text-yellow-300 hover:bg-yellow-700/50">提交</button>
                                )}
                                {so.status === SalesOrderStatus.SUBMITTED && (
                                  <button onClick={() => handleSOApprove(so)} className="text-xs px-2 py-1 rounded bg-green-800/40 text-green-300 hover:bg-green-700/50">審核</button>
                                )}
                                {(so.status === SalesOrderStatus.DRAFT || so.status === SalesOrderStatus.SUBMITTED) && (
                                  <button onClick={() => handleSOCancel(so)} className="text-xs px-2 py-1 rounded bg-red-900/40 text-red-300 hover:bg-red-800/50">取消</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: 發貨單 ────────────────────────────────────────────── */}
            {tab === 'deliveries' && (
              <div className="space-y-4">
                <div className="flex justify-end gap-2">
                  {deliveries.some(
                    (dn) =>
                      (dn.status === DeliveryNoteStatus.WAREHOUSE_APPROVED || dn.status === DeliveryNoteStatus.DELIVERED) &&
                      !arDnIds.has(dn.id!),
                  ) && (
                    <button
                      onClick={handleBulkBackfillAR}
                      disabled={bulkBackfilling}
                      className="px-4 py-2 bg-purple-800/50 text-purple-300 rounded-lg text-sm font-medium hover:bg-purple-700/60 transition-colors disabled:opacity-50"
                    >
                      {bulkBackfilling
                        ? '補建中…'
                        : `一次補建全部應收款（${deliveries.filter((dn) => (dn.status === DeliveryNoteStatus.WAREHOUSE_APPROVED || dn.status === DeliveryNoteStatus.DELIVERED) && !arDnIds.has(dn.id!)).length} 筆）`}
                    </button>
                  )}
                  <button
                    onClick={openDNModal}
                    className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
                  >
                    + 新增發貨單
                  </button>
                </div>
                {deliveries.length === 0 ? (
                  <div className="glass-card p-10 text-center"><p className="text-txt-subtle text-sm">尚無發貨單</p></div>
                ) : (
                  <div className="glass-card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-txt-subtle text-xs uppercase tracking-wide">
                          <th className="px-4 py-3 text-left">發貨單號</th>
                          <th className="px-4 py-3 text-left">關聯訂單</th>
                          <th className="px-4 py-3 text-left">日期</th>
                          <th className="px-4 py-3 text-right">總額</th>
                          <th className="px-4 py-3 text-center">狀態</th>
                          <th className="px-4 py-3 text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {deliveries.map((dn) => (
                          <tr key={dn.id} className="hover:bg-surface-2/50 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs text-accent-text">{dn.deliveryNo}</td>
                            <td className="px-4 py-3 font-mono text-xs text-txt-subtle">{dn.salesOrderNo}</td>
                            <td className="px-4 py-3 text-txt-subtle text-xs">
                              {dn.createdAt ? new Date(dn.createdAt).toLocaleDateString('zh-TW') : '—'}
                            </td>
                            <td className="px-4 py-3 text-right font-medium tabular-nums">{dn.totals.grandTotal.toFixed(2)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${dnColor[dn.status]}`}>
                                {dnLabel[dn.status]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {dn.status === DeliveryNoteStatus.PENDING && (
                                  <button onClick={() => handleDNWarehouseApprove(dn)} className="text-xs px-2 py-1 rounded bg-blue-800/40 text-blue-300 hover:bg-blue-700/50">倉庫審核</button>
                                )}
                                {dn.status === DeliveryNoteStatus.WAREHOUSE_APPROVED && (
                                  <button onClick={() => handleDNMarkDelivered(dn)} className="text-xs px-2 py-1 rounded bg-green-800/40 text-green-300 hover:bg-green-700/50">標記送達</button>
                                )}
                                {(dn.status === DeliveryNoteStatus.WAREHOUSE_APPROVED || dn.status === DeliveryNoteStatus.DELIVERED) && !arDnIds.has(dn.id!) && (
                                  <button onClick={() => handleBackfillAR(dn)} className="text-xs px-2 py-1 rounded bg-purple-800/40 text-purple-300 hover:bg-purple-700/50">補建應收款</button>
                                )}
                                {dn.status === DeliveryNoteStatus.PENDING && (
                                  <button onClick={() => handleDNCancel(dn)} className="text-xs px-2 py-1 rounded bg-red-900/40 text-red-300 hover:bg-red-800/50">取消</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: 應收款 ────────────────────────────────────────────── */}
            {tab === 'ar' && (
              <div className="space-y-4">
                {receivables.length === 0 ? (
                  <div className="glass-card p-10 text-center">
                    <p className="text-txt-subtle text-sm">尚無應收款記錄（倉庫審核發貨單後自動生成）</p>
                  </div>
                ) : (
                  <div className="glass-card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-txt-subtle text-xs uppercase tracking-wide">
                          <th className="px-4 py-3 text-left">發貨單號</th>
                          <th className="px-4 py-3 text-right">總額</th>
                          <th className="px-4 py-3 text-right">已收</th>
                          <th className="px-4 py-3 text-right">未收</th>
                          <th className="px-4 py-3 text-center">狀態</th>
                          <th className="px-4 py-3 text-center">帳齡</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {receivables.map((r) => (
                          <tr key={r.id} className="hover:bg-surface-2/50 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs text-accent-text">{r.deliveryNoteNo}</td>
                            <td className="px-4 py-3 text-right tabular-nums">{r.totalAmount.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right tabular-nums text-green-400">
                              {r.paidAmount > 0 ? r.paidAmount.toFixed(2) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-red-400 font-medium">
                              {r.remainingAmount > 0 ? r.remainingAmount.toFixed(2) : '—'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${arColor[r.status]}`}>
                                {arLabel[r.status]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center text-xs text-txt-subtle">
                              {r.status !== ReceivableStatus.PAID ? agingLabel(r.createdAt) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: 收款記錄 ───────────────────────────────────────────── */}
            {tab === 'payments' && (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <button
                    onClick={openPRModal}
                    className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
                  >
                    + 新增收款單
                  </button>
                </div>
                {receipts.length === 0 ? (
                  <div className="glass-card p-10 text-center"><p className="text-txt-subtle text-sm">尚無收款記錄</p></div>
                ) : (
                  <div className="glass-card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-txt-subtle text-xs uppercase tracking-wide">
                          <th className="px-4 py-3 text-left">收款單號</th>
                          <th className="px-4 py-3 text-left">日期</th>
                          <th className="px-4 py-3 text-left">核銷發貨單</th>
                          <th className="px-4 py-3 text-right">金額</th>
                          <th className="px-4 py-3 text-center">狀態</th>
                          <th className="px-4 py-3 text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {receipts.map((pr) => (
                          <tr key={pr.id} className="hover:bg-surface-2/50 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs text-accent-text">{pr.receiptNo}</td>
                            <td className="px-4 py-3 text-txt-subtle text-xs">
                              {pr.createdAt ? new Date(pr.createdAt).toLocaleDateString('zh-TW') : '—'}
                            </td>
                            <td className="px-4 py-3 text-xs text-txt-subtle">{pr.items.map((i) => i.deliveryNoteNo).join(', ')}</td>
                            <td className="px-4 py-3 text-right font-medium tabular-nums">{pr.totalAmount.toFixed(2)}</td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${prColor[pr.status]}`}>
                                {prLabel[pr.status]}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {pr.status === PaymentReceiptStatus.DRAFT && (
                                  <button onClick={() => handlePRSubmit(pr)} className="text-xs px-2 py-1 rounded bg-yellow-800/40 text-yellow-300 hover:bg-yellow-700/50">提交</button>
                                )}
                                {pr.status === PaymentReceiptStatus.SUBMITTED && (
                                  <button onClick={() => handlePRApprove(pr)} className="text-xs px-2 py-1 rounded bg-green-800/40 text-green-300 hover:bg-green-700/50">審核</button>
                                )}
                                {(pr.status === PaymentReceiptStatus.DRAFT || pr.status === PaymentReceiptStatus.SUBMITTED) && (
                                  <button onClick={() => handlePRCancel(pr)} className="text-xs px-2 py-1 rounded bg-red-900/40 text-red-300 hover:bg-red-800/50">取消</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══════════════ SO Modal ═══════════════ */}
      {showSOModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h2 className="text-base font-semibold text-txt-primary">新增訂貨單 — {customer?.displayName}</h2>
              <button onClick={() => setShowSOModal(false)} className="text-txt-subtle hover:text-txt-primary text-lg leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
              {creditWarning && (
                <div className="rounded-lg bg-red-900/40 border border-red-600/50 px-4 py-3 text-sm text-red-300">
                  ⚠️ 信用額度超限：{creditWarning}
                </div>
              )}
              {/* Currency */}
              <div>
                <label className="block text-xs text-txt-subtle mb-1">幣別</label>
                <div className="flex gap-3">
                  {(['MYR', 'USD'] as const).map((cur) => (
                    <label key={cur} className="flex items-center gap-1.5 text-sm text-txt-secondary cursor-pointer">
                      <input type="radio" name="so-currency" value={cur} checked={soCurrency === cur} onChange={() => setSOCurrency(cur)} className="accent-accent" />
                      {cur}
                    </label>
                  ))}
                </div>
              </div>
              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-txt-subtle">品項 *</label>
                  <button onClick={() => setSOItems((p) => [...p, { ...EMPTY_ITEM }])} className="text-xs text-accent-text hover:underline">+ 新增一行</button>
                </div>
                <div className="space-y-2">
                  {soItems.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5">
                        <select value={item.productId} onChange={(e) => updateSOItem(idx, 'productId', e.target.value)}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-txt-primary focus:outline-none focus:border-accent">
                          <option value="">— 選商品 —</option>
                          {products.map((p) => <option key={p.id} value={p.id ?? p.sku}>{p.name}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <input type="number" min={1} value={item.quantity} onChange={(e) => updateSOItem(idx, 'quantity', Number(e.target.value))}
                          placeholder="數量" className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-txt-primary focus:outline-none focus:border-accent" />
                      </div>
                      <div className="col-span-3">
                        <input type="number" min={0} step="0.01" value={item.unitPrice} onChange={(e) => updateSOItem(idx, 'unitPrice', Number(e.target.value))}
                          placeholder="單價" className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-txt-primary focus:outline-none focus:border-accent" />
                      </div>
                      <div className="col-span-1 text-right text-xs text-txt-subtle tabular-nums">{item.total.toFixed(0)}</div>
                      <div className="col-span-1 text-right">
                        {soItems.length > 1 && <button onClick={() => setSOItems((p) => p.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-300 text-xs">✕</button>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-right text-sm font-semibold text-txt-primary tabular-nums">
                  總計：{soCurrency} {soGrandTotal.toFixed(2)}
                </div>
              </div>
              {/* Notes */}
              <div>
                <label className="block text-xs text-txt-subtle mb-1">備注（選填）</label>
                <textarea value={soNotes} onChange={(e) => setSONotes(e.target.value)} rows={2}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-accent resize-none" />
              </div>
              {soError && <p className="text-sm text-red-400 bg-red-900/30 px-3 py-2 rounded-lg">{soError}</p>}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-700">
              <button onClick={() => setShowSOModal(false)} className="px-4 py-2 text-sm text-txt-secondary hover:text-txt-primary transition-colors">取消</button>
              <button onClick={handleSOSave} disabled={soSaving}
                className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors">
                {soSaving ? '儲存中...' : '儲存草稿'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ DN Modal ═══════════════ */}
      {showDNModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h2 className="text-base font-semibold text-txt-primary">新增發貨單 — {customer?.displayName}</h2>
              <button onClick={() => setShowDNModal(false)} className="text-txt-subtle hover:text-txt-primary text-lg leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
              <div>
                <label className="block text-xs text-txt-subtle mb-1">關聯銷售訂單（已審核）*</label>
                <select value={selOrder?.id ?? ''} onChange={(e) => handleOrderSelect(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-accent">
                  <option value="">— 選擇已審核訂單 —</option>
                  {approvedOrders.map((o) => (
                    <option key={o.id} value={o.id}>{o.orderNo} | {o.currency ?? 'MYR'} {o.totals.grandTotal.toFixed(2)}</option>
                  ))}
                </select>
                {approvedOrders.length === 0 && (
                  <p className="mt-1 text-xs text-yellow-400">此客戶目前沒有已審核的訂單。</p>
                )}
              </div>
              {selOrder && dnItems.length > 0 && (
                <div>
                  <label className="block text-xs text-txt-subtle mb-2">實際出貨數量（不可超過訂單數量）</label>
                  <div className="space-y-2">
                    {dnItems.map((item, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-6 text-sm text-txt-primary">{item.productName}</div>
                          <div className="col-span-3">
                            <input type="number" min={0} max={selOrder.items[idx]?.quantity ?? 0} value={item.quantity}
                              onChange={(e) => updateDnQty(idx, Number(e.target.value))}
                              className={`w-full bg-gray-700 border rounded-lg px-2 py-1.5 text-xs text-txt-primary focus:outline-none ${itemErrors[idx] ? 'border-red-500' : 'border-gray-600 focus:border-accent'}`} />
                          </div>
                          <div className="col-span-2 text-xs text-txt-subtle text-center">/ {selOrder.items[idx]?.quantity ?? 0}</div>
                          <div className="col-span-1 text-xs text-right tabular-nums text-txt-secondary">{item.total.toFixed(0)}</div>
                        </div>
                        {itemErrors[idx] && <p className="text-xs text-red-400">{itemErrors[idx]}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-right text-sm font-semibold text-txt-primary tabular-nums">
                    總計：{selOrder.currency ?? 'MYR'} {dnItems.reduce((s, i) => s + i.total, 0).toFixed(2)}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-txt-subtle mb-1">物流商（選填）</label>
                  <input type="text" value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="e.g. J&T"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="block text-xs text-txt-subtle mb-1">追蹤號碼（選填）</label>
                  <input type="text" value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} placeholder="e.g. JT123"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-accent" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-txt-subtle mb-1">備注（選填）</label>
                <textarea value={dnNotes} onChange={(e) => setDNNotes(e.target.value)} rows={2}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-accent resize-none" />
              </div>
              {dnError && <p className="text-sm text-red-400 bg-red-900/30 px-3 py-2 rounded-lg">{dnError}</p>}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-700">
              <button onClick={() => setShowDNModal(false)} className="px-4 py-2 text-sm text-txt-secondary hover:text-txt-primary transition-colors">取消</button>
              <button onClick={handleDNSave} disabled={dnSaving || !selOrder || hasQtyError}
                className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors">
                {dnSaving ? '儲存中...' : '建立發貨單'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ PR Modal ═══════════════ */}
      {showPRModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <div>
                <h2 className="text-base font-semibold text-txt-primary">新增收款單 — {customer?.displayName}</h2>
                <div className="flex items-center gap-2 mt-1">
                  {([1, 2] as PRStep[]).map((s) => (
                    <div key={s} className="flex items-center gap-1">
                      <div className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-medium ${prStep === s ? 'bg-accent text-white' : prStep > s ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-400'}`}>{s}</div>
                      {s < 2 && <div className={`w-6 h-px ${prStep > s ? 'bg-green-600' : 'bg-gray-600'}`} />}
                    </div>
                  ))}
                  <span className="text-xs text-txt-subtle ml-1">{prStep === 1 ? '選發貨單號' : '填寫收款'}</span>
                </div>
              </div>
              <button onClick={() => setShowPRModal(false)} className="text-txt-subtle hover:text-txt-primary text-lg leading-none">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4">
              {/* Step 1: Select DNs */}
              {prStep === 1 && (
                <div className="space-y-4">
                  {outstanding.length === 0 ? (
                    <div className="rounded-lg bg-yellow-900/30 border border-yellow-700/50 px-4 py-3">
                      <p className="text-yellow-300 text-sm font-medium">此客戶目前沒有未收的應收款</p>
                      <p className="text-yellow-400/70 text-xs mt-1">請確認已有已出庫的發貨單</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-txt-subtle">勾選要核銷的發貨單號（必須至少選一個）：</p>
                      <div className="space-y-2">
                        {outstanding.map((r) => (
                          <label key={r.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${checkedIds.has(r.id!) ? 'border-accent/50 bg-accent/10' : 'border-gray-600 hover:border-gray-500 bg-gray-700/50'}`}>
                            <input type="checkbox" checked={checkedIds.has(r.id!)} onChange={() => toggleCheck(r.id!)} className="accent-accent" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-mono text-accent-text">{r.deliveryNoteNo}</p>
                              <p className="text-xs text-txt-subtle">訂單：{r.salesOrderNo}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs text-txt-subtle">總額 {r.totalAmount.toFixed(2)}</p>
                              <p className="text-sm font-semibold text-red-400 tabular-nums">未收 {r.remainingAmount.toFixed(2)}</p>
                            </div>
                          </label>
                        ))}
                      </div>
                      {checkedIds.size > 0 && (
                        <div className="rounded-lg bg-surface-2 px-4 py-2 flex justify-between text-sm">
                          <span className="text-txt-subtle">可核銷上限：</span>
                          <span className="font-semibold text-txt-primary tabular-nums">{maxPRAmount.toFixed(2)}</span>
                        </div>
                      )}
                    </>
                  )}
                  {prError && <div className="rounded-lg bg-red-900/40 border border-red-600/50 px-4 py-3 text-sm text-red-300">⚠️ {prError}</div>}
                </div>
              )}
              {/* Step 2: Payment details */}
              {prStep === 2 && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-surface-2 px-4 py-2 flex justify-between text-sm">
                    <span className="text-txt-subtle">可核銷上限：</span>
                    <span className="font-semibold text-txt-primary tabular-nums">{maxPRAmount.toFixed(2)}</span>
                  </div>
                  <div>
                    <label className="block text-xs text-txt-subtle mb-1">本次收款金額 *</label>
                    <input type="number" min={0.01} max={maxPRAmount} step="0.01" value={prAmount}
                      onChange={(e) => { setPRAmount(e.target.value); setPRError(''); }}
                      placeholder={`最多 ${maxPRAmount.toFixed(2)}`}
                      className={`w-full bg-gray-700 border rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none ${prOverLimit ? 'border-red-500' : 'border-gray-600 focus:border-accent'}`} />
                    {prOverLimit && <p className="mt-1 text-xs text-red-400">⚠️ 核銷金額超過剩餘未收（{maxPRAmount.toFixed(2)}），請調整！</p>}
                  </div>
                  <div>
                    <label className="block text-xs text-txt-subtle mb-1">付款方式</label>
                    <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-accent">
                      {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-txt-subtle mb-1">銀行流水號（選填）</label>
                    <input type="text" value={payRef} onChange={(e) => setPayRef(e.target.value)} placeholder="e.g. TT2026022800001"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="block text-xs text-txt-subtle mb-1">備注（選填）</label>
                    <textarea value={prNotes} onChange={(e) => setPRNotes(e.target.value)} rows={2}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-accent resize-none" />
                  </div>
                  {prError && <div className="rounded-lg bg-red-900/40 border border-red-600/50 px-4 py-3 text-sm text-red-300">⚠️ {prError}</div>}
                </div>
              )}
            </div>
            <div className="flex justify-between gap-3 px-6 py-4 border-t border-gray-700">
              <div>
                {prStep > 1 && (
                  <button onClick={() => setPRStep((s) => (s - 1) as PRStep)} className="px-4 py-2 text-sm text-txt-secondary hover:text-txt-primary transition-colors">← 上一步</button>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowPRModal(false)} className="px-4 py-2 text-sm text-txt-secondary hover:text-txt-primary transition-colors">取消</button>
                {prStep === 1 && (
                  <button onClick={() => { if (checkedIds.size === 0) { setPRError('必須選擇至少一個發貨單號'); return; } setPRError(''); setPRStep(2); }}
                    disabled={outstanding.length === 0}
                    className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors">
                    下一步 →
                  </button>
                )}
                {prStep === 2 && (
                  <button onClick={handlePRSave} disabled={prSaving || !prAmountNum || prAmountNum <= 0 || prOverLimit}
                    className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors">
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
