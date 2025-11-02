// services/reconcileHeader.ts
'use client';

import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { fetchExternalForCustomers } from '@/services/externalQueries';
import { fetchSplits } from '@/services/splitsService';
import { calculateCommissions } from '@/utils/commissionCalculations';
import { makeCompanyCanonical } from '@/utils/reconcile';
import type { ContractForCompareCommissions } from '@/types/Contract';

type Product = { productName: string; productGroup: string; isOneTime?: boolean };

export type HeaderTotals = {
  external: number;
  magicByValid: number;
  magicSnapshot: number;
  deltaByValid: number;
  deltaSnapshot: number;
  linked: number;
  needsLink: number;
  noCandidates: number;
};

// ✅ helper שמבטיח ש-0 לא “נבלע”
const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ------------ Policy index helpers (לוקאלי לקובץ) ------------ */
const normalizePolicyKey = (v: any) => String(v ?? '').trim().replace(/\s+/g, '');

async function lookupPolicyLinksInHeader(params: {
  agentId: string;
  policyNumberKeys: string[];
  company?: string; // raw; יומר לקנוני אם הועבר
}) {
  const { agentId, policyNumberKeys, company } = params;
  const keys = Array.from(new Set(policyNumberKeys.filter(Boolean)));
  const out = new Map<string, { saleId: string; customerId?: string }>();
  if (!keys.length) return out;

  const companyCanon = company ? makeCompanyCanonical(company) : undefined;

  for (let i = 0; i < keys.length; i += 10) {
    const part = keys.slice(i, i + 10);
    const base = [where('agentId', '==', agentId), where('policyNumberKey', 'in', part)];
    const qy = companyCanon
      ? query(collection(db, 'policyLinkIndex'), ...base, where('company', '==', companyCanon))
      : query(collection(db, 'policyLinkIndex'), ...base);

    const snap = await getDocs(qy);
    snap.forEach((d) => {
      const x = d.data() as any;
      if (x?.saleId && x?.policyNumberKey) {
        out.set(String(x.policyNumberKey), {
          saleId: String(x.saleId),
          customerId: x.customerId ? String(x.customerId) : undefined,
        });
      }
    });
  }
  return out;
}

/* ------------ סכום מתוך policyCommissionSummaries ------------ */
async function fetchSummaryTotalsFromPolicySummaries(params: {
  agentId: string;
  customerIds: string[];
  reportYm: string; // YYYY-MM
  company?: string; // שם חברה (לא companyId)
}): Promise<{ totalCommission: number; count: number }> {
  const { agentId, customerIds, reportYm, company } = params;

  const rows: Array<{ totalCommissionAmount: number }> = [];
  for (let i = 0; i < customerIds.length; i += 10) {
    const chunk = customerIds.slice(i, i + 10);
    const q = query(
      collection(db, 'policyCommissionSummaries'),
      where('agentId', '==', agentId),
      where('reportMonth', '==', reportYm),
      where('customerId', 'in', chunk),
      ...(company ? [where('company', '==', company)] : [])
    );
    const snap = await getDocs(q);
    snap.forEach((docSnap) => {
      const d = docSnap.data() as any;
      rows.push({ totalCommissionAmount: num(d.totalCommissionAmount) });
    });
  }

  const totalCommission = Math.round(rows.reduce((sum, r) => sum + num(r.totalCommissionAmount), 0));
  return { totalCommission, count: rows.length };
}

/* ----------------------- MAIN ----------------------- */
/** 
 * options אופציונלי – לצרכי “מצב יבש” (התאמה לקומפוננטה). 
 * כרגע הפונקציה לא מבצעת כתיבות, אז הדגלים אינרטיים — אבל מועברים מטעמי API-compat.
 */
export async function buildHeaderTotals(
  params: {
    agentId: string;
    customerIds: string[];
    company?: string;
    reportYm: string; // YYYY-MM
    isSplitOn: boolean;
    contracts: ContractForCompareCommissions[];
    productMap: Record<string, Product>;
  },
  options?: {
    dryRun?: boolean;
    noAutoCreate?: boolean;
    noAutoLink?: boolean;
  }
): Promise<HeaderTotals> {
  const { agentId, customerIds, company, reportYm, isSplitOn, contracts, productMap } = params;
  void options; // currently no side-effects here; kept for interface parity

  // 1) סכום "קבצים" מתוך policyCommissionSummaries
  const sumRes = await fetchSummaryTotalsFromPolicySummaries({
    agentId,
    customerIds,
    reportYm,
    company,
  });
  const external = num(sumRes.totalCommission);

  // 2) שולפים את שורות ה־EXTERNAL הגולמיות (כדי לדעת validMonth ולקבוע סטטוס שיוך)
  const buckets = await fetchExternalForCustomers({
    agentId,
    customerIds,
    reportFromYm: reportYm,
    reportToYm: reportYm,
    company,
  });

  const extRows = buckets.flatMap((b: any) => b.rows).map((r: any) => ({
    id: r.id,
    agentId: String(r.agentId ?? agentId),
    customerId: r.customerId != null ? String(r.customerId) : null,
    company: String(r.company || '').trim(),
    reportMonth: String(r.reportMonth || ''),
    validMonth: r.validMonth ? String(r.validMonth) : null,
    policyNumber: r.policyNumber != null ? String(r.policyNumber) : null,
    commissionAmount: num(r.commissionAmount),
    linkedSaleId: null as string | null, // ייקבע לפי אינדקס, לא סומכים על שדה DB
  }));

  // 2.א) קובעים שיוך לפי policyLinkIndex
  const keys = Array.from(new Set(extRows.map((r) => normalizePolicyKey(r.policyNumber)).filter(Boolean)));
  const idxMap = await lookupPolicyLinksInHeader({ agentId, policyNumberKeys: keys, company });

  const extRowsWithLink = extRows.map((r) => {
    const k = normalizePolicyKey(r.policyNumber);
    const idx = k ? idxMap.get(k) : undefined;
    const custOk = idx?.customerId ? String(r.customerId || '') === idx.customerId : true;
    return idx && custOk ? { ...r, linkedSaleId: idx.saleId } : r;
  });

  const linked = extRowsWithLink.filter((r) => !!r.linkedSaleId).length;
  const needsLink = extRowsWithLink.length - linked;

  // 3) מפה לפיצול (ל-MAGIC)
  const nameMap: Record<string, { sourceValue?: string }> = {};
  for (let i = 0; i < customerIds.length; i += 10) {
    const chunk = customerIds.slice(i, i + 10);
    const qs = await getDocs(query(collection(db, 'customer'), where('IDCustomer', 'in', chunk)));
    qs.forEach((d) => {
      const x = d.data() as any;
      nameMap[String(x.IDCustomer)] = { sourceValue: x.sourceValue || '' };
    });
  }
  const splits = isSplitOn ? await fetchSplits(agentId) : [];

  function nifraimForSale(s: any, custId: string) {
    const productKey = String(s.product || '').trim();
    const contractMatch =
      contracts.find(
        (c) =>
          c.AgentId === agentId &&
          c.product === productKey &&
          c.company === String(s.company || '') &&
          (c.minuySochen === !!s.minuySochen || (c.minuySochen === undefined && !s.minuySochen))
      ) ||
      contracts.find(
        (c) =>
          c.AgentId === agentId &&
          c.productsGroup === (productMap[productKey]?.productGroup || '') &&
          (c.minuySochen === !!s.minuySochen || (c.minuySochen === undefined && !s.minuySochen))
      );

    const sourceVal = nameMap[custId]?.sourceValue || '';
    const sp = isSplitOn ? splits.find((x) => x.agentId === agentId && x.sourceLeadId === sourceVal) : undefined;

    const { commissionNifraim } = calculateCommissions(
      {
        product: s.product,
        company: s.company,
        insPremia: s.insPremia,
        pensiaPremia: s.pensiaPremia,
        pensiaZvira: s.pensiaZvira,
        finansimPremia: s.finansimPremia,
        finansimZvira: s.finansimZvira,
        minuySochen: s.minuySochen,
      } as any,
      contractMatch,
      contracts,
      productMap,
      agentId,
      { splitPercent: sp?.percentToAgent }
    );
    return num(commissionNifraim);
  }

  // 4) MAGIC לפי validMonth (Apples-to-Apples) — נשען על extRows לדעת validMonth
  let magicByValid = 0;
  type Key = string;
  const groups = new Map<Key, { custId: string; comp: string; validYm: string }>();
  for (const r of extRowsWithLink) {
    const custId = String(r.customerId || '');
    const comp = String(r.company || '');
    const validYm = String(r.validMonth || '').slice(0, 7);
    if (!custId || !validYm) continue;
    groups.set(`${custId}::${comp}::${validYm}`, { custId, comp, validYm });
  }

  for (const g of groups.values()) {
    const qs = await getDocs(
      query(
        collection(db, 'sales'),
        where('AgentId', '==', agentId),
        where('IDCustomer', '==', g.custId),
        ...(g.comp ? [where('company', '==', g.comp)] : [])
      )
    );
    const saleDocs = qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const sameMonthActive = saleDocs
      .filter((s) => String(s.month || s.mounth || '').slice(0, 7) === g.validYm)
      .filter((s) => !s.statusPolicy || ['פעילה', 'הצעה'].includes(s.statusPolicy));
    for (const s of sameMonthActive) {
      magicByValid += nifraimForSale(s, String(s.IDCustomer || ''));
    }
  }

  // 5) MAGIC תמונת מצב
  let magicSnapshot = 0;
  for (let i = 0; i < customerIds.length; i += 10) {
    const chunk = customerIds.slice(i, i + 10);
    const qs = await getDocs(
      query(
        collection(db, 'sales'),
        where('AgentId', '==', agentId),
        where('IDCustomer', 'in', chunk),
        ...(company ? [where('company', '==', company)] : [])
      )
    );
    const saleDocs = qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    const active = saleDocs.filter((s) => !s.statusPolicy || ['פעילה', 'הצעה'].includes(s.statusPolicy));
    for (const s of active) {
      magicSnapshot += nifraimForSale(s, String(s.IDCustomer || ''));
    }
  }

  const magicByValidR = Math.round(num(magicByValid));
  const magicSnapshotR = Math.round(num(magicSnapshot));
  const externalR = Math.round(num(external));

  return {
    external: externalR,                                 // מסוכם מ-policyCommissionSummaries
    magicByValid: magicByValidR,
    magicSnapshot: magicSnapshotR,
    deltaByValid: Math.round(externalR - magicByValidR),
    deltaSnapshot: Math.round(externalR - magicSnapshotR),
    linked,
    needsLink,
    noCandidates: 0,
  };
}
