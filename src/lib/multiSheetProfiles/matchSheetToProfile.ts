import type {
  MultiSheetImportProfile,
  MultiSheetProfileSheet,
} from "@/types/MultiSheetImportProfile";

function normalizeSheetName(value: string): string {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function exactMatch(a: string, b: string) {
  return normalizeSheetName(a) === normalizeSheetName(b);
}

function containsMatch(a: string, b: string) {
  return normalizeSheetName(a).includes(normalizeSheetName(b));
}

function startsWithMatch(a: string, b: string) {
  return normalizeSheetName(a).startsWith(normalizeSheetName(b));
}

export function isIgnoredSheet(
  sheetName: string,
  ignoreSheets?: string[]
): boolean {
  if (!ignoreSheets?.length) return false;
  return ignoreSheets.some((x) => exactMatch(sheetName, x));
}

export function matchSheetToProfile(
  sheetName: string,
  profile: MultiSheetImportProfile
): MultiSheetProfileSheet | null {
  if (isIgnoredSheet(sheetName, profile.ignoreSheets)) {
    return null;
  }

  for (const rule of profile.sheets) {
    const exact = rule.match?.exact || [];
    const contains = rule.match?.contains || [];
    const startsWith = rule.match?.startsWith || [];

    if (exact.some((x) => exactMatch(sheetName, x))) return rule;
    if (startsWith.some((x) => startsWithMatch(sheetName, x))) return rule;
    if (contains.some((x) => containsMatch(sheetName, x))) return rule;
  }

  return null;
}