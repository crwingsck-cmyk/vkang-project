'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PurchaseOrderService } from '@/services/database/purchaseOrders';
import { UserService } from '@/services/database/users';
import {
  PurchaseOrder,
  UserRole,
  PurchaseOrderStatus,
  User,
} from '@/types/models';
import Link from 'next/link';

const statusLabels: Record<PurchaseOrderStatus, string> = {
  [PurchaseOrderStatus.DRAFT]: '草稿',
  [PurchaseOrderStatus.SUBMITTED]: '已提交',
  [PurchaseOrderStatus.PARTIAL]: '部分收貨',
  [PurchaseOrderStatus.RECEIVED]: '已收貨',
  [PurchaseOrderStatus.CANCELLED]: '已取消',
};

export default function PurchaseOrderDetailPage() {
  const params = useParams();
  const { user, role } = useAuth();
  const poId = (params?.id ?? '') as string;

  const [po, setPo] = useState<(PurchaseOrder & { id: string }) | null>(null);
  const [receiver, setReceiver] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [receiving, setReceiving] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    load();
  }, [poId]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await PurchaseOrderService.getById(poId);
      setPo(data || null);
      if (data?.userId) {
        const u = await UserService.getById(data.userId);
        setReceiver(u || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }

  async function handleReceive() {
    if (!confirm('確認收貨？將更新庫存並計算加權平均成本。')) return;
    setReceiving(true);
    setError('');
    setSuccessMsg('');
    try {
      await PurchaseOrderService.receive(poId);
      setSuccessMsg('已收貨，庫存已更新');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '收貨失敗');
    } finally {
      setReceiving(false);
    }
  }

  async function handleRevertReceived() {
    if (!confirm('確定要改回未收貨？將撤銷庫存變更，此進貨單會恢復為「已提交」狀態。')) return;
    setReverting(true);
    setError('');
    setSuccessMsg('');
    try {
      await PurchaseOrderService.revertReceived(poId);
      setSuccessMsg('已改回未收貨，庫存已恢復');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '改回失敗');
    } finally {
      setReverting(false);
    }
  }

  async function handleCancel() {
    if (!confirm('確定要取消此進貨單？')) return;
    setCancelling(true);
    setError('');
    try {
      await PurchaseOrderService.cancel(poId);
      setSuccessMsg('已取消');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消失敗');
    } finally {
      setCancelling(false);
    }
  }

  const canReceive =
    po?.status === PurchaseOrderStatus.DRAFT ||
    po?.status === PurchaseOrderStatus.SUBMITTED;
  const canRevertReceived = po?.status === PurchaseOrderStatus.RECEIVED;
  const canCancel =
    po?.status === PurchaseOrderStatus.DRAFT ||
    po?.status === PurchaseOrderStatus.SUBMITTED;
  const isOwner = user?.id === po?.userId;
  const isAdmin = role === UserRole.ADMIN;

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/purchase-orders"
            className="text-gray-400 hover:text-gray-200 text-sm"
          >
            &larr; 返回進貨單
          </Link>
        </div>

        {loading ? (
          <div className="text-gray-400">載入中...</div>
        ) : !po ? (
          <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
            進貨單不存在
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-100">
                  {po.poNumber}
                </h1>
                <p className="text-gray-400 mt-1">
                  狀態: {statusLabels[po.status]}
                  {receiver && ` · 收貨人: ${receiver.displayName}`}
                </p>
              </div>
              {(isOwner || isAdmin) && (
                <div className="flex gap-2">
                  {canReceive && (
                    <button
                      onClick={handleReceive}
                      disabled={receiving}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm"
                    >
                      {receiving ? '處理中...' : '確認收貨'}
                    </button>
                  )}
                  {canRevertReceived && (
                    <button
                      onClick={handleRevertReceived}
                      disabled={reverting}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-sm"
                    >
                      {reverting ? '處理中...' : '改回未收貨'}
                    </button>
                  )}
                  {canCancel && (
                    <button
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm"
                    >
                      {cancelling ? '處理中...' : '取消'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}
            {successMsg && (
              <div className="bg-green-900/30 border border-green-700 text-green-300 px-4 py-3 rounded-lg">
                {successMsg}
              </div>
            )}

            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                {po.fromUserId && (
                  <div>
                    <p className="text-gray-400">進貨來源</p>
                    <p className="text-gray-100 font-medium">上線（內部調撥）</p>
                  </div>
                )}
                <div>
                  <p className="text-gray-400">成本計算</p>
                  <p className="text-gray-100 font-medium">
                    {po.useFifo ? 'FIFO（先進先出）' : '加權平均'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">供應商</p>
                  <p className="text-gray-100 font-medium">
                    {po.supplierName || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">收貨人</p>
                  <p className="text-gray-100 font-medium">
                    {receiver?.displayName || po.userId}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">建立時間</p>
                  <p className="text-gray-100 font-medium">
                    {po.createdAt
                      ? new Date(po.createdAt).toLocaleString('zh-TW')
                      : '—'}
                  </p>
                </div>
                {po.receivedAt && (
                  <div>
                    <p className="text-gray-400">收貨時間</p>
                    <p className="text-gray-100 font-medium">
                      {new Date(po.receivedAt).toLocaleString('zh-TW')}
                    </p>
                  </div>
                )}
              </div>

              {po.notes && (
                <div>
                  <p className="text-gray-400 text-sm">備註</p>
                  <p className="text-gray-300 mt-1">{po.notes}</p>
                </div>
              )}

              <div>
                <h2 className="text-lg font-semibold text-gray-200 mb-3">
                  進貨明細
                </h2>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-600">
                      <th className="text-left py-2 text-gray-400 font-medium">
                        產品
                      </th>
                      <th className="text-right py-2 text-gray-400 font-medium">
                        數量
                      </th>
                      <th className="text-right py-2 text-gray-400 font-medium">
                        單位成本
                      </th>
                      <th className="text-right py-2 text-gray-400 font-medium">
                        小計
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {po.items.map((item, i) => (
                      <tr key={i} className="border-b border-gray-700">
                        <td className="py-3 text-gray-100">
                          {item.productName} ({item.productId})
                        </td>
                        <td className="py-3 text-right tabular-nums text-gray-100">
                          {item.quantity}
                        </td>
                        <td className="py-3 text-right tabular-nums text-gray-100">
                          USD {item.unitCost.toFixed(2)}
                        </td>
                        <td className="py-3 text-right tabular-nums text-gray-100 font-medium">
                          USD {item.total.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-4 pt-4 border-t border-gray-700 flex justify-end">
                  <span className="text-xl font-bold text-gray-100">
                    總計: USD {po.totals.grandTotal.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
