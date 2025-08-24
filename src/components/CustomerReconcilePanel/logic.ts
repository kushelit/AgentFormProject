// components/CustomerReconcilePanel/logic.ts
'use client';

import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

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
  linkedSaleId?: string | null;    // ⬅️ משויך?
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
  policyNumber?: string | null;    // ⬅️ חדש — להצגה וגם אינדוקציה
  company?: string | null;
  reportMonth: string;
  validMonth?: string | null;
  commissionAmount?: number | null;
  score: number;
  breakdown: Breakdown;
  deltas: { amountDiff: number };
  linkedSaleId?: string | null;
};

/** Helpers */
export function norm(v?: string | null): string {
  return String(v ?? '')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .replace(/\s+/g, ' ');
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

/** Scoring breakdown */
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
  // משקולות: לקוח/חברה עיקריים, חודש משני
  const W = { customer: 60, company: 30, month: 10 };
  const b = buildBreakdown(ext, s);
  let score = 0;
  if (b.customerMatch) score += W.customer;
  if (b.companyMatch) score += W.company;
  if (b.monthMatch) score += W.month;
  return { score, breakdown: b };
}

/** Build candidates per SALE */
export async function buildCandidates(params: {
  agentId: string;
  customerIds: string[];
  company?: string;
  repYm?: string; // YYYY-MM, אופציונלי לסינון EXTERNAL לפי חודש דיווח
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
        // אם כבר משויך לרשומה אחרת – לא מציעים תחת SALE זה
        if (ext.linkedSaleId && ext.linkedSaleId !== s.id) return null;

        const { score, breakdown } = scoreMatch(ext, s);
        const finalScore = ext.linkedSaleId === s.id ? 100 : score;

        const extAmt =
          typeof ext.commissionAmount === 'number'
            ? ext.commissionAmount
            : Number(ext.commissionAmount || 0);
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
          linkedSaleId: ext.linkedSaleId ?? null,
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
