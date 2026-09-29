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
    transfers: {
      recentYms: d?.transfers?.recentYms ?? [],
      items: d?.transfers?.items ?? [],
      thresholds: d?.transfers?.thresholds ?? { minPremium: 0, spikeMultiplier: 0, lowRateRatio: 0, minPeers: 0 },
    },
    efficiency: {
      recentYms: d?.efficiency?.recentYms ?? [],
      months: d?.efficiency?.months ?? [],
      avgPerHousehold: d?.efficiency?.avgPerHousehold ?? 0,
      households: d?.efficiency?.households ?? 0,
      customers: d?.efficiency?.customers ?? 0,
      linkedCustomers: d?.efficiency?.linkedCustomers ?? 0,
      linkedShare: d?.efficiency?.linkedShare ?? 0,
      notInCrm: d?.efficiency?.notInCrm ?? 0,
      byDepth: d?.efficiency?.byDepth ?? [],
      singleProduct: d?.efficiency?.singleProduct ?? [],
    },
  };
}