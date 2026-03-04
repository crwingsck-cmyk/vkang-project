'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DeliveryNoteService } from '@/services/database/deliveryNotes';
import { SalesOrderService } from '@/services/database/salesOrders';
import { InventoryService } from '@/services/database/inventory';
import { DeliveryNote, DeliveryNoteStatus, SalesOrder, UserRole, TransactionItem } from '@/types/models';
import { generateDocumentNumber } from '@/lib/documentNumber';

const statusLabel: Record<DeliveryNoteStatus, string> = {
  [DeliveryNoteStatus.PENDING]: 'Pending Warehouse',
  [DeliveryNoteStatus.WAREHOUSE_APPROVED]: 'Shipped',
  [DeliveryNoteStatus.DELIVERED]: 'Delivered',
  [DeliveryNoteStatus.CANCELLED]: 'Cancelled',
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
                  errs[idx] = qty > maxQty ? `Max ${maxQty}, cannot exceed order` : '';
      setItemErrors(errs);
      return next;
    });
  };

  const hasQtyError = itemErrors.some((e) => !!e);

  const handleSave = async () => {
    if (!selOrder) { setModalError('Please select an order'); return; }
    if (hasQtyError) { setModalError('Ship quantity cannot exceed order quantity'); return; }
    if (dnItems.every((i) => i.quantity <= 0)) { setModalError('At least one item must have quantity > 0'); return; }
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
      setModalError(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleWarehouseApprove = async (dn: DeliveryNote) => {
    setActionError('');
    try {
      // 出庫前驗證賣方現有庫存
      if (dn.fromUserId && dn.items.length > 0) {
        const insufficient: string[] = [];
        for (const item of dn.items) {
          const inv = await InventoryService.getByUserAndProduct(dn.fromUserId, item.productId);
          const have = inv?.quantityOnHand ?? 0;
          if (have < item.quantity) {
            insufficient.push(`${item.productName}: need ${item.quantity}, stock only ${have}`);
          }
        }
        if (insufficient.length > 0) {
          setActionError(`${dn.fromUserName} insufficient stock: ${insufficient.join('; ')}`);
          return;
        }
      }
      await DeliveryNoteService.warehouseApprove(dn.id!, user?.id ?? '');
      // 出庫後扣減賣方現有庫存（只扣具體產品，不動批量進貨）
      if (dn.fromUserId && dn.items.length > 0) {
        const ref = `DN-OUT: ${dn.id}`;
        for (const item of dn.items) {
          await InventoryService.deduct(dn.fromUserId, item.productId, item.quantity, ref);
        }
      }
      await load();
    } catch (e: any) {
      setActionError(e.message ?? 'Approval failed');
    }
  };

  const handleMarkDelivered = async (dn: DeliveryNote) => {
    await DeliveryNoteService.markDelivered(dn.id!);
    await load();
  };

  const handleCancel = async (dn: DeliveryNote) => {
    if (!confirm(`Cancel delivery note ${dn.deliveryNo}?`)) return;
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
            <h1 className="text-xl font-bold text-txt-primary tracking-tight">Delivery Notes</h1>
            <p className="text-sm text-txt-subtle mt-0.5">Create from approved sales orders. Warehouse approval auto-deducts inventory.</p>
          </div>
          <button
            onClick={openModal}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            + Add Delivery Note
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
            { label: 'All', value: counts.all, color: 'text-txt-primary' },
            { label: 'Pending', value: counts.pending, color: 'text-yellow-400' },
            { label: 'Shipped', value: counts.approved, color: 'text-blue-400' },
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
              {s === 'ALL' ? 'All' : statusLabel[s]}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3" />
            <p className="text-txt-subtle text-sm">Loading...</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <p className="text-txt-subtle text-sm">No matching delivery notes</p>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-txt-subtle text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">DN No.</th>
                  <th className="px-4 py-3 text-left">Order</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-right">Items</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((dn) => (
                  <tr key={dn.id} className="hover:bg-surface-2/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-accent-text">{dn.deliveryNo}</td>
                    <td className="px-4 py-3 font-mono text-xs text-txt-subtle">{dn.salesOrderNo}</td>
                    <td className="px-4 py-3 text-txt-subtle">
                      {dn.createdAt ? new Date(dn.createdAt).toLocaleDateString('en-GB') : '—'}
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
                            Warehouse Approve
                          </button>
                        )}
                        {dn.status === DeliveryNoteStatus.WAREHOUSE_APPROVED && (
                          <button
                            onClick={() => handleMarkDelivered(dn)}
                            className="text-xs px-2 py-1 rounded bg-green-800/40 text-green-300 hover:bg-green-700/50"
                          >
                            Mark Delivered
                          </button>
                        )}
                        {dn.status === DeliveryNoteStatus.PENDING && (
                          <button
                            onClick={() => handleCancel(dn)}
                            className="text-xs px-2 py-1 rounded bg-red-900/40 text-red-300 hover:bg-red-800/50"
                          >
                            Cancel
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
              <h2 className="text-base font-semibold text-txt-primary">Add Delivery Note</h2>
              <button onClick={() => setShowModal(false)} className="text-txt-subtle hover:text-txt-primary text-lg leading-none">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">
              {/* Order select */}
              <div>
                <label className="block text-xs text-txt-subtle mb-1">Sales Order (approved) *</label>
                <select
                  value={selOrder?.id ?? ''}
                  onChange={(e) => handleOrderSelect(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-accent"
                >
                  <option value="">— Select approved order —</option>
                  {approvedOrders.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.orderNo} | {o.customerName} | RM {o.totals.grandTotal.toFixed(2)}
                    </option>
                  ))}
                </select>
                {approvedOrders.length === 0 && (
                  <p className="mt-1 text-xs text-yellow-400">No approved sales orders. Approve orders on Sales page first.</p>
                )}
              </div>

              {/* Items */}
              {selOrder && dnItems.length > 0 && (
                <div>
                  <label className="block text-xs text-txt-subtle mb-2">
                    Actual ship quantity (cannot exceed order)
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
                    Total: RM {dnItems.reduce((s, i) => s + i.total, 0).toFixed(2)}
                  </div>
                </div>
              )}

              {/* Logistics (optional) */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-txt-subtle mb-1">Carrier (optional)</label>
                  <input
                    type="text"
                    value={carrier}
                    onChange={(e) => setCarrier(e.target.value)}
                    placeholder="e.g. J&T, Pos Laju"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-txt-subtle mb-1">Tracking No. (optional)</label>
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
                <label className="block text-xs text-txt-subtle mb-1">Notes (optional)</label>
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
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !selOrder || hasQtyError}
                className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Create Delivery Note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
