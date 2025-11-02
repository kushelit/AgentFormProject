// components/CustomerExternalOverview/index.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildHeaderTotals } from '@/services/reconcileHeader';
import type { ContractForCompareCommissions } from '@/types/Contract';
import type { HeaderTotals } from '@/services/reconcileHeader';

type Contract = {
  id: string;
  company: string;
  product: string;
  productsGroup: string;
  agentId?: string;
  AgentId?: string;
  commissionHekef: number;
  commissionNifraim: number;
  commissionNiud: number;
  minuySochen?: boolean;
};

type Product = { productName: string; productGroup: string; isOneTime?: boolean };

type Props = {
  agentId: string;
  customerIds: string[];
  companies: string[];
  initialCompany: string;
  initialRepYm: string; // YYYY-MM
  initialSplitEnabled: boolean;
  contracts: Contract[];
  productMap: Record<string, Product>;
  onParamsChange?: (p: { company: string; repYm: string; splitEnabled: boolean }) => void;
};

export default function CustomerExternalOverview({
  agentId,
  customerIds,
  companies,
  initialCompany,
  initialRepYm,
  initialSplitEnabled,
  contracts,
  productMap,
  onParamsChange,
}: Props) {
  const router = useRouter();

  const [company, setCompany] = useState(initialCompany || '');
  const [repYm, setRepYm] = useState(initialRepYm || '');
  const [splitEnabled, setSplitEnabled] = useState(!!initialSplitEnabled);

  const [hdr, setHdr] = useState<HeaderTotals | null>(null);
  const [loading, setLoading] = useState(false);

  const contractsForCompare = useMemo<ContractForCompareCommissions[]>(() => {
    return (contracts || []).map((c) => ({
      id: c.id,
      company: c.company,
      product: c.product,
      productsGroup: c.productsGroup,
      AgentId: (c as any).AgentId ?? (c as any).agentId ?? agentId,
      commissionHekef: c.commissionHekef ?? 0,
      commissionNifraim: c.commissionNifraim ?? 0,
      commissionNiud: c.commissionNiud ?? 0,
      minuySochen: !!c.minuySochen,
    }));
  }, [contracts, agentId]);

  useEffect(() => {
    if (!agentId || customerIds.length === 0 || !repYm) {
      setHdr(null);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const totals = await buildHeaderTotals(
          {
            agentId,
            customerIds,
            company: company || undefined,
            reportYm: repYm,
            isSplitOn: splitEnabled,
            contracts: contractsForCompare,
            productMap,
          },
          { dryRun: true } as any
        );
        setHdr(totals);
      } finally {
        setLoading(false);
      }
    })();
  }, [agentId, customerIds, company, repYm, splitEnabled, contractsForCompare, productMap]);

  useEffect(() => {
    onParamsChange?.({ company, repYm, splitEnabled });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company, repYm, splitEnabled]);

  const reconcileQS = useMemo(() => {
    const p = new URLSearchParams();
    p.set('agentId', agentId);
    p.set('customerIds', customerIds.join(','));
    if (company) p.set('company', company);
    if (repYm) p.set('repYm', repYm);
    p.set('split', splitEnabled ? '1' : '0');
    p.set('view', 'policies'); // ⬅️ מסך פירוט לפי פוליסות
    return p.toString();
  }, [agentId, customerIds, company, repYm, splitEnabled]);

  function goToReconcile() {
    router.push(`/reconcile?${reconcileQS}`);
  }

  const n = (v?: number | null) => Number(v ?? 0);
  const fmt = (v?: number | null) => n(v).toLocaleString('he-IL');
  const deltaTone = (v?: number | null) => (v == null || v === 0 ? 'neutral' : v > 0 ? 'warn' : 'ok');

  const hasExternal = !!hdr && ((n(hdr.linked) + n(hdr.needsLink)) > 0);
  const magicValue = hasExternal ? n(hdr?.magicByValid) : n(hdr?.magicSnapshot);
  const magicSubtitle = hasExternal
    ? 'חישוב לפי valid (Apples-to-Apples)'
    : 'תמונת מצב (אין קובץ טעינה לחודש)';
  const externalValue = n(hdr?.external);
  const deltaValue = externalValue - magicValue;

  return (
    <section dir="rtl" className="mt-5">
      <header className="mb-4">
        <h2 className="text-2xl font-bold tracking-tight text-gray-900">שווי לקוח בחברות הביטוח</h2>
        <p className="text-sm text-gray-600 mt-1">השוואת שווי עמלות במערכת מול עמלות מקבצי טעינה</p>
      </header>

      <div className="bg-white border rounded-2xl shadow-sm p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">חודש דיווח (קובץ)</label>
            <input
              type="month"
              className="input border rounded-xl h-10 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={repYm}
              onChange={(e) => setRepYm(e.target.value)}
            />
          </div>

          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">חברה</label>
            <select
              className="select-input border rounded-xl h-10 px-3 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[180px]"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
            >
              <option value="">כל החברות</option>
              {companies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col">
            <label className="text-xs text-gray-500 mb-1">פיצול עמלות</label>
            <button
              type="button"
              onClick={() => setSplitEnabled((v) => !v)}
              className={`h-10 rounded-xl border px-3 text-sm transition ${
                splitEnabled
                  ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
              aria-pressed={splitEnabled}
            >
              {splitEnabled ? 'מופעל' : 'מכובה'}
            </button>
          </div>

          <div className="flex md:justify-end gap-3">
            <div className="inline-flex items-center gap-2 h-10 px-3 rounded-xl border bg-gray-50 text-gray-700 text-sm">
              <span className="inline-block w-2 h-2 rounded-full bg-gray-400" />
              {loading
                ? 'טוען…'
                : `נספרו ${fmt(n(hdr?.linked) + n(hdr?.needsLink))} רשומות בקובץ`}
            </div>
            <button
              type="button"
              onClick={goToReconcile}
              className="h-10 px-4 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
              disabled={!agentId || customerIds.length === 0 || !repYm}
              title="קישור פוליסות מטעינה למערכת"
            >
              פירט פערים לפי פוליסה
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="שווי MAGIC" value={magicValue} subtitle={magicSubtitle} />
        <StatCard title="שווי קבצי טעינה" value={externalValue} />
        <StatCard title="דלתא (טעינה − MAGIC)" value={deltaValue} highlight={deltaTone(deltaValue)} />
      </div>

      <div className="mt-3 flex gap-3 text-sm text-gray-500">
        <Badge label={`שיוכים: ${fmt(hdr?.linked)}`} />
        <Badge label={`דורשים שיוך: ${fmt(hdr?.needsLink)}`} tone="warn" />
        {!hasExternal && <Badge label="אין קובץ טעינה לחודש זה" tone="warn" />}
      </div>
    </section>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  highlight = 'neutral',
}: {
  title: string;
  value: number | null | undefined;
  subtitle?: string;
  highlight?: 'neutral' | 'warn' | 'ok';
}) {
  const bg = highlight === 'warn' ? 'bg-orange-50' : highlight === 'ok' ? 'bg-blue-50' : 'bg-white';
  const ring =
    highlight === 'warn' ? 'ring-orange-200' : highlight === 'ok' ? 'ring-blue-200' : 'ring-gray-100';
  return (
    <article className={`border rounded-2xl p-4 ${bg} ring-1 ${ring}`}>
      <div className="text-xs text-gray-500">{title}</div>
      <div className="text-2xl font-bold leading-snug">{Number(value || 0).toLocaleString('he-IL')}</div>
      {subtitle ? <div className="text-xs text-gray-500 mt-1">{subtitle}</div> : null}
    </article>
  );
}

function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'warn' }) {
  const cls =
    tone === 'warn'
      ? 'bg-orange-100 text-orange-800 border-orange-200'
      : 'bg-gray-100 text-gray-800 border-gray-200';
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 h-7 rounded-full border text-xs ${cls}`}>
      {label}
    </span>
  );
}
