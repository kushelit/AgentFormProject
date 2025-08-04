import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { ReportRequest } from '@/types';

export async function generateFinancialAccumulationReport(params: ReportRequest) {
  const { fromDate, toDate, agentId, company, product, statusPolicy, minuySochen } = params;

  // שלב 1: שליפת שמות המוצרים מקבוצת פיננסים
  const productsSnapshot = await getDocs(
    query(collection(db, 'product'), where('productGroup', '==', '4'))
  );
  const financialProductNames = productsSnapshot.docs.map(doc =>
    doc.data().productName?.trim()
  );

  const cleanedAgentId = agentId?.trim();
  const cleanedProducts = Array.isArray(product) ? product.map(p => p.trim()) : [];
  const cleanedCompanies = Array.isArray(company) ? company.map(c => c.trim()) : [];

  // שלב 2: שליפת כל המכירות
  const salesSnapshot = await getDocs(collection(db, 'sales'));
  const sales = salesSnapshot.docs.map(doc => doc.data());

  // סינון לפי כל התנאים
  const filtered = sales.filter((row) => {
    if (!row.IDCustomer) return false;
    if (!financialProductNames.includes(row.product)) return false;
    if (fromDate && row.mounth < fromDate) return false;
    if (toDate && row.mounth > toDate) return false;
    if (cleanedAgentId && cleanedAgentId !== 'all' && row.AgentId !== cleanedAgentId) return false;
    if (cleanedCompanies.length > 0 && !cleanedCompanies.includes(row.company)) return false;
    if (cleanedProducts.length > 0 && !cleanedProducts.includes(row.product)) return false;
    if (Array.isArray(statusPolicy) && statusPolicy.length > 0 && !statusPolicy.includes(row.statusPolicy)) return false;
    if (typeof minuySochen === 'boolean' && row.minuySochen !== minuySochen) return false;
    return true;
  });

  // שלב 3: קיבוץ לפי ת"ז וצבירה פיננסית
  const accumulationByCustomer: Record<string, number> = {};
  const customerInfoMap: Record<string, { firstName: string; lastName: string }> = {};

  for (const row of filtered) {
    const customerId = row.IDCustomer;
    const accumulation = Number(row.finansimZvira || 0);

    if (!accumulationByCustomer[customerId]) accumulationByCustomer[customerId] = 0;
    accumulationByCustomer[customerId] += accumulation;

    if (!customerInfoMap[customerId]) {
      customerInfoMap[customerId] = {
        firstName: row.firstNameCustomer || '',
        lastName: row.lastNameCustomer || '',
      };
    }
  }

  // שלב 4: שליפת טלפונים מטבלת customer
  const customerIds = new Set(Object.keys(accumulationByCustomer));
  const phoneMap: Record<string, string> = {};

  const customerQuery = query(
    collection(db, 'customer'),
    where('AgentId', '==', cleanedAgentId)
  );
  const customerSnapshot = await getDocs(customerQuery);

  for (const doc of customerSnapshot.docs) {
    const customer = doc.data();
    const id = customer.IDCustomer;
    const agentMatch = customer.AgentId === cleanedAgentId;
    const relevant = customerIds.has(id);

    if (!id) continue;

    if (agentMatch && relevant) {
      phoneMap[id] = customer.phone || '';
    }
  }

  // שלב 5: בניית שורות ל־Excel
  const rows = Object.entries(accumulationByCustomer).map(([id, sum]) => {
    const info = customerInfoMap[id] || {};
    const phone = phoneMap[id] || '';
    return {
      "תז": id,
      "שם פרטי": info.firstName,
      "שם משפחה": info.lastName,
      "טלפון": phone,
      "סה\"כ צבירה פיננסית": Number(sum.toFixed(2)),
    };
  });
  rows.sort((a, b) => b["סה\"כ צבירה פיננסית"] - a["סה\"כ צבירה פיננסית"]);

  return buildExcelReport(rows, 'סיכום צבירה פיננסית לפי לקוח');
}

// יצירת Excel
function buildExcelReport(rows: any[], sheetName: string) {
  const worksheet = XLSX.utils.json_to_sheet(
    rows.length ? rows : [{
      "תז": '',
      "שם פרטי": '',
      "שם משפחה": '',
      "טלפון": '',
      "סה\"כ צבירה פיננסית": '',
    }]
  );

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  return {
    buffer,
    filename: 'סיכום_צבירה_פיננסית_לפי_לקוח.xlsx',
    subject: 'סיכום צבירה פיננסית ללקוחות ממערכת MagicSale',
    description: 'מצורף דוח Excel המסכם את סך הצבירה הפיננסית לפי לקוח.',
  };
}
