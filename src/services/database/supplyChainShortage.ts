import { InventoryService } from './inventory';
import { UserService } from './users';
import { TransactionItem } from '@/types/models';

export interface ShortageInfo {
  productId: string;
  productName: string;
  need: number;
  have: number;
  /** 缺貨的供應商名稱（供應鏈中第一個庫存不足的節點） */
  shortageAt: string;
  /** 缺貨者的 userId */
  shortageUserId: string;
}

export interface SupplyChainShortageResult {
  ok: boolean;
  shortages: ShortageInfo[];
}

/**
 * 供應鏈缺貨追蹤
 * 沿著 parentUserId 往上找，找出每個品項在供應鏈中第一個庫存不足的節點。
 * 例如：客戶向 陳淑娥 訂貨，陳淑娥缺貨 → 檢查 Mabel School（陳淑娥的 parent）→ Mabel School 也缺貨 → 顯示「Mabel School 缺貨」
 */
export const SupplyChainShortageService = {
  /**
   * 檢查賣方及其供應鏈的庫存，回傳缺貨來源
   * @param sellerUserId 賣方（訂單的 fromUser）
   * @param items 訂單品項
   */
  async checkShortage(
    sellerUserId: string,
    items: TransactionItem[]
  ): Promise<SupplyChainShortageResult> {
    const shortages: ShortageInfo[] = [];

    for (const item of items) {
      const { productId, productName, quantity } = item;
      const need = quantity;

      // 從賣方開始，沿供應鏈往上找第一個庫存不足的節點
      const shortageAt = await this._findShortageNode(sellerUserId, productId, need);
      if (!shortageAt) continue; // 供應鏈上有人有足夠庫存，無短缺

      const inv = await InventoryService.getByUserAndProduct(shortageAt.userId, productId);
      const have = inv?.quantityOnHand ?? 0;

      shortages.push({
        productId,
        productName,
        need,
        have,
        shortageAt: shortageAt.displayName,
        shortageUserId: shortageAt.userId,
      });
    }

    return {
      ok: shortages.length === 0,
      shortages,
    };
  },

  /**
   * 沿供應鏈往上找「最上層」庫存不足的節點（瓶頸）
   * 例如：陳淑娥缺貨 → 檢查 Mabel School → Mabel School 也缺貨 → 顯示 Mabel School 缺貨
   * 若 Mabel School 有貨 → 顯示陳淑娥缺貨（可向 Mabel School 進貨）
   */
  async _findShortageNode(
    startUserId: string,
    productId: string,
    need: number
  ): Promise<{ userId: string; displayName: string } | null> {
    let currentUserId: string | null = startUserId;
    let lastShortage: { userId: string; displayName: string } | null = null;

    while (currentUserId) {
      const inv = await InventoryService.getByUserAndProduct(currentUserId, productId);
      const have = inv?.quantityOnHand ?? 0;
      const user = await UserService.getById(currentUserId);
      const displayName = user?.displayName || currentUserId;

      if (have < need) {
        lastShortage = { userId: currentUserId, displayName };
      } else {
        // 此節點有足夠庫存，下游可從此進貨，瓶頸在下方
        break;
      }

      const parentId = user?.parentUserId ?? null;
      if (!parentId) break; // ADMIN 或無上線，不再往上
      currentUserId = parentId;
    }

    return lastShortage;
  },

  /**
   * 產生缺貨提示訊息（用於訂單、進貨單等）
   */
  formatShortageMessage(shortages: ShortageInfo[]): string {
    if (shortages.length === 0) return '';
    const bySupplier = new Map<string, string[]>();
    for (const s of shortages) {
      const list = bySupplier.get(s.shortageAt) || [];
      list.push(`${s.productName} 需要 ${s.need}，庫存僅 ${s.have}`);
      bySupplier.set(s.shortageAt, list);
    }
    return Array.from(bySupplier.entries())
      .map(([name, items]) => `${name} 缺貨：${items.join('；')}`)
      .join('。');
  },
};
