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

export type AgentInsights = {
  agentId: string;
  year: string;
  portfolio: PortfolioSnapshot;
  income: IncomeSummary;
  products: ProductsSummary;
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
