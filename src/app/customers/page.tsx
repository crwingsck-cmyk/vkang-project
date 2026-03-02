'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { DeliveryNoteService } from '@/services/database/deliveryNotes';
import { OrderService } from '@/services/database/orders';
import { InventoryService } from '@/services/database/inventory';
import { User, UserRole, TransactionType, TransactionStatus, DeliveryNoteStatus } from '@/types/models';
import Link from 'next/link';

const CUSTOMER_COLORS = [
  'bg-sky-50 border-sky-200/60 hover:bg-sky-100/80',
  'bg-blue-50 border-blue-200/60 hover:bg-blue-100/80',
  'bg-cyan-50 border-cyan-200/60 hover:bg-cyan-100/80',
];

const STOCKIST_COLORS = [
  'bg-amber-50 border-amber-200/60 hover:bg-amber-100/80',
  'bg-orange-50 border-orange-200/60 hover:bg-orange-100/80',
  'bg-yellow-50 border-yellow-200/60 hover:bg-yellow-100/80',
];

const ADMIN_COLORS = [
  'bg-emerald-50 border-emerald-200/60 hover:bg-emerald-100/80',
  'bg-violet-50 border-violet-200/60 hover:bg-violet-100/80',
];

function UserCard({
  user,
  buyQty,
  cardClass,
  badge,
}: {
  user: User;
  buyQty: number;
  cardClass: string;
  badge?: string;
}) {
  const isCustomer = user.role === UserRole.CUSTOMER;
  const qtyLabel = isCustomer ? '購買數量' : '持有數量';

  return (
    <Link
      href={`/customers/${user.id}`}
      className={`block p-5 rounded-xl border ${cardClass} hover:border-accent/40 transition-all shadow-sm relative`}
    >
      {badge && (
        <span className="absolute top-3 right-10 text-[10px] font-medium text-txt-subtle bg-surface-2 px-1.5 py-0.5 rounded">
          {badge}
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-txt-primary name-lowercase truncate">{user.displayName}</h2>
          <p className="text-xs text-txt-subtle mt-0.5 truncate">{user.email}</p>
          {user.company?.name && (
            <p className="text-xs text-txt-subtle mt-0.5 truncate">{user.company.name}</p>
          )}
        </div>
        <span className="text-accent-text text-xs shrink-0">查看 →</span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-chip-dark py-2">
          <p className="text-xs text-gray-300">{qtyLabel}</p>
          <p className="text-lg font-bold text-white tabular-nums">{buyQty}</p>
        </div>
        <div className="rounded-lg bg-chip-dark py-2">
          <p className="text-xs text-gray-300">財務明細</p>
          <p className="text-sm font-semibold text-accent-text">→</p>
        </div>
      </div>
    </Link>
  );
}

function UserSection({
  title,
  users,
  buyQtyMap,
  colors,
  badge,
}: {
  title: string;
  users: User[];
  buyQtyMap: Record<string, number>;
  colors: string[];
  badge?: string;
}) {
  if (users.length === 0) return null;
  return (
    <section>
      <h2 className="text-sm font-semibold text-txt-subtle uppercase tracking-widest mb-3">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {users.map((u, idx) => (
          <UserCard
            key={u.id}
            user={u}
            buyQty={buyQtyMap[u.id!] ?? 0}
            cardClass={colors[idx % colors.length]}
            badge={badge}
          />
        ))}
      </div>
    </section>
  );
}

export default function CustomersPage() {
  const { role } = useAuth();
  const [customers, setCustomers] = useState<User[]>([]);
  const [stockists, setStockists] = useState<User[]>([]);
  const [admins, setAdmins] = useState<User[]>([]);
  const [buyQtyMap, setBuyQtyMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role !== UserRole.ADMIN) return;
    load();
  }, [role]);

  async function load() {
    setLoading(true);
    try {
      const [customerList, stockistList, adminList, allDNs, allSaleTxns, allTransferTxns, allInventory] = await Promise.all([
        UserService.getByRole(UserRole.CUSTOMER),
        UserService.getStockists(),
        UserService.getAdmins(),
        DeliveryNoteService.getAll(500).catch(() => [] as Awaited<ReturnType<typeof DeliveryNoteService.getAll>>),
        OrderService.getByType(TransactionType.SALE, 1000).catch(() => []),
        OrderService.getByType(TransactionType.TRANSFER, 1000).catch(() => []),
        InventoryService.getAll(1000).catch(() => []),
      ]);

      setCustomers(customerList);
      setStockists(stockistList);
      setAdmins(adminList);

      const customerIds = new Set(customerList.map((u) => u.id!));
      const nonCustomerIds = new Set([...stockistList, ...adminList].map((u) => u.id!));
      const bqMap: Record<string, number> = {};

      // 調撥交易已建立 DN 的 transfer ID 集合（避免重複計算）
      const transferIdsWithDN = new Set(
        allDNs
          .filter((dn) => dn.status !== DeliveryNoteStatus.CANCELLED && dn.salesOrderId)
          .map((dn) => dn.salesOrderId)
      );

      // 顧客：購買數量來自發貨單（非取消）+ 已完成的銷售/調撥交易
      for (const dn of allDNs) {
        if (!dn.toUserId || !customerIds.has(dn.toUserId)) continue;
        if (dn.status === DeliveryNoteStatus.CANCELLED) continue;
        const qty = (dn.items ?? []).reduce((s, i) => s + (i.quantity ?? 0), 0);
        bqMap[dn.toUserId] = (bqMap[dn.toUserId] ?? 0) + qty;
      }
      for (const txn of [...allSaleTxns, ...allTransferTxns]) {
        const uid = txn.toUser?.userId;
        if (!uid || !customerIds.has(uid)) continue;
        if (txn.status !== TransactionStatus.COMPLETED) continue;
        // 若此交易已建立對應 DN，跳過（避免重複計算）
        if (txn.id && transferIdsWithDN.has(txn.id)) continue;
        const qty = (txn.items ?? []).reduce((s, i) => s + (i.quantity ?? 0), 0);
        bqMap[uid] = (bqMap[uid] ?? 0) + qty;
      }

      // 經銷商 / 總經銷商：自用數量來自庫存表（當前持有量）
      for (const inv of allInventory) {
        if (!inv.userId || !nonCustomerIds.has(inv.userId)) continue;
        const qty = inv.quantityOnHand ?? 0;
        bqMap[inv.userId] = (bqMap[inv.userId] ?? 0) + qty;
      }

      setBuyQtyMap(bqMap);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (role !== UserRole.ADMIN) return null;

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold text-txt-primary tracking-tight">用戶購買總覽</h1>
          <p className="text-sm text-txt-subtle mt-0.5">顧客購買數量來自已完成發貨單；經銷商持有數量來自庫存表</p>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3" />
            <p className="text-txt-subtle text-sm">載入中...</p>
          </div>
        ) : (
          <div className="space-y-6">
            <UserSection title="顧客" users={customers} buyQtyMap={buyQtyMap} colors={CUSTOMER_COLORS} />
            <UserSection title="經銷商" users={stockists} buyQtyMap={buyQtyMap} colors={STOCKIST_COLORS} />
            <UserSection title="總經銷商" users={admins} buyQtyMap={buyQtyMap} colors={ADMIN_COLORS} badge="總經銷商" />
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
