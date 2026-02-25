'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PurchaseOrderService } from '@/services/database/purchaseOrders';
import { ProductService } from '@/services/database/products';
import { UserService } from '@/services/database/users';
import { Product, User, UserRole } from '@/types/models';
import Link from 'next/link';

type PoItem = { productId: string; productName: string; quantity: number; unitCost: number };

export default function CreatePurchaseOrderPage() {
  const { user, role } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<(Product & { id: string })[]>([]);
  const [receivers, setReceivers] = useState<User[]>([]);
  const [items, setItems] = useState<PoItem[]>([{ productId: '', productName: '', quantity: 1, unitCost: 0 }]);
  const [userId, setUserId] = useState('');
  const [fromUserId, setFromUserId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const currentUserId = user?.id ?? '';

  useEffect(() => {
    if (!currentUserId) return;
    ProductService.getAll(undefined, 200).then(setProducts).catch(() => setProducts([]));
    if (role === UserRole.ADMIN) {
      UserService.getAllForAdmin(200).then((all) => {
        const children = all.filter((u) => u.parentUserId === currentUserId);
        setReceivers(children);
      }).catch(() => setReceivers([]));
    }
  }, [currentUserId, role]);

  useEffect(() => {
    if (role === UserRole.STOCKIST) {
      setUserId(currentUserId);
      setFromUserId(user?.parentUserId ?? '');
    }
  }, [role, currentUserId, user?.parentUserId]);

  function addItem() {
    setItems((prev) => [...prev, { productId: '', productName: '', quantity: 1, unitCost: 0 }]);
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateItem(index: number, field: keyof PoItem, value: string | number) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        if (field === 'productId') {
          const p = products.find((x) => x.sku === value || x.id === value);
          return {
            ...item,
            productId: p?.sku ?? (value as string),
            productName: p?.name ?? '',
            unitCost: p?.costPrice ?? 0,
          };
        }
        return { ...item, [field]: value };
      })
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const valid = items.filter((i) => i.productId && i.quantity > 0);
    if (valid.length === 0) {
      setError('請至少新增一筆商品');
      return;
    }
    const receiverId = role === UserRole.ADMIN ? userId : currentUserId;
    if (!receiverId) {
      setError('請選擇收貨人');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const poItems = valid.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        quantity: i.quantity,
        unitCost: i.unitCost,
        total: i.quantity * i.unitCost,
      }));
      const created = await PurchaseOrderService.create({
        userId: receiverId,
        fromUserId: fromUserId || undefined,
        supplierName: supplierName.trim() || undefined,
        items: poItems,
        totals: { subtotal: poItems.reduce((s, i) => s + i.total, 0), grandTotal: poItems.reduce((s, i) => s + i.total, 0) },
        notes: notes.trim() || undefined,
        createdBy: currentUserId,
      });
      router.push(`/purchase-orders/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立進貨單失敗');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <Link href="/purchase-orders" className="text-gray-400 hover:text-gray-200 text-sm">
            &larr; 返回進貨單
          </Link>
          <h1 className="text-2xl font-bold text-gray-100 mt-2">建立進貨單</h1>
          <p className="text-gray-400 text-sm mt-1">
            {role === UserRole.STOCKIST ? '向總經銷商進貨' : '建立進貨單（可為經銷商或外部供應商）'}
          </p>
        </div>

        {error && <div className="msg-error px-4 py-3 rounded-lg text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-6">
          {role === UserRole.ADMIN && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">收貨人</label>
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
                required
              >
                <option value="">選擇收貨人...</option>
                <option value={currentUserId}>自己（總經銷商）</option>
                {receivers.map((u) => (
                  <option key={u.id} value={u.id}>{u.displayName}</option>
                ))}
              </select>
            </div>
          )}

          {role === UserRole.ADMIN && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">進貨來源</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={!fromUserId}
                    onChange={() => setFromUserId('')}
                    className="rounded"
                  />
                  <span className="text-sm">外部供應商</span>
                </label>
                {userId && userId !== currentUserId && (
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={!!fromUserId}
                      onChange={() => setFromUserId(currentUserId)}
                      className="rounded"
                    />
                    <span className="text-sm">從總經銷商（自己）出貨給經銷商</span>
                  </label>
                )}
              </div>
              {!fromUserId && (
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="供應商名稱（選填）"
                  className="mt-2 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
                />
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-300">商品明細</label>
              <button type="button" onClick={addItem} className="text-sm text-accent hover:underline">
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
                        <option key={p.sku} value={p.sku}>{p.name} ({p.sku})</option>
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
                      value={item.unitCost === 0 ? '' : item.unitCost}
                      onChange={(e) => updateItem(i, 'unitCost', parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm"
                      placeholder="單位成本"
                    />
                  </div>
                  <div className="col-span-2 text-gray-400 text-sm">
                    USD {(item.quantity * item.unitCost).toFixed(2)}
                  </div>
                  <div className="col-span-1">
                    {items.length > 1 && (
                      <button type="button" onClick={() => removeItem(i)} className="px-2 py-2 bg-red-900/30 hover:bg-red-900/60 text-red-400 rounded text-sm">✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">備註</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
              placeholder="選填"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-accent hover:bg-accent-hover disabled:opacity-50 text-white text-sm font-medium rounded-lg"
            >
              {saving ? '建立中...' : '建立進貨單'}
            </button>
            <Link href="/purchase-orders" className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 text-sm rounded-lg">
              取消
            </Link>
          </div>
        </form>
      </div>
    </ProtectedRoute>
  );
}
