import { where, orderBy } from 'firebase/firestore';
import { FirestoreService } from './base';
import { InventoryService } from './inventory';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
  InventoryStatus,
} from '@/types/models';
import { generateDocumentNumber } from '@/lib/documentNumber';

export interface ConversionTarget {
  productId: string;
  productName: string;
  quantity: number;
}

export interface ConversionParams {
  userId: string;
  userName: string;
  sourceProductId: string;
  sourceProductName: string;
  sourceQuantity: number;
  targets: ConversionTarget[];
  ownerName: string;       // 归属人（必填）
  upstreamOrderNo: string; // 上游单号（必填）
  notes: string;
}

export const ProductConversionService = {
  /**
   * 创建产品转换调拨单（TR）
   * 原子操作：扣减来源产品库存，逐一增加目标产品库存，写入 transactions 集合
   */
  async createConversion(params: ConversionParams): Promise<string> {
    const {
      userId,
      userName,
      sourceProductId,
      sourceProductName,
      sourceQuantity,
      targets,
      ownerName,
      upstreamOrderNo,
      notes,
    } = params;

    // 守恒校验：转入总数量必须等于转出数量
    const totalTargetQty = targets.reduce((sum, t) => sum + t.quantity, 0);
    if (totalTargetQty !== sourceQuantity) {
      throw new Error(
        `转入总数量 (${totalTargetQty}) 必须等于转出数量 (${sourceQuantity})`
      );
    }

    // 库存充足校验
    const sourceInv = await InventoryService.getByUserAndProduct(userId, sourceProductId);
    if (!sourceInv || sourceInv.quantityOnHand < sourceQuantity) {
      throw new Error(
        `库存不足：${sourceProductName} 需要 ${sourceQuantity}，现有 ${sourceInv?.quantityOnHand ?? 0}`
      );
    }

    // 生成 TR 单号
    const existingConversions = await this.getConversionsByUser(userId);
    const existingNumbers = existingConversions.map((c) => c.poNumber ?? '');
    const trNumber = generateDocumentNumber('TR', existingNumbers);

    const now = Date.now();
    const transactionId = `TR-${now}`;
    const reference = `TR: ${transactionId}`;

    // 扣减来源产品库存
    await InventoryService.deduct(userId, sourceProductId, sourceQuantity, reference);

    // 逐一增加目标产品库存
    for (const target of targets) {
      const targetInv = await InventoryService.getByUserAndProduct(userId, target.productId);

      if (targetInv?.id) {
        const newQty = targetInv.quantityOnHand + target.quantity;
        const newAvailable = targetInv.quantityAvailable + target.quantity;
        let status = InventoryStatus.IN_STOCK;
        if (targetInv.reorderLevel > 0 && newQty <= targetInv.reorderLevel) {
          status = InventoryStatus.LOW_STOCK;
        }
        await InventoryService.update(targetInv.id, {
          quantityOnHand: newQty,
          quantityAvailable: newAvailable,
          marketValue: newQty * (targetInv.cost ?? 0),
          status,
          lastMovementDate: now,
          movements: [
            ...(targetInv.movements ?? []),
            { date: now, type: 'in' as const, quantity: target.quantity, reference },
          ],
        });
      } else {
        // 目标产品库存不存在，创建新记录
        await InventoryService.create({
          userId,
          productId: target.productId,
          quantityOnHand: target.quantity,
          quantityAllocated: 0,
          quantityAvailable: target.quantity,
          quantityBorrowed: 0,
          quantityLent: 0,
          reorderLevel: 0,
          cost: 0,
          marketValue: 0,
          status: InventoryStatus.IN_STOCK,
          lastMovementDate: now,
          movements: [{ date: now, type: 'in', quantity: target.quantity, reference }],
        });
      }
    }

    // 写入 transactions 集合
    const transaction: Transaction = {
      poNumber: trNumber,
      transactionType: TransactionType.CONVERSION,
      status: TransactionStatus.COMPLETED,
      // fromUser 和 toUser 均为自己，确保 Firestore 安全规则中的读取校验通过
      fromUser: { userId, userName },
      toUser: { userId, userName },
      items: [
        {
          productId: sourceProductId,
          productName: sourceProductName,
          quantity: sourceQuantity,
          unitPrice: 0,
          total: 0,
          notes: '转出（产品转换）',
        },
        ...targets.map((t) => ({
          productId: t.productId,
          productName: t.productName,
          quantity: t.quantity,
          unitPrice: 0,
          total: 0,
          notes: '转入（产品转换）',
        })),
      ],
      totals: { subtotal: 0, grandTotal: 0 },
      description: notes,
      ownerName,
      upstreamOrderNo,
      conversionSource: {
        productId: sourceProductId,
        productName: sourceProductName,
        quantity: sourceQuantity,
      },
      conversionTargets: targets,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    };

    await FirestoreService.set('transactions', transactionId, transaction);
    return trNumber;
  },

  /**
   * 查询用户的所有产品转换调拨单（TR）
   */
  async getConversionsByUser(userId: string): Promise<(Transaction & { id: string })[]> {
    const constraints = [
      where('transactionType', '==', TransactionType.CONVERSION),
      where('fromUser.userId', '==', userId),
      orderBy('createdAt', 'desc'),
    ];
    return FirestoreService.query<Transaction>('transactions', constraints);
  },
};
