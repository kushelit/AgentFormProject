// ═══════════════════════════════════════════════════════════════════
// services/server/commissionSummaryService.ts
// תיקון: סינון תבניות "היקף" (hekefType) — נכלל רק תבניות נפרעים
// ═══════════════════════════════════════════════════════════════════

import { admin } from '@/lib/firebase/firebase-admin';

export interface CommissionSummary {
  agentId: string;
  agentCode: string;
  reportMonth: string; // YYYY-MM
  templateId: string;
  totalCommissionAmount: number;
  company?: string;
  companyId?: string;
}

export interface CommissionSummaryQuery {
  agentId: string;
  fromMonth: string; // "YYYY-MM"
  toMonth: string;   // "YYYY-MM"
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

  // ─── ① שלוף את templateIds שהם "היקף" (יש להם hekefType) ──────────────────
  // אלה ה-templates שצריך *לא* לכלול בדף הנפרעים.
  const templatesSnap = await db
    .collection('commissionTemplates')
    .where('isactive', '==', true)
    .get();

  const hekefTemplateIds = new Set(
    templatesSnap.docs
      .filter(d => !!d.data().hekefType)
      .map(d => d.id)
  );

  // --- FETCH RAW SUMMARIES (אוסף יחיד, בלי אוספים נוספים) ---
  const snap = await db
    .collection('commissionSummaries')
    .where('agentId', '==', agentId)
    .where('reportMonth', '>=', fromMonth)
    .where('reportMonth', '<=', toMonth)
    .orderBy('reportMonth')
    .get();

  // ─── ② סינון: רק templates שאין להם hekefType (= "נפרעים") ────────────────
  const summaries: CommissionSummary[] = snap.docs
    .map((d) => d.data() as CommissionSummary)
    .filter((item) => !hekefTemplateIds.has(item.templateId));

  // --- נבנה companyMap מתוך הסיכומים עצמם (templateId -> companyName) ---
  const companyMap: Record<string, string> = {};

  const summaryByMonthCompany: Record<string, Record<string, number>> = {};
  const summaryByCompanyAgentMonth: Record<
    string,
    Record<string, Record<string, number>>
  > = {};

  for (const item of summaries) {
    const companyName = item.company || 'לא ידוע';
    const month = item.reportMonth;
    const agentCode = item.agentCode || '-';

    if (item.companyId && companyName !== 'לא ידוע' && !companyIdByName[companyName]) {
      companyIdByName[companyName] = item.companyId;
    }

    // map לפי templateId -> שם חברה (יכול לשמש לדוחות אחרים)
    if (item.templateId && !companyMap[item.templateId]) {
      companyMap[item.templateId] = companyName;
    }

    // --- summaryByMonthCompany ---
    if (!summaryByMonthCompany[month]) summaryByMonthCompany[month] = {};
    if (!summaryByMonthCompany[month][companyName])
      summaryByMonthCompany[month][companyName] = 0;

    summaryByMonthCompany[month][companyName] +=
      item.totalCommissionAmount || 0;

    // --- summaryByCompanyAgentMonth ---
    if (!summaryByCompanyAgentMonth[companyName])
      summaryByCompanyAgentMonth[companyName] = {};
    if (!summaryByCompanyAgentMonth[companyName][agentCode])
      summaryByCompanyAgentMonth[companyName][agentCode] = {};
    if (!summaryByCompanyAgentMonth[companyName][agentCode][month])
      summaryByCompanyAgentMonth[companyName][agentCode][month] = 0;

    summaryByCompanyAgentMonth[companyName][agentCode][month] +=
      item.totalCommissionAmount || 0;
  }

  const allMonths = Object.keys(summaryByMonthCompany).sort();
  const allCompanies = Array.from(
    new Set(
      Object.values(summaryByMonthCompany).flatMap((m) => Object.keys(m))
    )
  ).sort();

  const monthlyTotalsData = allMonths.map((month) => ({
    month,
    total: allCompanies.reduce(
      (sum, company) =>
        sum + (summaryByMonthCompany[month]?.[company] || 0),
      0
    ),
  }));

  const perCompanyOverMonthsData = allMonths.map((month) => {
    const row: Record<string, string | number> = { month };
    allCompanies.forEach((company) => {
      row[company] = summaryByMonthCompany[month]?.[company] || 0;
    });
    return row;
  });

  // --- חישוב portalRunIds ייחודיים ---
  const portalRunIdSet = new Set<string>();
  for (const item of summaries) {
    const runId = (item as any).runId || '';
    if (!runId) continue;
    const parts = runId.split('_');
    if (parts.length >= 2) portalRunIdSet.add(parts[0]);
  }

  // --- שלוף ym לכל portalRunId ---
  const ymByPortalRunId: Record<string, string> = {};
  await Promise.all(
    Array.from(portalRunIdSet).map(async (portalRunId) => {
      const runSnap = await db.collection('portalImportRuns').doc(portalRunId).get();
      if (runSnap.exists) {
        const ym = String(runSnap.data()?.resolvedWindow?.ym || '');
        if (ym) ymByPortalRunId[portalRunId] = ym;
      }
    })
  );

  // --- בנה summaryByYmCompany ---
  const summaryByYmCompany: Record<string, Record<string, number>> = {};
  for (const item of summaries) {
    const runId = (item as any).runId || '';
    const portalRunId = runId.split('_')[0] || '';
    const ym = ymByPortalRunId[portalRunId];
    if (!ym) continue;
    const companyName = item.company || 'לא ידוע';
    if (!summaryByYmCompany[ym]) summaryByYmCompany[ym] = {};
    summaryByYmCompany[ym][companyName] = (summaryByYmCompany[ym][companyName] || 0) + (item.totalCommissionAmount || 0);
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