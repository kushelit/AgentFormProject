import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { ReportRequest } from '@/types';
import { calculateCommissions, calculatePremiaAndTzvira } from '@/utils/commissionCalculations';
import { fetchContractsByAgent } from '@/services/fetchContracts';
import { fetchCommissionSplits } from '@/services/commissionService';
import type { ClientPolicyRow } from '@/types/Sales';
import { getProductMap } from '@/services/productService';

export async function generateClientPoliciesReport(params: ReportRequest) {
  const { agentId, product, company, fromDate, toDate } = params;

  if (!agentId) {
    throw new Error("נדרש לבחור סוכן");
  }

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

  const rows = await Promise.all(
    salesSnapshot.docs.map(async (doc) => {
      const raw = doc.data();

      // סינון לפי תאריכים
      if (fromDate && raw.mounth < fromDate) return null;
      if (toDate && raw.mounth > toDate) return null;

      // סינון לפי חברות
      if (cleanedCompanies.length > 0 && !cleanedCompanies.includes(raw.company?.trim())) return null;

      // סינון לפי מוצרים
      if (cleanedProducts.length > 0 && !cleanedProducts.includes(raw.product?.trim())) return null;

      const sale: ClientPolicyRow = {
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

      const premiaData = calculatePremiaAndTzvira(sale);

      return {
        "שם פרטי": sale.firstNameCustomer,
        "שם משפחה": sale.lastNameCustomer,
        "תז": sale.IDCustomer,
        "חברה": sale.company,
        "מוצר": sale.product,
        "סטטוס": sale.status,
        "חודש תפוקה": sale.month,
        "פרמיה": premiaData.sumPremia,
        "צבירה": premiaData.sumTzvira,
        "עמלת הקף": commissions.commissionHekef,
        "נפרעים": commissions.commissionNifraim,
      };
    })
  ).then(rows => rows.filter(Boolean)); // מסנן null

  rows.sort((a, b) => {
    const aId = a?.["תז"] ?? '';
    const bId = b?.["תז"] ?? '';
    return aId.localeCompare(bId);
  });
    return buildExcelReport(rows, 'פוליסות ללקוח');
}

function buildExcelReport(rows: any[], sheetName: string) {
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  return {
    buffer,
    filename: 'דוח_פוליסות_ללקוח.xlsx',
    subject: 'דוח פוליסות ללקוח ממערכת MagicSale',
    description: 'מצורף דוח פוליסות עם פרמיה ועמלות',
  };
}
