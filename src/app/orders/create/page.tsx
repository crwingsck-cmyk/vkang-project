'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { OrderService } from '@/services/database/orders';
import { ProductService } from '@/services/database/products';
import { UserService } from '@/services/database/users';
import { InventorySyncService } from '@/services/database/inventorySync';
import { Product, User, UserRole, PaymentMethod, TransactionItem, TransactionStatus } from '@/types/models';
import Link from 'next/link';

type OrderItem = { productId: string; productName: string; quantity: number; unitPrice: number };

function toTxItem(item: OrderItem): TransactionItem {
  return {
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: item.quantity * item.unitPrice,
  };
}

export default function CreateOrderPage() {
  const { user, role } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<(Product & { id: string })[]>([]);
  const [buyers, setBuyers] = useState<User[]>([]);
  const [items, setItems] = useState<OrderItem[]>([{ productId: '', productName: '', quantity: 1, unitPrice: 0 }]);
  const [toUserId, setToUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fromUserId = user?.id ?? '';
  const fromUserName = user?.displayName ?? '';

  useEffect(() => {
    if (role !== UserRole.ADMIN || !fromUserId) return;
    ProductService.getAll(undefined, 200).then(setProducts).catch(() => setProducts([]));
    UserService.getAllForAdmin(200).then((all) => {
      const children = all.filter((u) => u.parentUserId === fromUserId);
      setBuyers(children);
    }).catch(() => setBuyers([]));
  }, [role, fromUserId]);

  function addItem() {
    setItems((prev) => [...prev, { productId: '', productName: '', quantity: 1, unitPrice: 0 }]);
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateItem(index: number, field: keyof OrderItem, value: string | number) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        if (field === 'productId') {
          const p = products.find((x) => x.sku === value || x.id === value);
          return {
            ...item,
            productId: p?.sku ?? (value as string),
            productName: p?.name ?? '',
            unitPrice: p?.unitPrice ?? 0,
          };
        }
        return { ...item, [field]: value };
      })
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromUserId) {
      setError('請先登入');
      return;
    }
    if (!toUserId) {
      setError('請選擇買方（經銷商）');
      return;
    }
    const toUser = buyers.find((u) => u.id === toUserId);
    if (!toUser) {
      setError('找不到所選買方');
      return;
    }
    const valid = items.filter((i) => i.productId && i.quantity > 0);
    if (valid.length === 0) {
      setError('請至少新增一筆商品');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const txItems = valid.map(toTxItem);
      const orderData = OrderService.buildSaleOrder({
        fromUserId,
        fromUserName,
        toUserId: toUser.id!,
        toUserName: toUser.displayName ?? '',
        items: txItems,
        paymentMethod: PaymentMethod.CASH,
        notes: '總經銷商出貨給經銷商',
        createdBy: fromUserId,
      });
      const created = await OrderService.create(orderData);
      await InventorySyncService.onSaleCompleted(fromUserId, toUser.id!, txItems, created.id!);
      await OrderService.updateStatus(created.id!, TransactionStatus.COMPLETED);
      router.push('/orders');
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立訂單失敗');
    } finally {
      setSaving(false);
    }
  }

  if (role !== UserRole.ADMIN) {
    return (
      <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
        <div className="max-w-2xl mx-auto py-8">
          <p className="text-gray-400">僅總經銷商可建立訂單</p>
          <Link href="/orders" className="text-accent hover:underline text-sm mt-2 inline-block">
            &larr; 返回訂單
          </Link>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <Link href="/orders" className="text-gray-400 hover:text-gray-200 text-sm">
            &larr; 返回訂單
          </Link>
          <h1 className="text-2xl font-bold text-gray-100 mt-2">建立訂單</h1>
          <p className="text-gray-400 text-sm mt-1">總經銷商出貨給經銷商（一筆一筆輸入）</p>
        </div>

        {error && (
          <div className="msg-error px-4 py-3 rounded-lg text-sm">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">買方（經銷商）</label>
            <select
              value={toUserId}
              onChange={(e) => setToUserId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
              required
            >
              <option value="">選擇經銷商...</option>
              {buyers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName} ({u.role})
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-300">商品明細</label>
              <button
                type="button"
                onClick={addItem}
                className="text-sm text-accent hover:underline"
              >
                + 新增品項
              </button>
            </div>
            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    <select
                      value={item.productId}
                      onChange={(e) => updateItem(i, 'productId', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm"
                    >
                      <option value="">選擇產品...</option>
                      {products.map((p) => (
                        <option key={p.sku} value={p.sku}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(i, 'quantity', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm"
                      placeholder="數量"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice === 0 ? '' : item.unitPrice}
                      onChange={(e) =>
                        updateItem(i, 'unitPrice', parseFloat(e.target.value) || 0)
                      }
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm"
                      placeholder="單價"
                    />
                  </div>
                  <div className="col-span-2 text-gray-400 text-sm">
                    USD {(item.quantity * item.unitPrice).toFixed(2)}
                  </div>
                  <div className="col-span-1">
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="px-2 py-2 bg-red-900/30 hover:bg-red-900/60 text-red-400 rounded-lg text-sm"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg"
            >
              {saving ? '建立中...' : '建立訂單'}
            </button>
            <Link
              href="/orders"
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg"
            >
              取消
            </Link>
          </div>
        </form>
      </div>
    </ProtectedRoute>
  );
}
