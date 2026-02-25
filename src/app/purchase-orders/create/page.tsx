'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PurchaseOrderService } from '@/services/database/purchaseOrders';
import { ProductService } from '@/services/database/products';
import { UserService } from '@/services/database/users';
import { OrderService } from '@/services/database/orders';
import { Product, User, UserRole, PurchaseOrderItem, TransactionType, TransactionStatus } from '@/types/models';
import Link from 'next/link';

export default function CreatePurchaseOrderPage() {
  const router = useRouter();
  const { user, role, firebaseUser } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [stockists, setStockists] = useState<User[]>([]);
  const [admins, setAdmins] = useState<User[]>([]);
  const [recipientUser, setRecipientUser] = useState<User | null>(null);
  const [parentUser, setParentUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [supplierName, setSupplierName] = useState('');
  const [userId, setUserId] = useState('');
  const [fromAdmin, setFromAdmin] = useState(false);
  const [fromUserId, setFromUserId] = useState('');
  const [useFifo, setUseFifo] = useState(false);
  const [notes, setNotes] = useState('');
  const [orderDate, setOrderDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [poNumber, setPoNumber] = useState('');
  const [items, setItems] = useState<
    { productId: string; productName: string; quantity: number; unitCost: number }[]
  >([{ productId: '', productName: '', quantity: 1, unitCost: 0 }]);

  useEffect(() => {
    ProductService.getAll(undefined, 100).then(setProducts).catch(console.error);
    if (role === UserRole.ADMIN) {
      UserService.getStockists().then((list) => {
        setStockists(list);
        const adminId = user?.id ?? firebaseUser?.uid;
        if (!userId && adminId) {
          setUserId(adminId);
        } else if (!userId && list.length > 0 && list[0].id) {
          setUserId(list[0].id!);
        }
      }).catch(console.error);
    }
    UserService.getAdmins().then(setAdmins).catch(console.error);
  }, [role, user?.id, firebaseUser?.uid]);

  useEffect(() => {
    if (role === UserRole.STOCKIST) {
      const id = user?.id ?? firebaseUser?.uid;
      if (id) setUserId(id);
      setFromAdmin(true); // 經銷商只能向總經銷商進貨，不能向台灣進貨
    }
  }, [user?.id, firebaseUser?.uid, role]);

  useEffect(() => {
    const targetId = role === UserRole.ADMIN ? userId : (user?.id ?? firebaseUser?.uid);
    if (targetId) {
      UserService.getById(targetId).then((u) => {
        setRecipientUser(u);
        if (u?.parentUserId) {
          UserService.getById(u.parentUserId).then(setParentUser).catch(() => setParentUser(null));
          if (role === UserRole.STOCKIST) setFromUserId(u.parentUserId!);
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

  async function loadFromPendingOrders() {
    const targetId = role === UserRole.ADMIN ? userId : (user?.id ?? firebaseUser?.uid);
    if (!targetId) return;
    try {
      const orders = await OrderService.getByFromUser(targetId, 100);
      const pending = orders.filter(
        (o) => o.transactionType === TransactionType.SALE && o.status === TransactionStatus.PENDING
      );
      const agg: Record<string, { productId: string; productName: string; quantity: number }> = {};
      for (const o of pending) {
        for (const it of o.items || []) {
          if (!it.productId) continue;
          const key = it.productId;
          if (!agg[key]) {
            agg[key] = { productId: it.productId, productName: it.productName || it.productId, quantity: 0 };
          }
          agg[key].quantity += it.quantity;
        }
      }
      const loaded = Object.values(agg).map((a) => {
        const p = products.find((x) => x.sku === a.productId);
        return {
          productId: a.productId,
          productName: a.productName,
          quantity: a.quantity,
          unitCost: p?.costPrice ?? 0,
        };
      });
      if (loaded.length > 0) {
        setItems(loaded);
      }
    } catch (e) {
      console.error('Load from orders failed:', e);
    }
  }

  function removeItem(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateItem(
    index: number,
    field: string,
    value: string | number
  ) {
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
    if (!user?.id) {
      setError('請先登入');
      return;
    }
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
    if (role === UserRole.STOCKIST && !fromUserId) {
      setError('請選擇進貨來源（總經銷商或上線）');
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
      const createdAt = new Date(orderDate).setHours(0, 0, 0, 0);
      const isFromAdmin = role === UserRole.STOCKIST ? true : fromAdmin;
      const effectiveFromUserId = role === UserRole.STOCKIST ? fromUserId : (fromAdmin ? fromUserId : undefined);
      await PurchaseOrderService.create({
        supplierName: isFromAdmin ? (effectiveFromUserId === recipientUser?.parentUserId ? '上線' : '總經銷商') : (supplierName.trim() || undefined),
        fromUserId: isFromAdmin ? effectiveFromUserId : undefined,
        userId: targetUserId,
        useFifo: useFifo || undefined,
        items: poItems,
        totals: {
          subtotal: poItems.reduce((s, i) => s + i.total, 0),
          grandTotal: poItems.reduce((s, i) => s + i.total, 0),
        },
        notes: notes.trim() || undefined,
        createdBy: user.id,
        poNumber: poNumber.trim() || undefined,
        createdAt,
      });
      router.push('/purchase-orders');
    } catch (err) {
      setError(err instanceof Error ? err.message : '建立失敗');
    } finally {
      setSaving(false);
    }
  }

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/purchase-orders"
            className="text-gray-400 hover:text-gray-200 text-sm"
          >
            &larr; 返回進貨單
          </Link>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-gray-900">新增進貨單</h1>
          <p className="text-gray-400 mt-1">建立批次進貨，每批可設定不同成本</p>
        </div>

        {error && (
          <div className="msg-error px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-200">進貨單</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">進貨日期</label>
                <input
                  type="date"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">發貨號碼</label>
                <input
                  type="text"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="選填，留空則自動產生（如 PO-20260224-001）"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

          {role === UserRole.STOCKIST && (
            <p className="text-sm text-gray-400 mb-4">
              經銷商僅能向總經銷商／上線進貨，無法向台灣等外部供應商進貨。
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            {role === UserRole.STOCKIST ? (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  進貨來源 <span className="text-red-400">*</span>
                </label>
                <select
                  value={fromUserId}
                  onChange={(e) => setFromUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500 name-lowercase"
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
                {recipientUser?.parentUserId && (
                  <p className="text-xs text-gray-500 mt-1">選擇「上線」可向第四線、第五線等多層級架構進貨</p>
                )}
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  供應商
                </label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder={role === UserRole.ADMIN ? '例如：台灣（總經銷商向台灣訂貨及進貨）' : '請輸入供應商名稱'}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
            {role === UserRole.ADMIN && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  收貨人 <span className="text-red-400">*</span>
                </label>
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

          <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="useFifo"
                  checked={useFifo}
                  onChange={(e) => setUseFifo(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                />
                <label htmlFor="useFifo" className="text-sm text-gray-300">
                  使用 FIFO 成本計算（先進先出，可追蹤每批成本）
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
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-200">進貨明細</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={loadFromPendingOrders}
                  className="px-3 py-1 text-sm bg-blue-600/80 hover:bg-blue-600 text-white rounded-lg"
                >
                  從待出貨訂單帶入
                </button>
                <button
                  type="button"
                  onClick={addItem}
                  className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg"
                >
                  + Add Item
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    {i === 0 && <label className="block text-xs text-gray-400 mb-1">產品</label>}
                    <select
                      value={item.productId}
                      onChange={(e) => updateItem(i, 'productId', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Select product...</option>
                      {products.map((p) => (
                        <option key={p.sku} value={p.sku}>
                          {p.name} ({p.sku})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <label className="block text-xs text-gray-400 mb-1">數量</label>}
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) =>
                        updateItem(i, 'quantity', parseInt(e.target.value) || 0)
                      }
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <label className="block text-xs text-gray-400 mb-1">單位成本</label>}
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
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="col-span-2">
                    {i === 0 && <label className="block text-xs text-gray-400 mb-1">小計</label>}
                    <div className="px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-gray-300 text-sm">
                      USD {(item.quantity * item.unitCost).toFixed(2)}
                    </div>
                  </div>
                  <div className="col-span-1">
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="w-full px-2 py-2 bg-red-900/30 hover:bg-red-900/60 text-red-400 rounded-lg text-sm"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-gray-700 pt-4 flex justify-end">
              <div className="text-right">
                <p className="text-gray-400 text-sm">Grand Total</p>
                <p className="text-2xl font-bold text-gray-100">USD {subtotal.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium"
            >
              {saving ? '儲存中...' : '建立進貨單'}
            </button>
            <Link
              href="/purchase-orders"
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
