import { NextRequest, NextResponse } from 'next/server';
import type { DocumentSnapshot, QuerySnapshot } from 'firebase-admin/firestore';
import { verifyToken, getAdminDb } from '@/lib/firebase-admin';
import { TransactionItem } from '@/types/models';

/**
 * 檢查供應鏈缺貨（沿 parentUserId 往上找缺貨瓶頸）
 * POST body: { sellerUserId: string, items: TransactionItem[] }
 */
export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { sellerUserId, items } = body as { sellerUserId: string; items: TransactionItem[] };
    if (!sellerUserId || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: '缺少 sellerUserId 或 items' }, { status: 400 });
    }

    const db = getAdminDb();
    const shortages: { productId: string; productName: string; need: number; have: number; shortageAt: string; shortageUserId: string }[] = [];

    const bulkItems = items.filter((i) => i.productName === '批量進貨');
    const normalItems = items.filter((i) => i.productName !== '批量進貨');

    if (bulkItems.length > 0) {
      const bulkNeed = bulkItems.reduce((s, i) => s + i.quantity, 0);
      const shortageNode = await findShortageNodeByTotal(db, sellerUserId, bulkNeed);
      if (shortageNode) {
        shortages.push({
          productId: bulkItems[0].productId,
          productName: '批量進貨',
          need: bulkNeed,
          have: shortageNode.totalHave,
          shortageAt: shortageNode.displayName,
          shortageUserId: shortageNode.userId,
        });
      }
    }

    for (const item of normalItems) {
      const { productId, productName, quantity } = item;
      const need = quantity;

      const shortageNode = await findShortageNode(db, sellerUserId, productId, need);
      if (!shortageNode) continue;

      const invDoc = await db.collection('inventory').doc(`${shortageNode.userId}_${productId}`).get();
      const have = invDoc?.data()?.quantityOnHand ?? 0;

      shortages.push({
        productId,
        productName,
        need,
        have,
        shortageAt: shortageNode.displayName,
        shortageUserId: shortageNode.userId,
      });
    }

    return NextResponse.json({ ok: shortages.length === 0, shortages });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '檢查失敗';
    console.error('[supply-chain-shortage]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function findShortageNode(
  db: ReturnType<typeof getAdminDb>,
  startUserId: string,
  productId: string,
  need: number
): Promise<{ userId: string; displayName: string } | null> {
  let currentUserId: string | null = startUserId;
  let lastShortage: { userId: string; displayName: string } | null = null;

  while (currentUserId) {
    const invDoc = await db.collection('inventory').doc(`${currentUserId}_${productId}`).get();
    const have = invDoc?.data()?.quantityOnHand ?? 0;

    let userData: { displayName?: string; parentUserId?: string } | null = null;
    const userDoc: DocumentSnapshot = await db.collection('users').doc(currentUserId).get();
    if (userDoc.exists) {
      userData = userDoc.data()!;
    } else {
      const byEmail: QuerySnapshot = await db.collection('users').where('email', '==', currentUserId).limit(1).get();
      if (!byEmail.empty) userData = byEmail.docs[0].data();
    }
    const displayName = userData?.displayName || currentUserId;

    if (have < need) {
      lastShortage = { userId: currentUserId, displayName };
    } else {
      break;
    }

    if (!userData) break;
    const parentId = userData.parentUserId ?? null;
    if (!parentId) break;
    currentUserId = parentId;
  }

  return lastShortage;
}

async function findShortageNodeByTotal(
  db: ReturnType<typeof getAdminDb>,
  startUserId: string,
  need: number
): Promise<{ userId: string; displayName: string; totalHave: number } | null> {
  let currentUserId: string | null = startUserId;
  let lastShortage: { userId: string; displayName: string; totalHave: number } | null = null;

  while (currentUserId) {
    const invSnap = await db.collection('inventory').where('userId', '==', currentUserId).get();
    const totalHave = invSnap.docs.reduce((s, d) => s + (d.data()?.quantityOnHand ?? 0), 0);

    let userData: { displayName?: string; parentUserId?: string } | null = null;
    const userDoc: DocumentSnapshot = await db.collection('users').doc(currentUserId).get();
    if (userDoc.exists) {
      userData = userDoc.data()!;
    } else {
      const byEmail: QuerySnapshot = await db.collection('users').where('email', '==', currentUserId).limit(1).get();
      if (!byEmail.empty) userData = byEmail.docs[0].data();
    }
    const displayName = userData?.displayName || currentUserId;

    if (totalHave < need) {
      lastShortage = { userId: currentUserId, displayName, totalHave };
    } else {
      break;
    }

    if (!userData) break;
    const parentId = userData.parentUserId ?? null;
    if (!parentId) break;
    currentUserId = parentId;
  }

  return lastShortage;
}
