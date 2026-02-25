'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { OrderService } from '@/services/database/orders';
import { ProductService } from '@/services/database/products';
import { UserService } from '@/services/database/users';
import { Product, User, UserRole, PaymentMethod, TransactionItem } from '@/types/models';
import { sortByNameEnglishFirst } from '@/lib/sortUsers';
import Link from 'next/link';

export default function CreateOrderPage() {
  const { user, role, firebaseUser } = useAuth();
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [buyerOptions, setBuyerOptions] = useState<User[]>([]); // 買方選項：STOCKIST 時僅顯示下線
  const [stockists, setStockists] = useState<User[]>([]);
  const [admins, setAdmins] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [fromUserId, setFromUserId] = useState('');
  const [toUserId, setToUserId] = useState('');
  const [orderDate, setOrderDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [orderNumber, setOrderNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.CASH);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<{ productId: string; productName: string; quantity: number; unitPrice: number }[]>([
    { productId: '', productName: '', quantity: 1, unitPrice: 0 },
  ]);

  useEffect(() => {
    ProductService.getAll().then(setProducts).catch(console.error);
    UserService.getAll().then(setAllUsers).catch(console.error);
    UserService.getStockists().then(setStockists).catch(console.error);
    UserService.getAdmins().then(setAdmins).catch(console.error);
  }, []);

  useEffect(() => {
    const currentUserId = user?.id ?? firebaseUser?.uid;
    if (role === UserRole.STOCKIST && currentUserId) {
      UserService.getChildren(currentUserId).then((children) => {
        const self = allUsers.find((u) => u.id === currentUserId) ?? stockists.find((s) => s.id === currentUserId);
        if (self) {
          setBuyerOptions([self, ...children.filter((c) => c.id !== self.id)]);
        } else {
          setBuyerOptions(children);
        }
      }).catch(() => setBuyerOptions([]));
    } else {
      setBuyerOptions(allUsers);
    }
  }, [role, user?.id, firebaseUser?.uid, allUsers, stockists]);

  useEffect(() => {
    if (role === UserRole.STOCKIST && user?.id) {
      setFromUserId(user.id);
    } else if (role === UserRole.ADMIN) {
      const adminId = user?.id ?? firebaseUser?.uid;
      if (adminId) setFromUserId((prev) => prev || adminId);
      else {
        const first = admins[0] || stockists[0];
        if (first?.id) setFromUserId((prev) => prev || first.id!);
      }
    }
  }, [role, user?.id, firebaseUser?.uid, stockists, admins]);

  function addItem() {
    setItems((prev) => [...prev, { productId: '', productName: '', quantity: 1, unitPrice: 0 }]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: string, value: string | number) {
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        if (field === 'productId') {
          const product = products.find((p) => p.sku === value);
          return {
            ...item,
            productId: product?.sku || '',
            productName: product?.name || '',
            unitPrice: product?.unitPrice || 0,
          };
        }
        return { ...item, [field]: value };
      })
    );
  }

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const sellerId = role === UserRole.ADMIN ? fromUserId : user?.id;
    if (!sellerId) { setError('請選擇經銷商（賣方）。'); return; }
    if (!toUserId) { setError('請選擇顧客（買方）'); return; }
    if (items.some((i) => !i.productId)) { setError('請為每筆明細選擇產品。'); return; }
    if (items.some((i) => i.quantity <= 0)) { setError('數量必須大於 0。'); return; }

    const adminId = user?.id ?? firebaseUser?.uid;
    const fromUser = role === UserRole.ADMIN
      ? (admins.find((a) => a.id === fromUserId) || stockists.find((s) => s.id === fromUserId) || (fromUserId === adminId ? { id: adminId, displayName: user?.displayName || 'Admin' } : null))
      : user;
    const toUser = allUsers.find((u) => u.id === toUserId);
    if (!fromUser) { setError('找不到所選經銷商。'); return; }
    if (!toUser) { setError('找不到所選買方。'); return; }
    if (fromUser.id !== toUser.id && toUser.parentUserId && fromUser?.id !== toUser.parentUserId) {
      setError('買方只能向直屬上線下單，請選擇正確的賣方。');
      return;
    }

    setSaving(true);
    try {
      const txItems: TransactionItem[] = items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.quantity * item.unitPrice,
      }));

      const orderData = OrderService.buildSaleOrder({
        fromUserId: fromUser.id!,
        fromUserName: fromUser.displayName,
        toUserId: toUser.id!,
        toUserName: toUser.displayName,
        items: txItems,
        paymentMethod,
        notes: notes.trim() || undefined,
        createdBy: user?.id!,
      });

      const createdAt = orderDate ? new Date(orderDate).setHours(0, 0, 0, 0) : Date.now();
      await OrderService.create(orderData, {
        createdAt,
        customId: orderNumber.trim() || undefined,
      });
      router.push('/orders');
    } catch (err: any) {
      setError(err?.message || 'Failed to create order.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/orders" className="text-gray-400 hover:text-gray-200 text-sm">
            &larr; 返回訂單
          </Link>
          <Link href="/orders/create-bulk" className="text-gray-400 hover:text-gray-200 text-sm">
            批量進貨與分配
          </Link>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-gray-900">建立訂單</h1>
          <p className="text-gray-400 mt-1">建立銷售訂單（上線 → 下線，下線僅能向直屬上線下單；亦可自用，賣方與買方為同一人）</p>
        </div>

        {error && (
          <div className="msg-error px-4 py-3 rounded-lg">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-200">Order Details</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">日期</label>
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
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="留空則自動產生（TXN-時間戳）"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {role === UserRole.ADMIN && (
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  賣方（經銷商 / 總經銷商）<span className="text-red-400">*</span>
                </label>
                <select
                  value={fromUserId}
                  onChange={(e) => setFromUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500 name-lowercase"
                >
                  <option value="">{toUserId ? '請選擇賣方...' : '請先選擇買方'}</option>
                  {(() => {
                    const toUser = allUsers.find((u) => u.id === toUserId);
                    const pool = [...admins, ...stockists];
                    const allowed = toUser?.parentUserId
                      ? pool.filter((s) => s.id === toUser.parentUserId || s.id === toUserId)
                      : pool;
                    return sortByNameEnglishFirst(allowed).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.displayName}{s.id === toUserId ? '（自用）' : ''}
                      </option>
                    ));
                  })()}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {allUsers.find((u) => u.id === toUserId)?.parentUserId
                    ? '買方有上線時，賣方僅能為其直屬上線'
                    : '買方無上線時，可選任一賣方'}
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                顧客（買方）<span className="text-red-400">*</span>
              </label>
              <select
                value={toUserId}
                onChange={(e) => {
                  setToUserId(e.target.value);
                  const selected = allUsers.find((u) => u.id === e.target.value);
                  if (role === UserRole.ADMIN && selected?.parentUserId) setFromUserId(selected.parentUserId);
                }}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500 name-lowercase"
              >
                <option value="">請選擇買方（下線）...</option>
                {sortByNameEnglishFirst(buyerOptions).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.displayName}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {role === UserRole.STOCKIST ? '可選自己（自用）或直屬下線，下線必須向您（上線）下單' : '選擇買方後，賣方將限制為其直屬上線或本人（自用）'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Payment Method</label>
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
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-200">Items</h2>
              <button
                type="button"
                onClick={addItem}
                className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg"
              >
                + Add Item
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5">
                    {index === 0 && <label className="block text-xs text-gray-400 mb-1">Product</label>}
                    <select
                      value={item.productId}
                      onChange={(e) => updateItem(index, 'productId', e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value="">Select product...</option>
                      {products.map((p) => (
                        <option key={p.sku} value={p.sku}>
                          {p.name} (USD {p.unitPrice})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    {index === 0 && <label className="block text-xs text-gray-400 mb-1">Qty</label>}
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                      min="1"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="col-span-2">
                    {index === 0 && <label className="block text-xs text-gray-400 mb-1">Unit Price</label>}
                    <input
                      type="number"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="col-span-2">
                    {index === 0 && <label className="block text-xs text-gray-400 mb-1">Total</label>}
                    <div className="px-3 py-2 bg-gray-750 border border-gray-700 rounded-lg text-gray-300 text-sm">
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
              {saving ? 'Creating...' : 'Create Order'}
            </button>
            <Link
              href="/orders"
              className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg font-medium"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </ProtectedRoute>
  );
}
