// components/CustomerReconcilePanel/logic.ts
'use client';

import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { makeCompanyCanonical } from '@/utils/reconcile';

/* ---------- Types ---------- */
export type ExternalRow = {
  id: string;
  agentId: string;
  customerId?: string | null;
  company?: string | null;
  product?: string | null;
  policyNumber?: string | null;
  reportMonth: string;             // YYYY-MM
  validMonth?: string | null;      // YYYY-MM
  commissionAmount?: number | null;
  linkedSaleId?: string | null;    // ← שדה מ-EXTERNAL (אם קיים)
};

export type SaleRow = {
  id: string;
  AgentId: string;
  IDCustomer?: string | null;
  company?: string | null;
  product?: string | null;
  month?: string | null;           // YYYY-MM
  mounth?: string | null;          // לעתים מאוית כך
  policyNumber?: string | null;
  commissionNifraim?: number | null;
  statusPolicy?: string | null;
};

export type Breakdown = {
  companyMatch: boolean;
  monthMatch: boolean;
  customerMatch: boolean;
  agentMatch: boolean;
};

export type Candidate = {
  extId: string;
  policyNumber?: string | null;
  company?: string | null;
  reportMonth: string;
  validMonth?: string | null;
  commissionAmount?: number | null;
  score: number;
  breakdown: Breakdown;
  deltas: { amountDiff: number };
  linkedSaleId?: string | null;
};

/* ---------- Helpers ---------- */

// key אחיד בלי רווחים
const normalizePolicyKey = (v?: string | null) => String(v ?? '').trim().replace(/\s+/g, '');

// policyLinkIndex: agentId + policyNumberKey → saleId/customerId/company
async function lookupPolicyLinks(
  agentId: string,
  keys: string[] = []
): Promise<Map<string, { saleId: string; customerId?: string; company?: string }>> {
  const out = new Map<string, { saleId: string; customerId?: string; company?: string }>();
  const uniq = Array.from(new Set(keys.filter(Boolean)));

  for (let i = 0; i < uniq.length; i += 10) {
    const part = uniq.slice(i, i + 10);
    const qy = query(
      collection(db, 'policyLinkIndex'),
      where('agentId', '==', agentId),
      where('policyNumberKey', 'in', part)
    );
    const snap = await getDocs(qy);
    snap.forEach((d) => {
      const x = d.data() as any;
      if (x?.saleId && x?.policyNumberKey) {
        out.set(String(x.policyNumberKey), {
          saleId: String(x.saleId),
          customerId: x.customerId ? String(x.customerId) : undefined,
          company: x.company ? String(x.company) : undefined, // כבר קנוני
        });
      }
    });
  }
  return out;
}

export function norm(v?: string | null): string {
  return String(v ?? '').trim().replace(/^["']+|["']+$/g, '').replace(/\s+/g, ' ');
}
export function toYm(v?: string | null): string {
  if (!v) return '';
  const s = String(v).slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : '';
}
export function monthDiff(a?: string | null, b?: string | null): number {
  const ay = toYm(a), by = toYm(b);
  if (!ay || !by) return Infinity;
  const [ayr, amo] = ay.split('-').map(Number);
  const [byr, bmo] = by.split('-').map(Number);
  return Math.abs((ayr - byr) * 12 + (amo - bmo));
}

/* ---------- Scoring ---------- */
export function buildBreakdown(ext: ExternalRow, s: SaleRow): Breakdown {
  const companyMatch =
    !!norm(ext.company) && !!norm(s.company) && norm(ext.company) === norm(s.company);

  const saleMonth = toYm(s.month || s.mounth || '');
  const extMonth = toYm(ext.validMonth || ext.reportMonth || '');
  const mdiff = monthDiff(extMonth, saleMonth);
  const monthMatch = Number.isFinite(mdiff) && mdiff <= 1; // +/- חודש

  const customerMatch =
    !!ext.customerId && !!s.IDCustomer && String(ext.customerId) === String(s.IDCustomer);

  const agentMatch =
    !!ext.agentId && !!s.AgentId && String(ext.agentId) === String(s.AgentId);

  return { companyMatch, monthMatch, customerMatch, agentMatch };
}

export function scoreMatch(ext: ExternalRow, s: SaleRow) {
  const W = { customer: 60, company: 30, month: 10 };
  const b = buildBreakdown(ext, s);
  let score = 0;
  if (b.customerMatch) score += W.customer;
  if (b.companyMatch) score += W.company;
  if (b.monthMatch) score += W.month;
  return { score, breakdown: b };
}

/* ---------- Build candidates per SALE ---------- */
export async function buildCandidates(params: {
  agentId: string;
  customerIds: string[];
  company?: string;
  repYm?: string; // YYYY-MM
}): Promise<{ bySale: Map<string, Candidate[]>; stats: any }> {
  const { agentId, customerIds, company, repYm } = params;

  /* EXTERNAL */
  const qExt = query(collection(db, 'externalCommissions'), where('agentId', '==', agentId));
  const extSnap = await getDocs(qExt);
  let externals: ExternalRow[] = extSnap.docs.map((d) => {
    const raw = d.data() as any;
    return {
      id: d.id,
      agentId: String(raw.agentId ?? ''),
      customerId: raw.customerId != null ? String(raw.customerId) : null,
      company: raw.company ?? null,
      product: raw.product ?? null,
      policyNumber: raw.policyNumber ?? null,
      reportMonth: String(raw.reportMonth ?? ''),
      validMonth: raw.validMonth ? String(raw.validMonth) : null,
      commissionAmount:
        typeof raw.commissionAmount === 'number'
          ? raw.commissionAmount
          : Number(raw.commissionAmount || 0),
      linkedSaleId: raw.linkedSaleId ?? null,
    };
  });

  const cmp = (company || '').trim();
  externals = externals.filter((e) => {
    const okCust = customerIds?.length ? !!e.customerId && customerIds.includes(e.customerId) : true;
    if (!okCust) return false;
    const okComp = cmp ? norm(e.company) === cmp : true;
    const okRep = repYm ? toYm(e.reportMonth) === repYm : true;
    return okComp && okRep;
  });

  // policyNumberKey→saleId (מה־index)
  const keys = Array.from(new Set(externals.map(e => normalizePolicyKey(e.policyNumber)).filter(Boolean)));
  const idxMap = await lookupPolicyLinks(agentId, keys);

  // saleId→policyNumberKey (מי "תפוס")
  const saleTakenByKey = new Map<string, string>();
  idxMap.forEach((v, k) => { saleTakenByKey.set(v.saleId, k); });

  // הזרקת linkedSaleId מן האינדקס (אימות "רך" לקוח/חברה)
  externals = externals.map(e => {
    if (e.linkedSaleId) return e; // כבר משויך במסד
    const key = normalizePolicyKey(e.policyNumber);
    if (!key) return e;
    const idx = idxMap.get(key);
    if (!idx) return e;

    const custOk = idx.customerId ? String(e.customerId || '') === idx.customerId : true;
    const compOk = idx.company ? makeCompanyCanonical(e.company || '') === String(idx.company) : true;

    return (custOk && compOk) ? { ...e, linkedSaleId: idx.saleId } : e;
  });

  /* SALES */
  const qSales = query(collection(db, 'sales'), where('AgentId', '==', agentId));
  const salesSnap = await getDocs(qSales);
  let sales: SaleRow[] = salesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  sales = sales.filter((s) => {
    const okCompany = cmp ? norm(s.company) === cmp : true;
    const okCustomer = customerIds?.length
      ? s.IDCustomer && customerIds.includes(String(s.IDCustomer))
      : true;
    const okStatus = !s.statusPolicy || ['פעילה', 'הצעה'].includes(s.statusPolicy);
    return okCompany && okCustomer && okStatus;
  });

  /* קנדידטים לכל SALE */
  const bySale = new Map<string, Candidate[]>();

  for (const s of sales) {
    const candidates: Candidate[] = externals
      .map((ext) => {
        // 1) אם ה-EXTERNAL כבר משויך ל-SALE אחר — לא מציעים תחת SALE זה
        if (ext.linkedSaleId && ext.linkedSaleId !== s.id) return null;

        // 2) אם SALE תפוס ע"י key אחר — לא מציעים
        const extKey = normalizePolicyKey(ext.policyNumber);
        const takenKey = saleTakenByKey.get(s.id);
        if (takenKey && extKey && takenKey !== extKey) return null;

        const { score, breakdown } = scoreMatch(ext, s);
        const isExactFromIndex = takenKey && extKey && takenKey === extKey;
        const finalScore = (ext.linkedSaleId === s.id || isExactFromIndex) ? 100 : score;

        const extAmt = typeof ext.commissionAmount === 'number' ? ext.commissionAmount : Number(ext.commissionAmount || 0);
        const saleAmt = typeof s.commissionNifraim === 'number' ? s.commissionNifraim : 0;

        return {
          extId: ext.id,
          policyNumber: ext.policyNumber ?? null,
          company: ext.company,
          reportMonth: ext.reportMonth,
          validMonth: ext.validMonth,
          commissionAmount: extAmt,
          score: finalScore,
          breakdown,
          deltas: { amountDiff: (extAmt || 0) - (saleAmt || 0) },
          linkedSaleId: ext.linkedSaleId ?? (isExactFromIndex ? s.id : null),
        } as Candidate;
      })
      .filter((x): x is Candidate => !!x && x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    bySale.set(s.id, candidates);
  }

  const stats = { externals: externals.length, sales: sales.length };
  return { bySale, stats };
}
