// ✅ שרת בלבד — אין שימוש ב-Client SDK
import { admin } from '@/lib/firebase/firebase-admin';
import * as XLSX from 'xlsx';
import { ReportRequest } from '@/types';
import { calculateCommissions } from '@/utils/commissionCalculations';
// import { fetchContractsByAgent } from '@/services/fetchContracts';
import { fetchContractsByAgent } from '@/services/server/fetchContracts';
// import { fetchCommissionSplits } from '@/services/commissionService';
import { fetchCommissionSplits } from '@/services/server/commissionService';
// import { getProductMap } from '@/services/productService';
import { getProductMap } from '@/services/server/productService';


export async function generateClientNifraimSummaryReport(params: ReportRequest) {
  const { agentId, product, company, fromDate, toDate } = params;
  if (!agentId) throw new Error("נדרש לבחור סוכן");

  const db = admin.firestore();

  // 🔎 sales - Admin SDK query
  const salesSnapshot = await db
    .collection('sales')
    .where('AgentId', '==', agentId)
    .get();

  const contracts = await fetchContractsByAgent(agentId);       // ודאי שגם הפונקציות האלו משתמשות ב-Admin SDK
  const splits = await fetchCommissionSplits(agentId);          // (אם בשימוש בפועל בגנרטור הזה)
  const productMap = await getProductMap();                     // כנ״ל

  const cleanedProducts = Array.isArray(product) ? product.map(p => p.trim()) : [];
  const cleanedCompanies = Array.isArray(company) ? company.map(c => c.trim()) : [];

  const nifraimByCustomer: Record<string, number> = {};
  const customerInfoMap: Record<string, { firstName: string; lastName: string }> = {};

  for (const doc of salesSnapshot.docs) {
    const raw = doc.data() as any;

    if (fromDate && raw.mounth < fromDate) continue;
    if (toDate && raw.mounth > toDate) continue;
    if (cleanedCompanies.length > 0 && !cleanedCompanies.includes((raw.company ?? '').trim())) continue;
    if (cleanedProducts.length > 0 && !cleanedProducts.includes((raw.product ?? '').trim())) continue;

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
        (c.minuySochen === sale.minuySochen || (!c.minuySochen && !sale.minuySochen))
    );

    const commissions = calculateCommissions(sale, contractMatch, contracts, productMap, agentId);

    if (!nifraimByCustomer[customerId]) nifraimByCustomer[customerId] = 0;
    nifraimByCustomer[customerId] += commissions.commissionNifraim || 0;

    if (!customerInfoMap[customerId]) {
      customerInfoMap[customerId] = {
        firstName: sale.firstNameCustomer,
        lastName: sale.lastNameCustomer,
      };
    }
  }

  // 🔎 customer - Admin SDK query
  const customerSnapshot = await db
    .collection('customer')
    .where('AgentId', '==', agentId)
    .get();

  const customerIds = new Set(Object.keys(nifraimByCustomer));
  const phoneMap: Record<string, string> = {};

  for (const doc of customerSnapshot.docs) {
    const customer = doc.data() as any;
    const id = customer.IDCustomer;
    if (!id) continue;
    const agentMatch = customer.AgentId === agentId;
    const relevant = customerIds.has(id);

    if (agentMatch && relevant) {
      phoneMap[id] = customer.phone || '';
    }
  }

  const rows = Object.entries(nifraimByCustomer).map(([id, sumNifraim]) => {
    const info = customerInfoMap[id] || {};
    const phone = phoneMap[id] || '';

    return {
      'תז': id,
      'שם פרטי': info.firstName || '',
      'שם משפחה': info.lastName || '',
      'טלפון': phone,
      'סה"כ נפרעים': Number(sumNifraim.toFixed(2)),
    };
  });

  rows.sort((a, b) => b['סה"כ נפרעים'] - a['סה"כ נפרעים']);

  return buildExcelReport(rows, 'סיכום נפרעים לפי לקוח');
}

function buildExcelReport(rows: any[], sheetName: string) {
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  return {
    buffer: buffer as Buffer,
    filename: 'סיכום_נפרעים_לפי_לקוח.xlsx',
    subject: 'סיכום נפרעים ללקוחות ממערכת MagicSale',
    description: 'מצורף דוח המרכז את סכום העמלות נפרעים ללקוח מתוך כל הפוליסות',
  };
}
