// ═══════════════════════════════════════════════════════════════════
// services/server/commissionSummaryService.ts
// summaryByYmCompany נבנה מ-ymCommissionSummaries (מהיר, מסמכים מסכמים)
// ולא מ-externalCommissions (איטי, ledger גולמי).
// ═══════════════════════════════════════════════════════════════════

import { admin } from '@/lib/firebase/firebase-admin';

export interface CommissionSummary {
  agentId: string;
  agentCode: string;
  reportMonth: string;
  templateId: string;
  totalCommissionAmount: number;
  company?: string;
  companyId?: string;
}

export interface CommissionSummaryQuery {
  agentId: string;
  fromMonth: string;
  toMonth: string;
}

export interface CommissionSummaryResult {
  summaries: CommissionSummary[];
  companyMap: Record<string, string>;
  companyIdByName: Record<string, string>;
  summaryByMonthCompany: Record<string, Record<string, number>>;
  summaryByCompanyAgentMonth: Record<string, Record<string, Record<string, number>>>;
  allMonths: string[];
  allCompanies: string[];
  monthlyTotalsData: { month: string; total: number }[];
  perCompanyOverMonthsData: Record<string, string | number>[];
  summaryByYmCompany: Record<string, Record<string, number>>;
}

export async function getCommissionSummary(
  params: CommissionSummaryQuery
): Promise<CommissionSummaryResult> {
  const { agentId, fromMonth, toMonth } = params;
  const companyIdByName: Record<string, string> = {};
  const db = admin.firestore();

  // ─── תבניות "היקף" — לא נכלל ────────────────────────────────────
  const templatesSnap = await db
    .collection('commissionTemplates')
    .where('isactive', '==', true)
    .get();

  const hekefTemplateIds = new Set(
    templatesSnap.docs.filter(d => !!d.data().hekefType).map(d => d.id)
  );

  // ═══════════════════════════════════════════════════════════
  // מבט 1: "לפי חודש דיווח" — commissionSummaries הממוזג
  // ═══════════════════════════════════════════════════════════
  const snap = await db
    .collection('commissionSummaries')
    .where('agentId', '==', agentId)
    .where('reportMonth', '>=', fromMonth)
    .where('reportMonth', '<=', toMonth)
    .orderBy('reportMonth')
    .get();

  const summaries: CommissionSummary[] = snap.docs
    .map(d => d.data() as CommissionSummary)
    .filter(item => !hekefTemplateIds.has(item.templateId));

  const companyMap: Record<string, string> = {};
  const summaryByMonthCompany: Record<string, Record<string, number>> = {};
  const summaryByCompanyAgentMonth: Record<string, Record<string, Record<string, number>>> = {};

  for (const item of summaries) {
    const companyName = item.company || 'לא ידוע';
    const month = item.reportMonth;
    const agentCode = item.agentCode || '-';

    if (item.companyId && companyName !== 'לא ידוע' && !companyIdByName[companyName]) {
      companyIdByName[companyName] = item.companyId;
    }
    if (item.templateId && !companyMap[item.templateId]) {
      companyMap[item.templateId] = companyName;
    }

    if (!summaryByMonthCompany[month]) summaryByMonthCompany[month] = {};
    if (!summaryByMonthCompany[month][companyName]) summaryByMonthCompany[month][companyName] = 0;
    summaryByMonthCompany[month][companyName] += item.totalCommissionAmount || 0;

    if (!summaryByCompanyAgentMonth[companyName]) summaryByCompanyAgentMonth[companyName] = {};
    if (!summaryByCompanyAgentMonth[companyName][agentCode]) summaryByCompanyAgentMonth[companyName][agentCode] = {};
    if (!summaryByCompanyAgentMonth[companyName][agentCode][month]) summaryByCompanyAgentMonth[companyName][agentCode][month] = 0;
    summaryByCompanyAgentMonth[companyName][agentCode][month] += item.totalCommissionAmount || 0;
  }

  const allMonths = Object.keys(summaryByMonthCompany).sort();
  const allCompanies = Array.from(
    new Set(Object.values(summaryByMonthCompany).flatMap(m => Object.keys(m)))
  ).sort();

  const monthlyTotalsData = allMonths.map(month => ({
    month,
    total: allCompanies.reduce((sum, company) => sum + (summaryByMonthCompany[month]?.[company] || 0), 0),
  }));

  const perCompanyOverMonthsData = allMonths.map(month => {
    const row: Record<string, string | number> = { month };
    allCompanies.forEach(company => {
      row[company] = summaryByMonthCompany[month]?.[company] || 0;
    });
    return row;
  });

  // ═══════════════════════════════════════════════════════════
  // מבט 2: "לפי חודש פרסום" — ymCommissionSummaries (מהיר!)
  // שליפה ישירה של מסמכים מסכמים לפי agentId + טווח ym.
  // כל מסמך = delta של ריצה אחת לאותו ym+reportMonth.
  // ═══════════════════════════════════════════════════════════
  const ymSnap = await db
    .collection('ymCommissionSummaries')
    .where('agentId', '==', agentId)
    .where('ym', '>=', fromMonth)
    .where('ym', '<=', toMonth)
    .get();

  const summaryByYmCompany: Record<string, Record<string, number>> = {};

  for (const d of ymSnap.docs) {
    const r = d.data() as any;
    if (hekefTemplateIds.has(String(r.templateId || ''))) continue;

    const ym = String(r.ym || '');
    const companyName = String(r.company || 'לא ידוע');
    const amount = Number(r.totalCommissionAmount || 0);

    if (!ym) continue;

    if (!summaryByYmCompany[ym]) summaryByYmCompany[ym] = {};
    summaryByYmCompany[ym][companyName] = (summaryByYmCompany[ym][companyName] || 0) + amount;
  }

  return {
    summaries,
    companyMap,
    companyIdByName,
    summaryByMonthCompany,
    summaryByCompanyAgentMonth,
    allMonths,
    allCompanies,
    monthlyTotalsData,
    perCompanyOverMonthsData,
    summaryByYmCompany,
  };
}