/**
 * parsePolicyPdf.ts
 * ─────────────────────────────────────────────────────────────
 * מנתח PDF של עותק פוליסת ביטוח באמצעות Claude API
 * מחזיר JSON מובנה שממלא את השדות החסרים ב-InsuranceRow
 *
 * שימוש:
 *   const enriched = await parsePolicyPdf(pdfFile);
 *   const merged = mergePolicyIntoRow(harRow, enriched);
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
  coverageAmount: number | null;          // סכום ביטוח ראשי
  coverageStart: string | null;           // "01/05/2022"
  coverageEnd: string | null;             // "30/04/2057"

  // פרמיה
  premiumMonthly: number | null;          // פרמיה חודשית נוכחית
  premiumAnnual: number | null;           // פרמיה שנתית (אם מוצגת)

  // הנחות
  discountPercent: number | null;         // אחוז הנחה נוכחי
  discountExpiryDate: string | null;      // "12/2026" — מתי פוגה ההנחה

  // טבלת פרמיה עתידית
  futurePremiums: Array<{
    date: string;                         // "05/2029"
    premium: number;                      // פרמיה חודשית
  }> | null;

  // מוטב ועיסוק
  irrevocableBeneficiary: string | null;  // "בנק מזרחי טפחות"
  smokerStatus: "מעשן" | "לא מעשן" | null;

  // החרגות ותוספות חיתומיות
  exclusions: string | null;              // "תוספת 50% סוכרת"
  medicalAddition: string | null;         // תוספת רפואית
  occupationalAddition: string | null;    // תוספת מקצועית

  // פירוט כיסויים
  coverages: InsuranceCoverage[];

  // מטא
  reportDate: string | null;              // תאריך הדפסה
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

/**
 * מנתח PDF של פוליסת ביטוח ומחזיר נתונים מובנים
 */
// החלף את כל פונקציית parsePolicyPdf:
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
/**
 * מנתח מספר PDFs במקביל
 */
export async function parsePolicyPdfs(
  files: File[]
): Promise<PolicyPdfResult[]> {
  return Promise.all(files.map((f) => parsePolicyPdf(f)));
}

// ─── Merge into HarBituchRow ──────────────────────────────────

import type { HarBituchRow } from "./parseHarBituch";

/**
 * ממזג נתוני PDF לתוך שורת הר הביטוח
 * מספר פוליסה משמש כמפתח צליבה
 */
export function mergePolicyIntoRow(
  row: HarBituchRow,
  pdf: PolicyPdfResult
): HarBituchRow {
  // ודא שזו אותה פוליסה
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
    // מלא רק שדות שחסרים בהר הביטוח
    coverageAmount: row.coverageAmount ?? pdf.coverageAmount,
    exclusions: row.exclusions ?? pdf.exclusions,
    irrevocableBeneficiary: row.irrevocableBeneficiary ?? pdf.irrevocableBeneficiary,
    smokerStatus: row.smokerStatus ?? pdf.smokerStatus,
    discountPercent: row.discountPercent ?? pdf.discountPercent,
    discountExpiryDate: row.discountExpiryDate ?? pdf.discountExpiryDate,
    futurePremiums: row.futurePremiums ?? pdf.futurePremiums,
    // עדכן פרמיה אם ה-PDF מדויק יותר
    premiumMonthly: row.premiumMonthly ?? pdf.premiumMonthly,
    pdfEnriched: true,
  };
}

/**
 * מזווג אוטומטית רשימת PDFs עם רשימת שורות לפי מספר פוליסה
 */
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