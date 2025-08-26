// app/Reports/generators/generateClientPoliciesReport.ts  ✅ SERVER ONLY
import { admin } from '@/lib/firebase/firebase-admin';
import * as XLSX from 'xlsx';
import { ReportRequest } from '@/types';
import { calculateCommissions, calculatePremiaAndTzvira } from '@/utils/commissionCalculations';

// ❗ חשוב: ייבוא *גרסאות השרת* של הסרוויסים
import { fetchContractsByAgent } from '@/services/server/fetchContracts';
import { fetchCommissionSplits } from '@/services/server/commissionService';
import type { ClientPolicyRow } from '@/types/Sales';
import { getProductMap } from '@/services/server/productService';

export async function generateClientPoliciesReport(params: ReportRequest) {
  const { agentId, product, company, fromDate, toDate } = params;
  if (!agentId) throw new Error('נדרש לבחור סוכן');

  const db = admin.firestore();

  // 🔎 שליפה מ־sales עם Admin SDK
  const salesSnap = await db
    .collection('sales')
    .where('AgentId', '==', agentId)
    .get();

  // 📚 שליפות עזר (כולן בגרסאות SERVER)
  const contracts = await fetchContractsByAgent(agentId);
  const _splits = await fetchCommissionSplits(agentId); // אם לא בשימוש אפשר להסיר
  const productMap = await getProductMap();

  const cleanedProducts = Array.isArray(product) ? product.map((p) => p.trim()) : [];
  const cleanedCompanies = Array.isArray(company) ? company.map((c) => c.trim()) : [];

  const rows = (
    await Promise.all(
      salesSnap.docs.map(async (doc) => {
        const raw = doc.data() as any;

        // 🧹 סינון לפי תאריכים (מחרוזות ISO כמו YYYY-MM או YYYY-MM-DD עובד לקסיקוגרפית)
        if (fromDate && raw.mounth < fromDate) return null;
        if (toDate && raw.mounth > toDate) return null;

        // 🧹 סינון לפי חברות
        if (cleanedCompanies.length > 0 && !cleanedCompanies.includes((raw.company ?? '').trim())) return null;

        // 🧹 סינון לפי מוצרים
        if (cleanedProducts.length > 0 && !cleanedProducts.includes((raw.product ?? '').trim())) return null;

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
          (c) =>
            c.AgentId === agentId &&
            c.product === sale.product &&
            c.company === sale.company &&
            (c.minuySochen === sale.minuySochen || (!c.minuySochen && !sale.minuySochen))
        );

        const commissions = calculateCommissions(sale, contractMatch, contracts, productMap, agentId);
        const premiaData = calculatePremiaAndTzvira(sale);

        return {
          'שם פרטי': sale.firstNameCustomer,
          'שם משפחה': sale.lastNameCustomer,
          'תז': sale.IDCustomer,
          'חברה': sale.company,
          'מוצר': sale.product,
          'סטטוס': sale.status,
          'חודש תפוקה': sale.month,
          'פרמיה': premiaData.sumPremia,
          'צבירה': premiaData.sumTzvira,
          'עמלת הקף': commissions.commissionHekef,
          'נפרעים': commissions.commissionNifraim,
        };
      })
    )
  ).filter(Boolean) as any[];

  rows.sort((a, b) => String(a['תז'] ?? '').localeCompare(String(b['תז'] ?? '')));

  return buildExcelReport(rows, 'פוליסות ללקוח');
}

function buildExcelReport(rows: any[], sheetName: string) {
  const worksheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  return {
    buffer: buffer as Buffer,
    filename: 'דוח_פוליסות_ללקוח.xlsx',
    subject: 'דוח פוליסות ללקוח ממערכת MagicSale',
    description: 'מצורף דוח פוליסות עם פרמיה ועמלות',
  };
}
