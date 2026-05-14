// services/server/hekefSummaryService.ts
import { admin } from '@/lib/firebase/firebase-admin';

export interface HekefSummaryResult {
  summaryByMonthCompany: Record<string, Record<string, number>>;
  summaryByCompanyAgentMonth: Record<string, Record<string, Record<string, number>>>;
  companyIdByName: Record<string, string>;
  allMonths: string[];
  allCompanies: string[];
  monthlyTotalsData: { month: string; total: number }[];
  perCompanyOverMonthsData: Record<string, string | number>[];
}

export async function getHekefSummary(params: {
  agentId: string;
  fromMonth: string;
  toMonth: string;
}): Promise<HekefSummaryResult> {
  const { agentId, fromMonth, toMonth } = params;
  const db = admin.firestore();

  // 1. שלוף templateIds שיש להם hekefType
  const templatesSnap = await db
    .collection('commissionTemplates')
    .where('isactive', '==', true)
    .get();

  const hekefTemplateIds = new Set(
    templatesSnap.docs
      .filter(d => !!d.data().hekefType)
      .map(d => d.id)
  );

  if (!hekefTemplateIds.size) {
    return {
      summaryByMonthCompany: {},
      summaryByCompanyAgentMonth: {},
      companyIdByName: {},
      allMonths: [],
      allCompanies: [],
      monthlyTotalsData: [],
      perCompanyOverMonthsData: [],
    };
  }

  // 2. שלוף policyCommissionSummaries לפי agentId + validMonth
const snap = await db
  .collection('policyCommissionSummaries')
  .where('agentId', '==', agentId)
  .where('reportMonth', '>=', fromMonth)
  .where('reportMonth', '<=', toMonth)
  .get();

  const companyIdByName: Record<string, string> = {};
  const summaryByMonthCompany: Record<string, Record<string, number>> = {};
  const summaryByCompanyAgentMonth: Record<string, Record<string, Record<string, number>>> = {};

  for (const doc of snap.docs) {
    const x: any = doc.data();

    // סנן רק היקפים
    if (!hekefTemplateIds.has(x.templateId)) continue;

const month = String(x.reportMonth || '').trim();
    const companyName = String(x.company || 'לא ידוע').trim();
    const agentCode = String(x.agentCode || '-').trim();
    const amount = Number(x.totalPremiumAmount ?? 0);

    if (!month) continue;

    if (x.companyId && companyName !== 'לא ידוע' && !companyIdByName[companyName]) {
      companyIdByName[companyName] = x.companyId;
    }

    if (!summaryByMonthCompany[month]) summaryByMonthCompany[month] = {};
    summaryByMonthCompany[month][companyName] = (summaryByMonthCompany[month][companyName] || 0) + amount;

    if (!summaryByCompanyAgentMonth[companyName]) summaryByCompanyAgentMonth[companyName] = {};
    if (!summaryByCompanyAgentMonth[companyName][agentCode]) summaryByCompanyAgentMonth[companyName][agentCode] = {};
    summaryByCompanyAgentMonth[companyName][agentCode][month] = (summaryByCompanyAgentMonth[companyName][agentCode][month] || 0) + amount;
  }

  const allMonths = Object.keys(summaryByMonthCompany).sort();
  const allCompanies = Array.from(
    new Set(Object.values(summaryByMonthCompany).flatMap(m => Object.keys(m)))
  ).sort();

  const monthlyTotalsData = allMonths.map(month => ({
    month,
    total: allCompanies.reduce((sum, c) => sum + (summaryByMonthCompany[month]?.[c] || 0), 0),
  }));

  const perCompanyOverMonthsData = allMonths.map(month => {
    const row: Record<string, string | number> = { month };
    allCompanies.forEach(c => { row[c] = summaryByMonthCompany[month]?.[c] || 0; });
    return row;
  });

  return {
    summaryByMonthCompany,
    summaryByCompanyAgentMonth,
    companyIdByName,
    allMonths,
    allCompanies,
    monthlyTotalsData,
    perCompanyOverMonthsData,
  };
}