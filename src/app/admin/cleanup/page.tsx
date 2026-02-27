'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { OrderService } from '@/services/database/orders';
import { FirestoreService } from '@/services/database/base';
import { TransactionType, UserRole } from '@/types/models';

// ============================================================
// ONE-TIME CLEANUP v2: Fix Tan Ai Sun inventory discrepancy
// Current broken state: Plus(VKANG-002)=2, TEMP(VKANG-005)=33
// Target state:         Plus=DELETED,       TEMP=34
// Strategy:
//   1. Direct-delete Plus inventory doc via known ID (${userId}_VKANG-002)
//   2. Direct-set TEMP inventory doc to qty=34 via known ID (${userId}_VKANG-005)
//   3. Delete ALL ADJUSTMENT transactions that contain Plus items for this user
// ============================================================

const TEMP_SKU = 'VKANG-005';
const PLUS_SKU = 'VKANG-002';
const TARGET_TEMP_QTY = 34;

export default function CleanupPage() {
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  function addLog(msg: string) {
    setLog((prev) => [...prev, msg]);
  }

  async function doCleanup() {
    setRunning(true);
    setLog([]);
    setDone(false);

    try {
      // Step 1: Find Tan Ai Sun
      addLog('Step 1: 查找 Tan Ai Sun 帳號...');
      const [admins, stockists] = await Promise.all([
        UserService.getAdmins(),
        UserService.getStockists(),
      ]);
      const allUsers = [...admins, ...stockists];
      const user = allUsers.find((u) =>
        (u.displayName ?? '').toLowerCase().includes('tan ai sun')
      );
      if (!user?.id) {
        addLog('❌ 找不到 Tan Ai Sun 用戶，請確認 displayName 是否正確');
        setRunning(false);
        return;
      }
      addLog(`✓ 找到: ${user.displayName} (userId: ${user.id})`);

      // Step 2: Direct-delete Plus inventory (by known document ID, bypasses query cache)
      const plusDocId = `${user.id}_${PLUS_SKU}`;
      addLog(`\nStep 2: 直接刪除 Plus 庫存文件（docId=${plusDocId}）...`);
      const plusInv = await FirestoreService.get('inventory', plusDocId);
      if (plusInv) {
        addLog(`  找到 Plus 庫存: qty=${(plusInv as Record<string, unknown>).quantityOnHand}，刪除中...`);
        await FirestoreService.delete('inventory', plusDocId);
        addLog(`  ✓ Plus 庫存已刪除`);
      } else {
        addLog(`  ℹ️ Plus 庫存文件不存在（已清理過）`);
      }

      // Step 3: Direct-set TEMP inventory to exactly 34
      const tempDocId = `${user.id}_${TEMP_SKU}`;
      addLog(`\nStep 3: 直接設定 TEMP 庫存為 ${TARGET_TEMP_QTY}（docId=${tempDocId}）...`);
      const tempInv = await FirestoreService.get('inventory', tempDocId);
      if (tempInv) {
        const currentQty = (tempInv as Record<string, unknown>).quantityOnHand;
        addLog(`  當前 TEMP qty=${currentQty}，強制設定為 ${TARGET_TEMP_QTY}...`);
        await FirestoreService.update('inventory', tempDocId, {
          quantityOnHand: TARGET_TEMP_QTY,
          quantityAvailable: TARGET_TEMP_QTY,
          quantityReserved: 0,
        });
        addLog(`  ✓ TEMP 庫存已設定為 ${TARGET_TEMP_QTY}`);
      } else {
        addLog(`  ❌ 找不到 TEMP 庫存文件 (${tempDocId})，請確認 SKU 是否正確`);
      }

      // Step 4: Delete ALL ADJUSTMENT transactions with Plus items for this user
      addLog(`\nStep 4: 查找所有含 Plus(${PLUS_SKU}) 的 ADJUSTMENT 交易...`);
      const txns = await OrderService.getByUserRelated(user.id, 500);
      const plusTxns = (txns as (typeof txns[0] & { id: string })[]).filter((t) =>
        t.transactionType === TransactionType.ADJUSTMENT &&
        t.fromUser?.userId === user.id &&
        t.items?.some((i) => i.productId === PLUS_SKU)
      );
      addLog(`  找到 ${plusTxns.length} 筆含 Plus 的 ADJUSTMENT 交易`);

      let deletedTxn = 0;
      for (const txn of plusTxns) {
        addLog(
          `  強制刪除: poNumber=${txn.poNumber ?? '(無)'}, ` +
          `items=[${txn.items?.map((i) => `${i.productId}×${i.quantity}`).join(', ')}], ` +
          `docId=${txn.id}`
        );
        await FirestoreService.delete('transactions', txn.id);
        addLog(`  ✓ 已刪除`);
        deletedTxn++;
      }
      addLog(`  交易清理完成，共刪除 ${deletedTxn} 筆 Plus 相關 ADJUSTMENT`);

      // Step 5: Verify by direct document lookup
      addLog('\nStep 5: 驗證結果...');
      const [finalPlus, finalTemp] = await Promise.all([
        FirestoreService.get('inventory', plusDocId),
        FirestoreService.get('inventory', tempDocId),
      ]);

      const plusQty = finalPlus ? (finalPlus as Record<string, unknown>).quantityOnHand : '(已刪除)';
      const tempQty = finalTemp ? (finalTemp as Record<string, unknown>).quantityOnHand : '(未找到)';

      addLog(`  Plus (${PLUS_SKU}): ${plusQty}`);
      addLog(`  TEMP (${TEMP_SKU}): ${tempQty}`);

      if (!finalPlus && tempQty === TARGET_TEMP_QTY) {
        addLog(`\n✅ 清理完成！Tan Ai Sun 庫存 = TEMP ${TARGET_TEMP_QTY}，Plus 已刪除`);
        setDone(true);
      } else {
        addLog(`\n⚠️ 結果異常，請確認：Plus 應為「已刪除」，TEMP 應為 ${TARGET_TEMP_QTY}`);
        setDone(true);
      }
    } catch (err) {
      addLog(`\n❌ 錯誤: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    doCleanup();
  }, []);

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="min-h-screen bg-gray-900 text-green-400 p-8 font-mono">
        <h1 className="text-xl font-bold text-white mb-2">Admin Cleanup Tool v2</h1>
        <p className="text-gray-400 text-sm mb-1">
          目標：Tan Ai Sun 庫存 = TEMP(VKANG-005) 34，無 Plus(VKANG-002)
        </p>
        <p className="text-yellow-500 text-xs mb-6">
          ⚡ 直接修改 Firestore 文件（繞過查詢快取），刪除所有 Plus ADJUSTMENT 交易
        </p>

        {running && (
          <div className="flex items-center gap-2 mb-4 text-yellow-400">
            <div className="animate-spin h-4 w-4 border-t-2 border-yellow-400 rounded-full" />
            <span>執行中...</span>
          </div>
        )}

        <div className="bg-black border border-gray-700 rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap min-h-[300px]">
          {log.length === 0 ? <span className="text-gray-600">等待中...</span> : log.join('\n')}
        </div>

        {done && (
          <div className="mt-6 space-y-3">
            <div className="bg-green-900/30 border border-green-700 rounded-lg px-4 py-3 text-green-300 text-sm">
              清理完成！請返回 Hierarchy → Tan Ai Sun 確認 running balance = 34，且庫存只有 TEMP 34
            </div>
            <button
              type="button"
              onClick={doCleanup}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm"
            >
              重新執行（確認冪等性）
            </button>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
