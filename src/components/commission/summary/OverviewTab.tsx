'use client';
// src/components/commission/summary/OverviewTab.tsx
// סקירה: תיק נוכחי + הכנסות (לפי חודש פרסום) + גרפים (המשך ישיר של ההכנסות).
// סקירת AI ויעילות תיק — בלשונית "תובנות" (InsightsTab); כאן כרטיס הפניה קצר עם כותרת ה-AI.
import React, { useEffect, useState } from 'react';
import type { AgentInsights, AiSummary, CompanyAmount, PortfolioCategory, TransferSuspect, StaleTemplate } from '@/types/agentInsights';
import { transferKey } from '@/lib/insights/transfers';
import KpiCard from './KpiCard';
import CompanyBreakdown from './CompanyBreakdown';
import PolicyListModal from './PolicyListModal';
import SlowLoadHint from './SlowLoadHint';
import { prefetchJson } from '@/lib/fetchCache';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from './charts';
import { fmtInt, fmtMoney, type Accent } from './ui';

interface Props {
  agentId: string;
  year: string;
  insights: AgentInsights | null;
  loading: boolean;
  error: string | null;
  ai: AiSummary | null;
  aiLoading: boolean;
  /** מעבר ללשונית "תובנות" (AI + יעילות תיק) */
  onOpenInsights: () => void;
}

type KpiKey = 'zvira' | 'pension' | 'insurance' | 'incomeLast' | 'incomeAvg' | 'incomeAnnual';

const PORTFOLIO_KPI_CATEGORY: Partial<Record<KpiKey, PortfolioCategory>> = {
  zvira: 'finansimZvira',
  pension: 'pensiaPremia',
  insurance: 'insPremia',
};

const SectionTitle: React.FC<{ title: string; hint?: React.ReactNode }> = ({ title, hint }) => (
  <div className="flex items-baseline justify-between mb-3 gap-3">
    <h3 className="text-base font-black text-slate-800">{title}</h3>
    {hint && <span className="text-sm text-slate-500">{hint}</span>}
  </div>
);

const OverviewTab: React.FC<Props> = ({ agentId, year, insights, loading, error, ai, aiLoading, onOpenInsights }) => {
  const [openKpi, setOpenKpi] = useState<KpiKey | null>(null);
  const [showAllIncomeCompanies, setShowAllIncomeCompanies] = useState(false);
  const [showStale, setShowStale] = useState(false);
  const [policyCompany, setPolicyCompany] = useState<string | null>(null);

  useEffect(() => {
    setOpenKpi(null);
    setShowStale(false);
    setPolicyCompany(null);
    setShowAllIncomeCompanies(false);
  }, [insights]);

  if (loading) {
    return (
      <div className="space-y-6">
        <SlowLoadHint />
        {[0, 1].map((row) => (
          <div key={row} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[118px] bg-slate-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ))}
        <div className="h-40 bg-slate-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (error) return <div className="p-4 text-sm text-red-600 bg-red-50 rounded-xl">{error}</div>;

  if (!insights || (!insights.portfolio.latestYm && !insights.income.months.length)) {
    return (
      <div className="p-6 text-sm text-slate-500 border rounded-2xl bg-white">
        אין נתונים לשנה {year}. לאחר טעינת דוחות עמלות הסקירה תופיע כאן.
      </div>
    );
  }

  const { portfolio, income } = insights;
  const cat = portfolio.categories;
  const recentN = income.recentYms.length;
  const recentLabel = recentN === 1 ? 'חודש אחרון' : `${recentN} חודשים אחרונים`;
  const recentRange =
    recentN > 1 ? `${income.recentYms[0]} – ${income.recentYms[recentN - 1]}` : income.recentYms[0] ?? '';

  const toggle = (k: KpiKey) => setOpenKpi((cur) => (cur === k ? null : k));

  const drills: Record<KpiKey, { title: string; rows: CompanyAmount[]; total: number; accent: Accent; latestYm?: string | null }> = {
    zvira: { title: 'צבירה פיננסית', rows: cat.finansimZvira.byCompany, total: cat.finansimZvira.amount, accent: 'emerald', latestYm: portfolio.latestYm },
    pension: { title: 'פרמיה פנסיה', rows: cat.pensiaPremia.byCompany, total: cat.pensiaPremia.amount, accent: 'amber', latestYm: portfolio.latestYm },
    insurance: { title: 'פרמיה ביטוח', rows: cat.insPremia.byCompany, total: cat.insPremia.amount, accent: 'indigo', latestYm: portfolio.latestYm },
    incomeLast: {
      title: `הכנסה חודשית · ${income.lastYm ?? ''}`,
      rows: income.lastYm ? income.byYmCompany[income.lastYm] ?? [] : [],
      total: income.lastTotal,
      accent: 'sky',
    },
    incomeAvg: {
      title: `ממוצע ${recentLabel}`,
      rows: income.recentByCompany,
      total: income.avgRecent,
      accent: 'violet',
    },
    incomeAnnual: {
      title: 'צפי הכנסה שנתי',
      rows: income.recentByCompany.map((c) => ({ ...c, amount: c.amount * 12 })),
      total: income.annualRunRate,
      accent: 'slate',
    },
  };

  const portfolioKeys: KpiKey[] = ['zvira', 'pension', 'insurance'];

  // דוחות שעדיין בחודש פרסום ישן — לפי חברה, כדי להראות בפילוח איזה דוח מפגר
  const staleByCompany: Record<string, StaleTemplate[]> = {};
  portfolio.staleTemplates.forEach((t) => (staleByCompany[t.companyName] ||= []).push(t));

  // ניודים אפשריים שנכללים בקוביית "פרמיה פנסיה" — לסימון בקובייה וברשימת הפוליסות
  const portfolioTransfers = (insights.transfers?.items ?? []).filter((t) => t.inPortfolio);
  const transferFlags: Record<string, TransferSuspect> = {};
  portfolioTransfers.forEach((t) => (transferFlags[transferKey(t.policyNumberKey, t.customerId)] = t));
  const incomeKeys: KpiKey[] = ['incomeLast', 'incomeAvg', 'incomeAnnual'];
  const open = openKpi ? drills[openKpi] : null;

  const change = income.changePct;
  const changeEl =
    change === null ? null : (
      <span className={`font-bold ${change >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
        {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
      </span>
    );

  const topIncomeCompanies = income.recentByCompany.slice(0, 8);

  return (
    <div className="space-y-8">
      {/* ─── הפניה ל"תובנות": כותרת ה-AI + יעילות תיק ─── */}
      <button
        type="button"
        onClick={onOpenInsights}
        className="w-full text-right flex items-center gap-4 bg-gradient-to-l from-violet-50 to-white border border-violet-100 rounded-2xl px-5 py-3.5 shadow-sm hover:shadow-md transition"
      >
        <span className="text-2xl">✨</span>
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-bold text-violet-700">תובנות · סקירת AI ויעילות תיק</span>
          <span className="block text-[15px] text-slate-800 font-semibold truncate">
            {aiLoading ? 'מכינה סקירה…' : ai?.headline || 'סקירה חכמה של התיק, נפרעים למשק בית והזדמנויות להרחבה'}
          </span>
        </span>
        <span className="shrink-0 text-sm font-bold text-violet-700">לתובנות ←</span>
      </button>

      {/* ─── תיק נוכחי ─── */}
      <section>
        <SectionTitle
          title="תיק נוכחי"
          hint={
            portfolio.latestYm ? (
              <>
                חודש פרסום אחרון: <b className="text-slate-700">{portfolio.latestYm}</b>
                {portfolio.staleTemplates.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowStale((v) => !v)}
                    className="mr-3 text-amber-700 font-semibold hover:underline"
                  >
                    ⚠️ {portfolio.staleTemplates.length} דוחות עדיין בחודש קודם {showStale ? '▲' : '▼'}
                  </button>
                )}
              </>
            ) : undefined
          }
        />

        {showStale && portfolio.staleTemplates.length > 0 && (
          <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900">
            <div className="font-bold mb-1">דוחות אלו נכללו לפי חודש הפרסום האחרון שלהם:</div>
            <ul className="space-y-0.5">
              {portfolio.staleTemplates.map((t) => (
                <li key={t.templateId}>
                  {t.companyName ? `${t.companyName} – ` : ''}
                  {t.templateName}: {t.ym}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard
            title='סה"כ צבירה פיננסית'
            value={`${fmtInt(cat.finansimZvira.amount)} ₪`}
            sub={`${fmtInt(cat.finansimZvira.policies)} פוליסות · יתרה`}
            accent="emerald"
            active={openKpi === 'zvira'}
            onClick={() => toggle('zvira')}
          />
          <KpiCard
            title='סה"כ פרמיה פנסיה'
            value={`${fmtInt(cat.pensiaPremia.amount)} ₪`}
            sub={
              <>
                {fmtInt(cat.pensiaPremia.policies)} פוליסות · פרמיה חודשית
                {portfolioTransfers.length > 0 && (
                  <span className="block mt-1 text-amber-700 font-semibold">
                    ⚠ כולל {portfolioTransfers.length} {portfolioTransfers.length === 1 ? 'ניוד אפשרי' : 'ניודים אפשריים'} · פירוט בתובנות
                  </span>
                )}
              </>
            }
            accent="amber"
            active={openKpi === 'pension'}
            onClick={() => toggle('pension')}
          />
          <KpiCard
            title='סה"כ פרמיה ביטוח'
            value={`${fmtInt(cat.insPremia.amount)} ₪`}
            sub={`${fmtInt(cat.insPremia.policies)} פוליסות · פרמיה חודשית`}
            accent="indigo"
            active={openKpi === 'insurance'}
            onClick={() => toggle('insurance')}
          />
        </div>
        {open && openKpi && portfolioKeys.includes(openKpi) && (
          <CompanyBreakdown
            {...open}
            staleByCompany={staleByCompany}
            onClose={() => setOpenKpi(null)}
            onCompanyClick={setPolicyCompany}
            onCompanyHover={(company) => {
              const category = PORTFOLIO_KPI_CATEGORY[openKpi];
              if (category) prefetchJson('/api/agent-insights/policies', { agentId, year, category, company });
            }}
          />
        )}
        {open && openKpi && policyCompany && PORTFOLIO_KPI_CATEGORY[openKpi] && (
          <PolicyListModal
            agentId={agentId}
            year={year}
            category={PORTFOLIO_KPI_CATEGORY[openKpi]!}
            categoryTitle={open.title}
            company={policyCompany}
            accent={open.accent}
            expectedTotal={open.rows.find((r) => r.company === policyCompany)?.amount ?? 0}
            transferFlags={PORTFOLIO_KPI_CATEGORY[openKpi] === 'pensiaPremia' ? transferFlags : undefined}
            onClose={() => setPolicyCompany(null)}
          />
        )}
      </section>

      {/* ─── הכנסות ─── */}
      <section>
        <SectionTitle title="הכנסות מעמלות" hint="לפי חודש פרסום" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiCard
            title={`הכנסה חודשית${income.lastYm ? ` · ${income.lastYm}` : ''}`}
            value={`${fmtInt(income.lastTotal)} ₪`}
            sub={
              income.prevYm ? (
                <>
                  {changeEl} לעומת {income.prevYm} ({fmtInt(income.prevTotal)} ₪)
                </>
              ) : (
                'אין חודש קודם להשוואה'
              )
            }
            accent="sky"
            active={openKpi === 'incomeLast'}
            onClick={() => toggle('incomeLast')}
          />
          <KpiCard
            title={`ממוצע ${recentLabel}`}
            value={`${fmtInt(income.avgRecent)} ₪`}
            sub={recentRange}
            accent="violet"
            active={openKpi === 'incomeAvg'}
            onClick={() => toggle('incomeAvg')}
          />
          <KpiCard
            title="צפי הכנסה שנתי"
            value={`${fmtInt(income.annualRunRate)} ₪`}
            sub={`ממוצע ${recentLabel} × 12`}
            accent="slate"
            active={openKpi === 'incomeAnnual'}
            onClick={() => toggle('incomeAnnual')}
          />
        </div>
        {open && openKpi && incomeKeys.includes(openKpi) && (
          <CompanyBreakdown {...open} onClose={() => setOpenKpi(null)} />
        )}
      </section>

      {/* ─── גרפים ─── */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-sm font-bold text-slate-700 mb-2">מגמת עמלות לפי חודש פרסום</div>
          <div className="h-72" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={income.months} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="ym" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <YAxis tickFormatter={fmtInt} width={70} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                <Tooltip
                  formatter={(v: any) => [`${fmtMoney(v)} ₪`, 'עמלות']}
                  labelFormatter={(l: any) => `חודש פרסום: ${l}`}
                  contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Line type="monotone" dataKey="total" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="text-sm font-bold text-slate-700 mb-3">הכנסה חודשית לפי חברה · ממוצע {recentLabel}</div>
          <div className="space-y-2.5">
            {(showAllIncomeCompanies ? income.recentByCompany : topIncomeCompanies).map((c) => {
              const share = income.avgRecent ? (c.amount / income.avgRecent) * 100 : 0;
              return (
                <div key={c.company}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-semibold text-slate-700">{c.company}</span>
                    <span className="text-slate-500">
                      {fmtInt(c.amount)} ₪ · {share.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-sky-500" style={{ width: `${share}%` }} />
                  </div>
                </div>
              );
            })}
            {income.recentByCompany.length > topIncomeCompanies.length && (
              <button
                type="button"
                onClick={() => setShowAllIncomeCompanies((v) => !v)}
                className="text-sm text-sky-700 hover:underline"
              >
                {showAllIncomeCompanies ? 'הצג פחות' : `הצג את כל ${income.recentByCompany.length} החברות`}
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default OverviewTab;