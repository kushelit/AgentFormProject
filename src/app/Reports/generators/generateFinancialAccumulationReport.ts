// app/Reports/generators/generateFinancialAccumulationReport.ts  ✅ SERVER ONLY
import { admin } from '@/lib/firebase/firebase-admin';
import * as XLSX from 'xlsx';
import { ReportRequest } from '@/types';

export async function generateFinancialAccumulationReport(params: ReportRequest) {
  const { fromDate, toDate, agentId, company, product, statusPolicy, minuySochen } = params;

  const db = admin.firestore();

  // 1) שליפת מוצרי קבוצה "פיננסים" (ודאי שם קולקציה: 'product' או 'products')
  const productsSnap = await db
    .collection('product')              // ← אם אצלך זה 'products', החליפי כאן ובכל הקוד
    .where('productGroup', '==', '4')
    .get();

  const financialProductNames = productsSnap.docs
    .map(d => String((d.data() as any).productName || '').trim())
    .filter(Boolean);

  const cleanedAgentId = agentId?.trim();
  const cleanedProducts = Array.isArray(product) ? product.map(p => p.trim()) : [];
  const cleanedCompanies = Array.isArray(company) ? company.map(c => c.trim()) : [];

  // 2) שליפת מכירות — עדיף לצמצם כבר ב-query כשאפשר
  let salesRef: FirebaseFirestore.Query = db.collection('sales');

  if (cleanedAgentId && cleanedAgentId !== 'all') {
    salesRef = salesRef.where('AgentId', '==', cleanedAgentId);
  }
  // אם mounth נשמר כ-YYYY-MM או YYYY-MM-DD (מחרוזת ISO) אפשר סינון לקסיקוגרפי:
  if (fromDate) salesRef = salesRef.where('mounth', '>=', fromDate);
  if (toDate)   salesRef = salesRef.where('mounth', '<=', toDate);

  const salesSnap = await salesRef.get();
  const sales = salesSnap.docs.map(d => d.data() as any);

  // 3) סינון מקומי (למה שלא ניתן לסנן ב-query עצמו)
  const filtered = sales.filter((row) => {
    if (!row.IDCustomer) return false;
    if (!financialProductNames.includes((row.product || '').trim())) return false;

    if (cleanedCompanies.length > 0 && !cleanedCompanies.includes((row.company || '').trim())) return false;
    if (cleanedProducts.length > 0 && !cleanedProducts.includes((row.product || '').trim())) return false;

    if (Array.isArray(statusPolicy) && statusPolicy.length > 0 && !statusPolicy.includes(row.statusPolicy)) return false;
    if (typeof minuySochen === 'boolean' && row.minuySochen !== minuySochen) return false;

    return true;
  });

  // 4) קיבוץ לפי ת"ז וצבירה פיננסית
  const accumulationByCustomer: Record<string, number> = {};
  const customerInfoMap: Record<string, { firstName: string; lastName: string }> = {};

  for (const row of filtered) {
    const id = row.IDCustomer;
    const accumulation = Number(row.finansimZvira || 0);

    accumulationByCustomer[id] = (accumulationByCustomer[id] || 0) + accumulation;

    if (!customerInfoMap[id]) {
      customerInfoMap[id] = {
        firstName: row.firstNameCustomer || '',
        lastName: row.lastNameCustomer || '',
      };
    }
  }

  // 5) שליפת טלפונים מטבלת customer (מסונן לפי AgentId)
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
    // אם בחרת "כל הסוכנות" – נשלוף כל הלקוחות ואז נסנן מקומית (אפשר גם לפצל לשאילתות לפי חברות/agentId אם יש הרבה)
    const custSnap = await db.collection('customer').get();
    for (const doc of custSnap.docs) {
      const c = doc.data() as any;
      const id = c.IDCustomer;
      if (id && customerIds.has(id)) {
        phoneMap[id] = c.phone || '';
      }
    }
  }

  // 6) בניית שורות ל-Excel
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

  return buildExcelReport(rows, 'סיכום צבירה פיננסית לפי לקוח');
}

// יצירת Excel
function buildExcelReport(rows: any[], sheetName: string) {
  const worksheet = XLSX.utils.json_to_sheet(
    rows.length
      ? rows
      : [{
          'תז': '',
          'שם פרטי': '',
          'שם משפחה': '',
          'טלפון': '',
          'סה"כ צבירה פיננסית': '',
        }]
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  return {
    buffer: buffer as Buffer,
    filename: 'סיכום_צבירה_פיננסית_לפי_לקוח.xlsx',
    subject: 'סיכום צבירה פיננסית ללקוחות ממערכת MagicSale',
    description: 'מצורף דוח Excel המסכם את סך הצבירה הפיננסית לפי לקוח.',
  };
}
