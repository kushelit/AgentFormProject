// THIS FILE RUNS ONLY ON SERVER. DO NOT IMPORT FROM CLIENT.
// /app/Reports/generators/generateCommissionSummaryMultiYear.ts

import ExcelJS from 'exceljs';
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

// הופך מ-'YYYY-MM' ל- Date של היום הראשון בחודש
function monthStringToDate(month: string): Date | string {
  if (!month) return '';
  if (!/^\d{4}-\d{2}/.test(month)) return month;
  const year = Number(month.slice(0, 4));
  const monthIdx = Number(month.slice(5, 7)) - 1; // 0-based
  return new Date(year, monthIdx, 1);
}

// עיצוב כותרת (ראש טבלה) – אפור כהה, טקסט לבן, bold
function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 20;
  row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  row.eachCell((cell) => {
    cell.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' }, // לבן
      size: 11,
    };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4D4D4D' }, // אפור כהה
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    };
  });
}

// עיצוב שורות נתונים – גמיש לפי סוג עמודה
function styleDataRows(
  ws: ExcelJS.Worksheet,
  headerCount: number,
  options?: {
    firstDataRow?: number;
    numericCols?: number[];
    dateCols?: number[];
  }
) {
  const firstDataRow = options?.firstDataRow ?? 2;
  const numericCols = options?.numericCols ?? [];
  const dateCols = options?.dateCols ?? [];

  for (let rowIdx = firstDataRow; rowIdx <= ws.rowCount; rowIdx++) {
    const row = ws.getRow(rowIdx);

    // זברה: שורות זוגיות ברקע אפור עדין
    if (rowIdx % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF5F5F5' }, // אפור בהיר מאוד
        };
      });
    }

    for (let colIdx = 1; colIdx <= headerCount; colIdx++) {
      const cell = row.getCell(colIdx);

      if (dateCols.includes(colIdx)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.numFmt = 'yyyy-mm'; // תצוגה 2025-04 אבל כ-תאריך
      } else if (numericCols.includes(colIdx)) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '#,##0.00';
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    }
  }
}

// התאמת רוחב עמודות לפי התוכן
function autofitColumns(ws: ExcelJS.Worksheet, headerCount: number) {
  for (let colIdx = 1; colIdx <= headerCount; colIdx++) {
    let maxLen = 0;

    ws.eachRow((row) => {
      const cell = row.getCell(colIdx);
      const val = cell.value;
      if (val === null || val === undefined) return;
      const len = String(
        typeof val === 'object' && (val as any).richText
          ? (val as any).richText.map((r: any) => r.text).join('')
          : val
      ).length;
      if (len > maxLen) maxLen = len;
    });

    ws.getColumn(colIdx).width = Math.min(Math.max(maxLen + 2, 10), 40);
  }
}

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
  } = await getCommissionSummary({
    agentId,
    fromMonth: fromYm,
    toMonth: toYmVal,
  });

  const effectiveCompanies =
    selectedCompanies.length > 0
      ? allCompanies.filter((c) => selectedCompanies.includes(canon(c)))
      : allCompanies;

  /** ------------ לשונית 1: סיכום לפי חודש וחברה ------------ */

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

  const summaryHeaders: string[] = [
    'חודש',
    ...effectiveCompanies,
    'סה"כ לחודש',
  ];

  /** ------------ לשונית 2: נתונים לפיבוט ------------ */

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

  pivotRows.sort((a, b) =>
    a['שנה'] !== b['שנה']
      ? String(a['שנה']).localeCompare(String(b['שנה']))
      : a['חודש מספר'] !== b['חודש מספר']
      ? a['חודש מספר'] - b['חודש מספר']
      : String(a['חברה']).localeCompare(String(b['חברה'])) ||
        String(a['קוד סוכן']).localeCompare(String(b['קוד סוכן']))
  );

  const pivotHeaders: string[] = [
    'שנה',
    'חודש מספר',
    'חודש',
    'חברה',
    'קוד סוכן',
    'נפרעים',
  ];

  /** ------------ יצירת קובץ אקסל (exceljs) ------------ */

  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  // -------- Sheet 1: סיכום לפי חודש וחברה --------
  const wsSummary = wb.addWorksheet('סיכום לפי חודש וחברה', {
    views: [{ rightToLeft: true }],
  });

  wsSummary.addRow(summaryHeaders);
  styleHeaderRow(wsSummary.getRow(1));

  // נתונים – "חודש" נכתב כ- Date
  summaryRows.forEach((r) => {
    const rowValues = summaryHeaders.map((h) => {
      if (h === 'חודש') {
        return monthStringToDate(r[h]);
      }
      return r[h] ?? '';
    });
    wsSummary.addRow(rowValues);
  });

  styleDataRows(wsSummary, summaryHeaders.length, {
    firstDataRow: 2,
    dateCols: [1],                       // עמודה 1 – תאריך חודש
    numericCols: summaryHeaders
      .map((_, idx) => idx + 1)
      .filter((i) => i >= 2),           // כל העמודות מ-2 והלאה מספריות
  });
  autofitColumns(wsSummary, summaryHeaders.length);

  // -------- Sheet 2: נתונים לפיבוט --------
  const wsPivot = wb.addWorksheet('נתונים לפיבוט', {
    views: [{ rightToLeft: true }],
  });

  wsPivot.addRow(pivotHeaders);
  styleHeaderRow(wsPivot.getRow(1));

  pivotRows.forEach((r) => {
    const rowValues = pivotHeaders.map((h) => {
      if (h === 'חודש') {
        return monthStringToDate(r[h] as string);
      }
      return r[h] ?? '';
    });
    wsPivot.addRow(rowValues);
  });

  styleDataRows(wsPivot, pivotHeaders.length, {
    firstDataRow: 2,
    dateCols: [3],       // "חודש" – תאריך
    numericCols: [2, 6], // חודש מספר, נפרעים
  });
  autofitColumns(wsPivot, pivotHeaders.length);

  const excelBuffer = await wb.xlsx.writeBuffer();
  const buffer = Buffer.isBuffer(excelBuffer)
    ? excelBuffer
    : Buffer.from(excelBuffer as ArrayBuffer);

  const filename = `דוח נפרעים מסוכם מטעינה לפי חודש וחברה ${fromYm}–${toYmVal}.xlsx`;

  return {
    buffer,
    filename,
    subject: 'דוח נפרעים מסוכם מטעינה לפי חודש וחברה',
    description:
      'דוח סיכום נפרעים לפי חודש וחברה, כולל לשונית נתונים לפיבוט – עם עמודת חודש כתאריך אמיתי.',
  };
}
