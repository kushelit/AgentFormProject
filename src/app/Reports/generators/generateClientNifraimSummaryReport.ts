// ✅ שרת בלבד — אין שימוש ב-Client SDK
// /app/Reports/generators/generateClientNifraimSummaryReport.ts

import { admin } from '@/lib/firebase/firebase-admin';
import ExcelJS from 'exceljs';
import { ReportRequest } from '@/types';
import { calculateCommissions } from '@/utils/commissionCalculations';
import { fetchContractsByAgent } from '@/services/server/fetchContracts';
import { fetchCommissionSplits } from '@/services/server/commissionService';
import { getProductMap } from '@/services/server/productService';
import type { CommissionSplit } from '@/types/CommissionSplit';
import { resolveCommissionSplit } from '@/utils/resolveCommissionSplit';

type PolicyAgg = {
  company: string;
  policyNumber: string;
  month: string;
  customerId: string;
  firstName: string;
  lastName: string;
  phone: string;
  amount: number;
};

// ---- Helpers ----

const canon = (v?: any) => String(v ?? '').trim();

// ממיר מחרוזת חודש ל-Date (תומך ב-YYYY-MM וב-YYYY-MM-DD)
function monthStringToDate(value: string): Date | string {
  const s = canon(value);
  if (!s) return '';
  if (/^\d{4}-\d{2}$/.test(s)) {
    const [year, month] = s.split('-');
    return new Date(Number(year), Number(month) - 1, 1);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(s);
  }
  return s;
}

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
        cell.numFmt = 'yyyy-mm'; // מוצג 2025-04 אבל נשמר כתאריך
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

export async function generateClientNifraimSummaryReport(
  params: ReportRequest
) {
  const { agentId, product, company, fromDate, toDate } = params;
  if (!agentId) throw new Error('נדרש לבחור סוכן');

  // דגל חישוב עם/בלי פיצול – מגיע מה-UI, אופציונלי
  const applyCommissionSplit: boolean =
    (params as any).applyCommissionSplit === true;

  const db = admin.firestore();

  // 🔹 כל לקוחות הסוכן – כדי להגיע ל-sourceValue / sourceLead + טלפון
  const customersSnapshot = await db
    .collection('customer')
    .where('AgentId', '==', agentId)
    .get();

  const customersById: Record<string, any> = {};
  const phoneMap: Record<string, string> = {};

  for (const doc of customersSnapshot.docs) {
    const c = doc.data() as any;
    const id = c.IDCustomer;
    if (!id) continue;
    customersById[id] = c;
    phoneMap[id] = c.phone || '';
  }

  // 🔎 sales - Admin SDK query
  const salesSnapshot = await db
    .collection('sales')
    .where('AgentId', '==', agentId)
    .get();

  const contracts = await fetchContractsByAgent(agentId);
  const splits = await fetchCommissionSplits(agentId);
  const productMap = await getProductMap();

  const cleanedProducts = Array.isArray(product)
    ? product.map((p) => p.trim())
    : [];
  const cleanedCompanies = Array.isArray(company)
    ? company.map((c) => c.trim())
    : [];

  // סיכום לפי לקוח (כמו שהיה)
  const nifraimByCustomer: Record<string, number> = {};
  const customerInfoMap: Record<
    string,
    { firstName: string; lastName: string }
  > = {};

  // חדש: סיכום לפי פוליסה
  const nifraimByPolicy: Record<string, PolicyAgg> = {};

  // עזר למציאת הסכם פיצול ללקוח
  function findSplitForCustomer(
    customerId: string,
    product: string
  ): CommissionSplit | undefined {
    const cust = customersById[customerId];
    if (!cust) return undefined;
    const unifiedSource = cust.sourceValue || cust.sourceLead;
    if (!unifiedSource) return undefined;

    return resolveCommissionSplit(splits, {
      agentId: canon(agentId),
      sourceLeadId: canon(unifiedSource),
      product,
      productGroup: (productMap as any)[canon(product)]?.productGroup,
    });
  }

  for (const doc of salesSnapshot.docs) {
    const raw = doc.data() as any;

    // פילטרים לפי תאריכים + חברה + מוצר
    if (fromDate && raw.mounth < fromDate) continue;
    if (toDate && raw.mounth > toDate) continue;
    if (
      cleanedCompanies.length > 0 &&
      !cleanedCompanies.includes((raw.company ?? '').trim())
    )
      continue;
    if (
      cleanedProducts.length > 0 &&
      !cleanedProducts.includes((raw.product ?? '').trim())
    )
      continue;

    const customerId = raw.IDCustomer;
    if (!customerId) continue;

    const sale = {
      id: doc.id,
      AgentId: raw.AgentId || '',
      IDCustomer: raw.IDCustomer || '',
      company: raw.company || '',
      product: raw.product || '',
      workerId: raw.workerId || '',
      workerName: raw.workerName || '',
      minuySochen: raw.minuySochen || '',
      notes: raw.notes || '',
      month: raw.mounth || '',
      status: raw.statusPolicy || '',
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

    // בסיס – נפרעים לפני פיצול
    let nifraim = commissions.commissionNifraim || 0;

    // ✅ מיישמים פיצול (אם הופעל מה-UI ויש הסכם)
    if (applyCommissionSplit && splits.length > 0) {
      const splitAgreement = findSplitForCustomer(customerId, sale.product);
      if (splitAgreement) {
        const perc = splitAgreement.percentToAgent ?? 100;
        nifraim = Number(((nifraim * perc) / 100).toFixed(2));
      }
    }

    // --- סיכום לפי לקוח (לשונית "נפרעים לפי מבוטח") ---
    if (!nifraimByCustomer[customerId]) nifraimByCustomer[customerId] = 0;
    nifraimByCustomer[customerId] += nifraim;

    if (!customerInfoMap[customerId]) {
      const cust = customersById[customerId];
      customerInfoMap[customerId] = {
        firstName: cust?.firstNameCustomer || sale.firstNameCustomer || '',
        lastName: cust?.lastNameCustomer || sale.lastNameCustomer || '',
      };
    }

    // --- סיכום לפי פוליסה (לשונית "נפרעים לפי פוליסה") ---
    const phone = phoneMap[customerId] || '';
    const companyName = sale.company || '';
    const policyNumber = sale.policyNumber || '';

    const policyKey = policyNumber
      ? `${companyName}::${policyNumber}`
      : `${companyName}::__NO_POLICY__:${doc.id}`;

    const custInfo = customerInfoMap[customerId] || {};
    const firstName = custInfo.firstName || sale.firstNameCustomer || '';
    const lastName = custInfo.lastName || sale.lastNameCustomer || '';
    const month = sale.month || '';

    if (!nifraimByPolicy[policyKey]) {
      nifraimByPolicy[policyKey] = {
        company: companyName,
        policyNumber: policyNumber || '',
        month,
        customerId,
        firstName,
        lastName,
        phone,
        amount: 0,
      };
    } else {
      const existing = nifraimByPolicy[policyKey];
      if (!existing.month || (month && month < existing.month)) {
        existing.month = month;
      }
      if (!existing.firstName && firstName) existing.firstName = firstName;
      if (!existing.lastName && lastName) existing.lastName = lastName;
      if (!existing.phone && phone) existing.phone = phone;
    }

    nifraimByPolicy[policyKey].amount += nifraim;
  }

  // ---------- לשונית "נפרעים לפי פוליסה" ----------
  const policyRows = Object.values(nifraimByPolicy).map((p) => ({
    'תז': p.customerId,
    'שם פרטי': p.firstName || '',
    'שם משפחה': p.lastName || '',
    'טלפון': p.phone || '',
    'חברה': p.company || '',
    'מס׳ פוליסה': p.policyNumber || '',
    'חודש תחילה': p.month || '',
    'נפרעים (MAGIC)': Number(p.amount.toFixed(2)),
  }));

  policyRows.sort(
    (a, b) =>
      a['חברה'].localeCompare(b['חברה']) ||
      a['מס׳ פוליסה'].localeCompare(b['מס׳ פוליסה']) ||
      a['חודש תחילה'].localeCompare(b['חודש תחילה'])
  );

  // ---------- לשונית "נפרעים לפי מבוטח" ----------
  const customerRows = Object.entries(nifraimByCustomer).map(
    ([id, sumNifraim]) => {
      const info = customerInfoMap[id] || {};
      const phone = phoneMap[id] || '';

      return {
        'תז': id,
        'שם פרטי': info.firstName || '',
        'שם משפחה': info.lastName || '',
        'טלפון': phone,
        'סה"כ נפרעים': Number(sumNifraim.toFixed(2)),
      };
    }
  );

  customerRows.sort((a, b) => b['סה"כ נפרעים'] - a['סה"כ נפרעים']);

  return await buildExcelReport(policyRows, customerRows);
}

// ---- יצירת קובץ אקסל מעוצב (exceljs) ----
async function buildExcelReport(policyRows: any[], customerRows: any[]) {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  // לשונית 1 – נפרעים לפי פוליסה
  const policyHeaders: string[] = [
    'תז',
    'שם פרטי',
    'שם משפחה',
    'טלפון',
    'חברה',
    'מס׳ פוליסה',
    'חודש תחילה',
    'נפרעים (MAGIC)',
  ];

  const wsPolicy = wb.addWorksheet('נפרעים לפי פוליסה', {
    views: [{ rightToLeft: true }],
  });

  wsPolicy.addRow(policyHeaders);
  styleHeaderRow(wsPolicy.getRow(1));

  policyRows.forEach((r) => {
    const rowValues = policyHeaders.map((h) => {
      if (h === 'חודש תחילה') {
        return monthStringToDate(r[h]);
      }
      return r[h] ?? '';
    });
    wsPolicy.addRow(rowValues);
  });

  styleDataRows(wsPolicy, policyHeaders.length, {
    firstDataRow: 2,
    dateCols: [7], // "חודש תחילה"
    numericCols: [8], // "נפרעים (MAGIC)"
  });
  autofitColumns(wsPolicy, policyHeaders.length);

  // לשונית 2 – נפרעים לפי מבוטח
  const customerHeaders: string[] = [
    'תז',
    'שם פרטי',
    'שם משפחה',
    'טלפון',
    'סה"כ נפרעים',
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
    numericCols: [5], // "סה"כ נפרעים"
  });
  autofitColumns(wsCustomer, customerHeaders.length);

  const excelBuffer = await wb.xlsx.writeBuffer();
  const buffer = Buffer.isBuffer(excelBuffer)
    ? excelBuffer
    : Buffer.from(excelBuffer as ArrayBuffer);

  return {
    buffer,
    filename: 'סיכום_נפרעים_לפי_לקוח_ופוליסה.xlsx',
    subject: 'סיכום נפרעים לפי פוליסה ולפי מבוטח ממערכת MagicSale',
    description:
      'מצורף דוח המרכז את סכום עמלות הנפרעים לפי פוליסה וגם לפי מבוטח (ת"ז) בעיצוב אחיד.',
  };
}
