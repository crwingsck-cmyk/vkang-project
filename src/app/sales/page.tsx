'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { SalesOrderService } from '@/services/database/salesOrders';
import { UserService } from '@/services/database/users';
import { ProductService } from '@/services/database/products';
import { SalesOrder, SalesOrderStatus, UserRole, TransactionItem, User, Product } from '@/types/models';
import { generateDocumentNumber } from '@/lib/documentNumber';

const statusLabel: Record<SalesOrderStatus, string> = {
  [SalesOrderStatus.DRAFT]: '草稿',
  [SalesOrderStatus.SUBMITTED]: '待審核',
  [SalesOrderStatus.APPROVED]: '已審核',
  [SalesOrderStatus.CANCELLED]: '已取消',
};

const statusColors: Record<SalesOrderStatus, string> = {
  [SalesOrderStatus.DRAFT]: 'bg-gray-700/60 text-gray-300',
  [SalesOrderStatus.SUBMITTED]: 'bg-yellow-900/40 text-yellow-300',
  [SalesOrderStatus.APPROVED]: 'bg-green-900/40 text-green-300',
  [SalesOrderStatus.CANCELLED]: 'bg-red-900/40 text-red-300',
};

const EMPTY_ITEM: TransactionItem = {
  productId: '',
  productName: '',
  quantity: 1,
  unitPrice: 0,
  total: 0,
};

export default function SalesPage() {
  const { user, role } = useAuth();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<SalesOrderStatus | 'ALL'>('ALL');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [customers, setCustomers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [creditWarning, setCreditWarning] = useState('');

  // Form state
  const [selCustomer, setSelCustomer] = useState<User | null>(null);
  const [items, setItems] = useState<TransactionItem[]>([{ ...EMPTY_ITEM }]);
  const [notes, setNotes] = useState('');
  const [currency, setCurrency] = useState<'USD' | 'MYR'>('MYR');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list =
        role === UserRole.ADMIN
          ? await SalesOrderService.getAll()
          : await SalesOrderService.getByFromUser(user?.id ?? '');
      setOrders(list);
    } finally {
      setLoading(false);
    }
  }, [role, user?.id]);

  useEffect(() => { load(); }, [load]);

  const openModal = async () => {
    setShowModal(true);
    setModalError('');
    setCreditWarning('');
    setSelCustomer(null);
    setItems([{ ...EMPTY_ITEM }]);
    setNotes('');
    setCurrency('MYR');
    const [custs, prods] = await Promise.all([
      UserService.getByRole(UserRole.CUSTOMER),
      ProductService.getAll(),
    ]);
    setCustomers(custs);
    setProducts(prods.filter((p) => !p.isTemporary));
  };

  const grandTotal = items.reduce((s, i) => s + i.total, 0);

  const checkCredit = (customer: User | null, total: number) => {
    if (!customer) return;
    const limit = customer.creditLimit ?? 0;
    const used = customer.creditUsed ?? 0;
    if (limit > 0 && used + total > limit) {
      setCreditWarning(
        `此客戶信用額度 ${currency} ${limit.toFixed(0)}，已用 ${currency} ${used.toFixed(0)}，本單 ${currency} ${total.toFixed(0)}，超限 ${currency} ${(used + total - limit).toFixed(0)}。`
      );
    } else {
      setCreditWarning('');
    }
  };

  const handleCustomerChange = (id: string) => {
    const c = customers.find((u) => u.id === id) ?? null;
    setSelCustomer(c);
    checkCredit(c, grandTotal);
  };

  const updateItem = (idx: number, field: keyof TransactionItem, value: string | number) => {
    setItems((prev) => {
      const next = [...prev];
      const row = { ...next[idx], [field]: value } as TransactionItem;
      if (field === 'productId') {
        const p = products.find((x) => x.id === value || x.sku === value);
        if (p) {
          row.productName = p.name;
          row.unitPrice = p.unitPrice;
          row.total = row.quantity * p.unitPrice;
        }
      }
      if (field === 'quantity' || field === 'unitPrice') {
        row.total = Number(row.quantity) * Number(row.unitPrice);
      }
      next[idx] = row;
      checkCredit(selCustomer, next.reduce((s, i) => s + i.total, 0));
      return next;
    });
  };

  const addItem = () => setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!selCustomer) { setModalError('請選擇客戶'); return; }
    if (items.some((i) => !i.productId)) { setModalError('請選擇每一行的商品'); return; }
    if (items.some((i) => i.quantity <= 0)) { setModalError('數量必須大於 0'); return; }
    setSaving(true);
    setModalError('');
    try {
      const existingNos = await SalesOrderService.getAllOrderNos();
      const orderNo = generateDocumentNumber('SO', existingNos);
      const subtotal = items.reduce((s, i) => s + i.total, 0);
      await SalesOrderService.create({
        orderNo,
        status: SalesOrderStatus.DRAFT,
        fromUserId: user?.id ?? '',
        fromUserName: user?.displayName ?? user?.email ?? '',
        customerId: selCustomer.id!,
        customerName: selCustomer.displayName,
        items,
        totals: { subtotal, grandTotal: subtotal },
        currency,
        notes: notes || undefined,
        creditCheckPassed: creditWarning ? false : true,
        createdBy: user?.id,
      });
      setShowModal(false);
      await load();
    } catch (e: any) {
      setModalError(e.message ?? '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (so: SalesOrder) => {
    await SalesOrderService.submit(so.id!);
    await load();
  };

  const handleApprove = async (so: SalesOrder) => {
    await SalesOrderService.approve(so.id!);
    await load();
  };

  const handleCancel = async (so: SalesOrder) => {
    if (!confirm(`確定取消訂單 ${so.orderNo}？`)) return;
    await SalesOrderService.cancel(so.id!);
    await load();
  };

  const visible = filter === 'ALL' ? orders : orders.filter((o) => o.status === filter);
  const counts = {
    all: orders.length,
    submitted: orders.filter((o) => o.status === SalesOrderStatus.SUBMITTED).length,
    approved: orders.filter((o) => o.status === SalesOrderStatus.APPROVED).length,
  };

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-txt-primary tracking-tight">銷售訂單</h1>
            <p className="text-sm text-txt-subtle mt-0.5">管理客戶銷售訂單，審核後方可建立發貨單</p>
          </div>
          <button
            onClick={openModal}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            + 新增訂單
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: '全部', value: counts.all, color: 'text-txt-primary' },
            { label: '待審核', value: counts.submitted, color: 'text-yellow-400' },
            { label: '已審核', value: counts.approved, color: 'text-green-400' },
          ].map((s) => (
            <div key={s.label} className="glass-card p-4 text-center">
              <p className="text-2xl font-bold tabular-nums" style={{ color: 'inherit' }}>
                <span className={s.color}>{s.value}</span>
              </p>
              <p className="text-xs text-txt-subtle mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          {(['ALL', ...Object.values(SalesOrderStatus)] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filter === s
                  ? 'bg-accent/20 text-accent-text border border-accent/40'
                  : 'text-txt-subtle hover:text-txt-primary hover:bg-surface-2 border border-transparent'
              }`}
            >
              {s === 'ALL' ? '全部' : statusLabel[s]}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3" />
            <p className="text-txt-subtle text-sm">載入中...</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <p className="text-txt-subtle text-sm">沒有符合條件的訂單</p>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-txt-subtle text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">訂單號</th>
                  <th className="px-4 py-3 text-left">日期</th>
                  <th className="px-4 py-3 text-left">客戶</th>
                  <th className="px-4 py-3 text-right">品項</th>
                  <th className="px-4 py-3 text-right">總額</th>
                  <th className="px-4 py-3 text-center">狀態</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((so) => (
                  <tr key={so.id} className="hover:bg-surface-2/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-accent-text">{so.orderNo}</td>
                    <td className="px-4 py-3 text-txt-subtle">
                      {so.createdAt ? new Date(so.createdAt).toLocaleDateString('zh-TW') : '—'}
                    </td>
                    <td className="px-4 py-3 text-txt-primary">{so.customerName}</td>
                    <td className="px-4 py-3 text-right text-txt-secondary">{so.items.length}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {so.currency ?? 'MYR'} {so.totals.grandTotal.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[so.status]}`}>
                        {statusLabel[so.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {so.status === SalesOrderStatus.DRAFT && (
                          <button
                            onClick={() => handleSubmit(so)}
                            className="text-xs px-2 py-1 rounded bg-yellow-800/40 text-yellow-300 hover:bg-yellow-700/50"
                          >
                            提交
                          </button>
                        )}
                        {so.status === SalesOrderStatus.SUBMITTED && role === UserRole.ADMIN && (
                          <button
                            onClick={() => handleApprove(so)}
                            className="text-xs px-2 py-1 rounded bg-green-800/40 text-green-300 hover:bg-green-700/50"
                          >
                            審核
                          </button>
                        )}
                        {(so.status === SalesOrderStatus.DRAFT || so.status === SalesOrderStatus.SUBMITTED) && (
                          <button
                            onClick={() => handleCancel(so)}
                            className="text-xs px-2 py-1 rounded bg-red-900/40 text-red-300 hover:bg-red-800/50"
                          >
                            取消
                          </button>
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

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h2 className="text-base font-semibold text-txt-primary">新增銷售訂單</h2>
              <button onClick={() => setShowModal(false)} className="text-txt-subtle hover:text-txt-primary text-lg leading-none">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
              {/* Credit warning */}
              {creditWarning && (
                <div className="rounded-lg bg-red-900/40 border border-red-600/50 px-4 py-3 text-sm text-red-300">
                  ⚠️ 信用額度超限：{creditWarning}
                  <p className="mt-1 text-xs text-red-400">此訂單需管理員特批後才可審核。</p>
                </div>
              )}

              {/* Customer */}
              <div>
                <label className="block text-xs text-txt-subtle mb-1">客戶 *</label>
                <select
                  value={selCustomer?.id ?? ''}
                  onChange={(e) => handleCustomerChange(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-accent"
                >
                  <option value="">— 選擇客戶 —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.displayName}</option>
                  ))}
                </select>
              </div>

              {/* Currency */}
              <div>
                <label className="block text-xs text-txt-subtle mb-1">幣別</label>
                <div className="flex gap-3">
                  {(['MYR', 'USD'] as const).map((cur) => (
                    <label key={cur} className="flex items-center gap-1.5 text-sm text-txt-secondary cursor-pointer">
                      <input
                        type="radio"
                        name="currency"
                        value={cur}
                        checked={currency === cur}
                        onChange={() => setCurrency(cur)}
                        className="accent-accent"
                      />
                      {cur}
                    </label>
                  ))}
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-txt-subtle">品項 *</label>
                  <button onClick={addItem} className="text-xs text-accent-text hover:underline">+ 新增一行</button>
                </div>
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-5">
                        <select
                          value={item.productId}
                          onChange={(e) => updateItem(idx, 'productId', e.target.value)}
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-txt-primary focus:outline-none focus:border-accent"
                        >
                          <option value="">— 選商品 —</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id ?? p.sku}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) => updateItem(idx, 'quantity', Number(e.target.value))}
                          placeholder="數量"
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-txt-primary focus:outline-none focus:border-accent"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(idx, 'unitPrice', Number(e.target.value))}
                          placeholder="單價"
                          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-2 py-1.5 text-xs text-txt-primary focus:outline-none focus:border-accent"
                        />
                      </div>
                      <div className="col-span-1 text-right text-xs text-txt-subtle tabular-nums">
                        {item.total.toFixed(0)}
                      </div>
                      <div className="col-span-1 text-right">
                        {items.length > 1 && (
                          <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-right text-sm font-semibold text-txt-primary tabular-nums">
                  總計：{currency} {grandTotal.toFixed(2)}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs text-txt-subtle mb-1">備注（選填）</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-accent resize-none"
                />
              </div>

              {modalError && (
                <p className="text-sm text-red-400 bg-red-900/30 px-3 py-2 rounded-lg">{modalError}</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-700">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-txt-secondary hover:text-txt-primary transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {saving ? '儲存中...' : '儲存草稿'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
