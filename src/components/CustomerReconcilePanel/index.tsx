// components/CustomerReconcilePanel/index.tsx
'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { buildCandidates, type Candidate } from './logic';

// ⬇️ שירות שיוך
import { linkExternalToSale } from '@/services/reconcileLinks';
import { db } from '@/lib/firebase/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ym } from '@/utils/reconcile';
import { useRouter } from 'next/navigation';

export default function CustomerReconcilePanel({
  agentId,
  customerIds,
  defaultCompany,
  repYm, // ⬅️ מומלץ להעביר (YYYY-MM)
}: {
  agentId: string;
  customerIds: string[];
  defaultCompany?: string;
  repYm?: string;
}) {
  const router = useRouter();
  const [company, setCompany] = useState(defaultCompany || '');
  const [data, setData] = useState<{ bySale: Map<string, Candidate[]>; stats: any } | null>(null);
  const [loading, setLoading] = useState(false);

  // ניווט לדף השיוכים עם פרמטרים
  const reconcileQS = useMemo(() => {
    const p = new URLSearchParams();
    p.set('agentId', agentId);
    p.set('customerIds', customerIds.join(','));
    if (company) p.set('company', company);
    if (repYm) p.set('repYm', repYm);
    return p.toString();
  }, [agentId, customerIds, company, repYm]);

  function goToReconcile() {
    router.push(`/reconcile?${reconcileQS}`);
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await buildCandidates({ agentId, customerIds, company, repYm });
      setData(res);
      setLoading(false);
    })();
  }, [agentId, customerIds.join(','), company, repYm]);

  async function handleAssign(ext: Candidate, saleId: string) {
    try {
      // מניעת שיוך כפול
      if (ext.linkedSaleId && ext.linkedSaleId !== saleId) {
        alert('הרשומה כבר משויכת לפוליסה אחרת');
        return;
      }
      if (ext.linkedSaleId === saleId) return;

      setLoading(true);

      const saleSnap = await getDoc(doc(db, 'sales', saleId));
      if (!saleSnap.exists()) {
        alert('לא נמצאה פוליסה במערכת (SALE) לשיוך');
        return;
      }
      const s = saleSnap.data() as any;

      const customerId   = String(s.IDCustomer || '');
      const policyMonth  = ym(s.month || s.mounth || ''); // YYYY-MM
      const comp         = (s.company?.toString()?.trim()) || (ext.company || '');
      const reportMonth  = ym(ext.reportMonth || '');
      const policyNumber = String(s.policyNumber || ext.policyNumber || '');

      if (!customerId || !policyMonth || !reportMonth) {
        alert('חסר מידע לשיוך (לקוח/חודש/חודש דיווח)');
        return;
      }

      await linkExternalToSale({
        extId: ext.extId,
        saleId,
        agentId,
        customerId,
        company: comp,
        policyMonth,
        reportMonth,
        policyNumber,
        linkSource: 'manual', 
      });

      // עדכון אופטימי — נסמן כמקושר
      setData(prev => {
        if (!prev) return prev;
        const clone = new Map(prev.bySale);
        const arr = (clone.get(saleId) || []).map(c =>
          c.extId === ext.extId ? { ...c, linkedSaleId: saleId } : c
        );
        clone.set(saleId, arr);
        return { ...prev, bySale: clone, stats: prev.stats };
      });
    } catch (e) {
      console.error(e);
      alert('אירעה שגיאה במהלך השיוך');
    } finally {
      setLoading(false);
    }
  }

  if (loading && !data) return <div className="text-gray-500">טוען התאמות…</div>;
  if (!data) return null;

  return (
    <div dir="rtl" className="border rounded p-3 bg-white">
      <div className="mb-3 flex gap-2 items-center">
        <label>חברה</label>
        <input
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="input"
          placeholder="למשל: מנורה"
          style={{ maxWidth: 180 }}
        />
        <div className="text-xs text-gray-500">
          נמצאו {data.stats.sales} פוליסות במערכת ו‑{data.stats.externals} רשומות EXTERNAL
        </div>
        <button className="ml-auto px-2 py-1 border rounded" onClick={goToReconcile}>
          מעבר למסך השוואה
        </button>
      </div>

      {[...data.bySale.entries()].map(([saleId, cands]) => (
        <div key={saleId} className="mb-4 border rounded">
          <div className="px-2 py-1 bg-gray-50 font-bold">SALE #{saleId}</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="p-2">ציון</th>
                <th className="p-2">חברה</th>
                <th className="p-2">מס׳ פוליסה</th>
                <th className="p-2">חודש (valid/report)</th>
                <th className="p-2">עמלה</th>
                <th className="p-2">שיוך</th>
              </tr>
            </thead>
            <tbody>
              {cands.map((c) => (
                <tr
                  key={c.extId}
                  className={c.linkedSaleId
                    ? 'bg-green-50'
                    : c.score >= 80
                      ? 'bg-green-50'
                      : c.score >= 60
                        ? 'bg-yellow-50'
                        : ''}
                >
                  <td className="p-2">{c.linkedSaleId ? '✓' : c.score}</td>
                  <td className="p-2">{c.company || '-'}</td>
                  <td className="p-2">{c.policyNumber || '-'}</td>
                  <td className="p-2">{(c.validMonth || '-') + ' / ' + (c.reportMonth || '-')}</td>
                  <td className="p-2">
                    {typeof c.commissionAmount === 'number'
                      ? c.commissionAmount.toLocaleString()
                      : '-'}
                  </td>
                  <td className="p-2">
                    <button
                      className="px-2 py-1 border rounded"
                      disabled={loading || !!c.linkedSaleId}
                      onClick={() => handleAssign(c, saleId)}
                      title={c.linkedSaleId ? 'הרשומה כבר מקושרת' : 'שייך'}
                    >
                      {c.linkedSaleId ? '✓ מקושר' : 'שיוך'}
                    </button>
                  </td>
                </tr>
              ))}
              {cands.length === 0 && (
                <tr>
                  <td className="p-2 text-gray-500" colSpan={6}>
                    אין הצעות
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
