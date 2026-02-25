import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminToken } from '@/lib/firebase-admin';
import { getAdminDb } from '@/lib/firebase-admin';

function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 從台灣訂單池分配產品入庫（僅 ADMIN）
 */
export async function POST(
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
      return NextResponse.json({ error: '僅總經銷商可執行分配' }, { status: 403 });
    }

    const { id: poolId } = await params;
    if (!poolId) {
      return NextResponse.json({ error: '缺少訂單池 ID' }, { status: 400 });
    }

    const body = await request.json();
    const { quantity: qty } = body as { quantity?: number };
    const totalQty = Math.floor(Number(qty)) || 0;
    if (totalQty <= 0) {
      return NextResponse.json({ error: '請輸入有效的分配數量' }, { status: 400 });
    }

    const db = getAdminDb();
    const poolRef = db.collection('taiwanOrderPools').doc(poolId);
    const poolDoc = await poolRef.get();
    if (!poolDoc.exists) {
      return NextResponse.json({ error: '訂單池不存在' }, { status: 404 });
    }

    const poolData = poolDoc.data()!;
    const pool = { id: poolDoc.id, ...poolData } as unknown as { id: string; userId: string; totalOrdered: number; allocatedQuantity: number; remaining: number };
    if (pool.remaining <= 0) {
      return NextResponse.json({ error: '訂單池已無剩餘可分配' }, { status: 400 });
    }
    if (totalQty > pool.remaining) {
      return NextResponse.json({ error: `剩餘可分配 ${pool.remaining} 單位，無法分配 ${totalQty} 單位` }, { status: 400 });
    }

    // 台灣訂單 placeholder 產品：優先使用 WOW++ Joy + plus + light-22
    const TAIWAN_PLACEHOLDER = 'Wow+Joy123+Plus+Light-22';
    const productsSnap = await db.collection('products').where('isActive', '==', true).limit(100).get();
    const placeholderDoc = productsSnap.docs.find((d) => {
      const d2 = d.data();
      return d2?.name === TAIWAN_PLACEHOLDER || d2?.sku === TAIWAN_PLACEHOLDER;
    }) ?? productsSnap.docs[0];
    if (!placeholderDoc?.exists) {
      return NextResponse.json({ error: '請先建立至少一個產品' }, { status: 400 });
    }
    const placeholder = placeholderDoc.data();
    const productId = placeholderDoc.id;
    const productName = placeholder?.name ?? productId;
    const unitCost = Number(placeholder?.costPrice) || 0;

    const now = Date.now();
    const reference = `TAIWAN-ALLOC:${poolId}`;
    const invColl = db.collection('inventory');
    const batchColl = db.collection('inventoryBatches');
    const allocColl = db.collection('taiwanOrderAllocations');
    const invId = `${pool.userId}_${productId}`;
    const invDoc = await invColl.doc(invId).get();

    const movement = { date: now, type: 'in', quantity: totalQty, reference };
    const batchId = generateId('batch');
    await batchColl.doc(batchId).set({
      userId: pool.userId,
      productId,
      purchaseOrderId: poolId,
      quantity: totalQty,
      unitCost,
      receivedAt: now,
      createdAt: now,
    });

    if (invDoc.exists) {
      const inv = invDoc.data()!;
      const newQty = (inv.quantityOnHand ?? 0) + totalQty;
      const newAvail = (inv.quantityAvailable ?? 0) + totalQty;
      const status = inv.reorderLevel > 0 && newQty <= inv.reorderLevel ? 'low-stock' : 'in-stock';
      const movements = [...(inv.movements || []), movement];
      await invColl.doc(invId).update({
        quantityOnHand: newQty,
        quantityAvailable: newAvail,
        cost: unitCost,
        marketValue: newQty * unitCost,
        status,
        lastMovementDate: now,
        movements,
      });
    } else {
      await invColl.doc(invId).set({
        userId: pool.userId,
        productId,
        quantityOnHand: totalQty,
        quantityAllocated: 0,
        quantityAvailable: totalQty,
        quantityBorrowed: 0,
        quantityLent: 0,
        reorderLevel: 10,
        cost: unitCost,
        marketValue: unitCost * totalQty,
        status: 'in-stock',
        costingMethod: 'fifo',
        lastMovementDate: now,
        movements: [movement],
        createdAt: now,
        updatedAt: now,
      });
    }

    const allocId = generateId('alloc');
    await allocColl.doc(allocId).set({
      poolId,
      productId,
      productName,
      quantity: totalQty,
      unitCost,
      total: totalQty * unitCost,
      createdAt: now,
      createdBy: result.uid,
    });

    const newAllocated = pool.allocatedQuantity + totalQty;
    const newRemaining = pool.totalOrdered - newAllocated;
    const newStatus = newRemaining <= 0 ? 'fully_allocated' : 'partially_allocated';

    await poolRef.update({
      allocatedQuantity: newAllocated,
      remaining: newRemaining,
      status: newStatus,
      updatedAt: now,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '分配失敗';
    console.error('[taiwan-orders-allocate]', err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
