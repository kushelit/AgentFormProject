// src/lib/insights/comparisonLink.ts
// קישור לדף "השוואת טעינות" (CommissionComparisonByPolicy) עם הגדרות מוכנות והרצה אוטומטית.

export const COMPARISON_PAGE = '/importCommissionHub/CommissionComparison';

/** true = דף ההשוואה נפתח בלשונית חדשה (הדף המסכם נשאר פתוח עם מה שסומן) */
const OPEN_IN_NEW_TAB = true;

export type ComparisonBasis = 'ym' | 'reportMonth';
export type ComparisonScope = 'template' | 'company' | 'all';

export function buildComparisonUrl(p: {
  agentId: string;
  basis: ComparisonBasis;
  m1: string;
  m2: string;
  scope: ComparisonScope;
  companyId?: string;
  templateId?: string;
}) {
  const [a, b] = [p.m1, p.m2].sort(); // m1 = המוקדם
  const qs = new URLSearchParams({ agentId: p.agentId, basis: p.basis, m1: a, m2: b, scope: p.scope, run: '1' });
  if (p.scope !== 'all' && p.companyId) qs.set('companyId', p.companyId);
  if (p.scope === 'template' && p.templateId) qs.set('templateId', p.templateId);
  return `${COMPARISON_PAGE}?${qs.toString()}`;
}

export function openComparison(p: Parameters<typeof buildComparisonUrl>[0]) {
  const url = buildComparisonUrl(p);
  if (OPEN_IN_NEW_TAB) window.open(url, '_blank', 'noopener');
  else window.location.assign(url);
}

/** החודש שלפני ym ברשימת חודשים קיימים (לא בהכרח חודש קלנדרי קודם) */
export function previousIn(months: string[], ym: string): string | null {
  const sorted = [...months].sort();
  const i = sorted.indexOf(ym);
  return i > 0 ? sorted[i - 1] : null;
}
