/**
 * insuranceTypes.ts
 * ─────────────────────────────────────────────────────────────
 * טיפוסים לטבלת הביטוח — נפרד מהפנסיה/פיננסי
 */

export type InsuranceProductType =
  | "ביטוח חיים"
  | "ביטוח בריאות"
  | "ביטוח סיעודי"
  | "ביטוח תאונות אישיות"
  | "ביטוח רכב"
  | "ביטוח דירה"
  | "אחר";

export type InsuranceCoverage = {
  coverageType: string;         // "ריסק" / "נכות" / "שארים" / "תרופות" וכו'
  coverageName: string | null;
  coverageAmount: number | null;
  premium: number | null;
  premiumType: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type InsuranceRow = {
  // ─── מהר הביטוח ───────────────────────────────────────────
  insuredName?: string | null;
  idNumber: string | null;
  productType: InsuranceProductType;
  branchMain: string;
  branchSub: string;
  companyName: string;
  policyNumber: string;

  coveragePeriod: string | null;
  coverageStart: Date | null;
  coverageEnd: Date | null;
  isRenewing: boolean;

  premiumMonthly: number | null;    // תמיד מחושב לחודשי
  premiumOriginal: number | null;   // כפי שמופיע בקובץ
  premiumType: "חודשית" | "שנתית" | "רבעונית" | null;

  classification: "אישי" | "קבוצתי קופת חולים" | "קבוצתי מעסיק" | null;
  isLifeOrHealth: boolean;

  // ─── מPDF פוליסה (מועשר לאחר העלאה) ─────────────────────
  coverageAmount: number | null;
  exclusions: string | null;
  irrevocableBeneficiary: string | null;
  smokerStatus: "מעשן" | "לא מעשן" | null;

  discountPercent: number | null;
  discountExpiryDate: string | null;        // "12/2026"

  futurePremiums: Array<{
    date: string;                           // "05/2029"
    premium: number;
  }> | null;

  coverages: InsuranceCoverage[];           // פירוט כיסויים

  pdfEnriched: boolean;

  // ─── שדה ידני (הסוכן) ────────────────────────────────────
  agentRecommendation: string | null;
  agentNotes: string | null;
};