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
  type DownlineAlloc = {
    userId: string;
    userName: string;
    qty: number;
    expanded?: boolean;
    selfUseQty?: number;
    subAllocs?: { userId: string; userName: string; qty: number }[];
  };
  const [downlineAllocs, setDownlineAllocs] = useState<DownlineAlloc[]>([]);
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

  const getDirectDownlines = (userId: string) =>
    allUsers
      .filter((u) => u.parentUserId === userId)
      .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

  const allocSum = selfUseQty + downlineAllocs.reduce((s, d) => s + d.qty, 0);
  const remainder = totalQty - allocSum; // 剩餘可列為庫存待賣出
  const subAllocsValid = downlineAllocs.every((d) => {
    if (!d.expanded || !d.subAllocs?.length) return true;
    const subSum = (d.selfUseQty ?? 0) + (d.subAllocs?.reduce((s, x) => s + x.qty, 0) ?? 0);
    return subSum === d.qty;
  });
  const allocValid = totalQty > 0 && allocSum <= totalQty && subAllocsValid;

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
      prev.map((d, i) =>
        i === index ? { ...d, userId, userName: u?.displayName || '', expanded: false, selfUseQty: undefined, subAllocs: undefined } : d
      )
    );
  }

  function removeDownline(index: number) {
    setDownlineAllocs((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleSubAlloc(index: number) {
    setDownlineAllocs((prev) =>
      prev.map((d, i) => {
        if (i !== index) return d;
        const next = !d.expanded;
        return {
          ...d,
          expanded: next,
          selfUseQty: next ? (d.selfUseQty ?? 0) : undefined,
          subAllocs: next ? (d.subAllocs ?? []) : undefined,
        };
      })
    );
  }

  function setDownlineSelfUse(index: number, qty: number) {
    setDownlineAllocs((prev) =>
      prev.map((d, i) => (i === index ? { ...d, selfUseQty: qty } : d))
    );
  }

  function addSubDownline(parentIndex: number) {
    const d = downlineAllocs[parentIndex];
    if (!d?.userId) return;
    const subDownlines = getDirectDownlines(d.userId);
    const first = subDownlines.find((u) => !d.subAllocs?.some((s) => s.userId === u.id));
    if (first) {
      setDownlineAllocs((prev) =>
        prev.map((p, i) =>
          i === parentIndex
            ? { ...p, subAllocs: [...(p.subAllocs ?? []), { userId: first.id!, userName: first.displayName || '', qty: 0 }] }
            : p
        )
      );
    }
  }

  function updateSubDownline(parentIndex: number, subIndex: number, qty: number) {
    setDownlineAllocs((prev) =>
      prev.map((p, i) =>
        i === parentIndex
          ? {
              ...p,
              subAllocs: (p.subAllocs ?? []).map((s, j) => (j === subIndex ? { ...s, qty } : s)),
            }
          : p
      )
    );
  }

  function setSubDownlineUser(parentIndex: number, subIndex: number, userId: string) {
    const u = allUsers.find((x) => x.id === userId);
    setDownlineAllocs((prev) =>
      prev.map((p, i) =>
        i === parentIndex
          ? {
              ...p,
              subAllocs: (p.subAllocs ?? []).map((s, j) => (j === subIndex ? { ...s, userId, userName: u?.displayName || '' } : s)),
            }
          : p
      )
    );
  }

  function removeSubDownline(parentIndex: number, subIndex: number) {
    setDownlineAllocs((prev) =>
      prev.map((p, i) =>
        i === parentIndex ? { ...p, subAllocs: (p.subAllocs ?? []).filter((_, j) => j !== subIndex) } : p
      )
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!fromUserId || !toUserId || !productId || totalQty <= 0) {
      setError('請填寫完整：賣方、買方、產品、總數量');
      return;
    }
    if (!allocValid) {
      if (!subAllocsValid) {
        setError('部分下線的多層分配總和與該列數量不符，請檢查「繼續分配」區塊');
        return;
      }
      if (allocSum > totalQty) {
        setError(`分配總和不可超過總數量：自用 ${selfUseQty} + 下線 ${downlineAllocs.reduce((s, d) => s + d.qty, 0)} = ${allocSum}，應 ≤ ${totalQty}`);
        return;
      }
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

      // 2b. 剩餘列為庫存待賣出
      const remainderQty = totalQty - allocSum;
      if (remainderQty > 0) {
        const stockOrderData = OrderService.buildSaleOrder({
          fromUserId: toUser.id!,
          fromUserName: toUser.displayName,
          toUserId: toUser.id!,
          toUserName: toUser.displayName,
          items: makeItem(remainderQty),
          paymentMethod: PaymentMethod.CASH,
          notes: '庫存待賣出',
          createdBy,
        });
        const stockOrder = await OrderService.create(stockOrderData, { createdAt: createdAt + 1.5 });
        await InventorySyncService.onSaleCompleted(toUser.id!, toUser.id!, makeItem(remainderQty), stockOrder.id!);
        await OrderService.updateStatus(stockOrder.id!, TransactionStatus.COMPLETED);
      }

      // 3. 下線訂單（含多層分配）
      let orderSeq = 2;
      for (const d of downlineAllocs) {
        if (d.qty <= 0) continue;
        const downUser = allUsers.find((u) => u.id === d.userId);
        if (!downUser) continue;

        // 3a. 買方 → 該下線（主訂單）
        const downOrderData = OrderService.buildSaleOrder({
          fromUserId: toUser.id!,
          fromUserName: toUser.displayName,
          toUserId: downUser.id!,
          toUserName: downUser.displayName,
          items: makeItem(d.qty),
          paymentMethod: PaymentMethod.CASH,
          notes: d.expanded && (d.subAllocs?.length || (d.selfUseQty ?? 0) > 0) ? `分配至 ${downUser.displayName}（含多層分配）` : `分配至 ${downUser.displayName}`,
          createdBy,
        });
        const downOrder = await OrderService.create(downOrderData, { createdAt: createdAt + orderSeq++ });
        await InventorySyncService.onSaleCompleted(toUser.id!, downUser.id!, makeItem(d.qty), downOrder.id!);
        await OrderService.updateStatus(downOrder.id!, 'COMPLETED' as any);

        // 3b. 若有多層分配：該下線 → 自用 / 該下線的下線
        if (d.expanded && (d.subAllocs?.length || (d.selfUseQty ?? 0) > 0)) {
          if ((d.selfUseQty ?? 0) > 0) {
            const selfOrderData = OrderService.buildSaleOrder({
              fromUserId: downUser.id!,
              fromUserName: downUser.displayName,
              toUserId: downUser.id!,
              toUserName: downUser.displayName,
              items: makeItem(d.selfUseQty!),
              paymentMethod: PaymentMethod.CASH,
              notes: '自用',
              createdBy,
            });
            const selfOrder = await OrderService.create(selfOrderData, { createdAt: createdAt + orderSeq++ });
            await InventorySyncService.onSaleCompleted(downUser.id!, downUser.id!, makeItem(d.selfUseQty!), selfOrder.id!);
            await OrderService.updateStatus(selfOrder.id!, TransactionStatus.COMPLETED);
          }
          for (const sub of d.subAllocs ?? []) {
            if (sub.qty <= 0) continue;
            const subUser = allUsers.find((u) => u.id === sub.userId);
            if (!subUser) continue;
            const subOrderData = OrderService.buildSaleOrder({
              fromUserId: downUser.id!,
              fromUserName: downUser.displayName,
              toUserId: subUser.id!,
              toUserName: subUser.displayName,
              items: makeItem(sub.qty),
              paymentMethod: PaymentMethod.CASH,
              notes: `分配至 ${subUser.displayName}`,
              createdBy,
            });
            const subOrder = await OrderService.create(subOrderData, { createdAt: createdAt + orderSeq++ });
            await InventorySyncService.onSaleCompleted(downUser.id!, subUser.id!, makeItem(sub.qty), subOrder.id!);
            await OrderService.updateStatus(subOrder.id!, TransactionStatus.COMPLETED);
          }
        }
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
                {remainder > 0 && allocValid && <span className="text-gray-400 ml-1">（剩餘 {remainder} 庫存待賣出）</span>}
              </span>
            </div>
            <p className="text-xs text-gray-500">
              自用 + 下線分配總和須 ≤ 總數量；若有剩餘將列為「庫存待賣出」。下線僅能選買方的直屬下線。若要分配至下線的下線（多層），請在該列點「繼續分配」。
            </p>

            <div className="flex items-center gap-2 flex-wrap">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">自用數量</label>
                <input
                  type="number"
                  min="0"
                  value={selfUseQty ?? ''}
                  onChange={(e) => setSelfUseQty(parseInt(e.target.value, 10) || 0)}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 max-w-[120px]"
                />
              </div>
              {totalQty > 0 && remainder > 0 && (
                <div className="mt-6 flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-gray-400">剩餘 {remainder} 將列為庫存待賣出</span>
                  <button
                    type="button"
                    onClick={() => setSelfUseQty((prev) => prev + remainder)}
                    className="px-3 py-1.5 text-sm bg-gray-600 hover:bg-gray-500 text-gray-200 rounded-lg"
                  >
                    改填入自用
                  </button>
                </div>
              )}
              {totalQty > 0 && allocSum > totalQty && (
                <span className="mt-6 text-sm text-amber-400">分配過多，請減少共 {allocSum - totalQty} 數量</span>
              )}
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
                {downlineAllocs.map((d, i) => {
                  const subDownlines = getDirectDownlines(d.userId);
                  const subSum = (d.selfUseQty ?? 0) + (d.subAllocs?.reduce((s, x) => s + x.qty, 0) ?? 0);
                  const subValid = !d.expanded || subSum === d.qty;
                  return (
                    <div key={i} className="border border-gray-600 rounded-lg p-3 space-y-2">
                      <div className="flex gap-2 items-center">
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
                          value={d.qty ?? ''}
                          onChange={(e) => updateDownline(i, parseInt(e.target.value, 10) || 0)}
                          className="w-20 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm"
                          placeholder="數量"
                        />
                        {subDownlines.length > 0 && d.qty > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleSubAlloc(i)}
                            className={`px-3 py-1 text-xs rounded-lg ${d.expanded ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300 hover:bg-gray-500'}`}
                          >
                            {d.expanded ? '收起' : '繼續分配'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeDownline(i)}
                          className="px-2 py-1 text-red-400 hover:bg-red-900/30 rounded"
                        >
                          ✕
                        </button>
                      </div>
                      {d.expanded && subDownlines.length > 0 && (
                        <div className="ml-4 pl-4 border-l-2 border-gray-600 space-y-2">
                          <p className="text-xs text-gray-500">
                            {d.userName} 的自用 + 下線分配 = {subSum} / {d.qty}
                            {!subValid && <span className="text-amber-400 ml-1">（需等於 {d.qty}）</span>}
                          </p>
                          <div>
                            <label className="block text-xs text-gray-400 mb-1">自用數量</label>
                            <input
                              type="number"
                              min="0"
                              value={d.selfUseQty ?? ''}
                              onChange={(e) => setDownlineSelfUse(i, parseInt(e.target.value, 10) || 0)}
                              className="w-20 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm"
                            />
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-1">
                              <label className="text-xs text-gray-400">分配至 {d.userName} 的下線</label>
                              <button
                                type="button"
                                onClick={() => addSubDownline(i)}
                                disabled={subDownlines.length === 0 || (d.subAllocs?.length ?? 0) >= subDownlines.length}
                                className="text-xs px-2 py-0.5 bg-gray-600 hover:bg-gray-500 text-gray-300 rounded disabled:opacity-50"
                              >
                                + 新增
                              </button>
                            </div>
                            <div className="space-y-1">
                              {(d.subAllocs ?? []).map((s, j) => (
                                <div key={j} className="flex gap-2 items-center">
                                  <select
                                    value={s.userId}
                                    onChange={(e) => setSubDownlineUser(i, j, e.target.value)}
                                    className="flex-1 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm"
                                  >
                                    {subDownlines.map((u) => (
                                      <option key={u.id} value={u.id}>
                                        {u.displayName}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    type="number"
                                    min="0"
                                    value={s.qty ?? ''}
                                    onChange={(e) => updateSubDownline(i, j, parseInt(e.target.value, 10) || 0)}
                                    className="w-16 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm"
                                    placeholder="數量"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeSubDownline(i, j)}
                                    className="px-1 py-0.5 text-red-400 hover:bg-red-900/30 rounded text-xs"
                                  >
                                    ✕
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
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
