// app/Reports/generators/generateClientPoliciesReport.ts  ✅ SERVER ONLY
import { admin } from '@/lib/firebase/firebase-admin';
import ExcelJS from 'exceljs';
import { ReportRequest } from '@/types';
import { calculateCommissions, calculatePremiaAndTzvira } from '@/utils/commissionCalculations';

import { fetchContractsByAgent } from '@/services/server/fetchContracts';
import { fetchCommissionSplits } from '@/services/server/commissionService';
import type { ClientPolicyRow } from '@/types/Sales';
import { getProductMap } from '@/services/server/productService';

/* ---------------------------- Helpers ---------------------------- */

function normalizeBoolean(value: any): boolean | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'כן'].includes(v)) return true;
    if (['false', '0', 'no', 'לא'].includes(v)) return false;
  }
  return undefined;
}

// הופך מחרוזת YYYY-MM ל־Date אמיתי
function monthStringToDate(value: string): Date | string {
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split('-');
    return new Date(Number(y), Number(m) - 1, 1);
  }
  return s;
}

// כותרת אפורה
function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 20;
  row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4D4D4D' } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    };
  });
}

// שורות נתונים
function styleDataRows(
  ws: ExcelJS.Worksheet,
  headerCount: number,
  opt: { firstDataRow?: number; numericCols?: number[]; dateCols?: number[] } = {}
) {
  const { firstDataRow = 2, numericCols = [], dateCols = [] } = opt;

  for (let rowIdx = firstDataRow; rowIdx <= ws.rowCount; rowIdx++) {
    const row = ws.getRow(rowIdx);

    // זברה
    if (rowIdx % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      });
    }

    for (let col = 1; col <= headerCount; col++) {
      const cell = row.getCell(col);

      if (dateCols.includes(col)) {
        cell.numFmt = 'yyyy-mm';
        cell.alignment = { horizontal: 'center' };
      } else if (numericCols.includes(col)) {
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right' };
      } else {
        cell.alignment = { horizontal: 'center' };
      }
    }
  }
}

// Auto-fit columns
function autofitColumns(ws: ExcelJS.Worksheet, count: number) {
  for (let i = 1; i <= count; i++) {
    let maxLen = 0;

    ws.eachRow((row) => {
      const val = row.getCell(i).value;
      if (!val) return;
      const len = String(val).length;
      if (len > maxLen) maxLen = len;
    });

    ws.getColumn(i).width = Math.min(Math.max(maxLen + 2, 10), 40);
  }
}

/* ---------------------------- MAIN REPORT ---------------------------- */

export async function generateClientPoliciesReport(params: ReportRequest) {
  const {
    agentId,
    product,
    company,
    fromDate,
    toDate,
    statusPolicy,
    minuySochen,
  } = params as ReportRequest & {
    statusPolicy?: string[];
    minuySochen?: boolean;
  };

  if (!agentId) throw new Error('נדרש לבחור סוכן');

  const db = admin.firestore();

  // sales
  const salesSnap = await db
    .collection('sales')
    .where('AgentId', '==', agentId)
    .get();

  const contracts = await fetchContractsByAgent(agentId);
  const productMap = await getProductMap();

  const cleanedProducts = Array.isArray(product) ? product.map((p) => p.trim()) : [];
  const cleanedCompanies = Array.isArray(company) ? company.map((c) => c.trim()) : [];
  const cleanedStatuses = Array.isArray(statusPolicy)
    ? statusPolicy.map((s) => s.trim())
    : [];

  const rows = (
    await Promise.all(
      salesSnap.docs.map(async (doc) => {
        const raw = doc.data() as any;

        if (fromDate && raw.mounth < fromDate) return null;
        if (toDate && raw.mounth > toDate) return null;

        if (
          cleanedCompanies.length &&
          !cleanedCompanies.includes((raw.company ?? '').trim())
        )
          return null;

        if (
          cleanedProducts.length &&
          !cleanedProducts.includes((raw.product ?? '').trim())
        )
          return null;

        const saleStatus = (raw.statusPolicy ?? '').trim();
        if (cleanedStatuses.length && !cleanedStatuses.includes(saleStatus)) return null;

        const saleMinuy = normalizeBoolean(raw.minuySochen);
        if (typeof minuySochen === 'boolean' && saleMinuy !== minuySochen) {
          return null;
        }

        const sale: ClientPolicyRow = {
          id: doc.id,
          AgentId: raw.AgentId || '',
          IDCustomer: raw.IDCustomer || '',
          company: raw.company || '',
          product: raw.product || '',
          workerId: raw.workerId || '',
          workerName: raw.workerName || '',
          minuySochen: raw.minuySochen ?? '',
          notes: raw.notes || '',
          month: raw.mounth || '',
          status: saleStatus,
          policyNumber: raw.policyNumber || '',
          insPremia: String(raw.insPremia ?? ''),
          pensiaPremia: String(raw.pensiaPremia ?? ''),
          pensiaZvira: String(raw.pensiaZvira ?? ''),
          finansimPremia: String(raw.finansimPremia ?? ''),
          finansimZvira: String(raw.finansimZvira ?? ''),
          firstNameCustomer: raw.firstNameCustomer || '',
          lastNameCustomer: raw.lastNameCustomer || '',
        };

        const contractMatch = contracts.find(
          (c) =>
            c.AgentId === agentId &&
            c.product === sale.product &&
            c.company === sale.company &&
            (c.minuySochen === sale.minuySochen ||
              (!c.minuySochen && !sale.minuySochen))
        );

        const commissions = calculateCommissions(
          sale,
          contractMatch,
          contracts,
          productMap,
          agentId
        );

        const premiaData = calculatePremiaAndTzvira(sale);

        return {
          'שם פרטי': sale.firstNameCustomer,
          'שם משפחה': sale.lastNameCustomer,
          'תז': sale.IDCustomer,
          'חברה': sale.company,
          'מוצר': sale.product,
          'סטטוס': sale.status,
          'מינוי סוכן': saleMinuy === true ? 'כן' : saleMinuy === false ? 'לא' : '',
          'חודש תפוקה': sale.month,
          'פרמיה': premiaData.sumPremia,
          'צבירה': premiaData.sumTzvira,
          'עמלת הקף': commissions.commissionHekef,
          'נפרעים': commissions.commissionNifraim,
        };
      })
    )
  ).filter(Boolean) as any[];

  rows.sort((a, b) => String(a['תז']).localeCompare(String(b['תז'])));

  return buildExcelReport(rows, 'פוליסות ללקוח');
}

/* ---------------------------- Excel Builder ---------------------------- */

async function buildExcelReport(rows: any[], sheetName: string) {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const headers = [
    'שם פרטי',
    'שם משפחה',
    'תז',
    'חברה',
    'מוצר',
    'סטטוס',
    'מינוי סוכן',
    'חודש תפוקה',
    'פרמיה',
    'צבירה',
    'עמלת הקף',
    'נפרעים',
  ];

  const ws = wb.addWorksheet(sheetName, {
    views: [{ rightToLeft: true }],
  });

  // כותרת
  ws.addRow(headers);
  styleHeaderRow(ws.getRow(1));

  // נתונים
  rows.forEach((r) => {
    const rowValues = headers.map((h) => {
      if (h === 'חודש תפוקה') return monthStringToDate(r[h]);
      return r[h] ?? '';
    });
    ws.addRow(rowValues);
  });

  styleDataRows(ws, headers.length, {
    firstDataRow: 2,
    dateCols: [8], // חודש תפוקה
    numericCols: [9, 10, 11, 12], // פרמיה, צבירה, עמלת הקף, נפרעים
  });

  autofitColumns(ws, headers.length);

  const excelBuffer = await wb.xlsx.writeBuffer();
  const buffer = Buffer.isBuffer(excelBuffer)
    ? excelBuffer
    : Buffer.from(excelBuffer as ArrayBuffer);

  return {
    buffer,
    filename: 'דוח_פוליסות_ללקוח.xlsx',
    subject: 'דוח פוליסות ללקוח ממערכת MagicSale',
    description: 'מצורף דוח פוליסות עם פרמיה, עמלה, ונפרעים – בעיצוב אחיד.',
  };
}
