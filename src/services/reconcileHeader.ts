// services/reconcileHeader.ts
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { fetchExternalForCustomers } from '@/services/externalQueries';
import { fetchSplits } from '@/services/splitsService';
import { calculateCommissions } from '@/utils/commissionCalculations';
import type { ContractForCompareCommissions } from '@/types/Contract';

type Product = { productName: string; productGroup: string; isOneTime?: boolean };

export type HeaderTotals = {
  external: number;

  // חדש: שני חישובי MAGIC
  magicByValid: number;     // לפי validMonth (התאמה לקובץ)
  magicSnapshot: number;    // תמונת מצב – כל הפוליסות הפעילות

  // שתי דלתות תואמות
  deltaByValid: number;     // external - magicByValid
  deltaSnapshot: number;    // external - magicSnapshot

  linked: number;
  needsLink: number;
  noCandidates: number;
};

export async function buildHeaderTotals(params: {
  agentId: string;
  customerIds: string[];
  company?: string;
  reportYm: string;                 // YYYY-MM (חודש הקובץ)
  isSplitOn: boolean;
  contracts: ContractForCompareCommissions[]; // שימי לב לשדה AgentId
  productMap: Record<string, Product>;
}): Promise<HeaderTotals> {
  const { agentId, customerIds, company, reportYm, isSplitOn, contracts, productMap } = params;

  // ============= 1) שליפת הקובץ (reportYm) + נירמול =============
  const buckets = await fetchExternalForCustomers({
    agentId, customerIds,
    reportFromYm: reportYm, reportToYm: reportYm,
    company,
  });

  const extRows = buckets.flatMap((b: any) => b.rows).map((r: any) => ({
    id: r.id,
    agentId: String(r.agentId ?? agentId),
    customerId: r.customerId != null ? String(r.customerId) : null,
    company: String(r.company || '').trim(),
    reportMonth: String(r.reportMonth || ''),
    validMonth: r.validMonth ? String(r.validMonth) : null,
    commissionAmount: typeof r.commissionAmount === 'number'
      ? r.commissionAmount : Number(r.commissionAmount || 0),
    linkedSaleId: r.linkedSaleId ?? null,
  }));

  const external = Math.round(extRows.reduce((a, r) => a + (r.commissionAmount || 0), 0));
  const linked = extRows.reduce((a, r) => a + (r.linkedSaleId ? 1 : 0), 0);
  const needsLink = extRows.length - linked;

  // מפה לפיצול
  const nameMap: Record<string, { sourceValue?: string }> = {};
  for (let i = 0; i < customerIds.length; i += 10) {
    const chunk = customerIds.slice(i, i + 10);
    const qs = await getDocs(query(collection(db, 'customer'), where('IDCustomer', 'in', chunk)));
    qs.forEach(d => {
      const x = d.data() as any;
      nameMap[String(x.IDCustomer)] = { sourceValue: x.sourceValue || '' };
    });
  }
  const splits = isSplitOn ? await fetchSplits(agentId) : [];

  // פונקציה עוזרת לחישוב נפרעים למכירה בודדת
  function nifraimForSale(s: any, custId: string) {
    const productKey = String(s.product || '').trim();
    const contractMatch =
      contracts.find(c =>
        c.AgentId === agentId &&
        c.product === productKey &&
        c.company === String(s.company || '') &&
        (c.minuySochen === !!s.minuySochen || (c.minuySochen === undefined && !s.minuySochen))
      ) ||
      contracts.find(c =>
        c.AgentId === agentId &&
        c.productsGroup === (productMap[productKey]?.productGroup || '') &&
        (c.minuySochen === !!s.minuySochen || (c.minuySochen === undefined && !s.minuySochen))
      );

    const sourceVal = nameMap[custId]?.sourceValue || '';
    const sp = isSplitOn ? splits.find(x => x.agentId === agentId && x.sourceLeadId === sourceVal) : undefined;

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
    return commissionNifraim || 0;
  }

  // ============= 2) MAGIC לפי validMonth (Apples-to-Apples) =============
  let magicByValid = 0;
  // מקבצים לפי (לקוח, חברה, validYm) — כדי למשוך sale פעם אחת לכל קבוצה
  type Key = string;
  const groups = new Map<Key, { custId: string; comp: string; validYm: string }>();
  for (const r of extRows) {
    const custId = String(r.customerId || '');
    const comp   = String(r.company || '');
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
    const saleDocs = qs.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const sameMonthActive = saleDocs
      .filter(s => String(s.month || s.mounth || '').slice(0, 7) === g.validYm)
      .filter(s => !s.statusPolicy || ['פעילה', 'הצעה'].includes(s.statusPolicy));

    for (const s of sameMonthActive) {
      magicByValid += nifraimForSale(s, String(s.IDCustomer || ''));
    }
  }

  // ============= 3) MAGIC תמונת מצב (כל הפוליסות הפעילות) =============
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
    const saleDocs = qs.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    const active = saleDocs.filter(s => !s.statusPolicy || ['פעילה', 'הצעה'].includes(s.statusPolicy));
    for (const s of active) {
      magicSnapshot += nifraimForSale(s, String(s.IDCustomer || ''));
    }
  }

  return {
    external,
    magicByValid: Math.round(magicByValid),
    magicSnapshot: Math.round(magicSnapshot),
    deltaByValid: Math.round(external - magicByValid),
    deltaSnapshot: Math.round(external - magicSnapshot),
    linked, needsLink,
    noCandidates: 0,
  };
}
