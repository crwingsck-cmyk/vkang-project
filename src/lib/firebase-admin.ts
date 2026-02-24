/**
 * Firebase Admin SDK - 僅在伺服器端使用
 * 用於 API Routes，可繞過 Firestore 安全規則
 */

import * as admin from 'firebase-admin';
import * as path from 'path';
import * as fs from 'fs';

function initializeFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  // 方式 1：使用 JSON 檔案（推薦，較簡單）
  const jsonPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(process.cwd(), 'firebase-service-account.json');
  if (fs.existsSync(jsonPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    return admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }

  // 方式 2：使用環境變數
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (privateKey && clientEmail && projectId) {
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }

  throw new Error(
    '缺少 Firebase Admin 設定。請擇一：\n' +
    '1. 將服務帳戶 JSON 存為 firebase-service-account.json 放在專案根目錄\n' +
    '2. 或在 .env.local 加入 FIREBASE_PRIVATE_KEY 和 FIREBASE_CLIENT_EMAIL'
  );
}

export function getAdminDb() {
  initializeFirebaseAdmin();
  return admin.firestore();
}

export async function verifyAdminToken(idToken: string): Promise<{ uid: string; role: string; error?: string } | null> {
  try {
    initializeFirebaseAdmin();
    const decoded = await admin.auth().verifyIdToken(idToken);
    const db = admin.firestore();
    let userDoc = await db.collection('users').doc(decoded.uid).get();
    if (!userDoc.exists && decoded.email) {
      const byEmail = await db.collection('users').where('email', '==', decoded.email).limit(1).get();
      if (!byEmail.empty) userDoc = byEmail.docs[0];
    }
    if (!userDoc.exists) {
      console.warn('[verifyAdminToken] User document not found. uid:', decoded.uid, 'email:', decoded.email);
      return { uid: decoded.uid, role: '', error: 'USER_NOT_FOUND' };
    }
    const data = userDoc.data() || {};
    const roleRaw = data.role ?? data.permissions?.role ?? (typeof data.permissions === 'object' ? data.permissions?.role : null);
    const role = String(roleRaw ?? '').toUpperCase();
    if (role !== 'ADMIN') {
      console.warn('[verifyAdminToken] User role is not ADMIN. uid:', decoded.uid, 'data:', JSON.stringify(data));
      return { uid: decoded.uid, role: role || 'NONE', error: 'ROLE_NOT_ADMIN' };
    }
    return { uid: decoded.uid, role: 'ADMIN' };
  } catch (err) {
    console.error('[verifyAdminToken] Error:', err);
    return { uid: '', role: '', error: 'TOKEN_INVALID' };
  }
}
