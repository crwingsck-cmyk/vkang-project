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
      addLog('Step 1: Looking up Tan Ai Sun...');
      const [admins, stockists] = await Promise.all([
        UserService.getAdmins(),
        UserService.getStockists(),
      ]);
      const allUsers = [...admins, ...stockists];
      const user = allUsers.find((u) =>
        (u.displayName ?? '').toLowerCase().includes('tan ai sun')
      );
      if (!user?.id) {
        addLog('❌ Tan Ai Sun not found, check displayName');
        setRunning(false);
        return;
      }
      addLog(`✓ Found: ${user.displayName} (userId: ${user.id})`);

      // Step 2: Direct-delete Plus inventory (by known document ID, bypasses query cache)
      const plusDocId = `${user.id}_${PLUS_SKU}`;
      addLog(`\nStep 2: Deleting Plus inventory (docId=${plusDocId})...`);
      const plusInv = await FirestoreService.get('inventory', plusDocId);
      if (plusInv) {
        addLog(`  Found Plus inventory: qty=${(plusInv as Record<string, unknown>).quantityOnHand}, deleting...`);
        await FirestoreService.delete('inventory', plusDocId);
        addLog(`  ✓ Plus inventory deleted`);
      } else {
        addLog(`  ℹ️ Plus inventory doc not found (already cleaned)`);
      }

      // Step 3: Direct-set TEMP inventory to exactly 34
      const tempDocId = `${user.id}_${TEMP_SKU}`;
      addLog(`\nStep 3: Setting TEMP inventory to ${TARGET_TEMP_QTY} (docId=${tempDocId})...`);
      const tempInv = await FirestoreService.get('inventory', tempDocId);
      if (tempInv) {
        const currentQty = (tempInv as Record<string, unknown>).quantityOnHand;
        addLog(`  Current TEMP qty=${currentQty}, setting to ${TARGET_TEMP_QTY}...`);
        await FirestoreService.update('inventory', tempDocId, {
          quantityOnHand: TARGET_TEMP_QTY,
          quantityAvailable: TARGET_TEMP_QTY,
          quantityReserved: 0,
        });
        addLog(`  ✓ TEMP inventory set to ${TARGET_TEMP_QTY}`);
      } else {
        addLog(`  ❌ TEMP inventory doc not found (${tempDocId}), check SKU`);
      }

      // Step 4: Delete ALL ADJUSTMENT transactions with Plus items for this user
      addLog(`\nStep 4: Finding ADJUSTMENT transactions with Plus(${PLUS_SKU})...`);
      const txns = await OrderService.getByUserRelated(user.id, 500);
      const plusTxns = (txns as (typeof txns[0] & { id: string })[]).filter((t) =>
        t.transactionType === TransactionType.ADJUSTMENT &&
        t.fromUser?.userId === user.id &&
        t.items?.some((i) => i.productId === PLUS_SKU)
      );
      addLog(`  Found ${plusTxns.length} ADJUSTMENT transaction(s) with Plus`);

      let deletedTxn = 0;
      for (const txn of plusTxns) {
        addLog(
          `  Deleting: poNumber=${txn.poNumber ?? '(none)'}, ` +
          `items=[${txn.items?.map((i) => `${i.productId}×${i.quantity}`).join(', ')}], ` +
          `docId=${txn.id}`
        );
        await FirestoreService.delete('transactions', txn.id);
        addLog(`  ✓ Deleted`);
        deletedTxn++;
      }
      addLog(`  Cleanup done, deleted ${deletedTxn} Plus ADJUSTMENT(s)`);

      // Step 5: Verify by direct document lookup
      addLog('\nStep 5: Verifying...');
      const [finalPlus, finalTemp] = await Promise.all([
        FirestoreService.get('inventory', plusDocId),
        FirestoreService.get('inventory', tempDocId),
      ]);

      const plusQty = finalPlus ? (finalPlus as Record<string, unknown>).quantityOnHand : '(deleted)';
      const tempQty = finalTemp ? (finalTemp as Record<string, unknown>).quantityOnHand : '(not found)';

      addLog(`  Plus (${PLUS_SKU}): ${plusQty}`);
      addLog(`  TEMP (${TEMP_SKU}): ${tempQty}`);

      if (!finalPlus && tempQty === TARGET_TEMP_QTY) {
        addLog(`\n✅ Cleanup done! Tan Ai Sun inventory = TEMP ${TARGET_TEMP_QTY}, Plus deleted`);
        setDone(true);
      } else {
        addLog(`\n⚠️ Unexpected result: Plus should be "deleted", TEMP should be ${TARGET_TEMP_QTY}`);
        setDone(true);
      }
    } catch (err) {
      addLog(`\n❌ Error: ${err instanceof Error ? err.message : String(err)}`);
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
          Target: Tan Ai Sun inventory = TEMP(VKANG-005) 34, no Plus(VKANG-002)
        </p>
        <p className="text-yellow-500 text-xs mb-6">
          ⚡ Direct Firestore edit (bypass query cache), delete all Plus ADJUSTMENT transactions
        </p>

        {running && (
          <div className="flex items-center gap-2 mb-4 text-yellow-400">
            <div className="animate-spin h-4 w-4 border-t-2 border-yellow-400 rounded-full" />
            <span>Running...</span>
          </div>
        )}

        <div className="bg-black border border-gray-700 rounded-lg p-4 text-sm leading-relaxed whitespace-pre-wrap min-h-[300px]">
          {log.length === 0 ? <span className="text-gray-600">Waiting...</span> : log.join('\n')}
        </div>

        {done && (
          <div className="mt-6 space-y-3">
            <div className="bg-green-900/30 border border-green-700 rounded-lg px-4 py-3 text-green-300 text-sm">
              Cleanup done! Return to Hierarchy → Tan Ai Sun to verify running balance = 34, inventory = TEMP 34 only
            </div>
            <button
              type="button"
              onClick={doCleanup}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm"
            >
              Re-run (verify idempotency)
            </button>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
