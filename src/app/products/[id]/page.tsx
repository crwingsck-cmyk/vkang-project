'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ProductService } from '@/services/database/products';
import { getCurrentToken } from '@/services/firebase/auth';
import { Product, UserRole } from '@/types/models';
import Link from 'next/link';

const CATEGORIES = [
  'Electronics', 'Clothing', 'Food & Beverage', 'Health & Beauty',
  'Home & Garden', 'Sports & Outdoors', 'Toys & Games', 'Automotive', 'Other',
];

export default function ProductDetailPage() {
  const { role } = useAuth();
  const router = useRouter();
  const params = useParams();
  const productId = (params?.id ?? '') as string;

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [form, setForm] = useState({
    name: '',
    category: '',
    description: '',
    unitPrice: '',
    costPrice: '',
    priceNote: '',
    unit: 'pcs',
    reorderLevel: '',
    reorderQuantity: '',
    packsPerBox: '',
    barcode: '',
  });

  useEffect(() => {
    if (!productId) {
      setLoading(false);
      setError('無效的產品網址');
      return;
    }
    loadProduct();
  }, [productId]);

  async function loadProduct() {
    if (!productId) return;
    setLoading(true);
    setError('');
    try {
      let data: Product | null = null;
      const token = await getCurrentToken(true);
      if (token) {
        const res = await fetch(`/api/products/${encodeURIComponent(productId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          data = await res.json();
        }
      }
      if (!data) {
        data = await ProductService.getById(productId);
      }
      if (!data) {
        setError('Product not found.');
        return;
      }
      setProduct(data);
      setForm({
        name: data.name,
        category: data.category,
        description: data.description || '',
        unitPrice: String(data.unitPrice),
        costPrice: String(data.costPrice),
        priceNote: data.priceNote || '',
        unit: data.unit,
        reorderLevel: String(data.reorderLevel),
        reorderQuantity: String(data.reorderQuantity),
        packsPerBox: data.packsPerBox != null ? String(data.packsPerBox) : '',
        barcode: data.barcode || '',
      });
    } catch (err) {
      setError('Failed to load product.');
    } finally {
      setLoading(false);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setSaving(true);
    try {
      const token = await getCurrentToken(true);
      if (!token) {
        setError('登入已過期，請重新登入');
        setSaving(false);
        return;
      }
      const docId = product?.id ?? productId;
      const packsPerBoxVal = (() => {
        const raw = String(form.packsPerBox || '').trim();
        const num = raw ? parseInt(raw.replace(/\D/g, ''), 10) : undefined;
        return num && num > 0 ? num : undefined;
      })();
      const res = await fetch(`/api/products/${encodeURIComponent(docId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: form.name.trim(),
          category: form.category,
          description: form.description.trim(),
          unitPrice: parseFloat(form.unitPrice),
          costPrice: parseFloat(form.costPrice),
          priceNote: form.priceNote.trim(),
          unit: form.unit,
          reorderLevel: parseInt(form.reorderLevel),
          reorderQuantity: parseInt(form.reorderQuantity),
          packsPerBox: packsPerBoxVal,
          barcode: form.barcode.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || '更新失敗');
        setSaving(false);
        return;
      }
      setSuccessMsg('Product updated successfully.');
      setIsEditing(false);
      await loadProduct();
    } catch (err) {
      setError('Failed to update product.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`確定要刪除「${product?.name}」嗎？此操作無法復原。`)) return;
    setDeleting(true);
    try {
      const docId = product?.id ?? productId;
      await ProductService.delete(docId);
      router.push('/products');
    } catch (err) {
      setError('Failed to delete product.');
      setDeleting(false);
    }
  }

  const isAdmin = role === UserRole.ADMIN;

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/products" className="text-gray-400 hover:text-gray-200 text-sm">
            &larr; Back to Products
          </Link>
        </div>

        {loading ? (
          <div className="text-gray-400">Loading...</div>
        ) : error && !product ? (
          <div className="space-y-4">
            <div className="msg-error px-4 py-3 rounded-lg">{error}</div>
            <p className="text-gray-400 text-sm">此產品可能已被刪除或不存在。您可以返回產品列表或建立新產品。</p>
            <div className="flex gap-3">
              <Link
                href="/products"
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium"
              >
                返回產品列表
              </Link>
              <Link
                href="/products/create"
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium"
              >
                建立新產品
              </Link>
            </div>
          </div>
        ) : product ? (
          <>
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-100">{product.name}</h1>
                <p className="text-gray-400 mt-1">SKU: {product.sku}</p>
              </div>
              {isAdmin && !isEditing && (
                <div className="flex gap-2">
                  <button
                    onClick={() => { setIsEditing(true); setSuccessMsg(''); setError(''); }}
                    className="px-4 py-2 bg-blue-400 hover:bg-blue-500 text-white border border-blue-500 rounded-lg text-sm"
                  >
                    修改
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm"
                  >
                    {deleting ? '刪除中...' : '刪除'}
                  </button>
                </div>
              )}
            </div>

            {error && (
              <div className="msg-error px-4 py-3 rounded-lg">{error}</div>
            )}
            {successMsg && (
              <div className="bg-green-900/30 border border-green-700 text-green-300 px-4 py-3 rounded-lg">{successMsg}</div>
            )}

            {isEditing && isAdmin ? (
              <form onSubmit={handleSave} className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
                <h2 className="text-lg font-semibold text-gray-200">Edit Product</h2>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Product Name</label>
                  <input
                    type="text"
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Category</label>
                    <select
                      name="category"
                      value={form.category}
                      onChange={handleChange}
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
                    >
                      {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Unit</label>
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
                  <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                  <textarea
                    name="description"
                    value={form.description}
                    onChange={handleChange}
                    rows={3}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500 resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Unit Price (USD)（預設值）</label>
                    <input
                      type="number"
                      name="unitPrice"
                      value={form.unitPrice}
                      onChange={handleChange}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Cost Price (USD)（預設值）</label>
                    <input
                      type="number"
                      name="costPrice"
                      value={form.costPrice}
                      onChange={handleChange}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">價格備註（選填）</label>
                  <input
                    type="text"
                    name="priceNote"
                    value={form.priceNote}
                    onChange={handleChange}
                    placeholder="例如：每次進貨成本不同、售價依訂單為準"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Reorder Level</label>
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
                    <label className="block text-sm font-medium text-gray-300 mb-1">Reorder Quantity</label>
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

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">一盒幾包</label>
                  <input
                    type="text"
                    name="packsPerBox"
                    value={form.packsPerBox}
                    onChange={handleChange}
                    placeholder="例如：5 或 一盒5包"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Barcode</label>
                  <input
                    type="text"
                    name="barcode"
                    value={form.barcode}
                    onChange={handleChange}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsEditing(false); setError(''); }}
                    className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-400">Category</p>
                    <p className="text-gray-100 font-medium">{product.category}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Unit</p>
                    <p className="text-gray-100 font-medium">{product.unit}</p>
                  </div>
                  {product.packsPerBox != null && (
                    <div>
                      <p className="text-gray-400">一盒幾包</p>
                      <p className="text-gray-100 font-medium">{product.packsPerBox} 包</p>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-400">Unit Price（預設）</p>
                    <p className="text-gray-100 font-medium">USD {product.unitPrice.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Cost Price（預設）</p>
                    <p className="text-gray-100 font-medium">USD {product.costPrice.toFixed(2)}</p>
                  </div>
                  {product.priceNote && (
                    <div className="col-span-2">
                      <p className="text-gray-400">價格備註</p>
                      <p className="text-gray-100 font-medium">{product.priceNote}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-400">Margin</p>
                    <p className="text-green-400 font-medium">
                      {product.unitPrice > 0
                        ? `${(((product.unitPrice - product.costPrice) / product.unitPrice) * 100).toFixed(1)}%`
                        : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-400">Barcode</p>
                    <p className="text-gray-100 font-medium">{product.barcode || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Reorder Level</p>
                    <p className="text-gray-100 font-medium">{product.reorderLevel}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Reorder Quantity</p>
                    <p className="text-gray-100 font-medium">{product.reorderQuantity}</p>
                  </div>
                </div>
                {product.description && (
                  <div>
                    <p className="text-gray-400 text-sm">Description</p>
                    <p className="text-gray-300 mt-1">{product.description}</p>
                  </div>
                )}
                <div className="border-t border-gray-700 pt-4 text-xs text-gray-500">
                  Created: {product.createdAt ? new Date(product.createdAt).toLocaleString() : '-'}
                  &nbsp;|&nbsp;
                  Updated: {product.updatedAt ? new Date(product.updatedAt).toLocaleString() : '-'}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </ProtectedRoute>
  );
}
