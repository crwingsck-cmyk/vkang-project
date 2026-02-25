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
  /** 發貨時的收貨人 userId，用於判斷是否為自用 */
  recipientUserId?: string;
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

        const partyName = isIn ? (txn.fromUser?.userName ?? '') : (txn.toUser?.userName ?? '');
        const recipientUserId = isOut ? (txn.toUser?.userId ?? '') : undefined;

        for (const item of txn.items ?? []) {
          const amount = item.total ?? (item.unitPrice ?? 0) * (item.quantity ?? 0);
          flat.push({
            kind: isIn ? 'order' : 'shipment',
            date,
            refId: txn.poNumber ?? txn.id ?? '',
            productName: item.productName ?? '',
            productId: item.productId ?? '',
            quantity: item.quantity,
            direction,
            type: typeLabel,
            partyName,
            recipientUserId,
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
            <table className="w-full text-base min-w-[900px]">
              <thead>
                <tr className="border-b border-border bg-emerald-800/80 text-white">
                  <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wider whitespace-nowrap">
                    經銷商
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wider whitespace-nowrap">
                    下線/自用
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wider whitespace-nowrap">
                    經銷商訂貨日
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold uppercase tracking-wider whitespace-nowrap">
                    經銷商訂貨數
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold uppercase tracking-wider whitespace-nowrap">
                    經銷商價
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wider whitespace-nowrap">
                    發貨日期
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wider whitespace-nowrap">
                    發貨產品
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold uppercase tracking-wider whitespace-nowrap">
                    發貨數
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold uppercase tracking-wider whitespace-nowrap">
                    發貨號碼
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold uppercase tracking-wider whitespace-nowrap">
                    發貨價銷
                  </th>
                  <th className="px-4 py-3 text-right text-sm font-semibold uppercase tracking-wider whitespace-nowrap">
                    庫存
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-12 text-center text-txt-subtle text-base">
                      尚無庫存異動紀錄
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => {
                    const stockistName = user?.displayName ?? '';
                    const isSelfUse = row.kind === 'shipment' && row.recipientUserId === userId;
                    const downlineDisplay = row.kind === 'shipment' ? (isSelfUse ? stockistName : row.partyName) : '';
                    // 自用時，經銷商欄位顯示出貨細節（產品名 × 數量、發貨號碼）
                    const distributorDisplay = row.kind === 'order'
                      ? stockistName
                      : isSelfUse
                        ? [row.productName && `${row.productName} × ${row.quantity}`, row.refId].filter(Boolean).join(' ')
                        : '';
                    return (
                    <tr
                      key={`${row.date}-${row.refId}-${row.productId}-${row.direction}-${idx}`}
                      className={`hover:bg-surface-2/50 ${idx % 2 === 0 ? 'bg-white/5' : 'bg-emerald-50/10 dark:bg-emerald-950/10'}`}
                    >
                      <td className="px-4 py-3 text-txt-primary whitespace-nowrap text-[15px]">
                        {distributorDisplay}
                      </td>
                      <td className="px-4 py-3 text-txt-primary whitespace-nowrap text-[15px]">
                        {downlineDisplay}
                      </td>
                      <td className="px-4 py-3 text-txt-secondary tabular-nums whitespace-nowrap text-[15px]">
                        {row.kind === 'order' && row.date
                          ? new Date(row.date).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
                          : ''}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-[15px]">
                        {row.kind === 'order' ? row.quantity : ''}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-txt-secondary text-[15px]">
                        {row.kind === 'order' && row.amount ? `USD ${row.amount}` : ''}
                      </td>
                      <td className="px-4 py-3 text-txt-secondary tabular-nums whitespace-nowrap text-[15px]">
                        {row.kind === 'shipment' && row.date
                          ? new Date(row.date).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
                          : ''}
                      </td>
                      <td className="px-4 py-3 text-txt-primary text-[15px]">
                        {row.kind === 'shipment' ? row.productName : ''}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium bg-emerald-50/20 dark:bg-emerald-950/20 text-[15px]">
                        {row.kind === 'shipment' ? row.quantity : ''}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm text-txt-secondary text-[15px]">
                        {row.kind === 'shipment' ? row.refId : ''}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-txt-secondary text-[15px]">
                        {row.kind === 'shipment' && row.amount ? `USD ${row.amount}` : ''}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold bg-emerald-50/20 dark:bg-emerald-950/20 text-[15px]">
                        {row.runningInventory}
                      </td>
                    </tr>
                    );
                  })
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
type DownlineOption = { id: string; displayName: string };
type UpstreamOption = { id: string; displayName: string };

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
  const [downlines, setDownlines] = useState<DownlineOption[]>([]);
  const [upstreams, setUpstreams] = useState<UpstreamOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    direction: 'in' as 'in' | 'out',
    // 入：經銷商訂貨
    upstreamId: '',
    upstreamName: '',
    orderDate: new Date().toISOString().slice(0, 10),
    orderQty: 1,
    orderPrice: 0,
    // 出：下線/自用發貨
    downlineId: '',
    downlineName: '',
    shipDate: new Date().toISOString().slice(0, 10),
    productId: '',
    productName: '',
    shipQty: 1,
    refId: `SHIP-${Date.now()}`,
    shipPrice: 0,
  });

  useEffect(() => {
    async function load() {
      try {
        const [productList, children, allUsers] = await Promise.all([
          ProductService.getAll(undefined, 200),
          UserService.getChildren(userId),
          UserService.getAllForAdmin(200),
        ]);
        setProducts(productList.map((p) => ({ sku: p.sku, name: p.name })));
        setDownlines([
          { id: userId, displayName: '自用' },
          ...children.map((u) => ({ id: u.id ?? u.email ?? '', displayName: u.displayName ?? '—' })),
        ]);
        setUpstreams([
          { id: 'system', displayName: '手動調整' },
          ...allUsers.filter((u) => (u.id ?? u.email) !== userId).map((u) => ({
            id: u.id ?? u.email ?? '',
            displayName: u.displayName ?? '—',
          })),
        ]);
        setForm((f) => ({
          ...f,
          productId: productList[0]?.sku ?? '',
          productName: productList[0]?.name ?? '',
          upstreamId: 'system',
          upstreamName: '手動調整',
          downlineId: userId,
          downlineName: '自用',
        }));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [userId]);

  function handleProductChange(sku: string) {
    const p = products.find((x) => x.sku === sku);
    setForm((f) => ({ ...f, productId: sku, productName: p?.name ?? '' }));
  }

  function handleUpstreamChange(id: string) {
    const u = upstreams.find((x) => x.id === id);
    setForm((f) => ({ ...f, upstreamId: id, upstreamName: u?.displayName ?? '' }));
  }

  function handleDownlineChange(id: string) {
    const d = downlines.find((x) => x.id === id);
    setForm((f) => ({ ...f, downlineId: id, downlineName: d?.displayName ?? '' }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onError('');

    const productId = form.productId;
    const productName = form.productName;
    const quantity = form.direction === 'in' ? form.orderQty : form.shipQty;
    if (!productId || quantity <= 0) {
      onError('請選擇產品並輸入數量');
      return;
    }

    if (form.direction === 'out' && !form.downlineId) {
      onError('請選擇下線或自用');
      return;
    }

    setSaving(true);
    try {
      const items: TransactionItem[] = [{
        productId,
        productName,
        quantity,
        unitPrice: form.direction === 'in' ? form.orderPrice : form.shipPrice,
        total: form.direction === 'in' ? form.orderPrice * form.orderQty : form.shipPrice * form.shipQty,
      }];

      if (form.direction === 'in') {
        const dateMs = new Date(form.orderDate).getTime();
        const refId = `ORD-${dateMs}`;
        const fromUser = form.upstreamId === 'system'
          ? { userId: 'system', userName: '手動調整' }
          : { userId: form.upstreamId, userName: form.upstreamName };
        const toUser = { userId, userName };

        await OrderService.create(
          {
            transactionType: TransactionType.ADJUSTMENT,
            status: TransactionStatus.COMPLETED,
            description: '經銷商訂貨',
            fromUser,
            toUser,
            items,
            totals: { subtotal: items[0].total, grandTotal: items[0].total },
            poNumber: refId,
          },
          { customId: refId, createdAt: dateMs }
        );
        await InventorySyncService.onAdjustment(null, userId, items, refId);
      } else {
        const dateMs = new Date(form.shipDate).getTime();
        const refId = form.refId.trim() || `SHIP-${dateMs}`;
        const fromUser = { userId, userName };
        const toUser = form.downlineId === userId
          ? { userId, userName: `${userName} (自用)` }
          : { userId: form.downlineId, userName: form.downlineName };

        if (form.downlineId === userId) {
          await OrderService.create(
            {
              transactionType: TransactionType.ADJUSTMENT,
              status: TransactionStatus.COMPLETED,
              description: '自用',
              fromUser,
              toUser,
              items,
              totals: { subtotal: items[0].total, grandTotal: items[0].total },
              poNumber: refId,
            },
            { customId: refId, createdAt: dateMs }
          );
          await InventorySyncService.onAdjustment(userId, null, items, refId);
        } else {
          await OrderService.create(
            {
              transactionType: TransactionType.TRANSFER,
              status: TransactionStatus.COMPLETED,
              description: '發貨給下線',
              fromUser,
              toUser,
              items,
              totals: { subtotal: items[0].total, grandTotal: items[0].total },
              poNumber: refId,
            },
            { customId: refId, createdAt: dateMs }
          );
          await InventorySyncService.onTransferCompleted(userId, form.downlineId, items, refId);
        }
      }
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
        className="w-full max-w-lg bg-surface-1 border border-border rounded-xl p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-txt-primary mb-4">新增庫存異動</h2>
        {error && (
          <div className="mb-4 px-4 py-2 bg-error/10 border border-error/30 text-error text-sm rounded-lg">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-txt-subtle text-base">載入中...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-txt-subtle mb-1">進/出</label>
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="direction"
                    checked={form.direction === 'in'}
                    onChange={() => setForm((f) => ({ ...f, direction: 'in' }))}
                    className="text-accent"
                  />
                  <span className="text-base text-txt-primary">入（經銷商訂貨）</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="direction"
                    checked={form.direction === 'out'}
                    onChange={() => setForm((f) => ({ ...f, direction: 'out' }))}
                    className="text-accent"
                  />
                  <span className="text-base text-txt-primary">出（下線/自用發貨）</span>
                </label>
              </div>
            </div>

            {form.direction === 'in' ? (
              <>
                <div>
                  <label className="block text-sm font-medium text-txt-subtle mb-1">經銷商（上游）</label>
                  <select
                    value={form.upstreamId}
                    onChange={(e) => handleUpstreamChange(e.target.value)}
                    className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-base"
                  >
                    {upstreams.map((u) => (
                      <option key={u.id} value={u.id}>{u.displayName}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-txt-subtle mb-1">經銷商訂貨日</label>
                  <input
                    type="date"
                    value={form.orderDate}
                    onChange={(e) => setForm((f) => ({ ...f, orderDate: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-base"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-txt-subtle mb-1">產品</label>
                  <select
                    value={form.productId}
                    onChange={(e) => handleProductChange(e.target.value)}
                    className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-base"
                  >
                    <option value="">請選擇</option>
                    {products.map((p) => (
                      <option key={p.sku} value={p.sku}>{p.name} ({p.sku})</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-txt-subtle mb-1">經銷商訂貨數</label>
                    <input
                      type="number"
                      min="1"
                      value={form.orderQty}
                      onChange={(e) => setForm((f) => ({ ...f, orderQty: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-base"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-txt-subtle mb-1">經銷商價 (USD)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.orderPrice || ''}
                      onChange={(e) => setForm((f) => ({ ...f, orderPrice: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-base"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-txt-subtle mb-1">下線/自用 (必選)</label>
                  <select
                    value={form.downlineId}
                    onChange={(e) => handleDownlineChange(e.target.value)}
                    className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-base"
                  >
                    {downlines.map((d) => (
                      <option key={d.id} value={d.id}>{d.displayName}</option>
                    ))}
                  </select>
                  <p className="text-xs text-txt-subtle mt-1">僅能選擇系統中該經銷商的下線或自用</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-txt-subtle mb-1">發貨日期</label>
                  <input
                    type="date"
                    value={form.shipDate}
                    onChange={(e) => setForm((f) => ({ ...f, shipDate: e.target.value }))}
                    className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-base"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-txt-subtle mb-1">發貨產品</label>
                  <select
                    value={form.productId}
                    onChange={(e) => handleProductChange(e.target.value)}
                    className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-base"
                  >
                    <option value="">請選擇</option>
                    {products.map((p) => (
                      <option key={p.sku} value={p.sku}>{p.name} ({p.sku})</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-txt-subtle mb-1">發貨數</label>
                    <input
                      type="number"
                      min="1"
                      value={form.shipQty}
                      onChange={(e) => setForm((f) => ({ ...f, shipQty: parseInt(e.target.value) || 0 }))}
                      className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-base"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-txt-subtle mb-1">發貨價銷 (USD)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.shipPrice || ''}
                      onChange={(e) => setForm((f) => ({ ...f, shipPrice: parseFloat(e.target.value) || 0 }))}
                      className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-base"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-txt-subtle mb-1">發貨號碼</label>
                  <input
                    type="text"
                    value={form.refId}
                    onChange={(e) => setForm((f) => ({ ...f, refId: e.target.value }))}
                    placeholder="SHIP-xxx"
                    className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-base font-mono"
                  />
                </div>
              </>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-base font-medium rounded-lg"
              >
                {saving ? '儲存中...' : '儲存'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-surface-2 hover:bg-surface-3 border border-border text-txt-secondary text-base rounded-lg"
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
