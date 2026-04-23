import type { MeslekaPdfReturnRow } from "./types";

type TextItemLike = {
  str?: string;
  transform?: number[];
};

function normalizeSpaces(value: string): string {
  return value
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePolicyNumber(value: string): string {
  return value
    .replace(/\s+/g, "")
    .replace(/־/g, "-")
    .replace(/–/g, "-")
    .replace(/—/g, "-")
    .trim();
}

function toNumber(value: string | null | undefined): number | null {
  if (value == null) return null;
  const cleaned = value.replace(/[^\d.-]/g, "").trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function detectCompanyName(line: string): string {
  const companies = [
    "אלטשולר שחם",
    "ילין לפידות",
    "אנליסט",
    "מיטב",
    "ליברה",
    "הפניקס",
    "מנורה",
    "מגדל",
    "כלל",
    "הראל",
    "איילון",
  ];

  for (const company of companies) {
    if (line.includes(company)) return company;
  }

  return "";
}

function detectProductType(line: string): string {
  if (line.includes("קרן פנסיה")) return "קרן פנסיה";
  if (line.includes("קרנות השתלמות") || line.includes("השתלמות")) return "קרן השתלמות";
  if (line.includes("קופת גמל") || line.includes("גמל להשקעה") || line.includes("חיסכון פלוס")) {
    return "גמל להשקעה";
  }
  return "מוצר";
}

function extractPolicyNumber(line: string): string | null {
  const normalized = line.replace(/-\s+/g, "-");
  const matches = normalized.match(/\b\d[\d-]{5,}\b/g);
  if (!matches || matches.length === 0) return null;

  const policy = matches[matches.length - 1];
  return normalizePolicyNumber(policy);
}

function extractCurrency(line: string): number | null {
  const match = line.match(/₪\s?([\d,]+(?:\.\d+)?)/);
  return toNumber(match?.[1] ?? null);
}

function extractPercentages(line: string): number[] {
  const matches = [...line.matchAll(/(-?\d+(?:\.\d+)?)%/g)];
  return matches
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n));
}

function extractTrackName(line: string, companyName: string, policyNumber: string): string | null {
  let cleaned = line;

  if (companyName) cleaned = cleaned.replace(companyName, "");
  if (policyNumber) cleaned = cleaned.replace(policyNumber, "");

  cleaned = cleaned
    .replace(/₪\s?[\d,]+(?:\.\d+)?/g, "")
    .replace(/-?\d+(?:\.\d+)?%/g, "")
    .replace(/\b(קרן פנסיה|קרנות השתלמות|קופת גמל)\b/g, "")
    .replace(/\b(מיטב|אלטשולר שחם|ילין לפידות|אנליסט|ליברה)\b/g, "")
    .trim();

  cleaned = normalizeSpaces(cleaned);

  return cleaned || null;
}

function isRelevantTrackLine(line: string): boolean {
  if (!line.includes("₪")) return false;
  if (!line.includes("%")) return false;

  const hasKnownProduct =
    line.includes("קרן פנסיה") ||
    line.includes("קרנות השתלמות") ||
    line.includes("קופת גמל") ||
    line.includes("גמל להשקעה") ||
    line.includes("חיסכון פלוס");

  return hasKnownProduct;
}

function buildLinesFromTextItems(items: TextItemLike[]): string[] {
  const buckets = new Map<number, { x: number; text: string }[]>();

  for (const rawItem of items) {
    const item = rawItem as TextItemLike;
    const text = item.str?.trim();
    if (!text) continue;

    const transform = item.transform ?? [];
    const x = transform[4] ?? 0;
    const y = transform[5] ?? 0;

    const yKey = Math.round(y);
    if (!buckets.has(yKey)) buckets.set(yKey, []);
    buckets.get(yKey)!.push({ x, text });
  }

  const sortedY = Array.from(buckets.keys()).sort((a, b) => b - a);

  return sortedY.map((y) => {
    const row = buckets.get(y)!;
    row.sort((a, b) => b.x - a.x);
    return normalizeSpaces(row.map((r) => r.text).join(" "));
  });
}

function extractTrackSectionLines(allLines: string[]): string[] {
  const startIndex = allLines.findIndex((line) => line.includes("פירוט מסלולי השקעה"));
  if (startIndex === -1) return [];

  const endIndex = allLines.findIndex(
    (line, idx) => idx > startIndex && line.includes("פירוט הרכב נכסים")
  );

  const section = allLines.slice(startIndex + 1, endIndex === -1 ? undefined : endIndex);

  return section.filter((line) => {
    if (!line) return false;
    if (line.includes("מקור נתונים")) return false;
    if (line.includes("מסמך זה הופק")) return false;
    if (line.includes("תוכנית שם המסלול")) return false;
    return true;
  });
}

function parseTrackLine(line: string): MeslekaPdfReturnRow | null {
  const normalizedLine = normalizeSpaces(line.replace(/-\s+/g, "-"));

  if (!isRelevantTrackLine(normalizedLine)) return null;

  const companyName = detectCompanyName(normalizedLine);
  const productType = detectProductType(normalizedLine);
  const policyNumber = extractPolicyNumber(normalizedLine);
  const trackAccumulation = extractCurrency(normalizedLine);
  const percentages = extractPercentages(normalizedLine);

  if (!policyNumber) return null;
  if (percentages.length < 4) return null;

  return {
    companyName,
    productType,
    policyNumber,
    trackName: extractTrackName(normalizedLine, companyName, policyNumber),
    trackAccumulation,
    avgReturn1Y: percentages[0] ?? null,
    avgReturn3Y: percentages[2] ?? null,
    avgReturn5Y: percentages[3] ?? null,
  };
}

export async function parseMeslekaPdf(file: File): Promise<MeslekaPdfReturnRow[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const { getDocument, GlobalWorkerOptions } = pdfjs;

  GlobalWorkerOptions.workerSrc = "";

  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({
    data: buffer,
    useWorkerFetch: false,
    isEvalSupported: false,
    disableFontFace: true,
  }).promise;

  const allLines: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageLines = buildLinesFromTextItems(textContent.items as TextItemLike[]);
    allLines.push(...pageLines);
  }

  const sectionLines = extractTrackSectionLines(allLines);
  const rows = sectionLines
    .map(parseTrackLine)
    .filter((row): row is MeslekaPdfReturnRow => row !== null);

  return rows;
}