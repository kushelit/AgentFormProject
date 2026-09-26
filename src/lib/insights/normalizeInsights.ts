// src/lib/insights/normalizeInsights.ts
// השלמת שדות חסרים ב-AgentInsights — הגנה מפני מבנה ישן (מטמון מגרסה קודמת).
// משמש גם בדפדפן (useAgentInsights) וגם בשרת (agent-insights/ai).
import type { AgentInsights } from '@/types/agentInsights';

export function normalizeInsights(d: any): AgentInsights {
  const emptyCat = { amount: 0, policies: 0, byCompany: [] };
  const cats = d?.portfolio?.categories ?? {};
  const inc = d?.income ?? {};
  return {
    agentId: d?.agentId ?? '',
    year: String(d?.year ?? ''),
    portfolio: {
      latestYm: d?.portfolio?.latestYm ?? null,
      staleTemplates: d?.portfolio?.staleTemplates ?? [],
      categories: {
        finansimZvira: { ...emptyCat, ...(cats.finansimZvira ?? {}) },
        pensiaPremia: { ...emptyCat, ...(cats.pensiaPremia ?? {}) },
        insPremia: { ...emptyCat, ...(cats.insPremia ?? {}) },
      },
    },
    income: {
      months: inc.months ?? [],
      byCompany: inc.byCompany ?? [],
      byYmCompany: inc.byYmCompany ?? {},
      totalYear: inc.totalYear ?? 0,
      monthsCount: inc.monthsCount ?? 0,
      avgMonthly: inc.avgMonthly ?? 0,
      lastYm: inc.lastYm ?? null,
      lastTotal: inc.lastTotal ?? 0,
      prevYm: inc.prevYm ?? null,
      prevTotal: inc.prevTotal ?? 0,
      changePct: inc.changePct ?? null,
      recentYms: inc.recentYms ?? [],
      avgRecent: inc.avgRecent ?? 0,
      recentByCompany: inc.recentByCompany ?? [],
      annualRunRate: inc.annualRunRate ?? 0,
    },
    products: {
      byCompany: d?.products?.byCompany ?? [],
      byMonth: d?.products?.byMonth ?? [],
    },
  };
}
