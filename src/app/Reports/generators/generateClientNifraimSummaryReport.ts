import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { ReportRequest } from '@/types';
import { calculateCommissions } from '@/utils/commissionCalculations';
import { fetchContractsByAgent } from '@/services/fetchContracts';
import { fetchCommissionSplits } from '@/services/commissionService';
import { getProductMap } from '@/services/productService';

export async function generateClientNifraimSummaryReport(params: ReportRequest) {
  const { agentId, product, company, fromDate, toDate } = params;

  if (!agentId) throw new Error("נדרש לבחור סוכן");

  const salesQuery = query(
    collection(db, 'sales'),
    where('AgentId', '==', agentId),
    // where('statusPolicy', 'in', ['פעילה', 'הצעה'])
  );

  const salesSnapshot = await getDocs(salesQuery);
  const contracts = await fetchContractsByAgent(agentId);
  const splits = await fetchCommissionSplits(agentId);
  const productMap = await getProductMap();

  const cleanedProducts = Array.isArray(product) ? product.map(p => p.trim()) : [];
  const cleanedCompanies = Array.isArray(company) ? company.map(c => c.trim()) : [];

  const nifraimByCustomer: Record<string, number> = {};
  const customerInfoMap: Record<string, { firstName: string; lastName: string }> = {};

  for (const doc of salesSnapshot.docs) {
    const raw = doc.data();

    if (fromDate && raw.mounth < fromDate) continue;
    if (toDate && raw.mounth > toDate) continue;
    if (cleanedCompanies.length > 0 && !cleanedCompanies.includes(raw.company?.trim())) continue;
    if (cleanedProducts.length > 0 && !cleanedProducts.includes(raw.product?.trim())) continue;

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
      (contract) =>
        contract.AgentId === agentId &&
        contract.product === sale.product &&
        contract.company === sale.company &&
        (contract.minuySochen === sale.minuySochen || (!contract.minuySochen && !sale.minuySochen))
    );

    const commissions = calculateCommissions(
      sale,
      contractMatch,
      contracts,
      productMap,
      agentId
    );

    if (!nifraimByCustomer[customerId]) nifraimByCustomer[customerId] = 0;
    nifraimByCustomer[customerId] += commissions.commissionNifraim || 0;

    if (!customerInfoMap[customerId]) {
      customerInfoMap[customerId] = {
        firstName: sale.firstNameCustomer,
        lastName: sale.lastNameCustomer,
      };
    }
  }

  // שליפת טלפונים מטבלת customer
  const customerIds = new Set(Object.keys(nifraimByCustomer));
  const phoneMap: Record<string, string> = {};

  const customerQuery = query(
    collection(db, 'customer'),
    where('AgentId', '==', agentId)
  );
  const customerSnapshot = await getDocs(customerQuery);
  console.log('📋 בדיקת לקוחות מטבלת customer:');
for (const doc of customerSnapshot.docs) {
  const customer = doc.data();
  const id = customer.IDCustomer;
  const agentMatch = customer.AgentId === agentId;
  const relevant = customerIds.has(id);

  if (!id) continue;

  console.log(`👁 ת"ז: ${id} | AgentId=${customer.AgentId} | מתאים לסוכן? ${agentMatch} | מופיע ב-nifraim? ${relevant}`);

  if (agentMatch && relevant) {
    phoneMap[id] = customer.phone || '';
    console.log(`✅ טלפון נשמר: ${customer.phone}`);
  }
}
console.log('📋 סיום בדיקת לקוחות מטבלת customer');

  const rows = Object.entries(nifraimByCustomer).map(([id, sumNifraim]) => {
    const info = customerInfoMap[id] || {};
    const phone = phoneMap[id] || '';

    return {
      "תז": id,
      "שם פרטי": info.firstName || '',
      "שם משפחה": info.lastName || '',
      "טלפון": phone,
      "סה\"כ נפרעים": Number(sumNifraim.toFixed(2)),
    };
  });
  rows.sort((a, b) => b["סה\"כ נפרעים"] - a["סה\"כ נפרעים"]);

  return buildExcelReport(rows, 'סיכום נפרעים לפי לקוח');
}

function buildExcelReport(rows: any[], sheetName: string) {
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  return {
    buffer,
    filename: 'סיכום_נפרעים_לפי_לקוח.xlsx',
    subject: 'סיכום נפרעים ללקוחות ממערכת MagicSale',
    description: 'מצורף דוח המרכז את סכום העמלות נפרעים ללקוח מתוך כל הפוליסות',
  };
}
