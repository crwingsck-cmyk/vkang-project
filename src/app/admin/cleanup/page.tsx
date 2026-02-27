'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { InventoryService } from '@/services/database/inventory';
import { OrderService } from '@/services/database/orders';
import { FirestoreService } from '@/services/database/base';
import { TransactionType, UserRole } from '@/types/models';

// ============================================================
// ONE-TIME CLEANUP: Fix Tan Ai Sun inventory discrepancy
// Target state: TEMP(VKANG-005)=34, no Plus, running balance=34
// Actions:
//   1. Delete any inventory document for Tan Ai Sun that is not VKANG-005
//   2. Force-delete the ghost "PO-0" ADJUSTMENT transaction (Plus, no-rollback)
// ============================================================

const TEMP_SKU = 'VKANG-005';
const GHOST_PO_NUMBER = 'PO-0';

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

      // Step 2: Delete non-TEMP inventory documents
      addLog(`\nStep 2: 清理庫存（保留 ${TEMP_SKU}，刪除其他）...`);
      const inventory = await InventoryService.getByUser(user.id, 200);
      addLog(`  共找到 ${inventory.length} 筆庫存記錄`);

      let deletedInv = 0;
      for (const inv of inventory) {
        if (inv.productId !== TEMP_SKU) {
          addLog(`  刪除庫存: ${inv.productId}（qty=${inv.quantityOnHand}, docId=${inv.id}）`);
          await FirestoreService.delete('inventory', inv.id);
          addLog(`  ✓ 已刪除`);
          deletedInv++;
        } else {
          addLog(`  保留: ${inv.productId}（qty=${inv.quantityOnHand}）✓`);
        }
      }
      addLog(`  庫存清理完成，刪除了 ${deletedInv} 筆非臨時品記錄`);

      // Step 3: Force-delete ghost PO-0 transaction (no inventory rollback)
      addLog(`\nStep 3: 查找幽靈交易 (poNumber="${GHOST_PO_NUMBER}", 產品非TEMP)...`);
      const txns = await OrderService.getByUserRelated(user.id, 300);
      const ghosts = (txns as (typeof txns[0] & { id: string })[]).filter((t) =>
        t.transactionType === TransactionType.ADJUSTMENT &&
        t.fromUser?.userId === user.id &&
        t.poNumber === GHOST_PO_NUMBER &&
        t.items?.some((i) => i.productId !== TEMP_SKU)
      );
      addLog(`  找到 ${ghosts.length} 筆幽靈交易`);

      let deletedTxn = 0;
      for (const txn of ghosts) {
        addLog(`  強制刪除: poNumber=${txn.poNumber}, items=[${txn.items?.map((i) => i.productId).join(',')}], docId=${txn.id}`);
        await FirestoreService.delete('transactions', txn.id);
        addLog(`  ✓ 已刪除`);
        deletedTxn++;
      }
      addLog(`  交易清理完成，刪除了 ${deletedTxn} 筆幽靈交易`);

      // Step 4: Verify
      addLog('\nStep 4: 驗證結果...');
      const finalInv = await InventoryService.getByUser(user.id, 200);
      addLog(`  剩餘庫存: ${finalInv.length} 筆`);
      for (const inv of finalInv) {
        addLog(`  - ${inv.productId}: qty=${inv.quantityOnHand}`);
      }

      const tempInv = finalInv.find((i) => i.productId === TEMP_SKU);
      if (tempInv?.quantityOnHand === 34) {
        addLog('\n✅ 清理完成！Tan Ai Sun 庫存 = TEMP 34，無其他產品');
      } else {
        addLog(`\n⚠️ 清理完成，但請手動確認庫存: TEMP=${tempInv?.quantityOnHand ?? '未找到'}`);
      }

      setDone(true);
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
        <h1 className="text-xl font-bold text-white mb-2">Admin Cleanup Tool</h1>
        <p className="text-gray-400 text-sm mb-6">
          一次性清理：移除 Tan Ai Sun 的非臨時品庫存及幽靈交易記錄
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
              ✅ 清理完成！請返回 Hierarchy → Tan Ai Sun 確認 running balance = 34
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
