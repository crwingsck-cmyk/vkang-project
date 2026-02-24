'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ProductService } from '@/services/database/products';
import { Product, UserRole } from '@/types/models';
import Link from 'next/link';

export default function ProductsPage() {
  const { role } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await ProductService.getAll();
      setProducts(data);
    } catch (error) {
      console.error('Error loading products:', error);
      const msg = error instanceof Error ? error.message : '載入失敗';
      setLoadError(msg.includes('index') ? '請執行 firebase deploy --only firestore:indexes 部署索引' : msg);
    } finally {
      setLoading(false);
    }
  }

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const categoryCount = new Set(products.map((p) => p.category)).size;

  async function handleDelete(sku: string, name: string) {
    if (!confirm(`確定要刪除「${name}」(SKU: ${sku}) 嗎？此操作無法復原。`)) return;
    try {
      await ProductService.delete(sku);
      await loadProducts();
    } catch (error) {
      console.error('Delete product error:', error);
      alert('刪除失敗，請稍後再試');
    }
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN, UserRole.STOCKIST]}>
      <div className="space-y-5">

        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-txt-primary">Products</h1>
            <p className="text-xs text-txt-subtle mt-0.5">Manage your product catalog. 售價／成本為預設值，實際以訂單及進貨單為準。</p>
          </div>
          {role === UserRole.ADMIN && (
            <Link
              href="/products/create"
              className="px-3.5 py-2 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-lg transition-colors"
            >
              + Add Product
            </Link>
          )}
        </div>

        {/* Toolbar: search + stats */}
        <div className="flex items-center gap-4">
          <input
            type="text"
            placeholder="Search by name or SKU..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-72 px-3 py-2 bg-surface-1 border border-border rounded-lg text-sm text-txt-primary placeholder:text-txt-disabled focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/10"
          />
          <div className="flex items-center gap-3 ml-auto">
            <span className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">
              {filteredProducts.length} of {products.length} products
            </span>
            <div className="flex gap-2">
              <StatChip label="Total" value={products.length} color="text-txt-primary" />
              <StatChip label="Active" value={products.length} color="text-blue-600" />
              <StatChip label="Categories" value={categoryCount} color="text-info" />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="glass-panel overflow-hidden">
          {loading ? (
            <div className="py-16 text-center">
              <div className="inline-block animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-accent mb-3"></div>
              <p className="text-txt-subtle text-sm">Loading products...</p>
            </div>
          ) : loadError ? (
            <div className="py-16 text-center">
              <p className="text-red-400 text-sm mb-2">{loadError}</p>
              <button onClick={loadProducts} className="text-xs text-accent-text hover:underline">
                重新載入
              </button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-txt-subtle text-sm">No products found</p>
              {role === UserRole.ADMIN && (
                <Link href="/products/create" className="mt-2 inline-block text-xs text-accent-text hover:underline">
                  Add your first product →
                </Link>
              )}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-base">
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest w-32">SKU</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">Name</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest w-40">Category</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-txt-subtle uppercase tracking-widest w-32">預設售價</th>
                  <th className="px-5 py-2.5 text-right text-[10px] font-semibold text-txt-subtle uppercase tracking-widest w-32">預設成本</th>
                  <th className="px-5 py-2.5 text-left text-[10px] font-semibold text-txt-subtle uppercase tracking-widest min-w-[140px]">價格備註</th>
                  <th className="px-5 py-2.5 text-center text-[10px] font-semibold text-txt-subtle uppercase tracking-widest w-24">Status</th>
                  {role === UserRole.ADMIN && (
                    <th className="px-5 py-2.5 text-center text-[10px] font-semibold text-txt-subtle uppercase tracking-widest w-20">操作</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-muted">
                {filteredProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-accent-text whitespace-nowrap">
                      <Link href={`/products/${encodeURIComponent(product.id || product.sku)}`} className="hover:underline">
                        {product.sku}
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-medium text-txt-primary">
                      <Link href={`/products/${encodeURIComponent(product.id || product.sku)}`} className="hover:text-accent-text transition-colors">
                        {product.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-txt-secondary">{product.category || '—'}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="tabular-nums font-medium text-txt-primary">USD {product.unitPrice}</div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="tabular-nums text-txt-subtle">USD {product.costPrice ?? '—'}</div>
                    </td>
                    <td className="px-5 py-3 text-txt-subtle text-xs max-w-[240px] break-words">
                      {product.priceNote || '—'}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <span className="inline-flex px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
                        Active
                      </span>
                    </td>
                    {role === UserRole.ADMIN && (
                      <td className="px-5 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Link
                            href={`/products/${encodeURIComponent(product.id || product.sku)}`}
                            className="px-2 py-1 text-xs bg-blue-400 hover:bg-blue-500 text-white border border-blue-500 rounded transition-colors"
                            title="修改"
                          >
                            修改
                          </Link>
                          <button
                            onClick={() => handleDelete(product.id || product.sku, product.name)}
                            className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                            title="刪除"
                          >
                            刪除
                          </button>
                        </div>
                      </td>
                    )}
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

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-1 border border-border rounded-lg">
      <span className="text-[10px] font-semibold text-txt-subtle uppercase tracking-widest">{label}</span>
      <span className={`text-sm font-bold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}
