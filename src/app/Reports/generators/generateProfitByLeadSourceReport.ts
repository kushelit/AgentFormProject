// THIS FILE RUNS ONLY ON SERVER. DO NOT IMPORT FROM CLIENT.
// /app/Reports/generators/generateProfitByLeadSourceReport.ts

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

function monthStringToDate(month: string): Date | string {
  if (!month) return '';
  if (!/^\d{4}-\d{2}/.test(month)) return month;
  const year = Number(month.slice(0, 4));
  const monthIdx = Number(month.slice(5, 7)) - 1;
  return new Date(year, monthIdx, 1);
}

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

function styleDataRows(
  ws: ExcelJS.Worksheet,
  headerCount: number,
  options?: {
    firstDataRow?: number;
    numericCols?: number[]; // decimals (rare here)
    integerCols?: number[]; // ✅ integers (counts + commissions)
    dateCols?: number[];
  }
) {
  const firstDataRow = options?.firstDataRow ?? 2;
  const numericCols = options?.numericCols ?? [];
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
        continue;
      }

      if (integerCols.includes(colIdx)) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '#,##0'; // ✅ NO decimals
        continue;
      }

      if (numericCols.includes(colIdx)) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '#,##0.00';
        continue;
      }

      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  }
}

function autofitColumns(ws: ExcelJS.Worksheet, headerCount: number) {
  for (let colIdx = 1; colIdx <= headerCount; colIdx++) {
    let maxLen = 0;
    ws.eachRow((row) => {
      const cell = row.getCell(colIdx);
      const val = cell.value;
      if (val === null || val === undefined) return;

      const text =
        typeof val === 'object' && val && (val as any).text
          ? String((val as any).text)
          : String(val);

      maxLen = Math.max(maxLen, text.length);
    });

    ws.getColumn(colIdx).width = Math.min(Math.max(maxLen + 2, 10), 42);
  }
}

/** מקור ליד ללקוח + הסכם פיצול */
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

  const sourceValueUnified = canon(customer.sourceValue ?? customer.sourceLead ?? '');
  if (!sourceValueUnified) return undefined;

  return commissionSplits.find(
    (split) => canon(split.agentId) === agentId && canon(split.sourceLeadId) === sourceValueUnified
  );
}

/** ---------------- Types ---------------- */
type SummaryRow = {
  'מקור ליד': string;
  'כמות לקוחות': number;
  'כמות מכירות': number;
  'עמלת היקף (MAGIC)': number; // ✅ integers
  'עמלת נפרעים (MAGIC)': number; // ✅ integers
};

type DetailRow = {
  'מקור ליד': string;
  'ת"ז': string;
  'שם פרטי': string;
  'שם משפחה': string;
  'חברה': string;
  'מוצר': string;
  'חודש תפוקה': string; // YM
  'עמלת היקף (MAGIC)': number; // ✅ integers
  'עמלת נפרעים (MAGIC)': number; // ✅ integers
};

/** ---------------- Main ---------------- */
export async function generateProfitByLeadSourceReport(params: ReportRequest) {
  const { agentId, fromDate, toDate, company, product, statusPolicy } = params;

  if (!agentId) throw new Error('נדרש לבחור סוכן');

  const fromYm = toYm(fromDate);
  const toYmVal = toYm(toDate);

  if (!fromYm || !toYmVal) throw new Error('נדרש לבחור טווח חודשים (מתאריך ועד תאריך)');
  if (fromYm > toYmVal) throw new Error('טווח חודשים לא תקין (תאריך התחלה אחרי תאריך סיום)');

  const selectedCompanies = Array.isArray(company) ? company.map(canon) : [];
  const selectedProducts = Array.isArray(product) ? product.map(canon) : [];
  const selectedStatuses = Array.isArray(statusPolicy) ? statusPolicy.map(canon) : [];

  const filterMinuy = parseMinuy((params as any).minuySochen);
  const applyCommissionSplit =
    typeof (params as any).applyCommissionSplit === 'boolean'
      ? (params as any).applyCommissionSplit
      : false;

  const db = admin.firestore();

  // 1) חוזים + מפת מוצרים (חישוב עמלות)
  const contracts = await fetchContractsByAgent(agentId);
  const productMap = await getProductMap();

  // 2) מקור ליד פעיל: sourceLead.id -> sourceLead.name
  const leadSnap = await db
    .collection('sourceLead')
    .where('AgentId', '==', agentId)
    .where('statusLead', '==', true)
    .get();

  const leadIdToName = new Map<string, string>();
  leadSnap.docs.forEach((d) => {
    const data: any = d.data();
    const name = canon(data.sourceLead);
    if (name) leadIdToName.set(d.id, name);
  });

  // 3) לקוחות: (agentId+IDCustomer) -> leadId
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

  // 4) פיצולים (אם ביקשו)
  let commissionSplits: CommissionSplit[] = [];
  if (applyCommissionSplit) {
    commissionSplits = await fetchCommissionSplits(agentId);
  }

  // 5) sales
  const salesSnap = await db.collection('sales').where('AgentId', '==', agentId).get();

  const agg = new Map<
    string,
    {
      leadName: string;
      customers: Set<string>;
      salesCount: number;
      hekef: number;
      nifraim: number;
    }
  >();

  const details: DetailRow[] = [];

  for (const d of salesSnap.docs) {
    const s: any = d.data();

    // חודש תפוקה
    const ym = toYm(s.month || s.mounth);
    if (!ym) continue;
    if (ym < fromYm || ym > toYmVal) continue;

    // סטטוס
    const st = canon(s.statusPolicy ?? s.status);
    if (selectedStatuses.length && !selectedStatuses.includes(st)) continue;

    // חברה/מוצר
    const comp = canon(s.company);
    const prod = canon(s.product);
    if (selectedCompanies.length && !selectedCompanies.includes(comp)) continue;
    if (selectedProducts.length && !selectedProducts.includes(prod)) continue;

    // מינוי
    if (typeof filterMinuy === 'boolean' && normalizeMinuy(s.minuySochen) !== filterMinuy) continue;

    // מקור ליד מהלקוח
    const cid = canon(s.IDCustomer || s.customerId);
    if (!cid) continue;

    const ckey = getCustomerKey(agentId, cid);
    const leadId = canon(customerLeadIdByKey.get(ckey) || '');
    if (!leadId) continue; // בלי מקור ליד — לא נכנס לדוח

    const leadName = canon(leadIdToName.get(leadId) || '');
    if (!leadName) continue; // מקור ליד לא פעיל/נמחק — לא מציגים

    // חישוב עמלות MAGIC
    const contractMatch =
      (contracts as any[]).find(
        (c: any) =>
          canon(c.AgentId) === agentId &&
          canon(c.company) === comp &&
          canon((c as any).product) === prod &&
          normalizeMinuy((c as any).minuySochen) === normalizeMinuy(s.minuySochen)
      ) || undefined;

    const commissions: any = calculateCommissions(
      s,
      contractMatch,
      contracts as any,
      productMap as any,
      agentId
    );

    let hekef = Number(commissions?.commissionHekef ?? 0);
    let nifraim = Number(commissions?.commissionNifraim ?? 0);

    // פיצול (percentToAgent)
    if (applyCommissionSplit && commissionSplits.length && customersByKey.size) {
      const split = findSplitForSale(s, commissionSplits, customersByKey);
      if (split) {
        const pct = Number((split as any).percentToAgent ?? 100);
        if (!Number.isNaN(pct)) {
          hekef = hekef * (pct / 100);
          nifraim = nifraim * (pct / 100);
        }
      }
    }

    // ✅ ללא נקודות: נעגל לשקל
    const hekefInt = Math.round(hekef);
    const nifraimInt = Math.round(nifraim);

    const entry = agg.get(leadName) ?? {
      leadName,
      customers: new Set<string>(),
      salesCount: 0,
      hekef: 0,
      nifraim: 0,
    };

    entry.customers.add(cid);
    entry.salesCount += 1;
    entry.hekef += hekefInt;
    entry.nifraim += nifraimInt;

    agg.set(leadName, entry);

    // details row
    details.push({
      'מקור ליד': leadName,
      'ת"ז': cid,
      'שם פרטי': canon(s.firstNameCustomer || ''),
      'שם משפחה': canon(s.lastNameCustomer || ''),
      'חברה': comp,
      'מוצר': prod,
      'חודש תפוקה': ym,
      'עמלת היקף (MAGIC)': hekefInt,
      'עמלת נפרעים (MAGIC)': nifraimInt,
    });
  }

  // 6) סיכום (גם שלם)
  const summaryRows: SummaryRow[] = Array.from(agg.values())
    .map((v) => ({
      'מקור ליד': v.leadName,
      'כמות לקוחות': v.customers.size,
      'כמות מכירות': v.salesCount,
      'עמלת היקף (MAGIC)': Math.round(v.hekef),
      'עמלת נפרעים (MAGIC)': Math.round(v.nifraim),
    }))
    .sort((a, b) => b['עמלת נפרעים (MAGIC)'] - a['עמלת נפרעים (MAGIC)']);

  // 7) Excel
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  // Sheet 1: סיכום
  const ws1 = wb.addWorksheet('סיכום לפי מקור ליד', { views: [{ rightToLeft: true }] });

  const headers1 = [
    'מקור ליד',
    'כמות לקוחות',
    'כמות מכירות',
    'עמלת היקף (MAGIC)',
    'עמלת נפרעים (MAGIC)',
  ];

  ws1.addRow(headers1);
  styleHeaderRow(ws1.getRow(1));

  summaryRows.forEach((r) => {
    ws1.addRow(headers1.map((h) => (r as any)[h] ?? ''));
  });

  // ✅ הכל שלם (כולל העמלות)
  styleDataRows(ws1, headers1.length, {
    firstDataRow: 2,
    integerCols: [2, 3, 4, 5],
  });
  autofitColumns(ws1, headers1.length);

  // Sheet 2: פירוט
  const ws2 = wb.addWorksheet('פירוט', { views: [{ rightToLeft: true }] });

  const headers2 = [
    'מקור ליד',
    'ת"ז',
    'שם פרטי',
    'שם משפחה',
    'חברה',
    'מוצר',
    'חודש תפוקה',
    'עמלת היקף (MAGIC)',
    'עמלת נפרעים (MAGIC)',
  ];

  ws2.addRow(headers2);
  styleHeaderRow(ws2.getRow(1));

  details
    .sort(
      (a, b) =>
        a['מקור ליד'].localeCompare(b['מקור ליד']) ||
        a['חודש תפוקה'].localeCompare(b['חודש תפוקה'])
    )
    .forEach((r) => {
      ws2.addRow(
        headers2.map((h) => {
          if (h === 'חודש תפוקה') return monthStringToDate((r as any)[h]);
          return (r as any)[h] ?? '';
        })
      );
    });


// ✅ שורת סיכום בלשונית פירוט
const totalHekef2 = details.reduce((sum, r) => sum + Number(r['עמלת היקף (MAGIC)'] ?? 0), 0);
const totalNifraim2 = details.reduce((sum, r) => sum + Number(r['עמלת נפרעים (MAGIC)'] ?? 0), 0);

ws2.addRow([]); // רווח קטן

const sumRowValues = headers2.map((h) => {
  if (h === 'עמלת היקף (MAGIC)') return totalHekef2;
  if (h === 'עמלת נפרעים (MAGIC)') return totalNifraim2;
  if (h === 'חודש תפוקה') return 'סה״כ';
  return '';
});

const sumRow = ws2.addRow(sumRowValues);

// עיצוב שורת סיכום (רקע כהה כמו כותרת, טקסט לבן)
sumRow.height = 18;
sumRow.eachCell((cell) => {
  cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4D4D4D' } };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
  };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
});



  // ✅ עמלות בפירוט שלמות
  styleDataRows(ws2, headers2.length, {
    firstDataRow: 2,
    dateCols: [7],
    integerCols: [8, 9],
  });
  autofitColumns(ws2, headers2.length);

  const excelBuffer = await wb.xlsx.writeBuffer();
  const buffer = Buffer.isBuffer(excelBuffer)
    ? excelBuffer
    : Buffer.from(excelBuffer as ArrayBuffer);

    const splitStr = applyCommissionSplit ? 'עם פיצול עמלות' : 'ללא פיצול עמלות';

    return {
      buffer,
      filename: `דוח רווחיות לפי מקור ליד - ${splitStr}.xlsx`,
      subject: `דוח רווחיות לפי מקור ליד (${splitStr})`,
      description:
        `דוח השוואת עמלות MAGIC לפי מקור ליד (${splitStr}): כולל עמלות היקף ונפרעים, כמות לקוחות וכמות מכירות, וכן פירוט עסקאות שנכנסו לדוח.`,
    };    
}
