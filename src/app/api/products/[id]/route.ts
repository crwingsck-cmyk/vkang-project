import * as admin from 'firebase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyAdminToken } from '@/lib/firebase-admin';

/**
 * GET /api/products/[id] - 取得單一產品（使用 Admin SDK，確保可讀取）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    const idToken = authHeader?.replace('Bearer ', '');
    if (!idToken) {
      return NextResponse.json({ error: '需要登入' }, { status: 401 });
    }

    getAdminDb();
    try {
      await admin.auth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: '登入已過期' }, { status: 401 });
    }

    const { id } = await params;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: '缺少產品 ID' }, { status: 400 });
    }

    const db = getAdminDb();
    let docSnap = await db.collection('products').doc(id).get();
    if (!docSnap.exists) {
      const bySku = await db.collection('products').where('sku', '==', id).limit(1).get();
      if (!bySku.empty) {
        docSnap = bySku.docs[0];
      } else {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      }
    }

    const data = docSnap.data();
    return NextResponse.json({
      id: docSnap.id,
      ...data,
    });
  } catch (err: unknown) {
    console.error('API products/[id] GET error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '伺服器錯誤' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/products/[id] - 更新產品（使用 Admin SDK，僅 ADMIN）
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('Authorization');
    const idToken = authHeader?.replace('Bearer ', '');
    if (!idToken) {
      return NextResponse.json({ error: '需要登入' }, { status: 401 });
    }

    const adminUser = await verifyAdminToken(idToken);
    if (adminUser?.error || adminUser?.role !== 'ADMIN') {
      return NextResponse.json({ error: '權限不足：需要 ADMIN' }, { status: 403 });
    }

    const { id } = await params;
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: '缺少產品 ID' }, { status: 400 });
    }

    const body = await request.json();
    const db = getAdminDb();
    let docSnap = await db.collection('products').doc(id).get();
    if (!docSnap.exists) {
      const bySku = await db.collection('products').where('sku', '==', id).limit(1).get();
      if (!bySku.empty) {
        docSnap = bySku.docs[0];
      } else {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      }
    }
    const docRef = db.collection('products').doc(docSnap.id);

    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };
    const allowed = ['name', 'category', 'description', 'unitPrice', 'costPrice', 'priceNote', 'unit', 'reorderLevel', 'reorderQuantity', 'packsPerBox', 'barcode'];
    for (const key of allowed) {
      if (body[key] !== undefined) {
        if (key === 'unitPrice' || key === 'costPrice') {
          const val = parseFloat(String(body[key]));
          updates[key] = !isNaN(val) ? val : 0;
        } else if (key === 'reorderLevel' || key === 'reorderQuantity') {
          const num = parseInt(String(body[key]), 10);
          updates[key] = !isNaN(num) ? num : 0;
        } else if (key === 'packsPerBox') {
          const raw = String(body[key] ?? '').trim();
          const num = raw ? parseInt(raw.replace(/\D/g, ''), 10) : undefined;
          if (num != null && num > 0) updates[key] = num;
        } else if (key === 'description' || key === 'priceNote' || key === 'barcode') {
          updates[key] = String(body[key] ?? '').trim();
        } else {
          updates[key] = body[key];
        }
      }
    }

    const clean = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );
    await docRef.update(clean);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('API products/[id] PATCH error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '伺服器錯誤' },
      { status: 500 }
    );
  }
}
