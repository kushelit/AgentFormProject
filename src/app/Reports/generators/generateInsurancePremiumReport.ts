// app/Reports/generators/generateInsurancePremiumReport.ts  ✅ SERVER ONLY
import { admin } from '@/lib/firebase/firebase-admin';
import * as XLSX from 'xlsx';
import { ReportRequest } from '@/types';

export async function generateInsurancePremiumSummaryReport(params: ReportRequest) {
  const { fromDate, toDate, agentId, company, product, statusPolicy, minuySochen } = params;

  const db = admin.firestore();

  // 1) מוצרים בקבוצת "ביטוח" (: 'product' או 'products' – ליישר בכל הקוד)
  const productsSnap = await db
    .collection('product')             
    .where('productGroup', '==', '3')
    .get();

  const insuranceProductNames = productsSnap.docs
    .map(d => String(((d.data() as any).productName) ?? '').trim())
    .filter(Boolean);

  const cleanedAgentId = agentId?.trim();
  const cleanedProducts = Array.isArray(product) ? product.map(p => p.trim()) : [];
  const cleanedCompanies = Array.isArray(company) ? company.map(c => c.trim()) : [];

  // 2) שליפת מכירות — מצמצמים כבר ב־query אם אפשר
  let salesRef: FirebaseFirestore.Query = db.collection('sales');
  if (cleanedAgentId && cleanedAgentId !== 'all') {
    salesRef = salesRef.where('AgentId', '==', cleanedAgentId);
  }
  // אם mounth נשמר כמחרוזת ISO (YYYY-MM / YYYY-MM-DD) – הסינון הלקסיקוגרפי תקין:
  if (fromDate) salesRef = salesRef.where('mounth', '>=', fromDate);
  if (toDate)   salesRef = salesRef.where('mounth', '<=', toDate);

  const salesSnap = await salesRef.get();

  // 3) סינון לוגי נוסף (שלא ניתן ב-query)
  const filtered = salesSnap.docs
    .map(d => d.data() as any)
    .filter(row => {
      if (!row.IDCustomer) return false;
      if (!insuranceProductNames.includes(String(row.product ?? '').trim())) return false;

      if (cleanedCompanies.length > 0 && !cleanedCompanies.includes(String(row.company ?? '').trim())) return false;
      if (cleanedProducts.length > 0 && !cleanedProducts.includes(String(row.product ?? '').trim())) return false;

      if (Array.isArray(statusPolicy) && statusPolicy.length > 0 && !statusPolicy.includes(row.statusPolicy)) return false;
      if (typeof minuySochen === 'boolean' && row.minuySochen !== minuySochen) return false;

      return true;
    });

  // 4) צבירת פרמיות ופרטי לקוח
  const premiaByCustomer: Record<string, number> = {};
  const customerInfoMap: Record<string, { firstName: string; lastName: string }> = {};

  for (const row of filtered) {
    const id = row.IDCustomer as string;
    const premia = Number(row.insPremia || 0);

    premiaByCustomer[id] = (premiaByCustomer[id] || 0) + premia;

    if (!customerInfoMap[id]) {
      customerInfoMap[id] = {
        firstName: row.firstNameCustomer || '',
        lastName: row.lastNameCustomer || '',
      };
    }
  }

  // 5) טלפונים מטבלת customer (מסונן לפי AgentId כשנבחר סוכן ספציפי)
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
    // "כל הסוכנות" — נשלוף הכל ואז נסנן (אפשר לשפר בעתיד לפי מבנה הנתונים)
    const custSnap = await db.collection('customer').get();
    for (const doc of custSnap.docs) {
      const c = doc.data() as any;
      const id = c.IDCustomer;
      if (id && customerIds.has(id)) phoneMap[id] = c.phone || '';
    }
  }

  // 6) בניית שורות לאקסל
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

  return buildExcelReport(rows, 'סיכום פרמיה לפי לקוח');
}

// דוח ריק (לשמירת API קיים)
function generateEmptyReport() {
  return buildExcelReport([], 'סיכום פרמיה לפי לקוח');
}

function buildExcelReport(rows: any[], sheetName: string) {
  const worksheet = XLSX.utils.json_to_sheet(
    rows.length
      ? rows
      : [{
          'תז': '',
          'שם פרטי': '',
          'שם משפחה': '',
          'טלפון': '',
          'סה"כ פרמיה': '',
        }]
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  return {
    buffer: buffer as Buffer,
    filename: 'סיכום_פרמיה_לפי_לקוח.xlsx',
    subject: 'סיכום פרמיה ללקוחות ממערכת MagicSale',
    description: 'מצורף דוח Excel המסכם את סך הפרמיות ללקוח מתוך כל הפוליסות.',
  };
}
