// app/reconcile/reconcile-client.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { linkPolicyNumberToSale, unlinkPolicyIndex, createSaleAndLinkFromExternal } from '@/services/reconcileLinks';
import { makeCompanyCanonical, ym } from '@/utils/reconcile';

/* ---------------- Types ---------------- */
type Props = { searchParams: Record<string, string> };

type ExternalRow = {
  id: string;
  agentId: string;
  customerId: string;
  company: string;
  product?: string | null;
  policyNumber?: string | null;
  reportMonth: string; // YYYY-MM
  validMonth?: string | null; // YYYY-MM
  commissionAmount: number;
};

type SaleRow = {
  id: string;
  AgentId: string;
  IDCustomer: string;
  company: string;
  product?: string | null;
  month?: string | null;
  mounth?: string | null;
  policyNumber?: string | null;
  statusPolicy?: string | null;
};

type LinkedItem = {
  ext: ExternalRow;
  sale: { id: string; product?: string | null; policyMonth: string };
};

type PendingItem = {
  ext: ExternalRow;
  saleOptions: { id: string; label: string }[];
};

/* ---------------- Helpers ---------------- */
const normalizePolicyKey = (v: any) => String(v ?? '').trim().replace(/\s+/g, '');

function toSaleLabel(s: SaleRow) {
  const labelMonth = ym(String(s.month || s.mounth || ''));
  const product = String(s.product || '');
  return `${labelMonth || '—'} • ${product || '—'}`;
}

async function fetchClaimedSaleIds(agentId: string, company?: string) {
  const claimed = new Set<string>();
  const qy = query(
    collection(db, 'policyLinkIndex'),
    where('agentId', '==', agentId),
    ...(company ? [where('company', '==', makeCompanyCanonical(company))] : [])
  );
  const snap = await getDocs(qy);
  snap.forEach((d) => {
    const x = d.data() as any;
    if (x?.saleId) claimed.add(String(x.saleId));
  });
  return claimed;
}

async function lookupIndexForKeys(agentId: string, company: string | undefined, keys: string[]) {
  const out = new Map<string, string>();
  const uniq = Array.from(new Set(keys.filter(Boolean)));
  for (let i = 0; i < uniq.length; i += 10) {
    const part = uniq.slice(i, i + 10);
    const qy = query(
      collection(db, 'policyLinkIndex'),
      where('agentId', '==', agentId),
      where('policyNumberKey', 'in', part),
      ...(company ? [where('company', '==', makeCompanyCanonical(company))] : [])
    );
    const snap = await getDocs(qy);
    snap.forEach((d) => {
      const x = d.data() as any;
      if (x?.policyNumberKey && x?.saleId) out.set(String(x.policyNumberKey), String(x.saleId));
    });
  }
  return out;
}

async function fetchSales(agentId: string, customerIds: string[], company?: string) {
  const rows: SaleRow[] = [];
  for (let i = 0; i < customerIds.length; i += 10) {
    const chunk = customerIds.slice(i, i + 10);
    const qy = query(
      collection(db, 'sales'),
      where('AgentId', '==', agentId),
      where('IDCustomer', 'in', chunk),
      ...(company ? [where('company', '==', company)] : [])
    );
    const snap = await getDocs(qy);
    snap.forEach((d) => {
      const x = d.data() as any;
      rows.push({
        id: d.id,
        AgentId: String(x.AgentId || ''),
        IDCustomer: String(x.IDCustomer || ''),
        company: String(x.company || ''),
        product: x.product ?? null,
        month: x.month ?? null,
        mounth: x.mounth ?? null,
        policyNumber: x.policyNumber ?? null,
        statusPolicy: x.statusPolicy ?? null,
      });
    });
  }
  return rows.filter((s) => !s.statusPolicy || ['פעילה', 'הצעה'].includes(String(s.statusPolicy)));
}


/* ---------------- Component ---------------- */
export default function ReconcileClient({ searchParams }: Props) {
  const agentId = searchParams.agentId || '';
  const company = (searchParams.company || '').trim();
  const repYmInitial = searchParams.repYm || '';
  const customerIds = useMemo(
    () => (searchParams.customerIds || '').split(',').map((s) => s.trim()).filter(Boolean),
    [searchParams.customerIds]
  );

  const [repYm, setRepYm] = useState(repYmInitial);
  const [loading, setLoading] = useState(false);

  const [linked, setLinked] = useState<LinkedItem[]>([]);
  const [pending, setPending] = useState<PendingItem[]>([]);

  useEffect(() => {
    (async () => {
      if (!agentId || customerIds.length === 0 || !repYm) {
        setLinked([]);
        setPending([]);
        return;
      }
      setLoading(true);
      try {
        // 1) external rows (by report month)
        const extRows: ExternalRow[] = [];
        for (let i = 0; i < customerIds.length; i += 10) {
          const chunk = customerIds.slice(i, i + 10);
          const qx = query(
            collection(db, 'externalCommissions'),
            where('agentId', '==', agentId),
            where('reportMonth', '==', repYm),
            where('customerId', 'in', chunk),
            ...(company ? [where('company', '==', company)] : [])
          );
          const snap = await getDocs(qx);
          snap.forEach((d) => {
            const x = d.data() as any;
            extRows.push({
              id: d.id,
              agentId: String(x.agentId || agentId),
              customerId: String(x.customerId || ''),
              company: String(x.company || ''),
              product: x.product ?? null,
              policyNumber: x.policyNumber ?? null,
              reportMonth: String(x.reportMonth || ''),
              validMonth: x.validMonth ? String(x.validMonth) : null,
              commissionAmount:
                typeof x.commissionAmount === 'number'
                  ? x.commissionAmount
                  : Number(x.commissionAmount || 0),
            });
          });
        }

        // 2) index by policy
        const keys = Array.from(
          new Set(extRows.map((e) => normalizePolicyKey(e.policyNumber)).filter(Boolean))
        );
        const idxMap = await lookupIndexForKeys(agentId, company || undefined, keys);

        // 3) sales + claimed
        const salesAll = await fetchSales(agentId, customerIds, company || undefined);
        const claimedSaleIds = await fetchClaimedSaleIds(agentId, company || undefined);
        const availableSales = salesAll.filter((s) => !claimedSaleIds.has(s.id));

        // 4) build tables
        const _linked: LinkedItem[] = [];
        const _pending: PendingItem[] = [];

        for (const ext of extRows) {
          const key = normalizePolicyKey(ext.policyNumber);
          const saleId = key ? idxMap.get(key) : undefined;

          if (saleId) {
            const s = salesAll.find((x) => x.id === saleId);
            _linked.push({
              ext,
              sale: {
                id: saleId,
                product: s?.product ?? null,
                policyMonth: ym(String(s?.month || s?.mounth || '')),
              },
            });
          } else {
            const options = availableSales
              .filter((s) => s.IDCustomer === ext.customerId && s.company === ext.company)
              .map((s) => ({ id: s.id, label: toSaleLabel(s) }))
              .sort((a, b) => a.label.localeCompare(b.label));

            _pending.push({ ext, saleOptions: options });
          }
        }

        setLinked(
          _linked.sort(
            (a, b) =>
              a.ext.company.localeCompare(b.ext.company) ||
              ym(a.ext.validMonth || '').localeCompare(ym(b.ext.validMonth || ''))
          )
        );
        setPending(
          _pending.sort(
            (a, b) =>
              a.ext.company.localeCompare(b.ext.company) ||
              ym(a.ext.validMonth || '').localeCompare(ym(b.ext.validMonth || ''))
          )
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [agentId, customerIds.join(','), company, repYm]);

  /* ---------------- Actions ---------------- */
  async function doLink(ext: ExternalRow, saleId: string) {
    const policyNumber = String(ext.policyNumber || '').trim();
    if (!policyNumber) return;

    await linkPolicyNumberToSale({
      saleId,
      agentId,
      customerId: ext.customerId,
      company: ext.company,
      policyNumber,
    });

    setPending((prev) => prev.filter((p) => p.ext.id !== ext.id));
    setLinked((prev) => [
      ...prev,
      {
        ext,
        sale: { id: saleId, product: '—', policyMonth: ym(ext.validMonth || ext.reportMonth) },
      },
    ]);
  }

  async function doCreateAndLink(ext: ExternalRow) {
    const pn = String(ext.policyNumber || '').trim();
    if (!pn) return;
  
    // יוצר SALE + מקשר באינדקס + דואג ללקוח + mounth=YYYY-MM-01 + פעילה
    const saleId = await createSaleAndLinkFromExternal({
      external: {
        agentId,
        customerId: ext.customerId,
        company: ext.company,
        product: ext.product || '',
        policyNumber: pn,
        validMonth: ext.validMonth || null,
        // firstNameCustomer / lastNameCustomer - אפשר להעביר אם יש לך
      },
      reportYm: ext.reportMonth
    });
  
    // אין צורך לקרוא כאן שוב ל-linkPolicyNumberToSale — זה כבר נעשה בתוך ה-service
  
    // עדכון UI
    setPending(prev => prev.filter(p => p.ext.id !== ext.id));
    setLinked(prev => [
      ...prev,
      {
        ext,
        sale: {
          id: saleId,
          product: ext.product ?? '—',
          // לתצוגה מספיק ה-YYYY-MM; ה־service שמר mounth כ-YYYY-MM-01
          policyMonth: ym(ext.validMonth || ext.reportMonth),
        },
      },
    ]);
  }
  

  async function doUnlink(ext: ExternalRow) {
    const pn = String(ext.policyNumber || '').trim();
    if (!pn) return;
    await unlinkPolicyIndex({ agentId, company: ext.company, policyNumber: pn });

    setLinked((prev) => prev.filter((x) => x.ext.id !== ext.id));
    setPending((prev) => [{ ext, saleOptions: [] }, ...prev]);
  }

  /* ---------------- UI ---------------- */
  return (
    <div dir="rtl" className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-4">בדיקת התאמות ושיוך פוליסות</h1>

    {/* Controls */}
<div className="mb-4 bg-white border rounded-xl p-4 flex flex-wrap gap-4 items-end">
  {/* חודש דיווח */}
  <div className="flex flex-col">
    <label className="text-xs text-gray-500 mb-1">חודש דיווח (קובץ)</label>
    <input
      type="month"
      value={repYm}
      onChange={(e) => setRepYm(e.target.value)}
      className="h-10 border rounded-lg px-3"
    />
  </div>

  {/* מטא: סוכן / לקוחות / חברה */}
  <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
    <span className="inline-flex items-center gap-1 h-9 px-3 rounded-xl border bg-gray-50">
      <span className="text-gray-500">סוכן:</span> <b>{agentId || '—'}</b>
    </span>
    <span className="inline-flex items-center gap-1 h-9 px-3 rounded-xl border bg-gray-50">
      <span className="text-gray-500">לקוחות:</span>{' '}
      <b>{customerIds.length ? customerIds.join(', ') : '—'}</b>
    </span>
    {company ? (
      <span className="inline-flex items-center gap-1 h-9 px-3 rounded-xl border bg-gray-50">
        <span className="text-gray-500">חברה:</span> <b>{company}</b>
      </span>
    ) : null}
  </div>

  {/* מצב טעינה קטן בצד ימין */}
  <div className="ml-auto text-sm text-gray-500">{loading ? 'טוען…' : null}</div>
</div>

      {/* Linked table */}
      <section className="mb-6 bg-white border rounded-xl p-4">
        <h2 className="text-lg font-semibold mb-3">פוליסות משוייכות ({linked.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                {/* מימין לשמאל */}
                <th className="p-2 text-right">מס׳ פוליסה</th>
                <th className="p-2 text-right">חברה</th>
                <th className="p-2 text-right">תאריך תחילה (valid)</th>
                <th className="p-2 text-right">טעינה – נפרעים</th>
                <th className="p-2 text-right">SALE</th>
                <th className="p-2 text-right">MAGIC – נפרעים</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {linked.map((row) => (
                <tr key={row.ext.id} className="border-t">
                  <td className="p-2">{row.ext.policyNumber || '—'}</td>
                  <td className="p-2">{row.ext.company || '—'}</td>
                  <td className="p-2">{ym(row.ext.validMonth || '') || '—'}</td>
                  <td className="p-2">{Number(row.ext.commissionAmount || 0).toLocaleString()}</td>
                  <td className="p-2">
                    {(row.sale.product || '—') + ' • ' + (row.sale.policyMonth || '—')}
                  </td>
                  <td className="p-2">—</td>
                  <td className="p-2">
                    <button
                      onClick={() => doUnlink(row.ext)}
                      className="h-8 px-3 rounded-md border text-red-600 hover:bg-red-50"
                      title="נתק קישור"
                    >
                      נתק קישור
                    </button>
                  </td>
                </tr>
              ))}
              {linked.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-gray-500">
                    אין רשומות משוייכות בחודש/חברה הנוכחיים.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pending table */}
      <section className="mb-6 bg-white border rounded-xl p-4">
        <h2 className="text-lg font-semibold mb-3">פוליסות מתוך טעינה — דורשות שיוך ({pending.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                {/* מימין לשמאל */}
                <th className="p-2 text-right">מס׳ פוליסה</th>
                <th className="p-2 text-right">חברה</th>
                <th className="p-2 text-right">מוצר</th>
                <th className="p-2 text-right">תאריך תחילה (valid)</th>
                <th className="p-2 text-right">טעינה – נפרעים</th>
                <th className="p-2 text-right">הצעות SALE</th>
                <th className="p-2 text-right">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((row) => (
                <tr key={row.ext.id} className="border-t">
                  <td className="p-2">{row.ext.policyNumber || '—'}</td>
                  <td className="p-2">{row.ext.company || '—'}</td>
                  <td className="p-2">{row.ext.product || '—'}</td>
                  <td className="p-2">{ym(row.ext.validMonth || '') || '—'}</td>
                  <td className="p-2">{Number(row.ext.commissionAmount || 0).toLocaleString()}</td>
                  <td className="p-2 w-[260px]">
                    <SalePicker
                      options={row.saleOptions}
                      onPick={(saleId) => doLink(row.ext, saleId)}
                    />
                  </td>
                  <td className="p-2">
                    <button
                      onClick={() => doCreateAndLink(row.ext)}
                      className="h-8 px-3 rounded-md bg-blue-600 text-white hover:bg-blue-700"
                      title="צור SALE וקשר"
                    >
                      צור SALE וקשר
                    </button>
                  </td>
                </tr>
              ))}
              {pending.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-gray-500">
                    אין רשומות דורשות שיוך.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ---------- Small sub-component: sale picker ---------- */
function SalePicker({
  options,
  onPick,
}: {
  options: { id: string; label: string }[];
  onPick: (saleId: string) => void;
}) {
  const [val, setVal] = useState('');
  return (
    <div className="flex gap-2">
      <select
        className="h-8 border rounded-md px-2 bg-white min-w-[220px]"
        value={val}
        onChange={(e) => setVal(e.target.value)}
      >
        <option value="">בחר SALE לקישור…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        className="h-8 px-3 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-50"
        onClick={() => val && onPick(val)}
        disabled={!val}
        title="קשר SALE נבחר"
      >
        קשר
      </button>
    </div>
  );
}
