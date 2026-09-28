'use client';
// src/components/commission/summary/EfficiencySection.tsx
// יעילות תיק — נפרעים למשק בית, עומק תיק, פוטנציאל, רשימת עבודה, והמלצה לקשר משפחות.
import React, { useMemo, useState } from 'react';
import type { EfficiencySummary } from '@/types/agentInsights';
import KpiCard from './KpiCard';
import CustomerLink from './CustomerLink';
import CustomerIssueBar from './CustomerIssueBar';
import CustomerImportFromCommissions from '@/components/customers/CustomerImportFromCommissions';
import useOpenCustomer from '@/hooks/useOpenCustomer';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from './charts';
import { fmtInt, fmtMoney } from './ui';
import t from './table.module.css';

interface Props {
  agentId: string;
  efficiency: EfficiencySummary;
}

const CUSTOMERS_PAGE = '/NewCustomer';
const LOW_LINK_SHARE = 0.3; // מתחת לזה — מדגישים את ההמלצה לקשר משפחות
const PAGE = 20;
const DEPTH_LABEL: Record<string, string> = { '1': 'מוצר אחד', '2': '2 מוצרים', '3+': '3 מוצרים ומעלה' };

/** אחוז: מתחת ל-1% — ספרה אחרי הנקודה (0.2%), כדי שמעט מקושרים לא יוצגו כ-0% */
const fmtPct = (ratio: number) => {
  const p = ratio * 100;
  if (p > 0 && p < 1) return `${p.toFixed(1)}%`;
  return `${Math.round(p)}%`;
};

const EfficiencySection: React.FC<Props> = ({ agentId, efficiency: e }) => {
  const { openCustomer, isPending, issue, clearIssue } = useOpenCustomer(agentId);
  const [convertPct, setConvertPct] = useState(10);
  const [showList, setShowList] = useState(false);
  const [visible, setVisible] = useState(PAGE);

  const d1 = e.byDepth.find((d) => d.depth === '1');
  const d2 = e.byDepth.find((d) => d.depth === '2');
  const d3 = e.byDepth.find((d) => d.depth === '3+');
  const multiHouseholds = (d2?.households ?? 0) + (d3?.households ?? 0);
  const multiShare = e.households ? multiHouseholds / e.households : 0;

  // פוטנציאל: חלק ממשקי הבית עם מוצר אחד מוסיפים מוצר → מגיעים לממוצע של "2 מוצרים"
  const gap = Math.max(0, (d2?.avgMonthly ?? 0) - (d1?.avgMonthly ?? 0));
  const potentialMonthly = Math.round((d1?.households ?? 0) * (convertPct / 100) * gap);

  const trend = e.months;
  const last = trend[trend.length - 1];
  const prev = trend[trend.length - 2];
  const change = prev && prev.perHousehold ? ((last.perHousehold - prev.perHousehold) / prev.perHousehold) * 100 : null;

  const lowLink = e.linkedShare < LOW_LINK_SHARE;
  const range = e.recentYms.length > 1 ? `${e.recentYms[0]} – ${e.recentYms[e.recentYms.length - 1]}` : e.recentYms[0] ?? '';
  const maxAvg = useMemo(() => Math.max(1, ...e.byDepth.map((d) => d.avgMonthly)), [e.byDepth]);

  if (!e.households) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3 gap-3">
        <h3 className="text-base font-black text-slate-800">יעילות תיק</h3>
        <span className="text-xs text-slate-500">לפי משק בית · ממוצע חודשי {range} (לפי החודשים שבהם כל לקוח הופיע)</span>
      </div>

      {/* ─── המלצה: קישור משפחות ─── */}
      {lowLink && (
        <div className="mb-4 rounded-2xl border-2 border-indigo-200 bg-gradient-to-l from-indigo-50 to-white p-4 flex flex-wrap items-center gap-4">
          <div className="text-3xl">👨‍👩‍👧</div>
          <div className="flex-1 min-w-[260px]">
            <div className="font-black text-indigo-900">
              המלצה: קשרו בני משפחה בניהול לקוחות
            </div>
            <div className="text-sm text-indigo-900/80 mt-1 leading-relaxed">
              {e.linkedCustomers > 0 ? (
                <>
                  רק <b>{fmtPct(e.linkedShare)}</b> מהלקוחות מקושרים לתא משפחתי ({fmtInt(e.linkedCustomers)} מתוך {fmtInt(e.customers)}).
                </>
              ) : (
                <>עדיין אין לקוחות שמקושרים לתא משפחתי.</>
              )} המדד מחושב לפי משק בית — כל משפחה שתקשרו
              תציג את התמונה האמיתית של הקשר עם הלקוח, ותחשוף הזדמנויות ברמת המשפחה (למשל בן/בת זוג בלי ביטוח).
            </div>
          </div>
          <a
            href={`${CUSTOMERS_PAGE}?agentId=${encodeURIComponent(agentId)}`}
            className="shrink-0 px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700"
          >
            לניהול לקוחות ←
          </a>
        </div>
      )}

      {e.notInCrm > 0 && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 flex flex-wrap items-center gap-3 text-sm text-amber-900">
          <span className="flex-1 min-w-[240px]">
            <b>{fmtInt(e.notInCrm)}</b> לקוחות מהטעינות עדיין לא קיימים בניהול לקוחות — ולכן לא ניתן לקשר אותם למשפחה.
          </span>
          <CustomerImportFromCommissions agentId={agentId} />
        </div>
      )}

      {/* ─── קוביות ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          title="נפרעים למשק בית"
          value={`${fmtInt(e.avgPerHousehold)} ₪`}
          sub={
            <>
              {change !== null && (
                <span className={`font-bold ${change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%{' '}
                </span>
              )}
              {change !== null ? `לעומת ${prev.ym} · ` : ''}
              {fmtInt(e.households)} משקי בית
            </>
          }
          accent="violet"
        />
        <KpiCard
          title="משקי בית עם 2+ מוצרים"
          value={`${Math.round(multiShare * 100)}%`}
          sub={`${fmtInt(multiHouseholds)} מתוך ${fmtInt(e.households)}`}
          accent="sky"
        />
        <KpiCard
          title="כיסוי קישור משפחתי"
          value={fmtPct(e.linkedShare)}
          sub={`${fmtInt(e.linkedCustomers)} מתוך ${fmtInt(e.customers)} לקוחות מקושרים`}
          accent={lowLink ? 'amber' : 'emerald'}
        />
      </div>

      {/* ─── עומק + פוטנציאל + מגמה ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mt-4">
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-sm font-bold text-slate-700">נפרעים חודשיים למשק בית לפי עומק התיק</div>
          <div className="text-[11px] text-slate-400 mb-3">
            עומק = מספר סוגי מוצרים שונים במשק הבית (לפי המוצר המסווג), לא מספר הפוליסות — שתי פוליסות בריאות הן מוצר אחד.
          </div>
          <div className="space-y-3">
            {e.byDepth.map((d) => {
              const mult = d1?.avgMonthly && d.depth !== '1' ? d.avgMonthly / d1.avgMonthly : null;
              return (
                <div key={d.depth}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-semibold text-slate-700">
                      {DEPTH_LABEL[d.depth]} · {fmtInt(d.households)} משקי בית
                    </span>
                    <span className="text-slate-600">
                      <b className="text-slate-800">{fmtInt(d.avgMonthly)} ₪</b>
                      {mult && mult > 1 && <span className="text-emerald-700 font-bold"> · פי {mult.toFixed(1)}</span>}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-violet-500" style={{ width: `${(d.avgMonthly / maxAvg) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          {gap > 0 && (d1?.households ?? 0) > 0 && (
            <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-sm text-emerald-900 flex flex-wrap items-center gap-2">
              <span>פוטנציאל: אם</span>
              <select
                value={convertPct}
                onChange={(ev) => setConvertPct(Number(ev.target.value))}
                className="border border-emerald-200 rounded-md px-1.5 py-0.5 bg-white font-bold"
              >
                {[5, 10, 20, 30].map((p) => (
                  <option key={p} value={p}>
                    {p}%
                  </option>
                ))}
              </select>
              <span>ממשקי הבית עם מוצר אחד יוסיפו מוצר —</span>
              <b className="text-emerald-700">
                +{fmtInt(potentialMonthly)} ₪ בחודש · +{fmtInt(potentialMonthly * 12)} ₪ בשנה
              </b>
              <span className="text-xs text-emerald-800/70 w-full">
                לפי הפער בתיק שלך: {fmtInt(d1?.avgMonthly ?? 0)} ₪ למשק בית עם מוצר אחד מול {fmtInt(d2?.avgMonthly ?? 0)} ₪ עם שניים.
              </span>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-sm font-bold text-slate-700 mb-2">מגמת נפרעים למשק בית</div>
          <div className="h-56" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 10, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="ym" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis tickFormatter={fmtInt} width={50} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip
                  formatter={(v: any) => [`${fmtMoney(v)} ₪`, 'למשק בית']}
                  labelFormatter={(l: any) => `חודש פרסום: ${l}`}
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Line type="monotone" dataKey="perHousehold" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ─── רשימת עבודה ─── */}
      {e.singleProduct.length > 0 && (
        <div className="mt-4 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowList((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 border-b text-right"
          >
            <span className="font-bold text-slate-700">
              רשימת עבודה: משקי בית עם מוצר אחד · {fmtInt(d1?.households ?? e.singleProduct.length)}
            </span>
            <span className="text-xs text-slate-500">
              {showList ? '▲ הסתר' : '▼ הצג'} · ממוין לפי הנפרעים הנוכחיים
            </span>
          </button>

          {showList && (
            <>
              <CustomerIssueBar agentId={agentId} issue={issue} onClose={clearIssue} />
              <div className="overflow-x-auto">
                <table className={`${t.cleanTable} text-sm whitespace-nowrap`}>
                  <thead>
                    <tr>
                      <th className="px-3 py-2">לקוח</th>
                      <th className={`px-3 py-2 ${t.center}`}>ת״ז</th>
                      <th className={`px-3 py-2 ${t.center}`}>המוצר שיש לו</th>
                      <th className={`px-3 py-2 ${t.center}`}>חברה</th>
                      <th className={`px-3 py-2 ${t.center}`}>נפרעים בחודש</th>
                      <th className={`px-3 py-2 ${t.center}`}>משפחה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.singleProduct.slice(0, visible).map((h) => (
                      <tr key={h.customerId}>
                        <td className="px-3 py-1.5 font-semibold">
                          <CustomerLink customerId={h.customerId} label={h.name || '-'} name={h.name} pending={isPending(h.customerId)} onOpen={openCustomer} />
                        </td>
                        <td className={`px-3 py-1.5 tabular-nums ${t.center}`}>
                          <CustomerLink customerId={h.customerId} label={h.customerId} name={h.name} pending={false} onOpen={openCustomer} className="text-slate-600" />
                        </td>
                        <td className={`px-3 py-1.5 ${t.center}`}>{h.product}</td>
                        <td className={`px-3 py-1.5 text-slate-600 ${t.center}`}>{h.company}</td>
                        <td className={`px-3 py-1.5 tabular-nums font-bold text-violet-700 ${t.center}`}>{fmtMoney(h.monthly)} ₪</td>
                        <td className={`px-3 py-1.5 text-xs ${t.center}`}>
                          {h.members > 1 ? (
                            <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{h.members} מקושרים</span>
                          ) : (
                            <span className="text-slate-400">לא מקושר</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {e.singleProduct.length > visible && (
                <div className="px-4 py-2 border-t text-xs">
                  <button type="button" onClick={() => setVisible((v) => v + PAGE)} className="text-indigo-700 hover:underline">
                    הצג עוד ({fmtInt(e.singleProduct.length - visible)})
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
};

export default EfficiencySection;