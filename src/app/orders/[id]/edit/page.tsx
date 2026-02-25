'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { OrderService } from '@/services/database/orders';
import { ProductService } from '@/services/database/products';
import { InventorySyncService } from '@/services/database/inventorySync';
import { Transaction, UserRole, TransactionStatus, TransactionType, PaymentMethod, PaymentStatus } from '@/types/models';
import Link from 'next/link';

export default function EditOrderPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = (params?.id ?? '') as string;
  const { user, role } = useAuth();

  const [order, setOrder] = useState<Transaction | null>(null);
  const [products, setProducts] = useState<{ sku: string; name: string; unitPrice: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [poNumber, setPoNumber] = useState('');
  const [status, setStatus] = useState<TransactionStatus>(TransactionStatus.PENDING);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [items, setItems] = useState<{ productId: string; productName: string; quantity: number; unitPrice: number }[]>([]);

  useEffect(() => {
    load();
  }, [orderId, user?.id, role]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [data, prods] = await Promise.all([
        OrderService.getById(orderId),
        ProductService.getAll(undefined, 200),
      ]);
      if (!data) {
        setError('訂單不存在');
        setLoading(false);
        return;
      }
      const currentUserId = user?.id;
      if (role === UserRole.CUSTOMER && data.toUser?.userId !== currentUserId) {
        setError('您沒有權限編輯此訂單');
        setLoading(false);
        return;
      }
      if (role === UserRole.STOCKIST && data.fromUser?.userId !== currentUserId) {
        setError('您沒有權限編輯此訂單');
        setLoading(false);
        return;
      }
      if (data.status !== TransactionStatus.PENDING) {
        setError('僅待處理訂單可編輯');
        setLoading(false);
        return;
      }
      if (data.transactionType !== TransactionType.SALE) {
        setError('僅銷售訂單可編輯');
        setLoading(false);
        return;
      }
      setOrder(data);
      setPoNumber(data.poNumber ?? data.id ?? '');
      setStatus(data.status);
      setPaymentMethod((data.paymentDetails?.method as PaymentMethod) ?? PaymentMethod.CASH);
      setItems(
        (data.items ?? []).map((i) => ({
          productId: i.productId,
          productName: i.productName,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        }))
      );
      setProducts(prods.map((p) => ({ sku: p.sku, name: p.name, unitPrice: p.unitPrice })));
    } catch {
      setError('載入失敗');
    } finally {
      setLoading(false);
    }
  }

  function updateItem(index: number, field: string, value: string | number) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        if (field === 'productId') {
          const product = products.find((p) => p.sku === value);
          return {
            ...item,
            productId: product?.sku ?? '',
            productName: product?.name ?? '',
            unitPrice: product?.unitPrice ?? 0,
          };
        }
        return { ...item, [field]: value };
      })
    );
  }

  function addItem() {
    setItems((prev) => [...prev, { productId: '', productName: '', quantity: 1, unitPrice: 0 }]);
  }

  function removeItem(index: number) {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (items.some((i) => !i.productId)) {
      setError('請為每筆明細選擇產品');
      return;
    }
    if (items.some((i) => i.quantity <= 0)) {
      setError('數量必須大於 0');
      return;
    }

    setSaving(true);
    try {
      const txItems = items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        total: i.quantity * i.unitPrice,
      }));

      await OrderService.updateOrder(orderId, {
        poNumber: poNumber.trim() || undefined,
        items: txItems,
        paymentDetails: {
          ...order?.paymentDetails,
          method: paymentMethod,
          status: order?.paymentDetails?.status ?? PaymentStatus.PENDING,
          amount: subtotal,
        },
      });
      if (status === TransactionStatus.CANCELLED) {
        await OrderService.cancel(orderId);
      } else if (status === TransactionStatus.COMPLETED && order?.fromUser?.userId) {
        await InventorySyncService.onSaleCompleted(order.fromUser.userId, order.toUser?.userId, txItems, orderId);
        await OrderService.updateStatus(orderId, TransactionStatus.COMPLETED);
      }
      router.push(`/orders/${orderId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST, UserRole.CUSTOMER]}>
        <div className="max-w-3xl mx-auto py-16 text-center text-gray-400">載入中...</div>
      </ProtectedRoute>
    );
  }

  if (error && !order) {
    return (
      <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST, UserRole.CUSTOMER]}>
        <div className="max-w-3xl mx-auto space-y-4">
          <Link href="/orders" className="text-gray-400 hover:text-gray-200 text-sm">
            &larr; 返回訂單
          </Link>
          <div className="msg-error px-4 py-3 rounded-lg">{error}</div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST, UserRole.CUSTOMER]}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex gap-4">
          <Link href={`/orders/${orderId}`} className="text-gray-400 hover:text-gray-200 text-sm">
            &larr; 返回訂單詳情
          </Link>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-100">編輯訂單</h1>
          <p className="text-gray-400 mt-1">修改發貨號碼、產品數量、取件狀態、付款方式</p>
        </div>

        {error && <div className="msg-error px-4 py-3 rounded-lg">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-200">訂單資訊</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">發貨號碼</label>
                <input
                  type="text"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="留空則顯示系統 ID"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">取件狀態</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TransactionStatus)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
                >
                  <option value={TransactionStatus.PENDING}>待處理 (Pending)</option>
                  <option value={TransactionStatus.COMPLETED}>已完成 (Completed)</option>
                  <option value={TransactionStatus.CANCELLED}>已取消 (Cancelled)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">付款方式</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
                >
                  <option value={PaymentMethod.CASH}>Cash</option>
                  <option value={PaymentMethod.BANK}>Bank Transfer</option>
                  <option value={PaymentMethod.CARD}>Card</option>
                  <option value={PaymentMethod.CREDIT}>Credit</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-200">產品明細</h2>
              <button
                type="button"
                onClick={addItem}
                className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg"
              >
                + 新增品項
              </button>
            </div>
            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    <label className="block text-xs text-gray-400 mb-1">產品</label>
                    <select
                      value={item.productId}
                      onChange={(e) => updateItem(index, 'productId', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm"
                    >
                      <option value="">請選擇...</option>
                      {products.map((p) => (
                        <option key={p.sku} value={p.sku}>
                          {p.name} (USD {p.unitPrice})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-400 mb-1">數量</label>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-400 mb-1">單價</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-400 mb-1">小計</label>
                    <div className="px-3 py-2 bg-gray-750 rounded-lg text-gray-300 text-sm">
                      USD {(item.quantity * item.unitPrice).toFixed(2)}
                    </div>
                  </div>
                  <div className="col-span-1">
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="w-full px-2 py-2 bg-red-900/30 hover:bg-red-900/60 text-red-400 rounded-lg text-sm"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-700 pt-4 text-right">
              <p className="text-gray-400 text-sm">總計</p>
              <p className="text-2xl font-bold text-gray-100">USD {subtotal.toFixed(2)}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium"
            >
              {saving ? '儲存中...' : '儲存'}
            </button>
            <Link
              href={`/orders/${orderId}`}
              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg font-medium"
            >
              取消
            </Link>
          </div>
        </form>
      </div>
    </ProtectedRoute>
  );
}
