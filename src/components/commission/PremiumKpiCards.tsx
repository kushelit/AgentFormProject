'use client';

// src/components/commission/PremiumKpiCards.tsx
import React, { useEffect, useState } from 'react';
import type { PremiumCategory, PremiumKpis } from '@/utils/premiumKpis';

interface Props {
  agentId: string;
  year: string;
}

const fmt = (v: number) => v.toLocaleString('he-IL', { maximumFractionDigits: 0 });

type CardDef = {
  key: PremiumCategory;
  title: string;
  subLabel: string;
  border: string;
  color: string;
  bar: string;
  ring: string;
};

const CARD_DEFS: CardDef[] = [
  {
    key: 'finansimZvira',
    title: 'סה"כ צבירה פיננסית',
    subLabel: 'יתרה לחודש האחרון',
    border: 'border-r-emerald-500',
    color: 'text-emerald-600',
    bar: 'bg-emerald-500',
    ring: 'ring-emerald-300',
  },
  {
    key: 'pensiaPremia',
    title: 'סה"כ פרמיה פנסיה',
    subLabel: 'פרמיה חודשית',
    border: 'border-r-amber-500',
    color: 'text-amber-600',
    bar: 'bg-amber-500',
    ring: 'ring-amber-300',
  },
  {
    key: 'insPremia',
    title: 'סה"כ פרמיה ביטוח',
    subLabel: 'פרמיה חודשית',
    border: 'border-r-indigo-500',
    color: 'text-indigo-600',
    bar: 'bg-indigo-500',
    ring: 'ring-indigo-300',
  },
];

const PremiumKpiCards: React.FC<Props> = ({ agentId, year }) => {
  const [kpis, setKpis] = useState<PremiumKpis | null>(null);
  const [loading, setLoading] = useState(false);
  const [showStale, setShowStale] = useState(false);
  const [openCat, setOpenCat] = useState<PremiumCategory | null>(null);

  useEffect(() => {
    if (!agentId || !year) {
      setKpis(null);
      return;
    }
    let cancelled = false;

    (async () => {
      setLoading(true);
      setShowStale(false);
      setOpenCat(null);
      try {
        const res = await fetch('/api/commission-summary-premium-kpis', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, year }),
        });
        const data = res.ok ? ((await res.json()) as PremiumKpis) : null;
        if (!cancelled) setKpis(data);
      } catch {
        if (!cancelled) setKpis(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agentId, year]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[118px] bg-slate-100 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (!kpis || !kpis.latestMonth) {
    return (
      <div className="mb-6 px-4 py-3 text-sm text-slate-500 border rounded-2xl bg-white">
        אין טעינות לשנה {year}. טעני קובץ עמלות כדי לראות צבירה ופרמיות.
      </div>
    );
  }

  const { byCategory, latestMonth, staleTemplates } = kpis;
  const openDef = openCat ? CARD_DEFS.find((c) => c.key === openCat)! : null;
  const openData = openCat ? byCategory[openCat] : null;

  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-base font-black text-slate-800">תמונת תיק נוכחית</h3>
        <span className="text-xs text-slate-500">לפי חודש הפרסום האחרון של כל תבנית</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {CARD_DEFS.map((c) => {
          const data = byCategory[c.key];
          const isOpen = openCat === c.key;
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => setOpenCat(isOpen ? null : c.key)}
              className={`text-right bg-white p-5 rounded-2xl shadow-sm border border-slate-200 border-r-4 ${c.border} hover:shadow-md transition ${
                isOpen ? `ring-2 ${c.ring}` : ''
              }`}
              title="לחצי לפילוח לפי חברה"
            >
              <div className="flex items-center justify-between">
                <div className="text-slate-500 text-xs font-bold">{c.title}</div>
                <span className="text-slate-400 text-[10px]">{isOpen ? '▲' : '▼'}</span>
              </div>
              <div className={`text-2xl font-black mt-1 ${c.color}`}>{fmt(data.amount)} ₪</div>
              <div className="text-[11px] text-slate-400 mt-2">
                {fmt(data.policies)} פוליסות · {c.subLabel}
              </div>
            </button>
          );
        })}

        {/* חודש פרסום אחרון */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 border-r-4 border-r-slate-400">
          <div className="text-slate-500 text-xs font-bold">חודש פרסום אחרון</div>
          <div className="text-2xl font-black mt-1 text-slate-800">{latestMonth}</div>
          {staleTemplates.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowStale((v) => !v)}
              className="text-[11px] text-amber-700 font-semibold mt-2 hover:underline text-right"
            >
              ⚠️ {staleTemplates.length} תבניות עדיין בחודש קודם {showStale ? '▲' : '▼'}
            </button>
          ) : (
            <div className="text-[11px] text-emerald-600 mt-2">כל התבניות פורסמו לחודש זה</div>
          )}
        </div>
      </div>

      {/* דריל-דאון לפי חברה */}
      {openDef && openData && (
        <div className="mt-3 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
            <div className="font-bold text-slate-700 text-sm">
              {openDef.title} — פילוח לפי חברה
            </div>
            <button
              type="button"
              onClick={() => setOpenCat(null)}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              סגור ✕
            </button>
          </div>

          {openData.byCompany.length === 0 ? (
            <div className="p-4 text-sm text-slate-500">אין נתונים בקטגוריה זו.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-right">
                <thead className="text-slate-500 text-xs">
                  <tr className="border-b">
                    <th className="px-4 py-2 font-bold">חברה</th>
                    <th className="px-4 py-2 font-bold">חודש פרסום</th>
                    <th className="px-4 py-2 font-bold">פוליסות</th>
                    <th className="px-4 py-2 font-bold">סכום</th>
                    <th className="px-4 py-2 font-bold w-[35%]">נתח</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {openData.byCompany.map((row) => {
                    const share = openData.amount ? (row.amount / openData.amount) * 100 : 0;
                    const isOldMonth = row.months.some((m) => m < latestMonth);
                    return (
                      <tr key={row.company} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-semibold text-slate-800">{row.company}</td>
                        <td className={`px-4 py-2 whitespace-nowrap ${isOldMonth ? 'text-amber-700' : 'text-slate-600'}`}>
                          {row.months.join(', ')}
                        </td>
                        <td className="px-4 py-2 text-slate-600">{fmt(row.policies)}</td>
                        <td className={`px-4 py-2 font-bold ${openDef.color}`}>{fmt(row.amount)} ₪</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                              <div className={`h-full ${openDef.bar}`} style={{ width: `${Math.max(share, 0)}%` }} />
                            </div>
                            <span className="text-xs text-slate-500 w-12 text-left">{share.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-slate-50 font-bold">
                    <td className="px-4 py-2">סה&quot;כ</td>
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2">{fmt(openData.policies)}</td>
                    <td className={`px-4 py-2 ${openDef.color}`}>{fmt(openData.amount)} ₪</td>
                    <td className="px-4 py-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {showStale && staleTemplates.length > 0 && (
        <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
          <div className="font-bold mb-1">
            תבניות אלו נכללו לפי חודש הפרסום האחרון שלהן, ולא לפי {latestMonth}:
          </div>
          <ul className="space-y-0.5">
            {staleTemplates.map((t) => (
              <li key={t.templateId}>
                {t.companyName ? `${t.companyName} – ` : ''}
                {t.templateName}: {t.month}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default PremiumKpiCards;