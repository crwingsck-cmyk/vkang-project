/**
 * 盈利表服務：彙總某經銷商的收入與支出，計算盈利
 */
import { PaymentReceiptService } from './paymentReceipts';
import { ExpenseChargeReceiptService } from './expenseChargeReceipts';
import { ReceivableService } from './receivables';
import { DeliveryNoteService } from './deliveryNotes';
import { ExpenseService } from './expenses';
import { FinancialService } from './financials';
import {
  PaymentReceiptStatus,
  ExpenseChargeReceiptStatus,
  ExpenseType,
  FinancialType,
  FinancialCategory,
} from '@/types/models';

export interface ProfitBreakdown {
  /** 收入：收經銷商及顧客的錢（PR 已審核）*/
  incomeFromReceivables: number;
  /** 收入：顧客的體重秤及郵寄的錢（ECR 已審核）*/
  incomeFromExpenseRecovery: number;
  /** 收入：自用產品（自己付自己錢）*/
  incomeFromSelfUse: number;
  /** 支出：給台灣的產品貨 */
  expenseTaiwanProducts: number;
  /** 支出：向台灣買體重秤 */
  expenseWeighingScale: number;
  /** 支出：付郵寄產品費用 */
  expenseShipping: number;
  /** 支出：員工的費用 */
  expenseSalary: number;
  /** 總收入 */
  totalIncome: number;
  /** 總支出 */
  totalExpense: number;
  /** 盈利 */
  profit: number;
}

export const ProfitService = {
  async getBreakdown(userId: string): Promise<ProfitBreakdown> {
    const [
      receivables,
      deliveryNotes,
      allPRs,
      allECRs,
      allExpenses,
      financials,
    ] = await Promise.all([
      ReceivableService.getByFromUser(userId),
      DeliveryNoteService.getByFromUser(userId),
      PaymentReceiptService.getAll(),
      ExpenseChargeReceiptService.getAll(),
      ExpenseService.getAll(),
      FinancialService.getByUser(userId),
    ]);

    const receivableIds = new Set(receivables.map((r) => r.id).filter(Boolean));
    const customerIds = new Set(deliveryNotes.map((d) => d.toUserId));

    // 收入：PR 已審核，且 items 的 receivable 屬於此 userId
    let incomeFromReceivables = 0;
    for (const pr of allPRs) {
      if (pr.status !== PaymentReceiptStatus.APPROVED) continue;
      for (const item of pr.items) {
        if (receivableIds.has(item.receivableId)) {
          incomeFromReceivables += item.appliedAmount;
        }
      }
    }

    // 收入：ECR 已審核，且 customerId 屬於此 userId 的客戶
    let incomeFromExpenseRecovery = 0;
    for (const ecr of allECRs) {
      if (ecr.status !== ExpenseChargeReceiptStatus.APPROVED) continue;
      if (customerIds.has(ecr.customerId)) {
        incomeFromExpenseRecovery += ecr.totalAmount;
      }
    }

    // 收入：自用產品（自己付自己錢）— 發貨單 fromUserId = toUserId = userId
    let incomeFromSelfUse = 0;
    for (const dn of deliveryNotes) {
      if (dn.fromUserId === userId && dn.toUserId === userId) {
        incomeFromSelfUse += dn.totals.grandTotal ?? 0;
      }
    }

    // 支出：Financials 給台灣的產品貨（PURCHASE）
    let expenseTaiwanProducts = 0;
    for (const f of financials) {
      if (f.type === FinancialType.EXPENSE && f.category === FinancialCategory.PURCHASE) {
        expenseTaiwanProducts += f.amount;
      }
    }

    // 支出：Expenses 體重秤、郵寄、薪水（ownerId 為空或 = userId）
    let expenseWeighingScale = 0;
    let expenseShipping = 0;
    let expenseSalary = 0;
    for (const e of allExpenses) {
      // 只計入歸屬此 userId 的費用；未指定 ownerId 的不計入任何人的盈利表
      if (e.ownerId !== userId) continue;
      if (e.type === ExpenseType.WEIGHING_SCALE) expenseWeighingScale += e.amount;
      else if (e.type === ExpenseType.SHIPPING) expenseShipping += e.amount;
      else if (e.type === ExpenseType.SALARY) expenseSalary += e.amount;
    }

    const totalIncome = incomeFromReceivables + incomeFromExpenseRecovery + incomeFromSelfUse;
    const totalExpense = expenseTaiwanProducts + expenseWeighingScale + expenseShipping + expenseSalary;
    const profit = totalIncome - totalExpense;

    return {
      incomeFromReceivables,
      incomeFromExpenseRecovery,
      incomeFromSelfUse,
      expenseTaiwanProducts,
      expenseWeighingScale,
      expenseShipping,
      expenseSalary,
      totalIncome,
      totalExpense,
      profit,
    };
  },
};
