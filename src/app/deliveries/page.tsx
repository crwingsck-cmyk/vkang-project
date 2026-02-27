'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DeliveryNoteService } from '@/services/database/deliveryNotes';
import { SalesOrderService } from '@/services/database/salesOrders';
import { DeliveryNote, DeliveryNoteStatus, SalesOrder, UserRole, TransactionItem } from '@/types/models';
import { generateDocumentNumber } from '@/lib/documentNumber';

const statusLabel: Record<DeliveryNoteStatus, string> = {
  [DeliveryNoteStatus.PENDING]: '待倉庫審核',
  [DeliveryNoteStatus.WAREHOUSE_APPROVED]: '已出庫',
  [DeliveryNoteStatus.DELIVERED]: '已送達',
  [DeliveryNoteStatus.CANCELLED]: '已取消',
};

const statusColors: Record<DeliveryNoteStatus, string> = {
  [DeliveryNoteStatus.PENDING]: 'bg-yellow-900/40 text-yellow-300',
  [DeliveryNoteStatus.WAREHOUSE_APPROVED]: 'bg-blue-900/40 text-blue-300',
  [DeliveryNoteStatus.DELIVERED]: 'bg-green-900/40 text-green-300',
  [DeliveryNoteStatus.CANCELLED]: 'bg-red-900/40 text-red-300',
};

export default function DeliveriesPage() {
  const { user } = useAuth();
  const [deliveries, setDeliveries] = useState<DeliveryNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<DeliveryNoteStatus | 'ALL'>('ALL');
  const [actionError, setActionError] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [approvedOrders, setApprovedOrders] = useState<SalesOrder[]>([]);
  const [selOrder, setSelOrder] = useState<SalesOrder | null>(null);
  const [dnItems, setDnItems] = useState<TransactionItem[]>([]);
  const [carrier, setCarrier] = useState('');
  const [trackingNo, setTrackingNo] = useState('');
  const [dnNotes, setDnNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [itemErrors, setItemErrors] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await DeliveryNoteService.getAll();
      setDeliveries(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openModal = async () => {
    setShowModal(true);
    setModalError('');
    setItemErrors([]);
    setSelOrder(null);
    setDnItems([]);
    setCarrier('');
    setTrackingNo('');
    setDnNotes('');
    const orders = await SalesOrderService.getApproved();
    setApprovedOrders(orders);
  };

  const handleOrderSelect = (orderId: string) => {
    const order = approvedOrders.find((o) => o.id === orderId) ?? null;
    setSelOrder(order);
    if (order) {
      // Pre-fill with order quantities; user may reduce but not exceed
      setDnItems(order.items.map((i) => ({ ...i })));
      setItemErrors(order.items.map(() => ''));
    } else {
      setDnItems([]);
      setItemErrors([]);
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

  const handleSave = async () => {
    if (!selOrder) { setModalError('請選擇訂單'); return; }
    if (hasQtyError) { setModalError('出貨數量不可超過訂單數量'); return; }
    if (dnItems.every((i) => i.quantity <= 0)) { setModalError('至少一個品項數量需大於 0'); return; }
    setSaving(true);
    setModalError('');
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
        toUserId: selOrder.customerId,
        toUserName: selOrder.customerName,
        items: dnItems.filter((i) => i.quantity > 0),
        totals: { grandTotal },
        logistics: {
          carrier: carrier || undefined,
          trackingNumber: trackingNo || undefined,
        },
        notes: dnNotes || undefined,
        createdBy: user?.id,
      });
      // Link back to the sales order
      await SalesOrderService.linkDeliveryNote(
        selOrder.id!,
        deliveryNo,
        selOrder.linkedDeliveryNoteIds ?? []
      );
      setShowModal(false);
      await load();
    } catch (e: any) {
      setModalError(e.message ?? '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleWarehouseApprove = async (dn: DeliveryNote) => {
    setActionError('');
    try {
      await DeliveryNoteService.warehouseApprove(dn.id!, user?.id ?? '');
      await load();
    } catch (e: any) {
      setActionError(e.message ?? '審核失敗');
    }
  };

  const handleMarkDelivered = async (dn: DeliveryNote) => {
    await DeliveryNoteService.markDelivered(dn.id!);
    await load();
  };

  const handleCancel = async (dn: DeliveryNote) => {
    if (!confirm(`確定取消發貨單 ${dn.deliveryNo}？`)) return;
    await DeliveryNoteService.cancel(dn.id!);
    await load();
  };

  const visible = filter === 'ALL' ? deliveries : deliveries.filter((d) => d.status === filter);
  const counts = {
    all: deliveries.length,
    pending: deliveries.filter((d) => d.status === DeliveryNoteStatus.PENDING).length,
    approved: deliveries.filter((d) => d.status === DeliveryNoteStatus.WAREHOUSE_APPROVED).length,
  };

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-txt-primary tracking-tight">發貨單</h1>
            <p className="text-sm text-txt-subtle mt-0.5">從已審核的銷售訂單生成發貨單，倉庫審核後自動扣庫存</p>
          </div>
          <button
            onClick={openModal}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            + 新增發貨單
          </button>
        </div>

        {actionError && (
          <div className="rounded-lg bg-red-900/40 border border-red-600/50 px-4 py-3 text-sm text-red-300">
            {actionError}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: '全部', value: counts.all, color: 'text-txt-primary' },
            { label: '待倉庫審核', value: counts.pending, color: 'text-yellow-400' },
            { label: '已出庫', value: counts.approved, color: 'text-blue-400' },
          ].map((s) => (
            <div key={s.label} className="glass-card p-4 text-center">
              <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-xs text-txt-subtle mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          {(['ALL', ...Object.values(DeliveryNoteStatus)] as const).map((s) => (
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
            <p className="text-txt-subtle text-sm">沒有符合條件的發貨單</p>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-txt-subtle text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">發貨單號</th>
                  <th className="px-4 py-3 text-left">關聯訂單</th>
                  <th className="px-4 py-3 text-left">日期</th>
                  <th className="px-4 py-3 text-left">客戶</th>
                  <th className="px-4 py-3 text-right">品項</th>
                  <th className="px-4 py-3 text-right">總額</th>
                  <th className="px-4 py-3 text-center">狀態</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((dn) => (
                  <tr key={dn.id} className="hover:bg-surface-2/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-accent-text">{dn.deliveryNo}</td>
                    <td className="px-4 py-3 font-mono text-xs text-txt-subtle">{dn.salesOrderNo}</td>
                    <td className="px-4 py-3 text-txt-subtle">
                      {dn.createdAt ? new Date(dn.createdAt).toLocaleDateString('zh-TW') : '—'}
                    </td>
                    <td className="px-4 py-3 text-txt-primary">{dn.toUserName}</td>
                    <td className="px-4 py-3 text-right text-txt-secondary">{dn.items.length}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {dn.totals.grandTotal.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[dn.status]}`}>
                        {statusLabel[dn.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {dn.status === DeliveryNoteStatus.PENDING && (
                          <button
                            onClick={() => handleWarehouseApprove(dn)}
                            className="text-xs px-2 py-1 rounded bg-blue-800/40 text-blue-300 hover:bg-blue-700/50"
                          >
                            倉庫審核
                          </button>
                        )}
                        {dn.status === DeliveryNoteStatus.WAREHOUSE_APPROVED && (
                          <button
                            onClick={() => handleMarkDelivered(dn)}
                            className="text-xs px-2 py-1 rounded bg-green-800/40 text-green-300 hover:bg-green-700/50"
                          >
                            標記送達
                          </button>
                        )}
                        {dn.status === DeliveryNoteStatus.PENDING && (
                          <button
                            onClick={() => handleCancel(dn)}
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
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h2 className="text-base font-semibold text-txt-primary">新增發貨單</h2>
              <button onClick={() => setShowModal(false)} className="text-txt-subtle hover:text-txt-primary text-lg leading-none">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
              {/* Order select */}
              <div>
                <label className="block text-xs text-txt-subtle mb-1">關聯銷售訂單（已審核）*</label>
                <select
                  value={selOrder?.id ?? ''}
                  onChange={(e) => handleOrderSelect(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-accent"
                >
                  <option value="">— 選擇已審核訂單 —</option>
                  {approvedOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderNo} | {o.customerName} | {o.currency ?? 'MYR'} {o.totals.grandTotal.toFixed(2)}
                    </option>
                  ))}
                </select>
                {approvedOrders.length === 0 && (
                  <p className="mt-1 text-xs text-yellow-400">目前沒有已審核的銷售訂單。請先在「銷售訂單」頁面審核訂單。</p>
                )}
              </div>

              {/* Items */}
              {selOrder && dnItems.length > 0 && (
                <div>
                  <label className="block text-xs text-txt-subtle mb-2">
                    實際出貨數量（不可超過訂單數量）
                  </label>
                  <div className="space-y-2">
                    {dnItems.map((item, idx) => (
                      <div key={idx} className="space-y-1">
                        <div className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-6 text-sm text-txt-primary">{item.productName}</div>
                          <div className="col-span-3">
                            <input
                              type="number"
                              min={0}
                              max={selOrder.items[idx]?.quantity ?? 0}
                              value={item.quantity}
                              onChange={(e) => updateDnQty(idx, Number(e.target.value))}
                              className={`w-full bg-gray-700 border rounded-lg px-2 py-1.5 text-xs text-txt-primary focus:outline-none ${
                                itemErrors[idx] ? 'border-red-500 focus:border-red-500' : 'border-gray-600 focus:border-accent'
                              }`}
                            />
                          </div>
                          <div className="col-span-2 text-xs text-txt-subtle text-center">
                            / {selOrder.items[idx]?.quantity ?? 0}
                          </div>
                          <div className="col-span-1 text-xs text-right tabular-nums text-txt-secondary">
                            {item.total.toFixed(0)}
                          </div>
                        </div>
                        {itemErrors[idx] && (
                          <p className="text-xs text-red-400 ml-0">{itemErrors[idx]}</p>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 text-right text-sm font-semibold text-txt-primary tabular-nums">
                    總計：{selOrder.currency ?? 'MYR'} {dnItems.reduce((s, i) => s + i.total, 0).toFixed(2)}
                  </div>
                </div>
              )}

              {/* Logistics (optional) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-txt-subtle mb-1">物流商（選填）</label>
                  <input
                    type="text"
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    placeholder="e.g. J&T, Pos Laju"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-txt-subtle mb-1">追蹤號碼（選填）</label>
                  <input
                    type="text"
                    value={trackingNo}
                    onChange={(e) => setTrackingNo(e.target.value)}
                    placeholder="e.g. JT1234567890"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs text-txt-subtle mb-1">備注（選填）</label>
                <textarea
                  value={dnNotes}
                  onChange={(e) => setDnNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-accent resize-none"
                />
              </div>

              {modalError && (
                <p className="text-sm text-red-400 bg-red-900/30 px-3 py-2 rounded-lg">{modalError}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-700">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-txt-secondary hover:text-txt-primary transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !selOrder || hasQtyError}
                className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {saving ? '儲存中...' : '建立發貨單'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
