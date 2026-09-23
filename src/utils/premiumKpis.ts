// src/utils/premiumKpis.ts
import { resolveFromTemplate } from '@/utils/contractCommissionResolvers';
import type { TemplateDoc } from '@/types/ContractCommissionComparison';

/**
 * רק שדות פרמיה שהסוכן מקבל בגינם עמלות.
 * הסיווג נקבע לפי premiumFieldUsed מהתבנית:
 * premiumField של המוצר ב-productMap, ואם אין — defaultPremiumField.
 * כל שדה אחר (למשל finansimPremia) מדולג.
 */
export const COUNTED_FIELDS = ['finansimZvira', 'pensiaPremia', 'insPremia'] as const;
export type PremiumCategory = (typeof COUNTED_FIELDS)[number];

export type PremiumKpiRow = {
  policyNumberKey: string;
  customerId?: string;
  product?: string;
  totalPremiumAmount: number;
  month: string; // חודש פרסום YYYY-MM
  templateId: string;
  companyName?: string;
};

export type CompanyBreakdown = {
  company: string;
  amount: number;
  policies: number;
  months: string[]; // חודשי הפרסום שנכללו (חברה עם כמה תבניות יכולה להיות בכמה חודשים)
};

export type CategoryTotals = {
  amount: number;
  policies: number;
  byCompany: CompanyBreakdown[]; // ממוין מהגדול לקטן
};

export type StaleTemplate = {
  templateId: string;
  templateName: string;
  companyName: string;
  month: string;
};

export type PremiumKpis = {
  byCategory: Record<PremiumCategory, CategoryTotals>;
  latestMonth: string | null;      // חודש הפרסום האחרון (הגבוה מכולם)
  staleTemplates: StaleTemplate[]; // תבניות שחודש הפרסום האחרון שלהן ישן מ-latestMonth
};

const isCounted = (field?: string): field is PremiumCategory =>
  !!field && (COUNTED_FIELDS as readonly string[]).includes(field);

const emptyCategory = (): CategoryTotals => ({ amount: 0, policies: 0, byCompany: [] });

/**
 * חישוב KPI לפי חודש הפרסום האחרון של כל תבנית:
 * 1. לכל תבנית לוקחים את חודש הפרסום האחרון שלה (תמונת מצב — צבירה היא יתרה,
 *    ולכן אסור לסכום אותה על פני חודשים).
 * 2. כל שורה מפוענחת דרך התבנית -> premiumFieldUsed -> קטגוריה.
 * 3. סכומים נסכמים תמיד — גם אם אותה פוליסה מופיעה בכמה תבניות.
 * 4. מונה הפוליסות סופר כל פוליסה פעם אחת לכל קטגוריה (ולכל חברה).
 */
export function computePremiumKpis(
  rows: PremiumKpiRow[],
  templatesById: Record<string, TemplateDoc | undefined>
): PremiumKpis {
  const byCategory: Record<PremiumCategory, CategoryTotals> = {
    finansimZvira: emptyCategory(),
    pensiaPremia: emptyCategory(),
    insPremia: emptyCategory(),
  };

  if (!rows.length) {
    return { byCategory, latestMonth: null, staleTemplates: [] };
  }

  // 1) חודש אחרון לכל תבנית
  const latestByTemplate: Record<string, string> = {};
  const companyByTemplate: Record<string, string> = {};
  for (const r of rows) {
    if (!r.templateId || !r.month) continue;
    const cur = latestByTemplate[r.templateId];
    if (!cur || r.month > cur) latestByTemplate[r.templateId] = r.month;
    if (r.companyName) companyByTemplate[r.templateId] = r.companyName;
  }

  const months = Object.values(latestByTemplate).sort();
  const latestMonth = months.length ? months[months.length - 1] : null;

  const staleTemplates: StaleTemplate[] = Object.entries(latestByTemplate)
    .filter(([, m]) => latestMonth && m < latestMonth)
    .map(([templateId, month]) => ({
      templateId,
      templateName: String((templatesById[templateId] as any)?.Name ?? templateId),
      companyName: companyByTemplate[templateId] ?? '',
      month,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // 2+3+4) סיווג וסכימה — כולל פילוח לפי חברה
  type CompanyAcc = { amount: number; policies: Set<string>; months: Set<string> };
  const acc: Record<PremiumCategory, { policies: Set<string>; companies: Record<string, CompanyAcc> }> = {
    finansimZvira: { policies: new Set(), companies: {} },
    pensiaPremia: { policies: new Set(), companies: {} },
    insPremia: { policies: new Set(), companies: {} },
  };

  for (const r of rows) {
    if (!r.templateId || r.month !== latestByTemplate[r.templateId]) continue;

    const resolved = resolveFromTemplate(templatesById[r.templateId], r.product);
    const field = resolved.premiumFieldUsed;
    if (!isCounted(field)) continue;

    const amount = Number(r.totalPremiumAmount) || 0;
    const company = r.companyName || 'חברה לא ידועה';
    const policyKey = `${company}|${r.policyNumberKey}|${r.customerId ?? ''}`;

    byCategory[field].amount += amount;
    acc[field].policies.add(policyKey);

    if (!acc[field].companies[company]) {
      acc[field].companies[company] = { amount: 0, policies: new Set(), months: new Set() };
    }
    const c = acc[field].companies[company];
    c.amount += amount;
    c.policies.add(policyKey);
    c.months.add(r.month);
  }

  for (const cat of COUNTED_FIELDS) {
    byCategory[cat].policies = acc[cat].policies.size;
    byCategory[cat].byCompany = Object.entries(acc[cat].companies)
      .map(([company, c]) => ({
        company,
        amount: c.amount,
        policies: c.policies.size,
        months: Array.from(c.months).sort(),
      }))
      .filter((c) => c.amount !== 0 || c.policies > 0)
      .sort((a, b) => b.amount - a.amount);
  }

  return { byCategory, latestMonth, staleTemplates };
}