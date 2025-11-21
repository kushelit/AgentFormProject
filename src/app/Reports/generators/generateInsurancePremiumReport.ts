// app/Reports/generators/generateInsurancePremiumReport.ts  ✅ SERVER ONLY
import { admin } from '@/lib/firebase/firebase-admin';
import ExcelJS from 'exceljs';
import { ReportRequest } from '@/types';

export async function generateInsurancePremiumSummaryReport(params: ReportRequest) {
  const { fromDate, toDate, agentId, company, product, statusPolicy, minuySochen } = params;

  const db = admin.firestore();

  /* --------------------- 1) מוצרים בקבוצת ביטוח --------------------- */

  const productsSnap = await db
    .collection('product')
    .where('productGroup', '==', '3')
    .get();

  const insuranceProductNames = productsSnap.docs
    .map(d => String((d.data() as any).productName ?? '').trim())
    .filter(Boolean);

  const cleanedAgentId = agentId?.trim();
  const cleanedProducts = Array.isArray(product) ? product.map(p => p.trim()) : [];
  const cleanedCompanies = Array.isArray(company) ? company.map(c => c.trim()) : [];

  /* --------------------- 2) שאילתת sales --------------------- */

  let salesRef: FirebaseFirestore.Query = db.collection('sales');

  if (cleanedAgentId && cleanedAgentId !== 'all') {
    salesRef = salesRef.where('AgentId', '==', cleanedAgentId);
  }
  if (fromDate) salesRef = salesRef.where('mounth', '>=', fromDate);
  if (toDate)   salesRef = salesRef.where('mounth', '<=', toDate);

  const salesSnap = await salesRef.get();

  /* --------------------- 3) סינון נוסף --------------------- */

  const filtered = salesSnap.docs
    .map(d => d.data() as any)
    .filter(row => {
      if (!row.IDCustomer) return false;
      if (!insuranceProductNames.includes(String(row.product ?? '').trim())) return false;

      if (cleanedCompanies.length && !cleanedCompanies.includes(String(row.company ?? '').trim())) return false;
      if (cleanedProducts.length && !cleanedProducts.includes(String(row.product ?? '').trim())) return false;

      if (Array.isArray(statusPolicy) && statusPolicy.length > 0 && !statusPolicy.includes(row.statusPolicy)) return false;

      if (typeof minuySochen === 'boolean' && row.minuySochen !== minuySochen) return false;

      return true;
    });

  /* --------------------- 4) צבירת פרמיות --------------------- */

  const premiaByCustomer: Record<string, number> = {};
  const customerInfoMap: Record<string, { firstName: string; lastName: string }> = {};

  for (const row of filtered) {
    const id = row.IDCustomer;
    const premia = Number(row.insPremia || 0);

    premiaByCustomer[id] = (premiaByCustomer[id] || 0) + premia;

    if (!customerInfoMap[id]) {
      customerInfoMap[id] = {
        firstName: row.firstNameCustomer || '',
        lastName: row.lastNameCustomer || '',
      };
    }
  }

  /* --------------------- 5) טלפונים מטבלת customer --------------------- */

  const phoneMap: Record<string, string> = {};
  const customerIds = new Set(Object.keys(premiaByCustomer));

  if (cleanedAgentId && cleanedAgentId !== 'all') {
    const custSnap = await db
      .collection('customer')
      .where('AgentId', '==', cleanedAgentId)
      .get();

    for (const doc of custSnap.docs) {
      const c = doc.data() as any;
      const id = c.IDCustomer;
      if (id && customerIds.has(id)) phoneMap[id] = c.phone || '';
    }
  } else {
    const custSnap = await db.collection('customer').get();
    for (const doc of custSnap.docs) {
      const c = doc.data() as any;
      const id = c.IDCustomer;
      if (id && customerIds.has(id)) phoneMap[id] = c.phone || '';
    }
  }

  /* --------------------- 6) יצירת שורות לדוח --------------------- */

  const rows = Object.entries(premiaByCustomer).map(([id, sumPremia]) => {
    const info = customerInfoMap[id] ?? { firstName: '', lastName: '' };
    const phone = phoneMap[id] || '';

    return {
      'תז': id,
      'שם פרטי': info.firstName,
      'שם משפחה': info.lastName,
      'טלפון': phone,
      'סה"כ פרמיה': Number(sumPremia.toFixed(2)),
    };
  });

  rows.sort((a, b) => b['סה"כ פרמיה'] - a['סה"כ פרמיה']);

  return await buildExcelReport(rows, 'סיכום פרמיה לפי לקוח');
}

/* ====================================================================== */
/* ===============   עיצוב EXCEL אחיד (exceljs)   ======================== */
/* ====================================================================== */

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

function styleDataRows(
  ws: ExcelJS.Worksheet,
  headerCount: number,
  options: { firstDataRow?: number; numericCols?: number[] } = {}
) {
  const { firstDataRow = 2, numericCols = [] } = options;

  for (let rowIdx = firstDataRow; rowIdx <= ws.rowCount; rowIdx++) {
    const row = ws.getRow(rowIdx);

    if (rowIdx % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
      });
    }

    for (let col = 1; col <= headerCount; col++) {
      const cell = row.getCell(col);

      if (numericCols.includes(col)) {
        cell.numFmt = '#,##0.00';
        cell.alignment = { horizontal: 'right' };
      } else {
        cell.alignment = { horizontal: 'center' };
      }
    }
  }
}

function autofitColumns(ws: ExcelJS.Worksheet, count: number) {
  for (let i = 1; i <= count; i++) {
    let max = 10;

    ws.eachRow((row) => {
      const cell = row.getCell(i);
      if (!cell.value) return;

      const len = String(cell.value).length;
      if (len > max) max = len;
    });

    ws.getColumn(i).width = Math.min(max + 2, 40);
  }
}

async function buildExcelReport(rows: any[], sheetName: string) {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();

  const headers = ['תז', 'שם פרטי', 'שם משפחה', 'טלפון', 'סה"כ פרמיה'];

  const ws = wb.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });

  ws.addRow(headers);
  styleHeaderRow(ws.getRow(1));

  if (rows.length === 0) {
    ws.addRow(['', '', '', '', '']);
  } else {
    rows.forEach((r) => {
      ws.addRow(headers.map((h) => r[h] ?? ''));
    });
  }

  styleDataRows(ws, headers.length, {
    firstDataRow: 2,
    numericCols: [5], // סה"כ פרמיה
  });

  autofitColumns(ws, headers.length);

  const excelBuffer = await wb.xlsx.writeBuffer();

  return {
    buffer: Buffer.from(excelBuffer),
    filename: 'סיכום_פרמיה_לפי_לקוח.xlsx',
    subject: 'סיכום פרמיה ללקוחות ממערכת MagicSale',
    description: 'דוח Excel מעוצב המסכם את סך הפרמיות ללקוח.',
  };
}
