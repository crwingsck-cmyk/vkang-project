import { NextRequest, NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import { verifyAdminToken } from '@/lib/firebase-admin';
import { getAdminDb } from '@/lib/firebase-admin';

/**
 * ADMIN 修改使用者 Email
 * 需同時更新 Firebase Auth 與 Firestore
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
    const { uid, newEmail } = body;
    if (!uid || !newEmail || typeof newEmail !== 'string') {
      return NextResponse.json({ error: '缺少 uid 或 newEmail' }, { status: 400 });
    }
    const email = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Email 格式不正確' }, { status: 400 });
    }

    // 更新 Firebase Auth（verifyAdminToken 已初始化 Admin SDK）
    getAdminDb(); // 確保已初始化
    await admin.auth().updateUser(uid, { email, emailVerified: true });

    // 更新 Firestore
    const db = getAdminDb();
    await db.collection('users').doc(uid).update({ email, updatedAt: Date.now() });

    return NextResponse.json({ success: true, email });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '更新失敗';
    if (msg.includes('email-already-in-use') || msg.includes('already exists')) {
      return NextResponse.json({ error: '此 Email 已被其他帳號使用' }, { status: 400 });
    }
    console.error('[update-email]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
