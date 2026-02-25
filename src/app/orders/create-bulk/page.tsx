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
import { sortByNameEnglishFirst } from '@/lib/sortUsers';
import Link from 'next/link';

export default function CreateBulkOrderPage() {
  const { user, role, firebaseUser } = useAuth();
  const router = useRouter();

  const [products, setProducts] = useState<Product[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [stockists, setStockists] = useState<User[]>([]);
  const [admins, setAdmins] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [fromUserId, setFromUserId] = useState('');
  const [toUserId, setToUserId] = useState('');
  const [productId, setProductId] = useState('');
  const [totalQty, setTotalQty] = useState(0);
  const [unitPrice, setUnitPrice] = useState(0);
  const [selfUseQty, setSelfUseQty] = useState(0);
  const [downlineAllocs, setDownlineAllocs] = useState<{ userId: string; userName: string; qty: number }[]>([]);
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [buyerOptions, setBuyerOptions] = useState<User[]>([]);

  useEffect(() => {
    ProductService.getAll().then(setProducts).catch(console.error);
    UserService.getAll().then(setAllUsers).catch(console.error);
    UserService.getStockists().then(setStockists).catch(console.error);
    UserService.getAdmins().then(setAdmins).catch(console.error);
  }, []);

  useEffect(() => {
    if (role === UserRole.STOCKIST && user?.id) {
      setFromUserId(user.id);
    } else if (role === UserRole.ADMIN) {
      const toUser = allUsers.find((u) => u.id === toUserId);
      if (toUser?.parentUserId) {
        setFromUserId(toUser.parentUserId);
      } else {
        const adminId = user?.id ?? firebaseUser?.uid;
        if (adminId) setFromUserId((prev) => prev || adminId);
        else {
          const first = admins[0] || stockists[0];
          if (first?.id) setFromUserId((prev) => prev || first.id!);
        }
      }
    }
  }, [role, user?.id, firebaseUser?.uid, stockists, admins, toUserId, allUsers]);

  useEffect(() => {
    const uid = user?.id ?? firebaseUser?.uid;
    if (role === UserRole.STOCKIST && uid) {
      UserService.getChildren(uid).then((children) => {
        const self = allUsers.find((u) => u.id === uid) ?? stockists.find((s) => s.id === uid);
        setBuyerOptions(self ? [self, ...children.filter((c) => c.id !== self.id)] : children);
      }).catch(() => setBuyerOptions([]));
    } else {
      setBuyerOptions(allUsers);
    }
  }, [role, user?.id, firebaseUser?.uid, allUsers, stockists]);

  useEffect(() => {
    if (productId) {
      const p = products.find((x) => x.sku === productId);
      setUnitPrice(p?.unitPrice ?? 0);
    }
  }, [productId, products]);

  const directDownlines = toUserId
    ? allUsers.filter((u) => u.parentUserId === toUserId).sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''))
    : [];

  const allocSum = selfUseQty + downlineAllocs.reduce((s, d) => s + d.qty, 0);
  const allocValid = totalQty > 0 && allocSum === totalQty;

  function addDownline() {
    if (directDownlines.length === 0) return;
    const first = directDownlines.find((d) => !downlineAllocs.some((a) => a.userId === d.id));
    if (first) {
      setDownlineAllocs((prev) => [...prev, { userId: first.id!, userName: first.displayName || '', qty: 0 }]);
    }
  }

  function updateDownline(index: number, qty: number) {
    setDownlineAllocs((prev) =>
      prev.map((d, i) => (i === index ? { ...d, qty } : d))
    );
  }

  function setDownlineUser(index: number, userId: string) {
    const u = allUsers.find((x) => x.id === userId);
    setDownlineAllocs((prev) =>
      prev.map((d, i) => (i === index ? { userId: userId, userName: u?.displayName || '', qty: d.qty } : d))
    );
  }

  function removeDownline(index: number) {
    setDownlineAllocs((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!fromUserId || !toUserId || !productId || totalQty <= 0) {
      setError('請填寫完整：賣方、買方、產品、總數量');
      return;
    }
    if (!allocValid) {
      setError(`分配總和必須等於總數量：自用 ${selfUseQty} + 下線 ${downlineAllocs.reduce((s, d) => s + d.qty, 0)} = ${allocSum}，應為 ${totalQty}`);
      return;
    }

    const fromUser = admins.find((a) => a.id === fromUserId) || stockists.find((s) => s.id === fromUserId);
    const toUser = allUsers.find((u) => u.id === toUserId);
    if (!fromUser || !toUser) {
      setError('找不到所選使用者');
      return;
    }
    if (role === UserRole.STOCKIST && fromUser.id !== (user?.id ?? firebaseUser?.uid)) {
      setError('經銷商僅能以自己的名義建立訂單');
      return;
    }
    if (toUser.parentUserId && fromUser.id !== toUser.parentUserId) {
      setError('買方只能向直屬上線進貨');
      return;
    }
    const product = products.find((p) => p.sku === productId);
    if (!product) {
      setError('找不到所選產品');
      return;
    }

    setSaving(true);
    try {
      const createdAt = orderDate ? new Date(orderDate).setHours(0, 0, 0, 0) : Date.now();
      const createdBy = user?.id ?? firebaseUser?.uid ?? '';

      const makeItem = (qty: number): TransactionItem[] => [
        {
          productId: product.sku,
          productName: product.name,
          quantity: qty,
          unitPrice,
          total: qty * unitPrice,
        },
      ];

      // 1. 主訂單：上線 → 買方，完成
      const mainOrderData = OrderService.buildSaleOrder({
        fromUserId: fromUser.id!,
        fromUserName: fromUser.displayName,
        toUserId: toUser.id!,
        toUserName: toUser.displayName,
        items: makeItem(totalQty),
        paymentMethod: PaymentMethod.CASH,
        notes: '批量進貨（含分配）',
        createdBy,
      });
      const mainOrder = await OrderService.create(mainOrderData, { createdAt });
      const mainId = mainOrder.id!;
      await InventorySyncService.onSaleCompleted(fromUser.id!, toUser.id!, makeItem(totalQty), mainId);
      await OrderService.updateStatus(mainId, TransactionStatus.COMPLETED);

      // 2. 自用訂單
      if (selfUseQty > 0) {
        const selfOrderData = OrderService.buildSaleOrder({
          fromUserId: toUser.id!,
          fromUserName: toUser.displayName,
          toUserId: toUser.id!,
          toUserName: toUser.displayName,
          items: makeItem(selfUseQty),
          paymentMethod: PaymentMethod.CASH,
          notes: '自用',
          createdBy,
        });
        const selfOrder = await OrderService.create(selfOrderData, { createdAt: createdAt + 1 });
        await InventorySyncService.onSaleCompleted(toUser.id!, toUser.id!, makeItem(selfUseQty), selfOrder.id!);
        await OrderService.updateStatus(selfOrder.id!, TransactionStatus.COMPLETED);
      }

      // 3. 下線訂單
      for (const d of downlineAllocs) {
        if (d.qty <= 0) continue;
        const downUser = allUsers.find((u) => u.id === d.userId);
        if (!downUser) continue;
        const downOrderData = OrderService.buildSaleOrder({
          fromUserId: toUser.id!,
          fromUserName: toUser.displayName,
          toUserId: downUser.id!,
          toUserName: downUser.displayName,
          items: makeItem(d.qty),
          paymentMethod: PaymentMethod.CASH,
          notes: `分配至 ${downUser.displayName}`,
          createdBy,
        });
        const downOrder = await OrderService.create(downOrderData, { createdAt: createdAt + 2 });
        await InventorySyncService.onSaleCompleted(toUser.id!, downUser.id!, makeItem(d.qty), downOrder.id!);
        await OrderService.updateStatus(downOrder.id!, 'COMPLETED' as any);
      }

      router.push('/orders');
    } catch (err: any) {
      setError(err?.message || '建立失敗');
    } finally {
      setSaving(false);
    }
  }

  if (role !== UserRole.ADMIN && role !== UserRole.STOCKIST) {
    return (
      <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
        <div className="max-w-3xl mx-auto py-16 text-center text-gray-400">僅管理員與經銷商可使用此功能</div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/orders" className="text-gray-400 hover:text-gray-200 text-sm">
            &larr; 返回訂單
          </Link>
          <Link href="/orders/create" className="text-gray-400 hover:text-gray-200 text-sm">
            一般建立訂單
          </Link>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-gray-100">批量進貨與分配</h1>
          <p className="text-gray-400 mt-1">
            一次輸入總數，系統自動建立主訂單並完成分配（自用 + 下線），庫存會自動更新
          </p>
        </div>

        {error && <div className="msg-error px-4 py-3 rounded-lg">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-200">主訂單</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">賣方</label>
                <select
                  value={fromUserId}
                  onChange={(e) => setFromUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
                  disabled={role === UserRole.STOCKIST}
                >
                  <option value="">請選擇...</option>
                  {sortByNameEnglishFirst([...admins, ...stockists]).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">買方（接收貨人）</label>
                <select
                  value={toUserId}
                  onChange={(e) => {
                    setToUserId(e.target.value);
                    setDownlineAllocs([]);
                  }}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
                >
                  <option value="">請選擇...</option>
                  {sortByNameEnglishFirst(buyerOptions).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">產品</label>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
                >
                  <option value="">請選擇...</option>
                  {products.map((p) => (
                    <option key={p.sku} value={p.sku}>
                      {p.name} (USD {p.unitPrice})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">總數量（盒）</label>
                <input
                  type="number"
                  min="1"
                  value={totalQty || ''}
                  onChange={(e) => setTotalQty(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100"
                  placeholder="輸入總數量"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">日期</label>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 max-w-xs"
              />
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-200">分配（自用 + 下線）</h2>
              <span className={`text-sm ${allocValid ? 'text-green-400' : 'text-amber-400'}`}>
                {allocSum} / {totalQty}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              自用 + 下線分配總和必須等於總數量。下線僅能選買方的直屬下線。若要分配至下線的下線（多層），請先完成本筆，再以該下線為買方建立另一筆批量進貨。
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">自用數量</label>
              <input
                type="number"
                min="0"
                value={selfUseQty || ''}
                onChange={(e) => setSelfUseQty(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 max-w-[120px]"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-300">下線分配</label>
                <button
                  type="button"
                  onClick={addDownline}
                  disabled={directDownlines.length === 0 || downlineAllocs.length >= directDownlines.length}
                  className="px-4 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg disabled:opacity-50"
                >
                  + 新增下線
                </button>
              </div>
              <div className="space-y-2">
                {downlineAllocs.map((d, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <select
                      value={d.userId}
                      onChange={(e) => setDownlineUser(i, e.target.value)}
                      className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm"
                    >
                      {directDownlines.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.displayName}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min="0"
                      value={d.qty || ''}
                      onChange={(e) => updateDownline(i, parseInt(e.target.value) || 0)}
                      className="w-20 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm"
                      placeholder="數量"
                    />
                    <button
                      type="button"
                      onClick={() => removeDownline(i)}
                      className="px-2 py-1 text-red-400 hover:bg-red-900/30 rounded"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving || !allocValid}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium"
            >
              {saving ? '建立中...' : '建立並完成分配'}
            </button>
            <Link
              href="/orders"
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
