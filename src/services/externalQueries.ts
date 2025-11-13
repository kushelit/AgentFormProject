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
  validMonth?: string | null;   // נשתמש כאן כאליאס ל-reportMonth (לתאימות)
  commissionAmount?: number | null;
  linkedSaleId?: string | null;
};

export type ExternalSummaryBucket = {
  month: string;    // כאן זה יהיה reportMonth (YYYY-MM)
  company: string;  // normalized
  total: number;    // sum(commissionAmount)
  rows: ExternalRow[];
};

const toYm = (s?: string | null): string => (s || '').toString().slice(0, 7);
const norm = (v?: string | null): string => String(v ?? '').trim();

/**
 * מסכם נתוני "קובץ" מ-policyCommissionSummaries:
 * - סינון לפי agentId + customerIds
 * - סינון לפי reportMonth (reportFromYm–reportToYm, בפועל אצלנו אותו חודש)
 * - סינון אופציונלי לפי company
 * - סכימה לפי (reportMonth, company)
 */
export async function fetchExternalForCustomers(params: {
  agentId: string;
  customerIds: string[];
  reportFromYm: string; // YYYY-MM
  reportToYm: string;   // YYYY-MM
  company?: string;
}): Promise<ExternalSummaryBucket[]> {
  const { agentId, customerIds, reportFromYm, reportToYm, company } = params;

  if (!customerIds?.length) return [];

  const results: ExternalRow[] = [];

  for (let i = 0; i < customerIds.length; i += 10) {
    const chunk = customerIds.slice(i, i + 10);

    const base: any[] = [
      where('agentId', '==', agentId),
      where('customerId', 'in', chunk as any),
    ];

    // אצלך בדף הלקוח from/to זה אותו חודש, אבל נשאיר לוגיקה כללית
    if (reportFromYm === reportToYm) {
      base.push(where('reportMonth', '==', reportFromYm));
    } else {
      base.push(where('reportMonth', '>=', reportFromYm));
      base.push(where('reportMonth', '<=', reportToYm));
    }

    if (company) {
      base.push(where('company', '==', company));
    }

    const q1 = query(collection(db, 'policyCommissionSummaries'), ...base);
    const snap = await getDocs(q1);

    snap.forEach(d => {
      const raw = d.data() as any;

      const reportYm = toYm(raw.reportMonth);

      const amountRaw = raw.totalCommissionAmount ?? 0;
      const commissionAmount =
        typeof amountRaw === 'number'
          ? amountRaw
          : Number(amountRaw || 0);

      results.push({
        id: d.id,
        agentId: String(raw.agentId ?? agentId),
        customerId: raw.customerId != null ? String(raw.customerId) : null,
        company: raw.company ?? null,
        product: raw.product ?? null,
        policyNumber: raw.policyNumberKey ?? null,
        reportMonth: reportYm,
        validMonth: reportYm, // אליאס – אם יש קוד שמסתמך על זה
        commissionAmount,
        linkedSaleId: raw.linkedSaleId ?? null,
      });
    });
  }

  const buckets = new Map<string, ExternalSummaryBucket>();

  for (const row of results) {
    const month = toYm(row.reportMonth);
    const comp = norm(row.company) || '-';
    const key = `${month}__${comp}`;

    const amt =
      typeof row.commissionAmount === 'number'
        ? row.commissionAmount
        : Number(row.commissionAmount || 0);

    if (!buckets.has(key)) {
      buckets.set(key, { month, company: comp, total: 0, rows: [] });
    }
    const b = buckets.get(key)!;
    b.total += amt || 0;
    b.rows.push(row);
  }

  return [...buckets.values()].sort((a, b) =>
    a.month === b.month
      ? a.company.localeCompare(b.company)
      : a.month.localeCompare(b.month)
  );
}
