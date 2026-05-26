// THIS FILE RUNS ONLY ON SERVER. DO NOT IMPORT FROM CLIENT.
// /app/Reports/generators/generateNifraimFromLoadReport.ts

import { admin } from '@/lib/firebase/firebase-admin';
import ExcelJS from 'exceljs';
import { ReportRequest } from '@/types';

/** -------------------------------------------------- */
/**   Helpers                                          */
/** -------------------------------------------------- */

const canon = (v?: any) => String(v ?? '').trim();

const toYm = (v?: string): string => {
  const s = canon(v);
  if (!s) return '';
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [, mm, yyyy] = s.split('/');
    return `${yyyy}-${mm}`;
  }
  return '';
};

function monthStringToDate(month: string): Date | string {
  if (!month) return '';
  if (!/^\d{4}-\d{2}/.test(month)) return month;
  const year = Number(month.slice(0, 4));
  const monthIdx = Number(month.slice(5, 7)) - 1;
  return new Date(year, monthIdx, 1);
}

/** ---- עיצוב אקסל ---- */

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

// שורת סיכום ראש משפחה – אפור בינוני + bold
function styleFamilyHeadRow(row: ExcelJS.Row, colCount: number) {
  row.height = 18;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'medium', color: { argb: 'FF888888' } },
      left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    };
  }
}

// שורת פירוט בן משפחה – לבן רגיל, מוסתרת תחת ה-grouping
function styleFamilyMemberRow(row: ExcelJS.Row, colCount: number, numericCols: number[]) {
  row.height = 16;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = { size: 10, color: { argb: 'FF444444' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
    cell.alignment = {
      horizontal: numericCols.includes(c) ? 'right' : 'center',
      vertical: 'middle',
    };
    if (numericCols.includes(c)) cell.numFmt = '#,##0.00';
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      left: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      bottom: { style: 'thin', color: { argb: 'FFBFBFBF' } },
      right: { style: 'thin', color: { argb: 'FFBFBFBF' } },
    };
  }
}

function styleDataRows(
  ws: ExcelJS.Worksheet,
  headerCount: number,
  options?: { firstDataRow?: number; numericCols?: number[]; dateCols?: number[] }
) {
  const firstDataRow = options?.firstDataRow ?? 2;
  const numericCols = options?.numericCols ?? [];
  const dateCols = options?.dateCols ?? [];

  for (let rowIdx = firstDataRow; rowIdx <= ws.rowCount; rowIdx++) {
    const row = ws.getRow(rowIdx);
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
      } else if (numericCols.includes(colIdx)) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '#,##0.00';
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      }
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
/**   Main                                             */
/** -------------------------------------------------- */

export async function generateNifraimFromLoadReport(params: ReportRequest) {
  const { agentId, company, fromDate, toDate } = params;
  if (!agentId) throw new Error('נדרש לבחור סוכן');

  const fromYm = toYm(fromDate);
  const toYmVal = toYm(toDate);
  if (!fromYm || !toYmVal) throw new Error('נדרש לבחור טווח חודשים');
  if (fromYm > toYmVal) throw new Error('טווח חודשים לא תקין');

  const selectedCompanies = Array.isArray(company) ? company.map(canon) : [];

  const db = admin.firestore();

  // ── 1. טעינות (policyCommissionSummaries) ──────────────────────────────
  let extQuery: FirebaseFirestore.Query = db
    .collection('policyCommissionSummaries')
    .where('agentId', '==', agentId)
    .where('reportMonth', '>=', fromYm)
    .where('reportMonth', '<=', toYmVal);

  const extSnap = await extQuery.get();

  // ── 2. לקוחות (customer) – לשמות + parentID ───────────────────────────
  const customersSnap = await db
    .collection('customer')
    .where('AgentId', '==', agentId)
    .get();

  // מפה: IDCustomer → doc data
  const customerByIdNumber: Record<string, any> = {};
  // מפה: docId → doc data  (לצורך parentID שהוא docId)
  const customerByDocId: Record<string, any> = {};

  for (const d of customersSnap.docs) {
    const c = d.data() as any;
    customerByDocId[d.id] = { ...c, _docId: d.id };
    if (c.IDCustomer) customerByIdNumber[canon(c.IDCustomer)] = { ...c, _docId: d.id };
  }

  /** -------------------------------------------------- */
  /**   איסוף נתונים                                    */
  /** -------------------------------------------------- */

  // ── לפי פוליסה ─────────────────────────────────────────────────────────
  type PolicyRow = {
    cid: string;
    firstName: string;
    lastName: string;
    company: string;
    policyNumber: string;
    reportMonth: string;
    validMonth: string;
    amount: number;
  };

  const policyRows: PolicyRow[] = [];

  // ── לפי לקוח ───────────────────────────────────────────────────────────
  const byCustomer: Record<
    string,
    { firstName: string; lastName: string; amount: number }
  > = {};

  for (const d of extSnap.docs) {
    const r = d.data() as any;

    const comp = canon(r.company);
    const ym = canon(r.reportMonth);
    const validYm = canon(r.validMonth ?? '');

    if (!ym) continue;
    // סינון כפול (Firestore כבר סינן, אבל על הבטוח)
    if (ym < fromYm || ym > toYmVal) continue;
    if (selectedCompanies.length && !selectedCompanies.includes(comp)) continue;

    const policy = canon(r.policyNumberKey || r.policyNumber || '');
    const cid = canon(r.customerId || r.IDCustomer || '');
    const amount = Number(r.totalCommissionAmount ?? 0);

    // שם – נעדיף מ-customer collection
    let firstName = '';
    let lastName = '';

    const custRecord = customerByIdNumber[cid];
    if (custRecord) {
      firstName = canon(custRecord.firstNameCustomer || '');
      lastName = canon(custRecord.lastNameCustomer || '');
    }
    // fallback מה-policyCommissionSummaries
    if (!firstName && !lastName && r.fullName) {
      const parts = canon(r.fullName).split(' ');
      firstName = parts[0] || '';
      lastName = parts.slice(1).join(' ') || '';
    }

    policyRows.push({ cid, firstName, lastName, company: comp, policyNumber: policy, reportMonth: ym, validMonth: validYm, amount });

    // צבירה לפי לקוח
    if (cid) {
      if (!byCustomer[cid]) byCustomer[cid] = { firstName, lastName, amount: 0 };
      byCustomer[cid].amount += amount;
      if (!byCustomer[cid].firstName && firstName) byCustomer[cid].firstName = firstName;
      if (!byCustomer[cid].lastName && lastName) byCustomer[cid].lastName = lastName;
    }
  }

  // מיון פוליסות
  policyRows.sort(
    (a, b) =>
      a.company.localeCompare(b.company) ||
      a.policyNumber.localeCompare(b.policyNumber) ||
      a.reportMonth.localeCompare(b.reportMonth)
  );

  // ── לפי משפחה ──────────────────────────────────────────────────────────
  // parentID הוא docId של ראש המשפחה
  // ראש משפחה: parentID === _docId שלו

  type FamilyMember = { cid: string; firstName: string; lastName: string; amount: number; isHead: boolean };
  type FamilyGroup = { headCid: string; headFirstName: string; headLastName: string; totalAmount: number; members: FamilyMember[] };

  const familyGroups: Record<string, FamilyGroup> = {}; // key = parentID (docId)

  for (const [cid, info] of Object.entries(byCustomer)) {
    const custRec = customerByIdNumber[cid];
    if (!custRec) continue;

    const docId = custRec._docId;
    const parentID = canon(custRec.parentID || '');

    // אם אין parentID – לקוח לא מקושר למשפחה, מדלגים
    if (!parentID) continue;

    const isHead = parentID === docId;
    const familyKey = parentID; // תמיד ה-docId של הראש

    if (!familyGroups[familyKey]) {
      // ננסה למצוא את שם ראש המשפחה
      const headRec = customerByDocId[familyKey];
      familyGroups[familyKey] = {
        headCid: headRec ? canon(headRec.IDCustomer) : '',
        headFirstName: headRec ? canon(headRec.firstNameCustomer) : '',
        headLastName: headRec ? canon(headRec.lastNameCustomer) : '',
        totalAmount: 0,
        members: [],
      };
    }

    familyGroups[familyKey].totalAmount += info.amount;
    familyGroups[familyKey].members.push({
      cid,
      firstName: info.firstName,
      lastName: info.lastName,
      amount: info.amount,
      isHead,
    });
  }

  // ── Build Excel ─────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  // =====================================================================
  // לשונית 1 – נפרעים לפי לקוח
  // =====================================================================
  const customerHeaders = ['ת"ז', 'שם פרטי', 'שם משפחה', 'סה"כ נפרעים (טעינות)'];

  const wsCustomer = wb.addWorksheet('נפרעים לפי לקוח', {
    views: [{ rightToLeft: true }],
  });
  wsCustomer.addRow(customerHeaders);
  styleHeaderRow(wsCustomer.getRow(1));

  const customerRowsSorted = Object.entries(byCustomer)
    .map(([cid, v]) => ({
      'ת"ז': cid,
      'שם פרטי': v.firstName,
      'שם משפחה': v.lastName,
      'סה"כ נפרעים (טעינות)': Number(v.amount.toFixed(2)),
    }))
    .sort((a, b) => b['סה"כ נפרעים (טעינות)'] - a['סה"כ נפרעים (טעינות)']);

  customerRowsSorted.forEach((r) => {
    wsCustomer.addRow(customerHeaders.map((h) => (r as any)[h] ?? ''));
  });

  styleDataRows(wsCustomer, customerHeaders.length, { firstDataRow: 2, numericCols: [4] });
  autofitColumns(wsCustomer, customerHeaders.length);

  // =====================================================================
  // לשונית 2 – נפרעים לפי פוליסה (שורה לכל reportMonth × פוליסה)
  // =====================================================================
  const policyHeaders = [
    'ת"ז',
    'שם פרטי',
    'שם משפחה',
    'חברה',
    'מס׳ פוליסה',
    'חודש דיווח',
    'חודש תחילה',
    'נפרעים (טעינות)',
  ];

  const wsPolicy = wb.addWorksheet('נפרעים לפי פוליסה', {
    views: [{ rightToLeft: true }],
  });
  wsPolicy.addRow(policyHeaders);
  styleHeaderRow(wsPolicy.getRow(1));

  policyRows.forEach((r) => {
    wsPolicy.addRow([
      r.cid,
      r.firstName,
      r.lastName,
      r.company,
      r.policyNumber,
      r.reportMonth,  // מחרוזת YYYY-MM ישירות – בלי המרה ל-Date
      r.validMonth,   // מחרוזת YYYY-MM ישירות
      Number(r.amount.toFixed(2)),
    ]);
  });

  styleDataRows(wsPolicy, policyHeaders.length, {
    firstDataRow: 2,
    numericCols: [8],  // הסרנו dateCols – עמודות החודש נשארות טקסט
  });
  autofitColumns(wsPolicy, policyHeaders.length);

  // =====================================================================
  // לשונית 3 – נפרעים לפי משפחה
  // =====================================================================
  const familyHeaders = ['ת"ז', 'שם פרטי', 'שם משפחה', 'סטטוס', 'נפרעים (טעינות)'];
  const FAMILY_NUMERIC_COLS = [5];

  const wsFamily = wb.addWorksheet('נפרעים לפי משפחה', {
    views: [{ rightToLeft: true }],
  });
  wsFamily.addRow(familyHeaders);
  styleHeaderRow(wsFamily.getRow(1));

  // מיון: ראשי משפחה לפי סה"כ יורד
  const sortedFamilies = Object.values(familyGroups).sort(
    (a, b) => b.totalAmount - a.totalAmount
  );


  for (const family of sortedFamilies) {
    // שורות פירוט – כל בן משפחה בנפרד (כולל ראש המשפחה)
    const membersSorted = [...family.members].sort((a, b) =>
      a.cid.localeCompare(b.cid)
    );

    for (const member of membersSorted) {
      const label = member.isHead ? 'ראש משפחה' : 'בן/בת משפחה';
      const firstName = member.isHead ? member.firstName : `    ↳ ${member.firstName}`;
      const memberRow = wsFamily.addRow([
        member.cid,
        firstName,
        member.lastName,
        label,
        Number(member.amount.toFixed(2)),
      ]);
      styleFamilyMemberRow(memberRow, familyHeaders.length, FAMILY_NUMERIC_COLS);
    }

    // שורת סיכום משפחה – אפור + bold, בסוף הקבוצה
    const summaryRow = wsFamily.addRow([
      'סה"כ משפחה',
      family.headFirstName,
      family.headLastName,
      '',
      Number(family.totalAmount.toFixed(2)),
    ]);
    styleFamilyHeadRow(summaryRow, familyHeaders.length);
    summaryRow.getCell(5).numFmt = '#,##0.00';

    // שורה ריקה מפרידה בין משפחות
    wsFamily.addRow(['', '', '', '', '']);
  }

  // אם אין נתוני משפחה
  if (sortedFamilies.length === 0) {
    const emptyRow = wsFamily.addRow(['אין מבוטחים מקושרים למשפחה בטווח זה', '', '', '', '']);
    emptyRow.getCell(1).alignment = { horizontal: 'center' };
  }

  autofitColumns(wsFamily, familyHeaders.length);

  /** -------------------------------------------------- */
  const excelBuffer = await wb.xlsx.writeBuffer();
  const buffer = Buffer.isBuffer(excelBuffer)
    ? excelBuffer
    : Buffer.from(excelBuffer as ArrayBuffer);

  return {
    buffer,
    filename: `דוח_נפרעים_מטעינות_${fromYm}_עד_${toYmVal}.xlsx`,
    subject: 'דוח נפרעים מטעינות – לקוח / פוליסה / משפחה',
    description:
      'דוח נפרעים מבוסס טעינות קבצים לפי לקוח, לפי פוליסה (שורה לכל חודש דיווח) ולפי משפחה.',
  };
}
