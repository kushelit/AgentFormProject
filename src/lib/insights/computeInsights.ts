// src/lib/insights/computeInsights.ts
// חישוב טהור (ללא Firestore) של כל נתוני הסקירה — רץ בצד השרת.
import { resolveFromTemplate } from '@/utils/contractCommissionResolvers';
import type { TemplateDoc } from '@/types/ContractCommissionComparison';
import {
  PORTFOLIO_FIELDS,
  type AgentInsights,
  type CompanyAmount,
  type PortfolioCategory,
  type PortfolioSnapshot,
  type IncomeSummary,
  type ProductsSummary,
  type StaleTemplate,
  type ProductMatch,
} from '@/types/agentInsights';

/** שורת פוליסה (policyCommissionSummaries) + חודש הפרסום של הטעינה שלה */
export type InsightsPolicyRow = {
  templateId: string;
  ym: string;
  reportMonth: string;
  product?: string;
  productGroup?: string;
  company: string;
  policyNumberKey: string;
  customerId?: string;
  premium: number;
  commission: number;
  /** לרשימת פוליסות בלבד (לא נדרש לחישוב הסיכומים) */
  fullName?: string;
  agentCode?: string;
  /** מזהה הטעינה שממנה הגיעה השורה */
  runId?: string;
};

/** שורת הכנסה (ymCommissionSummaries) */
export type InsightsIncomeRow = { ym: string; company: string; amount: number };

const round2 = (n: number) => Math.round(n * 100) / 100;

const isPortfolioField = (f?: string): f is PortfolioCategory =>
  !!f && (PORTFOLIO_FIELDS as readonly string[]).includes(f);

type CompanyAcc = { amount: number; policies?: Set<string>; months?: Set<string> };

function toCompanyList(map: Record<string, CompanyAcc>): CompanyAmount[] {
  return Object.entries(map)
    .map(([company, c]) => ({
      company,
      amount: round2(c.amount),
      ...(c.policies ? { policies: c.policies.size } : {}),
      ...(c.months ? { months: Array.from(c.months).sort() } : {}),
    }))
    .filter((c) => c.amount !== 0 || (c.policies ?? 0) > 0)
    .sort((a, b) => b.amount - a.amount);
}

export type Resolved = { canonical: string; premiumField?: string; matchedBy: ProductMatch };
export type Resolver = (templateId: string, product?: string) => Resolved;

/** פענוח מוצר + שדה פרמיה מול התבנית — פעם אחת לכל תבנית+מוצר גולמי */
export function makeResolver(templatesById: Record<string, TemplateDoc | undefined>): Resolver {
  const cache = new Map<string, Resolved>();
  return (templateId, product) => {
    const k = `${templateId}|${product ?? ''}`;
    let v = cache.get(k);
    if (!v) {
      const r = resolveFromTemplate(templatesById[templateId], product);
      const matchedBy: ProductMatch = r.debug.matchedByKey
        ? 'key'
        : r.debug.matchedByAlias
        ? 'alias'
        : r.canonicalProduct
        ? 'fallback'
        : 'none';
      v = { canonical: r.canonicalProduct || 'אחר', premiumField: r.premiumFieldUsed, matchedBy };
      cache.set(k, v);
    }
    return v;
  };
}

export type SelectedPortfolioRow = {
  row: InsightsPolicyRow;
  category: PortfolioCategory;
  product: string;
  matchedBy: ProductMatch;
};

/**
 * אילו שורות נכנסות ל"תיק נוכחי" — מקור אמת אחד לקוביות ולרשימת הפוליסות.
 * לכל תבנית: חודש הפרסום האחרון שלה, ובתוכו חודש הדיווח האחרון
 * (צבירה היא יתרה — אסור לסכום אותה על פני חודשים).
 * השורה נכנסת רק אם שדה הפרמיה שלה (לפי התבנית) הוא אחד מ-PORTFOLIO_FIELDS.
 */
/** לכל תבנית: חודש הפרסום האחרון שלה, ובתוכו חודש הדיווח האחרון */
export function portfolioWindows(rows: InsightsPolicyRow[]) {
  const latestYm: Record<string, string> = {};
  for (const r of rows) {
    if (!latestYm[r.templateId] || r.ym > latestYm[r.templateId]) latestYm[r.templateId] = r.ym;
  }

  const maxReportMonth: Record<string, string> = {};
  for (const r of rows) {
    if (r.ym !== latestYm[r.templateId]) continue;
    if (!maxReportMonth[r.templateId] || r.reportMonth > maxReportMonth[r.templateId]) {
      maxReportMonth[r.templateId] = r.reportMonth;
    }
  }
  return { latestYm, maxReportMonth };
}

export function selectPortfolioRows(rows: InsightsPolicyRow[], resolve: Resolver) {
  const { latestYm, maxReportMonth } = portfolioWindows(rows);

  const selected: SelectedPortfolioRow[] = [];
  for (const r of rows) {
    if (r.ym !== latestYm[r.templateId] || r.reportMonth !== maxReportMonth[r.templateId]) continue;
    const { canonical, premiumField, matchedBy } = resolve(r.templateId, r.product);
    if (!isPortfolioField(premiumField)) continue;
    selected.push({ row: r, category: premiumField, product: canonical, matchedBy });
  }

  return { latestYm, maxReportMonth, selected };
}

export function computeInsights(params: {
  agentId: string;
  year: string;
  templatesById: Record<string, TemplateDoc | undefined>;
  activeTemplateIds: Set<string>;
  policyRows: InsightsPolicyRow[];
  incomeRows: InsightsIncomeRow[];
}): AgentInsights {
  const { agentId, year, templatesById, activeTemplateIds, policyRows, incomeRows } = params;

  const resolve = makeResolver(templatesById);

  return {
    agentId,
    year,
    portfolio: computePortfolio(policyRows, templatesById, activeTemplateIds, resolve),
    income: computeIncome(incomeRows),
    products: computeProducts(policyRows, resolve),
  };
}

// ─── תיק נוכחי ─────────────────────────────────────────────────────────────
// לכל תבנית: חודש הפרסום האחרון שלה, ובתוכו חודש הדיווח האחרון
// (צבירה היא יתרה — אסור לסכום אותה על פני חודשים).
// סכומים מתבניות שונות נסכמים תמיד.
function computePortfolio(
  rows: InsightsPolicyRow[],
  templatesById: Record<string, TemplateDoc | undefined>,
  activeTemplateIds: Set<string>,
  resolve: Resolver
): PortfolioSnapshot {
  const { latestYm, selected } = selectPortfolioRows(rows, resolve);

  const companyByTemplate: Record<string, string> = {};
  for (const r of rows) if (r.company) companyByTemplate[r.templateId] = r.company;

  const allLatest = Object.values(latestYm).sort();
  const overallLatest = allLatest.length ? allLatest[allLatest.length - 1] : null;

  const staleTemplates: StaleTemplate[] = Object.entries(latestYm)
    .filter(([tid, ym]) => overallLatest && ym < overallLatest && activeTemplateIds.has(tid))
    .map(([templateId, ym]) => ({
      templateId,
      templateName: String((templatesById[templateId] as any)?.Name ?? templateId),
      companyName: companyByTemplate[templateId] ?? '',
      ym,
    }))
    .sort((a, b) => a.ym.localeCompare(b.ym));

  const acc = {} as Record<PortfolioCategory, { amount: number; policies: Set<string>; companies: Record<string, CompanyAcc> }>;
  for (const f of PORTFOLIO_FIELDS) acc[f] = { amount: 0, policies: new Set(), companies: {} };

  for (const { row: r, category } of selected) {
    const company = r.company || 'חברה לא ידועה';
    const policyKey = `${company}|${r.policyNumberKey}|${r.customerId ?? ''}`;
    const a = acc[category];
    a.amount += r.premium;
    a.policies.add(policyKey);
    if (!a.companies[company]) a.companies[company] = { amount: 0, policies: new Set(), months: new Set() };
    a.companies[company].amount += r.premium;
    a.companies[company].policies!.add(policyKey);
    a.companies[company].months!.add(r.ym);
  }

  const categories = {} as PortfolioSnapshot['categories'];
  for (const f of PORTFOLIO_FIELDS) {
    categories[f] = {
      amount: round2(acc[f].amount),
      policies: acc[f].policies.size,
      byCompany: toCompanyList(acc[f].companies),
    };
  }

  return { latestYm: overallLatest, staleTemplates, categories };
}

// ─── הכנסות מעמלות ────────────────────────────────────────────────────────
function computeIncome(rows: InsightsIncomeRow[]): IncomeSummary {
  const byYm: Record<string, number> = {};
  const byCompany: Record<string, CompanyAcc> = {};
  const byYmCompany: Record<string, Record<string, CompanyAcc>> = {};

  for (const r of rows) {
    byYm[r.ym] = (byYm[r.ym] || 0) + r.amount;
    if (!byCompany[r.company]) byCompany[r.company] = { amount: 0 };
    byCompany[r.company].amount += r.amount;
    if (!byYmCompany[r.ym]) byYmCompany[r.ym] = {};
    if (!byYmCompany[r.ym][r.company]) byYmCompany[r.ym][r.company] = { amount: 0 };
    byYmCompany[r.ym][r.company].amount += r.amount;
  }

  const months = Object.keys(byYm)
    .sort()
    .map((ym) => ({ ym, total: round2(byYm[ym]) }));

  const totalYear = round2(months.reduce((s, m) => s + m.total, 0));
  const monthsCount = months.length;
  const last = months[monthsCount - 1];
  const prev = months[monthsCount - 2];

  // קצב הכנסה: ממוצע עד 3 חודשי פרסום אחרונים
  const recent = months.slice(-3);
  const recentYms = recent.map((m) => m.ym);
  const avgRecent = recent.length ? recent.reduce((s, m) => s + m.total, 0) / recent.length : 0;
  const recentCompanyAcc: Record<string, CompanyAcc> = {};
  for (const ym of recentYms) {
    for (const [company, c] of Object.entries(byYmCompany[ym] ?? {})) {
      if (!recentCompanyAcc[company]) recentCompanyAcc[company] = { amount: 0 };
      recentCompanyAcc[company].amount += c.amount / recent.length;
    }
  }

  return {
    months,
    byCompany: toCompanyList(byCompany),
    byYmCompany: Object.fromEntries(Object.entries(byYmCompany).map(([ym, m]) => [ym, toCompanyList(m)])),
    totalYear,
    monthsCount,
    avgMonthly: monthsCount ? round2(totalYear / monthsCount) : 0,
    lastYm: last?.ym ?? null,
    lastTotal: last?.total ?? 0,
    prevYm: prev?.ym ?? null,
    prevTotal: prev?.total ?? 0,
    changePct: prev && prev.total !== 0 ? round2(((last.total - prev.total) / Math.abs(prev.total)) * 100) : null,
    recentYms,
    avgRecent: round2(avgRecent),
    recentByCompany: toCompanyList(recentCompanyAcc),
    annualRunRate: round2(avgRecent * 12),
  };
}

// ─── מוצרים ───────────────────────────────────────────────────────────────
function computeProducts(rows: InsightsPolicyRow[], resolve: Resolver): ProductsSummary {
  const groupByProduct: Record<string, string> = {};
  const pc: Record<string, { product: string; company: string; amount: number }> = {};
  const pm: Record<string, { product: string; ym: string; amount: number }> = {};

  for (const r of rows) {
    const product = resolve(r.templateId, r.product).canonical;
    if (!groupByProduct[product] && r.productGroup) groupByProduct[product] = r.productGroup;

    const company = r.company || 'חברה לא ידועה';
    const k1 = `${product}|${company}`;
    if (!pc[k1]) pc[k1] = { product, company, amount: 0 };
    pc[k1].amount += r.commission;

    const k2 = `${product}|${r.ym}`;
    if (!pm[k2]) pm[k2] = { product, ym: r.ym, amount: 0 };
    pm[k2].amount += r.commission;
  }

  return {
    byCompany: Object.values(pc).map((x) => ({
      ...x,
      amount: round2(x.amount),
      productGroup: groupByProduct[x.product] ?? '',
    })),
    byMonth: Object.values(pm).map((x) => ({ ...x, amount: round2(x.amount) })),
  };
}
