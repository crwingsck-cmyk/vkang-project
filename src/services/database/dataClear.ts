import { limit } from 'firebase/firestore';
import { FirestoreService } from './base';

const COLLECTIONS = [
  'inventoryBatches',
  'inventory',
  'purchaseOrders',
  'transactions',
  'financials',
  'taiwanOrderPools',
  'taiwanOrderAllocations',
] as const;

/**
 * 清空所有業務資料（庫存、進貨單、訂單、財務紀錄、台灣訂單池）
 * 不刪除 users、products，以保留登入帳號及產品目錄（可手動管理）
 */
export async function clearAllData(): Promise<{ cleared: Record<string, number>; error?: string }> {
  const cleared: Record<string, number> = {};

  for (const coll of COLLECTIONS) {
    try {
      const docs = await FirestoreService.query(coll, [limit(5000)]);
      for (const d of docs) {
        if (d.id) {
          await FirestoreService.delete(coll, d.id);
          cleared[coll] = (cleared[coll] ?? 0) + 1;
        }
      }
      if (!cleared[coll]) cleared[coll] = 0;
    } catch (err) {
      return {
        cleared,
        error: err instanceof Error ? err.message : `清空 ${coll} 時發生錯誤`,
      };
    }
  }

  return { cleared };
}
