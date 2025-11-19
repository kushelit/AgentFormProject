// THIS FILE RUNS ONLY ON SERVER. DO NOT IMPORT FROM CLIENT.
// /app/Reports/generators/generateClientNifraimReportedVsMagic.ts

import { admin } from '@/lib/firebase/firebase-admin';
import * as XLSX from 'xlsx';
import { ReportRequest } from '@/types';
import { calculateCommissions } from '@/utils/commissionCalculations';
import { fetchContractsByAgent } from '@/services/server/fetchContracts';
import { getProductMap } from '@/services/server/productService';
import { fetchCommissionSplits } from '@/services/server/commissionService';
import type { CommissionSplit } from '@/types/CommissionSplit';

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

/** KEY אחיד כמו במסך: חברה + פוליסה, ואם אין פוליסה – מפתח פנימי */
const makeKey = (company: string, policy: string, docId?: string) =>
  policy ? `${company}::${policy}` : `${company}::__NO_POLICY__:${docId ?? ''}`;

/** מפתח ללקוח במפה (AgentId + ת"ז) */
const getCustomerKey = (agentId: string, cid: string) =>
  `${agentId}::${cid}`;

/** למצוא הסכם פיצול רלוונטי לעסקה */
function findSplitForSale(
  sale: any,
  commissionSplits: CommissionSplit[],
  customersByKey: Map<string, any>
): CommissionSplit | undefined {
  const agentId = canon(sale.AgentId);
  const cid = canon(sale.IDCustomer || sale.customerId);
  if (!agentId || !cid) return undefined;

  const customer = customersByKey.get(getCustomerKey(agentId, cid));
  if (!customer) return undefined;

  // בגלל הבאג ההיסטורי – נבדוק גם sourceValue וגם sourceLead
  const sourceValueUnified = canon(
    customer.sourceValue ?? customer.sourceLead ?? ''
  );
  if (!sourceValueUnified) return undefined;

  return commissionSplits.find(
    (split) =>
      canon(split.agentId) === agentId &&
      canon(split.sourceLeadId) === sourceValueUnified
  );
}

/** -------------------------------------------------- */
/**   Types                                            */
/** -------------------------------------------------- */

type PolicyRowOut = {
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

type CustomerRowOut = {
  'ת"ז': string;
  'שם פרטי': string;
  'שם משפחה': string;
  'נפרעים (קובץ)': number;
  'נפרעים (MAGIC)': number;
  'פער ₪ (קובץ−MAGIC)': number;
  'פער %': number;
};

/** -------------------------------------------------- */

export async function generateClientNifraimReportedVsMagic(
  params: ReportRequest
) {
  const { agentId, product, company, fromDate, toDate, statusPolicy } = params;

  if (!agentId) throw new Error('נדרש לבחור סוכן');

  const db = admin.firestore();
  const contracts = await fetchContractsByAgent(agentId);
  const productMap = await getProductMap();

  const fromYm = toYm(fromDate);
  const toYmVal = toYm(toDate);

  const selectedCompanies = Array.isArray(company)
    ? company.map(canon)
    : [];
  const selectedProducts = Array.isArray(product)
    ? product.map(canon)
    : [];
  const selectedStatuses = Array.isArray(statusPolicy)
    ? statusPolicy.map(canon)
    : [];

  const filterMinuy = parseMinuy((params as any).minuySochen);

  // האם ליישם פיצול עמלות בדוח?
  const applyCommissionSplit =
    typeof (params as any).applyCommissionSplit === 'boolean'
      ? (params as any).applyCommissionSplit
      : false;

  let commissionSplits: CommissionSplit[] = [];
  const customersByKey = new Map<string, any>();

  if (applyCommissionSplit) {
    // טבלת הסכמי פיצול
    commissionSplits = await fetchCommissionSplits(agentId);

    // טבלת לקוחות – בשביל sourceValue / sourceLead
    const customersSnap = await db
      .collection('customer')
      .where('AgentId', '==', agentId)
      .get();

    customersSnap.docs.forEach((doc) => {
      const c = doc.data() as any;
      const cid = canon(c.IDCustomer);
      const aId = canon(c.AgentId || agentId);
      if (!cid || !aId) return;
      customersByKey.set(getCustomerKey(aId, cid), c);
    });
  }

  /** מאגרים */

  // מהקבצים – לפי KEY
  const reportedByKey: Record<
    string,
    { ym: string; amount: number; cid: string; fullName?: string }
  > = {};

  // מהמג'יק – לפי KEY
  const magicByKey: Record<
    string,
    { amount: number; cid?: string; first?: string; last?: string }
  > = {};

  /** ---------- EXTERNAL (קבצים) ---------- */

  const extSnap = await db
    .collection('externalCommissions')
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
    if (selectedProducts.length && prod && !selectedProducts.includes(prod))
      continue;

    if (
      typeof filterMinuy === 'boolean' &&
      typeof r.minuySochen !== 'undefined' &&
      normalizeMinuy(r.minuySochen) !== filterMinuy
    )
      continue;

    const policy = canon(r.policyNumber);
    // כאן *כן* מדלגים על שורות בלי מספר פוליסה – הן יופיעו רק בצד המג'יק
    if (!policy) continue;

    const cid = canon(r.customerId || r.IDCustomer);
    const key = makeKey(comp, policy, d.id);

    const fullName = canon(r.fullName || '');
    const amount = Number(r.commissionAmount ?? 0);

    reportedByKey[key] = {
      ym,
      cid,
      amount,
      fullName: fullName || undefined,
    };
  }

  /** ---------- MAGIC (sales) ---------- */

  const salesSnap = await db
    .collection('sales')
    .where('AgentId', '==', agentId)
    .get();

  for (const d of salesSnap.docs) {
    const s: any = d.data();

    const comp = canon(s.company);
    const policy = canon(s.policyNumber); // יכול להיות ריק

    // חודש תחילת פוליסה – כמו בכרטיסון/מסך השוואה
    const policyYm = toYm(s.month || s.mounth);
    // לוגיקה לפי מה שסיכמנו: כל הפוליסות עד וכולל toYm
    if (toYmVal && policyYm && policyYm > toYmVal) continue;

    if (selectedCompanies.length && !selectedCompanies.includes(comp)) continue;

    const prod = canon(s.product);
    if (selectedProducts.length && !selectedProducts.includes(prod)) continue;

    const st = canon(s.statusPolicy ?? s.status);
    if (selectedStatuses.length && !selectedStatuses.includes(st)) continue;

    if (
      typeof filterMinuy === 'boolean' &&
      normalizeMinuy(s.minuySochen) !== filterMinuy
    )
      continue;

    const key = makeKey(comp, policy, d.id);

    const contractMatch =
      contracts.find(
        (c) =>
          c.AgentId === agentId &&
          canon(c.company) === comp &&
          canon((c as any).product) === prod &&
          normalizeMinuy((c as any).minuySochen) ===
            normalizeMinuy(s.minuySochen)
      ) || undefined;

    const commissions = calculateCommissions(
      s,
      contractMatch,
      contracts,
      productMap,
      agentId
    );

    // בסיס: עמלת נפרעים מלאה
    let amount = Number((commissions as any)?.commissionNifraim ?? 0);

    // אם יש פיצול – ניישם את אחוז הסוכן
    if (
      applyCommissionSplit &&
      commissionSplits.length &&
      customersByKey.size
    ) {
      const split = findSplitForSale(s, commissionSplits, customersByKey);
      if (split) {
        const pct = Number(split.percentToAgent ?? 100);
        if (!Number.isNaN(pct)) {
          amount = amount * (pct / 100);
        }
      }
    }

    const cid = canon(s.IDCustomer || s.customerId);
    const first = canon(s.firstNameCustomer || '');
    const last = canon(s.lastNameCustomer || '');

    if (!magicByKey[key]) {
      magicByKey[key] = { amount: 0, cid, first, last };
    }

    magicByKey[key].amount += amount;

    if (!magicByKey[key].cid && cid) magicByKey[key].cid = cid;
    if (!magicByKey[key].first && first) magicByKey[key].first = first;
    if (!magicByKey[key].last && last) magicByKey[key].last = last;
  }

  /** ---------- UNION → לשונית "נפרעים לפי פוליסה" ---------- */

  const policyRows: PolicyRowOut[] = [];

  const allKeys = Array.from(
    new Set([...Object.keys(reportedByKey), ...Object.keys(magicByKey)])
  );

  for (const key of allKeys) {
    const [comp, policyPart] = key.split('::');

    // ניקוי __NO_POLICY__ להצגה
    const policy =
      policyPart && policyPart.startsWith('__NO_POLICY__')
        ? ''
        : policyPart || '';

    const rep = reportedByKey[key];
    const m = magicByKey[key];

    const mag = m?.amount ?? 0;

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

    // אם אין ת"ז / שם מהקובץ – לוקחים מהמג'יק
    if (!cid && m?.cid) cid = m.cid;
    if (!first && m?.first) first = m.first;
    if (!last && m?.last) last = m.last;

    const reported = rep ? rep.amount : 0;
    const diff = reported - mag;

    let diffPct = 0;
    if (reported === 0 && mag !== 0) diffPct = (diff / mag) * 100;
    else if (reported !== 0) diffPct = (diff / reported) * 100;

    policyRows.push({
      'ת"ז': cid,
      'שם פרטי': first,
      'שם משפחה': last,
      'חברה': comp,
      'מס׳ פוליסה': policy,
      'חודש דיווח (קובץ)': ym,
      'נפרעים (קובץ)': Number(reported.toFixed(2)),
      'נפרעים (MAGIC)': Number(mag.toFixed(2)),
      'פער ₪ (קובץ−MAGIC)': Number(diff.toFixed(2)),
      'פער %': Number(diffPct.toFixed(2)),
    });
  }

  policyRows.sort(
    (a, b) =>
      a['חברה'].localeCompare(b['חברה']) ||
      a['מס׳ פוליסה'].localeCompare(b['מס׳ פוליסה']) ||
      a['חודש דיווח (קובץ)'].localeCompare(b['חודש דיווח (קובץ)'])
  );

  /** ---------- לשונית "נפרעים לפי מבוטח" (סיכום לפי ת"ז) ---------- */

  const byCid: Record<
    string,
    { first: string; last: string; reported: number; magic: number }
  > = {};

  for (const r of policyRows) {
    const cid = canon(r['ת"ז']);
    if (!cid) continue; // אם אין ת"ז – לא נכנס לסיכום לפי מבוטח

    if (!byCid[cid]) {
      byCid[cid] = {
        first: r['שם פרטי'],
        last: r['שם משפחה'],
        reported: 0,
        magic: 0,
      };
    }

    byCid[cid].reported += r['נפרעים (קובץ)'];
    byCid[cid].magic += r['נפרעים (MAGIC)'];
  }

  const customerRows: CustomerRowOut[] = Object.entries(byCid).map(
    ([cid, v]) => {
      const reported = v.reported;
      const mag = v.magic;
      const diff = reported - mag;

      let diffPct = 0;
      if (reported === 0 && mag !== 0) diffPct = (diff / mag) * 100;
      else if (reported !== 0) diffPct = (diff / reported) * 100;

      return {
        'ת"ז': cid,
        'שם פרטי': v.first,
        'שם משפחה': v.last,
        'נפרעים (קובץ)': Number(reported.toFixed(2)),
        'נפרעים (MAGIC)': Number(mag.toFixed(2)),
        'פער ₪ (קובץ−MAGIC)': Number(diff.toFixed(2)),
        'פער %': Number(diffPct.toFixed(2)),
      };
    }
  );

  customerRows.sort((a, b) => a['ת"ז'].localeCompare(b['ת"ז']));

  /** ---------- יצירת קובץ אקסל עם שתי לשוניות ---------- */

  const wb = XLSX.utils.book_new();

  const wsPolicy = XLSX.utils.json_to_sheet(policyRows);
  XLSX.utils.book_append_sheet(wb, wsPolicy, 'נפרעים לפי פוליסה');

  const wsCustomer = XLSX.utils.json_to_sheet(customerRows);
  XLSX.utils.book_append_sheet(wb, wsCustomer, 'נפרעים לפי מבוטח');

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

  return {
    buffer,
    filename: `דוח נפרעים – קובץ מול MagicSale.xlsx`,
    subject: 'דוח נפרעים – קובץ מול MagicSale',
    description:
      'דוח השוואת נפרעים: קובץ מול MAGIC לפי פוליסה ולפי מבוטח (ת"ז).',
  };
}
