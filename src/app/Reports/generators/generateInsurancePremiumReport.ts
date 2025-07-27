import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { ReportRequest } from '@/types';

export async function generateInsurancePremiumReport(params: ReportRequest) {
  const { fromDate, toDate, agentId, company, product } = params;

  // שלב 1: שליפת שמות המוצרים ששייכים לקבוצת ביטוח בלבד (productGroup === '3')
  const productsSnapshot = await getDocs(
    query(collection(db, 'product'), where('productGroup', '==', '3'))
  );
  const insuranceProductNames = productsSnapshot.docs.map(doc =>
    doc.data().productName?.trim()
  );

  const cleanedAgentId = agentId?.trim();
  const cleanedProducts = Array.isArray(product)
    ? product.map(p => p.trim())
    : [];
  const cleanedCompanies = Array.isArray(company)
    ? company.map(c => c.trim())
    : [];

  // סינון מוצר – אם נבחר מוצר שלא שייך לקבוצת ביטוח → החזר דוח ריק
  if (
    cleanedProducts.length > 0 &&
    !cleanedProducts.some(p => insuranceProductNames.includes(p))
  ) {
    console.log(`🚫 המוצרים שבחרת אינם שייכים לקבוצת ביטוח - הדוח יהיה ריק.`);
    return generateEmptyReport();
  }

  // שלב 2: שליפת כל המכירות
  const salesSnapshot = await getDocs(collection(db, 'sales'));
  let filtered = salesSnapshot.docs.map(doc => doc.data());

  // סינון לפי סטטוס פוליסה
  filtered = filtered.filter(row =>
    ['פעילה', 'הצעה'].includes(row.statusPolicy)
  );

  // סינון לפי קבוצת מוצר ביטוח בלבד
  filtered = filtered.filter(row =>
    insuranceProductNames.includes(row.product)
  );

  // סינון לפי תאריכים
  if (fromDate) {
    filtered = filtered.filter(row => row.mounth && row.mounth >= fromDate);
  }
  if (toDate) {
    filtered = filtered.filter(row => row.mounth && row.mounth <= toDate);
  }

  // סינון לפי סוכן
  if (cleanedAgentId && cleanedAgentId !== 'all') {
    filtered = filtered.filter(row => row.AgentId === cleanedAgentId);
  }

  // סינון לפי חברות
  if (cleanedCompanies.length > 0) {
    filtered = filtered.filter(row => cleanedCompanies.includes(row.company));
  }

  // סינון לפי מוצרים
  if (cleanedProducts.length > 0) {
    filtered = filtered.filter(row => cleanedProducts.includes(row.product));
  }

  // בניית שורות לדוח
  const rows = filtered.map(row => ({
    "שם פרטי": row.firstNameCustomer || '',
    "שם משפחה": row.lastNameCustomer || '',
    "תז": row.IDCustomer || '',
    "חברה": row.company || '',
    "מוצר": row.product || '',
    "סטטוס": row.statusPolicy || '',
    "פרמיה": row.insPremia || 0,
    "סוכן": row.agent || '',
    "חודש תפוקה": row.mounth || '',
  }));

  rows.sort((a, b) => (a["תז"] || '').localeCompare(b["תז"] || ''));
  return buildExcelReport(rows, 'פרמיית ביטוח');
}

// פונקציית עזר ליצירת דוח ריק
function generateEmptyReport() {
  return buildExcelReport([], 'פרמיית ביטוח');
}

// פונקציית עזר לבניית קובץ Excel
function buildExcelReport(rows: any[], sheetName: string) {
  const worksheet = XLSX.utils.json_to_sheet(
    rows.length
      ? rows
      : [{
          "שם פרטי": '',
          "שם משפחה": '',
          "תז": '',
          "חברה": '',
          "מוצר": '',
          "סטטוס": '',
          "פרמיה": '',
          "סוכן": '',
          "חודש תפוקה": '',
        }]
  );
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  return {
    buffer,
    filename: 'דוח_פרמיית_ביטוח.xlsx',
    subject: 'דוח פרמיית ביטוח ללקוח ממערכת MagicSale',
    description: 'מצורף דוח Excel של פוליסות ביטוח לפי סטטוס וקבוצת מוצר.',
  };
}
