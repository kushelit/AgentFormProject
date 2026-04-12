import type { MultiSheetSystemFieldOverrideValue } from "@/types/MultiSheetImportProfile";

export function buildEffectiveMapping(params: {
  baseMapping: Record<string, string>;
  overrideSystemFields?: Record<string, MultiSheetSystemFieldOverrideValue>;
}) {
  const { baseMapping, overrideSystemFields } = params;

  if (!overrideSystemFields || Object.keys(overrideSystemFields).length === 0) {
    return { ...baseMapping };
  }

  const result: Record<string, string> = {};

  // כל שדות המערכת שעוברים override
  const overriddenTargets = new Set(
    Object.keys(overrideSystemFields).map((x) => String(x).trim())
  );

  // שומרים מהמיפוי הבסיסי רק שדות שלא עברו override
  for (const [excelCol, systemField] of Object.entries(baseMapping)) {
    if (overriddenTargets.has(String(systemField).trim())) {
      continue;
    }
    result[excelCol] = systemField;
  }

  // מוסיפים את ה-override, כולל תמיכה במערך של כותרות אפשריות
  for (const [systemField, rawExcelCols] of Object.entries(overrideSystemFields)) {
    const excelCols = Array.isArray(rawExcelCols) ? rawExcelCols : [rawExcelCols];

    for (const excelCol of excelCols) {
      const cleanExcelCol = String(excelCol || "").trim();
      if (!cleanExcelCol) continue;

      result[cleanExcelCol] = systemField;
    }
  }

  return result;
}