'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { OrderService } from '@/services/database/orders';
import { ProductService } from '@/services/database/products';
import { InventorySyncService } from '@/services/database/inventorySync';
import { UserRole, Transaction, TransactionType, TransactionStatus, TransactionItem } from '@/types/models';

type RowKind = 'order' | 'shipment';

interface StockLedgerRow {
  kind: RowKind;
  date: number;
  refId: string;
  productName: string;
  productId: string;
  quantity: number;
  direction: 'in' | 'out';
  type: string;
  /** 經銷商（訂貨時的上游）或 下線/自用（發貨時的收貨人） */
  partyName: string;
  /** 經銷商價 / 發貨價銷 */
  amount: number;
  /** 該筆交易後的庫存累計 */
  runningInventory: number;
}

export default function StockLedgerPage() {
  const params = useParams();
  const userId = (params?.userId ?? '') as string;
  useAuth();

  const [user, setUser] = useState<{ displayName: string } | null>(null);
  const [rows, setRows] = useState<StockLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addError, setAddError] = useState('');

  useEffect(() => {
    if (userId) load();
  }, [userId]);

  async function load() {
    setLoading(true);
    try {
      const [u, txList] = await Promise.all([
        UserService.getById(userId),
        OrderService.getByUserRelated(userId, 300),
      ]);
      setUser(u ? { displayName: u.displayName } : null);

      const flat: Omit<StockLedgerRow, 'runningInventory'>[] = [];
      for (const t of txList) {
        const txn = t as Transaction & { id: string };
        const date = txn.createdAt ?? 0;
        const refId = txn.poNumber ?? txn.id ?? '—';
        const isOut = txn.fromUser?.userId === userId;
        const isIn = txn.toUser?.userId === userId;
        const typeLabel = getTypeLabel(txn.transactionType);
        const direction = isOut ? 'out' : isIn ? 'in' : null;
        if (!direction) continue;

        const partyName = isIn ? (txn.fromUser?.userName ?? '—') : (txn.toUser?.userName ?? '—');

        for (const item of txn.items ?? []) {
          const amount = item.total ?? (item.unitPrice ?? 0) * (item.quantity ?? 0);
          flat.push({
            kind: isIn ? 'order' : 'shipment',
            date,
            refId,
            productName: item.productName,
            productId: item.productId,
            quantity: item.quantity,
            direction,
            type: typeLabel,
            partyName,
            amount,
          });
        }
      }
      // 依日期升序以正確計算庫存累計
      flat.sort((a, b) => a.date - b.date);

      let running = 0;
      const withInventory: StockLedgerRow[] = flat.map((r) => {
        running += r.direction === 'in' ? r.quantity : -r.quantity;
        return { ...r, runningInventory: Math.max(0, running) };
      });
      setRows(withInventory);
    } catch (err) {
      console.error('Load stock ledger error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/hierarchy" className="text-txt-subtle hover:text-txt-primary text-sm mb-1 inline-block">
              ← 返回金三角架構
            </Link>
            <h1 className="text-xl font-bold text-txt-primary tracking-tight">
              {user?.displayName ?? '—'} 庫存表
            </h1>
            <p className="text-sm text-txt-subtle mt-0.5">經銷商訂貨、下線/自用發貨、庫存累計</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-lg"
            >
              + 新增異動
            </button>
            <Link
              href={`/users/${userId}`}
              className="px-3 py-1.5 bg-surface-2 hover:bg-surface-3 border border-border text-txt-secondary text-xs font-medium rounded-lg"
            >
              編輯使用者
            </Link>
          </div>
        </div>

        {showAddModal && (
          <AddMovementModal
            userId={userId}
            userName={user?.displayName ?? '—'}
            error={addError}
            onClose={() => { setShowAddModal(false); setAddError(''); }}
            onDone={() => { setShowAddModal(false); setAddError(''); load(); }}
            onError={setAddError}
          />
        )}

        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3" />
            <p className="text-txt-subtle text-sm">載入庫存表...</p>
          </div>
        ) : (
          <div className="glass-panel overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-border bg-emerald-800/80 text-white">
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">
                    經銷商
                  </th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">
                    下線/自用
                  </th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">
                    經銷商訂貨日
                  </th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">
                    經銷商訂貨數
                  </th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">
                    經銷商價
                  </th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">
                    發貨日期
                  </th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">
                    發貨產品
                  </th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">
                    發貨數
                  </th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">
                    發貨號碼
                  </th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">
                    發貨價銷
                  </th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap">
                    庫存
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-txt-subtle text-sm">
                      尚無庫存異動紀錄
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => (
                    <tr
                      key={`${row.date}-${row.refId}-${row.productId}-${row.direction}-${idx}`}
                      className={`hover:bg-surface-2/50 ${idx % 2 === 0 ? 'bg-white/5' : 'bg-emerald-50/10 dark:bg-emerald-950/10'}`}
                    >
                      <td className="px-3 py-2.5 text-txt-primary whitespace-nowrap">
                        {row.kind === 'order' ? row.partyName : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-txt-primary whitespace-nowrap">
                        {row.kind === 'shipment' ? row.partyName : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-txt-secondary tabular-nums whitespace-nowrap">
                        {row.kind === 'order' && row.date
                          ? new Date(row.date).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                        {row.kind === 'order' ? row.quantity : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-txt-secondary">
                        {row.kind === 'order' && row.amount ? `USD ${row.amount}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-txt-secondary tabular-nums whitespace-nowrap">
                        {row.kind === 'shipment' && row.date
                          ? new Date(row.date).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-txt-primary">
                        {row.kind === 'shipment' ? (
                          <>
                            {row.productName}
                            <span className="font-mono text-xs text-txt-subtle ml-1">({row.productId})</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-medium bg-emerald-50/20 dark:bg-emerald-950/20">
                        {row.kind === 'shipment' ? row.quantity : '—'}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-txt-secondary">
                        {row.kind === 'shipment' ? row.refId : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-txt-secondary">
                        {row.kind === 'shipment' && row.amount ? `USD ${row.amount}` : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-semibold bg-emerald-50/20 dark:bg-emerald-950/20">
                        {row.runningInventory}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    sale: '銷售',
    purchase: '進貨',
    transfer: '調撥',
    loan: '借貨',
    return: '歸還',
    adjustment: '調整',
  };
  return labels[type?.toLowerCase()] ?? type ?? '—';
}

type ProductOption = { sku: string; name: string };

function AddMovementModal({
  userId,
  userName,
  error,
  onClose,
  onDone,
  onError,
}: {
  userId: string;
  userName: string;
  error: string;
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    refId: `ADJ-${Date.now()}`,
    productId: '',
    productName: '',
    quantity: 1,
    direction: 'in' as 'in' | 'out',
  });

  useEffect(() => {
    ProductService.getAll(undefined, 200).then((list) => {
      setProducts(list.map((p) => ({ sku: p.sku, name: p.name })));
      setForm((f) => {
        if (f.productId || list.length === 0) return f;
        return { ...f, productId: list[0].sku, productName: list[0].name };
      });
      setLoading(false);
    });
  }, []);

  function handleProductChange(sku: string) {
    const p = products.find((x) => x.sku === sku);
    setForm((f) => ({ ...f, productId: sku, productName: p?.name ?? '' }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onError('');
    if (!form.productId || form.quantity <= 0) {
      onError('請選擇產品並輸入數量');
      return;
    }
    setSaving(true);
    try {
      const dateMs = new Date(form.date).getTime();
      const refId = form.refId.trim() || `ADJ-${dateMs}`;
      const items: TransactionItem[] = [{
        productId: form.productId,
        productName: form.productName,
        quantity: form.quantity,
        unitPrice: 0,
        total: 0,
      }];
      const fromUser = form.direction === 'out' ? { userId, userName } : { userId: 'system', userName: '手動調整' };
      const toUser = form.direction === 'in' ? { userId, userName } : { userId: 'system', userName: '手動調整' };

      const created = await OrderService.create(
        {
          transactionType: TransactionType.ADJUSTMENT,
          status: TransactionStatus.COMPLETED,
          description: '手動庫存異動',
          fromUser,
          toUser,
          items,
          totals: { subtotal: 0, grandTotal: 0 },
          poNumber: refId,
        },
        { customId: refId, createdAt: dateMs }
      );

      await InventorySyncService.onAdjustment(
        form.direction === 'out' ? userId : null,
        form.direction === 'in' ? userId : null,
        items,
        created.id ?? refId
      );

      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : '新增失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md bg-surface-1 border border-border rounded-xl p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-txt-primary mb-4">新增庫存異動</h2>
        {error && (
          <div className="mb-4 px-4 py-2 bg-error/10 border border-error/30 text-error text-sm rounded-lg">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-txt-subtle text-sm">載入產品...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-txt-subtle mb-1">日期</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-txt-primary text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-txt-subtle mb-1">發貨號碼（選填）</label>
              <input
                type="text"
                value={form.refId}
                onChange={(e) => setForm((f) => ({ ...f, refId: e.target.value }))}
                placeholder="ADJ-xxx"
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-txt-primary text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-txt-subtle mb-1">產品</label>
              <select
                value={form.productId}
                onChange={(e) => handleProductChange(e.target.value)}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-txt-primary text-sm"
              >
                <option value="">請選擇</option>
                {products.map((p) => (
                  <option key={p.sku} value={p.sku}>{p.name} ({p.sku})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-txt-subtle mb-1">數量</label>
              <input
                type="number"
                min="1"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: parseInt(e.target.value) || 0 }))}
                className="w-full px-3 py-2 bg-surface-2 border border-border rounded-lg text-txt-primary text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-txt-subtle mb-1">進/出</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="direction"
                    checked={form.direction === 'in'}
                    onChange={() => setForm((f) => ({ ...f, direction: 'in' }))}
                    className="text-accent"
                  />
                  <span className="text-sm text-txt-primary">入</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="direction"
                    checked={form.direction === 'out'}
                    onChange={() => setForm((f) => ({ ...f, direction: 'out' }))}
                    className="text-accent"
                  />
                  <span className="text-sm text-txt-primary">出</span>
                </label>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg"
              >
                {saving ? '儲存中...' : '儲存'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-surface-2 hover:bg-surface-3 border border-border text-txt-secondary text-sm rounded-lg"
              >
                取消
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
