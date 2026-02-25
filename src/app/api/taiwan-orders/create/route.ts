import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/firebase-admin';
import { getAdminDb } from '@/lib/firebase-admin';

function generatePoolId(): string {
  const ts = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `tw_${ts}_${r}`;
}

/**
 * 總經銷商（ADMIN）建立台灣訂單池
 * 使用 Admin SDK 繞過 Firestore 規則，避免權限問題
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
      return NextResponse.json({ error: '僅總經銷商（ADMIN）可向台灣下訂單' }, { status: 403 });
    }

    const body = await request.json();
    const { totalOrdered, poNumber, notes, userName } = body;
    const uid = result.uid;

    if (!totalOrdered || totalOrdered <= 0) {
      return NextResponse.json({ error: '訂購數量須大於 0' }, { status: 400 });
    }

    const now = Date.now();
    const poolId = generatePoolId();
    const pool = {
      userId: uid,
      userName: userName || undefined,
      totalOrdered: Number(totalOrdered),
      allocatedQuantity: 0,
      remaining: Number(totalOrdered),
      supplierName: '台灣',
      poNumber: (poNumber || '').trim() || undefined,
      status: 'pending',
      notes: (notes || '').trim() || undefined,
      createdAt: now,
      updatedAt: now,
      createdBy: uid,
    };

    const db = getAdminDb();
    await db.collection('taiwanOrderPools').doc(poolId).set(pool);

    return NextResponse.json({ success: true, id: poolId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '建立失敗';
    console.error('[taiwan-orders-create]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
