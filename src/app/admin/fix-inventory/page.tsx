'use client';

import { useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { UserService } from '@/services/database/users';
import { FirestoreService } from '@/services/database/base';
import { UserRole } from '@/types/models';

export default function FixInventoryPage() {
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);

  function addLog(msg: string) {
    setLog((prev) => [...prev, msg]);
  }

  async function doFix() {
    setRunning(true);
    setLog([]);
    try {
      addLog('查找 魏碧華...');
      const all = await UserService.getAll(500);
      const user = all.find((u) => (u.displayName ?? '').includes('魏碧華'));
      if (!user?.id) {
        addLog('❌ 找不到魏碧華，請確認 displayName');
        return;
      }
      addLog(`✓ ${user.displayName} (${user.id})`);

      const docId = `${user.id}_VKANG-005`;
      const inv = await FirestoreService.get('inventory', docId);
      if (!inv) {
        addLog(`❌ 找不到庫存文件 ${docId}`);
        return;
      }
      const data = inv as Record<string, unknown>;
      const reserved = (data.quantityReserved as number) ?? 0;
      addLog(`當前 quantityOnHand=${data.quantityOnHand}, reserved=${reserved}`);

      await FirestoreService.update('inventory', docId, {
        quantityOnHand: 131,
        quantityAvailable: 131 - reserved,
      });
      addLog('✅ 已更新 quantityOnHand=131');
    } catch (err) {
      addLog(`❌ ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <ProtectedRoute requiredRoles={[UserRole.ADMIN]}>
      <div className="min-h-screen bg-gray-900 text-green-400 p-8 font-mono">
        <h1 className="text-xl font-bold text-white mb-4">魏碧華 庫存修復</h1>
        <p className="text-gray-400 text-sm mb-6">
          將 VKANG-005 quantityOnHand 從 128 → 131
        </p>
        <button
          type="button"
          onClick={doFix}
          disabled={running}
          className="mb-6 px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white rounded-lg text-sm"
        >
          {running ? '執行中...' : '執行修復'}
        </button>
        <div className="bg-black border border-gray-700 rounded-lg p-4 text-sm whitespace-pre-wrap min-h-[200px]">
          {log.length === 0
            ? <span className="text-gray-600">點擊按鈕開始...</span>
            : log.join('\n')}
        </div>
      </div>
    </ProtectedRoute>
  );
}
