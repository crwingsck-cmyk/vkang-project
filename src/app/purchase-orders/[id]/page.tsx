'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PurchaseOrderService } from '@/services/database/purchaseOrders';
import { UserService } from '@/services/database/users';
import { PurchaseOrder, PurchaseOrderStatus, UserRole } from '@/types/models';
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
  const router = useRouter();
  useAuth();
  const poId = (params?.id ?? '') as string;
  const [po, setPo] = useState<(PurchaseOrder & { id: string }) | null>(null);
  const [receiverName, setReceiverName] = useState('');
  const [fromName, setFromName] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actioning, setActioning] = useState(false);

  useEffect(() => {
    if (poId) load();
  }, [poId]);

  async function load() {
    if (!poId) return;
    setLoading(true);
    setError('');
    try {
      const data = await PurchaseOrderService.getById(poId);
      setPo(data);
      if (data?.userId) {
        const u = await UserService.getById(data.userId);
        setReceiverName(u?.displayName ?? data.userId);
      }
      if (data?.fromUserId) {
        const u = await UserService.getById(data.fromUserId);
        setFromName(u?.displayName ?? '總經銷商');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '載入失敗');
    } finally {
      setLoading(false);
    }
  }

  async function handleReceive() {
    if (!po) return;
    setActioning(true);
    setError('');
    try {
      await PurchaseOrderService.receive(poId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '收貨失敗');
    } finally {
      setActioning(false);
    }
  }

  async function handleCancel() {
    if (!po || !confirm('確定要取消此進貨單？')) return;
    setActioning(true);
    setError('');
    try {
      await PurchaseOrderService.cancel(poId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '取消失敗');
    } finally {
      setActioning(false);
    }
  }

  async function handleDelete() {
    if (!po || !confirm('確定要刪除此進貨單？此操作無法復原。')) return;
    setActioning(true);
    setError('');
    try {
      await PurchaseOrderService.delete(poId);
      router.push('/purchase-orders');
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗');
    } finally {
      setActioning(false);
    }
  }

  const canEdit = po && po.status !== PurchaseOrderStatus.RECEIVED && po.status !== PurchaseOrderStatus.CANCELLED;
  const canReceive = po && po.status !== PurchaseOrderStatus.RECEIVED && po.status !== PurchaseOrderStatus.CANCELLED;

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <Link href="/purchase-orders" className="text-gray-400 hover:text-gray-200 text-sm">
            &larr; 返回進貨單
          </Link>
          <h1 className="text-2xl font-bold text-gray-100 mt-2">進貨單詳情</h1>
        </div>

        {error && <div className="msg-error px-4 py-3 rounded-lg text-sm">{error}</div>}

        {loading ? (
          <div className="py-12 text-center text-gray-400">載入中...</div>
        ) : !po ? (
          <div className="msg-error px-4 py-3 rounded-lg">進貨單不存在</div>
        ) : (
          <>
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-lg text-gray-100">{po.poNumber}</span>
                <span className={`inline-flex px-2 py-1 rounded text-xs font-medium ${
                  po.status === PurchaseOrderStatus.RECEIVED ? 'bg-green-800/50 text-green-200' :
                  po.status === PurchaseOrderStatus.CANCELLED ? 'bg-red-900/30 text-red-300' :
                  'bg-amber-800/50 text-amber-200'
                }`}>
                  {statusLabels[po.status]}
                </span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-400 text-xs">收貨人</p>
                  <p className="text-gray-100">{receiverName}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">供應商/來源</p>
                  <p className="text-gray-100">{po.fromUserId ? fromName : po.supplierName ?? '外部供應商'}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">總金額</p>
                  <p className="text-gray-100 font-semibold">USD {po.totals?.grandTotal?.toFixed(2) ?? '0.00'}</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">建立日期</p>
                  <p className="text-gray-100">{po.createdAt ? new Date(po.createdAt).toLocaleString('zh-TW') : '—'}</p>
                </div>
              </div>
              {po.receivedAt && (
                <p className="text-gray-400 text-xs mt-2">收貨時間：{new Date(po.receivedAt).toLocaleString('zh-TW')}</p>
              )}
            </div>

            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <h2 className="px-6 py-3 text-sm font-semibold text-gray-200 border-b border-gray-700">商品明細</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-700/50">
                    <th className="px-6 py-2 text-left text-xs text-gray-400">產品</th>
                    <th className="px-6 py-2 text-right text-xs text-gray-400">數量</th>
                    <th className="px-6 py-2 text-right text-xs text-gray-400">單位成本</th>
                    <th className="px-6 py-2 text-right text-xs text-gray-400">小計</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {po.items?.map((item, i) => (
                    <tr key={i}>
                      <td className="px-6 py-2 text-gray-200">{item.productName} ({item.productId})</td>
                      <td className="px-6 py-2 text-right tabular-nums">{item.quantity}</td>
                      <td className="px-6 py-2 text-right tabular-nums">USD {item.unitCost.toFixed(2)}</td>
                      <td className="px-6 py-2 text-right tabular-nums font-medium">USD {item.total.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              {canReceive && (
                <button
                  onClick={handleReceive}
                  disabled={actioning}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
                >
                  {actioning ? '處理中...' : '確認收貨'}
                </button>
              )}
              {canEdit && (
                <>
                  <button
                    onClick={handleCancel}
                    disabled={actioning}
                    className="px-4 py-2 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white text-sm rounded-lg"
                  >
                    取消進貨單
                  </button>
                  {(po.status === PurchaseOrderStatus.DRAFT || po.status === PurchaseOrderStatus.CANCELLED) && (
                    <button
                      onClick={handleDelete}
                      disabled={actioning}
                      className="px-4 py-2 bg-red-900/50 hover:bg-red-900 disabled:opacity-50 text-red-300 text-sm rounded-lg"
                    >
                      刪除
                    </button>
                  )}
                </>
              )}
              <Link href="/purchase-orders" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg">
                返回
              </Link>
            </div>
          </>
        )}
      </div>
    </ProtectedRoute>
  );
}
