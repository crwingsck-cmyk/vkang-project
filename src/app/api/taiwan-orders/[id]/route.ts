import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, verifyAdminToken } from '@/lib/firebase-admin';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * 取得台灣訂單池詳情與分配記錄（ADMIN 或 TAIWAN）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    const idToken = authHeader?.replace('Bearer ', '');
    if (!idToken) {
      return NextResponse.json({ error: '未授權' }, { status: 401 });
    }
    const result = await verifyToken(idToken);
    if (result?.error || !result) {
      return NextResponse.json({ error: '驗證失敗' }, { status: 401 });
    }
    const { role } = result;
    if (role !== 'ADMIN' && role !== 'TAIWAN') {
      return NextResponse.json({ error: '僅總經銷商或台灣角色可檢視' }, { status: 403 });
    }

    const { id: poolId } = await params;
    if (!poolId) {
      return NextResponse.json({ error: '缺少訂單池 ID' }, { status: 400 });
    }

    const db = getAdminDb();
    const poolDoc = await db.collection('taiwanOrderPools').doc(poolId).get();
    if (!poolDoc.exists) {
      return NextResponse.json({ error: '訂單池不存在' }, { status: 404 });
    }

    const pool = { id: poolDoc.id, ...poolDoc.data() };

    const allocSnap = await db
      .collection('taiwanOrderAllocations')
      .where('poolId', '==', poolId)
      .get();

    const allocations = allocSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    return NextResponse.json({ pool, allocations });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '載入失敗';
    console.error('[taiwan-orders-detail]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * 刪除台灣訂單池（僅 ADMIN，且須為該訂單池所屬總經銷商）
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    const idToken = authHeader?.replace('Bearer ', '');
    if (!idToken) {
      return NextResponse.json({ error: '未授權' }, { status: 401 });
    }
    const result = await verifyAdminToken(idToken);
    if (result?.error || result?.role !== 'ADMIN') {
      return NextResponse.json({ error: '僅總經銷商可刪除訂單池' }, { status: 403 });
    }

    const { id: poolId } = await params;
    if (!poolId) {
      return NextResponse.json({ error: '缺少訂單池 ID' }, { status: 400 });
    }

    const db = getAdminDb();
    const poolRef = db.collection('taiwanOrderPools').doc(poolId);
    const poolDoc = await poolRef.get();
    if (!poolDoc.exists) {
      return NextResponse.json({ error: '訂單池不存在' }, { status: 404 });
    }

    const poolData = poolDoc.data()!;
    const poolUserId = poolData.userId as string;
    if (poolUserId !== result.uid) {
      return NextResponse.json({ error: '僅能刪除自己的訂單池' }, { status: 403 });
    }

    const allocSnap = await db.collection('taiwanOrderAllocations').where('poolId', '==', poolId).get();
    const batch = db.batch();
    for (const doc of allocSnap.docs) {
      batch.delete(doc.ref);
    }
    batch.delete(poolRef);
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '刪除失敗';
    console.error('[taiwan-orders-delete]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
