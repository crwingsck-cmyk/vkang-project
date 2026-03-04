'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DepositService } from '@/services/database/deposits';
import { ReceivableService } from '@/services/database/receivables';
import { UserService } from '@/services/database/users';
import { Deposit, Receivable, User, UserRole } from '@/types/models';
import { generateDocumentNumber } from '@/lib/documentNumber';
import Link from 'next/link';

const PAYMENT_METHODS = [
  { value: 'cash', label: '現金' },
  { value: 'bank', label: '銀行轉帳' },
  { value: 'credit', label: '支票' },
];

function fmtDate(ts?: number) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-GB');
}

export default function DepositsPage() {
  const { user } = useAuth();
  const [deposits, setDeposits] = useState<(Deposit & { id: string })[]>([]);
  const [customers, setCustomers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCustomer, setFilterCustomer] = useState('ALL');
  const [actionError, setActionError] = useState('');

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addCustomerId, setAddCustomerId] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [addDate, setAddDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [addPayMethod, setAddPayMethod] = useState('bank');
  const [addPayRef, setAddPayRef] = useState('');
  const [addNotes, setAddNotes] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  // Apply to AR modal
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyDeposit, setApplyDeposit] = useState<(Deposit & { id: string }) | null>(null);
  const [applyReceivables, setApplyReceivables] = useState<Receivable[]>([]);
  const [applyArId, setApplyArId] = useState('');
  const [applyAmount, setApplyAmount] = useState('');
  const [applySaving, setApplySaving] = useState(false);
  const [applyError, setApplyError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, custs] = await Promise.all([
        DepositService.getAll(),
        UserService.getAll(),
      ]);
      setDeposits(list);
      setCustomers(custs);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = deposits.filter(
    (d) => filterCustomer === 'ALL' || d.customerId === filterCustomer
  );
  const totalBalance = deposits.reduce((s, d) => s + d.balance, 0);
  const totalReceived = deposits.reduce((s, d) => s + d.amount, 0);

  const openAddModal = () => {
    setShowAddModal(true);
    setAddCustomerId('');
    setAddAmount('');
    setAddDate(new Date().toISOString().slice(0, 10));
    setAddPayMethod('bank');
    setAddPayRef('');
    setAddNotes('');
    setAddError('');
  };

  const handleAdd = async () => {
    const amount = parseFloat(addAmount);
    if (!addCustomerId) { setAddError('請選擇客戶'); return; }
    if (!amount || amount <= 0) { setAddError('請填寫有效金額'); return; }

    setAddSaving(true);
    setAddError('');
    try {
      const cust = customers.find((c) => c.id === addCustomerId);
      const existingNos = await DepositService.getAllDepositNos();
      const depositNo = generateDocumentNumber('DP', existingNos);

      await DepositService.create({
        depositNo,
        customerId: addCustomerId,
        customerName: cust?.displayName ?? '',
        amount,
        balance: amount,
        paymentDate: new Date(addDate + 'T12:00:00').getTime(),
        paymentMethod: addPayMethod,
        paymentReference: addPayRef || undefined,
        notes: addNotes || undefined,
        createdBy: user?.id,
      });
      setShowAddModal(false);
      await load();
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : '儲存失敗');
    } finally {
      setAddSaving(false);
    }
  };

  const openApplyModal = async (d: Deposit & { id: string }) => {
    if (d.balance <= 0) return;
    setApplyDeposit(d);
    setApplyArId('');
    setApplyAmount('');
    setApplyError('');
    const arList = await ReceivableService.getOutstandingByCustomer(d.customerId);
    setApplyReceivables(arList);
    setShowApplyModal(true);
  };

  const handleApply = async () => {
    if (!applyDeposit) return;
    const amount = parseFloat(applyAmount);
    if (!applyArId) { setApplyError('請選擇應收款'); return; }
    if (!amount || amount <= 0) { setApplyError('請填寫有效金額'); return; }
    if (amount > applyDeposit.balance) {
      setApplyError(`訂金餘額不足（剩餘 ${applyDeposit.balance.toFixed(2)}）`);
      return;
    }

    const ar = applyReceivables.find((r) => r.id === applyArId);
    if (ar && amount > ar.remainingAmount) {
      setApplyError(`超過應收款未收餘額（${ar.remainingAmount.toFixed(2)}）`);
      return;
    }

    setApplySaving(true);
    setApplyError('');
    try {
      await DepositService.applyToReceivable(applyDeposit.id!, applyArId, amount);
      setShowApplyModal(false);
      setApplyDeposit(null);
      await load();
    } catch (e: unknown) {
      setApplyError(e instanceof Error ? e.message : '扣抵失敗');
    } finally {
      setApplySaving(false);
    }
  };

  const handleDelete = async (d: Deposit & { id: string }) => {
    if (!confirm(`確定刪除訂金 ${d.depositNo}？此操作不可復原。`)) return;
    setActionError('');
    try {
      await DepositService.delete(d.id!);
      await load();
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : '刪除失敗');
    }
  };

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-txt-primary tracking-tight">訂金 (Deposit)</h1>
            <p className="text-base text-txt-subtle mt-0.5">向顧客/經銷商收取預付款，可於發貨後扣抵應收款</p>
          </div>
          <button
            onClick={openAddModal}
            className="px-5 py-2.5 bg-accent text-white rounded-lg text-base font-medium hover:bg-accent-hover transition-colors"
          >
            + 新增訂金
          </button>
        </div>

        {actionError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {actionError}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="glass-card p-6 text-center">
            <p className="text-4xl font-bold tabular-nums text-txt-primary">{deposits.length}</p>
            <p className="text-base text-txt-subtle mt-2">筆數</p>
          </div>
          <div className="glass-card p-6 text-center">
            <p className="text-4xl font-bold tabular-nums text-green-600">{totalReceived.toFixed(2)}</p>
            <p className="text-base text-txt-subtle mt-2">總收取</p>
          </div>
          <div className="glass-card p-6 text-center">
            <p className="text-4xl font-bold tabular-nums text-accent-text">{totalBalance.toFixed(2)}</p>
            <p className="text-base text-txt-subtle mt-2">可扣抵餘額</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <select
            value={filterCustomer}
            onChange={(e) => setFilterCustomer(e.target.value)}
            className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
          >
            <option value="ALL">全部客戶</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.displayName}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3" />
            <p className="text-txt-subtle text-sm">載入中...</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="glass-card p-10 text-center">
            <p className="text-txt-subtle text-sm">尚無訂金記錄</p>
            <button
              onClick={openAddModal}
              className="mt-4 px-4 py-2 text-sm font-medium text-accent-text hover:underline"
            >
              + 新增第一筆訂金
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-base">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-sm uppercase tracking-wide border-b border-gray-200">
                  <th className="px-4 py-3 text-left">訂金單號</th>
                  <th className="px-4 py-3 text-left">日期</th>
                  <th className="px-4 py-3 text-left">客戶</th>
                  <th className="px-4 py-3 text-right">收取金額</th>
                  <th className="px-4 py-3 text-right">可扣抵餘額</th>
                  <th className="px-4 py-3 text-left">付款方式</th>
                  <th className="px-4 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visible.map((d) => (
                  <tr key={d.id} className="bg-white hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-sm font-bold text-gray-900">{d.depositNo}</td>
                    <td className="px-4 py-3 text-gray-700">{fmtDate(d.paymentDate)}</td>
                    <td className="px-4 py-3 text-gray-900 font-medium">
                      <Link href={`/customers/${d.customerId}`} className="text-accent-text hover:underline">
                        {d.customerName}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-gray-900">
                      RM {d.amount.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={d.balance > 0 ? 'font-bold text-accent-text' : 'text-gray-400'}>
                        RM {d.balance.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {PAYMENT_METHODS.find((m) => m.value === d.paymentMethod)?.label ?? d.paymentMethod ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {d.balance > 0 && (
                          <button
                            onClick={() => openApplyModal(d)}
                            className="text-xs px-2 py-1 rounded bg-accent text-white hover:bg-accent-hover"
                          >
                            扣抵 AR
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(d)}
                          className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200"
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add Modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md shadow-2xl">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">新增訂金</h2>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">客戶 *</label>
                  <select
                    value={addCustomerId}
                    onChange={(e) => setAddCustomerId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  >
                    <option value="">— 選擇客戶 —</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.displayName}（{c.role === UserRole.STOCKIST ? '經銷商' : '顧客'}）
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">收款日期 *</label>
                  <input
                    type="date"
                    value={addDate}
                    onChange={(e) => setAddDate(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">金額 (RM) *</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={addAmount}
                    onChange={(e) => setAddAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">付款方式</label>
                  <select
                    value={addPayMethod}
                    onChange={(e) => setAddPayMethod(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">銀行流水號（選填）</label>
                  <input
                    type="text"
                    value={addPayRef}
                    onChange={(e) => setAddPayRef(e.target.value)}
                    placeholder="e.g. TT2026022800001"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">備注（選填）</label>
                  <textarea
                    value={addNotes}
                    onChange={(e) => setAddNotes(e.target.value)}
                    rows={2}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  />
                </div>
                {addError && (
                  <p className="text-sm text-red-600">{addError}</p>
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={addSaving}
                  className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover disabled:opacity-50 rounded-lg"
                >
                  {addSaving ? '儲存中...' : '儲存'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Apply to AR Modal */}
        {showApplyModal && applyDeposit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md shadow-2xl">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">訂金扣抵應收款</h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  {applyDeposit.depositNo} · 餘額 RM {applyDeposit.balance.toFixed(2)}
                </p>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">選擇應收款 *</label>
                  <select
                    value={applyArId}
                    onChange={(e) => {
                      setApplyArId(e.target.value);
                      const ar = applyReceivables.find((r) => r.id === e.target.value);
                      if (ar) setApplyAmount(Math.min(applyDeposit.balance, ar.remainingAmount).toFixed(2));
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  >
                    <option value="">— 選擇發貨單 —</option>
                    {applyReceivables.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.deliveryNoteNo} · 未收 RM {r.remainingAmount.toFixed(2)}
                      </option>
                    ))}
                  </select>
                  {applyReceivables.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">此客戶目前沒有未收的應收款</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">扣抵金額 (RM) *</label>
                  <input
                    type="number"
                    min="0.01"
                    max={applyDeposit.balance}
                    step="0.01"
                    value={applyAmount}
                    onChange={(e) => setApplyAmount(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-accent"
                  />
                </div>
                {applyError && (
                  <p className="text-sm text-red-600">{applyError}</p>
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setShowApplyModal(false); setApplyDeposit(null); }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={applySaving || applyReceivables.length === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-accent hover:bg-accent-hover disabled:opacity-50 rounded-lg"
                >
                  {applySaving ? '扣抵中...' : '確認扣抵'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
