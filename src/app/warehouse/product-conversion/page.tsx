'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { InventoryService } from '@/services/database/inventory';
import { ProductService } from '@/services/database/products';
import { ProductConversionService } from '@/services/database/productConversion';
import { UserService } from '@/services/database/users';
import { useToast } from '@/context/ToastContext';
import { UserRole, Inventory, Product, Transaction, User } from '@/types/models';
import Link from 'next/link';

interface TargetRow {
  productId: string;
  productName: string;
  quantity: number;
}

export default function ProductConversionPage() {
  const { user, role } = useAuth();
  const toast = useToast();

  // Data
  const [admins, setAdmins] = useState<User[]>([]);
  const [stockists, setStockists] = useState<User[]>([]);
  const [userInventory, setUserInventory] = useState<(Inventory & { id: string })[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [history, setHistory] = useState<(Transaction & { id: string })[]>([]);
  const [loading, setLoading] = useState(true);

  // 归属仓库（决定对谁的库存操作）
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [selectedOwnerName, setSelectedOwnerName] = useState('');

  // Form state
  const [upstreamOrderNo, setUpstreamOrderNo] = useState('');
  const [sourceProductId, setSourceProductId] = useState('');
  const [sourceQuantity, setSourceQuantity] = useState<number>(0);
  const [targets, setTargets] = useState<TargetRow[]>([{ productId: '', productName: '', quantity: 0 }]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lastTrNumber, setLastTrNumber] = useState('');

  useEffect(() => {
    if (user?.id) loadInitialData();
  }, [user?.id]);

  async function loadInitialData() {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [products, adminList, stockistList] = await Promise.all([
        ProductService.getAll(),
        UserService.getAdmins(),
        UserService.getStockists(),
      ]);
      setAllProducts(products);
      setAdmins(adminList);
      setStockists(stockistList);

      // STOCKIST 只能操作自己的仓库，自动选中
      if (role === UserRole.STOCKIST) {
        setSelectedOwnerId(user.id);
        setSelectedOwnerName(user.displayName);
        await loadOwnerData(user.id);
      } else {
        setLoading(false);
      }
    } catch (err) {
      console.error('Error loading initial data:', err);
      setLoading(false);
    }
  }

  async function loadOwnerData(ownerId: string) {
    if (!ownerId) return;
    setLoading(true);
    try {
      const [inv, conversions] = await Promise.all([
        InventoryService.getByUser(ownerId),
        ProductConversionService.getConversionsByUser(ownerId),
      ]);
      setUserInventory(inv);
      setHistory(conversions);
      // 切换归属人时清空产品选择
      setSourceProductId('');
      setSourceQuantity(0);
    } catch (err) {
      console.error('Error loading owner data:', err);
    } finally {
      setLoading(false);
    }
  }

  function handleOwnerChange(ownerId: string) {
    const found = [...admins, ...stockists].find((u) => u.id === ownerId);
    setSelectedOwnerId(ownerId);
    setSelectedOwnerName(found?.displayName ?? '');
    if (ownerId) loadOwnerData(ownerId);
    else {
      setUserInventory([]);
      setHistory([]);
    }
  }

  // Products with stock > 0 (for source selector), temporary ones first
  const sourceOptions = userInventory
    .filter((inv) => inv.quantityOnHand > 0)
    .map((inv) => {
      const product = allProducts.find((p) => p.sku === inv.productId);
      return { inv, product };
    })
    .filter((x) => x.product)
    .sort((a, b) => {
      if (a.product?.isTemporary && !b.product?.isTemporary) return -1;
      if (!a.product?.isTemporary && b.product?.isTemporary) return 1;
      return (a.product?.name ?? '').localeCompare(b.product?.name ?? '');
    });

  const sourceInv = userInventory.find((inv) => inv.productId === sourceProductId);
  const maxSourceQty = sourceInv?.quantityOnHand ?? 0;
  const totalTargetQty = targets.reduce((sum, t) => sum + (t.quantity || 0), 0);
  const remaining = sourceQuantity - totalTargetQty;
  const isBalanced = sourceQuantity > 0 && remaining === 0;

  function addTargetRow() {
    setTargets((prev) => [...prev, { productId: '', productName: '', quantity: 0 }]);
  }

  function removeTargetRow(index: number) {
    setTargets((prev) => prev.filter((_, i) => i !== index));
  }

  function updateTarget(index: number, field: keyof TargetRow, value: string | number) {
    setTargets((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        if (field === 'productId') {
          const p = allProducts.find((p) => p.sku === value);
          return { ...row, productId: p?.sku ?? '', productName: p?.name ?? '' };
        }
        return { ...row, [field]: value };
      })
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!selectedOwnerId) { setError('请先选择归属仓库（归属人）。'); return; }
    if (!upstreamOrderNo.trim()) { setError('上游单号为必填。'); return; }
    if (!sourceProductId) { setError('请选择转出产品。'); return; }
    if (sourceQuantity <= 0) { setError('转出数量必须大于 0。'); return; }
    if (sourceQuantity > maxSourceQty) { setError(`转出数量不可超过库存 ${maxSourceQty}。`); return; }
    if (targets.some((t) => !t.productId)) { setError('请为每一行选择转入产品。'); return; }
    if (targets.some((t) => t.quantity <= 0)) { setError('每一行转入数量必须大于 0。'); return; }
    if (!isBalanced) { setError(`数量不守恒：剩余 ${remaining} 未分配。转入总量必须等于转出数量。`); return; }
    if (!notes.trim()) { setError('备注为必填。'); return; }

    const targetIds = targets.map((t) => t.productId);
    if (new Set(targetIds).size !== targetIds.length) {
      setError('转入产品不可重复，请合并相同产品的数量。');
      return;
    }
    if (targets.some((t) => t.productId === sourceProductId)) {
      setError('转入产品不可与转出产品相同。');
      return;
    }

    setSaving(true);
    try {
      const trNumber = await ProductConversionService.createConversion({
        userId: selectedOwnerId,
        userName: selectedOwnerName,
        ownerName: selectedOwnerName,
        upstreamOrderNo: upstreamOrderNo.trim(),
        sourceProductId,
        sourceProductName: allProducts.find((p) => p.sku === sourceProductId)?.name ?? sourceProductId,
        sourceQuantity,
        targets,
        notes: notes.trim(),
      });

      setLastTrNumber(trNumber);
      toast.success(`产品转换调拨单 ${trNumber} 已建立，库存已更新。`);

      // Reset form (keep owner selection)
      setUpstreamOrderNo('');
      setSourceProductId('');
      setSourceQuantity(0);
      setTargets([{ productId: '', productName: '', quantity: 0 }]);
      setNotes('');
      await loadOwnerData(selectedOwnerId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '未知错误';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/warehouse" className="text-gray-500 hover:text-gray-800 text-sm">&larr; 仓库管理</Link>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">产品转换调拨单</h1>
            <p className="text-gray-500 mt-1">将临时过渡品转换为正式产品（Product Conversion Transfer Order - TR）</p>
          </div>
        </div>

        {/* Success Banner */}
        {lastTrNumber && (
          <div className="bg-green-100 border border-green-400 rounded-lg px-4 py-3 text-green-800 text-sm">
            ✓ 已成功建立转换单 <strong>{lastTrNumber}</strong>，库存已原子更新。请提醒上游经销商同步建立相同转换单（SOP 要求手动同步）。
          </div>
        )}

        {/* Form */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-200">新建转换单</h2>

          {error && (
            <div className="msg-error px-3 py-2 rounded-lg text-sm">{error}</div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Step 1: 归属仓库 + 上游单号 */}
            <div className="border border-gray-600 rounded-lg p-4 space-y-3 bg-gray-750">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">第一步：确认归属信息</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 归属仓库/归属人 */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    归属仓库 / 归属人 <span className="text-red-400">*</span>
                    <span className="text-xs text-gray-500 ml-2">（这批货属于谁的库存）</span>
                  </label>
                  {role === UserRole.STOCKIST ? (
                    // STOCKIST 只能操作自己，显示为只读
                    <div className="w-full px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-gray-100 text-sm">
                      {selectedOwnerName || user?.displayName || '-'}
                      <span className="ml-2 text-xs text-gray-500">（当前登入用户）</span>
                    </div>
                  ) : (
                    <select
                      value={selectedOwnerId}
                      onChange={(e) => handleOwnerChange(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500"
                    >
                      <option value="">选择归属仓库...</option>
                      {admins.length > 0 && (
                        <optgroup label="── 总经销商 ──">
                          {admins.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.displayName}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {stockists.length > 0 && (
                        <optgroup label="── 经销商 ──">
                          {stockists.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.displayName}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  )}
                </div>

                {/* 上游单号 */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    上游单号 <span className="text-red-400">*</span>
                    <span className="text-xs text-gray-500 ml-2">（来自哪批上游发货单）</span>
                  </label>
                  <input
                    type="text"
                    value={upstreamOrderNo}
                    onChange={(e) => setUpstreamOrderNo(e.target.value)}
                    placeholder="例：SHIP-20260226-001"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* 归属确认提示 */}
              {selectedOwnerId && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-900/20 border border-blue-700/40 rounded-lg text-xs text-blue-300">
                  ✓ 此转换单将操作 <strong>{selectedOwnerName}</strong> 的库存仓
                </div>
              )}
            </div>

            {/* Step 2: 转出产品 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  转出产品 <span className="text-red-400">*</span>
                  <span className="text-xs text-gray-500 ml-2">（仅显示该仓库库存 &gt; 0 的产品，临时过渡品优先）</span>
                </label>
                <select
                  value={sourceProductId}
                  onChange={(e) => {
                    setSourceProductId(e.target.value);
                    setSourceQuantity(0);
                  }}
                  disabled={!selectedOwnerId}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50"
                >
                  <option value="">{selectedOwnerId ? '选择转出产品...' : '请先选择归属仓库'}</option>
                  {sourceOptions.map(({ inv, product }) => (
                    <option key={inv.productId} value={inv.productId}>
                      {product?.isTemporary ? '⚡ ' : ''}{product?.name} [{inv.productId}]（库存：{inv.quantityOnHand}）
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  转出数量 <span className="text-red-400">*</span>
                  {maxSourceQty > 0 && (
                    <span className="text-xs text-gray-500 ml-2">最多 {maxSourceQty}</span>
                  )}
                </label>
                <input
                  type="number"
                  value={sourceQuantity || ''}
                  onChange={(e) => setSourceQuantity(parseInt(e.target.value) || 0)}
                  min="1"
                  max={maxSourceQty}
                  placeholder="0"
                  disabled={!sourceProductId}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                />
              </div>
            </div>

            {/* Balance indicator */}
            {sourceQuantity > 0 && (
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                remaining === 0
                  ? 'bg-green-900/30 text-green-300 border border-green-700/50'
                  : remaining > 0
                  ? 'bg-yellow-900/30 text-yellow-300 border border-yellow-700/50'
                  : 'bg-red-900/30 text-red-300 border border-red-700/50'
              }`}>
                {remaining === 0
                  ? '✓ 数量守恒，可以提交'
                  : remaining > 0
                  ? `⚠ 剩余待分配：${remaining}（请继续添加转入产品）`
                  : `✗ 转入超出 ${Math.abs(remaining)}，请减少数量`}
              </div>
            )}

            {/* Target Products */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-300">
                  转入产品 <span className="text-red-400">*</span>
                  <span className="text-xs text-gray-500 ml-2">（支持多产品，总数量必须等于转出数量）</span>
                </label>
                <button
                  type="button"
                  onClick={addTargetRow}
                  className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg"
                >
                  + 新增转入产品
                </button>
              </div>

              {targets.map((row, index) => (
                <div key={index} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-1 text-xs text-gray-500 text-center">#{index + 1}</div>
                  <div className="col-span-6">
                    <select
                      value={row.productId}
                      onChange={(e) => updateTarget(index, 'productId', e.target.value)}
                      className="w-full px-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 text-xs focus:outline-none focus:border-blue-500"
                    >
                      <option value="">选择转入产品...</option>
                      {allProducts
                        .filter((p) => p.isActive && p.sku !== sourceProductId)
                        .map((p) => (
                          <option key={p.sku} value={p.sku}>
                            {p.name} [{p.sku}]
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      value={row.quantity || ''}
                      onChange={(e) => updateTarget(index, 'quantity', parseInt(e.target.value) || 0)}
                      min="1"
                      placeholder="数量"
                      className="w-full px-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder:text-white text-xs focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="col-span-2">
                    {targets.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTargetRow(index)}
                        className="w-full py-2 text-xs bg-red-900/30 hover:bg-red-900/60 text-red-400 rounded-lg"
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {targets.length > 1 && (
                <div className="text-right text-xs text-gray-400 pr-2">
                  转入合计：<span className="text-gray-200 font-medium">{totalTargetQty}</span>
                  {sourceQuantity > 0 && (
                    <span className="ml-2">/ {sourceQuantity}</span>
                  )}
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                备注 <span className="text-red-400">*</span>
                <span className="text-xs text-gray-500 ml-2">（必填：请填写产品确定说明）</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="例：28盒铺货中24盒确定产品（Light-22 × 10、Wow × 10、Plus × 4），剩余4盒待确定"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            {/* Submit */}
            <div className="flex gap-3 pt-1">
              <button
                type="submit"
                disabled={saving || !isBalanced || !notes.trim() || !selectedOwnerId}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
              >
                {saving ? '建立中...' : '建立转换单（TR）'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setUpstreamOrderNo('');
                  setSourceProductId('');
                  setSourceQuantity(0);
                  setTargets([{ productId: '', productName: '', quantity: 0 }]);
                  setNotes('');
                  setError('');
                }}
                className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium"
              >
                重置
              </button>
            </div>
          </form>
        </div>

        {/* History */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-200">
              转换记录（TR）
              {selectedOwnerName && <span className="ml-2 text-sm font-normal text-blue-300">— {selectedOwnerName}</span>}
            </h2>
          </div>
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <p className="text-gray-400 text-sm">加载中...</p>
            </div>
          ) : !selectedOwnerId ? (
            <div className="flex items-center justify-center p-12">
              <p className="text-gray-400 text-sm">请先选择归属仓库以查看转换记录</p>
            </div>
          ) : history.length === 0 ? (
            <div className="flex items-center justify-center p-12">
              <p className="text-gray-400 text-sm">暂无转换记录</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-max">
                <thead className="bg-gray-700 border-b border-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wide whitespace-nowrap">单号（TR）</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wide whitespace-nowrap">日期</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wide whitespace-nowrap">归属人</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wide whitespace-nowrap">上游单号</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wide whitespace-nowrap">转出</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wide whitespace-nowrap">转入明细</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wide whitespace-nowrap">备注</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {history.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-700/50">
                      <td className="px-4 py-3 text-sm font-mono text-blue-400 whitespace-nowrap">
                        {record.poNumber || record.id}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">
                        {record.createdAt ? new Date(record.createdAt).toLocaleDateString('zh-TW') : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-200 font-medium whitespace-nowrap">
                        {record.ownerName || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-amber-300 whitespace-nowrap">
                        {record.upstreamOrderNo || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300 whitespace-nowrap">
                        {record.conversionSource
                          ? `${record.conversionSource.productName} × ${record.conversionSource.quantity}`
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300">
                        {record.conversionTargets
                          ? record.conversionTargets.map((t) => `${t.productName} × ${t.quantity}`).join('、')
                          : '-'}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-300 max-w-xs">
                        {record.description || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
