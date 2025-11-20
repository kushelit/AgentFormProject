import { admin } from '@/lib/firebase/firebase-admin';

export interface AdminCommissionSummaryMatrixQuery {
  agentIds: string[];
  fromMonth: string; // "YYYY-MM"
  toMonth: string;   // "YYYY-MM"
}

export interface AdminCommissionSummaryMatrixResult {
  allCompanies: string[];
  allMonths: string[];
  // agentId -> company -> total
  totalsByAgentCompany: Record<string, Record<string, number>>;
  // company -> agentId -> month -> total
  breakdownByCompanyAgentMonth: Record<
    string,
    Record<string, Record<string, number>>
  >;
}

interface CommissionSummaryDoc {
  agentId: string;
  agentCode?: string;
  reportMonth: string; // YYYY-MM
  templateId?: string;
  totalCommissionAmount: number;
  company?: string;
}

export async function getAdminCommissionSummaryMatrix(
  params: AdminCommissionSummaryMatrixQuery
): Promise<AdminCommissionSummaryMatrixResult> {
  const { agentIds, fromMonth, toMonth } = params;

  if (!agentIds || agentIds.length === 0) {
    return {
      allCompanies: [],
      allMonths: [],
      totalsByAgentCompany: {},
      breakdownByCompanyAgentMonth: {},
    };
  }

  const db = admin.firestore();
  const summaries: CommissionSummaryDoc[] = [];

  const baseCollection = db.collection('commissionSummaries');

  // Firestore in: עד 10 ערכים בכל פעם
  const chunkSize = 10;
  for (let i = 0; i < agentIds.length; i += chunkSize) {
    const chunk = agentIds.slice(i, i + chunkSize);

    const snap = await baseCollection
      .where('agentId', 'in', chunk)
      .where('reportMonth', '>=', fromMonth)
      .where('reportMonth', '<=', toMonth)
      .orderBy('reportMonth')
      .get();

    snap.docs.forEach((d) => summaries.push(d.data() as CommissionSummaryDoc));
  }

  const totalsByAgentCompany: Record<string, Record<string, number>> = {};
  const breakdownByCompanyAgentMonth: Record<
    string,
    Record<string, Record<string, number>>
  > = {};

  const companiesSet = new Set<string>();
  const monthsSet = new Set<string>();

  for (const item of summaries) {
    const companyName = item.company || 'לא ידוע';
    const month = item.reportMonth;
    const agentId = item.agentId;
    const amount = item.totalCommissionAmount || 0;

    companiesSet.add(companyName);
    monthsSet.add(month);

    // סיכום לפי סוכן × חברה
    if (!totalsByAgentCompany[agentId]) {
      totalsByAgentCompany[agentId] = {};
    }
    if (!totalsByAgentCompany[agentId][companyName]) {
      totalsByAgentCompany[agentId][companyName] = 0;
    }
    totalsByAgentCompany[agentId][companyName] += amount;

    // פירוק לפי חברה → סוכן → חודש
    if (!breakdownByCompanyAgentMonth[companyName]) {
      breakdownByCompanyAgentMonth[companyName] = {};
    }
    if (!breakdownByCompanyAgentMonth[companyName][agentId]) {
      breakdownByCompanyAgentMonth[companyName][agentId] = {};
    }
    if (!breakdownByCompanyAgentMonth[companyName][agentId][month]) {
      breakdownByCompanyAgentMonth[companyName][agentId][month] = 0;
    }
    breakdownByCompanyAgentMonth[companyName][agentId][month] += amount;
  }

  const allCompanies = Array.from(companiesSet).sort();
  const allMonths = Array.from(monthsSet).sort();

  return {
    allCompanies,
    allMonths,
    totalsByAgentCompany,
    breakdownByCompanyAgentMonth,
  };
}
