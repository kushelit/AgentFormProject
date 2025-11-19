// ✅ שרת בלבד — אין שימוש ב-Client SDK
import { admin } from '@/lib/firebase/firebase-admin';
import * as XLSX from 'xlsx';
import { ReportRequest } from '@/types';
import { calculateCommissions } from '@/utils/commissionCalculations';
import { fetchContractsByAgent } from '@/services/server/fetchContracts';
import { fetchCommissionSplits } from '@/services/server/commissionService';
import { getProductMap } from '@/services/server/productService';
import type { CommissionSplit } from '@/types/CommissionSplit';

type PolicyAgg = {
  company: string;
  policyNumber: string;
  month: string;
  customerId: string;
  firstName: string;
  lastName: string;
  phone: string;
  amount: number;
};

export async function generateClientNifraimSummaryReport(params: ReportRequest) {
  const { agentId, product, company, fromDate, toDate } = params;
  if (!agentId) throw new Error("נדרש לבחור סוכן");

  // דגל חישוב עם/בלי פיצול – מגיע מה-UI, אופציונלי
  const applyCommissionSplit: boolean = (params as any).applyCommissionSplit === true;

  const db = admin.firestore();

  // 🔹 כל לקוחות הסוכן – כדי להגיע ל-sourceValue / sourceLead + טלפון
  const customersSnapshot = await db
    .collection('customer')
    .where('AgentId', '==', agentId)
    .get();

  const customersById: Record<string, any> = {};
  const phoneMap: Record<string, string> = {};

  for (const doc of customersSnapshot.docs) {
    const c = doc.data() as any;
    const id = c.IDCustomer;
    if (!id) continue;
    customersById[id] = c;
    phoneMap[id] = c.phone || '';
  }

  // 🔎 sales - Admin SDK query
  const salesSnapshot = await db
    .collection('sales')
    .where('AgentId', '==', agentId)
    .get();

  const contracts = await fetchContractsByAgent(agentId);
  const splits = await fetchCommissionSplits(agentId);
  const productMap = await getProductMap();

  const cleanedProducts = Array.isArray(product) ? product.map(p => p.trim()) : [];
  const cleanedCompanies = Array.isArray(company) ? company.map(c => c.trim()) : [];

  // סיכום לפי לקוח (כמו שהיה)
  const nifraimByCustomer: Record<string, number> = {};
  const customerInfoMap: Record<string, { firstName: string; lastName: string }> = {};

  // חדש: סיכום לפי פוליסה
  const nifraimByPolicy: Record<string, PolicyAgg> = {};

  // עזר למציאת הסכם פיצול ללקוח
  function findSplitForCustomer(customerId: string): CommissionSplit | undefined {
    const cust = customersById[customerId];
    if (!cust) return undefined;
    const unifiedSource = cust.sourceValue || cust.sourceLead;
    if (!unifiedSource) return undefined;

    return splits.find(
      (split) =>
        split.agentId === agentId &&
        split.sourceLeadId === unifiedSource
    );
  }

  for (const doc of salesSnapshot.docs) {
    const raw = doc.data() as any;

    // פילטרים לפי תאריכים + חברה + מוצר
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

    const commissions = calculateCommissions(
      sale,
      contractMatch,
      contracts,
      productMap,
      agentId
    );

    // בסיס – נפרעים לפני פיצול
    let nifraim = commissions.commissionNifraim || 0;

    // ✅ מיישמים פיצול (אם הופעל מה-UI ויש הסכם)
    if (applyCommissionSplit && splits.length > 0) {
      const splitAgreement = findSplitForCustomer(customerId);
      if (splitAgreement) {
        const perc = splitAgreement.percentToAgent ?? 100;
        nifraim = Number((nifraim * perc / 100).toFixed(2));
      }
    }

    // --- סיכום לפי לקוח (לשונית "נפרעים לפי מבוטח") ---
    if (!nifraimByCustomer[customerId]) nifraimByCustomer[customerId] = 0;
    nifraimByCustomer[customerId] += nifraim;

    if (!customerInfoMap[customerId]) {
      const cust = customersById[customerId];
      customerInfoMap[customerId] = {
        firstName: cust?.firstNameCustomer || sale.firstNameCustomer || '',
        lastName: cust?.lastNameCustomer || sale.lastNameCustomer || '',
      };
    }

    // --- חדש: סיכום לפי פוליסה (לשונית "נפרעים לפי פוליסה") ---
    const phone = phoneMap[customerId] || '';
    const companyName = sale.company || '';
    const policyNumber = sale.policyNumber || '';

    // מפתח לפוליסה – כמו בדוח השני (שמור על NO_POLICY כדי להבדיל)
    const policyKey = policyNumber
      ? `${companyName}::${policyNumber}`
      : `${companyName}::__NO_POLICY__:${doc.id}`;

    const custInfo = customerInfoMap[customerId] || {};
    const firstName = custInfo.firstName || sale.firstNameCustomer || '';
    const lastName = custInfo.lastName || sale.lastNameCustomer || '';
    const month = sale.month || '';

    if (!nifraimByPolicy[policyKey]) {
      nifraimByPolicy[policyKey] = {
        company: companyName,
        policyNumber: policyNumber || '',
        month,
        customerId,
        firstName,
        lastName,
        phone,
        amount: 0,
      };
    } else {
      // אם יש כבר, נעדכן חודש ל"מוקדם" יותר (סתם לוגיקה שמרנית)
      const existing = nifraimByPolicy[policyKey];
      if (!existing.month || (month && month < existing.month)) {
        existing.month = month;
      }
      // נעדכן גם שם/טלפון אם היה חסר
      if (!existing.firstName && firstName) existing.firstName = firstName;
      if (!existing.lastName && lastName) existing.lastName = lastName;
      if (!existing.phone && phone) existing.phone = phone;
    }

    nifraimByPolicy[policyKey].amount += nifraim;
  }

  // ---------- בניית לשונית "נפרעים לפי פוליסה" ----------
  const policyRows = Object.values(nifraimByPolicy).map((p) => ({
    'תז': p.customerId,
    'שם פרטי': p.firstName || '',
    'שם משפחה': p.lastName || '',
    'טלפון': p.phone || '',
    'חברה': p.company || '',
    'מס׳ פוליסה': p.policyNumber || '',
    'חודש תחילה': p.month || '',
    'נפרעים (MAGIC)': Number(p.amount.toFixed(2)),
  }));

  policyRows.sort(
    (a, b) =>
      a['חברה'].localeCompare(b['חברה']) ||
      a['מס׳ פוליסה'].localeCompare(b['מס׳ פוליסה']) ||
      a['חודש תחילה'].localeCompare(b['חודש תחילה'])
  );

  // ---------- בניית לשונית "נפרעים לפי מבוטח" (כמו שהיה, עם טלפון) ----------
  const customerRows = Object.entries(nifraimByCustomer).map(([id, sumNifraim]) => {
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

  customerRows.sort((a, b) => b['סה"כ נפרעים'] - a['סה"כ נפרעים']);

  return buildExcelReport(policyRows, customerRows);
}

function buildExcelReport(policyRows: any[], customerRows: any[]) {
  const workbook = XLSX.utils.book_new();

  // לשונית 1 – נפרעים לפי פוליסה
  const wsPolicy = XLSX.utils.json_to_sheet(policyRows.length ? policyRows : [{}]);
  XLSX.utils.book_append_sheet(workbook, wsPolicy, 'נפרעים לפי פוליסה');

  // לשונית 2 – נפרעים לפי מבוטח
  const wsCustomer = XLSX.utils.json_to_sheet(customerRows.length ? customerRows : [{}]);
  XLSX.utils.book_append_sheet(workbook, wsCustomer, 'נפרעים לפי מבוטח');

  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });

  return {
    buffer: buffer as Buffer,
    filename: 'סיכום_נפרעים_לפי_לקוח_ופוליסה.xlsx',
    subject: 'סיכום נפרעים לפי פוליסה ולפי מבוטח ממערכת MagicSale',
    description:
      'מצורף דוח המרכז את סכום עמלות הנפרעים לפי פוליסה וגם לפי מבוטח (ת"ז).',
  };
}
