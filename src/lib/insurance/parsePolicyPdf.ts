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

// ─── Claude API Call ──────────────────────────────────────────

async function callClaudeWithPdf(
  base64Data: string,
  mediaType: string
): Promise<PolicyPdfResult> {
  const systemPrompt = `אתה מומחה לניתוח פוליסות ביטוח ישראליות.
תפקידך לחלץ מידע מובנה מ-PDF של דף פרטי ביטוח.
החזר תמיד JSON בלבד — ללא טקסט נוסף, ללא markdown, ללא קוד בקצות.

חוקים:
- אם שדה לא קיים בפוליסה — החזר null
- תאריכים בפורמט MM/YYYY (לדוגמה: "05/2029")
- סכומים כמספרים בלבד ללא ₪ ופסיקים
- smokerStatus: "מעשן" או "לא מעשן" בלבד
- parseConfidence: "high" אם רוב השדות נמצאו, "medium" אם חלקם, "low" אם מעט מאוד`;

  const userPrompt = `נתח את דף פרטי הביטוח הזה והחזר JSON במבנה הבא בדיוק:

{
  "policyNumber": "מספר פוליסה",
  "companyName": "שם חברת הביטוח",
  "insuredName": "שם המבוטח",
  "idNumber": "מספר זהות",
  "coverageAmount": 1500000,
  "coverageStart": "05/2022",
  "coverageEnd": "04/2057",
  "premiumMonthly": 82.47,
  "premiumAnnual": null,
  "discountPercent": 65,
  "discountExpiryDate": "12/2026",
  "futurePremiums": [
    { "date": "05/2026", "premium": 82.47 },
    { "date": "05/2027", "premium": 91.21 }
  ],
  "irrevocableBeneficiary": "בנק מזרחי טפחות",
  "smokerStatus": "לא מעשן",
  "exclusions": "תוספת 50% סוכרת",
  "medicalAddition": null,
  "occupationalAddition": null,
  "coverages": [
    {
      "coverageType": "ריסק",
      "coverageName": "ריסק יסודי בפרמיה משתנה",
      "coverageAmount": 1500000,
      "premium": 82.47,
      "premiumType": "חודשית",
      "startDate": "05/2022",
      "endDate": "04/2057"
    }
  ],
  "reportDate": "27/04/2026",
  "parseConfidence": "high"
}`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Data,
              },
            },
            { type: "text", text: userPrompt },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const data = await response.json();
  const text = data.content
    ?.filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("") ?? "";

  // ניקוי markdown אם קיים
  const clean = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/gi, "")
    .trim();

  try {
    return JSON.parse(clean) as PolicyPdfResult;
  } catch {
    console.error("parsePolicyPdf: failed to parse JSON", clean);
    return emptyResult("low");
  }
}

// ─── File to Base64 ───────────────────────────────────────────

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]); // הסר data:...;base64,
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
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
export async function parsePolicyPdf(file: File): Promise<PolicyPdfResult> {
  if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("הקובץ חייב להיות PDF");
  }

  const base64 = await fileToBase64(file);
  return callClaudeWithPdf(base64, "application/pdf");
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