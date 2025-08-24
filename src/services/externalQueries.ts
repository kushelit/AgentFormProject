// services/externalQueries.ts
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
  reportMonth: string;          // YYYY-MM
  validMonth?: string | null;   // YYYY-MM
  commissionAmount?: number | null;

  // ✅ הוספה:
  linkedSaleId?: string | null;
};

export type ExternalSummaryBucket = {
  month: string;    // validMonth (YYYY-MM)
  company: string;  // normalized
  total: number;    // sum(commissionAmount) אחרי סינון reportMonth
  rows: ExternalRow[]; // משאירים לשימוש בהמשך (לפי לקוח)
};

const toYm = (s?: string | null): string => (s || '').slice(0,7);
const norm = (v?: string | null): string => String(v ?? '').trim();

/**
 * מסכם EXTERNAL:
 * - מסנן חובה לפי reportMonth (reportFromYm–reportToYm)
 * - מסנן אופציונלית לפי company
 * - מדלג על שורות בלי validMonth (אין מפתח להשוואה מול SALE)
 * - מסכם לפי (validMonth, company) ומחזיר גם rows לשיוך לפי לקוח
 */
export async function fetchExternalForCustomers(params: {
  agentId: string;
  customerIds: string[];
  reportFromYm: string; // YYYY-MM (חובה)
  reportToYm: string;   // YYYY-MM (חובה)
  company?: string;     // אופציונלי
}): Promise<ExternalSummaryBucket[]> {
  const { agentId, customerIds, reportFromYm, reportToYm, company } = params;

  if (!customerIds?.length) return [];

  const results: ExternalRow[] = [];

  // Firestore 'in' מוגבל ל-10 → מפצלים לצברים
  for (let i = 0; i < customerIds.length; i += 10) {
    const chunk = customerIds.slice(i, i + 10);
    const q1 = query(
      collection(db, 'externalCommissions'),
      where('agentId', '==', agentId),
      where('customerId', 'in', chunk)
    );
    const snap = await getDocs(q1);
    // snap.forEach(d => results.push({ id: d.id, ...(d.data() as any) }));
    snap.forEach(d => {
      const raw = d.data() as any;
      results.push({
        id: d.id,
        ...raw, // נתחיל עם כל מה שבמסמך
    
        // ↓↓ דריסות/נרמולים כדי להבטיח טיפוסים עקביים ↓↓
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
    
        // ✅ חדש: שנשמר בזמן השיוך
        linkedSaleId: raw.linkedSaleId ?? null,
      });
    });
    
  }

  const cmp = norm(company);

  // סינון: reportMonth חובה, validMonth חובה להשוואה, חברה אופציונלית
  const filtered = results.filter(r => {
    const repYm = toYm(r.reportMonth);
    if (!repYm || repYm < reportFromYm || repYm > reportToYm) return false;

    const policyYm = toYm(r.validMonth);
    if (!policyYm) return false;

    const okCompany = cmp ? norm(r.company) === cmp : true;
    return okCompany;
  });

  // סכימה לפי (validMonth, company)
  const buckets = new Map<string, ExternalSummaryBucket>();
  for (const row of filtered) {
    const month = toYm(row.validMonth);
    const comp  = norm(row.company) || '-';
    const key   = `${month}__${comp}`;
    const amt   = typeof row.commissionAmount === 'number'
      ? row.commissionAmount
      : Number(row.commissionAmount || 0);

    if (!buckets.has(key)) {
      buckets.set(key, { month, company: comp, total: 0, rows: [] });
    }
    const b = buckets.get(key)!;
    b.total += amt || 0;   // ← זה הסכום שצריך לסכום
    b.rows.push(row);
  }

  return [...buckets.values()].sort((a,b) =>
    a.month === b.month ? a.company.localeCompare(b.company) : a.month.localeCompare(b.month)
  );
}
