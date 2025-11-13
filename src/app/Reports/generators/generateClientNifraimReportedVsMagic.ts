// THIS FILE RUNS ONLY ON SERVER. DO NOT IMPORT FROM CLIENT.
// /app/Reports/generators/generateClientNifraimReportedVsMagic.ts

import { admin } from '@/lib/firebase/firebase-admin';
import * as XLSX from 'xlsx';
import { ReportRequest } from '@/types';
import { calculateCommissions } from '@/utils/commissionCalculations';
import { fetchContractsByAgent } from '@/services/server/fetchContracts';
import { getProductMap } from '@/services/server/productService';

/** -------------------------------------------------- */
/**   Helpers                                          */
/** -------------------------------------------------- */

const canon = (v?: any) => String(v ?? '').trim();

const toYm = (v?: string) => {
  const s = canon(v);
  if (!s) return '';
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [, mm, yyyy] = s.split('/');
    return `${yyyy}-${mm}`;
  }
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
    const [, mm, yyyy] = s.split('.');
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

const parseMinuy = (v: unknown): boolean | undefined => {
  if (typeof v === 'boolean') return v;
  if (v === null || typeof v === 'undefined') return undefined;
  const s = String(v).trim().toLowerCase();
  if (!s) return undefined;
  if (['true', '1', 'כן', 'y', 't', 'on'].includes(s)) return true;
  if (['false', '0', 'לא', 'n', 'f', 'off'].includes(s)) return false;
  return undefined;
};

/** KEY אחיד כמו במסך */
const makeKey = (company: string, policy: string, docId?: string) =>
  policy ? `${company}::${policy}` : `${company}::__NO_POLICY__:${docId ?? ''}`;

/** -------------------------------------------------- */

type RowOut = {
  'ת"ז': string;
  'שם פרטי': string;
  'שם משפחה': string;
  'חברה': string;
  'מס׳ פוליסה': string;
  'חודש דיווח (קובץ)': string;
  'נפרעים (קובץ)': number;
  'נפרעים (MAGIC)': number;
  'פער ₪ (קובץ−MAGIC)': number;
  'פער %': number;
};

/** -------------------------------------------------- */

export async function generateClientNifraimReportedVsMagic(params: ReportRequest) {
  const { agentId, product, company, fromDate, toDate, statusPolicy } = params;

  if (!agentId) throw new Error('נדרש לבחור סוכן');

  const db = admin.firestore();
  const contracts = await fetchContractsByAgent(agentId);
  const productMap = await getProductMap();

  const fromYm = toYm(fromDate);
  const toYmVal = toYm(toDate);

  const selectedCompanies = Array.isArray(company) ? company.map(c => canon(c)) : [];
  const selectedProducts  = Array.isArray(product) ? product.map(p => canon(p)) : [];
  const selectedStatuses  = Array.isArray(statusPolicy) ? statusPolicy.map(s => canon(s)) : [];

  const filterMinuy = parseMinuy((params as any).minuySochen);

  /** מאגרים */
  const reportedByKey: Record<string, { ym: string; amount: number; cid: string; fullName?: string }> = {};
  const magicByKey: Record<string, number> = {};
  const displayNameByKey: Record<string, { first: string; last: string }> = {};

  /** ---------- EXTERNAL ---------- */

  const extSnap = await db.collection('externalCommissions')
    .where('agentId', '==', agentId)
    .get();

  for (const d of extSnap.docs) {
    const r: any = d.data();
    const comp = canon(r.company);

    const ym = toYm(r.reportMonth);
    if (fromYm && ym < fromYm) continue;
    if (toYmVal && ym > toYmVal) continue;

    if (selectedCompanies.length && !selectedCompanies.includes(comp)) continue;

    const prod = canon(r.product);
    if (selectedProducts.length && prod && !selectedProducts.includes(prod)) continue;

    if (
      typeof filterMinuy === 'boolean' &&
      typeof r.minuySochen !== 'undefined' &&
      normalizeMinuy(r.minuySochen) !== filterMinuy
    ) continue;

    const policy = canon(r.policyNumber);
    if (!policy) continue;

    const cid = canon(r.customerId || r.IDCustomer);
    const key = makeKey(comp, policy, d.id);

    reportedByKey[key] = {
      ym,
      cid,
      amount: Number(r.commissionAmount ?? 0),
      fullName: canon(r.fullName || '')
    };
  }

  /** ---------- MAGIC (sales) ---------- */

  const salesSnap = await db.collection('sales')
    .where('AgentId', '==', agentId)
    .get();

  for (const d of salesSnap.docs) {
    const s: any = d.data();

    const comp = canon(s.company);
    const policy = canon(s.policyNumber); // לא מדלגים גם אם ריק

    const ym = toYm(s.month || s.mounth);
    if (fromYm && ym < fromYm) continue;
    if (toYmVal && ym > toYmVal) continue;

    if (selectedCompanies.length && !selectedCompanies.includes(comp)) continue;

    const prod = canon(s.product);
    if (selectedProducts.length && !selectedProducts.includes(prod)) continue;

    const st = canon(s.statusPolicy ?? s.status);
    if (selectedStatuses.length && !selectedStatuses.includes(st)) continue;

    if (typeof filterMinuy === 'boolean' && normalizeMinuy(s.minuySochen) !== filterMinuy) continue;

    const key = makeKey(comp, policy, d.id);

    const contractMatch =
      contracts.find(c =>
        c.AgentId === agentId &&
        canon(c.company) === comp &&
        canon((c as any).product) === prod &&
        normalizeMinuy((c as any).minuySochen) === normalizeMinuy(s.minuySochen)
      ) || undefined;

    const commissions = calculateCommissions(s, contractMatch, contracts, productMap, agentId);
    const amount = Number((commissions as any)?.commissionNifraim ?? 0);

    magicByKey[key] = (magicByKey[key] || 0) + amount;

    if (!displayNameByKey[key]) {
      displayNameByKey[key] = {
        first: canon(s.firstNameCustomer || ''),
        last: canon(s.lastNameCustomer || '')
      };
    }
  }

  /** ---------- UNION ---------- */

  const rows: RowOut[] = [];
  const allKeys = Array.from(new Set([
    ...Object.keys(reportedByKey),
    ...Object.keys(magicByKey),
  ]));

  for (const key of allKeys) {
    const [comp, policy] = key.split('::');
    const rep = reportedByKey[key];
    const mag = magicByKey[key] || 0;

    let cid = '';
    let ym = '';
    let first = '';
    let last = '';

    if (rep) {
      cid = rep.cid;
      ym = rep.ym;
      if (rep.fullName) {
        const parts = rep.fullName.split(' ');
        first = parts[0] || '';
        last = parts.slice(1).join(' ') || '';
      }
    }

    if (!rep && displayNameByKey[key]) {
      first = displayNameByKey[key].first;
      last = displayNameByKey[key].last;
    }

    const reported = rep ? rep.amount : 0;
    const diff = reported - mag;

    let diffPct = 0;
    if (reported === 0 && mag !== 0) diffPct = (diff / mag) * 100;
    else if (reported !== 0) diffPct = (diff / reported) * 100;

    rows.push({
      'ת"ז': cid,
      'שם פרטי': first,
      'שם משפחה': last,
      'חברה': comp,
      'מס׳ פוליסה': policy || '',
      'חודש דיווח (קובץ)': ym,
      'נפרעים (קובץ)': Number(reported.toFixed(2)),
      'נפרעים (MAGIC)': Number(mag.toFixed(2)),
      'פער ₪ (קובץ−MAGIC)': Number(diff.toFixed(2)),
      'פער %': Number(diffPct.toFixed(2)),
    });
  }

  rows.sort((a, b) =>
    a['חברה'].localeCompare(b['חברה']) ||
    a['מס׳ פוליסה'].localeCompare(b['מס׳ פוליסה']) ||
    a['חודש דיווח (קובץ)'].localeCompare(b['חודש דיווח (קובץ)'])
  );

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'נפרעים');

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

  return {
    buffer,
    filename: `נפרעים_${agentId}_${fromYm}_${toYmVal}.xlsx`,
    subject: 'דוח נפרעים – קובץ מול MagicSale',
    description: 'דוח השוואת נפרעים: קובץ מול MAGIC לפי פוליסה/חודש',
  };
}
