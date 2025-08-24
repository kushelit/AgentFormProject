// components/CustomerExternalOverview/index.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildHeaderTotals } from '@/services/reconcileHeader';
import { useRouter } from 'next/navigation';
import type { ContractForCompareCommissions } from '@/types/Contract';
import type { HeaderTotals } from '@/services/reconcileHeader';

type Contract = {
  id: string;
  company: string;
  product: string;
  productsGroup: string;
  agentId: string; // ייתכן שהורה מזין בשם הזה
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
  /** ברירות מחדל שמגיעות מהדף */
  initialCompany: string;
  initialRepYm: string;          // YYYY-MM
  initialSplitEnabled: boolean;

  /** כדי לחשב MAGIC כמו ב-NewCustomer (ייתכן ומגיע במבנה עם agentId) */
  contracts: Contract[];
  productMap: Record<string, Product>;

  /** סנכרון אופציונלי חזרה לדף האב */
  onParamsChange?: (p: {
    company: string;
    repYm: string;
    splitEnabled: boolean;
  }) => void;
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

  // בקרים פנימיים
  const [company, setCompany] = useState(initialCompany || '');
  const [repYm, setRepYm] = useState(initialRepYm || '');
  const [splitEnabled, setSplitEnabled] = useState(!!initialSplitEnabled);

  // סיכומים
  const [hdr, setHdr] = useState<HeaderTotals | null>(null);
  const [loading, setLoading] = useState(false);

  // מיפוי חוזים ל־ContractForCompareCommissions (AgentId במקום agentId)
  const contractsForCompare = useMemo<ContractForCompareCommissions[]>(() => {
    return (contracts || []).map((c) => ({
      id: c.id,
      company: c.company,
      product: c.product,
      productsGroup: c.productsGroup,
      AgentId: (c as any).AgentId ?? c.agentId ?? agentId, // יישור שם שדה
      commissionHekef: c.commissionHekef,
      commissionNifraim: c.commissionNifraim,
      commissionNiud: c.commissionNiud,
      minuySochen: !!c.minuySochen,
    }));
  }, [contracts, agentId]);

  // טען סיכומים
  useEffect(() => {
    if (!agentId || customerIds.length === 0 || !repYm) {
      setHdr(null);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const totals = await buildHeaderTotals({
          agentId,
          customerIds,
          company: company || undefined,  // ריק = כל החברות
          reportYm: repYm,
          isSplitOn: splitEnabled,
          contracts: contractsForCompare, // ← חשוב
          productMap,
        });
        setHdr(totals);
        // דיבוג
        console.log('[HDR]', totals);
      } finally {
        setLoading(false);
      }
    })();
  }, [
    agentId,
    customerIds.join(','),
    company,
    repYm,
    splitEnabled,
    contractsForCompare,
    productMap,
  ]);

  // סנכרון החוצה כשמשנים בקרים
  useEffect(() => {
    onParamsChange?.({ company, repYm, splitEnabled });
  }, [company, repYm, splitEnabled]); // eslint-disable-line

  // ניווט לדף השיוכים
  const reconcileQS = useMemo(() => {
    const p = new URLSearchParams();
    p.set('agentId', agentId);
    p.set('customerIds', customerIds.join(','));
    if (company) p.set('company', company);
    if (repYm) p.set('repYm', repYm);
    p.set('split', splitEnabled ? '1' : '0');
    return p.toString();
  }, [agentId, customerIds, company, repYm, splitEnabled]);

  function goToReconcile() {
    router.push(`/reconcile?${reconcileQS}`);
  }

  const tone = (v?: number | null) =>
    v == null ? 'neutral' : v === 0 ? 'neutral' : v > 0 ? 'warn' : 'ok';

  // דיבוג ערכי בקרה
  useEffect(() => {
    console.log('[UI] repYm=', repYm, 'company=', company, 'splitEnabled=', splitEnabled, 'agentId=', agentId, 'customerIds=', customerIds);
  }, [repYm, company, splitEnabled, agentId, customerIds]);

  return (
    <div dir="rtl" className="mt-4 border rounded-lg p-3 bg-white">
      {/* פס דיבוג קטן (להסרה אח"כ) */}
      <div className="text-xs text-gray-500 mt-2">
        דיבוג: repYm=<b>{repYm || '—'}</b>, חברה=<b>{company || 'כל'}</b>, פיצול=<b>{splitEnabled ? 'כן' : 'לא'}</b>
      </div>

      {/* בקרים */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col">
          <label className="text-xs text-gray-500">חודש דיווח (קובץ)</label>
          <input
            type="month"
            className="input"
            value={repYm}
            onChange={(e) => setRepYm(e.target.value)}
          />
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-500">חברה</label>
          <select
            className="select-input min-w-[180px]"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          >
            <option value="">כל החברות</option>
            {companies.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={splitEnabled}
            onChange={(e) => setSplitEnabled(e.target.checked)}
          />
          חישוב עם פיצול עמלות
        </label>

        <div className="ml-auto text-sm text-gray-500">
          {loading ? 'טוען…' : `נספרו ${hdr ? hdr.linked + hdr.needsLink : 0} רשומות בקובץ`}
        </div>
      </div>

      {/* כרטיסי סיכום */}
      <div className="mt-3 grid grid-cols-5 gap-3 text-center">
        <StatCard title="EXTERNAL — נפרעים" value={hdr?.external ?? 0} />

        <StatCard title="MAGIC לפי valid" value={hdr?.magicByValid ?? 0} />
        <StatCard
          title="דלתא (EXT − MAGIC-valid)"
          value={hdr?.deltaByValid ?? 0}
          highlight={tone(hdr?.deltaByValid)}
        />

        <StatCard title="MAGIC — תמונת מצב" value={hdr?.magicSnapshot ?? 0} />
        <StatCard
          title="דלתא (EXT − Snapshot)"
          value={hdr?.deltaSnapshot ?? 0}
          highlight={tone(hdr?.deltaSnapshot)}
        />
      </div>

      {/* שיוכים / מעבר לדף עבודה */}
      <div className="mt-3 flex items-center gap-3">
        <StatCard
          title="שיוכים"
          value={hdr?.linked ?? 0}
          subtitle={`דורשים שיוך: ${hdr?.needsLink ?? 0}`}
        />

        <button
          type="button"
          onClick={goToReconcile}
          className="px-3 py-2 border rounded bg-blue-600 text-white"
          disabled={!agentId || customerIds.length === 0 || !repYm}
        >
          לטיפול בשיוכים (דף עבודה)
        </button>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  highlight = 'neutral', // 'neutral' | 'warn' | 'ok'
}: {
  title: string;
  value: number;
  subtitle?: string;
  highlight?: 'neutral' | 'warn' | 'ok';
}) {
  const bg =
    highlight === 'warn' ? 'bg-orange-50' : highlight === 'ok' ? 'bg-blue-50' : 'bg-white';
  return (
    <div className={`border rounded p-3 ${bg}`}>
      <div className="text-xs text-gray-500">{title}</div>
      <div className="text-xl font-bold">{Number(value || 0).toLocaleString()}</div>
      {subtitle ? <div className="text-xs text-gray-500 mt-1">{subtitle}</div> : null}
    </div>
  );
}
