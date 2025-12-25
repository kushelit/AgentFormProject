// THIS FILE RUNS ONLY ON SERVER. DO NOT IMPORT FROM CLIENT.
// /app/Reports/generators/generateLeadSourceStatementReport.ts

import { admin } from '@/lib/firebase/firebase-admin';
import ExcelJS from 'exceljs';
import { ReportRequest } from '@/types';
import { calculateCommissions } from '@/utils/commissionCalculations';
import { fetchContractsByAgent } from '@/services/server/fetchContracts';
import { getProductMap } from '@/services/server/productService';
import { fetchCommissionSplits } from '@/services/server/commissionService';
import type { CommissionSplit } from '@/types/CommissionSplit';

/** ---------------- Helpers ---------------- */
const canon = (v?: any) => String(v ?? '').trim();

const toYm = (v?: string) => {
  const s = canon(v);
  if (!s) return '';
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [, mm, yyyy] = s.split('/');
    return `${yyyy}-${mm}`;
  }
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
    const [, mm, yyyy] = s.split('.');
    return `${yyyy}-${mm}`;
  }
  return '';
};


function ymToHebrew(ym: string): string {
  // מצפה ל־YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym;
  const [yyyy, mm] = ym.split('-');
  return `${mm}-${yyyy}`; // 01-2025
}


function monthStringToDate(month: string): Date | string {
  if (!month) return '';
  if (!/^\d{4}-\d{2}/.test(month)) return month;
  const year = Number(month.slice(0, 4));
  const monthIdx = Number(month.slice(5, 7)) - 1;
  return new Date(year, monthIdx, 1);
}

const normalizeMinuy = (val: any): boolean => {
  if (typeof val === 'boolean') return val;
  const s = canon(val).toLowerCase();
  if (!s) return false;
  return ['1', 'true', 'כן', 'y', 't', 'on'].includes(s);
};

const parseMinuy = (v: unknown): boolean | undefined => {
  if (typeof v === 'boolean') return v;
  if (v === null || typeof v === 'undefined') return undefined;
  const s = String(v).trim().toLowerCase();
  if (!s) return undefined;
  if (['true', '1', 'כן', 'y', 't', 'on'].includes(s)) return true;
  if (['false', '0', 'לא', 'n', 'f', 'off'].includes(s)) return false;
  return undefined;
};

/** ---------------- Excel styling ---------------- */

function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 20;
  row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: false };

  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4D4D4D' } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    };
    // לא לשבור שורות בכותרות, רק לכווץ אם צריך
    cell.alignment = { ...(cell.alignment || {}), wrapText: false, shrinkToFit: true };
  });
}

function styleTitleRow(ws: ExcelJS.Worksheet, title: string, headerCount: number) {
  ws.insertRow(1, []);
  ws.mergeCells(1, 1, 1, headerCount);

  const cell = ws.getCell(1, 1);
  cell.value = title;

  cell.font = { bold: true, size: 13, color: { argb: 'FF1F2937' } };
  cell.alignment = {
    horizontal: 'center',
    vertical: 'middle',
    wrapText: false,     // ✅ לא לשבור שורה
    shrinkToFit: true,   // ✅ אם ארוך – יתכווץ במקום להיחתך/לרדת שורה
  };

  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  };

  ws.getRow(1).height = 26;
}


function styleDataRows(
  ws: ExcelJS.Worksheet,
  headerCount: number,
  options?: { firstDataRow?: number; integerCols?: number[]; dateCols?: number[] }
) {
  const firstDataRow = options?.firstDataRow ?? 3;
  const integerCols = options?.integerCols ?? [];
  const dateCols = options?.dateCols ?? [];

  for (let rowIdx = firstDataRow; rowIdx <= ws.rowCount; rowIdx++) {
    const row = ws.getRow(rowIdx);

    // zebra
    if (rowIdx % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      });
    }

    for (let colIdx = 1; colIdx <= headerCount; colIdx++) {
      const cell = row.getCell(colIdx);

      if (dateCols.includes(colIdx)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.numFmt = 'yyyy-mm';
      } else if (integerCols.includes(colIdx)) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '#,##0'; // ✅ no decimals
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    }
  }
}

/**
 * Autofit that can ignore "title merged row" so it won't blow up widths.
 * NOTE: we still keep a maxWidth cap as safety.
 */
function autofitColumns(
  ws: ExcelJS.Worksheet,
  headerCount: number,
  options?: { skipRows?: number[]; maxWidth?: number; minWidth?: number }
) {
  const skip = new Set(options?.skipRows ?? []);
  const maxWidth = options?.maxWidth ?? 40;
  const minWidth = options?.minWidth ?? 10;

  for (let colIdx = 1; colIdx <= headerCount; colIdx++) {
    let maxLen = 0;

    ws.eachRow((row, rowNumber) => {
      if (skip.has(rowNumber)) return;

      const cell = row.getCell(colIdx);
      const val = cell.value;
      if (val === null || val === undefined) return;

      const text =
        typeof val === 'object' && val && (val as any).richText
          ? (val as any).richText.map((r: any) => r.text).join('')
          : String(val);

      maxLen = Math.max(maxLen, text.length);
    });

    ws.getColumn(colIdx).width = Math.min(Math.max(maxLen + 2, minWidth), maxWidth);
  }
}

/** ---------------- Split / Customers ---------------- */

const getCustomerKey = (agentId: string, cid: string) => `${agentId}::${cid}`;

function findSplitForSale(
  sale: any,
  commissionSplits: CommissionSplit[],
  customersByKey: Map<string, any>
): CommissionSplit | undefined {
  const agentId = canon(sale.AgentId);
  const cid = canon(sale.IDCustomer || sale.customerId);
  if (!agentId || !cid) return undefined;

  const customer = customersByKey.get(getCustomerKey(agentId, cid));
  if (!customer) return undefined;

  const leadId = canon(customer.sourceValue ?? customer.sourceLead ?? '');
  if (!leadId) return undefined;

  return commissionSplits.find(
    (split) => canon((split as any).agentId) === agentId && canon((split as any).sourceLeadId) === leadId
  );
}

function getSourceLeadPercent(split: CommissionSplit): number {
  const pSourceRaw = (split as any).percentToSourceLead;
  if (typeof pSourceRaw !== 'undefined' && pSourceRaw !== null && pSourceRaw !== '') {
    const v = Number(pSourceRaw);
    return Number.isFinite(v) ? v : 0;
  }

  const pAgent = Number((split as any).percentToAgent ?? 100);
  if (!Number.isFinite(pAgent)) return 0;
  return 100 - pAgent;
}

/** ---------------- Types ---------------- */

type SummaryRow = {
  'כמות לקוחות': number;
  'כמות מכירות': number;
  'היקף (לתשלום למקור ליד)': number;
  'נפרעים (לתשלום למקור ליד)': number;
};

type DetailRow = {
  'ת"ז': string;
  'שם פרטי': string;
  'שם משפחה': string;
  'חברה': string;
  'מוצר': string;
  'מס׳ פוליסה': string;
  'חודש תפוקה': string; // YM
  'היקף': number;
  'נפרעים': number;
};

/** ---------------- Main ---------------- */
/**
 * Expected params additions on ReportRequest payload:
 * - sourceLeadId: string (doc id in sourceLead collection)
 */
export async function generateLeadSourceStatementReport(params: ReportRequest) {
  const { agentId, fromDate, toDate, company, product, statusPolicy } = params as any;

  // ✅ must match client payload key
  const sourceLeadId = canon((params as any).sourceLeadId || '');
  if (!agentId) throw new Error('נדרש לבחור סוכן');
  if (!sourceLeadId) throw new Error('נדרש לבחור מקור ליד');

  const fromYm = toYm(fromDate);
  const toYmVal = toYm(toDate);
  if (!fromYm || !toYmVal) throw new Error('נדרש לבחור טווח חודשים (מתאריך ועד תאריך)');
  if (fromYm > toYmVal) throw new Error('טווח חודשים לא תקין (תאריך התחלה אחרי תאריך סיום)');

  const selectedCompanies = Array.isArray(company) ? company.map(canon) : [];
  const selectedProducts = Array.isArray(product) ? product.map(canon) : [];
  const selectedStatuses = Array.isArray(statusPolicy) ? statusPolicy.map(canon) : [];
  const filterMinuy = parseMinuy((params as any).minuySochen);

  const db = admin.firestore();

  // 1) validate lead + get name
  const leadDoc = await db.collection('sourceLead').doc(sourceLeadId).get();
  if (!leadDoc.exists) throw new Error('מקור ליד לא נמצא');

  const leadData: any = leadDoc.data() || {};
  const leadName = canon(leadData.sourceLead || '');
  const leadAgent = canon(leadData.AgentId || '');

  if (!leadName) throw new Error('למקור הליד אין שם');
  if (leadAgent && leadAgent !== canon(agentId)) {
    throw new Error('מקור הליד שנבחר לא שייך לסוכן שנבחר');
  }

  // 2) contracts + product map
  const contracts = await fetchContractsByAgent(agentId);
  const productMap = await getProductMap();

  // 3) customers map -> leadId by customer
  const custSnap = await db.collection('customer').where('AgentId', '==', agentId).get();

  const customersByKey = new Map<string, any>();
  const customerLeadIdByKey = new Map<string, string>();

  custSnap.docs.forEach((d) => {
    const c: any = d.data();
    const cid = canon(c.IDCustomer);
    if (!cid) return;

    const key = getCustomerKey(agentId, cid);
    customersByKey.set(key, c);

    const leadId = canon(c.sourceValue ?? c.sourceLead ?? '');
    if (leadId) customerLeadIdByKey.set(key, leadId);
  });

  // 4) splits are required for this report
  const commissionSplits: CommissionSplit[] = await fetchCommissionSplits(agentId);

  // 5) sales
  const salesSnap = await db.collection('sales').where('AgentId', '==', agentId).get();

  const customersSet = new Set<string>();
  let salesCount = 0;
  let totalHekef = 0;
  let totalNifraim = 0;

  const details: DetailRow[] = [];

  for (const d of salesSnap.docs) {
    const s: any = d.data();

    // month filter
    const ym = toYm(s.month || s.mounth);
    if (!ym) continue;
    if (ym < fromYm || ym > toYmVal) continue;

    // status filter
    const st = canon(s.statusPolicy ?? s.status);
    if (selectedStatuses.length && !selectedStatuses.includes(st)) continue;

    // company/product filter
    const comp = canon(s.company);
    const prod = canon(s.product);
    if (selectedCompanies.length && !selectedCompanies.includes(comp)) continue;
    if (selectedProducts.length && !selectedProducts.includes(prod)) continue;

    // minuy
    if (typeof filterMinuy === 'boolean' && normalizeMinuy(s.minuySochen) !== filterMinuy) continue;

    // customer + lead match
    const cid = canon(s.IDCustomer || s.customerId);
    if (!cid) continue;

    const ckey = getCustomerKey(agentId, cid);
    const saleLeadId = canon(customerLeadIdByKey.get(ckey) || '');
    if (!saleLeadId) continue; // without lead -> not included
    if (saleLeadId !== sourceLeadId) continue; // only selected lead source

    // split factor
    const split = findSplitForSale(s, commissionSplits, customersByKey);
    if (!split) continue; // no agreement -> no payment

    const pctSource = getSourceLeadPercent(split);
    const factor = Number.isFinite(pctSource) ? Math.max(0, pctSource) / 100 : 0;
    if (factor <= 0) continue;

    // contract match
    const contractMatch =
      (contracts as any).find(
        (c: any) =>
          canon(c.AgentId) === canon(agentId) &&
          canon(c.company) === comp &&
          canon((c as any).product) === prod &&
          normalizeMinuy((c as any).minuySochen) === normalizeMinuy(s.minuySochen)
      ) || undefined;

    const commissions: any = calculateCommissions(s, contractMatch, contracts as any, productMap as any, agentId);

    const hekef = Math.round(Number(commissions?.commissionHekef ?? 0) * factor);
    const nifraim = Math.round(Number(commissions?.commissionNifraim ?? 0) * factor);

    customersSet.add(cid);
    salesCount += 1;
    totalHekef += hekef;
    totalNifraim += nifraim;

    details.push({
        'ת"ז': cid,
        'שם פרטי': canon(s.firstNameCustomer || ''),
        'שם משפחה': canon(s.lastNameCustomer || ''),
        'חברה': comp,
        'מוצר': prod,
        'מס׳ פוליסה': canon(s.policyNumber || ''),
        'חודש תפוקה': ym,
        'היקף': hekef,
        'נפרעים': nifraim,
      });
      
  }

  const summaryRow = {
    'כמות לקוחות': customersSet.size,
    'כמות מכירות': salesCount,
    'היקף': Math.round(totalHekef),
    'נפרעים': Math.round(totalNifraim),
  };
  
  // 6) Excel
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const title = `דוח תשלום למקור ליד: ${leadName} | תקופה: ${ymToHebrew(fromYm)} עד ${ymToHebrew(toYmVal)}`;

  /** ---------------- Sheet 1: Summary ---------------- */
  const ws1 = wb.addWorksheet('סיכום', { views: [{ rightToLeft: true }] });

  const headers1 = ['כמות לקוחות', 'כמות מכירות', 'היקף', 'נפרעים'];
  ws1.addRow(headers1); // row 1
  styleHeaderRow(ws1.getRow(1));
  ws1.addRow(headers1.map((h) => (summaryRow as any)[h] ?? ''));

  styleTitleRow(ws1, title, headers1.length); // insert row 1, pushes header->row2
  styleHeaderRow(ws1.getRow(2));

  styleDataRows(ws1, headers1.length, {
    firstDataRow: 3,
    integerCols: [1, 2, 3, 4],
  });

  // IMPORTANT: skip title row so it won't blow widths
  autofitColumns(ws1, headers1.length, { skipRows: [1], maxWidth: 40 });

  /** ---------------- Sheet 2: Details ---------------- */
  const ws2 = wb.addWorksheet('פירוט', { views: [{ rightToLeft: true }] });

  const headers2 = [
    'ת"ז',
    'שם פרטי',
    'שם משפחה',
    'חברה',
    'מוצר',
    'מס׳ פוליסה',
    'חודש תפוקה',
    'היקף',
    'נפרעים',
  ];
  

  ws2.addRow(headers2); // row 1
  styleHeaderRow(ws2.getRow(1));

  details
    .sort(
      (a, b) =>
        a['חודש תפוקה'].localeCompare(b['חודש תפוקה']) ||
        a['שם משפחה'].localeCompare(b['שם משפחה']) ||
        a['שם פרטי'].localeCompare(b['שם פרטי'])
    )
    .forEach((r) => {
      ws2.addRow(
        headers2.map((h) => {
          if (h === 'חודש תפוקה') return monthStringToDate((r as any)[h]);
          return (r as any)[h] ?? '';
        })
      );
    });
// --- שורת סיכום ---
const totalRow = ws2.addRow([
  'סה״כ',   // ת"ז
  '',       // שם פרטי
  '',       // שם משפחה
  '',       // חברה
  '',       // מוצר
  '',       // מס׳ פוליסה
  '',       // חודש תפוקה
  Math.round(totalHekef),
  Math.round(totalNifraim),
]);

// עיצוב שורת סיכום
totalRow.eachCell((cell, colNumber) => {
  cell.font = { bold: true };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5E7EB' }, // אפור עדין
  };

  if (colNumber >= 8) {
    cell.alignment = { horizontal: 'right', vertical: 'middle' };
    cell.numFmt = '#,##0';
  } else {
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }
});


  styleTitleRow(ws2, title, headers2.length); // pushes header->row2
  styleHeaderRow(ws2.getRow(2));

  styleDataRows(ws2, headers2.length, {
    firstDataRow: 3,
    dateCols: [7],
    integerCols: [8, 9],
  });

  // IMPORTANT: skip title row so it won't blow widths
  autofitColumns(ws2, headers2.length, { skipRows: [1], maxWidth: 40 });

  const excelBuffer = await wb.xlsx.writeBuffer();
  const buffer = Buffer.isBuffer(excelBuffer) ? excelBuffer : Buffer.from(excelBuffer as ArrayBuffer);

  return {
    buffer,
    filename: `דוח תשלום למקור ליד - ${leadName}.xlsx`,
    subject: `דוח תשלום למקור ליד - ${leadName}`,
    description: `דוח תשלום למקור ליד (${leadName}) לתקופה ${fromYm}–${toYmVal}. כולל סיכום ופירוט פוליסות, לקוחות וסכומים (חלק מקור הליד בלבד).`,
  };
}
