'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PurchaseOrderService } from '@/services/database/purchaseOrders';
import { UserService } from '@/services/database/users';
import { PurchaseOrder, PurchaseOrderStatus, UserRole } from '@/types/models';
import Link from 'next/link';

const statusLabels: Record<PurchaseOrderStatus, string> = {
  [PurchaseOrderStatus.DRAFT]: '草稿',
  [PurchaseOrderStatus.SUBMITTED]: '已提交',
  [PurchaseOrderStatus.PARTIAL]: '部分收貨',
  [PurchaseOrderStatus.RECEIVED]: '已收貨',
  [PurchaseOrderStatus.CANCELLED]: '已取消',
};

const statusColors: Record<PurchaseOrderStatus, string> = {
  [PurchaseOrderStatus.DRAFT]: 'bg-gray-700 text-gray-300',
  [PurchaseOrderStatus.SUBMITTED]: 'bg-amber-800/50 text-amber-200',
  [PurchaseOrderStatus.PARTIAL]: 'bg-blue-800/50 text-blue-200',
  [PurchaseOrderStatus.RECEIVED]: 'bg-green-800/50 text-green-200',
  [PurchaseOrderStatus.CANCELLED]: 'bg-red-900/30 text-red-300',
};

export default function PurchaseOrdersPage() {
  const { user, role } = useAuth();
  const [orders, setOrders] = useState<(PurchaseOrder & { id: string })[]>([]);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<PurchaseOrderStatus | ''>('');

  useEffect(() => {
    loadOrders();
  }, [user?.id, role, filterStatus]);

  async function loadOrders() {
    if (!user?.id) return;
    setLoading(true);
    try {
      let data: (PurchaseOrder & { id: string })[];
      if (role === UserRole.ADMIN) {
        data = await PurchaseOrderService.getAll(undefined, 100);
      } else {
        data = await PurchaseOrderService.getByUser(user.id, undefined, 100);
      }
      if (filterStatus) {
        data = data.filter((o) => o.status === filterStatus);
      }
      setOrders(data);
      const ids = new Set<string>();
      for (const o of data) {
        if (o.userId) ids.add(o.userId);
        if (o.fromUserId) ids.add(o.fromUserId);
      }
      const names: Record<string, string> = {};
      for (const id of ids) {
        const u = await UserService.getById(id);
        names[id] = u?.displayName ?? id;
      }
      setUserNames(names);
    } catch (err) {
      console.error('Load purchase orders error:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-txt-primary tracking-tight">Purchase Orders</h1>
            <p className="text-sm text-txt-subtle mt-0.5">進貨單管理</p>
          </div>
          <Link
            href="/purchase-orders/create"
            className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg"
          >
            建立進貨單
          </Link>
        </div>

        <div className="flex gap-2">
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as PurchaseOrderStatus | '')}
            className="px-3 py-1.5 bg-surface-1 border border-border rounded-lg text-xs"
          >
            <option value="">全部狀態</option>
            {Object.entries(statusLabels).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>

        <div className="glass-panel overflow-hidden">
          {loading ? (
            <div className="p-10 text-center text-txt-subtle text-sm">載入中...</div>
          ) : orders.length === 0 ? (
            <div className="p-14 text-center">
              <p className="text-txt-subtle text-sm">尚無進貨單</p>
              <Link href="/purchase-orders/create" className="text-accent-text hover:underline text-sm mt-2 inline-block">
                建立第一筆進貨單
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-2 border-b border-border">
                <tr>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold text-txt-subtle uppercase">進貨單號</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold text-txt-subtle uppercase">收貨人</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold text-txt-subtle uppercase">供應商/來源</th>
                  <th className="px-5 py-3 text-right text-[10px] font-semibold text-txt-subtle uppercase">金額</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold text-txt-subtle uppercase">狀態</th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold text-txt-subtle uppercase">日期</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {orders.map((po) => (
                  <tr key={po.id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-5 py-3">
                      <Link href={`/purchase-orders/${po.id}`} className="text-accent-text hover:underline font-mono">
                        {po.poNumber}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-txt-secondary">{userNames[po.userId] ?? po.userId}</td>
                    <td className="px-5 py-3 text-txt-secondary">
                      {po.fromUserId ? userNames[po.fromUserId] ?? '總經銷商' : po.supplierName ?? '外部供應商'}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium">
                      USD {po.totals?.grandTotal?.toFixed(2) ?? '0.00'}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusColors[po.status] ?? 'bg-surface-2'}`}>
                        {statusLabels[po.status] ?? po.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-txt-subtle text-xs">
                      {po.createdAt ? new Date(po.createdAt).toLocaleDateString('zh-TW') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
