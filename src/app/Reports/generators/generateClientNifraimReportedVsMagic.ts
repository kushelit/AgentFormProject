// /app/Reports/generators/generateClientNifraimReportedVsMagic.ts
import { admin } from '@/lib/firebase/firebase-admin';
import * as XLSX from 'xlsx';
import { ReportRequest } from '@/types';
import { calculateCommissions } from '@/utils/commissionCalculations';
import { fetchContractsByAgent } from '@/services/server/fetchContracts';
import { getProductMap } from '@/services/server/productService';

/** ----- Types (Excel row shape) ----- */
type RowOut = {
  'ת"ז': string;
  'שם פרטי': string;
  'שם משפחה': string;
  'טלפון': string;
  'חברה': string;
  'מס׳ פוליסה': string;
  'חודש דיווח (קובץ)': string;
  'נפרעים (קובץ)': number;
  'נפרעים (MAGIC)': number;
  'פער ₪ (קובץ−MAGIC)': number;
  'פער %': number;
};

/** ----- Helpers ----- */
const canon = (v?: any) => String(v ?? '').trim();

const toYm = (v?: string) => {
  const s = canon(v);
  if (!s) return '';
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 7);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('/');
    return `${yyyy}-${mm}`;
  }
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('.');
    return `${yyyy}-${mm}`;
  }
  return '';
};

const normalizeMinuy = (val: any): boolean => {
  if (typeof val === 'boolean') return val;
  const s = canon(val).toLowerCase();
  if (!s) return false;
  return ['1', 'true', 'כן', 'y', 't', 'on'].includes(s);
};

const keyPolicy = (company: string, policy: string) => `${company}::${policy}`;
const keyMonthly = (company: string, policy: string, ym: string) =>
  `${company}::${policy}::${ym}`;

const splitMonthlyKey = (k: string) => {
  const [company, policy, ym] = k.split('::');
  return { company, policy, ym };
};

/** ------------------------------------------------------------------------------------------------
 *  Report generator: נפרעים ללקוח – קובץ מול MagicSale (למורשי מודול טעינה)
 *  לכל חודש דיווח בקובץ מתקבלת שורה נפרדת (גם אם אותה פוליסה חזרה במספר חודשים).
 *  סינון לפי: חברה/מוצר/סטטוס/מינוי סוכן + טווח חודש תפוקה (YYYY-MM או תאריכים).
 * ------------------------------------------------------------------------------------------------ */
export async function generateClientNifraimReportedVsMagic(params: ReportRequest) {
  const {
    agentId,
    product,
    company,
    fromDate,
    toDate,
    statusPolicy,
    minuySochen,
  } = params;

  if (!agentId) throw new Error('נדרש לבחור סוכן');

  const db = admin.firestore();
  const contracts = await fetchContractsByAgent(agentId);
  const productMap = await getProductMap();

  // טווח חודשים (מתאריכים או ישירות YYYY-MM)
  const fromYm = toYm(fromDate);
  const toYmVal = toYm(toDate);

  // פילטרים מהריקווסטר
  const selectedCompanies = Array.isArray(company) ? company.map(c => String(c).trim()) : [];
  const selectedProducts  = Array.isArray(product) ? product.map(p => String(p).trim()) : [];
  const selectedStatuses  = Array.isArray(statusPolicy) ? statusPolicy.map(s => String(s).trim()) : [];
  
 // במקום הלוגיקה הקודמת של filterMinuy
const parseMinuy = (v: unknown): boolean | undefined => {
  if (typeof v === 'boolean') return v;
  if (v === null || typeof v === 'undefined') return undefined;
  const s = String(v).trim().toLowerCase();
  if (!s) return undefined;
  if (['true', '1', 'כן', 'y', 't', 'on'].includes(s)) return true;
  if (['false', '0', 'לא', 'n', 'f', 'off'].includes(s)) return false;
  return undefined;
};

const filterMinuy = parseMinuy((params as any).minuySochen);


  /** אגרגציות */
  const magicByPolicy: Record<string, number> = {};            // סכום MAGIC לכל פוליסה (מצטבר)
  const reportedByMonthlyKey: Record<string, number> = {};     // סכום קובץ לכל פוליסה+חודש
  const cidByPolicy: Record<string, string> = {};              // ת"ז לפי פוליסה
  const nameByCid: Record<string, { firstName: string; lastName: string }> = {};
  const phoneByCid: Record<string, string> = {};

  /* ---------------- MAGIC (sales) ---------------- */
  const salesSnap = await db.collection('sales').where('AgentId', '==', agentId).get();

  for (const d of salesSnap.docs) {
    const s: any = d.data();

    const ym = toYm(s.mounth || s.month);
    if (fromYm && ym && ym < fromYm) continue;
    if (toYmVal && ym && ym > toYmVal) continue;

    const comp = canon(s.company);
    if (selectedCompanies.length && !selectedCompanies.includes(comp)) continue;

    const prod = canon(s.product);
    if (selectedProducts.length && !selectedProducts.includes(prod)) continue;

    const sp = canon(s.statusPolicy ?? s.status);
    if (selectedStatuses.length && !selectedStatuses.includes(sp)) continue;

    if (typeof filterMinuy === 'boolean' && normalizeMinuy(s.minuySochen) !== filterMinuy) continue;

    const cid = canon(s.IDCustomer || s.customerId);
    const policy = canon(s.policyNumber);
    if (!policy) continue;

    const contractMatch =
      contracts.find(
        (c) =>
          c.AgentId === agentId &&
          canon(c.company) === comp &&
          canon((c as any).product) === prod &&
          normalizeMinuy((c as any).minuySochen) === normalizeMinuy(s.minuySochen)
      ) || undefined;

    const commissions = calculateCommissions(s as any, contractMatch, contracts, productMap, agentId);
    const amount = Number((commissions as any)?.commissionNifraim ?? 0);

    const kp = keyPolicy(comp, policy);
    magicByPolicy[kp] = (magicByPolicy[kp] || 0) + amount;

    if (!cidByPolicy[kp]) cidByPolicy[kp] = cid;
    if (cid && !nameByCid[cid]) {
      nameByCid[cid] = {
        firstName: s.firstNameCustomer || '',
        lastName: s.lastNameCustomer || '',
      };
    }
  }

  /* ---------------- External file (externalCommissions) ---------------- */
  const extSnap = await db.collection('externalCommissions').where('agentId', '==', agentId).get();

  for (const d of extSnap.docs) {
    const r: any = d.data();

    const repYm = toYm(r.reportMonth);
    if (fromYm && repYm && repYm < fromYm) continue;
    if (toYmVal && repYm && repYm > toYmVal) continue;

    const comp = canon(r.company);
    if (selectedCompanies.length && !selectedCompanies.includes(comp)) continue;

    const prod = canon(r.product);
    if (selectedProducts.length && prod && !selectedProducts.includes(prod)) continue;

    if (
      typeof filterMinuy === 'boolean' &&
      typeof r.minuySochen !== 'undefined' &&
      normalizeMinuy(r.minuySochen) !== filterMinuy
    ) continue;

    const cid = canon(r.customerId || r.IDCustomer);
    const policy = canon(r.policyNumber);
    if (!policy) continue;

    const amount = Number(r.commissionAmount ?? 0);

    const keyM = keyMonthly(comp, policy, repYm || '');
    reportedByMonthlyKey[keyM] = (reportedByMonthlyKey[keyM] || 0) + amount;

    const kp = keyPolicy(comp, policy);
    if (!cidByPolicy[kp]) cidByPolicy[kp] = cid;
  }

  /* ---------------- Phones (customer) ---------------- */
  const custSnap = await db.collection('customer').where('AgentId', '==', agentId).get();
  for (const d of custSnap.docs) {
    const c: any = d.data();
    const cid = canon(c.IDCustomer);
    if (!cid) continue;
    phoneByCid[cid] = canon(c.phone);
  }

  /* ---------------- Build rows ---------------- */
  const rows: RowOut[] = [];

  for (const km of Object.keys(reportedByMonthlyKey)) {
    const { company: comp, policy, ym } = splitMonthlyKey(km);
    const reported = Number(reportedByMonthlyKey[km] ?? 0);

    const kp = keyPolicy(comp, policy);
    const magic = Number(magicByPolicy[kp] ?? 0);

    const diff = reported - magic;

    // אחוז פער: נגד הקובץ (ואם 0 → נגד MAGIC)
    let diffPct = 0;
    if (reported === 0 && magic !== 0) diffPct = (diff / magic) * 100;
    else if (reported !== 0) diffPct = (diff / reported) * 100;

    const cid = cidByPolicy[kp] || '';
    const info = nameByCid[cid] || { firstName: '', lastName: '' };
    const phone = phoneByCid[cid] || '';

    rows.push({
      'ת"ז': cid,
      'שם פרטי': info.firstName,
      'שם משפחה': info.lastName,
      'טלפון': phone,
      'חברה': comp,
      'מס׳ פוליסה': policy,
      'חודש דיווח (קובץ)': ym || '',
      'נפרעים (קובץ)': Number(reported.toFixed(2)),
      'נפרעים (MAGIC)': Number(magic.toFixed(2)),
      'פער ₪ (קובץ−MAGIC)': Number(diff.toFixed(2)),
      'פער %': Number(diffPct.toFixed(2)),
    });
  }

  // מיון קריא: חברה → פוליסה → חודש
  rows.sort(
    (a, b) =>
      a['חברה'].localeCompare(b['חברה']) ||
      a['מס׳ פוליסה'].localeCompare(b['מס׳ פוליסה']) ||
      a['חודש דיווח (קובץ)'].localeCompare(b['חודש דיווח (קובץ)'])
  );

  /** סדר עמודות קבוע כדי להבטיח הופעת "חברה" */
  const columnOrder: (keyof RowOut)[] = [
    'ת"ז',
    'שם פרטי',
    'שם משפחה',
    'טלפון',
    'חברה',
    'מס׳ פוליסה',
    'חודש דיווח (קובץ)',
    'נפרעים (קובץ)',
    'נפרעים (MAGIC)',
    'פער ₪ (קובץ−MAGIC)',
    'פער %',
  ];

  const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}], { header: columnOrder as string[] });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'נפרעים: קובץ מול MAGIC');
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;

  return {
    buffer,
    filename: `דוח_נפרעים_קובץ_מול_MagicSale_${agentId}_${fromYm || 'from'}_${toYmVal || 'to'}.xlsx`,
    subject: 'דוח נפרעים ללקוח – קובץ מול MagicSale',
    description:
      'דוח חודשי: לכל חודש דיווח בקובץ מתקבלת שורה נפרדת לפוליסה (מול סכום MAGIC), כולל פערים באחוזים ובשקלים.',
  };
}
