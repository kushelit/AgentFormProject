// THIS FILE RUNS ONLY ON SERVER. DO NOT IMPORT FROM CLIENT.
// /app/Reports/generators/generateCommissionSummaryMultiYear.ts

import { admin } from '@/lib/firebase/firebase-admin';
import * as XLSX from 'xlsx';
import { ReportRequest } from '@/types';
import { getCommissionSummary } from '@/services/server/commissionSummaryService';

const canon = (v?: any) => String(v ?? '').trim();

// ממיר תאריך מה-UI (YYYY-MM-DD או DD/MM/YYYY וכו') ל-YYYY-MM
const toYm = (v?: string) => {
  const s = canon(v);
  if (!s) return '';
  // כבר בפורמט YYYY-MM או YYYY-MM-DD
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  // dd/MM/yyyy
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('/');
    return `${yyyy}-${mm}`;
  }
  // dd.MM.yyyy
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('.');
    return `${yyyy}-${mm}`;
  }
  return '';
};

export async function generateCommissionSummaryMultiYear(
  params: ReportRequest
) {
  const { agentId, fromDate, toDate, company } = params;

  if (!agentId) throw new Error('נדרש לבחור סוכן');
  if (agentId === 'all') {
    throw new Error('דוח זה זמין לסוכן אחד בכל פעם (לא לכל הסוכנות)');
  }

  const fromYm = toYm(fromDate);
  const toYmVal = toYm(toDate);

  if (!fromYm || !toYmVal) {
    throw new Error('נדרש לבחור טווח חודשים (מתאריך ועד תאריך)');
  }
  if (fromYm > toYmVal) {
    throw new Error('טווח חודשים לא תקין (תאריך התחלה אחרי תאריך סיום)');
  }

  // פילטר חברות (אופציונלי)
  const selectedCompanies = Array.isArray(company)
    ? company.map(canon)
    : [];

  // שליפת סיכומים מהשירות המשותף (server)
  const {
    summaryByMonthCompany,
    summaryByCompanyAgentMonth,
    allMonths,
    allCompanies,
    monthlyTotalsData,
  } = await getCommissionSummary({
    agentId,
    fromMonth: fromYm,
    toMonth: toYmVal,
  });

  const effectiveCompanies =
    selectedCompanies.length > 0
      ? allCompanies.filter((c) => selectedCompanies.includes(canon(c)))
      : allCompanies;

  /** ------------ לשונית 1: סיכום לפי חודש וחברה (טבלה כמו במסך) ------------ */

  const summaryRows: any[] = allMonths.map((month) => {
    const row: any = { 'חודש': month };
    let monthTotal = 0;

    effectiveCompanies.forEach((comp) => {
      const val = summaryByMonthCompany[month]?.[comp] || 0;
      row[comp] = Number(val.toFixed(2));
      monthTotal += val;
    });

    row['סה"כ לחודש'] = Number(monthTotal.toFixed(2));
    return row;
  });

  /** ------------ לשונית 2: נתונים לפיבוט (שורה לכל חברה/קוד/חודש) ------------ */

  const pivotRows: any[] = [];

  for (const comp of effectiveCompanies) {
    const agentsMap = summaryByCompanyAgentMonth[comp] || {};
    for (const agentCode of Object.keys(agentsMap)) {
      const monthsMap = agentsMap[agentCode] || {};
      for (const month of Object.keys(monthsMap)) {
        const amt = monthsMap[month] || 0;
        const year = month.slice(0, 4);
        const monthNum = Number(month.slice(5, 7));

        pivotRows.push({
          'שנה': year,
          'חודש מספר': monthNum,
          'חודש': month,
          'חברה': comp,
          'קוד סוכן': agentCode,
          'נפרעים': Number(amt.toFixed(2)),
        });
      }
    }
  }

  // אפשר למיין יפה לפיבוט
  pivotRows.sort((a, b) =>
    a['שנה'] !== b['שנה']
      ? String(a['שנה']).localeCompare(String(b['שנה']))
      : a['חודש מספר'] !== b['חודש מספר']
      ? a['חודש מספר'] - b['חודש מספר']
      : String(a['חברה']).localeCompare(String(b['חברה'])) ||
        String(a['קוד סוכן']).localeCompare(String(b['קוד סוכן']))
  );

  /** ------------ יצירת קובץ אקסל ------------ */

  const wb = XLSX.utils.book_new();

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'סיכום לפי חודש וחברה');

  const wsPivot = XLSX.utils.json_to_sheet(pivotRows);
  XLSX.utils.book_append_sheet(wb, wsPivot, 'נתונים לפיבוט');

  // אופציונלי: לשונית של סה"כ חודשי (אם תרצי להשתמש בה בעתיד)
  const monthlyRows = monthlyTotalsData.map((row) => ({
    'חודש': row.month,
    'סה"כ נפרעים': Number(row.total.toFixed(2)),
  }));
  const wsMonthly = XLSX.utils.json_to_sheet(monthlyRows);
  XLSX.utils.book_append_sheet(wb, wsMonthly, 'סה"כ חודשי');

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

  const filename = `דוח נפרעים לפי חודש וחברה ${fromYm}–${toYmVal}.xlsx`;

  return {
    buffer,
    filename,
    subject: 'דוח נפרעים לפי חודש וחברה (טווח שנים)',
    description:
      'דוח סיכום נפרעים לפי חודש וחברה, כולל לשונית נתונים לפיבוט.',
  };
}
