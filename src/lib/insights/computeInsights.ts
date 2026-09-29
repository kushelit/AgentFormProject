// src/lib/insights/computeInsights.ts
// חישוב טהור (ללא Firestore) של כל נתוני הסקירה — רץ בצד השרת.
import { resolveFromTemplate } from '@/utils/contractCommissionResolvers';
import { SIBLING_REPORTS, siblingReportFor } from '@/lib/anomalyRules';
import type { TemplateDoc } from '@/types/ContractCommissionComparison';
import {
  PORTFOLIO_FIELDS,
  type AgentInsights,
  type CompanyAmount,
  type PortfolioCategory,
  type PortfolioSnapshot,
  type IncomeSummary,
  type ProductsSummary,
  type EfficiencySummary,
  type HouseholdDepthLine,
  type TransferSummary,
  type TransferSuspect,
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

/** לקוח בניהול לקוחות → משק הבית שלו */
export type HouseholdMap = Record<string, { household: string; groupSize: number }>;

/** ת"ז קנונית: ספרות בלבד, בלי אפסים מובילים (כמו canonId בניהול לקוחות) */
export const canonCustomerId = (v: any) => String(v ?? '').replace(/\D/g, '').replace(/^0+/, '');

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

/** פענוח לשורה (ולא רק לתבנית+מוצר) — כולל סיווג מחדש לפי פוליסה אחות בדוח אחר */
export type RowResolver = (r: InsightsPolicyRow) => Resolved;

/**
 * מסווג לפי שורה: אם לשורה יש פוליסה אחות בדוח האח (lib/anomalyRules → SIBLING_REPORTS,
 * עם reclassifyAs) באותו חודש פרסום — היא מסווגת לפי reclassifyAs.
 * למשל הראל "פרט" + אחות בצבירה → פוליסת חיסכון / פרמיה פיננסים (לא נכנס לקוביית פרמיה ביטוח).
 * אחרת — הסיווג הרגיל של התבנית.
 * rows = כל השורות שבידינו (צריכות לכלול את שורות דוח האח, באותו חודש פרסום).
 */
export function makeRowResolver(rows: InsightsPolicyRow[], resolve: Resolver): RowResolver {
  const siblingTemplates = new Set(SIBLING_REPORTS.filter((s) => s.reclassifyAs).map((s) => s.sibling));
  const siblingKeys = new Set<string>();
  if (siblingTemplates.size) {
    for (const r of rows) {
      if (siblingTemplates.has(r.templateId) && r.policyNumberKey) {
        siblingKeys.add(`${r.templateId}|${r.ym}|${r.policyNumberKey}`);
      }
    }
  }
  return (r) => {
    if (siblingKeys.size) {
      const s = siblingReportFor(r.templateId, r.product);
      if (s?.reclassifyAs && siblingKeys.has(`${s.sibling}|${r.ym}|${r.policyNumberKey}`)) {
        return { canonical: s.reclassifyAs.canonicalProduct, premiumField: s.reclassifyAs.premiumField, matchedBy: 'key' };
      }
    }
    return resolve(r.templateId, r.product);
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

export function selectPortfolioRows(rows: InsightsPolicyRow[], resolve: Resolver, rowResolve: RowResolver = makeRowResolver(rows, resolve)) {
  const { latestYm, maxReportMonth } = portfolioWindows(rows);

  const selected: SelectedPortfolioRow[] = [];
  for (const r of rows) {
    if (r.ym !== latestYm[r.templateId] || r.reportMonth !== maxReportMonth[r.templateId]) continue;
    const { canonical, premiumField, matchedBy } = rowResolve(r);
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
  households?: HouseholdMap;
}): AgentInsights {
  const { agentId, year, templatesById, activeTemplateIds, policyRows, incomeRows, households = {} } = params;

  const resolve = makeResolver(templatesById);
  // סיווג לפי שורה — כולל "פוליסה אחות" (הראל "פרט" + צבירה → פוליסת חיסכון / פרמיה פיננסים)
  const rowResolve = makeRowResolver(policyRows, resolve);

  return {
    agentId,
    year,
    portfolio: computePortfolio(policyRows, templatesById, activeTemplateIds, resolve, rowResolve),
    income: computeIncome(incomeRows),
    products: computeProducts(policyRows, rowResolve),
    efficiency: computeEfficiency(policyRows, rowResolve, households),
    transfers: computeTransfers(policyRows, resolve, rowResolve),
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
  resolve: Resolver,
  rowResolve: RowResolver
): PortfolioSnapshot {
  const { latestYm, selected } = selectPortfolioRows(rows, resolve, rowResolve);

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
function computeProducts(rows: InsightsPolicyRow[], rowResolve: RowResolver): ProductsSummary {
  const groupByProduct: Record<string, string> = {};
  const pc: Record<string, { product: string; company: string; amount: number }> = {};
  const pm: Record<string, { product: string; ym: string; amount: number }> = {};

  for (const r of rows) {
    const product = rowResolve(r).canonical;
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

// ─── יעילות תיק — נפרעים למשק בית ───────────────────────────────────────
// משק בית = parentID בניהול לקוחות; לקוח לא מקושר / לא קיים = משק בית של אדם אחד.
// בסיס: עמלות הפוליסות ב-3 חודשי הפרסום האחרונים.
// ממוצע חודשי לכל משק בית — רק על החודשים שבהם הופיע בפועל, כך שלקוח (או סוכן)
// שנטען לראשונה בחודש האחרון מקבל את הנפרעים האמיתיים שלו ולא חלק מהם.
const SINGLE_LIST_LIMIT = 300;

function computeEfficiency(rows: InsightsPolicyRow[], rowResolve: RowResolver, households: HouseholdMap): EfficiencySummary {
  const allYms = Array.from(new Set(rows.map((r) => r.ym))).sort();
  const recentYms = allYms.slice(-3);
  const recentSet = new Set(recentYms);

  const hhOf = (cid: string) => households[cid]?.household ?? `solo:${cid}`;

  // מגמה לכל חודש פרסום
  const perYm: Record<string, { commission: number; hh: Set<string> }> = {};
  for (const r of rows) {
    const cid = canonCustomerId(r.customerId);
    if (!cid) continue;
    const m = (perYm[r.ym] ||= { commission: 0, hh: new Set() });
    m.commission += r.commission;
    m.hh.add(hhOf(cid));
  }
  // רק חודשים שיש בהם שורות עם ת"ז (חודש בלי אף ת"ז לא נספר — ולא מפיל את החישוב)
  const months = allYms.filter((ym) => perYm[ym]).map((ym) => ({
    ym,
    households: perYm[ym].hh.size,
    perHousehold: perYm[ym].hh.size ? round2(perYm[ym].commission / perYm[ym].hh.size) : 0,
  }));

  // משקי בית בחודשים האחרונים
  type HH = {
    commission: number;
    yms: Set<string>;
    products: Set<string>;
    customers: Map<string, { commission: number; name: string }>;
    byProduct: Record<string, number>;
    byCompany: Record<string, number>;
  };
  const hh = new Map<string, HH>();
  const customers = new Set<string>();

  for (const r of rows) {
    if (!recentSet.has(r.ym)) continue;
    const cid = canonCustomerId(r.customerId);
    if (!cid) continue;
    customers.add(cid);
    const key = hhOf(cid);
    let h = hh.get(key);
    if (!h) {
      h = { commission: 0, yms: new Set(), products: new Set(), customers: new Map(), byProduct: {}, byCompany: {} };
      hh.set(key, h);
    }
    const product = rowResolve(r).canonical;
    h.commission += r.commission;
    h.yms.add(r.ym);
    h.products.add(product);
    h.byProduct[product] = (h.byProduct[product] || 0) + r.commission;
    h.byCompany[r.company] = (h.byCompany[r.company] || 0) + r.commission;
    const c = h.customers.get(cid) ?? { commission: 0, name: '' };
    c.commission += r.commission;
    if (!c.name && r.fullName) c.name = r.fullName;
    h.customers.set(cid, c);
  }

  /** נפרעים חודשיים של משק בית — לפי החודשים שבהם הופיע בפועל */
  const monthlyOf = (h: HH) => h.commission / Math.max(1, h.yms.size);
  const totalMonthly = Array.from(hh.values()).reduce((s, h) => s + monthlyOf(h), 0);

  // עומק: מוצרים שונים למשק בית
  const buckets: Record<HouseholdDepthLine['depth'], { households: number; commission: number }> = {
    '1': { households: 0, commission: 0 },
    '2': { households: 0, commission: 0 },
    '3+': { households: 0, commission: 0 },
  };
  const top = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const single: EfficiencySummary['singleProduct'] = [];

  hh.forEach((h, key) => {
    const depth = h.products.size >= 3 ? '3+' : h.products.size === 2 ? '2' : '1';
    buckets[depth].households++;
    buckets[depth].commission += monthlyOf(h);
    if (depth === '1') {
      const lead = Array.from(h.customers.entries()).sort((a, b) => b[1].commission - a[1].commission)[0];
      single.push({
        customerId: lead?.[0] ?? '',
        name: lead?.[1].name ?? '',
        product: top(h.byProduct),
        company: top(h.byCompany),
        monthly: round2(monthlyOf(h)),
        members: key.startsWith('solo:') ? 1 : households[lead?.[0] ?? '']?.groupSize ?? 1,
      });
    }
  });

  let linked = 0;
  let notInCrm = 0;
  customers.forEach((cid) => {
    const x = households[cid];
    if (!x) notInCrm++;
    else if (x.groupSize >= 2) linked++;
  });

  return {
    recentYms,
    months,
    avgPerHousehold: hh.size ? round2(totalMonthly / hh.size) : 0,
    households: hh.size,
    customers: customers.size,
    linkedCustomers: linked,
    // דיוק מלא — מעט לקוחות מקושרים מתוך אלפים לא יתעגלו ל-0
    linkedShare: customers.size ? Math.round((linked / customers.size) * 10000) / 10000 : 0,
    notInCrm,
    byDepth: (['1', '2', '3+'] as const).map((d) => ({
      depth: d,
      households: buckets[d].households,
      avgMonthly: buckets[d].households ? round2(buckets[d].commission / buckets[d].households) : 0,
    })),
    singleProduct: single.sort((a, b) => b.monthly - a.monthly).slice(0, SINGLE_LIST_LIMIT),
  };
}

// ─── ניודים אפשריים בפנסיה ─────────────────────────────────────────────
// ניוד (צבירה שעוברת בין חברות) מגיע לעיתים בדוח כ"פרמיה פנסיה" בחודש הניוד: מקפיץ את
// הפרמיה ומוריד את אחוז העמלה (על הניוד אין עמלה, על ההפקדה יש). סימון בלבד — בלי פיצול.
// שני סימנים (אחד מספיק), תמיד מעל סף פרמיה מינימלי:
//   spike    — בחודש הפרסום הקודם הייתה לפוליסה הפקדה רגילה, והחודש הפרמיה גבוהה ממנה פי SPIKE_MULTIPLIER
//   low_rate — אחוז העמלה נמוך מ-LOW_RATE_RATIO מהחציון של פוליסות מאותו דוח ומוצר באותו חודש
//              (רק כשיש לפחות MIN_PEERS פוליסות להשוואה) — תופס גם פוליסה חדשה בלי היסטוריה
const TRANSFER_MIN_PREMIUM = 20000;
const TRANSFER_SPIKE_MULTIPLIER = 5;
const TRANSFER_LOW_RATE_RATIO = 0.3;
const TRANSFER_MIN_PEERS = 5;
const TRANSFER_LIST_LIMIT = 300;

function median(values: number[]) {
  if (!values.length) return 0;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function computeTransfers(rows: InsightsPolicyRow[], resolve: Resolver, rowResolve: RowResolver): TransferSummary {
  const thresholds = {
    minPremium: TRANSFER_MIN_PREMIUM,
    spikeMultiplier: TRANSFER_SPIKE_MULTIPLIER,
    lowRateRatio: TRANSFER_LOW_RATE_RATIO,
    minPeers: TRANSFER_MIN_PEERS,
  };

  // פוליסה × חודש פרסום (כמה חודשי דיווח באותו פרסום — מתאחדים)
  type Agg = {
    ym: string;
    templateId: string;
    company: string;
    policyNumberKey: string;
    customerId: string;
    fullName: string;
    product: string;
    premium: number;
    commission: number;
  };
  const byKey = new Map<string, Agg>();
  for (const r of rows) {
    const res = rowResolve(r);
    if (res.premiumField !== 'pensiaPremia') continue;
    const cid = canonCustomerId(r.customerId);
    const policyKey = `${r.templateId}|${r.policyNumberKey}|${cid}`;
    const k = `${policyKey}|${r.ym}`;
    let a = byKey.get(k);
    if (!a) {
      a = {
        ym: r.ym,
        templateId: r.templateId,
        company: r.company,
        policyNumberKey: r.policyNumberKey,
        customerId: String(r.customerId ?? ''),
        fullName: r.fullName ?? '',
        product: res.canonical,
        premium: 0,
        commission: 0,
      };
      byKey.set(k, a);
    }
    a.premium += r.premium;
    a.commission += r.commission;
    if (!a.fullName && r.fullName) a.fullName = r.fullName;
  }

  const allYms = Array.from(new Set(rows.map((r) => r.ym))).sort();
  const prevYm: Record<string, string | undefined> = {};
  allYms.forEach((ym, i) => (prevYm[ym] = allYms[i - 1]));
  const recentYms = allYms.slice(-3);
  const recentSet = new Set(recentYms);

  // חציון אחוז עמלה: דוח × מוצר × חודש פרסום
  const peerRates = new Map<string, number[]>();
  byKey.forEach((a) => {
    if (a.premium <= 0) return;
    const pk = `${a.templateId}|${a.product}|${a.ym}`;
    const list = peerRates.get(pk) ?? [];
    list.push((a.commission / a.premium) * 100);
    peerRates.set(pk, list);
  });
  const peerMedian = new Map<string, number>();
  peerRates.forEach((list, pk) => list.length >= TRANSFER_MIN_PEERS && peerMedian.set(pk, median(list)));

  // אילו שורות בקוביית "פרמיה פנסיה" (החלון האחרון של כל תבנית)
  const inPortfolio = new Set<string>();
  selectPortfolioRows(rows, resolve, rowResolve).selected.forEach((s) => {
    if (s.category !== 'pensiaPremia') return;
    inPortfolio.add(`${s.row.templateId}|${s.row.policyNumberKey}|${canonCustomerId(s.row.customerId)}|${s.row.ym}`);
  });

  const items: TransferSuspect[] = [];
  byKey.forEach((a, k) => {
    if (!recentSet.has(a.ym) || a.premium < TRANSFER_MIN_PREMIUM) return;
    const reasons: TransferSuspect['reasons'] = [];
    const rate = a.premium > 0 ? (a.commission / a.premium) * 100 : 0;

    const pYm = prevYm[a.ym];
    const policyKey = k.slice(0, k.lastIndexOf('|'));
    const prev = pYm ? byKey.get(`${policyKey}|${pYm}`) : undefined;
    if (prev && prev.premium > 0 && a.premium >= prev.premium * TRANSFER_SPIKE_MULTIPLIER) reasons.push('spike');

    const peer = peerMedian.get(`${a.templateId}|${a.product}|${a.ym}`);
    if (peer !== undefined && peer > 0 && rate < peer * TRANSFER_LOW_RATE_RATIO) reasons.push('low_rate');

    if (!reasons.length) return;
    items.push({
      ...a,
      premium: round2(a.premium),
      commission: round2(a.commission),
      rate: Math.round(rate * 1000) / 1000,
      reasons,
      prevPremium: prev ? round2(prev.premium) : undefined,
      peerRate: peer !== undefined ? Math.round(peer * 1000) / 1000 : undefined,
      inPortfolio: inPortfolio.has(k),
    });
  });

  items.sort((x, y) => (x.ym === y.ym ? y.premium - x.premium : y.ym.localeCompare(x.ym)));
  return { recentYms, items: items.slice(0, TRANSFER_LIST_LIMIT), thresholds };
}