// ═══════════════════════════════════════════════════════════════════
// services/server/commissionSummaryService.ts
// תיקון יסודי: summaryByYmCompany (חודש פרסום) נבנה כעת מ-externalCommissions
// (ה-ledger הגולמי, כל ריצה נשמרת בנפרד) במקום מ-commissionSummaries הממוזג.
// summaryByMonthCompany / summaryByCompanyAgentMonth (חודש דיווח) — ללא שינוי.
// ═══════════════════════════════════════════════════════════════════

import { admin } from '@/lib/firebase/firebase-admin';
import { getDocsByFieldInBatches } from '@/lib/server/firestoreBatch';

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
  // אלה ה-templates שצריך *לא* לכלול בדף הנפרעים. משותף לשני המבטים.
  const templatesSnap = await db
    .collection('commissionTemplates')
    .where('isactive', '==', true)
    .get();

  const hekefTemplateIds = new Set(
    templatesSnap.docs
      .filter(d => !!d.data().hekefType)
      .map(d => d.id)
  );

  // ═══════════════════════════════════════════════════════════════════
  // מבט 1: "לפי חודש דיווח" — commissionSummaries הממוזג, ללא שינוי
  // ═══════════════════════════════════════════════════════════════════

  const snap = await db
    .collection('commissionSummaries')
    .where('agentId', '==', agentId)
    .where('reportMonth', '>=', fromMonth)
    .where('reportMonth', '<=', toMonth)
    .orderBy('reportMonth')
    .get();

  const summaries: CommissionSummary[] = snap.docs
    .map((d) => d.data() as CommissionSummary)
    .filter((item) => !hekefTemplateIds.has(item.templateId));

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

    if (item.templateId && !companyMap[item.templateId]) {
      companyMap[item.templateId] = companyName;
    }

    if (!summaryByMonthCompany[month]) summaryByMonthCompany[month] = {};
    if (!summaryByMonthCompany[month][companyName])
      summaryByMonthCompany[month][companyName] = 0;

    summaryByMonthCompany[month][companyName] +=
      item.totalCommissionAmount || 0;

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

  // ═══════════════════════════════════════════════════════════════════
  // מבט 2: "לפי חודש פרסום" — externalCommissions, בנפרד לגמרי ממבט 1
  //
  // 🔧 התיקון: לא גוזרים ym מ-runId שמופיע על מסמך commissionSummaries
  // ממוזג (שיכול לדרוס/לאבד ריצות ישנות). במקום זה, שולפים ישירות את כל
  // portalImportRuns של הסוכן שה-ym שלהם בטווח המבוקש, ומהם את כל ה-
  // jobIds (= runId-ים). לכל jobId כזה יש ym וcompanyId ידועים מראש מתוך
  // ה-portalImportRun עצמו — לא צריך "לנחש" מה-runId בדיעבד.
  // ═══════════════════════════════════════════════════════════════════

  const portalRunsSnap = await db
    .collection('portalImportRuns')
    .where('agentId', '==', agentId)
    .where('resolvedWindow.ym', '>=', fromMonth)
    .where('resolvedWindow.ym', '<=', toMonth)
    .get();

  const jobIdToYm: Record<string, string> = {};
  const allJobIds: string[] = [];

  for (const d of portalRunsSnap.docs) {
    const data = d.data() as any;
    const ym = String(data?.resolvedWindow?.ym || '');
    if (!ym) continue;

    const jobIds: string[] = data?.queue?.jobIds || [];
    for (const jobId of jobIds) {
      jobIdToYm[jobId] = ym;
      allJobIds.push(jobId);
    }
  }

  const summaryByYmCompany: Record<string, Record<string, number>> = {};

  if (allJobIds.length) {
    const externalDocs = await getDocsByFieldInBatches({
      collection: 'externalCommissions',
      field: 'runId',
      values: allJobIds,
      extraWhere: [['agentId', '==', agentId]],
    });

    for (const doc of externalDocs) {
      const r = doc.data() as any;

      const tid = String(r.templateId || '');
      if (hekefTemplateIds.has(tid)) continue;

      const runId = String(r.runId || '');
      const ym = jobIdToYm[runId];
      if (!ym) continue;

      const companyName = String(r.company || 'לא ידוע');
      const amount = Number(r.commissionAmount || 0);

      if (!summaryByYmCompany[ym]) summaryByYmCompany[ym] = {};
      summaryByYmCompany[ym][companyName] =
        (summaryByYmCompany[ym][companyName] || 0) + amount;
    }
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