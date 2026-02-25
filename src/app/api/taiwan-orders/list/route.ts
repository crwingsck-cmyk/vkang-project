import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/firebase-admin';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * 取得台灣訂單池列表（ADMIN 或 TAIWAN）
 * 使用 Admin SDK 繞過 Firestore 規則
 */
export async function GET(request: NextRequest) {
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
    const { role, uid } = result;
    if (role !== 'ADMIN' && role !== 'TAIWAN') {
      return NextResponse.json({ error: '僅總經銷商或台灣角色可檢視' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const filterUser = searchParams.get('filterUser') ?? '';

    const db = getAdminDb();
    const coll = db.collection('taiwanOrderPools');

    let pools: { id: string; [k: string]: unknown }[];
    if (role === 'TAIWAN' || filterUser === 'all') {
      const snapshot = await coll.limit(100).get();
      pools = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (Number((b as { createdAt?: number }).createdAt) || 0) - (Number((a as { createdAt?: number }).createdAt) || 0));
    } else {
      const targetUserId = filterUser || uid;
      const snapshot = await coll.where('userId', '==', targetUserId).limit(100).get();
      const sorted = snapshot.docs.sort((a, b) => (Number(b.data().createdAt) || 0) - (Number(a.data().createdAt) || 0));
      pools = sorted.map((doc) => ({ id: doc.id, ...doc.data() }));
    }

    return NextResponse.json({ pools });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '載入失敗';
    console.error('[taiwan-orders-list]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
