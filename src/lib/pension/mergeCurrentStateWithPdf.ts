import type { CurrentStateRow, MeslekaPdfReturnRow } from "./types";

function normalizePolicyNumber(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\s+/g, "").replace(/[-–—]/g, "-").trim();
}

export function mergeCurrentStateWithPdf(
  xmlRows: CurrentStateRow[],
  pdfRows: MeslekaPdfReturnRow[]
): CurrentStateRow[] {
  const pdfMap = new Map<string, MeslekaPdfReturnRow[]>();

  // קיבוץ לפי פוליסה
  for (const row of pdfRows) {
    const key = normalizePolicyNumber(row.policyNumber);
    if (!key) continue;

    if (!pdfMap.has(key)) {
      pdfMap.set(key, []);
    }

    pdfMap.get(key)!.push(row);
  }

  return xmlRows.map((xmlRow) => {
    const key = normalizePolicyNumber(xmlRow.policyNumber);
    const matches = pdfMap.get(key) || [];

    if (matches.length === 0) {
      return xmlRow;
    }

    // חישוב ממוצע פשוט (אפשר לשדרג למשוקלל בהמשך)
    const avg1 =
      matches.reduce((sum, r) => sum + (r.avgReturn1Y ?? 0), 0) / matches.length;

    const avg3 =
      matches.reduce((sum, r) => sum + (r.avgReturn3Y ?? 0), 0) / matches.length;

    const avg5 =
      matches.reduce((sum, r) => sum + (r.avgReturn5Y ?? 0), 0) / matches.length;

    return {
      ...xmlRow,
      avgReturn1Y: Number.isFinite(avg1) ? Number(avg1.toFixed(2)) : null,
      avgReturn3Y: Number.isFinite(avg3) ? Number(avg3.toFixed(2)) : null,
      avgReturn5Y: Number.isFinite(avg5) ? Number(avg5.toFixed(2)) : null,
    };
  });
}