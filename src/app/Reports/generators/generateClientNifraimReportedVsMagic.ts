// THIS FILE RUNS ONLY ON SERVER. DO NOT IMPORT FROM CLIENT.
// /app/Reports/generators/generateClientNifraimReportedVsMagic.ts

import { admin } from '@/lib/firebase/firebase-admin';
import ExcelJS from 'exceljs';
import { ReportRequest } from '@/types';
import { calculateCommissions } from '@/utils/commissionCalculations';
import { fetchContractsByAgent } from '@/services/server/fetchContracts';
import { getProductMap } from '@/services/server/productService';
import { fetchCommissionSplits } from '@/services/server/commissionService';
import type { CommissionSplit } from '@/types/CommissionSplit';

/** -------------------------------------------------- */
/**   Helpers                                          */
/** -------------------------------------------------- */

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

// הפיכת YYYY-MM ל־Date של היום הראשון בחודש (לטובת סינון/קיבוץ באקסל)
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

/** KEY אחיד כמו במסך: חברה + פוליסה, ואם אין פוליסה – מפתח פנימי */
const makeKey = (company: string, policy: string, docId?: string) =>
  policy ? `${company}::${policy}` : `${company}::__NO_POLICY__:${docId ?? ''}`;

/** מפתח ללקוח במפה (AgentId + ת"ז) */
const getCustomerKey = (agentId: string, cid: string) =>
  `${agentId}::${cid}`;

/** למצוא הסכם פיצול רלוונטי לעסקה */
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

  const sourceValueUnified = canon(
    customer.sourceValue ?? customer.sourceLead ?? ''
  );
  if (!sourceValueUnified) return undefined;

  return commissionSplits.find(
    (split) =>
      canon(split.agentId) === agentId &&
      canon(split.sourceLeadId) === sourceValueUnified
  );
}

/** ---- עיצוב אקסל (exceljs) ---- */

// כותרת – אפור כהה, טקסט לבן, bold
function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 20;
  row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  row.eachCell((cell) => {
    cell.font = {
      bold: true,
      color: { argb: 'FFFFFFFF' },
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

// עיצוב שורות נתונים – כולל תאריכים/מספרים
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
          fgColor: { argb: 'FFF5F5F5' },
        };
      });
    }

    for (let colIdx = 1; colIdx <= headerCount; colIdx++) {
      const cell = row.getCell(colIdx);

      if (dateCols.includes(colIdx)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.numFmt = 'yyyy-mm'; // יוצג 2025-04 אבל כתאריך
      } else if (numericCols.includes(colIdx)) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '#,##0.00';
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
    }
  }
}

// התאמת רוחב עמודות לפי תוכן
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

/** -------------------------------------------------- */
/**   Types                                            */
/** -------------------------------------------------- */

type PolicyRowOut = {
  'ת"ז': string;
  'שם פרטי': string;
  'שם משפחה': string;
  'חברה': string;
  'מס׳ פוליסה': string;
  'חודש דיווח (קובץ)': string; // נשמור כ-YYYY-MM, נמיר ל-Date בשלב האקסל
  'חודש תחילה (קובץ)': string;
  'נפרעים (קובץ)': number;
  'נפרעים (MAGIC)': number;
  'פער ₪ (קובץ−MAGIC)': number;
  'פער %': number;
  [key: string]: string | number;
};

type CustomerRowOut = {
  'ת"ז': string;
  'שם פרטי': string;
  'שם משפחה': string;
  'נפרעים (קובץ)': number;
  'נפרעים (MAGIC)': number;
  'פער ₪ (קובץ−MAGIC)': number;
  'פער %': number;
  [key: string]: string | number;
};

/** -------------------------------------------------- */

export async function generateClientNifraimReportedVsMagic(
  params: ReportRequest
) {
  const { agentId, product, company, fromDate, toDate, statusPolicy } = params;

  if (!agentId) throw new Error('נדרש לבחור סוכן');

  const db = admin.firestore();
  const contracts = await fetchContractsByAgent(agentId);
  const productMap = await getProductMap();

  const fromYm = toYm(fromDate);
  const toYmVal = toYm(toDate);

  if (!fromYm || !toYmVal) {
    throw new Error('נדרש לבחור טווח חודשים (מתאריך ועד תאריך)');
  }
  if (fromYm > toYmVal) {
    throw new Error('טווח חודשים לא תקין (תאריך התחלה אחרי תאריך סיום)');
  }

  const selectedCompanies = Array.isArray(company)
    ? company.map(canon)
    : [];
  const selectedProducts = Array.isArray(product)
    ? product.map(canon)
    : [];
  const selectedStatuses = Array.isArray(statusPolicy)
    ? statusPolicy.map(canon)
    : [];

  const filterMinuy = parseMinuy((params as any).minuySochen);

  const applyCommissionSplit =
    typeof (params as any).applyCommissionSplit === 'boolean'
      ? (params as any).applyCommissionSplit
      : false;

  let commissionSplits: CommissionSplit[] = [];
  const customersByKey = new Map<string, any>();

  if (applyCommissionSplit) {
    commissionSplits = await fetchCommissionSplits(agentId);

    const customersSnap = await db
      .collection('customer')
      .where('AgentId', '==', agentId)
      .get();

    customersSnap.docs.forEach((doc) => {
      const c = doc.data() as any;
      const cid = canon(c.IDCustomer);
      const aId = canon(c.AgentId || agentId);
      if (!cid || !aId) return;
      customersByKey.set(getCustomerKey(aId, cid), c);
    });
  }

  /** מאגרים */

  const reportedByKey: Record<
  string,
  { ym: string; validYm?: string; amount: number; cid: string; fullName?: string }
> = {};


  const magicByKey: Record<
    string,
    { amount: number; cid?: string; first?: string; last?: string }
  > = {};

  /** ---------- EXTERNAL (קובץ) מתוך policyCommissionSummaries ---------- */

  // ⚠️ פה השינוי: עוברים ל-policyCommissionSummaries במקום externalCommissions
  let extQuery: FirebaseFirestore.Query = db
    .collection('policyCommissionSummaries')
    .where('agentId', '==', agentId);

  // טווח חודשים לפי reportMonth (פורמט YYYY-MM)
  if (fromYm) {
    extQuery = extQuery.where('reportMonth', '>=', fromYm);
  }
  if (toYmVal) {
    extQuery = extQuery.where('reportMonth', '<=', toYmVal);
  }

  const extSnap = await extQuery.get();

  for (const d of extSnap.docs) {
    const r: any = d.data();

    const comp = canon(r.company);
    const ym = canon(r.reportMonth);
    const validYm = canon(r.validMonth);

    if (!ym) continue;
    if (fromYm && ym < fromYm) continue;
    if (toYmVal && ym > toYmVal) continue;

    if (selectedCompanies.length && !selectedCompanies.includes(comp)) continue;

    // אם יש מוצר בסיכום – נסנן לפיו, אחרת נשאיר (הדוח עדיין יהיה נכון ברמת פוליסה)
    const prod = canon((r as any).product);
    if (selectedProducts.length && prod && !selectedProducts.includes(prod))
      continue;

    if (
      typeof filterMinuy === 'boolean' &&
      typeof r.minuySochen !== 'undefined' &&
      normalizeMinuy(r.minuySochen) !== filterMinuy
    )
      continue;

    const policy = canon(r.policyNumberKey || r.policyNumber);
    if (!policy) continue;

    const cid = canon(r.customerId || r.IDCustomer);
   const key = makeKey(comp, policy, d.id);

const fullName = canon(r.fullName || '');
const amount = Number(r.totalCommissionAmount ?? 0);

// ✅ אם אין רשומה עדיין – או שהחודש הנוכחי מאוחר יותר מהקיים – נעדכן
const existing = reportedByKey[key];
if (!existing || ym > existing.ym) {
  reportedByKey[key] = {
    ym,                     // חודש דיווח המאוחר ביותר
    validYm,                // validMonth המתאים לאותו חודש
    cid,
    amount,
    fullName: fullName || undefined,
  };
}
}

  /** ---------- MAGIC (sales) ---------- */

  const salesSnap = await db
    .collection('sales')
    .where('AgentId', '==', agentId)
    .get();

  for (const d of salesSnap.docs) {
    const s: any = d.data();

    const comp = canon(s.company);
    const policy = canon(s.policyNumber);

    const policyYm = toYm(s.month || s.mounth);
    if (toYmVal && policyYm && policyYm > toYmVal) continue;

    if (selectedCompanies.length && !selectedCompanies.includes(comp)) continue;

    const prod = canon(s.product);
    if (selectedProducts.length && !selectedProducts.includes(prod)) continue;

    const st = canon(s.statusPolicy ?? s.status);
    if (selectedStatuses.length && !selectedStatuses.includes(st)) continue;

    if (
      typeof filterMinuy === 'boolean' &&
      normalizeMinuy(s.minuySochen) !== filterMinuy
    )
      continue;

    const key = makeKey(comp, policy, d.id);

    const contractMatch =
      contracts.find(
        (c) =>
          c.AgentId === agentId &&
          canon(c.company) === comp &&
          canon((c as any).product) === prod &&
          normalizeMinuy((c as any).minuySochen) ===
            normalizeMinuy(s.minuySochen)
      ) || undefined;

    const commissions = calculateCommissions(
      s,
      contractMatch,
      contracts,
      productMap,
      agentId
    );

    let amount = Number((commissions as any)?.commissionNifraim ?? 0);

    if (
      applyCommissionSplit &&
      commissionSplits.length &&
      customersByKey.size
    ) {
      const split = findSplitForSale(s, commissionSplits, customersByKey);
      if (split) {
        const pct = Number(split.percentToAgent ?? 100);
        if (!Number.isNaN(pct)) {
          amount = amount * (pct / 100);
        }
      }
    }

    const cid = canon(s.IDCustomer || s.customerId);
    const first = canon(s.firstNameCustomer || '');
    const last = canon(s.lastNameCustomer || '');

    if (!magicByKey[key]) {
      magicByKey[key] = { amount: 0, cid, first, last };
    }

    magicByKey[key].amount += amount;

    if (!magicByKey[key].cid && cid) magicByKey[key].cid = cid;
    if (!magicByKey[key].first && first) magicByKey[key].first = first;
    if (!magicByKey[key].last && last) magicByKey[key].last = last;
  }

  /** ---------- UNION → לשונית "נפרעים לפי פוליסה" ---------- */

  const policyRows: PolicyRowOut[] = [];

  const allKeys = Array.from(
    new Set([...Object.keys(reportedByKey), ...Object.keys(magicByKey)])
  );

  for (const key of allKeys) {
    const [comp, policyPart] = key.split('::');

    const policy =
      policyPart && policyPart.startsWith('__NO_POLICY__')
        ? ''
        : policyPart || '';

    const rep = reportedByKey[key];
    const m = magicByKey[key];

    const mag = m?.amount ?? 0;

    let cid = '';
    let ym = '';
    let validYm = ''; 
    let first = '';
    let last = '';

    if (rep) {
      cid = rep.cid;
      ym = rep.ym;
      validYm = rep.validYm ?? ''; 
      if (rep.fullName) {
        const parts = rep.fullName.split(' ');
        first = parts[0] || '';
        last = parts.slice(1).join(' ') || '';
      }
    }

    if (!cid && m?.cid) cid = m.cid;
    if (!first && m?.first) first = m.first;
    if (!last && m?.last) last = m.last;

    const reported = rep ? rep.amount : 0;
    const diff = reported - mag;

    let diffPct = 0;
    if (reported === 0 && mag !== 0) diffPct = (diff / mag) * 100;
    else if (reported !== 0) diffPct = (diff / reported) * 100;

    policyRows.push({
      'ת"ז': cid,
      'שם פרטי': first,
      'שם משפחה': last,
      'חברה': comp,
      'מס׳ פוליסה': policy,
      'חודש דיווח (קובץ)': ym,
      'חודש תחילה (קובץ)': validYm,
      'נפרעים (קובץ)': Number(reported.toFixed(2)),
      'נפרעים (MAGIC)': Number(mag.toFixed(2)),
      'פער ₪ (קובץ−MAGIC)': Number(diff.toFixed(2)),
      'פער %': Number(diffPct.toFixed(2)),
    });
  }

  policyRows.sort(
    (a, b) =>
      a['חברה'].localeCompare(b['חברה']) ||
      a['מס׳ פוליסה'].localeCompare(b['מס׳ פוליסה']) ||
      a['חודש דיווח (קובץ)'].localeCompare(b['חודש דיווח (קובץ)'])
  );

  /** ---------- לשונית "נפרעים לפי מבוטח" ---------- */

  const byCid: Record<
    string,
    { first: string; last: string; reported: number; magic: number }
  > = {};

  for (const r of policyRows) {
    const cid = canon(r['ת"ז']);
    if (!cid) continue;

    if (!byCid[cid]) {
      byCid[cid] = {
        first: r['שם פרטי'],
        last: r['שם משפחה'],
        reported: 0,
        magic: 0,
      };
    }

    byCid[cid].reported += r['נפרעים (קובץ)'];
    byCid[cid].magic += r['נפרעים (MAGIC)'];
  }

  const customerRows: CustomerRowOut[] = Object.entries(byCid).map(
    ([cid, v]) => {
      const reported = v.reported;
      const mag = v.magic;
      const diff = reported - mag;

      let diffPct = 0;
      if (reported === 0 && mag !== 0) diffPct = (diff / mag) * 100;
      else if (reported !== 0) diffPct = (diff / reported) * 100;

      return {
        'ת"ז': cid,
        'שם פרטי': v.first,
        'שם משפחה': v.last,
        'נפרעים (קובץ)': Number(reported.toFixed(2)),
        'נפרעים (MAGIC)': Number(mag.toFixed(2)),
        'פער ₪ (קובץ−MAGIC)': Number(diff.toFixed(2)),
        'פער %': Number(diffPct.toFixed(2)),
      };
    }
  );

  customerRows.sort((a, b) => a['ת"ז'].localeCompare(b['ת"ז']));

  /** ---------- יצירת קובץ אקסל מעוצב (exceljs) ---------- */

  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  // ---- Sheet 1: נפרעים לפי פוליסה ----
  const policyHeaders: string[] = [
    'ת"ז',
    'שם פרטי',
    'שם משפחה',
    'חברה',
    'מס׳ פוליסה',
    'חודש דיווח (קובץ)',
    'חודש תחילה (קובץ)',
    'נפרעים (קובץ)',
    'נפרעים (MAGIC)',
    'פער ₪ (קובץ−MAGIC)',
    'פער %',
  ];

  const wsPolicy = wb.addWorksheet('נפרעים לפי פוליסה', {
    views: [{ rightToLeft: true }],
  });

  wsPolicy.addRow(policyHeaders);
  styleHeaderRow(wsPolicy.getRow(1));

  policyRows.forEach((r) => {
    const rowValues = policyHeaders.map((h) => {
      if (h === 'חודש דיווח (קובץ)' || h === 'חודש תחילה (קובץ)') {
     return monthStringToDate(r[h]);
      }
      return r[h] ?? '';
    });
    wsPolicy.addRow(rowValues);
  });

  styleDataRows(wsPolicy, policyHeaders.length, {
    firstDataRow: 2,
    dateCols: [6, 7], // חודש דיווח
    numericCols: [8, 9, 10, 11],
  });
  autofitColumns(wsPolicy, policyHeaders.length);

  // ---- Sheet 2: נפרעים לפי מבוטח ----
  const customerHeaders: string[] = [
    'ת"ז',
    'שם פרטי',
    'שם משפחה',
    'נפרעים (קובץ)',
    'נפרעים (MAGIC)',
    'פער ₪ (קובץ−MAGIC)',
    'פער %',
  ];

  const wsCustomer = wb.addWorksheet('נפרעים לפי מבוטח', {
    views: [{ rightToLeft: true }],
  });

  wsCustomer.addRow(customerHeaders);
  styleHeaderRow(wsCustomer.getRow(1));

  customerRows.forEach((r) => {
    const rowValues = customerHeaders.map((h) => r[h] ?? '');
    wsCustomer.addRow(rowValues);
  });

  styleDataRows(wsCustomer, customerHeaders.length, {
    firstDataRow: 2,
    numericCols: [4, 5, 6, 7],
  });
  autofitColumns(wsCustomer, customerHeaders.length);

  const excelBuffer = await wb.xlsx.writeBuffer();
  const buffer = Buffer.isBuffer(excelBuffer)
    ? excelBuffer
    : Buffer.from(excelBuffer as ArrayBuffer);

  return {
    buffer,
    filename: `דוח נפרעים – קובץ מול MagicSale.xlsx`,
    subject: 'דוח נפרעים – קובץ מול MagicSale',
    description:
      'דוח השוואת נפרעים: קובץ מול MAGIC לפי פוליסה ולפי מבוטח (ת"ז), בעיצוב אקסל אחיד.',
  };
}
