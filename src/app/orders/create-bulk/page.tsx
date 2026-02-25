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

type MainItem = { date: string; poNumber: string; productId: string; productName: string; quantity: number; unitPrice: number };
type AllocItem = { date: string; poNumber: string; productId: string; productName: string; quantity: number; unitPrice: number };

type DownlineAlloc = {
  userId: string;
  userName: string;
  items: AllocItem[];
  expanded?: boolean;
  selfUseItems?: AllocItem[];
  subAllocs?: { userId: string; userName: string; items: AllocItem[] }[];
};

function toTxItem(item: AllocItem): TransactionItem {
  return {
    productId: item.productId,
    productName: item.productName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: item.quantity * item.unitPrice,
  };
}
function toTxItems(items: AllocItem[]): TransactionItem[] {
  return items.map(toTxItem);
}

function sumByProduct(items: AllocItem[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const i of items) {
    if (i.productId) m[i.productId] = (m[i.productId] ?? 0) + i.quantity;
  }
  return m;
}

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
  const [mainItems, setMainItems] = useState<MainItem[]>([{ date: new Date().toISOString().slice(0, 10), poNumber: '', productId: '', productName: '', quantity: 0, unitPrice: 0 }]);

  const [selfUseItems, setSelfUseItems] = useState<AllocItem[]>([]);

  const [downlineAllocs, setDownlineAllocs] = useState<DownlineAlloc[]>([]);
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
    setError('');
  }, [fromUserId, toUserId, mainItems, selfUseItems, downlineAllocs]);

  const directDownlines = toUserId
    ? allUsers.filter((u) => u.parentUserId === toUserId).sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''))
    : [];

  const getDirectDownlines = (userId: string) =>
    allUsers
      .filter((u) => u.parentUserId === userId)
      .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || ''));

  const mainQtyByProduct = sumByProduct(mainItems.filter((i) => i.productId && i.quantity > 0));
  const totalMainQty = Object.values(mainQtyByProduct).reduce((a, b) => a + b, 0);

  function getAllocQtyByProduct(): Record<string, number> {
    const m: Record<string, number> = {};
    for (const i of selfUseItems) {
      if (i.productId) m[i.productId] = (m[i.productId] ?? 0) + i.quantity;
    }
    for (const d of downlineAllocs) {
      for (const i of d.items) {
        if (i.productId) m[i.productId] = (m[i.productId] ?? 0) + i.quantity;
      }
      if (d.expanded) {
        for (const i of d.selfUseItems ?? []) {
          if (i.productId) m[i.productId] = (m[i.productId] ?? 0) + i.quantity;
        }
        for (const s of d.subAllocs ?? []) {
          for (const i of s.items) {
            if (i.productId) m[i.productId] = (m[i.productId] ?? 0) + i.quantity;
          }
        }
      }
    }
    return m;
  }

  const allocQtyByProduct = getAllocQtyByProduct();
  const allocValid = totalMainQty > 0 && Object.entries(mainQtyByProduct).every(([pid, qty]) => (allocQtyByProduct[pid] ?? 0) <= qty);
  const remainderByProduct: Record<string, number> = {};
  for (const [pid, qty] of Object.entries(mainQtyByProduct)) {
    remainderByProduct[pid] = qty - (allocQtyByProduct[pid] ?? 0);
  }
  const hasRemainder = Object.values(remainderByProduct).some((q) => q > 0);

  const subAllocsValid = downlineAllocs.every((d) => {
    if (!d.expanded || !d.items.length) return true;
    const dQty = sumByProduct(d.items);
    const subSum: Record<string, number> = {};
    for (const i of d.selfUseItems ?? []) {
      if (i.productId) subSum[i.productId] = (subSum[i.productId] ?? 0) + i.quantity;
    }
    for (const s of d.subAllocs ?? []) {
      for (const i of s.items) {
        if (i.productId) subSum[i.productId] = (subSum[i.productId] ?? 0) + i.quantity;
      }
    }
    return Object.entries(dQty).every(([pid, q]) => (subSum[pid] ?? 0) <= q);
  });

  const formValid = allocValid && subAllocsValid;

  function addMainItem() {
    setMainItems((prev) => [...prev, { date: new Date().toISOString().slice(0, 10), poNumber: '', productId: '', productName: '', quantity: 0, unitPrice: 0 }]);
  }
  function updateMainItem(index: number, field: keyof MainItem, value: string | number) {
    setMainItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        if (field === 'productId') {
          const product = products.find((p) => p.sku === value);
          return {
            ...item,
            productId: product?.sku || '',
            productName: product?.name || '',
            unitPrice: product?.unitPrice ?? 0,
          };
        }
        return { ...item, [field]: value };
      })
    );
  }
  function removeMainItem(index: number) {
    setMainItems((prev) => prev.filter((_, i) => i !== index));
  }

  function addAllocItem(setter: React.Dispatch<React.SetStateAction<AllocItem[]>>) {
    setter((prev) => [...prev, { date: new Date().toISOString().slice(0, 10), poNumber: '', productId: '', productName: '', quantity: 0, unitPrice: 0 }]);
  }
  function updateAllocItem(setter: React.Dispatch<React.SetStateAction<AllocItem[]>>, index: number, field: keyof AllocItem, value: string | number) {
    setter((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        if (field === 'productId') {
          const product = products.find((p) => p.sku === value);
          return {
            ...item,
            productId: product?.sku || '',
            productName: product?.name || '',
            unitPrice: product?.unitPrice ?? 0,
          };
        }
        return { ...item, [field]: value };
      })
    );
  }
  function removeAllocItem(setter: React.Dispatch<React.SetStateAction<AllocItem[]>>, index: number) {
    setter((prev) => prev.filter((_, i) => i !== index));
  }

  function addDownline() {
    const first = directDownlines.find((d) => !downlineAllocs.some((a) => a.userId === d.id));
    setDownlineAllocs((prev) => [
      ...prev,
      {
        userId: first?.id ?? '',
        userName: first?.displayName ?? '',
        items: [],
        date: new Date().toISOString().slice(0, 10),
        poNumber: '',
      },
    ]);
  }
  function updateDownlineItems(index: number, items: AllocItem[]) {
    setDownlineAllocs((prev) => prev.map((d, i) => (i === index ? { ...d, items } : d)));
  }
  function updateDownline(index: number, field: string, value: string | AllocItem[] | DownlineAlloc['subAllocs']) {
    setDownlineAllocs((prev) => prev.map((d, i) => (i === index ? { ...d, [field]: value } : d)));
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
          selfUseItems: next ? (d.selfUseItems ?? []) : undefined,
          subAllocs: next ? (d.subAllocs ?? []) : undefined,
        };
      })
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
            ? {
                ...p,
                subAllocs: [
                  ...(p.subAllocs ?? []),
                  { userId: first.id!, userName: first.displayName || '', items: [] },
                ],
              }
            : p
        )
      );
    }
  }

  function setRemainderToSelfUse() {
    const today = new Date().toISOString().slice(0, 10);
    const items: AllocItem[] = [];
    for (const [productId, qty] of Object.entries(remainderByProduct)) {
      if (qty > 0) {
        const p = products.find((x) => x.sku === productId);
        items.push({ date: today, poNumber: '', productId, productName: p?.name || '', quantity: qty, unitPrice: p?.unitPrice ?? 0 });
      }
    }
    setSelfUseItems((prev) => {
      const merged: Record<string, AllocItem> = {};
      for (const i of prev) {
        if (i.productId) merged[i.productId] = { ...i };
      }
      for (const i of items) {
        merged[i.productId] = { ...i, quantity: (merged[i.productId]?.quantity ?? 0) + i.quantity };
      }
      return Object.values(merged).filter((x) => x.quantity > 0);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!fromUserId || !toUserId) {
      setError('請填寫完整：賣方、買方');
      return;
    }
    const validMainItems = mainItems.filter((i) => i.productId && i.quantity > 0);
    if (validMainItems.length === 0) {
      setError('請至少新增一筆主訂單品項（日期、發貨號碼、產品、數量）');
      return;
    }
    if (!formValid) {
      setError('請檢查分配數量與多層分配');
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

    setSaving(true);
    try {
      const createdBy = user?.id ?? firebaseUser?.uid ?? '';
      let orderSeq = 0;
      const baseCreatedAt = Date.now();

      // 主訂單：每列（日期+發貨號碼+產品）建立一筆訂單
      for (const row of validMainItems) {
        const txItem = toTxItem(row);
        const rowCreatedAt = row.date ? new Date(row.date).setHours(0, 0, 0, 0) : baseCreatedAt + orderSeq;
        const mainOrderData = { ...OrderService.buildSaleOrder({
          fromUserId: fromUser.id!,
          fromUserName: fromUser.displayName,
          toUserId: toUser.id!,
          toUserName: toUser.displayName,
          items: [txItem],
          paymentMethod: PaymentMethod.CASH,
          notes: '批量進貨（含分配）',
          createdBy,
        }), poNumber: row.poNumber.trim() || undefined };
        const mainOrder = await OrderService.create(mainOrderData, { createdAt: rowCreatedAt });
        await InventorySyncService.onSaleCompleted(fromUser.id!, toUser.id!, [txItem], mainOrder.id!);
        await OrderService.updateStatus(mainOrder.id!, TransactionStatus.COMPLETED);
        orderSeq++;
      }

      // 自用：每列（日期+發貨號碼+產品）建立一筆訂單
      const validSelfItems = selfUseItems.filter((i) => i.productId && i.quantity > 0);
      for (const row of validSelfItems) {
        const txItem = toTxItem(row);
        const rowCreatedAt = row.date ? new Date(row.date).setHours(0, 0, 0, 0) : baseCreatedAt + orderSeq;
        const selfOrderData = { ...OrderService.buildSaleOrder({
          fromUserId: toUser.id!,
          fromUserName: toUser.displayName,
          toUserId: toUser.id!,
          toUserName: toUser.displayName,
          items: [txItem],
          paymentMethod: PaymentMethod.CASH,
          notes: '自用',
          createdBy,
        }), poNumber: row.poNumber.trim() || undefined };
        const selfOrder = await OrderService.create(selfOrderData, { createdAt: rowCreatedAt });
        await InventorySyncService.onSaleCompleted(toUser.id!, toUser.id!, [txItem], selfOrder.id!);
        await OrderService.updateStatus(selfOrder.id!, TransactionStatus.COMPLETED);
        orderSeq++;
      }

      // 剩餘庫存待賣出
      const today = new Date().toISOString().slice(0, 10);
      const remainderItems: AllocItem[] = [];
      for (const [productId, qty] of Object.entries(remainderByProduct)) {
        if (qty > 0) {
          const p = products.find((x) => x.sku === productId);
          remainderItems.push({ date: today, poNumber: '', productId, productName: p?.name || '', quantity: qty, unitPrice: p?.unitPrice ?? 0 });
        }
      }
      if (remainderItems.length > 0) {
        const stockTxItems = toTxItems(remainderItems);
        const stockOrderData = OrderService.buildSaleOrder({
          fromUserId: toUser.id!,
          fromUserName: toUser.displayName,
          toUserId: toUser.id!,
          toUserName: toUser.displayName,
          items: stockTxItems,
          paymentMethod: PaymentMethod.CASH,
          notes: '庫存待賣出',
          createdBy,
        });
        const stockOrder = await OrderService.create(stockOrderData, { createdAt: baseCreatedAt + orderSeq++ });
        await InventorySyncService.onSaleCompleted(toUser.id!, toUser.id!, stockTxItems, stockOrder.id!);
        await OrderService.updateStatus(stockOrder.id!, TransactionStatus.COMPLETED);
      }

      // 下線：每筆品項（日期+發貨號碼+產品）建立一筆訂單
      for (const d of downlineAllocs) {
        if (!d.userId) continue;
        const downUser = allUsers.find((u) => u.id === d.userId);
        if (!downUser) continue;

        for (const row of d.items.filter((i) => i.productId && i.quantity > 0)) {
          const txItem = toTxItem(row);
          const rowCreatedAt = row.date ? new Date(row.date).setHours(0, 0, 0, 0) : baseCreatedAt + orderSeq;
          const downOrderData = { ...OrderService.buildSaleOrder({
            fromUserId: toUser.id!,
            fromUserName: toUser.displayName,
            toUserId: downUser.id!,
            toUserName: downUser.displayName,
            items: [txItem],
            paymentMethod: PaymentMethod.CASH,
            notes: `分配至 ${downUser.displayName}`,
            createdBy,
          }), poNumber: row.poNumber.trim() || undefined };
          const downOrder = await OrderService.create(downOrderData, { createdAt: rowCreatedAt });
          await InventorySyncService.onSaleCompleted(toUser.id!, downUser.id!, [txItem], downOrder.id!);
          await OrderService.updateStatus(downOrder.id!, TransactionStatus.COMPLETED);
          orderSeq++;
        }

        if (d.expanded) {
          for (const row of (d.selfUseItems ?? []).filter((i) => i.productId && i.quantity > 0)) {
            const txItem = toTxItem(row);
            const rowCreatedAt = row.date ? new Date(row.date).setHours(0, 0, 0, 0) : baseCreatedAt + orderSeq;
            const selfOrderData = { ...OrderService.buildSaleOrder({
              fromUserId: downUser.id!,
              fromUserName: downUser.displayName,
              toUserId: downUser.id!,
              toUserName: downUser.displayName,
              items: [txItem],
              paymentMethod: PaymentMethod.CASH,
              notes: '自用',
              createdBy,
            }), poNumber: row.poNumber.trim() || undefined };
            const selfOrder = await OrderService.create(selfOrderData, { createdAt: rowCreatedAt });
            await InventorySyncService.onSaleCompleted(downUser.id!, downUser.id!, [txItem], selfOrder.id!);
            await OrderService.updateStatus(selfOrder.id!, TransactionStatus.COMPLETED);
            orderSeq++;
          }
          for (const sub of d.subAllocs ?? []) {
            if (!sub.userId) continue;
            const subUser = allUsers.find((u) => u.id === sub.userId);
            if (!subUser) continue;
            for (const row of sub.items.filter((i) => i.productId && i.quantity > 0)) {
              const txItem = toTxItem(row);
              const rowCreatedAt = row.date ? new Date(row.date).setHours(0, 0, 0, 0) : baseCreatedAt + orderSeq;
              const subOrderData = { ...OrderService.buildSaleOrder({
                fromUserId: downUser.id!,
                fromUserName: downUser.displayName,
                toUserId: subUser.id!,
                toUserName: subUser.displayName,
                items: [txItem],
                paymentMethod: PaymentMethod.CASH,
                notes: `分配至 ${subUser.displayName}`,
                createdBy,
              }), poNumber: row.poNumber.trim() || undefined };
              const subOrder = await OrderService.create(subOrderData, { createdAt: rowCreatedAt });
              await InventorySyncService.onSaleCompleted(downUser.id!, subUser.id!, [txItem], subOrder.id!);
              await OrderService.updateStatus(subOrder.id!, TransactionStatus.COMPLETED);
              orderSeq++;
            }
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
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/orders" className="text-gray-400 hover:text-gray-200 text-sm">&larr; 返回訂單</Link>
          <Link href="/orders/create" className="text-gray-400 hover:text-gray-200 text-sm">一般建立訂單</Link>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-gray-100">批量進貨與分配</h1>
          <p className="text-gray-400 mt-1">
            一次輸入多品項總數，分配時可為自用、下線、下線的下線各自選擇日期、產品、數量、發貨號碼
          </p>
        </div>

        {error && <div className="msg-error px-4 py-3 rounded-lg">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 主訂單 */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-200">主訂單</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">賣方</label>
                <select value={fromUserId} onChange={(e) => setFromUserId(e.target.value)} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100" disabled={role === UserRole.STOCKIST}>
                  <option value="">請選擇...</option>
                  {sortByNameEnglishFirst([...admins, ...stockists]).map((s) => (
                    <option key={s.id} value={s.id}>{s.displayName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">買方（接收貨人）</label>
                <select value={toUserId} onChange={(e) => { setToUserId(e.target.value); setDownlineAllocs([]); }} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100">
                  <option value="">請選擇...</option>
                  {sortByNameEnglishFirst(buyerOptions).map((u) => (
                    <option key={u.id} value={u.id}>{u.displayName}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-300">品項（每列：日期 + 發貨號碼 + 產品 + 數量）</label>
                <button type="button" onClick={addMainItem} className="px-4 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg">+ 新增品項</button>
              </div>
              <div className="space-y-2">
                {mainItems.map((item, i) => (
                  <div key={i} className="flex gap-2 items-center flex-wrap">
                    <input type="date" value={item.date} onChange={(e) => updateMainItem(i, 'date', e.target.value)} className="px-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm" />
                    <input type="text" value={item.poNumber} onChange={(e) => updateMainItem(i, 'poNumber', e.target.value)} placeholder="發貨號碼" className="w-24 px-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm" />
                    <select value={item.productId} onChange={(e) => updateMainItem(i, 'productId', e.target.value)} className="flex-1 min-w-[140px] px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm">
                      <option value="">請選擇產品...</option>
                      {products.map((p) => (
                        <option key={p.sku} value={p.sku}>{p.name} (USD {p.unitPrice})</option>
                      ))}
                    </select>
                    <input type="number" min="0" value={item.quantity ?? ''} onChange={(e) => updateMainItem(i, 'quantity', parseInt(e.target.value, 10) || 0)} className="w-20 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm" placeholder="數量" />
                    <button type="button" onClick={() => removeMainItem(i)} className="px-2 py-1 text-red-400 hover:bg-red-900/30 rounded">✕</button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">總數量：{totalMainQty}</p>
            </div>
          </div>

          {/* 分配 */}
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-200">分配（自用 + 下線）</h2>
            <p className="text-xs text-gray-500">
              自用 + 下線分配總和須 ≤ 各品項數量；若有剩餘將列為「庫存待賣出」。每筆分配可選日期、產品、數量、發貨號碼。
            </p>

            {/* 自用：每列 = 日期 + 發貨號碼 + 產品 + 數量 */}
            <div className="border border-gray-600 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-200">自用</span>
                <button type="button" onClick={() => addAllocItem(setSelfUseItems)} className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-gray-300 rounded">+ 品項</button>
              </div>
              <div className="space-y-2">
                {selfUseItems.map((item, i) => (
                  <div key={i} className="flex gap-2 items-center flex-wrap">
                    <input type="date" value={item.date} onChange={(e) => updateAllocItem(setSelfUseItems, i, 'date', e.target.value)} className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm" />
                    <input type="text" value={item.poNumber} onChange={(e) => updateAllocItem(setSelfUseItems, i, 'poNumber', e.target.value)} placeholder="發貨號碼" className="w-24 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm" />
                    <select value={item.productId} onChange={(e) => updateAllocItem(setSelfUseItems, i, 'productId', e.target.value)} className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm" style={{ minWidth: 120 }}>
                      <option value="">產品...</option>
                      {products.map((p) => (
                        <option key={p.sku} value={p.sku}>{p.name}</option>
                      ))}
                    </select>
                    <input type="number" min="0" value={item.quantity ?? ''} onChange={(e) => updateAllocItem(setSelfUseItems, i, 'quantity', parseInt(e.target.value, 10) || 0)} className="w-14 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm" />
                    <button type="button" onClick={() => removeAllocItem(setSelfUseItems, i)} className="px-1 text-red-400">✕</button>
                  </div>
                ))}
              </div>
            </div>

            {hasRemainder && formValid && (
              <button type="button" onClick={setRemainderToSelfUse} className="px-3 py-1.5 text-sm bg-amber-600/80 hover:bg-amber-600 text-white rounded-lg">
                將剩餘全部填入自用
              </button>
            )}

            {/* 下線 */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-gray-300">下線分配</label>
                <button type="button" onClick={addDownline} disabled={!toUserId || (directDownlines.length > 0 && downlineAllocs.length >= directDownlines.length)} className="px-4 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg disabled:opacity-50">+ 新增下線</button>
              </div>
              <div className="space-y-2">
                {downlineAllocs.map((d, i) => (
                  <div key={i} className="border border-gray-600 rounded-lg p-3 space-y-2">
                    <div className="flex gap-2 items-center flex-wrap">
                      <select
                        value={d.userId}
                        onChange={(e) => {
                          const u = allUsers.find((x) => x.id === e.target.value);
                          setDownlineAllocs((prev) => prev.map((p, idx) => (idx === i ? { ...p, userId: e.target.value, userName: u?.displayName || '' } : p)));
                        }}
                        className="flex-1 min-w-[120px] px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm"
                      >
                        <option value="">{directDownlines.length === 0 ? '（請先選擇買方，買方須有直屬下線）' : '請選擇下線...'}</option>
                        {directDownlines.map((u) => (
                          <option key={u.id} value={u.id}>{u.displayName}</option>
                        ))}
                      </select>
                      {getDirectDownlines(d.userId).length > 0 && (
                        <button type="button" onClick={() => toggleSubAlloc(i)} className={`px-3 py-1 text-xs rounded-lg ${d.expanded ? 'bg-blue-600 text-white' : 'bg-gray-600 text-gray-300'}`}>
                          {d.expanded ? '收起' : '繼續分配'}
                        </button>
                      )}
                      <button type="button" onClick={() => removeDownline(i)} className="px-2 py-1 text-red-400 hover:bg-red-900/30 rounded">✕</button>
                    </div>
                    <div className="space-y-2">
                      <button type="button" onClick={() => updateDownlineItems(i, [...d.items, { date: new Date().toISOString().slice(0, 10), poNumber: '', productId: '', productName: '', quantity: 0, unitPrice: 0 }])} className="px-2 py-1 text-xs bg-gray-600 hover:bg-gray-500 text-gray-300 rounded">+ 品項（日期+發貨號碼+產品）</button>
                      {d.items.map((item, j) => (
                        <div key={j} className="flex gap-2 items-center flex-wrap">
                          <input type="date" value={item.date} onChange={(e) => { const next = [...d.items]; next[j] = { ...next[j], date: e.target.value }; updateDownlineItems(i, next); }} className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm" />
                          <input type="text" value={item.poNumber} onChange={(e) => { const next = [...d.items]; next[j] = { ...next[j], poNumber: e.target.value }; updateDownlineItems(i, next); }} placeholder="發貨號碼" className="w-20 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm" />
                          <select value={item.productId} onChange={(e) => { const p = products.find((x) => x.sku === e.target.value); const next = [...d.items]; next[j] = { ...next[j], productId: p?.sku || '', productName: p?.name || '', unitPrice: p?.unitPrice ?? 0 }; updateDownlineItems(i, next); }} className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm" style={{ minWidth: 100 }}>
                            <option value="">產品...</option>
                            {products.map((p) => (
                              <option key={p.sku} value={p.sku}>{p.name}</option>
                            ))}
                          </select>
                          <input type="number" min="0" value={item.quantity ?? ''} onChange={(e) => { const next = [...d.items]; next[j] = { ...next[j], quantity: parseInt(e.target.value, 10) || 0 }; updateDownlineItems(i, next); }} className="w-14 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm" />
                          <button type="button" onClick={() => updateDownlineItems(i, d.items.filter((_, k) => k !== j))} className="px-1 text-red-400">✕</button>
                        </div>
                      ))}
                    </div>
                    {d.expanded && (
                      <div className="ml-4 pl-4 border-l-2 border-gray-600 space-y-2">
                        <div>
                          <span className="text-xs text-gray-400">{d.userName} 自用（每列：日期+發貨號碼+產品）</span>
                          <div className="flex gap-2 items-center flex-wrap mt-1">
                            <button type="button" onClick={() => updateDownline(i, 'selfUseItems', [...(d.selfUseItems ?? []), { date: new Date().toISOString().slice(0, 10), poNumber: '', productId: '', productName: '', quantity: 0, unitPrice: 0 }])} className="px-2 py-0.5 text-xs bg-gray-600 text-gray-300 rounded">+ 品項</button>
                            {(d.selfUseItems ?? []).map((item, j) => (
                              <div key={j} className="flex gap-1 items-center flex-wrap">
                                <input type="date" value={item.date} onChange={(e) => { const next = [...(d.selfUseItems ?? [])]; next[j] = { ...next[j], date: e.target.value }; updateDownline(i, 'selfUseItems', next); }} className="px-2 py-0.5 bg-gray-700 border border-gray-600 rounded text-gray-100 text-xs" />
                                <input type="text" value={item.poNumber} onChange={(e) => { const next = [...(d.selfUseItems ?? [])]; next[j] = { ...next[j], poNumber: e.target.value }; updateDownline(i, 'selfUseItems', next); }} placeholder="發貨號" className="w-16 px-1 py-0.5 bg-gray-700 border border-gray-600 rounded text-gray-100 text-xs" />
                                <select value={item.productId} onChange={(e) => { const p = products.find((x) => x.sku === e.target.value); const next = [...(d.selfUseItems ?? [])]; next[j] = { ...next[j], productId: p?.sku || '', productName: p?.name || '', unitPrice: p?.unitPrice ?? 0 }; updateDownline(i, 'selfUseItems', next); }} className="px-2 py-0.5 bg-gray-700 border border-gray-600 rounded text-gray-100 text-xs" style={{ minWidth: 80 }}>
                                  <option value="">產品</option>
                                  {products.map((p) => (
                                    <option key={p.sku} value={p.sku}>{p.name}</option>
                                  ))}
                                </select>
                                <input type="number" min="0" value={item.quantity ?? ''} onChange={(e) => { const next = [...(d.selfUseItems ?? [])]; next[j] = { ...next[j], quantity: parseInt(e.target.value, 10) || 0 }; updateDownline(i, 'selfUseItems', next); }} className="w-12 px-1 py-0.5 bg-gray-700 border border-gray-600 rounded text-gray-100 text-xs" />
                                <button type="button" onClick={() => updateDownline(i, 'selfUseItems', (d.selfUseItems ?? []).filter((_, k) => k !== j))} className="px-1 text-red-400 text-xs">✕</button>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-gray-400">分配至 {d.userName} 的下線</span>
                            <button type="button" onClick={() => addSubDownline(i)} disabled={(d.subAllocs?.length ?? 0) >= getDirectDownlines(d.userId).length} className="text-xs px-2 py-0.5 bg-gray-600 hover:bg-gray-500 text-gray-300 rounded disabled:opacity-50">+ 新增</button>
                          </div>
                          {(d.subAllocs ?? []).map((s, j) => (
                            <div key={j} className="flex gap-2 items-start flex-wrap mb-2 p-2 bg-gray-700/50 rounded">
                              <select value={s.userId} onChange={(e) => { const u = allUsers.find((x) => x.id === e.target.value); const next = [...(d.subAllocs ?? [])]; next[j] = { ...next[j], userId: e.target.value, userName: u?.displayName || '' }; updateDownline(i, 'subAllocs', next); }} className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-gray-100 text-sm" style={{ minWidth: 100 }}>
                                {getDirectDownlines(d.userId).map((u) => (
                                  <option key={u.id} value={u.id}>{u.displayName}</option>
                                ))}
                              </select>
                              <button type="button" onClick={() => updateDownline(i, 'subAllocs', (d.subAllocs ?? []).filter((_, k) => k !== j))} className="px-1 text-red-400 text-xs">✕</button>
                              <div className="flex flex-col gap-1 w-full">
                                <button type="button" onClick={() => { const next = [...(d.subAllocs ?? [])]; next[j] = { ...next[j], items: [...next[j].items, { date: new Date().toISOString().slice(0, 10), poNumber: '', productId: '', productName: '', quantity: 0, unitPrice: 0 }] }; updateDownline(i, 'subAllocs', next); }} className="text-left px-2 py-0.5 text-xs bg-gray-600 text-gray-300 rounded w-fit">+ 品項（日期+發貨號碼+產品）</button>
                                {s.items.map((item, k) => (
                                  <div key={k} className="flex gap-1 items-center flex-wrap">
                                    <input type="date" value={item.date} onChange={(e) => { const next = [...(d.subAllocs ?? [])]; next[j].items[k] = { ...next[j].items[k], date: e.target.value }; updateDownline(i, 'subAllocs', next); }} className="px-2 py-0.5 bg-gray-700 border border-gray-600 rounded text-gray-100 text-xs" />
                                    <input type="text" value={item.poNumber} onChange={(e) => { const next = [...(d.subAllocs ?? [])]; next[j].items[k] = { ...next[j].items[k], poNumber: e.target.value }; updateDownline(i, 'subAllocs', next); }} placeholder="發貨號" className="w-16 px-1 py-0.5 bg-gray-700 border border-gray-600 rounded text-gray-100 text-xs" />
                                    <select value={item.productId} onChange={(e) => { const p = products.find((x) => x.sku === e.target.value); const next = [...(d.subAllocs ?? [])]; next[j].items[k] = { ...next[j].items[k], productId: p?.sku || '', productName: p?.name || '', unitPrice: p?.unitPrice ?? 0 }; updateDownline(i, 'subAllocs', next); }} className="px-2 py-0.5 bg-gray-700 border border-gray-600 rounded text-gray-100 text-xs" style={{ minWidth: 80 }}>
                                      <option value="">產品</option>
                                      {products.map((p) => (
                                        <option key={p.sku} value={p.sku}>{p.name}</option>
                                      ))}
                                    </select>
                                    <input type="number" min="0" value={item.quantity ?? ''} onChange={(e) => { const next = [...(d.subAllocs ?? [])]; next[j].items[k] = { ...next[j].items[k], quantity: parseInt(e.target.value, 10) || 0 }; updateDownline(i, 'subAllocs', next); }} className="w-12 px-1 py-0.5 bg-gray-700 border border-gray-600 rounded text-gray-100 text-xs" />
                                    <button type="button" onClick={() => { const next = [...(d.subAllocs ?? [])]; next[j].items = next[j].items.filter((_, kk) => kk !== k); updateDownline(i, 'subAllocs', next); }} className="px-1 text-red-400 text-xs">✕</button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={saving || !formValid} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium">
              {saving ? '建立中...' : '建立並完成分配'}
            </button>
            <Link href="/orders" className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg font-medium">取消</Link>
          </div>
        </form>
      </div>
    </ProtectedRoute>
  );
}
