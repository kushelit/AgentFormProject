// app/reconcile/reconcile-client.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection, query, where, getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { linkPolicyNumberToSale, unlinkPolicyIndex } from '@/services/reconcileLinks';
import { ym, makeCompanyCanonical } from '@/utils/reconcile';
import { calculateCommissions } from '@/utils/commissionCalculations';
import type { ContractForCompareCommissions } from '@/types/Contract';
import { useSearchParams } from 'next/navigation';

/* ---------------- Types ---------------- */
type Props = { searchParams: Record<string, string> };

type ExternalRow = {
  id: string;
  agentId: string;
  customerId: string;
  company: string;
  product?: string | null;
  policyNumber?: string | null;
  reportMonth: string;       // YYYY-MM
  validMonth?: string | null;// YYYY-MM
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
  insPremia?: number;
  pensiaPremia?: number;
  pensiaZvira?: number;
  finansimPremia?: number;
  finansimZvira?: number;
  minuySochen?: boolean;
};

type Status = 'unchanged' | 'changed' | 'not_reported' | 'not_found';

type PickerOption = { id: string; label: string };

type RowView = {
  policyNumber: string;
  company: string;
  validYm: string;
  extAmount: number;
  magicAmount: number;
  diff: number;
  status: Status;
  ext?: ExternalRow | null;
  sale?: SaleRow | null;
  saleOptions?: PickerOption[]; // ← לשורות שניתן לקשר
};

/* ---------------- Helpers ---------------- */
const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const normalize = (v: any) => String(v ?? '').trim();
const normalizePolicyKey = (v: any) => normalize(v).replace(/\s+/g, '');
const toSaleLabel = (s: SaleRow) => `${ym(String(s.month || s.mounth || '')) || '—'} • ${String(s.product || '') || '—'}`;

async function fetchAgentName(agentId: string) {
  try {
    const snap = await getDocs(query(collection(db, 'agents'), where('id', '==', agentId)));
    const name = (snap.docs[0]?.data() as any)?.name;
    return name ? String(name) : agentId;
  } catch { return agentId; }
}

async function fetchCompaniesList(): Promise<string[]> {
  const snapshot = await getDocs(collection(db, 'company'));
  return snapshot.docs.map(d => (d.data() as any)?.companyName).filter(Boolean).sort();
}

async function fetchExternalRows(agentId: string, customerIds: string[], repYm: string, company?: string) {
  const rows: ExternalRow[] = [];
  for (let i = 0; i < customerIds.length; i += 10) {
    const chunk = customerIds.slice(i, i + 10);
    const qx = query(
      collection(db, 'externalCommissions'),
      where('agentId', '==', agentId),
      where('reportMonth', '==', repYm),
      where('customerId', 'in', chunk),
      ...(company ? [where('company', '==', company)] : []),
    );
    const snap = await getDocs(qx);
    snap.forEach(d => {
      const x = d.data() as any;
      rows.push({
        id: d.id,
        agentId: String(x.agentId || agentId),
        customerId: String(x.customerId || ''),
        company: String(x.company || ''),
        product: x.product ?? null,
        policyNumber: x.policyNumber ?? null,
        reportMonth: String(x.reportMonth || ''),
        validMonth: x.validMonth ? String(x.validMonth) : null,
        commissionAmount: num(x.commissionAmount),
      });
    });
  }
  return rows;
}

async function fetchSales(agentId: string, customerIds: string[], company?: string) {
  const rows: SaleRow[] = [];
  for (let i = 0; i < customerIds.length; i += 10) {
    const chunk = customerIds.slice(i, i + 10);
    const qy = query(
      collection(db, 'sales'),
      where('AgentId', '==', agentId),
      where('IDCustomer', 'in', chunk),
      ...(company ? [where('company', '==', company)] : []),
    );
    const snap = await getDocs(qy);
    snap.forEach(d => {
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
        insPremia: num(x.insPremia),
        pensiaPremia: num(x.pensiaPremia),
        pensiaZvira: num(x.pensiaZvira),
        finansimPremia: num(x.finansimPremia),
        finansimZvira: num(x.finansimZvira),
        minuySochen: !!x.minuySochen,
      });
    });
  }
  return rows.filter(s => !s.statusPolicy || ['פעילה', 'הצעה'].includes(String(s.statusPolicy)));
}

async function fetchContracts(agentId: string, company?: string) {
  const qy = query(collection(db, 'contracts'), where('AgentId', '==', agentId), ...(company ? [where('company', '==', company)] : []));
  const snap = await getDocs(qy);
  return snap.docs.map(d => d.data() as ContractForCompareCommissions);
}

async function fetchClaimedSaleIds(agentId: string, company?: string) {
  const claimed = new Set<string>();
  const qy = query(
    collection(db, 'policyLinkIndex'),
    where('agentId', '==', agentId),
    ...(company ? [where('company', '==', makeCompanyCanonical(company))] : []),
  );
  const snap = await getDocs(qy);
  snap.forEach(d => {
    const x = d.data() as any;
    if (x?.saleId) claimed.add(String(x.saleId));
  });
  return claimed;
}

/* ---------------- Component ---------------- */
export default function ReconcileClient({ searchParams: spFromPage }: Props) {
  const sp = useSearchParams();

  const agentId      = spFromPage.agentId   || sp.get('agentId')   || '';
  const companyInit  = (spFromPage.company  || sp.get('company')   || '').trim();
  const repYmInitial = spFromPage.repYm     || sp.get('repYm')     || '';
  const customerIds  = useMemo(() => {
    const s = spFromPage.customerIds || sp.get('customerIds') || '';
    return s.split(',').map(v => v.trim()).filter(Boolean);
  }, [spFromPage.customerIds, sp]);

  const [repYm, setRepYm] = useState(repYmInitial);
  const [company, setCompany] = useState(companyInit);
  const [agentName, setAgentName] = useState(agentId);
  const [companies, setCompanies] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // 0 נחשב סף (כמו שביקשת)
  const toleranceAmount = 0;
  const tolerancePercent = 0;

  const [groups, setGroups] = useState<{ unchanged: RowView[]; changed: RowView[]; not_reported: RowView[]; not_found: RowView[]; }>({
    unchanged: [], changed: [], not_reported: [], not_found: [],
  });

  useEffect(() => {
    (async () => {
      setAgentName(await fetchAgentName(agentId));
      setCompanies(await fetchCompaniesList());
    })();
  }, [agentId]);

  useEffect(() => {
    (async () => {
      if (!agentId || customerIds.length === 0 || !repYm) {
        setGroups({ unchanged: [], changed: [], not_reported: [], not_found: [] });
        return;
      }
      setLoading(true);
      try {
        const [extRowsRaw, salesAll, contracts, claimedSet] = await Promise.all([
          fetchExternalRows(agentId, customerIds, repYm, company || undefined),
          fetchSales(agentId, customerIds, company || undefined),
          fetchContracts(agentId, company || undefined),
          fetchClaimedSaleIds(agentId, company || undefined),
        ]);

        // מפות לפי מס' פוליסה
        const byExt = new Map<string, ExternalRow>();
        for (const r of extRowsRaw) {
          const key = normalize(r.policyNumber);
          if (key) byExt.set(key, r);
        }
        const bySale = new Map<string, SaleRow>();
        for (const s of salesAll) {
          const key = normalize(s.policyNumber);
          if (key) bySale.set(key, s);
        }

        // איחוד כל הפוליסות
        const policies = Array.from(new Set<string>([
          ...Array.from(byExt.keys()),
          ...Array.from(bySale.keys()),
        ]));

        const out: RowView[] = [];

        for (const p of policies) {
          const ext  = byExt.get(p)  || null;
          const sale = bySale.get(p) || null;

          const validYm = ext ? ym(ext.validMonth || ext.reportMonth) : ym(String(sale?.month || sale?.mounth || ''));
          const extAmount = ext ? num(ext.commissionAmount) : 0;

          // MAGIC
          let magicAmount = 0;
          if (sale) {
            const contractMatch =
              contracts.find(c =>
                c.AgentId === agentId &&
                c.company === String(sale.company) &&
                (c as any).product === String(sale.product) &&
                (!!(c as any).minuySochen === !!sale.minuySochen)
              ) || undefined;

            const commissions = calculateCommissions(sale as any, contractMatch, contracts, {} as any, agentId);
            magicAmount = num((commissions as any)?.commissionNifraim);
          }

          // סטטוס
          let status: Status;
          if (!ext && sale) status = 'not_reported';
          else if (ext && !sale) status = 'not_found';
          else {
            const diff = magicAmount - extAmount;
            const diffPercent = extAmount === 0 ? (magicAmount === 0 ? 0 : 100) : Math.abs(diff) / extAmount * 100;
            status = (Math.abs(diff) <= toleranceAmount && diffPercent <= tolerancePercent) ? 'unchanged' : 'changed';
          }

          const row: RowView = {
            policyNumber: p,
            company: ext?.company || sale?.company || '',
            validYm,
            extAmount,
            magicAmount,
            diff: magicAmount - extAmount,
            status,
            ext,
            sale,
          };

          // הצעות קישור: רק כשיש EXT ואין SALE (כלומר 'not_found')
          if (ext && !sale) {
            const options = salesAll
              .filter(s => !claimedSet.has(s.id)) // לא תפוס כבר באינדקס
              .filter(s => s.IDCustomer === ext.customerId && s.company === row.company)
              .map(s => ({ id: s.id, label: toSaleLabel(s) }))
              .sort((a, b) => a.label.localeCompare(b.label));
            row.saleOptions = options;
          }

          out.push(row);
        }

        const sorter = (a: RowView, b: RowView) =>
          a.company.localeCompare(b.company) ||
          a.validYm.localeCompare(b.validYm) ||
          a.policyNumber.localeCompare(b.policyNumber);

        setGroups({
          unchanged: out.filter(r => r.status === 'unchanged').sort(sorter),
          changed: out.filter(r => r.status === 'changed').sort(sorter),
          not_reported: out.filter(r => r.status === 'not_reported').sort(sorter),
          not_found: out.filter(r => r.status === 'not_found').sort(sorter),
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [agentId, customerIds.join(','), company, repYm]);

  /* ---------------- Actions ---------------- */
  async function onLink(row: RowView, saleId: string) {
    const pn = normalize(row.policyNumber);
    if (!pn || !row.ext) return;

    await linkPolicyNumberToSale({
      saleId,
      agentId,
      customerId: row.ext.customerId,
      company: row.company,
      policyNumber: pn,
    });

    // ריענון מקומי: מעבירים את השורה לקבוצה הנכונה לאחר קישור
    setGroups(prev => {
      const all = [...prev.unchanged, ...prev.changed, ...prev.not_reported, ...prev.not_found]
        .map(r => (r.policyNumber === row.policyNumber ? { ...r, sale: { id: saleId } as any, saleOptions: [] } : r));
      const sorter = (a: RowView, b: RowView) =>
        a.company.localeCompare(b.company) ||
        a.validYm.localeCompare(b.validYm) ||
        a.policyNumber.localeCompare(b.policyNumber);
      return {
        unchanged: all.filter(r => r.status === 'unchanged').sort(sorter),
        changed: all.filter(r => r.status === 'changed').sort(sorter),
        not_reported: all.filter(r => r.status === 'not_reported').sort(sorter),
        not_found: all.filter(r => r.status === 'not_found').sort(sorter),
      };
    });
  }

  async function onUnlink(row: RowView) {
    const pn = normalize(row.policyNumber);
    if (!pn || !row.ext) return;

    await unlinkPolicyIndex({ agentId, company: row.company, policyNumber: pn });

    // ריענון מקומי: משחררים את הקישור
    setGroups(prev => {
      const all = [...prev.unchanged, ...prev.changed, ...prev.not_reported, ...prev.not_found]
        .map(r => (r.policyNumber === row.policyNumber ? { ...r, sale: null } : r));
      const sorter = (a: RowView, b: RowView) =>
        a.company.localeCompare(b.company) ||
        a.validYm.localeCompare(b.validYm) ||
        a.policyNumber.localeCompare(b.policyNumber);
      return {
        unchanged: all.filter(r => r.status === 'unchanged').sort(sorter),
        changed: all.filter(r => r.status === 'changed').sort(sorter),
        not_reported: all.filter(r => r.status === 'not_reported').sort(sorter),
        not_found: all.filter(r => r.status === 'not_found').sort(sorter),
      };
    });
  }

  /* ---------------- UI ---------------- */
  return (
    <div dir="rtl" className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-2xl font-bold mb-4">בדיקת התאמות ושיוך פוליסות</h1>

      {/* Controls */}
      <div className="mb-4 bg-white border rounded-xl p-4 grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        {/* חודש דיווח */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">חודש דיווח (קובץ)</label>
          <input type="month" value={repYm} onChange={(e) => setRepYm(e.target.value)} className="h-10 border rounded-lg px-3" />
        </div>

        {/* חברה */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">חברה</label>
          <select className="h-10 border rounded-lg px-3 bg-white" value={company} onChange={(e) => setCompany(e.target.value)}>
            <option value="">כל החברות</option>
            {companies.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
        </div>

        {/* סוכן/לקוחות */}
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">סוכן</label>
          <div className="h-10 border rounded-lg px-3 flex items-center bg-gray-50">{agentName}</div>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-500 mb-1">לקוחות</label>
          <div className="h-10 border rounded-lg px-3 flex items-center bg-gray-50">
            {customerIds.length ? customerIds.join(', ') : '—'}
          </div>
        </div>
      </div>

      <Section title={`עם פער (${groups.changed.length})`}>
        <RowsTable rows={groups.changed} onLink={onLink} onUnlink={onUnlink} />
      </Section>

      <Section title={`ללא פער (${groups.unchanged.length})`}>
        <RowsTable rows={groups.unchanged} onLink={onLink} onUnlink={onUnlink} />
      </Section>

      <Section title={`לא קיים בקובץ (${groups.not_reported.length})`}>
        <RowsTable rows={groups.not_reported} onLink={onLink} onUnlink={onUnlink} />
      </Section>

      <Section title={`לא קיים במערכת (${groups.not_found.length})`}>
        <RowsTable rows={groups.not_found} onLink={onLink} onUnlink={onUnlink} />
      </Section>

      {loading && <p className="text-gray-500 mt-4">טוען נתונים…</p>}
    </div>
  );
}

/* ---------- presentational ---------- */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 bg-white border rounded-xl">
      <header className="px-4 py-2 bg-gray-50 border-b text-lg font-semibold">{title}</header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function RowsTable({
  rows, onLink, onUnlink,
}: {
  rows: RowView[];
  onLink: (row: RowView, saleId: string) => void;
  onUnlink: (row: RowView) => void;
}) {
  if (!rows.length) return <div className="text-gray-500 px-2 py-4">אין פריטים.</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-50">
            <th className="p-2 text-right">מס׳ פוליסה</th>
            <th className="p-2 text-right">חברה</th>
            <th className="p-2 text-right">תאריך תחילה (valid)</th>
            <th className="p-2 text-right bg-sky-50">עמלה (קובץ)</th>
            <th className="p-2 text-right bg-emerald-50">עמלה (MAGIC)</th>
            <th className="p-2 text-right">פער ₪</th>
            <th className="p-2 text-right">פעולות</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.policyNumber}|${r.company}`} className="border-t">
              <td className="p-2">{r.policyNumber}</td>
              <td className="p-2">{r.company || '—'}</td>
              <td className="p-2">{r.validYm || '—'}</td>
              <td className="p-2 bg-sky-50">{r.extAmount.toLocaleString()}</td>
              <td className="p-2 bg-emerald-50">{r.magicAmount.toLocaleString()}</td>
              <td className="p-2">{r.diff.toLocaleString()}</td>
              <td className="p-2">
                <RowActions row={r} onLink={onLink} onUnlink={onUnlink} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowActions({
  row, onLink, onUnlink,
}: {
  row: RowView;
  onLink: (row: RowView, saleId: string) => void;
  onUnlink: (row: RowView) => void;
}) {
  const [val, setVal] = useState('');
  const canUnlink = !!row.ext && !!row.sale;
  const canLink   = !!row.ext && !row.sale;

  if (canLink) {
    return (
      <div className="flex gap-2">
        <select
          className="h-8 border rounded-md px-2 bg-white min-w-[220px]"
          value={val}
          onChange={(e) => setVal(e.target.value)}
        >
          <option value="">בחר SALE לקישור…</option>
          {(row.saleOptions || []).map(o => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        <button
          className="h-8 px-3 rounded-md border bg-white hover:bg-gray-50 disabled:opacity-50"
          onClick={() => val && onLink(row, val)}
          disabled={!val}
          title="קשר SALE נבחר"
        >
          קשר
        </button>
      </div>
    );
  }

  if (canUnlink) {
    return (
      <button
        onClick={() => onUnlink(row)}
        className="h-8 px-3 rounded-md border text-red-600 hover:bg-red-50"
        title="נתק קישור"
      >
        נתק
      </button>
    );
  }

  return <span className="text-gray-400 text-xs">אין פעולות</span>;
}
