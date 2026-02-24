import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { verifyAdminToken } from '@/lib/firebase-admin';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * ADMIN 永久刪除使用者及其所有相關資料
 * 包含：Firebase Auth、Firestore 使用者、庫存、進貨單、訂單
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

    const body = await request.json();
    const { uid } = body;
    if (!uid) {
      return NextResponse.json({ error: '缺少 uid' }, { status: 400 });
    }

    // 禁止刪除自己
    if (uid === result.uid) {
      return NextResponse.json({ error: '無法刪除自己的帳號' }, { status: 400 });
    }

    const db = getAdminDb();

    async function deleteByField(collName: string, field: string, value: string) {
      const coll = db.collection(collName);
      let snap = await coll.where(field, '==', value).limit(400).get();
      while (!snap.empty) {
        const b = db.batch();
        snap.docs.forEach((d) => b.delete(d.ref));
        await b.commit();
        snap = await coll.where(field, '==', value).limit(400).get();
      }
    }

    // 1. 刪除庫存
    await deleteByField('inventory', 'userId', uid);

    // 2. 刪除庫存批次
    await deleteByField('inventoryBatches', 'userId', uid);

    // 3. 刪除進貨單
    await deleteByField('purchaseOrders', 'userId', uid);
    await deleteByField('purchaseOrders', 'fromUserId', uid);

    // 4. 刪除訂單（fromUser 或 toUser）
    const txnColl = db.collection('transactions');
    while (true) {
      const fromSnap = await txnColl.where('fromUser.userId', '==', uid).limit(400).get();
      const toSnap = await txnColl.where('toUser.userId', '==', uid).limit(400).get();
      const seen = new Set<string>();
      const docs = [...fromSnap.docs, ...toSnap.docs].filter((d) => {
        if (seen.has(d.id)) return false;
        seen.add(d.id);
        return true;
      });
      if (docs.length === 0) break;
      const b = db.batch();
      docs.forEach((d) => b.delete(d.ref));
      await b.commit();
    }

    // 5. 刪除 Firestore 使用者
    await db.collection('users').doc(uid).delete();

    // 6. 刪除 Firebase Auth 使用者
    await admin.auth().deleteUser(uid);

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '刪除失敗';
    console.error('[delete-user]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
