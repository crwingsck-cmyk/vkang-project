'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ExpenseChargeReceiptService } from '@/services/database/expenseChargeReceipts';
import { ExpenseChargeService } from '@/services/database/expenseCharges';
import { UserService } from '@/services/database/users';
import {
  ExpenseChargeReceipt,
  ExpenseChargeReceiptStatus,
  ExpenseChargeReceiptItem,
  ExpenseCharge,
  ExpenseType,
  User,
  UserRole,
} from '@/types/models';
import { generateDocumentNumber } from '@/lib/documentNumber';
import Link from 'next/link';

const EXPENSE_TYPE_LABEL: Record<ExpenseType, string> = {
  [ExpenseType.WEIGHING_SCALE]: '體重稱',
  [ExpenseType.SHIPPING]: '郵寄',
  [ExpenseType.SALARY]: '薪水',
};

const statusLabel: Record<ExpenseChargeReceiptStatus, string> = {
  [ExpenseChargeReceiptStatus.DRAFT]: '草稿',
  [ExpenseChargeReceiptStatus.SUBMITTED]: '待審核',
  [ExpenseChargeReceiptStatus.APPROVED]: '已審核',
  [ExpenseChargeReceiptStatus.CANCELLED]: '已取消',
};

const statusColors: Record<ExpenseChargeReceiptStatus, string> = {
  [ExpenseChargeReceiptStatus.DRAFT]: 'bg-gray-200 text-gray-900',
  [ExpenseChargeReceiptStatus.SUBMITTED]: 'bg-yellow-900/40 text-yellow-300',
  [ExpenseChargeReceiptStatus.APPROVED]: 'bg-teal-700 text-white',
  [ExpenseChargeReceiptStatus.CANCELLED]: 'bg-red-900/40 text-red-300',
};

const PAYMENT_METHODS = [
  { value: 'cash', label: '現金' },
  { value: 'bank', label: '銀行轉帳' },
  { value: 'credit', label: '支票' },
];

type ModalStep = 1 | 2 | 3;

function fmtDate(ts?: number) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-GB');
}

export default function ExpenseReceiptsPage() {
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<(ExpenseChargeReceipt & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ExpenseChargeReceiptStatus | 'ALL'>('ALL');
  const [actionError, setActionError] = useState('');

  // Modal
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState<ModalStep>(1);
  const [customers, setCustomers] = useState<User[]>([]);
  const [selCustomer, setSelCustomer] = useState<User | null>(null);
  const [outstanding, setOutstanding] = useState<(ExpenseCharge & { id: string })[]>([]);
  const [loadingCharges, setLoadingCharges] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [chargeAmounts, setChargeAmounts] = useState<Record<string, string>>({});
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payMethod, setPayMethod] = useState('bank');
  const [payRef, setPayRef] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReceipts(await ExpenseChargeReceiptService.getAll());
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
    setChargeAmounts({});
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
    setChargeAmounts({});
    if (c) {
      setLoadingCharges(true);
      try {
        const list = await ExpenseChargeService.getOutstandingByCustomer(c.id!);
        setOutstanding(list);
        const amounts: Record<string, string> = {};
        list.forEach((ch) => { amounts[ch.id!] = ch.remainingAmount.toFixed(2); });
        setChargeAmounts(amounts);
      } finally {
        setLoadingCharges(false);
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
    setModalError('');
  };

  const selectedCharges = outstanding.filter((c) => checkedIds.has(c.id!));
  const items: ExpenseChargeReceiptItem[] = selectedCharges.map((c) => ({
    chargeId: c.id!,
    expenseNo: c.expenseNo,
    appliedAmount: Math.round((parseFloat(chargeAmounts[c.id!] || '0') || 0) * 100) / 100,
  })).filter((i) => i.appliedAmount > 0);
  const totalAmount = items.reduce((s, i) => s + i.appliedAmount, 0);

  const goToStep2 = () => {
    if (!selCustomer) { setModalError('請選擇客戶'); return; }
    setModalError('');
    setStep(2);
  };

  const goToStep3 = () => {
    if (checkedIds.size === 0) {
      setModalError('必須選擇至少一筆費用分攤');
      return;
    }
    if (items.length === 0 || totalAmount <= 0) {
      setModalError('請填寫有效金額');
      return;
    }
    setModalError('');
    setStep(3);
  };

  const handleSave = async () => {
    if (items.length === 0 || totalAmount <= 0) {
      setModalError('請選擇費用分攤並填寫金額');
      return;
    }

    setSaving(true);
    setModalError('');
    try {
      const existingNos = await ExpenseChargeReceiptService.getAllReceiptNos();
      const receiptNo = generateDocumentNumber('ECR', existingNos);
      const paymentDateTs = new Date(paymentDate + 'T12:00:00').getTime();

      await ExpenseChargeReceiptService.create({
        receiptNo,
        status: ExpenseChargeReceiptStatus.DRAFT,
        customerId: selCustomer!.id!,
        customerName: selCustomer!.displayName,
        items,
        totalAmount,
        paymentDate: paymentDateTs,
        paymentMethod: payMethod,
        paymentReference: payRef || undefined,
        notes: notes || undefined,
        createdBy: user?.id,
      });
      setShowModal(false);
      await load();
    } catch (e: unknown) {
      setModalError(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (r: ExpenseChargeReceipt & { id: string }) => {
    await ExpenseChargeReceiptService.submit(r.id!);
    await load();
  };

  const handleApprove = async (r: ExpenseChargeReceipt & { id: string }) => {
    setActionError('');
    try {
      await ExpenseChargeReceiptService.approve(r.id!, user?.id ?? '');
      await load();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : '審核失敗');
    }
  };

  const handleCancel = async (r: ExpenseChargeReceipt & { id: string }) => {
    if (!confirm(`確定取消費用收款單 ${r.receiptNo}？`)) return;
    await ExpenseChargeReceiptService.cancel(r.id!);
    await load();
  };

  const handleDelete = async (r: ExpenseChargeReceipt & { id: string }) => {
    if (!confirm(`確定刪除費用收款單 ${r.receiptNo}？此操作不可復原。`)) return;
    setActionError('');
    try {
      await ExpenseChargeReceiptService.delete(r.id!);
      await load();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : '刪除失敗');
    }
  };

  const visible = filter === 'ALL' ? receipts : receipts.filter((r) => r.status === filter);
  const counts = {
    all: receipts.length,
    submitted: receipts.filter((r) => r.status === ExpenseChargeReceiptStatus.SUBMITTED).length,
    approved: receipts.filter((r) => r.status === ExpenseChargeReceiptStatus.APPROVED).length,
  };

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-txt-primary tracking-tight">費用收款</h1>
            <p className="text-base text-txt-subtle mt-0.5">向經銷商/顧客收取體重稱、郵寄等費用分攤</p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/expenses"
              className="px-4 py-2.5 border border-accent text-accent-text rounded-lg text-base font-medium hover:bg-accent/10 transition-colors"
            >
              費用管理
            </Link>
            <button
              onClick={openModal}
              className="px-5 py-2.5 bg-accent text-white rounded-lg text-base font-medium hover:bg-accent-hover transition-colors"
            >
              + 新增收款單
            </button>
          </div>
        </div>

        {actionError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {actionError}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="glass-card p-6 text-center">
            <p className="text-4xl font-bold tabular-nums text-txt-primary">{counts.all}</p>
            <p className="text-base text-txt-subtle mt-2">全部</p>
          </div>
          <div className="glass-card p-6 text-center">
            <p className="text-4xl font-bold tabular-nums text-yellow-600">{counts.submitted}</p>
            <p className="text-base text-txt-subtle mt-2">待審核</p>
          </div>
          <div className="glass-card p-6 text-center">
            <p className="text-4xl font-bold tabular-nums text-green-600">{counts.approved}</p>
            <p className="text-base text-txt-subtle mt-2">已審核</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          {(['ALL', ExpenseChargeReceiptStatus.DRAFT, ExpenseChargeReceiptStatus.SUBMITTED, ExpenseChargeReceiptStatus.APPROVED] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
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
            <p className="text-txt-subtle text-sm">沒有費用收款單</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-base">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-sm uppercase tracking-wide border-b border-gray-200">
                  <th className="px-4 py-3 text-left">收款單號</th>
                  <th className="px-4 py-3 text-left">日期</th>
                  <th className="px-4 py-3 text-left">客戶</th>
                  <th className="px-4 py-3 text-left">費用項目</th>
                  <th className="px-4 py-3 text-right">金額</th>
                  <th className="px-4 py-3 text-center">狀態</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((r) => (
                  <tr key={r.id} className="bg-white hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-sm font-bold text-gray-900">{r.receiptNo}</td>
                    <td className="px-4 py-3 text-gray-700">{fmtDate(r.paymentDate ?? r.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-900 font-medium">
                      <Link href={`/customers/${r.customerId}`} className="text-accent-text hover:underline">
                        {r.customerName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {r.items.map((i) => i.expenseNo).join(', ')}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-gray-900">
                      RM {r.totalAmount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[r.status]}`}>
                        {statusLabel[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {r.status === ExpenseChargeReceiptStatus.DRAFT && (
                          <button
                            onClick={() => handleSubmit(r)}
                            className="text-xs px-2 py-1 rounded bg-yellow-700 text-white hover:bg-yellow-600"
                          >
                            提交
                          </button>
                        )}
                        {r.status === ExpenseChargeReceiptStatus.SUBMITTED && (
                          <button
                            onClick={() => handleApprove(r)}
                            className="text-xs px-2 py-1 rounded bg-green-700 text-white hover:bg-green-600"
                          >
                            審核
                          </button>
                        )}
                        {(r.status === ExpenseChargeReceiptStatus.DRAFT || r.status === ExpenseChargeReceiptStatus.CANCELLED) && (
                          <button
                            onClick={() => handleDelete(r)}
                            className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                          >
                            刪除
                          </button>
                        )}
                        {r.status === ExpenseChargeReceiptStatus.SUBMITTED && (
                          <button
                            onClick={() => handleCancel(r)}
                            className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-700 hover:bg-gray-300"
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

        {/* Create Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                <div>
                  <h2 className="text-base font-semibold text-white">新增費用收款單</h2>
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
                      {step === 1 ? '選客戶' : step === 2 ? '選費用' : '填寫收款'}
                    </span>
                  </div>
                </div>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white text-lg">✕</button>
              </div>

              <div className="overflow-y-auto flex-1 px-6 py-4">
                {step === 1 && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-white mb-1">客戶 *</label>
                      <select
                        value={selCustomer?.id ?? ''}
                        onChange={(e) => handleCustomerSelect(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                      >
                        <option value="" className="bg-white text-gray-900">— 選擇客戶 —</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id} className="bg-white text-gray-900">
                            {c.displayName}（{c.role === UserRole.STOCKIST ? '經銷商' : '顧客'}）
                          </option>
                        ))}
                      </select>
                    </div>
                    {modalError && <p className="text-sm text-red-400">{modalError}</p>}
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-4">
                    {loadingCharges ? (
                      <p className="text-txt-subtle text-sm">載入中...</p>
                    ) : outstanding.length === 0 ? (
                      <div className="rounded-lg bg-yellow-900/30 border border-yellow-700/50 px-4 py-3">
                        <p className="text-yellow-300 text-sm">此客戶目前沒有未收的費用分攤</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-white">勾選要收款的費用分攤：</p>
                        <div className="space-y-2">
                          {outstanding.map((c) => (
                            <label
                              key={c.id}
                              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                checkedIds.has(c.id!)
                                  ? 'border-accent/50 bg-accent/10'
                                  : 'border-gray-600 hover:border-gray-500 bg-gray-700/50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checkedIds.has(c.id!)}
                                onChange={() => toggleCheck(c.id!)}
                                className="accent-accent"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-mono text-accent-text">{c.expenseNo}</p>
                                <p className="text-xs text-gray-400">{EXPENSE_TYPE_LABEL[c.expenseType]}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">未收 {c.remainingAmount.toFixed(2)}</span>
                                {checkedIds.has(c.id!) && (
                                  <input
                                    type="number"
                                    min="0"
                                    max={c.remainingAmount}
                                    step="0.01"
                                    value={chargeAmounts[c.id!] ?? c.remainingAmount.toFixed(2)}
                                    onChange={(e) => setChargeAmounts((prev) => ({ ...prev, [c.id!]: e.target.value }))}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-20 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-sm text-white"
                                  />
                                )}
                              </div>
                            </label>
                          ))}
                        </div>
                        {checkedIds.size > 0 && (
                          <div className="rounded-lg bg-surface-2 px-4 py-2 flex justify-between text-sm text-gray-900">
                            <span>本次收款：</span>
                            <span className="font-semibold tabular-nums">RM {totalAmount.toFixed(2)}</span>
                          </div>
                        )}
                        {modalError && <p className="text-sm text-red-400">{modalError}</p>}
                      </>
                    )}
                  </div>
                )}

                {step === 3 && (
                  <div className="space-y-4">
                    <div className="rounded-lg bg-surface-2 px-4 py-2 flex justify-between text-sm text-gray-900">
                      <span>收款金額：</span>
                      <span className="font-semibold tabular-nums">RM {totalAmount.toFixed(2)}</span>
                    </div>
                    <div>
                      <label className="block text-xs text-white mb-1">收款日期 *</label>
                      <input
                        type="date"
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-white mb-1">付款方式</label>
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
                      <label className="block text-xs text-white mb-1">備注（選填）</label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={2}
                        className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
                      />
                    </div>
                    {modalError && <p className="text-sm text-red-400">{modalError}</p>}
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-gray-700 flex justify-between">
                <div>
                  {step > 1 && (
                    <button
                      type="button"
                      onClick={() => setStep((s) => (s - 1) as ModalStep)}
                      className="px-4 py-2 text-sm text-gray-300 hover:text-white"
                    >
                      ← 上一步
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-sm text-gray-300 hover:text-white"
                  >
                    取消
                  </button>
                  {step < 3 ? (
                    <button
                      type="button"
                      onClick={step === 1 ? goToStep2 : goToStep3}
                      className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover"
                    >
                      下一步 →
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-50"
                    >
                      {saving ? '儲存中...' : '儲存草稿'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
