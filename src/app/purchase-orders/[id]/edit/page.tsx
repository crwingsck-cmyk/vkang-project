'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PurchaseOrderService } from '@/services/database/purchaseOrders';
import { ProductService } from '@/services/database/products';
import { UserService } from '@/services/database/users';
import { Product, User, UserRole, PurchaseOrderItem, PurchaseOrderStatus } from '@/types/models';
import Link from 'next/link';

export default function EditPurchaseOrderPage() {
  const router = useRouter();
  const params = useParams();
  const poId = (params?.id ?? '') as string;
  const { user, role, firebaseUser } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [stockists, setStockists] = useState<User[]>([]);
  const [admins, setAdmins] = useState<User[]>([]);
  const [recipientUser, setRecipientUser] = useState<User | null>(null);
  const [parentUser, setParentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [supplierName, setSupplierName] = useState('');
  const [userId, setUserId] = useState('');
  const [fromAdmin, setFromAdmin] = useState(false);
  const [fromUserId, setFromUserId] = useState('');
  const [useFifo, setUseFifo] = useState(false);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<
    { productId: string; productName: string; quantity: number; unitCost: number }[]
  >([{ productId: '', productName: '', quantity: 1, unitCost: 0 }]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [po, prods, stockistList, adminList] = await Promise.all([
          PurchaseOrderService.getById(poId),
          ProductService.getAll(undefined, 100),
          role === UserRole.ADMIN ? UserService.getStockists() : [],
          UserService.getAdmins(),
        ]);
        setProducts(prods);
        setStockists(stockistList);
        setAdmins(adminList);
        if (!po) {
          setError('進貨單不存在');
          return;
        }
        if (po.status === PurchaseOrderStatus.RECEIVED || po.status === PurchaseOrderStatus.CANCELLED) {
          setError('已收貨或已取消的進貨單無法修改');
          return;
        }
        setSupplierName(po.supplierName || '');
        setUserId(po.userId || '');
        setFromAdmin(!!po.fromUserId);
        setFromUserId(po.fromUserId || '');
        setUseFifo(!!po.useFifo);
        setNotes(po.notes || '');
        setItems(
          po.items?.length
            ? po.items.map((i) => ({
                productId: i.productId,
                productName: i.productName,
                quantity: i.quantity,
                unitCost: i.unitCost,
              }))
            : [{ productId: '', productName: '', quantity: 1, unitCost: 0 }]
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : '載入失敗');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [poId, role]);

  useEffect(() => {
    const targetId = role === UserRole.ADMIN ? userId : (user?.id ?? firebaseUser?.uid);
    if (targetId) {
      UserService.getById(targetId).then((u) => {
        setRecipientUser(u);
        if (u?.parentUserId) {
          UserService.getById(u.parentUserId).then(setParentUser).catch(() => setParentUser(null));
        } else {
          setParentUser(null);
        }
      }).catch(() => setRecipientUser(null));
    } else {
      setRecipientUser(null);
      setParentUser(null);
    }
  }, [userId, user?.id, firebaseUser?.uid, role]);

  function addItem() {
    setItems((prev) => [
      ...prev,
      { productId: '', productName: '', quantity: 1, unitCost: 0 },
    ]);
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateItem(index: number, field: string, value: string | number) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        if (field === 'productId') {
          const p = products.find((p) => p.sku === value);
          return {
            ...item,
            productId: p?.sku || '',
            productName: p?.name || '',
            unitCost: p?.costPrice ?? 0,
          };
        }
        return { ...item, [field]: value };
      })
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const targetUserId = role === UserRole.ADMIN ? userId : (user?.id ?? firebaseUser?.uid);
    if (!targetUserId) {
      setError('請選擇收貨人');
      return;
    }
    const validItems = items.filter((i) => i.productId && i.quantity > 0 && i.unitCost >= 0);
    if (validItems.length === 0) {
      setError('請至少新增一筆商品明細');
      return;
    }
    if (fromAdmin && !fromUserId) {
      setError('請選擇總經銷商');
      return;
    }

    setSaving(true);
    try {
      const poItems: PurchaseOrderItem[] = validItems.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitCost: item.unitCost,
        total: item.quantity * item.unitCost,
      }));
      await PurchaseOrderService.update(poId, {
        supplierName: fromAdmin ? (fromUserId === recipientUser?.parentUserId ? '上線' : '總經銷商') : (supplierName.trim() || undefined),
        fromUserId: fromAdmin ? fromUserId : undefined,
        userId: targetUserId,
        useFifo: useFifo || undefined,
        items: poItems,
        notes: notes.trim() || undefined,
      });
      router.push(`/purchase-orders/${poId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '儲存失敗');
    } finally {
      setSaving(false);
    }
  }

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);

  if (loading) {
    return (
      <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
        <div className="max-w-2xl mx-auto py-12 text-center text-gray-400">載入中...</div>
      </ProtectedRoute>
    );
  }

  if (error && !items.some((i) => i.productId)) {
    return (
      <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
        <div className="max-w-2xl mx-auto space-y-6">
          <Link href="/purchase-orders" className="text-gray-400 hover:text-gray-200 text-sm">
            &larr; 返回進貨單
          </Link>
          <div className="msg-error px-4 py-3 rounded-lg">
            {error}
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/purchase-orders" className="text-gray-400 hover:text-gray-200 text-sm">
            &larr; 返回進貨單
          </Link>
          <Link href={`/purchase-orders/${poId}`} className="text-gray-400 hover:text-gray-200 text-sm">
            查看詳情
          </Link>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-gray-100">修改進貨單</h1>
          <p className="text-gray-400 mt-1">編輯進貨單內容</p>
        </div>

        {error && (
          <div className="msg-error px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4"
        >
          {role === UserRole.STOCKIST && (
            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                id="fromAdmin"
                checked={fromAdmin}
                onChange={(e) => {
                  setFromAdmin(e.target.checked);
                  if (!e.target.checked) setFromUserId('');
                  else if (recipientUser?.parentUserId) setFromUserId(recipientUser.parentUserId!);
                }}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
              />
              <label htmlFor="fromAdmin" className="text-sm text-gray-300">
                向上線進貨（從上線調撥庫存）
              </label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {fromAdmin && role === UserRole.STOCKIST ? (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">進貨來源</label>
                <select
                  value={fromUserId}
                  onChange={(e) => setFromUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="">請選擇</option>
                  {recipientUser?.parentUserId && (
                    <option value={recipientUser.parentUserId}>
                      上線：{parentUser?.displayName || recipientUser.parentUserId}
                    </option>
                  )}
                  {admins
                    .filter((a) => a.id !== recipientUser?.parentUserId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.displayName}
                      </option>
                    ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  {role === UserRole.ADMIN ? '供應商' : '供應商名稱'}
                </label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder="選填"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
            {role === UserRole.ADMIN && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">收貨人</label>
                <select
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500 name-lowercase"
                >
                  <option value="">請選擇</option>
                  {(user?.id ?? firebaseUser?.uid) && (
                    <option value={user?.id ?? firebaseUser?.uid!}>
                      tan sun sun（馬來西亞總經銷商）
                    </option>
                  )}
                  {stockists.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="useFifo"
              checked={useFifo}
              onChange={(e) => setUseFifo(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
            />
            <label htmlFor="useFifo" className="text-sm text-gray-300">
              使用 FIFO 成本計算
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">備註</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="選填"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <div className="flex gap-2 mb-2">
              <label className="block text-sm font-medium text-gray-300">進貨明細</label>
              <button type="button" onClick={addItem} className="text-xs text-blue-400 hover:text-blue-300">
                + 新增
              </button>
            </div>
            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end bg-gray-700/50 rounded-lg p-3">
                  <div className="col-span-5">
                    <label className="block text-xs text-gray-400 mb-0.5">產品</label>
                    <select
                      value={item.productId}
                      onChange={(e) => updateItem(i, 'productId', e.target.value)}
                      className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Select</option>
                      {products.map((p) => (
                        <option key={p.sku} value={p.sku}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-400 mb-0.5">數量</label>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(i, 'quantity', parseInt(e.target.value) || 0)}
                      className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-400 mb-0.5">單位成本</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitCost === 0 ? '' : item.unitCost}
                      onChange={(e) => {
                        const val = e.target.value;
                        const num = val === '' ? 0 : parseFloat(val);
                        updateItem(i, 'unitCost', isNaN(num) ? 0 : num);
                      }}
                      className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="col-span-2 text-sm text-gray-400">
                    小計: {item.quantity * item.unitCost}
                  </div>
                  <div className="col-span-1">
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        刪
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-gray-700 pt-4 flex justify-between items-center">
            <span className="text-gray-400">總計:</span>
            <span className="text-xl font-bold text-gray-100">USD {subtotal.toFixed(2)}</span>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium"
            >
              {saving ? '儲存中...' : '儲存修改'}
            </button>
            <Link
              href={`/purchase-orders/${poId}`}
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
