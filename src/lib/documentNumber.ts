/**
 * 单据号码生成器
 * 格式：{TYPE}-{YYYYMMDD}-{NNN}
 * 例：TR-20260301-001
 */

export function generateDocumentNumber(
  type: 'PO' | 'SHIP' | 'TR' | 'SO' | 'DN',
  existingNumbers: string[]
): string {
  const today = new Date();
  const dateStr = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('');

  const prefix = `${type}-${dateStr}-`;

  const todaySeqs = existingNumbers
    .filter((n) => n.startsWith(prefix))
    .map((n) => parseInt(n.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));

  const nextSeq = todaySeqs.length > 0 ? Math.max(...todaySeqs) + 1 : 1;
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}
