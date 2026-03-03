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
import { InventoryService } from '@/services/database/inventory';
import { InventoryReconcileService } from '@/services/database/inventoryReconcile';
import { UserRole, Transaction, TransactionType, TransactionStatus, TransactionItem, ReceivableStatus } from '@/types/models';
import { generateDocumentNumber } from '@/lib/documentNumber';
import { ReceivableService } from '@/services/database/receivables';

type RowKind = 'order' | 'shipment';

interface StockLedgerRow {
  kind: RowKind;
  date: number;
  refId: string;
  transactionId: string;
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

  const [user, setUser] = useState<{ displayName: string; upstreamDisplayName?: string; grandUpstreamDisplayName?: string; role?: UserRole; phoneNumber?: string; company?: string; city?: string } | null>(null);
  const [rows, setRows] = useState<StockLedgerRow[]>([]);
  const [firestoreInv, setFirestoreInv] = useState<{ productId: string; productName: string; quantity: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTransactionId, setEditTransactionId] = useState<string | null>(null);
  const [deleteTransactionId, setDeleteTransactionId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [addError, setAddError] = useState('');
  const [reconciling, setReconciling] = useState(false);
  const [reconcileMsg, setReconcileMsg] = useState<string | null>(null);

  useEffect(() => {
    if (userId) load();
  }, [userId]);

  async function load() {
    setLoading(true);
    try {
      const [u, txList, invList, products] = await Promise.all([
        UserService.getById(userId),
        OrderService.getByUserRelated(userId, 300),
        InventoryService.getByUser(userId, 200),
        ProductService.getAll(undefined, 200),
      ]);
      // Build Firestore inventory panel
      const productNames: Record<string, string> = {};
      for (const p of products) { if (p.sku) productNames[p.sku] = p.name || p.sku; }
      setFirestoreInv(
        invList
          .filter(inv => (inv.quantityOnHand ?? 0) > 0)
          .map(inv => ({
            productId: inv.productId,
            productName: productNames[inv.productId] || inv.productId,
            quantity: inv.quantityOnHand,
          }))
          .sort((a, b) => b.quantity - a.quantity)
      );
      let upstreamDisplayName = '';
      let grandUpstreamDisplayName = '';
      if (u?.parentUserId) {
        const parent = await UserService.getById(u.parentUserId);
        upstreamDisplayName = parent?.displayName ?? '';
        if (parent?.parentUserId) {
          const grandParent = await UserService.getById(parent.parentUserId);
          grandUpstreamDisplayName = grandParent?.displayName ?? '';
        }
      }
      setUser(u ? { displayName: u.displayName ?? '', upstreamDisplayName, grandUpstreamDisplayName, role: u.role, phoneNumber: u.phoneNumber, company: u.company?.name, city: u.address?.city } : null);

      const flat: Omit<StockLedgerRow, 'runningInventory'>[] = [];
      for (const t of txList) {
        const txn = t as Transaction & { id: string };
        // Cancelled = no net inventory effect (never executed or already reverted)
        if (txn.status === TransactionStatus.CANCELLED) continue;
        // Completed loans = net-zero for both parties (inventory restored via onLoanReturned)
        if (txn.transactionType === TransactionType.LOAN && txn.status === TransactionStatus.COMPLETED) continue;
        const date = txn.createdAt ?? 0;
        const isOut = txn.fromUser?.userId === userId;
        const isIn = txn.toUser?.userId === userId;
        const typeLabel = getTypeLabel(txn.transactionType);
        const direction = isOut ? 'out' : isIn ? 'in' : null;
        if (!direction) continue;

        const partyName = isIn ? (txn.fromUser?.userName ?? '') : (txn.toUser?.userName ?? '');
        const recipientUserId = isOut ? (txn.toUser?.userId ?? '') : undefined;

        const txnId = (txn as Transaction & { id: string }).id ?? '';

        if (txn.transactionType === TransactionType.SWAP) {
          // A's items: fromUser=out, toUser=in
          for (const item of txn.items ?? []) {
            flat.push({ kind: 'shipment', date, refId: txn.poNumber ?? txnId, transactionId: txnId, productName: item.productName ?? '', productId: item.productId ?? '', quantity: item.quantity, direction: direction as 'in' | 'out', type: 'SWAP', partyName, recipientUserId, amount: item.total ?? 0 });
          }
          // B's swapItems: toUser=out, fromUser=in
          const swapDir: 'in' | 'out' = direction === 'out' ? 'in' : 'out';
          for (const item of (txn as any).swapItems ?? []) {
            flat.push({ kind: 'order', date, refId: txn.poNumber ?? txnId, transactionId: txnId, productName: item.productName ?? '', productId: item.productId ?? '', quantity: item.quantity, direction: swapDir, type: 'SWAP', partyName, recipientUserId, amount: item.total ?? 0 });
          }
          continue;
        }

        for (const item of txn.items ?? []) {
          const amount = item.total ?? (item.unitPrice ?? 0) * (item.quantity ?? 0);
          // 產品轉換：源品為 out（扣減），目標品為 in（增加），淨效果為零
          let itemDirection = direction as 'in' | 'out';
          if (txn.transactionType === TransactionType.CONVERSION) {
            const sourceProductId = txn.conversionSource?.productId;
            itemDirection = (item.productId === sourceProductId) ? 'out' : 'in';
          }
          flat.push({
            kind: isOut ? 'shipment' : 'order',
            date,
            refId: txn.poNumber ?? txnId ?? '',
            transactionId: txnId,
            productName: item.productName ?? '',
            productId: item.productId ?? '',
            quantity: item.quantity,
            direction: itemDirection,
            type: typeLabel,
            partyName,
            recipientUserId,
            amount,
          });
        }
      }
      // 依日期升序，同日期訂貨先於發貨，確保庫存累計正確
      flat.sort((a, b) => {
        if (a.date !== b.date) return a.date - b.date;
        // 同日期：訂貨先，發貨後
        if (a.kind === 'order' && b.kind === 'shipment') return -1;
        if (a.kind === 'shipment' && b.kind === 'order') return 1;
        return 0;
      });

      // 跨商品合計：Temporary Placement SKU 訂貨與實際商品發貨屬同一庫存池
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

  async function handleReconcile() {
    setReconciling(true);
    setReconcileMsg(null);
    try {
      const changes = await InventoryReconcileService.reconcileFromTransactions(userId);
      if (changes.length === 0) {
        setReconcileMsg('✅ 庫存已是最新，無需調整');
      } else {
        const detail = changes.map((c) => `${c.productId}: ${c.oldQty} → ${c.newQty}`).join('、');
        setReconcileMsg(`✅ 已修復 ${changes.length} 個 SKU：${detail}`);
        load();
      }
    } catch (err) {
      setReconcileMsg(`❌ 錯誤：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setReconciling(false);
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTransactionId) return;
    setDeleting(true);
    try {
      const txn = await OrderService.getById(deleteTransactionId) as (Transaction & { id: string }) | null;
      if (txn) {
        const oldItems = txn.items ?? [];
        const oldFrom = txn.fromUser?.userId ?? '';
        const oldTo = txn.toUser?.userId ?? '';
        if (txn.transactionType === TransactionType.TRANSFER && oldFrom && oldTo) {
          await InventorySyncService.onTransferCompleted(oldTo, oldFrom, oldItems, `DELETE-${deleteTransactionId}`);
        } else if (txn.transactionType === TransactionType.ADJUSTMENT) {
          if (oldTo === userId && oldFrom !== userId) {
            const upstreamRestore = oldFrom && oldFrom !== 'TW' && oldFrom !== 'system' ? oldFrom : null;
            await InventorySyncService.onAdjustment(userId, upstreamRestore, oldItems, `DELETE-${deleteTransactionId}`);
          } else if (oldFrom === userId) {
            await InventorySyncService.onAdjustment(null, userId, oldItems, `DELETE-${deleteTransactionId}`);
          }
        } else if (txn.transactionType === TransactionType.CONVERSION && txn.conversionSource) {
          const sourceItem = oldItems.find((i) => i.productId === txn.conversionSource!.productId);
          const targetItems = oldItems.filter((i) => i.productId !== txn.conversionSource!.productId);
          if (sourceItem && targetItems.length > 0) {
            await InventorySyncService.onConversionReverted(oldFrom, sourceItem, targetItems, `DELETE-${deleteTransactionId}`);
          }
        }
      }
      await Promise.all([
        OrderService.delete(deleteTransactionId),
        ReceivableService.deleteByTransactionId(deleteTransactionId),
      ]);
      setDeleteTransactionId(null);
      load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : '刪除失敗');
      setDeleteTransactionId(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href="/hierarchy" className="text-txt-subtle hover:text-txt-primary text-sm mb-1 inline-block">
              ← Multi-tier distribution structure
            </Link>
            <h1 className="text-xl font-bold text-txt-primary tracking-tight">
              {user?.displayName ?? ''} 庫存表
            </h1>
            <p className="text-sm text-txt-subtle mt-0.5">經銷商訂貨、下線/自用發貨、庫存累計</p>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={handleReconcile}
              disabled={reconciling}
              className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-600 disabled:opacity-50 text-white text-xs font-medium rounded-lg"
            >
              {reconciling ? '計算中...' : '重新計算庫存'}
            </button>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-lg"
            >
              + 新增異動
            </button>
            <Link
              href={`/customers/${userId}`}
              className="px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white text-xs font-medium rounded-lg"
            >
              財務表
            </Link>
            <Link
              href={`/users/${userId}`}
              className="px-3 py-1.5 bg-surface-2 hover:bg-surface-3 border border-border text-txt-secondary text-xs font-medium rounded-lg"
            >
              編輯使用者
            </Link>
          </div>
        </div>

        {reconcileMsg && (
          <div className={`px-4 py-2 rounded-lg text-sm ${
            reconcileMsg.startsWith('✅')
              ? 'bg-green-100 border border-green-400 text-green-900'
              : 'bg-red-100 border border-red-400 text-red-900'
          }`}>
            {reconcileMsg}
          </div>
        )}

        {showAddModal && (
          <AddMovementModal
            userId={userId}
            userName={user?.displayName ?? ''}
            rows={rows}
            error={addError}
            onClose={() => { setShowAddModal(false); setAddError(''); }}
            onDone={() => { setShowAddModal(false); setAddError(''); load(); }}
            onError={setAddError}
          />
        )}
        {editTransactionId && (
          <EditMovementModal
            transactionId={editTransactionId}
            userId={userId}
            userName={user?.displayName ?? ''}
            rows={rows}
            error={addError}
            onClose={() => { setEditTransactionId(null); setAddError(''); }}
            onDone={() => { setEditTransactionId(null); setAddError(''); load(); }}
            onError={setAddError}
          />
        )}
        {deleteTransactionId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-sm bg-white dark:bg-surface-1 border-2 border-red-400 rounded-2xl shadow-2xl p-6 text-center">
              <div className="text-4xl mb-3">🗑️</div>
              <h3 className="text-lg font-bold text-red-600 mb-2">確認刪除</h3>
              <p className="text-sm text-txt-primary mb-4">此操作將永久刪除該筆異動記錄，並自動恢復相關庫存。此動作無法復原。</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTransactionId(null)}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 bg-surface-2 hover:bg-surface-3 border border-border text-txt-secondary font-medium rounded-lg text-base"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleDeleteConfirm}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold rounded-lg text-base"
                >
                  {deleting ? '刪除中...' : '確認刪除'}
                </button>
              </div>
            </div>
          </div>
        )}


        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3" />
            <p className="text-txt-subtle text-sm">載入庫存表...</p>
          </div>
        ) : (
          <div className="glass-panel overflow-x-auto">
            {(() => {
              const isCustomer = user?.role === UserRole.CUSTOMER;
              const colSpan = isCustomer ? 10 : 14;
              const thCls = 'px-2 py-2 text-xs font-semibold uppercase tracking-wide whitespace-nowrap';
              return (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-border bg-gray-900 text-white [&>th]:text-white">
                  <th className={`${thCls} text-left`}>上游</th>
                  <th className={`${thCls} text-left`}>經銷商</th>
                  <th className={`${thCls} text-left`}>下線/自用</th>
                  <th className={`${thCls} text-left`}>商品</th>
                  {isCustomer ? (
                    <>
                      <th className={`${thCls} text-left`}>發貨日期</th>
                      <th className={`${thCls} text-right`}>發貨數量</th>
                      <th className={`${thCls} text-left`}>發貨號碼</th>
                      <th className={`${thCls} text-right`}>經銷商價</th>
                    </>
                  ) : (
                    <>
                      <th className={`${thCls} text-left`}>訂貨日</th>
                      <th className={`${thCls} text-right`}>訂貨數</th>
                      <th className={`${thCls} text-left`}>訂貨號碼</th>
                      <th className={`${thCls} text-right`}>經銷商價</th>
                      <th className={`${thCls} text-left`}>發貨日</th>
                      <th className={`${thCls} text-right`}>發貨數</th>
                      <th className={`${thCls} text-left`}>發貨號碼</th>
                      <th className={`${thCls} text-right`}>發貨價銷</th>
                    </>
                  )}
                  <th className={`${thCls} text-right`}>庫存</th>
                  <th className={`${thCls} text-center w-20`}>操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className="px-4 py-12 text-center text-txt-subtle text-base">
                      尚無庫存異動紀錄
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => {
                    const stockistName = user?.displayName ?? '';
                    const isSelfUse = row.kind === 'shipment' && row.recipientUserId === userId;
                    const downlineDisplay = row.kind === 'shipment' ? (isSelfUse ? stockistName : row.partyName) : '';
                    const distributorDisplay = stockistName;
                    return (
                    <tr
                      key={`${row.date}-${row.refId}-${row.productId}-${row.direction}-${idx}`}
                      className={`hover:bg-surface-2/50 ${idx % 2 === 0 ? 'bg-white/5' : 'bg-emerald-50/10 dark:bg-emerald-950/10'}`}
                    >
                      <td className="px-1.5 py-1 text-txt-primary whitespace-nowrap text-xs">{isCustomer ? (user?.grandUpstreamDisplayName ?? '') : (user?.upstreamDisplayName ?? '')}</td>
                      <td className="px-1.5 py-1 text-txt-primary whitespace-nowrap text-xs">{isCustomer ? (user?.upstreamDisplayName ?? '') : distributorDisplay}</td>
                      <td className="px-1.5 py-1 text-txt-primary whitespace-nowrap text-xs">{isCustomer ? (user?.displayName ?? '') : downlineDisplay}</td>
                      <td className="px-1.5 py-1 text-txt-primary whitespace-nowrap text-xs">{row.productName}</td>
                      {isCustomer ? (
                        <>
                          <td className="px-1.5 py-1 text-txt-secondary tabular-nums whitespace-nowrap text-xs">
                            {row.kind === 'order' && row.date
                              ? new Date(row.date).toLocaleDateString('zh-TW', { year: '2-digit', month: '2-digit', day: '2-digit' })
                              : ''}
                          </td>
                          <td className="px-1.5 py-1 text-right tabular-nums font-medium text-xs">
                            {row.kind === 'order' ? row.quantity : ''}
                          </td>
                          <td className="px-1.5 py-1 font-mono text-xs text-txt-secondary">
                            {row.kind === 'order' ? row.refId : ''}
                          </td>
                          <td className="px-1.5 py-1 text-right tabular-nums text-txt-secondary text-xs">
                            {row.kind === 'order' && row.amount ? `RM ${row.amount}` : ''}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-1.5 py-1 text-txt-secondary tabular-nums whitespace-nowrap text-xs">
                            {row.kind === 'order' && row.date
                              ? new Date(row.date).toLocaleDateString('zh-TW', { year: '2-digit', month: '2-digit', day: '2-digit' })
                              : ''}
                          </td>
                          <td className="px-1.5 py-1 text-right tabular-nums font-medium text-xs">
                            {row.kind === 'order' ? row.quantity : ''}
                          </td>
                          <td className="px-1.5 py-1 font-mono text-xs text-txt-secondary">
                            {row.kind === 'order' ? row.refId : ''}
                          </td>
                          <td className="px-1.5 py-1 text-right tabular-nums text-txt-secondary text-xs">
                            {row.kind === 'order' && row.amount ? `RM ${row.amount}` : ''}
                          </td>
                          <td className="px-1.5 py-1 text-txt-secondary tabular-nums whitespace-nowrap text-xs">
                            {row.kind === 'shipment' && row.date
                              ? new Date(row.date).toLocaleDateString('zh-TW', { year: '2-digit', month: '2-digit', day: '2-digit' })
                              : ''}
                          </td>
                          <td className="px-1.5 py-1 text-right tabular-nums font-medium bg-emerald-50/20 dark:bg-emerald-950/20 text-xs">
                            {row.kind === 'shipment' ? row.quantity : ''}
                          </td>
                          <td className="px-1.5 py-1 font-mono text-xs text-txt-secondary">
                            {row.kind === 'shipment' ? row.refId : ''}
                          </td>
                          <td className="px-1.5 py-1 text-right tabular-nums text-txt-secondary text-xs">
                            {row.kind === 'shipment' && row.amount ? `RM ${row.amount}` : ''}
                          </td>
                        </>
                      )}
                      <td className="px-1.5 py-1 text-right tabular-nums">
                        <span className={`inline-block px-2 py-0.5 rounded font-bold text-sm tabular-nums ${
                          row.runningInventory === 0
                            ? 'bg-red-100 text-red-700'
                            : row.runningInventory <= 3
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {row.runningInventory}
                        </span>
                      </td>
                      <td className="px-1.5 py-1 text-center">
                        <div className="flex gap-1 justify-center">
                          <button
                            type="button"
                            onClick={() => setEditTransactionId(row.transactionId)}
                            className="px-1.5 py-0.5 text-xs font-medium bg-blue-700 hover:bg-blue-800 text-white rounded"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTransactionId(row.transactionId)}
                            className="px-1.5 py-0.5 text-xs font-medium bg-red-500 hover:bg-red-600 text-white rounded"
                          >
                            Del
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
              );
            })()}
          </div>
        )}

        {/* 現有庫存（直接從 Firestore inventory collection 讀取）*/}
        {!loading && (
          <div className="glass-panel overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-surface-base flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-txt-primary">現有庫存</h3>
              </div>
              <span className="text-xs text-txt-subtle">
                總計：{firestoreInv.reduce((s, r) => s + r.quantity, 0)} 盒
              </span>
            </div>
            {firestoreInv.length === 0 ? (
              <div className="px-4 py-8 text-center text-txt-subtle text-sm">尚無庫存紀錄</div>
            ) : (
              <table className="w-full text-base">
                <thead>
                  <tr className="border-b border-border bg-surface-base">
                    <th className="px-4 py-2.5 text-left text-sm font-semibold text-txt-subtle uppercase">產品</th>
                    <th className="px-4 py-2.5 text-right text-sm font-semibold text-txt-subtle uppercase">現有數量</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-muted">
                  {firestoreInv.map(r => (
                    <tr key={r.productId} className="hover:bg-surface-2/50">
                      <td className="px-4 py-3 text-txt-primary">
                        <span className="text-base font-medium">{r.productName}</span>
                        <span className="text-sm text-txt-subtle ml-1 font-mono">({r.productId})</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`inline-block px-3 py-1 rounded-full font-bold text-base tabular-nums ${
                          r.quantity === 0 ? 'bg-red-100 text-red-700' :
                          r.quantity <= 3 ? 'bg-amber-100 text-amber-700' :
                          'bg-emerald-100 text-emerald-800'
                        }`}>
                          {r.quantity}
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border bg-surface-2/40">
                    <td className="px-4 py-3 text-base font-bold text-txt-primary">總計</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-block px-3 py-1 rounded-full bg-emerald-600 text-white font-bold text-base tabular-nums">
                        {firestoreInv.reduce((s, r) => s + r.quantity, 0)}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* 自用彙總表 */}
        {!loading && rows.some(r => r.kind === 'shipment' && r.recipientUserId === userId && r.type !== 'conversion' && r.direction === 'out') && (() => {
          const selfUse: Record<string, { productName: string; quantity: number }> = {};
          for (const row of rows) {
            if (row.kind !== 'shipment' || row.recipientUserId !== userId || row.direction !== 'out') continue;
            if (row.type === 'conversion') continue; // 排除 TR 轉換品
            if (!selfUse[row.productId]) selfUse[row.productId] = { productName: row.productName, quantity: 0 };
            selfUse[row.productId].quantity += row.quantity;
          }
          const selfUseList = Object.entries(selfUse)
            .map(([productId, { productName, quantity }]) => ({ productId, productName, quantity }))
            .sort((a, b) => b.quantity - a.quantity);
          return (
            <div className="glass-panel overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-surface-base">
                <h3 className="text-lg font-semibold text-txt-primary">自用彙總</h3>
                <p className="text-sm text-txt-subtle mt-0.5">自用出庫的產品及累計數量</p>
              </div>
              <table className="w-full text-base">
                <thead>
                  <tr className="border-b border-border bg-surface-base">
                    <th className="px-4 py-2.5 text-left text-sm font-semibold text-txt-subtle uppercase">產品</th>
                    <th className="px-4 py-2.5 text-right text-sm font-semibold text-txt-subtle uppercase">自用數量</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-muted">
                  {selfUseList.map(r => (
                    <tr key={r.productId} className="hover:bg-surface-2/50">
                      <td className="px-4 py-3 text-txt-primary">
                        <span className="text-base font-medium">{r.productName}</span>
                        <span className="text-sm text-txt-subtle ml-1 font-mono">({r.productId})</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-block px-3 py-1 rounded-full bg-teal-100 text-teal-800 font-bold text-base tabular-nums">
                          {r.quantity}
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border bg-surface-2/40">
                    <td className="px-4 py-3 text-base font-bold text-txt-primary">總計</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-block px-3 py-1 rounded-full bg-teal-600 text-white font-bold text-base tabular-nums">
                        {selfUseList.reduce((s, r) => s + r.quantity, 0)}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })()}

        {/* 產品彙總（所有收貨） */}
        {!loading && rows.some(r => r.direction === 'in' && r.type !== 'conversion' && r.productId !== 'OPENING-STOCK') && (() => {
          const received: Record<string, { productName: string; quantity: number }> = {};
          for (const row of rows) {
            if (row.direction !== 'in' || row.type === 'conversion' || row.productId === 'OPENING-STOCK') continue;
            if (!received[row.productId]) received[row.productId] = { productName: row.productName, quantity: 0 };
            received[row.productId].quantity += row.quantity;
          }
          const receivedList = Object.entries(received)
            .map(([productId, { productName, quantity }]) => ({ productId, productName, quantity }))
            .sort((a, b) => b.quantity - a.quantity);
          return (
            <div className="glass-panel overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-surface-base">
                <h3 className="text-lg font-semibold text-txt-primary">產品彙總</h3>
                <p className="text-sm text-txt-subtle mt-0.5">收到的產品及累計數量</p>
              </div>
              <table className="w-full text-base">
                <thead>
                  <tr className="border-b border-border bg-surface-base">
                    <th className="px-4 py-2.5 text-left text-sm font-semibold text-txt-subtle uppercase">產品</th>
                    <th className="px-4 py-2.5 text-right text-sm font-semibold text-txt-subtle uppercase">數量</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-muted">
                  {receivedList.map(r => (
                    <tr key={r.productId} className="hover:bg-surface-2/50">
                      <td className="px-4 py-3 text-txt-primary">
                        <span className="text-base font-medium">{r.productName}</span>
                        <span className="text-sm text-txt-subtle ml-1 font-mono">({r.productId})</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-block px-3 py-1 rounded-full bg-teal-100 text-teal-800 font-bold text-base tabular-nums">
                          {r.quantity}
                        </span>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border bg-surface-2/40">
                    <td className="px-4 py-3 text-base font-bold text-txt-primary">總計</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-block px-3 py-1 rounded-full bg-teal-600 text-white font-bold text-base tabular-nums">
                        {receivedList.reduce((s, r) => s + r.quantity, 0)}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          );
        })()}

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
  return labels[type?.toLowerCase()] ?? type ?? '';
}

type ProductOption = { sku: string; name: string };
type DownlineOption = { id: string; displayName: string };
type UpstreamOption = { id: string; displayName: string };

function AddMovementModal({
  userId,
  userName,
  rows,
  error,
  onClose,
  onDone,
  onError,
}: {
  userId: string;
  userName: string;
  rows: StockLedgerRow[];
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
  const [alertMsg, setAlertMsg] = useState('');
  const [form, setForm] = useState({
    direction: 'in' as 'in' | 'out',
    // 入：經銷商訂貨
    upstreamId: '',
    upstreamName: '',
    orderDate: new Date().toISOString().slice(0, 10),
    orderRefId: '',   // 訂單號碼 PO-YYYYMMDD-NNN
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
        const [productList, children, currentUser, existingOrders] = await Promise.all([
          ProductService.getAll(undefined, 200),
          UserService.getChildren(userId),
          UserService.getById(userId),
          OrderService.getByToUser(userId, 300),
        ]);

        setProducts(productList.map((p) => ({ sku: p.sku, name: p.name })));
        setDownlines([
          { id: userId, displayName: '自用' },
          ...children.map((u) => ({ id: u.id ?? u.email ?? '', displayName: u.displayName ?? '' })),
        ]);

        // 上游：只顯示直屬上線（parentUserId），若無上線（頂層總經銷商）則固定顯示「台灣」
        let upstreamList: UpstreamOption[] = [];
        if (currentUser?.parentUserId) {
          const parent = await UserService.getById(currentUser.parentUserId);
          if (parent) {
            upstreamList = [{ id: parent.id ?? parent.email ?? '', displayName: parent.displayName ?? '' }];
          }
        }
        if (upstreamList.length === 0) {
          upstreamList = [{ id: 'TW', displayName: '台灣' }];
        }
        setUpstreams(upstreamList);

        // 自動產生訂單號碼 PO-YYYYMMDD-NNN
        const existingPONums = existingOrders.map((o) => o.poNumber ?? '').filter((n) => n.startsWith('PO-'));
        const newPONumber = generateDocumentNumber('PO', existingPONums);

        setForm((f) => ({
          ...f,
          productId: productList[0]?.sku ?? '',
          productName: productList[0]?.name ?? '',
          upstreamId: upstreamList[0]?.id ?? '',
          upstreamName: upstreamList[0]?.displayName ?? '',
          downlineId: userId,
          downlineName: '自用',
          orderRefId: newPONumber,
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

    if (form.direction === 'in' && !form.upstreamId) {
      onError('請選擇進貨來源（上游）');
      return;
    }

    // 出庫前驗證當前用戶庫存（從交易記錄計算，與庫存表顯示一致）
    if (form.direction === 'out') {
      const have = Math.max(0, rows
        .filter(r => r.productId === productId)
        .reduce((sum, r) => sum + (r.direction === 'in' ? r.quantity : -r.quantity), 0));
      if (have < quantity) {
        setAlertMsg(`⚠️ 庫存不足\n\n${productName} 需要 ${quantity} 個，但目前庫存只有 ${have} 個。\n\n請先補貨後再操作。`);
        return;
      }
    }

    // 入庫前驗證上游庫存（台灣視為無限供貨，跳過檢查）
    if (form.direction === 'in' && form.upstreamId !== 'TW') {
      const upstreamInv = await InventoryService.getByUserAndProduct(form.upstreamId, productId);
      const upstreamHave = upstreamInv?.quantityOnHand ?? 0;
      if (upstreamHave < quantity) {
        setAlertMsg(`⚠️ 上游貨源不足\n\n${form.upstreamName} 的 ${productName} 只有 ${upstreamHave} 個，無法提供 ${quantity} 個。\n\n請聯絡上游補貨後再操作。`);
        return;
      }
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
        const refId = form.orderRefId.trim() || `PO-${dateMs}`;

        const fromUser = { userId: form.upstreamId, userName: form.upstreamName };
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
          { createdAt: dateMs }
        );
        // 從上游扣減庫存（台灣不扣），並新增至當前用戶
        const upstreamForDeduction = form.upstreamId !== 'TW' ? form.upstreamId : null;
        await InventorySyncService.onAdjustment(upstreamForDeduction, userId, items, refId);
      } else {
        const dateMs = new Date(form.shipDate).getTime();
        const refId = form.refId.trim() || `SHIP-${dateMs}`;
        const fromUser = { userId, userName };
        const toUser = form.downlineId === userId
          ? { userId, userName: `${userName} (自用)` }
          : { userId: form.downlineId, userName: form.downlineName };

        if (form.downlineId === userId) {
          const txnResult = await OrderService.create(
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
            { createdAt: dateMs }
          );
          const txnId = (txnResult as { id: string }).id ?? refId;
          const arSelfUse = items[0].total > 0 && form.upstreamId && form.upstreamId !== 'TW'
            ? ReceivableService.create({
                deliveryNoteId: txnId, deliveryNoteNo: refId,
                salesOrderId: '', salesOrderNo: '',
                customerId: userId, customerName: userName,
                fromUserId: form.upstreamId,
                totalAmount: items[0].total, paidAmount: 0,
                remainingAmount: items[0].total, status: ReceivableStatus.OUTSTANDING,
              })
            : Promise.resolve();
          await Promise.all([InventorySyncService.onAdjustment(userId, null, items, refId), arSelfUse]);
        } else {
          const txnResult = await OrderService.create(
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
            { createdAt: dateMs }
          );
          const txnId = (txnResult as { id: string }).id ?? refId;
          const arTransfer = items[0].total > 0
            ? ReceivableService.create({
                deliveryNoteId: txnId, deliveryNoteNo: refId,
                salesOrderId: '', salesOrderNo: '',
                customerId: form.downlineId, customerName: form.downlineName,
                fromUserId: userId,
                totalAmount: items[0].total, paidAmount: 0,
                remainingAmount: items[0].total, status: ReceivableStatus.OUTSTANDING,
              })
            : Promise.resolve();
          await Promise.all([InventorySyncService.onTransferCompleted(userId, form.downlineId, items, refId), arTransfer]);
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
      {alertMsg && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <div className="w-full max-w-sm bg-white dark:bg-surface-1 border-2 border-red-400 rounded-2xl shadow-2xl p-6 text-center">
            <div className="text-4xl mb-3">🚫</div>
            <h3 className="text-lg font-bold text-red-600 mb-3">
              {alertMsg.includes('上游') ? '上游貨源不足' : '庫存不足'}
            </h3>
            <p className="text-sm text-txt-primary whitespace-pre-line leading-relaxed mb-5">
              {alertMsg.replace(/^⚠️ [^\n]+\n\n/, '')}
            </p>
            <button
              type="button"
              onClick={() => setAlertMsg('')}
              className="w-full px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg text-base"
            >
              確認
            </button>
          </div>
        </div>
      )}
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
                  <p className="text-sm font-medium text-txt-subtle mb-1">入貨人（經銷商）</p>
                  <p className="px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-base">
                    {userName}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-txt-subtle mb-1">進貨來源（上游）</label>
                  <select
                    value={form.upstreamId}
                    onChange={(e) => handleUpstreamChange(e.target.value)}
                    className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-base"
                  >
                    <option value="">請選擇</option>
                    {upstreams.map((u) => (
                      <option key={u.id} value={u.id}>{u.displayName}</option>
                    ))}
                  </select>
                  <p className="text-xs text-txt-subtle mt-1">僅顯示系統中該經銷商的直屬上線</p>
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
                  <label className="block text-sm font-medium text-txt-subtle mb-1">訂單號碼（PO）</label>
                  <input
                    type="text"
                    value={form.orderRefId}
                    onChange={(e) => setForm((f) => ({ ...f, orderRefId: e.target.value }))}
                    placeholder="PO-YYYYMMDD-001"
                    className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-base font-mono"
                  />
                  <p className="text-xs text-txt-subtle mt-1">系統自動生成，可手動修改</p>
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
                    <label className="block text-sm font-medium text-txt-subtle mb-1">經銷商價 (RM)</label>
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
                    <label className="block text-sm font-medium text-txt-subtle mb-1">發貨價銷 (RM)</label>
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

function EditMovementModal({
  transactionId,
  userId,
  userName,
  rows,
  error,
  onClose,
  onDone,
  onError,
}: {
  transactionId: string;
  userId: string;
  userName: string;
  rows: StockLedgerRow[];
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
  const [alertMsg, setAlertMsg] = useState('');
  const [form, setForm] = useState({
    direction: 'in' as 'in' | 'out',
    upstreamId: '',
    upstreamName: '',
    orderDate: '',
    orderQty: 1,
    orderPrice: 0,
    downlineId: '',
    downlineName: '',
    shipDate: '',
    productId: '',
    productName: '',
    shipQty: 1,
    refId: '',
    shipPrice: 0,
  });
  const [txnMeta, setTxnMeta] = useState<{
    type: string;
    fromUserId: string;
    toUserId: string;
    isSelfUse: boolean;
  } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [txn, productList, children, currentUser] = await Promise.all([
          OrderService.getById(transactionId),
          ProductService.getAll(undefined, 200),
          UserService.getChildren(userId),
          UserService.getById(userId),
        ]);
        if (!txn) {
          onError('找不到該筆交易');
          return;
        }
        const t = txn as Transaction & { id: string };
        const isIn = t.toUser?.userId === userId;
        const isOut = t.fromUser?.userId === userId;
        const item = t.items?.[0];
        if (!item) {
          onError('該筆交易無產品資料');
          return;
        }
        setProducts(productList.map((p) => ({ sku: p.sku, name: p.name })));
        setDownlines([
          { id: userId, displayName: '自用' },
          ...children.map((u) => ({ id: u.id ?? u.email ?? '', displayName: u.displayName ?? '' })),
        ]);

        // 上游：只顯示直屬上線（parentUserId），若無上線（頂層總經銷商）則固定顯示「台灣」
        let upstreamListEdit: UpstreamOption[] = [];
        if (currentUser?.parentUserId) {
          const parent = await UserService.getById(currentUser.parentUserId);
          if (parent) {
            upstreamListEdit = [{ id: parent.id ?? parent.email ?? '', displayName: parent.displayName ?? '' }];
          }
        }
        if (upstreamListEdit.length === 0) {
          upstreamListEdit = [{ id: 'TW', displayName: '台灣' }];
        }
        setUpstreams(upstreamListEdit);
        const dateStr = t.createdAt
          ? new Date(t.createdAt).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);
        const isSelfUse = isOut && t.toUser?.userId === userId;
        const fromId = t.fromUser?.userId;
        const fromName = t.fromUser?.userName ?? '';
        const upstreamIdForEdit = isIn && fromId && fromId !== 'system'
          ? fromId
          : upstreamListEdit[0]?.id ?? '';
        const upstreamNameForEdit = isIn && fromId && fromId !== 'system'
          ? fromName
          : upstreamListEdit[0]?.displayName ?? '';
        setTxnMeta({
          type: t.transactionType ?? '',
          fromUserId: t.fromUser?.userId ?? '',
          toUserId: t.toUser?.userId ?? '',
          isSelfUse,
        });
        setForm({
          direction: isIn ? 'in' : 'out',
          upstreamId: isIn ? upstreamIdForEdit : '',
          upstreamName: isIn ? upstreamNameForEdit : '',
          orderDate: dateStr,
          orderQty: item.quantity,
          orderPrice: item.unitPrice ?? 0,
          downlineId: isOut ? (t.toUser?.userId ?? userId) : userId,
          downlineName: isOut ? (t.toUser?.userName ?? '自用') : '自用',
          shipDate: dateStr,
          productId: item.productId ?? '',
          productName: item.productName ?? '',
          shipQty: item.quantity,
          refId: t.poNumber ?? t.id ?? '',
          shipPrice: item.unitPrice ?? 0,
        });
      } catch (e) {
        onError(e instanceof Error ? e.message : '載入失敗');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [transactionId, userId, onError]);

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

    if (form.direction === 'in' && !form.upstreamId) {
      onError('請選擇進貨來源（上游）');
      return;
    }

    if (!txnMeta) return;

    setSaving(true);
    try {
      const items: TransactionItem[] = [{
        productId,
        productName,
        quantity,
        unitPrice: form.direction === 'in' ? form.orderPrice : form.shipPrice,
        total: form.direction === 'in' ? form.orderPrice * form.orderQty : form.shipPrice * form.shipQty,
      }];

      const oldTxn = await OrderService.getById(transactionId) as Transaction & { id: string };
      const oldItems = oldTxn?.items ?? [];
      const oldFrom = oldTxn?.fromUser?.userId ?? '';
      const oldTo = oldTxn?.toUser?.userId ?? '';

      // 1. Revert old inventory first (must happen before validation so restored stock is visible)
      if (oldTxn?.transactionType === TransactionType.TRANSFER && oldFrom && oldTo) {
        await InventorySyncService.onTransferCompleted(oldTo, oldFrom, oldItems, `REVERT-${transactionId}`);
      } else if (oldTxn?.transactionType === TransactionType.ADJUSTMENT) {
        if (oldTo === userId && oldFrom !== userId) {
          // 入庫撤銷：從當前用戶扣減，歸還至上游（若上游非台灣）
          const oldUpstreamRestore = oldFrom && oldFrom !== 'TW' && oldFrom !== 'system' ? oldFrom : null;
          await InventorySyncService.onAdjustment(userId, oldUpstreamRestore, oldItems, `REVERT-${transactionId}`);
        } else if (oldFrom === userId) {
          await InventorySyncService.onAdjustment(null, userId, oldItems, `REVERT-${transactionId}`);
        }
      }

      // 2. Validate inventory AFTER revert（從交易記錄計算，調整已撤銷的舊筆）
      if (form.direction === 'out') {
        const rowsStock = rows
          .filter(r => r.productId === productId)
          .reduce((sum, r) => sum + (r.direction === 'in' ? r.quantity : -r.quantity), 0);
        // Adjust for the reverted old transaction: if old was 'out' from this user, it was restored (+qty); if old was 'in', it was deducted (-qty)
        const oldQtyForProduct = oldItems.reduce((sum, i) => i.productId === productId ? sum + i.quantity : sum, 0);
        const revertAdjustment = oldFrom === userId ? oldQtyForProduct : -oldQtyForProduct;
        const have = Math.max(0, rowsStock + revertAdjustment);
        if (have < quantity) {
          // Revert was already applied — undo it to restore previous state
          await InventorySyncService.onAdjustment(null, userId, oldItems, `REVERT-UNDO-${transactionId}`);
          setAlertMsg(`⚠️ 庫存不足\n\n${productName} 需要 ${quantity} 個，但目前庫存只有 ${have} 個。\n\n請先補貨後再操作。`);
          setSaving(false);
          return;
        }
      }
      if (form.direction === 'in' && form.upstreamId !== 'TW') {
        const upstreamInv = await InventoryService.getByUserAndProduct(form.upstreamId, productId);
        const upstreamHave = upstreamInv?.quantityOnHand ?? 0;
        if (upstreamHave < quantity) {
          await InventorySyncService.onAdjustment(userId, oldFrom && oldFrom !== 'TW' && oldFrom !== 'system' ? oldFrom : null, oldItems, `REVERT-UNDO-${transactionId}`);
          setAlertMsg(`⚠️ 上游貨源不足\n\n${form.upstreamName} 的 ${productName} 只有 ${upstreamHave} 個，無法提供 ${quantity} 個。\n\n請聯絡上游補貨後再操作。`);
          setSaving(false);
          return;
        }
      }

      // 3. Update transaction document
      const dateMs = form.direction === 'in'
        ? new Date(form.orderDate).getTime()
        : new Date(form.shipDate).getTime();
      const refId = form.direction === 'in' ? (form.refId.trim() || `PO-${dateMs}`) : (form.refId.trim() || `SHIP-${dateMs}`);
      const fromUser = form.direction === 'in'
        ? { userId: form.upstreamId, userName: form.upstreamName }
        : { userId, userName };
      const toUser = form.direction === 'in'
        ? { userId, userName }
        : (form.downlineId === userId ? { userId, userName: `${userName} (自用)` } : { userId: form.downlineId, userName: form.downlineName });

      await OrderService.updateTransaction(transactionId, {
        items,
        totals: { subtotal: items[0].total, grandTotal: items[0].total },
        poNumber: refId,
        fromUser,
        toUser,
        createdAt: dateMs,
        updatedAt: Date.now(),
      });

      // 4. Apply new inventory
      if (form.direction === 'in') {
        const upstreamForDeduction = form.upstreamId !== 'TW' ? form.upstreamId : null;
        await InventorySyncService.onAdjustment(upstreamForDeduction, userId, items, transactionId);
      } else if (form.downlineId === userId) {
        await InventorySyncService.onAdjustment(userId, null, items, transactionId);
      } else {
        await InventorySyncService.onTransferCompleted(userId, form.downlineId, items, transactionId);
      }

      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : '修改失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      {alertMsg && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <div className="w-full max-w-sm bg-white dark:bg-surface-1 border-2 border-red-400 rounded-2xl shadow-2xl p-6 text-center">
            <div className="text-4xl mb-3">🚫</div>
            <h3 className="text-lg font-bold text-red-600 mb-3">
              {alertMsg.includes('上游') ? '上游貨源不足' : '庫存不足'}
            </h3>
            <p className="text-sm text-txt-primary whitespace-pre-line leading-relaxed mb-5">
              {alertMsg.replace(/^⚠️ [^\n]+\n\n/, '')}
            </p>
            <button
              type="button"
              onClick={() => setAlertMsg('')}
              className="w-full px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg text-base"
            >
              確認
            </button>
          </div>
        </div>
      )}
      <div
        className="w-full max-w-lg bg-surface-1 border border-border rounded-xl p-6 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-txt-primary mb-4">修改庫存異動</h2>
        {error && (
          <div className="mb-4 px-4 py-2 bg-error/10 border border-error/30 text-error text-sm rounded-lg">
            {error}
          </div>
        )}
        {loading ? (
          <p className="text-txt-subtle text-base">載入中...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {form.direction === 'in' ? (
              <>
                <div>
                  <p className="text-sm font-medium text-txt-subtle mb-1">入貨人（經銷商）</p>
                  <p className="px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-base">
                    {userName}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-txt-subtle mb-1">進貨來源（上游）</label>
                  <select
                    value={form.upstreamId}
                    onChange={(e) => handleUpstreamChange(e.target.value)}
                    className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-base"
                  >
                    <option value="">請選擇</option>
                    {upstreams.map((u) => (
                      <option key={u.id} value={u.id}>{u.displayName}</option>
                    ))}
                  </select>
                  <p className="text-xs text-txt-subtle mt-1">僅顯示系統中該經銷商的直屬上線</p>
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
                  <label className="block text-sm font-medium text-txt-subtle mb-1">訂單號碼（PO）</label>
                  <input
                    type="text"
                    value={form.refId}
                    onChange={(e) => setForm((f) => ({ ...f, refId: e.target.value }))}
                    placeholder="PO-YYYYMMDD-001"
                    className="w-full px-3 py-2.5 bg-surface-2 border border-border rounded-lg text-txt-primary text-base font-mono"
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
                    <label className="block text-sm font-medium text-txt-subtle mb-1">經銷商價 (RM)</label>
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
                    <label className="block text-sm font-medium text-txt-subtle mb-1">發貨價銷 (RM)</label>
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
