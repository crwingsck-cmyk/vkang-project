'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PurchaseOrderService } from '@/services/database/purchaseOrders';
import { ProductService } from '@/services/database/products';
import { UserService } from '@/services/database/users';
import { Product, User, UserRole, PurchaseOrderItem } from '@/types/models';
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
    }
  }, [user?.id, firebaseUser?.uid, role]);

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
      await PurchaseOrderService.create({
        supplierName: fromAdmin ? (fromUserId === recipientUser?.parentUserId ? '上線' : '總經銷商') : (supplierName.trim() || undefined),
        fromUserId: fromAdmin ? fromUserId : undefined,
        userId: targetUserId,
        useFifo: useFifo || undefined,
        items: poItems,
        totals: {
          subtotal: poItems.reduce((s, i) => s + i.total, 0),
          grandTotal: poItems.reduce((s, i) => s + i.total, 0),
        },
        notes: notes.trim() || undefined,
        createdBy: user.id,
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
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/purchase-orders"
            className="text-gray-400 hover:text-gray-200 text-sm"
          >
            &larr; 返回進貨單
          </Link>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-gray-100">新增進貨單</h1>
          <p className="text-gray-400 mt-1">建立批次進貨，每批可設定不同成本</p>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
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
                向上線進貨（從上線調撥庫存，支援第四線、第五線等多層級）
              </label>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {fromAdmin && role === UserRole.STOCKIST ? (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  進貨來源 <span className="text-red-400">*</span>
                </label>
                <select
                  value={fromUserId}
                  onChange={(e) => setFromUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="">請選擇</option>
                  {recipientUser?.parentUserId && (
                    <option value={recipientUser.parentUserId}>
                      上線：{parentUser?.displayName || parentUser?.email || recipientUser.parentUserId}
                    </option>
                  )}
                  {admins
                    .filter((a) => a.id !== recipientUser?.parentUserId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.displayName} ({a.email})
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
                  {role === UserRole.ADMIN ? '供應商（如：台灣總部）' : '供應商名稱'}
                </label>
                <input
                  type="text"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                  placeholder={role === UserRole.ADMIN ? '請輸入供應商名稱，如：台灣總部' : '選填（外部供應商）'}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
                {role === UserRole.ADMIN && (
                  <p className="text-xs text-gray-500 mt-1">向台灣或外部供應商進貨，收貨後庫存將加入所選收貨人</p>
                )}
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
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
                >
                  <option value="">請選擇</option>
                  {(user?.id ?? firebaseUser?.uid) && (
                    <option value={user?.id ?? firebaseUser?.uid!}>
                      我自己（馬來西亞總經銷商）
                    </option>
                  )}
                  {stockists.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName} ({s.email})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">選「我自己」= 向台灣進貨；選經銷商 = 出貨給下線</p>
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

          <div>
            <div className="flex gap-2 mb-2">
              <label className="block text-sm font-medium text-gray-300">
                進貨明細
              </label>
              <button
                type="button"
                onClick={addItem}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                + 新增
              </button>
            </div>
            <div className="space-y-3">
              {items.map((item, i) => (
                <div
                  key={i}
                  className="grid grid-cols-12 gap-2 items-end bg-gray-700/50 rounded-lg p-3"
                >
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
                      onChange={(e) =>
                        updateItem(i, 'quantity', parseInt(e.target.value) || 0)
                      }
                      className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-sm text-gray-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs text-gray-400 mb-0.5">單位成本</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitCost}
                      onChange={(e) =>
                        updateItem(i, 'unitCost', parseFloat(e.target.value) || 0)
                      }
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
            <span className="text-xl font-bold text-gray-100">
              USD {subtotal.toFixed(2)}
            </span>
          </div>

          <div className="flex gap-3 pt-2">
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
