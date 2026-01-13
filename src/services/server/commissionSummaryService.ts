// services/server/commissionSummaryService.ts
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
}

export async function getCommissionSummary(
  params: CommissionSummaryQuery
): Promise<CommissionSummaryResult> {
  const { agentId, fromMonth, toMonth } = params;
  const companyIdByName: Record<string, string> = {};

  const db = admin.firestore();

  // --- FETCH RAW SUMMARIES (אוסף יחיד, בלי אוספים נוספים) ---
  const snap = await db
    .collection('commissionSummaries')
    .where('agentId', '==', agentId)
    .where('reportMonth', '>=', fromMonth)
    .where('reportMonth', '<=', toMonth)
    .orderBy('reportMonth')
    .get();

  const summaries: CommissionSummary[] = snap.docs.map(
    (d) => d.data() as CommissionSummary
  );

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
  };
}
