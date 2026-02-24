import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, verifyAdminToken } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const idToken = authHeader?.replace('Bearer ', '');
    if (!idToken) {
      return NextResponse.json(
        { error: '需要登入才能建立產品' },
        { status: 401 }
      );
    }

    const adminUser = await verifyAdminToken(idToken);
    if (!adminUser || adminUser.error) {
      const msg = adminUser?.error === 'USER_NOT_FOUND'
        ? '找不到您的帳號資料，請確認已在 Firestore users 建立文件'
        : adminUser?.error === 'ROLE_NOT_ADMIN'
        ? `權限不足：您的角色為「${adminUser.role || '未設定'}」，需要 ADMIN`
        : adminUser?.error === 'TOKEN_INVALID'
        ? '登入已過期，請重新登入'
        : '權限不足：需要 ADMIN 角色';
      return NextResponse.json({ error: msg }, { status: 403 });
    }

    const body = await request.json();
    const {
      sku,
      name,
      category,
      description,
      unitPrice,
      costPrice,
      priceNote,
      unit,
      reorderLevel,
      reorderQuantity,
      packsPerBox,
      barcode,
      isActive,
    } = body;

    if (!sku || !name || !category || unitPrice == null || costPrice == null) {
      return NextResponse.json(
        { error: '缺少必填欄位：SKU、名稱、分類、售價、成本' },
        { status: 400 }
      );
    }

    const skuClean = String(sku).toUpperCase().trim();
    if (/[\/\\#%?]/.test(skuClean)) {
      return NextResponse.json(
        { error: 'SKU 不可包含特殊字元' },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const productData = {
      sku: skuClean,
      name: String(name).trim(),
      category: String(category),
      description: description ? String(description).trim() : null,
      unitPrice: parseFloat(String(unitPrice)),
      costPrice: parseFloat(String(costPrice)),
      priceNote: priceNote ? String(priceNote).trim() : undefined,
      unit: unit || 'pcs',
      reorderLevel: parseInt(String(reorderLevel || 10), 10),
      reorderQuantity: parseInt(String(reorderQuantity || 50), 10),
      packsPerBox: packsPerBox != null && packsPerBox !== '' ? parseInt(String(packsPerBox), 10) : undefined,
      barcode: barcode ? String(barcode).trim() : null,
      isActive: isActive !== false,
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: adminUser.uid,
    };

    const db = getAdminDb();
    const docRef = db.collection('products').doc(skuClean);
    const existSnap = await docRef.get();
    // 若已存在且為啟用狀態，則不允許重複
    if (existSnap.exists) {
      const existing = existSnap.data();
      if (existing?.isActive !== false) {
        return NextResponse.json(
          { error: '此 SKU 已存在' },
          { status: 409 }
        );
      }
      // 已軟刪除的產品：允許覆蓋並重新啟用
    }

    const cleanData = Object.fromEntries(
      Object.entries(productData).filter(([, v]) => v !== null && v !== undefined && !Number.isNaN(v))
    );
    await docRef.set(cleanData);

    return NextResponse.json({ success: true, id: skuClean });
  } catch (err: unknown) {
    console.error('API products/create error:', err);
    const message = err instanceof Error ? err.message : '伺服器錯誤';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
