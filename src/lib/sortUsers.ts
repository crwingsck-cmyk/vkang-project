/**
 * 依 displayName（使用者名稱）排序：英文名 A-Z 先，中文名在後
 */
export function sortByNameEnglishFirst<T extends { displayName?: string }>(list: T[]): T[] {
  const isEnglishStart = (s: string) => /^[A-Za-z]/.test(s || '');
  return [...list].sort((a, b) => {
    const na = a.displayName || '';
    const nb = b.displayName || '';
    const aEng = isEnglishStart(na);
    const bEng = isEnglishStart(nb);
    if (aEng && !bEng) return -1;
    if (!aEng && bEng) return 1;
    if (aEng && bEng) return na.localeCompare(nb, 'en');
    return na.localeCompare(nb, 'zh-TW');
  });
}
