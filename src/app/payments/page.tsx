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
  [PaymentReceiptStatus.DRAFT]: '草稿',
  [PaymentReceiptStatus.SUBMITTED]: '待審核',
  [PaymentReceiptStatus.APPROVED]: '已審核',
  [PaymentReceiptStatus.CANCELLED]: '已取消',
};

const statusColors: Record<PaymentReceiptStatus, string> = {
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
  const [payMethod, setPayMethod] = useState('bank');
  const [payRef, setPayRef] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

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
    setPayMethod('bank');
    setPayRef('');
    setNotes('');
    setCustomers(await UserService.getByRole(UserRole.CUSTOMER));
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
  const amountOverLimit = amountNum > maxAmount;

  const goToStep2 = () => {
    if (!selCustomer) { setModalError('請選擇客戶'); return; }
    setModalError('');
    setStep(2);
  };

  const goToStep3 = () => {
    if (checkedIds.size === 0) {
      setModalError('必須選擇至少一個發貨單號，方可建立收款單');
      return;
    }
    setModalError('');
    setStep(3);
  };

  const handleSave = async () => {
    if (checkedIds.size === 0) { setModalError('請選擇發貨單號'); return; }
    if (!amountNum || amountNum <= 0) { setModalError('請填寫收款金額'); return; }
    if (amountOverLimit) { setModalError(`核銷金額超過所選發貨單的剩餘未收金額（上限 ${maxAmount.toFixed(2)}），請調整！`); return; }

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

      await PaymentReceiptService.create({
        receiptNo,
        status: PaymentReceiptStatus.DRAFT,
        customerId: selCustomer!.id!,
        customerName: selCustomer!.displayName,
        items,
        totalAmount: amountNum,
        paymentMethod: payMethod,
        paymentReference: payRef || undefined,
        notes: notes || undefined,
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
      setActionError(e.message ?? '審核失敗');
    }
  };

  const handleCancel = async (pr: PaymentReceipt) => {
    if (!confirm(`確定取消收款單 ${pr.receiptNo}？`)) return;
    await PaymentReceiptService.cancel(pr.id!);
    await load();
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
            <h1 className="text-xl font-bold text-txt-primary tracking-tight">收款單</h1>
            <p className="text-sm text-txt-subtle mt-0.5">必須綁定發貨單號方可建立，審核後自動核銷應收款</p>
          </div>
          <button
            onClick={openModal}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            + 新增收款單
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
            { label: '待審核', value: counts.submitted, color: 'text-yellow-400' },
            { label: '已審核', value: counts.approved, color: 'text-green-400' },
          ].map((s) => (
            <div key={s.label} className="glass-card p-4 text-center">
              <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-xs text-txt-subtle mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          {(['ALL', ...Object.values(PaymentReceiptStatus)] as const).map((s) => (
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
            <p className="text-txt-subtle text-sm">沒有符合條件的收款單</p>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-txt-subtle text-xs uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">收款單號</th>
                  <th className="px-4 py-3 text-left">日期</th>
                  <th className="px-4 py-3 text-left">客戶</th>
                  <th className="px-4 py-3 text-left">核銷發貨單</th>
                  <th className="px-4 py-3 text-right">金額</th>
                  <th className="px-4 py-3 text-center">狀態</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((pr) => (
                  <tr key={pr.id} className="hover:bg-surface-2/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-accent-text">{pr.receiptNo}</td>
                    <td className="px-4 py-3 text-txt-subtle">
                      {pr.createdAt ? new Date(pr.createdAt).toLocaleDateString('zh-TW') : '—'}
                    </td>
                    <td className="px-4 py-3 text-txt-primary">{pr.customerName}</td>
                    <td className="px-4 py-3 text-xs text-txt-subtle">
                      {pr.items.map((i) => i.deliveryNoteNo).join(', ')}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
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
                            className="text-xs px-2 py-1 rounded bg-yellow-800/40 text-yellow-300 hover:bg-yellow-700/50"
                          >
                            提交
                          </button>
                        )}
                        {pr.status === PaymentReceiptStatus.SUBMITTED && (
                          <button
                            onClick={() => handleApprove(pr)}
                            className="text-xs px-2 py-1 rounded bg-green-800/40 text-green-300 hover:bg-green-700/50"
                          >
                            審核
                          </button>
                        )}
                        {(pr.status === PaymentReceiptStatus.DRAFT || pr.status === PaymentReceiptStatus.SUBMITTED) && (
                          <button
                            onClick={() => handleCancel(pr)}
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
          <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl">
            {/* Modal header with step indicator */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <div>
                <h2 className="text-base font-semibold text-txt-primary">新增收款單</h2>
                <div className="flex items-center gap-2 mt-1">
                  {([1, 2, 3] as ModalStep[]).map((s) => (
                    <div key={s} className="flex items-center gap-1">
                      <div className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-medium ${
                        step === s ? 'bg-accent text-white' : step > s ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-400'
                      }`}>{s}</div>
                      {s < 3 && <div className={`w-6 h-px ${step > s ? 'bg-green-600' : 'bg-gray-600'}`} />}
                    </div>
                  ))}
                  <span className="text-xs text-txt-subtle ml-1">
                    {step === 1 ? '選客戶' : step === 2 ? '選發貨單號' : '填寫收款'}
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
                    <label className="block text-xs text-txt-subtle mb-1">客戶 *</label>
                    <select
                      value={selCustomer?.id ?? ''}
                      onChange={(e) => handleCustomerSelect(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-accent"
                    >
                      <option value="">— 選擇客戶 —</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>{c.displayName}</option>
                      ))}
                    </select>
                  </div>
                  {selCustomer && (
                    <div className="rounded-lg bg-surface-2 px-4 py-3 text-sm">
                      <p className="text-txt-subtle text-xs mb-1">客戶資訊</p>
                      <p className="text-txt-primary font-medium">{selCustomer.displayName}</p>
                      {selCustomer.company?.name && (
                        <p className="text-txt-subtle text-xs">{selCustomer.company.name}</p>
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
                    <div className="py-8 text-center text-txt-subtle text-sm">載入應收款...</div>
                  ) : outstanding.length === 0 ? (
                    <div className="rounded-lg bg-yellow-900/30 border border-yellow-700/50 px-4 py-3">
                      <p className="text-yellow-300 text-sm font-medium">此客戶目前沒有未收的應收款</p>
                      <p className="text-yellow-400/70 text-xs mt-1">請確認已有已出庫的發貨單</p>
                    </div>
                  ) : (
                    <>
                      <p className="text-xs text-txt-subtle">勾選要核銷的發貨單號（必須至少選一個）：</p>
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
                              <p className="text-xs text-txt-subtle">訂單：{r.salesOrderNo}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs text-txt-subtle">總額 {r.totalAmount.toFixed(2)}</p>
                              <p className="text-sm font-semibold text-red-400 tabular-nums">
                                未收 {r.remainingAmount.toFixed(2)}
                              </p>
                            </div>
                          </label>
                        ))}
                      </div>
                      {checkedIds.size > 0 && (
                        <div className="rounded-lg bg-surface-2 px-4 py-2 flex justify-between text-sm">
                          <span className="text-txt-subtle">可核銷上限：</span>
                          <span className="font-semibold text-txt-primary tabular-nums">
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
                  <div className="rounded-lg bg-surface-2 px-4 py-2 flex justify-between text-sm">
                    <span className="text-txt-subtle">可核銷上限：</span>
                    <span className="font-semibold text-txt-primary tabular-nums">{maxAmount.toFixed(2)}</span>
                  </div>

                  <div>
                    <label className="block text-xs text-txt-subtle mb-1">本次收款金額 *</label>
                    <input
                      type="number"
                      min={0.01}
                      max={maxAmount}
                      step="0.01"
                      value={amount}
                      onChange={(e) => { setAmount(e.target.value); setModalError(''); }}
                      placeholder={`最多 ${maxAmount.toFixed(2)}`}
                      className={`w-full bg-gray-700 border rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none ${
                        amountOverLimit ? 'border-red-500' : 'border-gray-600 focus:border-accent'
                      }`}
                    />
                    {amountOverLimit && (
                      <p className="mt-1 text-xs text-red-400">
                        ⚠️ 核銷金額超過所選發貨單的剩餘未收金額（{maxAmount.toFixed(2)}），請調整！
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs text-txt-subtle mb-1">付款方式</label>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-accent"
                    >
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-txt-subtle mb-1">銀行流水號（選填）</label>
                    <input
                      type="text"
                      value={payRef}
                      onChange={(e) => setPayRef(e.target.value)}
                      placeholder="e.g. TT2026022800001"
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-txt-primary focus:outline-none focus:border-accent"
                    />
                  </div>

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
                    className="px-4 py-2 text-sm text-txt-secondary hover:text-txt-primary transition-colors"
                  >
                    ← 上一步
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-txt-secondary hover:text-txt-primary transition-colors"
                >
                  取消
                </button>
                {step === 1 && (
                  <button
                    onClick={goToStep2}
                    disabled={!selCustomer}
                    className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
                  >
                    下一步 →
                  </button>
                )}
                {step === 2 && (
                  <button
                    onClick={goToStep3}
                    disabled={checkedIds.size === 0 || outstanding.length === 0}
                    className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
                  >
                    下一步 →
                  </button>
                )}
                {step === 3 && (
                  <button
                    onClick={handleSave}
                    disabled={saving || !amountNum || amountNum <= 0 || amountOverLimit}
                    className="px-5 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
                  >
                    {saving ? '儲存中...' : '儲存草稿'}
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
