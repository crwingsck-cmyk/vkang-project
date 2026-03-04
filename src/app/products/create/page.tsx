'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { getCurrentToken } from '@/services/firebase/auth';
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
    isTemporary: false,
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const target = e.target as HTMLInputElement;
    if (target.type === 'checkbox') {
      setForm((prev) => ({ ...prev, [target.name]: target.checked }));
    } else {
      setForm((prev) => ({ ...prev, [target.name]: target.value }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.sku || !form.name || !form.category) {
      setError('Please fill all required fields (SKU, name, category).');
      return;
    }
    if (!form.isTemporary && (!form.unitPrice || !form.costPrice)) {
      setError('Please fill all required fields (SKU, name, category, price, cost).');
      return;
    }

    const skuClean = form.sku.toUpperCase().trim();
    if (/[\/\\#%?]/.test(skuClean)) {
      setError('SKU cannot contain special characters (/ \\ # % ?).');
      return;
    }

    if (parseFloat(form.unitPrice) < 0 || parseFloat(form.costPrice) < 0) {
      setError('Price cannot be negative.');
      return;
    }

    setSaving(true);
    try {
      const token = await getCurrentToken(true);
      if (!token) {
        setError('Session expired. Please log in again.');
        setSaving(false);
        return;
      }

      const packsPerBoxVal = (() => {
        const raw = String(form.packsPerBox || '').trim();
        const num = raw ? parseInt(raw.replace(/\D/g, ''), 10) : undefined;
        return num && num > 0 ? num : undefined;
      })();

      const res = await fetch('/api/products/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sku: skuClean,
          name: form.name.trim(),
          category: form.category,
          description: form.description.trim() || undefined,
          unitPrice: form.isTemporary ? 0 : parseFloat(form.unitPrice),
          costPrice: form.isTemporary ? 0 : parseFloat(form.costPrice),
          priceNote: form.priceNote.trim() || undefined,
          unit: form.unit,
          reorderLevel: parseInt(form.reorderLevel),
          reorderQuantity: parseInt(form.reorderQuantity),
          packsPerBox: packsPerBoxVal,
          barcode: form.barcode.trim() || undefined,
          isActive: true,
          isTemporary: form.isTemporary || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Save failed (${res.status})`);
        setSaving(false);
        return;
      }
      router.push(`/products/${encodeURIComponent(skuClean)}`);
    } catch (err: unknown) {
      console.error('Create product error:', err);
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/products" className="text-gray-500 hover:text-gray-800 text-sm">
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

          {/* Temporary Product Toggle */}
          <div className="flex items-start gap-3 p-3 bg-purple-900/20 border border-purple-700/30 rounded-lg">
            <input
              type="checkbox"
              id="isTemporary"
              name="isTemporary"
              checked={form.isTemporary}
              onChange={handleChange}
              className="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-700 text-purple-500 focus:ring-purple-500"
            />
            <div>
              <label htmlFor="isTemporary" className="block text-sm font-medium text-purple-300 cursor-pointer">
                Temporary Placement SKU
              </label>
              <p className="text-xs text-gray-400 mt-0.5">
                For undetermined products only. Not for sales. Price/cost auto-set to 0 when checked.
                <br />
                <span className="text-purple-400">For temporary inventory tracking of undetermined products only. Not for actual sales.</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Unit Price (RM) {!form.isTemporary && <span className="text-red-400">*</span>}
              </label>
              <input
                type="number"
                name="unitPrice"
                value={form.isTemporary ? '0' : form.unitPrice}
                onChange={handleChange}
                placeholder="0.00"
                min="0"
                step="0.01"
                disabled={form.isTemporary}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Cost Price (RM) {!form.isTemporary && <span className="text-red-400">*</span>}
              </label>
              <input
                type="number"
                name="costPrice"
                value={form.isTemporary ? '0' : form.costPrice}
                onChange={handleChange}
                placeholder="0.00"
                min="0"
                step="0.01"
                disabled={form.isTemporary}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Price Note (optional)
            </label>
            <input
              type="text"
              name="priceNote"
              value={form.priceNote}
              onChange={handleChange}
              placeholder="e.g. Cost varies per order, price per order"
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-0.5">When price/cost varies per order. List shows ※ hint.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Packs per box
            </label>
            <input
              type="text"
              name="packsPerBox"
              value={form.packsPerBox}
              onChange={handleChange}
              placeholder="e.g. 5"
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
