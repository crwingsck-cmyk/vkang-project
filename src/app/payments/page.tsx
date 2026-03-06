'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PaymentReceiptService } from '@/services/database/paymentReceipts';
import { ReceivableService } from '@/services/database/receivables';
import { UserService } from '@/services/database/users';
import {
  PaymentReceipt,
  PaymentReceiptStatus,
  PaymentReceiptItem,
  Receivable,
  User,
  UserRole,
} from '@/types/models';
import { generateDocumentNumber } from '@/lib/documentNumber';

const statusLabel: Record<PaymentReceiptStatus, string> = {
  [PaymentReceiptStatus.DRAFT]: 'Draft',
  [PaymentReceiptStatus.SUBMITTED]: 'Pending',
  [PaymentReceiptStatus.APPROVED]: 'Approved',
  [PaymentReceiptStatus.CANCELLED]: 'Cancelled',
};

const statusColors: Record<PaymentReceiptStatus, string> = {
  [PaymentReceiptStatus.DRAFT]: 'bg-gray-200 text-gray-900',
  [PaymentReceiptStatus.SUBMITTED]: 'bg-yellow-900/40 text-yellow-300',
  [PaymentReceiptStatus.APPROVED]: 'bg-teal-700 text-white',
  [PaymentReceiptStatus.CANCELLED]: 'bg-red-900/40 text-red-300',
};

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'credit', label: 'Cheque' },
];

type ModalStep = 1 | 2 | 3;

export default function PaymentsPage() {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<PaymentReceiptStatus | 'ALL'>('ALL');
  const [actionError, setActionError] = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState<ModalStep>(1);
  const [customers, setCustomers] = useState<User[]>([]);
  const [selCustomer, setSelCustomer] = useState<User | null>(null);
  const [outstanding, setOutstanding] = useState<Receivable[]>([]);
  const [loadingAR, setLoadingAR] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState('bank');
  const [payRef, setPayRef] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  // Edit modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editPR, setEditPR] = useState<PaymentReceipt | null>(null);
  const [editPayMethod, setEditPayMethod] = useState('');
  const [editPayRef, setEditPayRef] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReceipts(await PaymentReceiptService.getAll());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openModal = async () => {
    setShowModal(true);
    setStep(1);
    setModalError('');
    setSelCustomer(null);
    setOutstanding([]);
    setCheckedIds(new Set());
    setAmount('');
    setPaymentDate(new Date().toISOString().slice(0, 10));
    setPayMethod('bank');
    setPayRef('');
    setNotes('');
    setCustomers(await UserService.getAll());
  };

  const handleCustomerSelect = async (id: string) => {
    const c = customers.find((u) => u.id === id) ?? null;
    setSelCustomer(c);
    setCheckedIds(new Set());
    if (c) {
      setLoadingAR(true);
      try {
        setOutstanding(await ReceivableService.getOutstandingByCustomer(c.id!));
      } finally {
        setLoadingAR(false);
      }
    } else {
      setOutstanding([]);
    }
  };

  const toggleCheck = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setAmount(''); // reset amount when selection changes
    setModalError('');
  };

  const selectedReceivables = outstanding.filter((r) => checkedIds.has(r.id!));
  const maxAmount = selectedReceivables.reduce((s, r) => s + r.remainingAmount, 0);
  const amountNum = parseFloat(amount) || 0;

  const goToStep2 = () => {
    if (!selCustomer) { setModalError('Please select a customer'); return; }
    setModalError('');
    setStep(2);
  };

  const goToStep3 = () => {
    setModalError('');
    setStep(3);
  };

  const handleSave = async () => {
    if (!amountNum || amountNum <= 0) { setModalError('Please enter the payment amount'); return; }

    setSaving(true);
    setModalError('');
    try {
      // Distribute amount proportionally among selected receivables
      const items: PaymentReceiptItem[] = [];
      let remaining = amountNum;
      for (const r of selectedReceivables) {
        const apply = Math.min(r.remainingAmount, remaining);
        if (apply <= 0) break;
        items.push({
          receivableId: r.id!,
          deliveryNoteNo: r.deliveryNoteNo,
          appliedAmount: Math.round(apply * 100) / 100,
        });
        remaining -= apply;
        if (remaining <= 0) break;
      }

      const existingNos = await PaymentReceiptService.getAllReceiptNos();
      const receiptNo = generateDocumentNumber('PR', existingNos);

      const paymentDateTs = paymentDate ? new Date(paymentDate + 'T12:00:00').getTime() : Date.now();

      await PaymentReceiptService.create({
        receiptNo,
        status: PaymentReceiptStatus.DRAFT,
        customerId: selCustomer!.id!,
        customerName: selCustomer!.displayName,
        items,
        totalAmount: amountNum,
        paymentDate: paymentDateTs,
        paymentMethod: payMethod,
        paymentReference: payRef || undefined,
        notes: notes || undefined,
        createdBy: user?.id,
      });

      setShowModal(false);
      await load();
    } catch (e: any) {
      setModalError(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (pr: PaymentReceipt) => {
    await PaymentReceiptService.submit(pr.id!);
    await load();
  };

  const handleApprove = async (pr: PaymentReceipt) => {
    setActionError('');
    try {
      await PaymentReceiptService.approve(pr.id!, user?.id ?? '');
      await load();
    } catch (e: any) {
      setActionError(e.message ?? 'Approval failed');
    }
  };

  const handleCancel = async (pr: PaymentReceipt) => {
    if (!confirm(`Confirm cancel payment receipt ${pr.receiptNo}?`)) return;
    await PaymentReceiptService.cancel(pr.id!);
    await load();
  };

  const handleDelete = async (pr: PaymentReceipt) => {
    if (!confirm(`Confirm delete payment receipt ${pr.receiptNo}? This action cannot be undone.`)) return;
    setActionError('');
    try {
      await PaymentReceiptService.delete(pr.id!);
      await load();
    } catch (e: any) {
      setActionError(e.message ?? 'Delete failed');
    }
  };

  const handleRevert = async (pr: PaymentReceipt) => {
    if (!confirm(`Revert ${pr.receiptNo} back to Draft? This will reverse the AR payments.`)) return;
    setActionError('');
    try {
      await PaymentReceiptService.revert(pr.id!);
      await load();
    } catch (e: any) {
      setActionError(e.message ?? 'Revert failed');
    }
  };

  const openEditModal = (pr: PaymentReceipt) => {
    setEditPR(pr);
    setEditPayMethod(pr.paymentMethod ?? 'bank');
    setEditPayRef(pr.paymentReference ?? '');
    setEditNotes(pr.notes ?? '');
    setEditAmount(pr.totalAmount.toFixed(2));
    setEditError('');
    setShowEditModal(true);
  };

  const handleEditSave = async () => {
    if (!editPR) return;
    const newAmount = parseFloat(editAmount);
    if (!newAmount || newAmount <= 0) { setEditError('Please enter a valid amount'); return; }
    setEditSaving(true);
    setEditError('');
    try {
      // 如果金額有變動，先處理 AR 反轉與重新核銷
      if (Math.abs(newAmount - editPR.totalAmount) > 0.001) {
        await PaymentReceiptService.updateAmount(editPR.id!, newAmount);
      }
      // 更新付款細節（方式、流水號、備注）
      await PaymentReceiptService.updateDetails(editPR.id!, {
        paymentMethod: editPayMethod,
        paymentReference: editPayRef || undefined,
        notes: editNotes || undefined,
      });
      setShowEditModal(false);
      await load();
    } catch (e: any) {
      setEditError(e.message ?? 'Save failed');
    } finally {
      setEditSaving(false);
    }
  };

  const visible = filter === 'ALL' ? receipts : receipts.filter((r) => r.status === filter);
  const counts = {
    all: receipts.length,
    submitted: receipts.filter((r) => r.status === PaymentReceiptStatus.SUBMITTED).length,
    approved: receipts.filter((r) => r.status === PaymentReceiptStatus.APPROVED).length,
  };

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-txt-primary tracking-tight">Payment Receipts</h1>
            <p className="text-base text-txt-subtle mt-0.5">Must be linked to delivery notes. Approved receipts auto-settle receivables.</p>
          </div>
          <button
            onClick={openModal}
            className="px-5 py-2.5 bg-accent text-white rounded-lg text-base font-medium hover:bg-accent-hover transition-colors"
          >
            + Add Payment Receipt
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
            { label: 'Pending', value: counts.submitted, color: 'text-yellow-400' },
            { label: 'Approved', value: counts.approved, color: 'text-green-400' },
          ].map((s) => (
            <div key={s.label} className="glass-card p-6 text-center">
              <p className={`text-4xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-base text-txt-subtle mt-2">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          {(['ALL', ...Object.values(PaymentReceiptStatus)] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
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
            <p className="text-txt-subtle text-sm">No matching payment receipts</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-base">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-sm uppercase tracking-wide border-b border-gray-200">
                  <th className="px-4 py-3 text-left">Receipt No.</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Customer</th>
                  <th className="px-4 py-3 text-left">Delivery Notes</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((pr) => (
                  <tr key={pr.id} className="bg-white hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-sm font-bold text-gray-900">{pr.receiptNo}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {(pr.paymentDate ?? pr.createdAt) ? new Date((pr.paymentDate ?? pr.createdAt)!).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{pr.customerName}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {pr.items.map((i) => i.deliveryNoteNo).join(', ')}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-gray-900">
                      {pr.totalAmount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[pr.status]}`}>
                        {statusLabel[pr.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {pr.status === PaymentReceiptStatus.DRAFT && (
                          <button
                            onClick={() => handleSubmit(pr)}
                            className="text-xs px-2 py-1 rounded bg-yellow-700 text-white hover:bg-yellow-600"
                          >
                            Submit
                          </button>
                        )}
                        {pr.status === PaymentReceiptStatus.SUBMITTED && (
                          <button
                            onClick={() => handleApprove(pr)}
                            className="text-xs px-2 py-1 rounded bg-green-700 text-white hover:bg-green-600"
                          >
                            Approve
                          </button>
                        )}
                        {(pr.status === PaymentReceiptStatus.DRAFT || pr.status === PaymentReceiptStatus.SUBMITTED) && (
                          <button
                            onClick={() => handleCancel(pr)}
                            className="text-xs px-2 py-1 rounded bg-gray-700 text-white hover:bg-gray-600"
                          >
                            Cancel
                          </button>
                        )}
                        {pr.status === PaymentReceiptStatus.APPROVED && (
                          <button
                            onClick={() => handleRevert(pr)}
                            className="text-xs px-2 py-1 rounded bg-yellow-700 text-white hover:bg-yellow-600"
                          >
                            Revert
                          </button>
                        )}
                        {pr.status === PaymentReceiptStatus.APPROVED && (
                          <button
                            onClick={() => openEditModal(pr)}
                            className="text-xs px-2 py-1 rounded bg-blue-700 text-white hover:bg-blue-600"
                          >
                            Edit
                          </button>
                        )}
                        {(pr.status === PaymentReceiptStatus.DRAFT || pr.status === PaymentReceiptStatus.CANCELLED || pr.status === PaymentReceiptStatus.APPROVED) && (
                          <button
                            onClick={() => handleDelete(pr)}
                            className="text-xs px-2 py-1 rounded bg-red-700 text-white hover:bg-red-600"
                          >
                            Delete
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
          <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl">
            {/* Modal header with step indicator */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <div>
                <h2 className="text-base font-semibold text-white">Add Payment Receipt</h2>
                <div className="flex items-center gap-2 mt-1">
                  {([1, 2, 3] as ModalStep[]).map((s) => (
                    <div key={s} className="flex items-center gap-1">
                      <div className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-medium ${
                        step === s ? 'bg-accent text-white' : step > s ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-400'
                      }`}>{s}</div>
                      {s < 3 && <div className={`w-6 h-px ${step > s ? 'bg-green-600' : 'bg-gray-600'}`} />}
                    </div>
                  ))}
                  <span className="text-xs text-white ml-1">
                    {step === 1 ? 'Select customer' : step === 2 ? 'Select delivery notes' : 'Enter payment'}
                  </span>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="text-txt-subtle hover:text-txt-primary text-lg leading-none">✕</button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4">
              {/* Step 1: Select Customer */}
              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-white mb-1">Customer *</label>
                    <select
                      value={selCustomer?.id ?? ''}
                      onChange={(e) => handleCustomerSelect(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                    >
                      <option value="" className="bg-white text-gray-900">— Select customer —</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id} className="bg-white text-gray-900">
                          {c.displayName}（{c.role === UserRole.TAIWAN || c.role === UserRole.ADMIN ? 'Master Distributor' : c.role === UserRole.STOCKIST ? 'Stockist' : 'Customer'}）
                        </option>
                      ))}
                    </select>
                  </div>
                  {selCustomer && (
                    <div className="rounded-lg bg-surface-2 px-4 py-3 text-sm text-gray-900">
                      <p className="text-xs mb-1 text-gray-600">Customer Info</p>
                      <p className="font-medium text-gray-900">{selCustomer.displayName}</p>
                      {selCustomer.company?.name && (
                        <p className="text-xs text-gray-700">{selCustomer.company.name}</p>
                      )}
                    </div>
                  )}
                  {modalError && (
                    <p className="text-sm text-red-400 bg-red-900/30 px-3 py-2 rounded-lg">{modalError}</p>
                  )}
                </div>
              )}

              {/* Step 2: Select Delivery Notes */}
              {step === 2 && (
                <div className="space-y-4">
                  {loadingAR ? (
                    <div className="py-8 text-center text-txt-subtle text-sm">Loading receivables...</div>
                  ) : outstanding.length === 0 ? (
                    <div className="rounded-lg bg-gray-700/50 border border-gray-600 px-4 py-3">
                      <p className="text-gray-300 text-sm font-medium">No outstanding receivables</p>
                      <p className="text-gray-400 text-xs mt-1">You can still proceed to record a payment without linking to a delivery note.</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-white">Select delivery notes to settle (optional):</p>
                      <div className="space-y-2">
                        {outstanding.map((r) => (
                          <label
                            key={r.id}
                            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                              checkedIds.has(r.id!)
                                ? 'border-accent/50 bg-accent/10'
                                : 'border-gray-600 hover:border-gray-500 bg-gray-700/50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={checkedIds.has(r.id!)}
                              onChange={() => toggleCheck(r.id!)}
                              className="accent-accent"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-mono text-accent-text">{r.deliveryNoteNo}</p>
                              <p className="text-xs text-white">Order: {r.salesOrderNo}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs text-white">Total {r.totalAmount.toFixed(2)}</p>
                              <p className="text-sm font-semibold text-red-400 tabular-nums">
                                Outstanding {r.remainingAmount.toFixed(2)}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                      {checkedIds.size > 0 && (
                        <div className="rounded-lg bg-surface-2 px-4 py-2 flex justify-between text-sm">
                          <span className="text-gray-900">Settle limit:</span>
                          <span className="font-semibold text-gray-900 tabular-nums">
                            {maxAmount.toFixed(2)}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                  {modalError && (
                    <div className="rounded-lg bg-red-900/40 border border-red-600/50 px-4 py-3 text-sm text-red-300">
                      ⚠️ {modalError}
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Payment Details */}
              {step === 3 && (
                <div className="space-y-4">
                  {checkedIds.size > 0 && (
                    <div className="rounded-lg bg-surface-2 px-4 py-2 flex justify-between text-sm">
                      <span className="text-gray-900">Selected DN outstanding:</span>
                      <span className="font-semibold text-gray-900 tabular-nums">{maxAmount.toFixed(2)}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs text-white mb-1">Payment Date *</label>
                    <input
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-white mb-1">Payment Amount *</label>
                    <input
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={amount}
                      onChange={(e) => { setAmount(e.target.value); setModalError(''); }}
                      placeholder="Enter amount"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-white mb-1">Payment Method</label>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.value} value={m.value} className="bg-white text-gray-900">{m.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-white mb-1">Bank Reference (optional)</label>
                    <input
                      type="text"
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                      placeholder="e.g. TT2026022800001"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-accent"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-white mb-1">Notes (optional)</label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-accent resize-none"
                    />
                  </div>

                  {modalError && (
                    <div className="rounded-lg bg-red-900/40 border border-red-600/50 px-4 py-3 text-sm text-red-300">
                      ⚠️ {modalError}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-between gap-3 px-6 py-4 border-t border-gray-700">
              <div>
                {step > 1 && (
                  <button
                    onClick={() => setStep((s) => (s - 1) as ModalStep)}
                    className="px-4 py-2 text-sm text-white hover:text-white transition-colors"
                  >
                    ← Previous
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-white hover:text-white transition-colors"
                >
                  Cancel
                </button>
                {step === 1 && (
                  <button
                    onClick={goToStep2}
                    disabled={!selCustomer}
                    className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
                  >
                    Next →
                  </button>
                )}
                {step === 2 && (
                  <button
                    onClick={goToStep3}
                    className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
                  >
                    Next →
                  </button>
                )}
                {step === 3 && (
                  <button
                    onClick={handleSave}
                    disabled={saving || !amountNum || amountNum <= 0}
                    className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save Draft'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && editPR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h2 className="text-base font-semibold text-white">Edit Payment Receipt {editPR.receiptNo}</h2>
              <button onClick={() => setShowEditModal(false)} className="text-txt-subtle hover:text-txt-primary text-lg leading-none">✕</button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs text-white mb-1">Payment Amount *</label>
                <input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={editAmount}
                  onChange={(e) => { setEditAmount(e.target.value); setEditError(''); }}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-white mb-1">Payment Method</label>
                <select
                  value={editPayMethod}
                  onChange={(e) => setEditPayMethod(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value} className="bg-gray-700 text-white">{m.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-white mb-1">Bank Reference (optional)</label>
                <input
                  type="text"
                  value={editPayRef}
                  onChange={(e) => setEditPayRef(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs text-white mb-1">Notes (optional)</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-accent resize-none"
                />
              </div>
              {editError && (
                <p className="text-sm text-red-400 bg-red-900/30 px-3 py-2 rounded-lg">{editError}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-700">
              <button onClick={() => setShowEditModal(false)} className="px-4 py-2 text-sm text-white hover:text-white transition-colors">Cancel</button>
              <button
                onClick={handleEditSave}
                disabled={editSaving}
                className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {editSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
