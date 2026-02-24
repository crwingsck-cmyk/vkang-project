'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ProductService } from '@/services/database/products';
import { UserRole } from '@/types/models';
import Link from 'next/link';

const CATEGORIES = [
  'Electronics', 'Clothing', 'Food & Beverage', 'Health & Beauty',
  'Home & Garden', 'Sports & Outdoors', 'Toys & Games', 'Automotive', 'Other',
];

export default function CreateProductPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    sku: '',
    name: '',
    category: '',
    description: '',
    unitPrice: '',
    costPrice: '',
    priceNote: '',
    unit: 'pcs',
    reorderLevel: '10',
    reorderQuantity: '50',
    packsPerBox: '',
    barcode: '',
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.sku || !form.name || !form.category || !form.unitPrice || !form.costPrice) {
      setError('請填寫所有必填欄位（SKU、名稱、分類、售價、成本）。');
      return;
    }

    const skuClean = form.sku.toUpperCase().trim();
    if (/[\/\\#%?]/.test(skuClean)) {
      setError('SKU 不可包含特殊字元（/  \\  #  %  ?）。');
      return;
    }

    if (parseFloat(form.unitPrice) < 0 || parseFloat(form.costPrice) < 0) {
      setError('價格不可為負數。');
      return;
    }

    setSaving(true);
    try {
      const existing = await ProductService.getById(skuClean);
      if (existing && existing.isActive) {
        setError('此 SKU 已存在');
        setSaving(false);
        return;
      }

      const packsPerBoxVal = (() => {
        const raw = String(form.packsPerBox || '').trim();
        const num = raw ? parseInt(raw.replace(/\D/g, ''), 10) : undefined;
        return num && num > 0 ? num : undefined;
      })();

      await ProductService.create({
        sku: skuClean,
        name: form.name.trim(),
        category: form.category,
        description: form.description.trim() || undefined,
        unitPrice: parseFloat(form.unitPrice),
        costPrice: parseFloat(form.costPrice),
        priceNote: form.priceNote.trim() || undefined,
        unit: form.unit,
        reorderLevel: parseInt(form.reorderLevel),
        reorderQuantity: parseInt(form.reorderQuantity),
        packsPerBox: packsPerBoxVal,
        barcode: form.barcode.trim() || undefined,
        isActive: true,
      });
      router.push('/products');
    } catch (err: unknown) {
      console.error('Create product error:', err);
      const msg = err instanceof Error ? err.message : '未知錯誤';
      setError(`儲存失敗：${msg}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/products" className="text-gray-400 hover:text-gray-200 text-sm">
            &larr; Back to Products
          </Link>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-gray-900">Add Product</h1>
          <p className="text-gray-400 mt-1">Create a new product in the catalog</p>
        </div>

        {error && (
          <div className="msg-error px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                SKU <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="sku"
                value={form.sku}
                onChange={handleChange}
                placeholder="e.g. PROD-001"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Barcode
              </label>
              <input
                type="text"
                name="barcode"
                value={form.barcode}
                onChange={handleChange}
                placeholder="Optional"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Product Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="Enter product name"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Category <span className="text-red-400">*</span>
              </label>
              <select
                name="category"
                value={form.category}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
              >
                <option value="">Select category</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Unit
              </label>
              <select
                name="unit"
                value={form.unit}
                onChange={handleChange}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
              >
                <option value="pcs">pcs</option>
                <option value="box">box</option>
                <option value="kg">kg</option>
                <option value="litre">litre</option>
                <option value="set">set</option>
                <option value="pair">pair</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Description
            </label>
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              rows={3}
              placeholder="Optional product description"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Unit Price (USD) <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                name="unitPrice"
                value={form.unitPrice}
                onChange={handleChange}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Cost Price (USD) <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                name="costPrice"
                value={form.costPrice}
                onChange={handleChange}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              價格備註（選填）
            </label>
            <input
              type="text"
              name="priceNote"
              value={form.priceNote}
              onChange={handleChange}
              placeholder="例如：每次進貨成本不同、售價依訂單為準"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-0.5">當售價或成本每次不同時可填寫，列表會顯示 ※ 提示</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              一盒幾包
            </label>
            <input
              type="text"
              name="packsPerBox"
              value={form.packsPerBox}
              onChange={handleChange}
              placeholder="例如：5 或 一盒5包"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Reorder Level
              </label>
              <input
                type="number"
                name="reorderLevel"
                value={form.reorderLevel}
                onChange={handleChange}
                min="0"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Reorder Quantity
              </label>
              <input
                type="number"
                name="reorderQuantity"
                value={form.reorderQuantity}
                onChange={handleChange}
                min="1"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium"
            >
              {saving ? 'Saving...' : 'Create Product'}
            </button>
            <Link
              href="/products"
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
