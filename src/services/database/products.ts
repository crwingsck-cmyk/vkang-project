import { where, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { FirestoreService } from './base';
import { Product } from '@/types/models';

const COLLECTION = 'products';

export const ProductService = {
  /**
   * Create a new product
   */
  async create(product: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) {
    const timestamp = Date.now();
    const productData: Product = {
      ...product,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    
    // Use SKU as document ID for unique constraint
    return FirestoreService.set(COLLECTION, product.sku, productData);
  },

  /**
   * Get a product by ID (SKU)
   */
  async getById(id: string) {
    return FirestoreService.get<Product>(COLLECTION, id);
  },

  /**
   * Get all products, optionally filtered by category
   * 使用簡單查詢避免需要複合索引，排序在記憶體中完成
   */
  async getAll(category?: string, pageLimit = 50) {
    const constraints = [
      where('isActive', '==', true),
      firestoreLimit(pageLimit),
    ];

    if (category) {
      constraints.splice(0, 0, where('category', '==', category));
    }

    const results = await FirestoreService.query<Product>(COLLECTION, constraints);
    return results.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  },

  /**
   * Search products by name
   */
  async search(searchTerm: string, pageLimit = 50) {
    // Note: Firestore doesn't support LIKE queries natively
    // For production, consider using Algolia or Meilisearch
    const constraints = [
      where('isActive', '==', true),
      firestoreLimit(pageLimit),
    ];
    
    const results = await FirestoreService.query<Product>(COLLECTION, constraints);
    return results.filter(
      (p) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchTerm.toLowerCase())
    );
  },

  /**
   * Get products by category
   */
  async getByCategory(category: string) {
    const constraints = [
      where('category', '==', category),
      where('isActive', '==', true),
      orderBy('name', 'asc'),
    ];
    
    return FirestoreService.query<Product>(COLLECTION, constraints);
  },

  /**
   * Update a product
   */
  async update(id: string, updates: Partial<Product>) {
    return FirestoreService.update<Product>(COLLECTION, id, updates);
  },

  /**
   * Delete a product (soft delete via isActive flag)
   */
  async delete(id: string) {
    return FirestoreService.update<Product>(COLLECTION, id, { isActive: false });
  },

  /**
   * Bulk import products
   */
  async bulkImport(products: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>[]) {
    const results = [];
    
    for (const product of products) {
      try {
        const result = await this.create(product);
        results.push({ success: true, data: result });
      } catch (error) {
        results.push({ success: false, error, product });
      }
    }
    
    return results;
  },
};
