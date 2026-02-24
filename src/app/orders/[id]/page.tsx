'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { OrderService } from '@/services/database/orders';
import { Transaction, UserRole, TransactionStatus, TransactionType } from '@/types/models';
import { InventorySyncService } from '@/services/database/inventorySync';
import { useToast } from '@/context/ToastContext';
import Link from 'next/link';

const statusColors: Record<TransactionStatus, string> = {
  [TransactionStatus.PENDING]: 'bg-yellow-900/30 text-yellow-300',
  [TransactionStatus.COMPLETED]: 'bg-green-900/30 text-green-300',
  [TransactionStatus.CANCELLED]: 'bg-red-900/30 text-red-300',
};

export default function OrderDetailPage() {
  const params = useParams();
  const { role } = useAuth();
  const toast = useToast();
  const orderId = (params?.id ?? '') as string;

  const [order, setOrder] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    loadOrder();
  }, [orderId]);

  async function loadOrder() {
    setLoading(true);
    try {
      const data = await OrderService.getById(orderId);
      if (!data) { setError('Order not found.'); return; }
      setOrder(data);
    } catch {
      setError('Failed to load order.');
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusUpdate(status: TransactionStatus) {
    const ok = await toast.confirm(`Update order status to "${status}"?`);
    if (!ok) return;
    setUpdating(true);
    setError('');
    try {
      // 先驗證並扣庫存，再更新訂單狀態（避免無庫存時仍標記為完成）
      if (
        status === TransactionStatus.COMPLETED &&
        order?.transactionType === TransactionType.SALE &&
        order.fromUser?.userId
      ) {
        await InventorySyncService.onSaleCompleted(order.fromUser.userId, order.items, orderId);
      }
      await OrderService.updateStatus(orderId, status);
      toast.success(`Order status updated to ${status}.`);
      setSuccessMsg(`Order status updated to ${status}.`);
      await loadOrder();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update status.';
      setError(msg);
      toast.error(msg);
    } finally {
      setUpdating(false);
    }
  }

  async function handleRevertToPending() {
    const ok = await toast.confirm(
      '將訂單改回「待處理」？賣方庫存會恢復。若此訂單當初完成時未扣庫存（系統 Bug），請於改回後手動調整庫存。'
    );
    if (!ok) return;
    setUpdating(true);
    setError('');
    try {
      if (
        order?.transactionType === TransactionType.SALE &&
        order.fromUser?.userId
      ) {
        await InventorySyncService.onSaleReverted(order.fromUser.userId, order.items, orderId);
      }
      await OrderService.updateStatus(orderId, TransactionStatus.PENDING);
      toast.success('訂單已改回待處理。');
      setSuccessMsg('訂單已改回待處理。');
      await loadOrder();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to revert.';
      setError(msg);
      toast.error(msg);
    } finally {
      setUpdating(false);
    }
  }

  async function handleCancel() {
    const ok = await toast.confirm('Cancel this order? This cannot be undone.');
    if (!ok) return;
    setUpdating(true);
    try {
      await OrderService.cancel(orderId);
      toast.success('Order cancelled.');
      setSuccessMsg('Order cancelled.');
      await loadOrder();
    } catch {
      setError('Failed to cancel order.');
      toast.error('Failed to cancel order.');
    } finally {
      setUpdating(false);
    }
  }

  const isAdmin = role === UserRole.ADMIN;

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST, UserRole.CUSTOMER]}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/orders" className="text-gray-400 hover:text-gray-200 text-sm">
            &larr; Back to Orders
          </Link>
        </div>

        {loading ? (
          <div className="text-gray-400">Loading...</div>
        ) : error && !order ? (
          <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg">{error}</div>
        ) : order ? (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-100 font-mono">{order.id}</h1>
                <p className="text-gray-400 mt-1">
                  {order.createdAt ? new Date(order.createdAt).toLocaleString() : '-'}
                </p>
                <div className="mt-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[order.status]}`}>
                    {order.status}
                  </span>
                </div>
              </div>

              {isAdmin && order.status === TransactionStatus.PENDING && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleStatusUpdate(TransactionStatus.COMPLETED)}
                    disabled={updating}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-sm"
                  >
                    Complete
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={updating}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                </div>
              )}
              {isAdmin && order.status === TransactionStatus.COMPLETED && order.transactionType === TransactionType.SALE && (
                <button
                  onClick={handleRevertToPending}
                  disabled={updating}
                  className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white rounded-lg text-sm"
                >
                  改回待處理
                </button>
              )}
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg">{error}</div>
            )}
            {successMsg && (
              <div className="bg-green-900/30 border border-green-700 text-green-300 px-4 py-3 rounded-lg">{successMsg}</div>
            )}

            {/* Parties */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-gray-200 mb-4">Parties</h2>
              <div className="grid grid-cols-2 gap-6 text-sm">
                <div>
                  <p className="text-gray-400 mb-1">From (Seller)</p>
                  <p className="text-gray-100 font-medium">{order.fromUser?.userName || '-'}</p>
                  {order.fromUser?.warehouse && (
                    <p className="text-gray-500">{order.fromUser.warehouse}</p>
                  )}
                </div>
                <div>
                  <p className="text-gray-400 mb-1">To (Customer)</p>
                  <p className="text-gray-100 font-medium">{order.toUser?.userName || '-'}</p>
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-700">
                <h2 className="text-lg font-semibold text-gray-200">Items</h2>
              </div>
              <table className="w-full">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-200">Product</th>
                    <th className="px-6 py-3 text-right text-sm font-medium text-gray-200">Qty</th>
                    <th className="px-6 py-3 text-right text-sm font-medium text-gray-200">Unit Price</th>
                    <th className="px-6 py-3 text-right text-sm font-medium text-gray-200">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {order.items.map((item, i) => (
                    <tr key={i}>
                      <td className="px-6 py-3 text-sm text-gray-100">{item.productName}</td>
                      <td className="px-6 py-3 text-sm text-gray-300 text-right">{item.quantity}</td>
                      <td className="px-6 py-3 text-sm text-gray-300 text-right">
                        USD {item.unitPrice.toFixed(2)}
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-300 text-right">
                        USD {item.total.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-gray-600">
                  <tr>
                    <td colSpan={3} className="px-6 py-3 text-sm font-semibold text-gray-300 text-right">
                      Grand Total
                    </td>
                    <td className="px-6 py-3 text-sm font-bold text-gray-100 text-right">
                      USD {order.totals.grandTotal.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Payment & Shipping */}
            <div className="grid grid-cols-2 gap-4">
              {order.paymentDetails && (
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-sm">
                  <h3 className="text-gray-300 font-semibold mb-2">Payment</h3>
                  <p className="text-gray-400">Method: <span className="text-gray-200">{order.paymentDetails.method}</span></p>
                  <p className="text-gray-400">Status: <span className="text-gray-200">{order.paymentDetails.status}</span></p>
                  <p className="text-gray-400">Amount: <span className="text-gray-200">USD {order.paymentDetails.amount.toFixed(2)}</span></p>
                </div>
              )}
              {order.shippingDetails && (
                <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-sm">
                  <h3 className="text-gray-300 font-semibold mb-2">Shipping</h3>
                  <p className="text-gray-400">Status: <span className="text-gray-200">{order.shippingDetails.status}</span></p>
                  {order.shippingDetails.trackingNumber && (
                    <p className="text-gray-400">Tracking: <span className="text-gray-200">{order.shippingDetails.trackingNumber}</span></p>
                  )}
                  {order.shippingDetails.carrier && (
                    <p className="text-gray-400">Carrier: <span className="text-gray-200">{order.shippingDetails.carrier}</span></p>
                  )}
                </div>
              )}
            </div>

            {order.description && (
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 text-sm">
                <p className="text-gray-400 mb-1">Notes</p>
                <p className="text-gray-300">{order.description}</p>
              </div>
            )}
          </>
        ) : null}
      </div>
    </ProtectedRoute>
  );
}
