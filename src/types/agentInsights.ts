// src/types/agentInsights.ts
// מבנה התשובה של /api/agent-insights — מקור הנתונים היחיד למסך סיכום העמלות
// (סקירה + מוצרים). הכל לפי חודש פרסום (ym).

/** שדות פרמיה שהסוכן מקבל בגינם עמלות — קובעים את קוביות "תיק נוכחי" */
export const PORTFOLIO_FIELDS = ['finansimZvira', 'pensiaPremia', 'insPremia'] as const;
export type PortfolioCategory = (typeof PORTFOLIO_FIELDS)[number];

export type CompanyAmount = {
  company: string;
  amount: number;
  policies?: number;
  months?: string[]; // חודשי פרסום שנכללו (בתיק — חברה עם כמה תבניות יכולה להיות בכמה חודשים)
};

export type StaleTemplate = {
  templateId: string;
  templateName: string;
  companyName: string;
  ym: string;
};

export type PortfolioCategoryTotals = {
  amount: number;
  policies: number;
  byCompany: CompanyAmount[];
};

/** תמונת תיק — לפי חודש הפרסום האחרון של כל תבנית */
export type PortfolioSnapshot = {
  latestYm: string | null;
  staleTemplates: StaleTemplate[];
  categories: Record<PortfolioCategory, PortfolioCategoryTotals>;
};

/** הכנסות מעמלות לשנה — לפי חודש פרסום */
export type IncomeSummary = {
  months: { ym: string; total: number }[];
  byCompany: CompanyAmount[];
  byYmCompany: Record<string, CompanyAmount[]>;
  totalYear: number;
  monthsCount: number;
  avgMonthly: number;
  lastYm: string | null;
  lastTotal: number;
  prevYm: string | null;
  prevTotal: number;
  changePct: number | null;
  /** קצב הכנסה — לפי עד 3 חודשי הפרסום האחרונים */
  recentYms: string[];
  avgRecent: number;
  recentByCompany: CompanyAmount[]; // ממוצע חודשי לכל חברה על פני recentYms
  annualRunRate: number;            // avgRecent × 12
};

export type ProductCompanyRow = { product: string; productGroup: string; company: string; amount: number };
export type ProductMonthRow = { product: string; ym: string; amount: number };

/** עמלות לפי מוצר — לפי חודש פרסום */
export type ProductsSummary = {
  byCompany: ProductCompanyRow[];
  byMonth: ProductMonthRow[];
};

/** יעילות תיק — לפי משק בית (parentID בניהול לקוחות; לא מקושר = משק בית של אדם אחד) */
export type HouseholdDepthLine = { depth: '1' | '2' | '3+'; households: number; avgMonthly: number };

export type SingleProductHousehold = {
  customerId: string;
  name: string;
  product: string;
  company: string;
  monthly: number; // עמלה חודשית ממוצעת
  members: number; // בני משפחה מקושרים בניהול לקוחות (1 = לא מקושר)
};

export type EfficiencySummary = {
  recentYms: string[];
  /** מגמה: נפרעים למשק בית לכל חודש פרסום */
  months: { ym: string; perHousehold: number; households: number }[];
  avgPerHousehold: number;
  households: number;
  customers: number;
  /** לקוחות שמקושרים למשפחה (2+ חברים בניהול לקוחות) */
  linkedCustomers: number;
  linkedShare: number; // 0..1
  /** לקוחות מהטעינות שלא קיימים בניהול לקוחות */
  notInCrm: number;
  byDepth: HouseholdDepthLine[];
  singleProduct: SingleProductHousehold[];
};

/** ניוד אפשרי בפנסיה — סימון בלבד (לא מפצלים ולא מנחשים סכום ניוד) */
export type TransferReason = 'spike' | 'low_rate';

export type TransferSuspect = {
  ym: string;
  templateId: string;
  company: string;
  policyNumberKey: string;
  customerId: string;
  fullName: string;
  product: string;
  premium: number;
  commission: number;
  /** אחוז עמלה בפוליסה (commission / premium * 100) */
  rate: number;
  reasons: TransferReason[];
  /** פרמיה בחודש הפרסום הקודם (לסימן "קפיצה") */
  prevPremium?: number;
  /** חציון אחוז העמלה בפוליסות מאותו דוח ומוצר באותו חודש (לסימן "אחוז נמוך") */
  peerRate?: number;
  /** השורה נכללת בקוביית "פרמיה פנסיה" (החלון האחרון של התבנית) */
  inPortfolio: boolean;
  /** הפרמיה של הפוליסה שנספרת בפועל בקוביית "פרמיה פנסיה" (0 אם לא נכללת) */
  portfolioPremium: number;
};

export type TransferSummary = {
  recentYms: string[];
  items: TransferSuspect[];
  thresholds: { minPremium: number; spikeMultiplier: number; lowRateRatio: number; minPeers: number };
};

export type AgentInsights = {
  agentId: string;
  year: string;
  portfolio: PortfolioSnapshot;
  income: IncomeSummary;
  products: ProductsSummary;
  efficiency: EfficiencySummary;
  transfers: TransferSummary;
};

/** איך זוהה המוצר מול התבנית */
export type ProductMatch = 'key' | 'alias' | 'fallback' | 'none';

/** שורת פוליסה ברשימת הפירוט של קוביית "תיק נוכחי" */
export type PortfolioPolicyRow = {
  customerId: string;
  fullName: string;
  policyNumberKey: string;
  productRaw: string;       // המוצר כפי שהגיע מהקובץ
  product: string;          // המוצר המסווג (אחרי productMap)
  matchedBy: ProductMatch;
  agentCode: string;
  amount: number;
  templateName: string;
  ym: string;
  reportMonth: string;
};

export type AiTone = 'positive' | 'negative' | 'neutral' | 'warning';

export type AiSummary = {
  headline: string;
  insights: { tone: AiTone; text: string }[];
  generatedAt: number;
};