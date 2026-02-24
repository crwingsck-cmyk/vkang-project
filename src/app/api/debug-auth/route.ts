import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/firebase-admin';

/**
 * 除錯用：檢查目前登入狀態與權限
 * 僅在 development 時可用
 */
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }
  const authHeader = request.headers.get('Authorization');
  const idToken = authHeader?.replace('Bearer ', '');
  if (!idToken) {
    return NextResponse.json({ error: '請在 Header 加上 Authorization: Bearer <token>' }, { status: 401 });
  }
  const result = await verifyAdminToken(idToken);
  return NextResponse.json({
    ok: !result?.error,
    uid: result?.uid || null,
    role: result?.role || null,
    error: result?.error || null,
  });
}
