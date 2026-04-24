import fs from "fs/promises";
import { PDFParse } from "pdf-parse";

function normalizeSpaces(value) {
  return value.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizePolicyNumber(value) {
  return value.replace(/\s+/g, "").replace(/־|–|—/g, "-").trim();
}

function toNumber(value) {
  if (value == null) return null;
  const cleaned = String(value).replace(/[^\d.-]/g, "").trim();
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function detectCompanyName(line) {
  const companies = [
    "אלטשולר שחם",
    "ילין לפידות",
    "אנליסט",
    "מיטב",
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

function detectProductType(line) {
  if (line.includes("קרן פנסיה")) return "קרן פנסיה";
  if (line.includes("קרנות השתלמות") || line.includes("השתלמות")) return "קרן השתלמות";
  if (line.includes("קופת גמל") || line.includes("גמל להשקעה") || line.includes("חיסכון פלוס")) {
    return "גמל להשקעה";
  }
  return "מוצר";
}

function extractPolicyNumber(line) {
  const normalized = line.replace(/-\s+/g, "-");
  const matches = normalized.match(/\b\d[\d-]{5,}\b/g);
  if (!matches?.length) return null;
  return normalizePolicyNumber(matches[matches.length - 1]);
}

function extractCurrency(line) {
  const match = line.match(/₪\s?([\d,]+(?:\.\d+)?)/);
  return toNumber(match?.[1] ?? null);
}

function extractPercentages(line) {
  return [...line.matchAll(/(-?\d+(?:\.\d+)?)%/g)]
    .map((m) => Number(m[1]))
    .filter((n) => Number.isFinite(n));
}

function extractTrackName(line, companyName, policyNumber) {
  let cleaned = line;
  if (companyName) cleaned = cleaned.replace(companyName, "");
  if (policyNumber) cleaned = cleaned.replace(policyNumber, "");

  cleaned = cleaned
    .replace(/₪\s?[\d,]+(?:\.\d+)?/g, "")
    .replace(/-?\d+(?:\.\d+)?%/g, "")
    .replace(/\b(קרן פנסיה|קרנות השתלמות|קופת גמל)\b/g, "")
    .replace(/\b(מיטב|אלטשולר שחם|ילין לפידות|אנליסט)\b/g, "")
    .trim();

  cleaned = normalizeSpaces(cleaned);
  return cleaned || null;
}

function isRelevantTrackLine(line) {
  if (!line.includes("₪")) return false;
  if (!line.includes("%")) return false;

  return (
    line.includes("קרן פנסיה") ||
    line.includes("קרנות השתלמות") ||
    line.includes("קופת גמל") ||
    line.includes("גמל להשקעה") ||
    line.includes("חיסכון פלוס")
  );
}

function extractTrackSectionLines(allLines) {
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

function parseTrackLine(line) {
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

async function main() {
  const pdfPath = process.argv[2];
  if (!pdfPath) {
    console.error(JSON.stringify({ error: "Missing PDF path" }));
    process.exit(1);
  }

  const buffer = await fs.readFile(pdfPath);
 const parser = new PDFParse({ data: buffer });
const result = await parser.getText();
const rawText = result.text || "";

await parser.destroy();

  const allLines = rawText
    .split("\n")
    .map((line) => normalizeSpaces(line))
    .filter(Boolean);

  const sectionLines = extractTrackSectionLines(allLines);
  const rows = sectionLines.map(parseTrackLine).filter(Boolean);

  process.stdout.write(JSON.stringify({
  rows,
  debug: {
    rawTextStart: rawText.slice(0, 3000),
    linesStart: allLines.slice(0, 80),
    hasTrackSection: allLines.some((line) => line.includes("פירוט מסלולי השקעה")),
    sectionLinesStart: sectionLines.slice(0, 50),
  }
}));
}

main().catch((err) => {
  process.stderr.write(err instanceof Error ? err.stack || err.message : String(err));
  process.exit(1);
});