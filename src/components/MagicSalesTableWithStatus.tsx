// components/MagicSalesTableWithStatus.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

// types כלליים שלך — אם יש לך כבר, משתמשים בהם
type SaleRow = {
  id: string;
  IDCustomer?: string | null;
  company?: string | null;
  product?: string | null;
  month?: string | null;
  mounth?: string | null;
  commissionNifraim?: number | null; // אם כבר מחושב ושמור; אחרת תעבירי את המחושב מבחוץ כ-prop
};

type Props = {
  agentId: string;
  repYm: string;
  company?: string;
  rows: (SaleRow & { magicNifraim?: number })[]; // תעבירי לתוך rows גם את ה-magicNifraim המחושב שלך
  customerIds: string[]; // לצמצום חיפושי הקישורים (לא חובה אבל מומלץ)
};

type LinkRow = {
  extId: string;
  saleId: string;
  reportMonth: string;   // YYYY-MM
  company: string;
  policyMonth: string;   // YYYY-MM
};

type ExtRow = { id: string; commissionAmount?: number | null };

export default function MagicSalesTableWithStatus({ agentId, repYm, company, rows, customerIds }: Props) {
  const [linkBySaleId, setLinkBySaleId] = useState<Record<string, string /* extId */>>({});
  const [extAmountsByExtId, setExtAmountsByExtId] = useState<Record<string, number>>({});

  // טוענים קישורים של החודש/חברה/סוכן (ומצמצמים ל-saleIds הרלוונטיים)
  useEffect(() => {
    (async () => {
      if (!agentId || !repYm) return;

      const qLinks = query(
        collection(db, 'commissionLinks'),
        where('agentId', '==', agentId),
        where('reportMonth', '==', repYm),
        ...(company ? [where('company', '==', company)] : [])
      );

      const snap = await getDocs(qLinks);
      const mapSaleToExt: Record<string, string> = {};
      const extIds: string[] = [];

      snap.forEach(d => {
        const L = d.data() as LinkRow;
        // למקד ל-saleIds מתוך הטבלה, כדי לא לטעון דברים לא קשורים
        if (rows.some(r => r.id === L.saleId)) {
          mapSaleToExt[L.saleId] = L.extId;
          extIds.push(L.extId);
        }
      });

      setLinkBySaleId(mapSaleToExt);

      // טוענים את סכומי הקובץ לאותם extIds
      if (extIds.length > 0) {
        const unique = Array.from(new Set(extIds));
        const extAmts: Record<string, number> = {};
        for (let i = 0; i < unique.length; i += 10) {
          const chunk = unique.slice(i, i + 10);
          const qExt = query(collection(db, 'externalCommissions'), where('__name__', 'in', chunk));
          const s = await getDocs(qExt);
          s.forEach(d => {
            const E = d.data() as ExtRow;
            extAmts[d.id] = typeof E.commissionAmount === 'number'
              ? E.commissionAmount
              : Number(E.commissionAmount || 0);
          });
        }
        setExtAmountsByExtId(extAmts);
      } else {
        setExtAmountsByExtId({});
      }
    })();
  }, [agentId, repYm, company, rows.map(r => r.id).join(',')]);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr>
          <th className="p-2 text-right">שם פרטי</th>
          <th className="p-2 text-right">שם משפחה</th>
          <th className="p-2 text-right">ת״ז</th>
          <th className="p-2 text-right">מוצר</th>
          <th className="p-2 text-right">חברה</th>
          <th className="p-2 text-right">חודש פוליסה</th>
          <th className="p-2 text-right">נפרעים (MAGIC)</th>
          <th className="p-2 text-right">נפרעים (EXTERNAL)</th>
          <th className="p-2 text-right">דלתא</th>
          <th className="p-2 text-right">סטטוס קישור</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const extId = linkBySaleId[r.id];
          const extAmt = extId ? (extAmountsByExtId[extId] ?? 0) : 0;
          const magicAmt = Math.round(Number(r.magicNifraim ?? r.commissionNifraim ?? 0));
          const delta = extId ? (extAmt - magicAmt) : 0;
          const linked = !!extId;

          return (
            <tr key={r.id} className={linked ? '' : 'bg-yellow-50'}>
              {/* ← מלאי כאן את פרטי הלקוח אם יש לך אותם בהקשר */}
              <td className="p-2">{/* firstName */}</td>
              <td className="p-2">{/* lastName */}</td>
              <td className="p-2">{r.IDCustomer}</td>
              <td className="p-2">{r.product}</td>
              <td className="p-2">{r.company}</td>
              <td className="p-2">{(r.month || r.mounth || '').slice(0, 7)}</td>
              <td className="p-2">{magicAmt ? magicAmt.toLocaleString() : '—'}</td>
              <td className="p-2">{linked ? extAmt.toLocaleString() : '—'}</td>
              <td className={`p-2 ${linked ? (delta === 0 ? '' : delta > 0 ? 'text-orange-700' : 'text-blue-700') : 'text-gray-400'}`}>
                {linked ? delta.toLocaleString() : '—'}
              </td>
              <td className="p-2">
                {linked ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs">
                    משוייך
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-xs">
                    דורש שיוך
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
