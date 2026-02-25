import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/firebase-admin';
import { getAdminDb } from '@/lib/firebase-admin';

const COLLECTIONS = [
  'inventoryBatches',
  'inventory',
  'purchaseOrders',
  'transactions',
  'financials',
] as const;

/**
 * ADMIN 清空所有業務資料（庫存、進貨單、訂單、財務紀錄）
 * 不刪除 users、products
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const idToken = authHeader?.replace('Bearer ', '');
    if (!idToken) {
      return NextResponse.json({ error: '未授權' }, { status: 401 });
    }
    const result = await verifyAdminToken(idToken);
    if (result?.error || result?.role !== 'ADMIN') {
      return NextResponse.json({ error: '僅 ADMIN 可執行此操作' }, { status: 403 });
    }

    const db = getAdminDb();
    const cleared: Record<string, number> = {};

    for (const collName of COLLECTIONS) {
      let count = 0;
      const coll = db.collection(collName);
      let snap = await coll.limit(500).get();
      while (!snap.empty) {
        const batch = db.batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        count += snap.size;
        snap = await coll.limit(500).get();
      }
      cleared[collName] = count;
    }

    return NextResponse.json({ ok: true, cleared });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '清空失敗';
    console.error('[data-clear]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
