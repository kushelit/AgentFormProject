/**
 * parsePolicyPdf.ts
 * ─────────────────────────────────────────────────────────────
 * מנתח PDF של עותק פוליסת ביטוח באמצעות Claude API
 * מחזיר JSON מובנה שממלא את השדות החסרים ב-InsuranceRow
 */

import type { InsuranceCoverage } from "./insuranceTypes";

// ─── Types ────────────────────────────────────────────────────

export interface PolicyPdfResult {
  // מזהים
  policyNumber: string | null;
  companyName: string | null;
  insuredName: string | null;
  idNumber: string | null;

  // כיסוי
  coverageAmount: number | null;
  coverageStart: string | null;
  coverageEnd: string | null;

  // פרמיה
  premiumMonthly: number | null;
  premiumAnnual: number | null;

  // הנחות
  discountPercent: number | null;
  discountExpiryDate: string | null;

  // טבלת פרמיה עתידית
  futurePremiums: Array<{
    date: string;
    premium: number;
  }> | null;

  // מוטב ועיסוק
  irrevocableBeneficiary: string | null;
  smokerStatus: "מעשן" | "לא מעשן" | null;

  // החרגות ותוספות חיתומיות
  exclusions: string | null;
  medicalAddition: string | null;
  occupationalAddition: string | null;

  // פירוט כיסויים
  coverages: InsuranceCoverage[];

  // מטא
  reportDate: string | null;
  parseConfidence: "high" | "medium" | "low";
}

// ─── Empty Result ─────────────────────────────────────────────

function emptyResult(confidence: "high" | "medium" | "low"): PolicyPdfResult {
  return {
    policyNumber: null,
    companyName: null,
    insuredName: null,
    idNumber: null,
    coverageAmount: null,
    coverageStart: null,
    coverageEnd: null,
    premiumMonthly: null,
    premiumAnnual: null,
    discountPercent: null,
    discountExpiryDate: null,
    futurePremiums: null,
    irrevocableBeneficiary: null,
    smokerStatus: null,
    exclusions: null,
    medicalAddition: null,
    occupationalAddition: null,
    coverages: [],
    reportDate: null,
    parseConfidence: confidence,
  };
}

// ─── Main Export ──────────────────────────────────────────────

export async function parsePolicyPdf(file: File): Promise<PolicyPdfResult> {
  if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("הקובץ חייב להיות PDF");
  }

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/insurance/parse-policy", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("שגיאה בניתוח הפוליסה");

  try {
    return await res.json();
  } catch {
    return emptyResult("low");
  }
}

export async function parsePolicyPdfs(files: File[]): Promise<PolicyPdfResult[]> {
  return Promise.all(files.map((f) => parsePolicyPdf(f)));
}

// ─── Merge into HarBituchRow ──────────────────────────────────

import type { HarBituchRow } from "./parseHarBituch";

export function mergePolicyIntoRow(
  row: HarBituchRow,
  pdf: PolicyPdfResult
): HarBituchRow {
  if (
    pdf.policyNumber &&
    row.policyNumber &&
    pdf.policyNumber !== row.policyNumber
  ) {
    console.warn(
      `mergePolicyIntoRow: policy mismatch — row=${row.policyNumber}, pdf=${pdf.policyNumber}`
    );
  }

  return {
    ...row,
    coverageAmount: row.coverageAmount ?? pdf.coverageAmount,
    exclusions: row.exclusions ?? pdf.exclusions,
    irrevocableBeneficiary: row.irrevocableBeneficiary ?? pdf.irrevocableBeneficiary,
    smokerStatus: row.smokerStatus ?? pdf.smokerStatus,
    discountPercent: row.discountPercent ?? pdf.discountPercent,
    discountExpiryDate: row.discountExpiryDate ?? pdf.discountExpiryDate,
    futurePremiums: row.futurePremiums ?? pdf.futurePremiums,
    medicalAddition: row.medicalAddition ?? pdf.medicalAddition,
    occupationalAddition: row.occupationalAddition ?? pdf.occupationalAddition,
    premiumMonthly: row.premiumMonthly ?? pdf.premiumMonthly,
    pdfEnriched: true,
  };
}

export function mergeAllPolicies(
  rows: HarBituchRow[],
  pdfResults: PolicyPdfResult[]
): HarBituchRow[] {
  const pdfMap = new Map<string, PolicyPdfResult>();
  for (const pdf of pdfResults) {
    if (pdf.policyNumber) {
      pdfMap.set(pdf.policyNumber, pdf);
    }
  }

  return rows.map((row) => {
    const pdf = pdfMap.get(row.policyNumber);
    if (!pdf) return row;
    return mergePolicyIntoRow(row, pdf);
  });
}