// app/Reports/generators/generateFinancialAccumulationReport.ts  ✅ SERVER ONLY
import { admin } from '@/lib/firebase/firebase-admin';
import ExcelJS from 'exceljs';
import { ReportRequest } from '@/types';

export async function generateFinancialAccumulationReport(
  params: ReportRequest
) {
  const {
    fromDate,
    toDate,
    agentId,
    company,
    product,
    statusPolicy,
    minuySochen,
  } = params;

  const db = admin.firestore();

  // 1) שליפת מוצרי קבוצה "פיננסים"
  const productsSnap = await db
    .collection('product') // אם זה 'products' אצלך, להחליף כאן
    .where('productGroup', '==', '4')
    .get();

  const financialProductNames = productsSnap.docs
    .map((d) => String((d.data() as any).productName || '').trim())
    .filter(Boolean);

  const cleanedAgentId = agentId?.trim();
  const cleanedProducts = Array.isArray(product)
    ? product.map((p) => p.trim())
    : [];
  const cleanedCompanies = Array.isArray(company)
    ? company.map((c) => c.trim())
    : [];

  // 2) שליפת מכירות
  let salesRef: FirebaseFirestore.Query = db.collection('sales');

  if (cleanedAgentId && cleanedAgentId !== 'all') {
    salesRef = salesRef.where('AgentId', '==', cleanedAgentId);
  }
  if (fromDate) salesRef = salesRef.where('mounth', '>=', fromDate);
  if (toDate) salesRef = salesRef.where('mounth', '<=', toDate);

  const salesSnap = await salesRef.get();
  const sales = salesSnap.docs.map((d) => d.data() as any);

  // 3) סינון מקומי
  const filtered = sales.filter((row) => {
    if (!row.IDCustomer) return false;
    if (!financialProductNames.includes((row.product || '').trim()))
      return false;

    if (
      cleanedCompanies.length > 0 &&
      !cleanedCompanies.includes((row.company || '').trim())
    )
      return false;

    if (
      cleanedProducts.length > 0 &&
      !cleanedProducts.includes((row.product || '').trim())
    )
      return false;

    if (
      Array.isArray(statusPolicy) &&
      statusPolicy.length > 0 &&
      !statusPolicy.includes(row.statusPolicy)
    )
      return false;

    if (typeof minuySochen === 'boolean' && row.minuySochen !== minuySochen)
      return false;

    return true;
  });

  // 4) קיבוץ לפי ת"ז וצבירה פיננסית
  const accumulationByCustomer: Record<string, number> = {};
  const customerInfoMap: Record<
    string,
    { firstName: string; lastName: string }
  > = {};

  for (const row of filtered) {
    const id = row.IDCustomer;
    const accumulation = Number(row.finansimZvira || 0);

    accumulationByCustomer[id] =
      (accumulationByCustomer[id] || 0) + accumulation;

    if (!customerInfoMap[id]) {
      customerInfoMap[id] = {
        firstName: row.firstNameCustomer || '',
        lastName: row.lastNameCustomer || '',
      };
    }
  }

  // 5) טלפונים מטבלת customer
  const phoneMap: Record<string, string> = {};
  const customerIds = new Set(Object.keys(accumulationByCustomer));

  if (cleanedAgentId && cleanedAgentId !== 'all') {
    const custSnap = await db
      .collection('customer')
      .where('AgentId', '==', cleanedAgentId)
      .get();

    for (const doc of custSnap.docs) {
      const c = doc.data() as any;
      const id = c.IDCustomer;
      if (id && customerIds.has(id)) {
        phoneMap[id] = c.phone || '';
      }
    }
  } else {
    const custSnap = await db.collection('customer').get();
    for (const doc of custSnap.docs) {
      const c = doc.data() as any;
      const id = c.IDCustomer;
      if (id && customerIds.has(id)) {
        phoneMap[id] = c.phone || '';
      }
    }
  }

  // 6) בניית שורות לדוח
  const rows = Object.entries(accumulationByCustomer).map(([id, sum]) => {
    const info = customerInfoMap[id] || { firstName: '', lastName: '' };
    const phone = phoneMap[id] || '';
    return {
      'תז': id,
      'שם פרטי': info.firstName,
      'שם משפחה': info.lastName,
      'טלפון': phone,
      'סה"כ צבירה פיננסית': Number(sum.toFixed(2)),
    };
  });

  rows.sort((a, b) => b['סה"כ צבירה פיננסית'] - a['סה"כ צבירה פיננסית']);

  return await buildExcelReport(
    rows,
    'סיכום צבירה פיננסית לפי לקוח'
  );
}

/* ------------ Excel helpers (עיצוב אחיד) ------------ */

// כותרת אפורה
function styleHeaderRow(row: ExcelJS.Row) {
  row.height = 20;
  row.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4D4D4D' },
    };
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
  options: { firstDataRow?: number; numericCols?: number[] } = {}
) {
  const { firstDataRow = 2, numericCols = [] } = options;

  for (let rowIdx = firstDataRow; rowIdx <= ws.rowCount; rowIdx++) {
    const row = ws.getRow(rowIdx);

    // זברה
    if (rowIdx % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF5F5F5' },
        };
      });
    }

    for (let col = 1; col <= headerCount; col++) {
      const cell = row.getCell(col);

      if (numericCols.includes(col)) {
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      } else {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
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

// יצירת Excel עם exceljs
async function buildExcelReport(rows: any[], sheetName: string) {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const headers = [
    'תז',
    'שם פרטי',
    'שם משפחה',
    'טלפון',
    'סה"כ צבירה פיננסית',
  ];

  const ws = wb.addWorksheet(sheetName, {
    views: [{ rightToLeft: true }],
  });

  // כותרת
  ws.addRow(headers);
  styleHeaderRow(ws.getRow(1));

  // נתונים
  if (rows.length === 0) {
    ws.addRow(['', '', '', '', '']);
  } else {
    rows.forEach((r) => {
      const rowValues = headers.map((h) => r[h] ?? '');
      ws.addRow(rowValues);
    });
  }

  styleDataRows(ws, headers.length, {
    firstDataRow: 2,
    numericCols: [5], // סה"כ צבירה פיננסית
  });

  autofitColumns(ws, headers.length);

  const excelBuffer = await wb.xlsx.writeBuffer();
  const buffer = Buffer.isBuffer(excelBuffer)
    ? excelBuffer
    : Buffer.from(excelBuffer as ArrayBuffer);

  return {
    buffer,
    filename: 'סיכום_צבירה_פיננסית_לפי_לקוח.xlsx',
  subject: 'סיכום צבירה פיננסית ללקוחות ממערכת MagicSale',
    description:
      'מצורף דוח Excel המסכם את סך הצבירה הפיננסית לפי לקוח, בעיצוב אחיד.',
  };
}
