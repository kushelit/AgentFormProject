// ═══════════════════════════════════════════════════════════════════
// services/server/commissionSummaryService.ts
// summaryByYmCompany נבנה מ-ymCommissionSummaries (מהיר, מסמכים מסכמים)
// ולא מ-externalCommissions (איטי, ledger גולמי).
//
// ביצועים:
//   • שלוש השליפות (תבניות, commissionSummaries, ymCommissionSummaries) במקביל.
//   • lite: true — למסך הסיכום החדש: שדות נבחרים בלבד, ובלי summaries /
//     summaryByCompanyAgentMonth בתשובה (הם הכבדים ביותר ולא בשימוש שם).
//     בלי lite — התשובה זהה לקודמת, לתאימות עם מסכים אחרים.
//
// allCompanies — ב-lite בלבד: איחוד של "חודש דיווח" ו"חודש פרסום", כדי שחברה
// שיש לה נתונים רק לפי חודש פרסום תופיע בטבלה החדשה. בלי lite — רק "חודש דיווח",
// בדיוק כמו קודם (הדוח generateCommissionSummaryMultiYear בונה עמודות מהרשימה).
// companyIdByName — מתמלא משני המקורות (שדה נוסף בלבד, לא משנה פלט קיים).
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
  /** מסך הסיכום החדש — תשובה קלה (ראו למעלה) */
  lite?: boolean;
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

const SUMMARY_FIELDS = ['agentId', 'agentCode', 'reportMonth', 'templateId', 'totalCommissionAmount', 'company', 'companyId'];
const YM_FIELDS = ['ym', 'company', 'companyId', 'templateId', 'totalCommissionAmount'];

export async function getCommissionSummary(params: CommissionSummaryQuery): Promise<CommissionSummaryResult> {
  const { agentId, fromMonth, toMonth, lite = false } = params;
  const startedAt = Date.now();
  const db = admin.firestore();

  let summariesQuery: FirebaseFirestore.Query = db
    .collection('commissionSummaries')
    .where('agentId', '==', agentId)
    .where('reportMonth', '>=', fromMonth)
    .where('reportMonth', '<=', toMonth)
    .orderBy('reportMonth');
  if (lite) summariesQuery = summariesQuery.select(...SUMMARY_FIELDS);

  // ─── שלוש השליפות במקביל ──────────────────────────────────────────
  const [templatesSnap, snap, ymSnap] = await Promise.all([
    db.collection('commissionTemplates').where('isactive', '==', true).select('hekefType').get(),
    summariesQuery.get(),
    db
      .collection('ymCommissionSummaries')
      .where('agentId', '==', agentId)
      .where('ym', '>=', fromMonth)
      .where('ym', '<=', toMonth)
      .select(...YM_FIELDS)
      .get(),
  ]);

  // ─── תבניות "היקף" — לא נכללות ─────────────────────────────────────
  const hekefTemplateIds = new Set(templatesSnap.docs.filter((d) => !!d.data().hekefType).map((d) => d.id));

  const companyIdByName: Record<string, string> = {};

  // ═══════════════════════════════════════════════════════════
  // מבט 1: "לפי חודש דיווח" — commissionSummaries הממוזג
  // ═══════════════════════════════════════════════════════════
  const summaries: CommissionSummary[] = snap.docs
    .map((d) => d.data() as CommissionSummary)
    .filter((item) => !hekefTemplateIds.has(item.templateId));

  const companyMap: Record<string, string> = {};
  const summaryByMonthCompany: Record<string, Record<string, number>> = {};
  const summaryByCompanyAgentMonth: Record<string, Record<string, Record<string, number>>> = {};

  for (const item of summaries) {
    const companyName = item.company || 'לא ידוע';
    const month = item.reportMonth;
    const agentCode = item.agentCode || '-';
    const amount = item.totalCommissionAmount || 0;

    if (item.companyId && companyName !== 'לא ידוע' && !companyIdByName[companyName]) {
      companyIdByName[companyName] = item.companyId;
    }
    if (item.templateId && !companyMap[item.templateId]) {
      companyMap[item.templateId] = companyName;
    }

    if (!summaryByMonthCompany[month]) summaryByMonthCompany[month] = {};
    summaryByMonthCompany[month][companyName] = (summaryByMonthCompany[month][companyName] || 0) + amount;

    if (!lite) {
      if (!summaryByCompanyAgentMonth[companyName]) summaryByCompanyAgentMonth[companyName] = {};
      if (!summaryByCompanyAgentMonth[companyName][agentCode]) summaryByCompanyAgentMonth[companyName][agentCode] = {};
      summaryByCompanyAgentMonth[companyName][agentCode][month] =
        (summaryByCompanyAgentMonth[companyName][agentCode][month] || 0) + amount;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // מבט 2: "לפי חודש פרסום" — ymCommissionSummaries
  // כל מסמך = delta של ריצה אחת לאותו ym+reportMonth.
  // ═══════════════════════════════════════════════════════════
  const summaryByYmCompany: Record<string, Record<string, number>> = {};

  for (const d of ymSnap.docs) {
    const r = d.data() as any;
    if (hekefTemplateIds.has(String(r.templateId || ''))) continue;

    const ym = String(r.ym || '');
    const companyName = String(r.company || 'לא ידוע');
    const amount = Number(r.totalCommissionAmount || 0);
    if (!ym) continue;

    if (r.companyId && companyName !== 'לא ידוע' && !companyIdByName[companyName]) {
      companyIdByName[companyName] = String(r.companyId);
    }

    if (!summaryByYmCompany[ym]) summaryByYmCompany[ym] = {};
    summaryByYmCompany[ym][companyName] = (summaryByYmCompany[ym][companyName] || 0) + amount;
  }

  // ─── חודשים וחברות ─────────────────────────────────────────────────
  const allMonths = Object.keys(summaryByMonthCompany).sort();
  const reportMonthCompanies = Object.values(summaryByMonthCompany).flatMap((m) => Object.keys(m));
  const allCompanies = Array.from(
    new Set(
      lite
        ? [...reportMonthCompanies, ...Object.values(summaryByYmCompany).flatMap((m) => Object.keys(m))]
        : reportMonthCompanies
    )
  ).sort();

  const monthlyTotalsData = allMonths.map((month) => ({
    month,
    total: allCompanies.reduce((sum, company) => sum + (summaryByMonthCompany[month]?.[company] || 0), 0),
  }));

  const perCompanyOverMonthsData = allMonths.map((month) => {
    const row: Record<string, string | number> = { month };
    allCompanies.forEach((company) => {
      row[company] = summaryByMonthCompany[month]?.[company] || 0;
    });
    return row;
  });

  console.log(
    `[commission-summary] ${agentId} ${fromMonth}..${toMonth}${lite ? ' (lite)' : ''}: ` +
      `${snap.size} summaries, ${ymSnap.size} ym docs in ${Date.now() - startedAt}ms`
  );

  return {
    summaries: lite ? [] : summaries,
    companyMap,
    companyIdByName,
    summaryByMonthCompany,
    summaryByCompanyAgentMonth: lite ? {} : summaryByCompanyAgentMonth,
    allMonths,
    allCompanies,
    monthlyTotalsData,
    perCompanyOverMonthsData,
    summaryByYmCompany,
  };
}