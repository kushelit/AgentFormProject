'use client';

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { useAuth } from '@/lib/firebase/AuthContext';
import { apiFetch } from '@/lib/apiFetch';
import { Spinner } from '@/components/Spinner';
import type { HekefMonthSummary, HekefPolicy, HekefView } from '@/lib/hekef/buildHekefView';
import AdminQuestionsBadge from '@/components/admin/adminQuestions/AdminQuestionsBadge';
import st from './HekefCommissionTab.module.css';
import t from '@/components/commission/summary/table.module.css';

type CompanyMonths = { companyId: string; company: string; months: { month: string; net: number }[] };
type ApiResponse = {
  enabled: boolean;
  companies: CompanyMonths[];
  companyId?: string;
  month?: string;
  view?: HekefView | null;
  trend?: HekefMonthSummary[];
  statement?: HekefStatement | null;
  error?: string;
};

const SOON_COMPANIES = ['הראל', 'כלל', 'מגדל', 'הפניקס'];

const fmt = (n: number, dec = false) => {
  const d = dec ? 2 : 0;
  return (n < -0.004 ? '-' : '') + '₪' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
};
const fmt2 = (n: number) => fmt(n, true);
// סכום בתוך טקסט עברי רגיל (option / title) — בלי בידוד, המינוס קופץ לצד השני של המספר ("₪464-")
const ltr = (text: string) => `\u2066${text}\u2069`;
const monthLabel = (m: string) => (m ? `${m.slice(5, 7)}/${m.slice(0, 4)}` : '');
const HEB_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
const monthName = (m: string) => (m ? `${HEB_MONTHS[Number(m.slice(5, 7)) - 1] || ''} ${m.slice(0, 4)}` : '');
// דוח תנועות חודשי (מנורה): STF = שוטף (נרשם בחודש העיבוד), RTR = רטרו (נרשם בחודשים קודמים ועובד עכשיו).
// "שוטף / רטרו" — המונחים שהסוכנים מכירים
const KIND_LABEL: Record<string, string> = { current: 'שוטף', retro: 'רטרו' };
// חברה עם דף חשבון (כלל): current = מקדמות השנה, retro = התחשבנות שנים קודמות
const STATEMENT_KIND_LABEL: Record<string, string> = { current: 'מקדמות השנה', retro: 'שנים קודמות (ש"ק)' };
// מפתח קצר לחברה — למיקומי השאלות הפתוחות (hekef.<key>.<נושא>)
const COMPANY_KEY: Record<string, string> = { '2': 'migdal', '3': 'menora', '4': 'clal' };
// מגדל: שני דוחות נפרדים — שנה נוכחית (current) ושנים קודמות (retro)
const MIGDAL_KIND_LABEL: Record<string, string> = { current: 'שנה נוכחית', retro: 'שנים קודמות' };
const kindLabelsFor = (coKey: string, isStmt: boolean) =>
  isStmt ? STATEMENT_KIND_LABEL : coKey === 'migdal' ? MIGDAL_KIND_LABEL : KIND_LABEL;
const DEP_LABEL: Record<string, string> = { regular: 'שוטף', one_time: 'חד פעמי' };
const TYPE_LABEL: Record<HekefPolicy['type'], string> = { new: 'הפקה', cancel: 'ביטול', chg: 'שינוי', risk: 'פיגור', transfer: 'העברה/המרה', none: 'ללא שינוי', fix: 'תיקון' };
// paid / offset — לחיצה על הקוביות "שילמו לך" / "קיזזו לך" (לא מוצגים כצ'יפ)
type Filter = 'all' | 'current' | 'retro' | 'cancel' | 'chg' | 'risk' | 'rate' | 'corr' | 'paid' | 'offset';
type KpiPick = { active: 'paid' | 'offset' | ''; onPick: (k: 'paid' | 'offset' | '') => void };
const FILTERS: [Filter, string][] = [
  ['all', 'הכל'], ['current', 'שוטף'], ['retro', 'רטרו'], ['cancel', 'ביטולים'], ['chg', 'שינויים'], ['risk', 'פיגור'], ['corr', 'תיקוני אחוז'], ['rate', 'אחוז שונה מההסכם'],
];

export default function HekefCommissionTab() {
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();
  const [companyId, setCompanyId] = useState('');
  const [showAll, setShowAll] = useState(true); // "כל החברות" — טבלת הנטו לפי חברה וחודש
  const [month, setMonth] = useState('');
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [filter, setFilter] = useState<Filter>('all');
  const [mvFilter, setMvFilter] = useState(''); // סינון לפי סוג תנועה (לחיצה על שורה בכרטיס הביטולים)
  const [baseFilter, setBaseFilter] = useState(''); // מגדל: סינון לפי בסיס זיכוי (לחיצה בכרטיס הבסיסים)
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCompanyId('');
    setShowAll(true);
    setMonth('');
  }, [selectedAgentId]);

  useEffect(() => {
    if (!selectedAgentId) {
      setData(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await apiFetch('/api/hekef-commission', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: selectedAgentId, companyId, reportMonth: month }),
        });
        const json: ApiResponse = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        setData(json);
        setOpen(new Set());
        setMvFilter('');
        setBaseFilter('');
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'שגיאה בטעינת הנתונים');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedAgentId, companyId, month]);

  const view = data?.view || null;
  const company = data?.companies.find((c) => c.companyId === data.companyId);

  const filtered = useMemo(() => {
    if (!view) return [];
    const qq = q.trim();
    // שילמו / קיזזו: בדיוק הפוליסות שנספרו בקבוצות של הקוביה (פוליסה יכולה להיות בשתיהן)
    const flowKeys = filter === 'paid' || filter === 'offset'
      ? new Set(view.flows[filter].flatMap((g) => g.policies.map((x) => `${x.agent}|${x.no}`)))
      : null;
    return view.policies.filter((p) => {
      if (flowKeys) {
        if (!flowKeys.has(`${p.agent}|${p.no}`)) return false;
      } else if (filter === 'current' || filter === 'retro') {
        if (!p.kinds.includes(filter)) return false;
      } else if (filter === 'rate') {
        if (!p.rateFlag) return false;
      } else if (filter === 'corr') {
        if (!p.corr) return false;
      } else if (filter !== 'all' && p.type !== filter) return false;
      if (mvFilter && !p.lines.some((l) => l.mv === mvFilter)) return false;
      if (baseFilter && !p.lines.some((l) => l.base === baseFilter)) return false;
      if (qq && ![p.no, p.cid, p.name, p.agent].some((x) => String(x).includes(qq))) return false;
      return true;
    });
  }, [view, filter, mvFilter, baseFilter, q]);

  const jumpTo = (f: Filter, query = '') => {
    setFilter(f);
    setQ(query);
    setMvFilter('');
    setBaseFilter('');
    document.getElementById('hekef-policies')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const exportExcel = () => {
    const kindLabels = kindLabelsFor(COMPANY_KEY[data?.companyId || ''] || '', !!data?.statement);
    const rows = filtered.flatMap((p) =>
      p.lines.map((l) => ({
        'מספר סוכן': p.agent,
        'שם מבוטח': p.name,
        'ת.ז': p.cid,
        'מספר פוליסה': p.no,
        'שם מוצר': p.prod,
        'שם סוג תנועת תפוקה': l.mv,
        'סוג עיבוד': kindLabels[l.kind] || l.kind,
        'סוג הפקדה': DEP_LABEL[l.dep] || l.dep,
        'תאריך תפוקה': l.pd,
        'תאריך ביטול': l.cd,
        'פרמיה ברוטו': l.g,
        'פרמיה שבוטלה': l.cp,
        'סוכן-אחוז ביטול': l.pct,
        'סוכן-פרמיה לביטול': l.acp,
        'סוכן-פרמיה נטו': l.net,
        'סוכן-אחוז עמלה מההסכם': l.rc,
        'סוכן-אחוז עמלה בפועל': l.ra,
        ...(l.split !== null ? { 'אחוז חלוקת סוכנים': l.split } : {}),
        ...(l.yrs !== null ? { 'שנים בתוקף': l.yrs } : {}),
        ...(l.reg ? { 'תאריך רישום תפוקה': l.reg } : {}),
        ...(l.base ? { 'בסיס זיכוי': l.base, 'סוג תגמול': l.rew } : {}),
        'סוכן-סכום עמלה': l.c,
      }))
    );
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'היקף');
    XLSX.writeFile(wb, `היקף_${company?.company || ''}_${view?.month || ''}.xlsx`);
  };

  return (
    <div className="p-4" dir="rtl">
      <div className={st.root}>
        <div className={st.top}>
          <div className={st.controls}>
            <select className={st.select} value={selectedAgentId} onChange={handleAgentChange} aria-label="סוכן">
              {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
              {agents.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {company && !showAll && (
              <>
                <label className={st.sub} htmlFor="hekef-month">חודש עיבוד</label>
                <select id="hekef-month" className={st.select} value={data?.month || ''} onChange={(e) => setMonth(e.target.value)}>
                  {company.months.map((m) => (
                    <option key={m.month} value={m.month}>{monthLabel(m.month)} · {ltr(fmt(m.net))}</option>
                  ))}
                </select>
              </>
            )}
          </div>
          {data?.companies?.length ? (
            <div className={st.cos}>
              <button type="button" className={`${st.co} ${showAll ? st.coOn : ''}`} onClick={() => setShowAll(true)}>
                כל החברות
              </button>
              {data.companies.map((c) => (
                <button
                  key={c.companyId}
                  type="button"
                  className={`${st.co} ${!showAll && c.companyId === data.companyId ? st.coOn : ''}`}
                  onClick={() => { setShowAll(false); setCompanyId(c.companyId); setMonth(''); }}
                >
                  {c.company}
                </button>
              ))}
              {SOON_COMPANIES.filter((n) => !data.companies.some((c) => c.company.includes(n))).map((n) => (
                <span key={n} className={`${st.co} ${st.coSoon}`}>{n} <small>בקרוב</small></span>
              ))}
            </div>
          ) : null}
        </div>

        {!selectedAgentId ? (
          <div className={`${st.card} ${st.empty}`}>יש לבחור סוכן כדי לראות את נתוני ההיקף</div>
        ) : loading ? (
          <div className={st.card}><Spinner /></div>
        ) : error ? (
          <div className={`${st.card} ${st.empty}`}>{error}</div>
        ) : !view ? (
          <div className={`${st.card} ${st.empty}`}>עדיין לא נטענו דוחות היקף לסוכן הזה. הם ייטענו אוטומטית בריצה הבאה של החברה.</div>
        ) : showAll ? (
          <HekefSummary
            agentId={selectedAgentId}
            onPick={(cid, m) => { setShowAll(false); setCompanyId(cid); setMonth(m); }}
          />
        ) : (
          <HekefBody
            agentId={selectedAgentId}
            companyId={data?.companyId || ''}
            view={view}
            trend={data?.trend || []}
            statement={data?.statement || null}
            onPickMonth={setMonth}
            months={(company?.months || []).map((m) => m.month)}
            companyName={company?.company || ''}
            filter={filter}
            setFilter={(f) => { setFilter(f); setMvFilter(''); setBaseFilter(''); }}
            mvFilter={mvFilter}
            setMvFilter={(m) => { setMvFilter(m); setBaseFilter(''); setFilter('all'); setQ(''); document.getElementById('hekef-policies')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
            baseFilter={baseFilter}
            setBaseFilter={(b) => { setBaseFilter(b); setMvFilter(''); setFilter('all'); setQ(''); document.getElementById('hekef-policies')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
            q={q}
            setQ={setQ}
            filtered={filtered}
            open={open}
            toggle={(key) => setOpen((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; })}
            jumpTo={jumpTo}
            exportExcel={exportExcel}
          />
        )}
      </div>
    </div>
  );
}

/** מנורה: איך הגיע הסכום של השורה — פרמיה נטו × אחוז עמלה × חלק הסוכן (בביטול: פרמיה שבוטלה × אחוז ביטול) */
function monthlyLineExplanation(l: HekefPolicy['lines'][number]) {
  const parts: string[] = [];
  if (Math.abs(l.cp) > 0.004) {
    parts.push(`בוטלה פרמיה ${fmt2(l.cp)}${l.yrs !== null ? ` בשנה ${l.yrs} של הפוליסה` : ''} × אחוז ביטול ${l.pct}% = ${fmt2(l.acp)}.`);
  }
  const split = l.split !== null && l.split !== 100 ? ` × חלק הסוכן ${l.split}%` : '';
  // האחוז בדוח מעוגל לשתי ספרות; העמלה מחושבת באחוז המדויק — הפרש של אגורות עד שקלים בודדים
  const rounded = Math.abs((l.net * l.ra * (l.split ?? 100)) / 10000 - l.c) > 0.05 ? ' (האחוז בדוח מעוגל)' : '';
  parts.push(`פרמיה נטו ${fmt2(l.net)} × אחוז עמלה ${l.ra}%${split} = ${fmt2(l.c)}${rounded}.`);
  return `${l.fix ? `${l.fix}. ` : ''}${l.mv}: ${parts.join(' ')}`;
}

/** כלל: איך הגיע הסכום של השורה — מצטבר עד החודש פחות מה ששולם עד כה */
function lineExplanation(l: HekefPolicy['lines'][number]) {
  const prem = l.pp !== null ? `${fmt2(l.pp)} ← ${fmt2(l.net)}` : fmt2(l.net);
  if (l.kind === 'retro') {
    return `שנת ${l.yr || '—'}: בסגירת השנה (גמ"ח) הפרמיה הייתה ${l.pp !== null ? fmt2(l.pp) : '—'}, עכשיו ${fmt2(l.net)} (הפרש ${fmt2(l.chg)})`
      + `${l.rate !== null ? ` × ${l.rate}%` : ''} = עמלה מצטברת ${fmt2(l.cum ?? 0)}. עמלה ששולמה עד כה ${fmt2(l.paid ?? 0)}, ולכן החודש ${fmt2(l.c)}.`;
  }
  return `מקדמות השנה: פרמיה ${prem}. זכאות מצטברת למקדמה עד החודש ${fmt2(l.cum ?? 0)}, שולם בחודשים קודמים ${fmt2(l.paid ?? 0)}, ולכן המקדמה החודש ${fmt2(l.c)}.`;
}

function HekefBody(props: {
  agentId: string;
  companyId: string;
  view: HekefView;
  trend: HekefMonthSummary[];
  statement: HekefStatement | null;
  onPickMonth: (m: string) => void;
  months: string[]; // חודשי העיבוד שנטענו, מהחדש לישן
  companyName: string;
  filter: Filter;
  setFilter: (f: Filter) => void;
  mvFilter: string;
  setMvFilter: (m: string) => void;
  baseFilter: string;
  setBaseFilter: (b: string) => void;
  q: string;
  setQ: (q: string) => void;
  filtered: HekefPolicy[];
  open: Set<string>;
  toggle: (key: string) => void;
  jumpTo: (f: Filter, q?: string) => void;
  exportExcel: () => void;
}) {
  const { view: v, filtered } = props;
  // כל החברות באותו מבנה: ניווט → הסבר → סיכום החודש → ביטולים → פיגור (כשיש) → פוליסות.
  // כלל: דוח מצטבר שנתי עם דף חשבון. מנורה: דוח תנועות חודשי. מוצג רק מה שקיים בדוח ומשפיע על החודש.
  const isStmt = !!props.statement;
  const coKey = COMPANY_KEY[props.companyId] || props.companyId;
  const badge = (topic: string) => (
    <AdminQuestionsBadge anchor={`hekef.${coKey}.${topic}`} companyId={props.companyId} company={props.companyName} />
  );
  const kindLabels = kindLabelsFor(coKey, isStmt);
  const isMigdal = coKey === 'migdal';
  const kpiPick: KpiPick = {
    active: props.filter === 'paid' || props.filter === 'offset' ? props.filter : '',
    onPick: (k) => (k ? props.jumpTo(k) : props.setFilter('all')),
  };
  const hasBases = v.bases.length > 0;
  const C = v.cat;
  const sumC = filtered.reduce((a, p) => a + p.c, 0);
  const sumP = filtered.reduce((a, p) => a + p.p, 0);

  return (
    <>
      {(() => {
        const i = props.months.indexOf(v.month);
        const older = i >= 0 ? props.months[i + 1] : undefined;
        const newer = i > 0 ? props.months[i - 1] : undefined;
        return (
          <div className={st.monthNav}>
            <button type="button" className={st.navBtn} disabled={!older} onClick={() => older && props.onPickMonth(older)}>
              → חודש קודם{older ? ` (${monthLabel(older)})` : ''}
            </button>
            <div className={st.navCenter}>
              <div className={st.navMonth}>{monthName(v.month)}</div>
              <div className={st.meta}>
                {props.companyName} · חודש עיבוד · <span className={st.num}>{v.rows.toLocaleString()}</span> שורות · {i + 1} מתוך {props.months.length} חודשים שנטענו
              </div>
            </div>
            <button type="button" className={st.navBtn} disabled={!newer} onClick={() => newer && props.onPickMonth(newer)}>
              {newer ? `(${monthLabel(newer)}) ` : ''}חודש הבא ←
            </button>
          </div>
        );
      })()}

      {props.statement ? (
        <>
          <StatementExplainer s={props.statement} />
          <StatementCard s={props.statement} v={v} badge={badge} pick={kpiPick} />
        </>
      ) : (
        <>
          {isMigdal ? <MigdalExplainer /> : <MonthlyExplainer companyName={props.companyName} />}
          <MonthCard v={v} trend={props.trend} onPickMonth={props.onPickMonth} badge={badge} variant={isMigdal ? 'migdal' : 'monthly'} pick={kpiPick} />
        </>
      )}

      {(
        <>
          <FlowList
            title="על מה שילמו לך"
            total={v.flows.paidTotal}
            groups={v.flows.paid}
            labelOf={isMigdal ? baseLabel : (x) => x}
            badge={badge('bases')}
            empty="לא שולמה החודש עמלת היקף"
          />
          <FlowList
            title="על מה קיזזו לך"
            total={v.flows.offsetTotal}
            groups={v.flows.offset}
            labelOf={(s) => s}
            badge={badge('cancel')}
            empty="לא היו קיזוזים החודש"
          />
          {(() => {
            // פיגור — הדבר היחיד שהסוכן יכול לפעול לגביו: הפוליסה עוד לא בוטלה, ואם ההפקדות יחזרו העמלה תחזור
            const risk = v.flows.offset.find((g) => g.key === 'פיגור');
            if (!risk) return null;
            return (
              <section className={`${st.card} ${st.actionCard}`}>
                <div className={st.head}>
                  <div>
                    <h2 className={st.h2}>⚠️ לקוחות בפיגור — כדאי לבדוק איתם {badge('risk')}</h2>
                    <div className={st.sub}>הפוליסות עוד לא בוטלו. אם ההפקדות יחזרו — העמלה תחזור</div>
                  </div>
                  <div className={`${st.num} ${st.neg}`} style={{ fontWeight: 700, fontSize: 20 }}>{fmt2(risk.amount)}</div>
                </div>
                <div className={st.flowPolicies} style={{ margin: 0 }}>
                  {risk.policies.map((p) => (
                    <div key={`${p.agent}|${p.no}`} className={st.flowPolicy}>
                      <span><b>{p.name || '—'}</b></span>
                      <span className={st.sub}>{p.prod}</span>
                      <span className={`${st.num} ${st.sub}`}>{p.no}</span>
                      <span className={`${st.num} ${st.amtCell} ${st.neg}`}>{fmt2(p.amount)}</span>
                    </div>
                  ))}
                </div>
              </section>
            );
          })()}
        </>
      )}

      <section className={st.card} id="hekef-policies">
        <div className={st.head}>
          <div>
            <h2 className={st.h2}>פוליסות {badge('policies')}</h2>
            <div className={st.sub}>
              {isStmt
                ? 'כל הפוליסות שבדוח, עם המקדמה של כל אחת החודש. לחיצה על פוליסה פותחת את השורות שלה, את החישוב ואת ההיסטוריה'
                : hasBases
                ? 'לחיצה על פוליסה מראה מה קרה בה החודש ועל מה שולמה העמלה'
                : 'כל התנועות שבדוח, לפי פוליסה. לחיצה על פוליסה פותחת את השורות שלה, את החישוב ואת ההיסטוריה'}
            </div>
          </div>
          <div className={st.chips}>
            <input className={st.search} type="search" placeholder="חיפוש פוליסה / ת.ז / שם / סוכן" aria-label="חיפוש" value={props.q} onChange={(e) => props.setQ(e.target.value)} />
            {FILTERS.filter(([f]) => (f !== 'rate' || v.checks.rateRows > 0) && (f !== 'risk' || C.risk.rows > 0) && (f !== 'corr' || v.corrections.policies > 0)).map(([f, label]) => (
              <button key={f} type="button" className={`${st.chip} ${props.filter === f && !props.mvFilter && !props.baseFilter ? st.chipOn : ''}`} onClick={() => props.setFilter(f)}>{f === 'current' || f === 'retro' ? kindLabels[f] : label}</button>
            ))}
            {(props.filter === 'paid' || props.filter === 'offset') && (
              <span className={st.activeFilter}>מסנן: {props.filter === 'paid' ? 'שילמו לך' : 'קיזזו לך'}<button type="button" aria-label="נקה" onClick={() => props.setFilter('all')}>×</button></span>
            )}
            {props.mvFilter && (
              <span className={st.activeFilter}>תנועה: {props.mvFilter}<button type="button" aria-label="נקה" onClick={() => props.setFilter('all')}>×</button></span>
            )}
            {props.baseFilter && (
              <span className={st.activeFilter}>{baseLabel(props.baseFilter)}<button type="button" aria-label="נקה" onClick={() => props.setFilter('all')}>×</button></span>
            )}
            <button type="button" className={st.excel} onClick={props.exportExcel} disabled={!filtered.length}>ייצוא לאקסל</button>
          </div>
        </div>
        <div className={st.tbl}>
          <table className={`${t.cleanTable} ${st.table}`}>
            <thead>
              <tr>
                <th></th><th>מספר סוכן</th><th>לקוח</th><th>ת.ז</th><th>פוליסה</th><th>מוצר</th><th>תאריך תפוקה</th><th>עיבוד</th><th>סוג</th><th>תנועה עיקרית</th>
                <th className={t.left}>{hasBases ? 'פרמיה' : 'פרמיה נטו'}</th><th className={t.left}>עמלה</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const key = `${p.agent}|${p.no}`;
                const isOpen = props.open.has(key);
                return (
                  <React.Fragment key={key}>
                    <tr
                      className={st.prowT}
                      tabIndex={0}
                      onClick={() => props.toggle(key)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.toggle(key); } }}
                    >
                      <td><span className={`${st.caret} ${isOpen ? st.caretOpen : ''}`}>◂</span></td>
                      <td className={st.num}>{p.agent}</td>
                      <td>{p.name}</td>
                      <td className={st.num}>{p.cid}</td>
                      <td className={st.num}>{p.no}</td>
                      <td>{p.prod}</td>
                      <td className={st.num}>{p.pd}</td>
                      <td>
                        {p.kinds.map((k, i) => (
                          <React.Fragment key={k}>{i > 0 && ' + '}<span className={k === 'current' ? st.kindNow : st.kindRetro}>{kindLabels[k]}</span></React.Fragment>
                        ))}
                      </td>
                      <td>
                        <span className={`${st.pill} ${st[`pill_${p.type}`]}`}>{TYPE_LABEL[p.type]}</span>
                        {p.rateFlag && <span className={st.flag} title="אחוז בפועל שונה מההסכם">⚑</span>}
                      </td>
                      <td>{p.mv}</td>
                      <td className={`${t.left} ${st.amt} ${st.num} ${p.p < 0 ? st.neg : ''}`}>{fmt2(p.p)}</td>
                      <td className={`${t.left} ${st.amt} ${st.num} ${p.c < -0.004 ? st.neg : p.c > 0.004 ? st.pos : ''}`}>{fmt2(p.c)}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={12} className={st.linesCell}>
                          <div style={{ overflowX: 'auto' }}>
                            <table className={`${t.cleanTable} ${st.ltab}`}>
                              <thead>
                                {hasBases ? (
                                  <tr>
                                    <th>מה קרה</th><th>על מה</th><th>דוח</th><th>שנה</th><th>תאריך</th>
                                    <th>פרמיה</th><th>עמלה</th>
                                  </tr>
                                ) : v.hasRates ? (
                                  <tr>
                                    <th>שם סוג תנועת תפוקה</th><th>נרשם</th><th>סוג הפקדה</th><th>תאריך תפוקה</th><th>שנה בתוקף</th>
                                    <th>פרמיה ברוטו</th><th>פרמיה שבוטלה</th><th>אחוז ביטול</th><th>פרמיה נטו</th>
                                    <th>% הסכם / בפועל</th><th>חלק הסוכן</th><th>עמלה</th>
                                  </tr>
                                ) : (
                                  <tr>
                                    <th>תנועה (סטטוס תפוקה)</th><th>סוג עיבוד</th><th>תאריך כניסה לתפוקה</th>
                                    <th>פרמיה קובעת – קודם</th><th>פרמיה קובעת – עכשיו</th><th>הפרש</th><th>שיעור</th>
                                    <th>עמלה מצטברת</th><th>עמלה ששולמה עד כה</th><th>החודש</th>
                                  </tr>
                                )}
                              </thead>
                              <tbody>
                                {hasBases ? p.lines.map((l, i) => (
                                  <tr key={i}>
                                    <td>{l.mv}</td>
                                    <td>{baseLabel(l.base)}{l.rew === 'מענקים' ? <span className={st.rewTag}>מענק</span> : l.rew === 'עמלות פרסים' ? <span className={st.rewTag}>פרס</span> : null}</td>
                                    <td>{kindLabels[l.kind] || l.kind}</td>
                                    <td className={st.num}>{l.yr || '—'}</td>
                                    <td className={st.num}>{l.pd}</td>
                                    <td className={st.num}>{fmt2(l.net)}</td>
                                    <td className={`${st.num} ${l.c < 0 ? st.neg : ''}`}><b>{fmt2(l.c)}</b></td>
                                  </tr>
                                )) : !v.hasRates ? p.lines.map((l, i) => (
                                  <tr key={i}>
                                    <td>{l.mv}</td>
                                    <td>{kindLabels[l.kind] || l.kind}</td>
                                    <td className={st.num}>{l.pd}</td>
                                    <td className={st.num}>{l.pp === null ? '—' : fmt2(l.pp)}</td>
                                    <td className={st.num}>{fmt2(l.net)}</td>
                                    <td className={`${st.num} ${l.chg < 0 ? st.neg : ''}`}>{fmt2(l.chg)}</td>
                                    <td className={st.num}>{l.rate === null ? '—' : `${l.rate}%`}</td>
                                    <td className={st.num}>{l.cum === null ? '—' : fmt2(l.cum)}</td>
                                    <td className={st.num}>{l.paid === null ? '—' : fmt2(l.paid)}</td>
                                    <td className={`${st.num} ${l.c < 0 ? st.neg : ''}`}><b>{fmt2(l.c)}</b></td>
                                  </tr>
                                )) : p.lines.map((l, i) => (
                                  <tr key={i}>
                                    <td>{l.mv}</td>
                                    <td>{kindLabels[l.kind] || l.kind}{l.reg ? <span className={st.sub}> · {l.reg}</span> : null}</td>
                                    <td>{DEP_LABEL[l.dep] || l.dep}</td>
                                    <td className={st.num}>{l.pd}</td>
                                    <td className={st.num}>{l.yrs ?? '—'}</td>
                                    <td className={st.num}>{fmt2(l.g)}</td>
                                    <td className={st.num}>{fmt2(l.cp)}</td>
                                    <td className={st.num}>{l.pct}%</td>
                                    <td className={st.num}>{fmt2(l.net)}</td>
                                    <td className={`${st.num} ${l.rc !== l.ra && l.split !== 0 ? st.neg : ''}`}>{l.rc}% / {l.ra}%</td>
                                    <td className={st.num}>{l.split === null ? '—' : `${l.split}%`}</td>
                                    <td className={`${st.num} ${l.c < 0 ? st.neg : ''}`}><b>{fmt2(l.c)}</b></td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          {isStmt && p.lines.some((l) => l.cum !== null) && (
                            <div className={st.note}>
                              {p.lines.filter((l) => l.cum !== null).map((l, i) => <div key={i}>{lineExplanation(l)}</div>)}
                            </div>
                          )}
                          {!isStmt && v.hasRates && !hasBases && (
                            <div className={st.note}>
                              {p.lines.map((l, i) => <div key={i}>{monthlyLineExplanation(l)}</div>)}
                            </div>
                          )}
                          {p.notes.length > 0 && (
                            <div className={st.note}>{p.notes.map((n, i) => <div key={i}>{n}</div>)}</div>
                          )}
                          <PolicyHistory agentId={props.agentId} companyId={props.companyId} policy={p} currentMonth={v.month} />

                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className={st.count}>
          מוצגות <b>{filtered.length}</b> פוליסות · פרמיה נטו <b className={st.num}>{fmt2(sumP)}</b> · עמלה <b className={st.num}>{fmt2(sumC)}</b>
        </div>
        {isStmt && (
          <div className={st.note}>
            סכום המקדמות של הפוליסות יכול להיות שונה מ&quot;שולם החודש&quot; בדף החשבון: מקדמה שלילית לא מקוזזת באותו חודש, ובדף החשבון יש גם התחשבנות שנים קודמות.
          </div>
        )}
      </section>
    </>
  );
}

/* ===== דף חשבון חודשי (כלל) — functions/src/shared/import/hekef/clalStatement.ts ===== */
type HekefStatement = {
  month: string;
  header: { agentName: string; agentTaxId: string };
  currentYear: {
    annexes: { annexType: string; netEntitlement: number; advance: number }[];
    totalNetEntitlement: number;
    totalAdvance: number;
    heldUntilSettlement: number;
    paidPreviousMonths: number | null;
    payThisMonth: number | null;
    purchasedPortfoliosOffset: number | null;
  };
  priorYears: {
    annexes: { annexType: string; year: string; netCumulative: number }[];
    paidSoFar: number | null;
    payThisMonth: number | null;
  };
  payments: { month: string; amount: number }[];
  tiers: { rewardProduct: string; fromPremium: number; toPremium: number; rate: number; fixedCommission: number; advanceRatePct?: number }[];
  advanceCalc: { rewardProduct: string; targetPremiumNet: number }[];
};

/** מדרגה הבאה לכל מוצר תגמול: כמה פרמיה חסרה ובאיזה שיעור */
function nextTiers(s: HekefStatement) {
  const out: { product: string; now: number; rateNow: number; need: number; rateNext: number }[] = [];
  for (const calc of s.advanceCalc || []) {
    const tiers = (s.tiers || [])
      .filter((t) => t.rewardProduct.replace(/\s*\(\*\)\s*$/, '') === calc.rewardProduct && t.fromPremium < 900000000)
      .sort((a, b) => a.fromPremium - b.fromPremium);
    if (tiers.length < 2) continue;
    const value = calc.targetPremiumNet;
    const cur = [...tiers].reverse().find((t) => value >= t.fromPremium) || tiers[0];
    const next = tiers.find((t) => t.fromPremium > value && t.rate > cur.rate);
    if (next) out.push({ product: calc.rewardProduct, now: value, rateNow: cur.rate, need: next.fromPremium - value, rateNext: next.rate });
  }
  return out;
}

/**
 * שיעור המקדמה כפי שכתוב בדוח (עמודת "שיעור מקדמה" בפירוט תנאי הנספח).
 * כמה שיעורים שונים → null (משתנה לפי נספח). אין מקדמה בכלל → 0. אין נתון → null.
 */
function advancePct(s: HekefStatement): number | null {
  if ((s.currentYear.totalNetEntitlement || 0) > 0 && !s.currentYear.totalAdvance) return 0;
  const rates = [...new Set((s.tiers || []).map((x) => Number(x.advanceRatePct)).filter((n) => Number.isFinite(n) && n > 0))];
  return rates.length === 1 ? rates[0] : null;
}

/* הסבר "איך [החברה] משלמת היקף" — מתקפל; נשאר סגור אחרי שסוגרים (לכל משתמש בדפדפן) */
function Explainer({ storageKey, title, children }: { storageKey: string; title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === '1') setOpen(false);
    } catch {}
  }, [storageKey]);
  const onToggle = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    const isOpen = e.currentTarget.open;
    setOpen(isOpen);
    try {
      localStorage.setItem(storageKey, isOpen ? '0' : '1');
    } catch {}
  };
  return (
    <details className={st.card} open={open} onToggle={onToggle}>
      <summary className={st.h2} style={{ cursor: 'pointer' }}>{title}</summary>
      <ul className={st.explain}>{children}</ul>
    </details>
  );
}

function StatementExplainer({ s }: { s: HekefStatement }) {
  const pct = advancePct(s);
  return (
    <Explainer storageKey="hekef.statementExplainer.closed" title="איך כלל משלמת היקף?">
      <li>
        {pct === 0
          ? 'כלל משלמת את ההיקף פעם בשנה, אחרי סוף השנה (בלי מקדמות).'
          : `כל חודש כלל משלמת מקדמה${pct !== null ? ` של ${pct}%` : ''} על ההיקף שהצטבר מתחילת השנה, ואת השאר — אחרי סוף השנה.`}
      </li>
      <li>ביטול או פיגור מורידים מההיקף. כשהמקדמה של החודש יוצאת במינוס — כלל לא מורידה אותה עכשיו, אלא מהמקדמות הבאות.</li>
    </Explainer>
  );
}

/* דוח תנועות חודשי (מנורה) — כל משפט כאן נבדק מול שורות הדוח */
function MonthlyExplainer({ companyName }: { companyName: string }) {
  return (
    <Explainer storageKey="hekef.monthlyExplainer.closed" title={`איך ${companyName} משלמת היקף?`}>
      <li>כל חודש {companyName} משלמת עמלה על מה שקרה בתיק בחודש: מכירות חדשות והגדלות — ומקזזת על ביטולים והקטנות.</li>
      <li>בביטול מחזירים חלק מהעמלה, לפי השנה של הפוליסה — זה מופיע ליד כל ביטול.</li>
      <li><b>רטרו</b> = בדיקה ש{companyName} מריצה כל 3 חודשים, ומעדכנת בדיעבד שינויים (למשל שינוי בהסכם). לכן יכולה להופיע הפקה במינוס: הרישום הקודם בוטל.</li>
    </Explainer>
  );
}

/** "בסיס זיכוי לפנסיה רובד א` 2024" → "פנסיה רובד א` 2024" — המונח של מגדל לא אומר כלום לסוכן */
const baseLabel = (name: string) =>
  name
    .replace(/^העתק-\s*/, '')
    .replace(/^בסיס\s+זיכוי\s*(?:ל|למבצע\s+|בגין\s+)?/, '')
    .replace(/^מבצע\s+/, 'מבצע ')
    .replace(/\s*-\s*בסיס\s+תפוקה\s+לזיכוי\s*/, ' – ')
    .replace(/\s{2,}/g, ' ')
    .trim() || name;

/* מגדל — כל משפט כאן נבדק מול הדוחות (סוכנים רגילים, 09/2026) */
function MigdalExplainer() {
  return (
    <Explainer storageKey="hekef.migdalExplainer.closed" title="איך מגדל משלמת היקף?">
      <li>כל חודש מגדל משלמת עמלה על המכירות של השנה, ומקזזת על שינויים במכירות של שנים קודמות — בעיקר ביטולים.</li>
      <li>ביטול או פיגור מורידים מהעמלה. פוליסה שחוזרת מפיגור — העמלה עליה חוזרת.</li>
    </Explainer>
  );
}

/* עמודות לפי חודש — אותו גרף לכל החברות. חודש נבחר מודגש; מינוס באדום; לחיצה (אם יש) פותחת את החודש */
function MonthBars({ items, selected, onPick }: { items: { month: string; amount: number }[]; selected: string; onPick?: (m: string) => void }) {
  const max = Math.max(1, ...items.map((p) => Math.abs(p.amount)));
  return (
    <div className={st.payBars} style={{ direction: 'ltr' }}>
      {items.map((p) => (
        <div
          key={p.month}
          className={`${st.payCol} ${onPick ? st.payColClick : ''}`}
          title={`${monthLabel(p.month)}: ${ltr(fmt2(p.amount))}`}
          onClick={onPick ? () => onPick(p.month) : undefined}
        >
          <div className={`${st.payVal} ${p.amount < 0 ? st.neg : ''}`}>{p.amount ? fmt(p.amount) : ''}</div>
          <div
            className={`${st.payBar} ${p.month === selected ? st.payBarNow : ''} ${p.amount < 0 ? st.payBarNeg : ''}`}
            style={{ height: `${Math.max(2, (Math.abs(p.amount) / max) * 90)}px` }}
          />
          <div className={st.payLbl}>{p.month.slice(5, 7)}/{p.month.slice(2, 4)}</div>
        </div>
      ))}
    </div>
  );
}

type SummaryData = {
  years: string[];
  year: string;
  companies: { companyId: string; company: string }[];
  months: { month: string; cells: Record<string, number> }[];
  pending: { companyId: string; company: string; amount: number; asOf: string }[];
};

/* "כל החברות": נטו החודש לפי חברה וחודש עיבוד — מה שנכנס (או קוזז) בפועל. לחיצה על תא פותחת את החברה באותו חודש */
function HekefSummary({ agentId, onPick }: { agentId: string; onPick: (companyId: string, month: string) => void }) {
  const [year, setYear] = useState('');
  const [data, setData] = useState<SummaryData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setError('');
    apiFetch('/api/hekef-commission/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, year }),
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (!cancelled) setData(j);
      })
      .catch((e) => !cancelled && setError(e?.message || 'שגיאה'));
    return () => {
      cancelled = true;
    };
  }, [agentId, year]);

  if (error) return <div className={`${st.card} ${st.empty}`}>{error}</div>;
  if (!data) return <div className={st.card}><Spinner /></div>;
  if (!data.months.length) return <div className={`${st.card} ${st.empty}`}>אין עדיין נתוני היקף לשנה הזו</div>;

  const colTotal = (cid: string) => data.months.reduce((a, m) => a + (m.cells[cid] ?? 0), 0);
  const rowTotal = (cells: Record<string, number>) => Object.values(cells).reduce((a, v) => a + v, 0);
  const grand = data.months.reduce((a, m) => a + rowTotal(m.cells), 0);
  const cls = (v: number) => (v < -0.004 ? st.neg : '');

  return (
    <section className={st.card}>
      <div className={st.head}>
        <div>
          <h2 className={st.h2}>היקף · כל החברות · {data.year}</h2>
          <div className={st.sub}>נטו החודש לפי חברה — מה שנכנס או קוזז בפועל. לחיצה על סכום פותחת את החברה באותו חודש</div>
        </div>
        {data.years.length > 1 && (
          <select className={st.select} value={data.year} onChange={(e) => setYear(e.target.value)} aria-label="שנה">
            {data.years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>

      <div className={st.tbl}>
        <table className={`${t.cleanTable} ${st.sumTable}`}>
          <thead>
            <tr>
              <th>חודש עיבוד</th>
              {data.companies.map((c) => <th key={c.companyId} className={t.left}>{c.company}</th>)}
              <th className={t.left}>סה&quot;כ</th>
            </tr>
          </thead>
          <tbody>
            {data.months.map((m) => (
              <tr key={m.month}>
                <td className={st.num}>{monthLabel(m.month)}</td>
                {data.companies.map((c) => {
                  const v = m.cells[c.companyId];
                  return (
                    <td key={c.companyId} className={`${t.left} ${st.num}`}>
                      {v === undefined ? (
                        <span className={st.sub} title="לא נטען דוח לחודש הזה">—</span>
                      ) : (
                        <button type="button" className={`${st.sumCell} ${cls(v)}`} onClick={() => onPick(c.companyId, m.month)}>{fmt2(v)}</button>
                      )}
                    </td>
                  );
                })}
                <td className={`${t.left} ${st.num}`}><b className={cls(rowTotal(m.cells))}>{fmt2(rowTotal(m.cells))}</b></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>סה&quot;כ {data.year}</td>
              {data.companies.map((c) => <td key={c.companyId} className={`${t.left} ${st.num} ${cls(colTotal(c.companyId))}`}>{fmt2(colTotal(c.companyId))}</td>)}
              <td className={`${t.left} ${st.num} ${cls(grand)}`}>{fmt2(grand)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {data.pending.map((p) => (
        <div key={p.companyId} className={st.pendingRow}>
          מחכה בסוף השנה ({p.company}): <b className={st.num}>{fmt2(p.amount)}</b>
          <span className={st.sub}> · לפי הדוח של {monthLabel(p.asOf)} · לא כלול בסה&quot;כ, כי עוד לא שולם</span>
        </div>
      ))}
    </section>
  );
}

/* "על מה שילמו לך" / "על מה קיזזו לך" — קבוצות עם סכום; לחיצה פותחת את הפוליסות של הקבוצה */
function FlowList({ title, total, groups, labelOf, badge, empty }: {
  title: string;
  total: number;
  groups: HekefView['flows']['paid'];
  labelOf: (s: string) => string;
  badge: React.ReactNode;
  empty: string;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setOpen((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  return (
    <section className={st.card}>
      <div className={st.head}>
        <h2 className={st.h2}>{title} {badge}</h2>
        <div className={`${st.num} ${total < 0 ? st.neg : st.pos}`} style={{ fontWeight: 700, fontSize: 20 }}>{fmt2(total)}</div>
      </div>
      {groups.length === 0 ? (
        <div className={st.sub}>{empty}</div>
      ) : (
        <div className={st.flow}>
          {groups.map((g) => {
            const isOpen = open.has(g.key);
            return (
              <div key={g.key}>
                <div
                  className={`${st.flowRow} ${st.reasonClick}`}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isOpen}
                  onClick={() => toggle(g.key)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(g.key); } }}
                >
                  <span className={`${st.caret} ${isOpen ? st.caretOpen : ''}`}>◂</span>
                  <span className={st.flowLabel}>
                    {labelOf(g.label)}
                    {g.rew === 'מענקים' && <span className={st.rewTag}>מענק</span>}
                    {g.rew === 'עמלות פרסים' && <span className={st.rewTag}>פרס</span>}
                  </span>
                  <span className={st.sub}>{g.policies.length} {g.policies.length === 1 ? 'פוליסה' : 'פוליסות'}</span>
                  <span className={`${st.num} ${st.amtCell} ${g.amount < 0 ? st.neg : st.pos}`}>{fmt2(g.amount)}</span>
                </div>
                {isOpen && (
                  <div className={st.flowPolicies}>
                    {g.policies.map((p) => (
                      <div key={`${p.agent}|${p.no}`} className={st.flowPolicy}>
                        <span>{p.name || '—'}{p.note && <span className={st.flowNote}>{p.note}</span>}</span>
                        <span className={st.sub}>{p.prod}</span>
                        <span className={`${st.num} ${st.sub}`}>{p.no}</span>
                        <span className={`${st.num} ${st.amtCell} ${p.amount < 0 ? st.neg : ''}`}>{fmt2(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* סיכום החודש לדוח תנועות חודשי (מנורה) — באותו מבנה של דף החשבון של כלל */
/* שילמו / קיזזו / נטו — אותן שלוש קוביות בכל החברות */
function Kpi3({ paid, offset, net, lines, pick }: {
  paid: number;
  offset: number;
  net: number;
  /** שורות פירוט קטנות מתחת לכל קוביה (כלל: שנה נוכחית / שנים קודמות) */
  lines?: { paid: string[]; offset: string[]; net: string[] };
  /** לחיצה על קוביה מסננת את טבלת הפוליסות; לחיצה חוזרת / "נטו" מבטלת */
  pick?: KpiPick;
}) {
  const sub = (ls?: string[]) => ls?.map((t) => <div key={t} className={st.sub}>{t}</div>);
  const tile = (k: 'paid' | 'offset' | '', extra: string, children: React.ReactNode) =>
    pick ? (
      <button
        type="button"
        className={`${st.stmtTile} ${st.tileClick} ${extra} ${k && pick.active === k ? st.tileOn : ''}`}
        onClick={() => pick.onPick(k && pick.active !== k ? k : '')}
        title={k ? 'לחיצה מסננת את רשימת הפוליסות' : pick.active ? 'לחיצה מבטלת את הסינון' : undefined}
      >
        {children}
      </button>
    ) : (
      <div className={`${st.stmtTile} ${extra}`}>{children}</div>
    );
  return (
    <div className={st.kpi3}>
      {tile('paid', '', <>
        <div className={st.tileK}>שילמו לך</div>
        <div className={`${st.statV} ${st.num} ${st.pos}`}>{fmt2(paid)}</div>
        {sub(lines?.paid)}
      </>)}
      {tile('offset', '', <>
        <div className={st.tileK}>קיזזו לך</div>
        <div className={`${st.statV} ${st.num} ${offset < -0.004 ? st.neg : ''}`}>{fmt2(offset)}</div>
        {sub(lines?.offset)}
      </>)}
      {tile('', st.stmtHeld, <>
        <div className={st.tileK}>נטו החודש</div>
        <div className={`${st.statV} ${st.num} ${net < -0.004 ? st.neg : ''}`}>{fmt2(net)}</div>
        {sub(lines?.net)}
      </>)}
    </div>
  );
}

function MonthCard({ v, trend, onPickMonth, badge, variant = 'monthly', pick }: {
  pick?: KpiPick;
  v: HekefView;
  trend: HekefMonthSummary[];
  onPickMonth: (m: string) => void;
  badge: (topic: string) => React.ReactNode;
  variant?: 'monthly' | 'migdal';
}) {
  const months = [...trend].sort((a, b) => a.month.localeCompare(b.month)).map((t) => ({ month: t.month, amount: t.net }));
  return (
    <section className={st.card}>
      <div className={st.head}>
        <div>
          <h2 className={st.h2}>סיכום החודש · {monthName(v.month)} {badge('explainer')}</h2>
          <div className={st.sub}>{variant === 'migdal' ? 'מתוך דוחות ההיקף של החודש (שנה נוכחית + שנים קודמות)' : 'מתוך דוח ההיקף החודשי'}</div>
        </div>
      </div>

      <Kpi3 paid={v.flows.paidTotal} offset={v.flows.offsetTotal} net={v.net} pick={pick} />

      {months.length > 1 && (
        <div className={st.block}>
          <h3 className={st.h3}>עמלת היקף לפי חודש</h3>
          <p className={st.hint}>כל עמודה = סכום ההיקף בדוח של אותו חודש. לחיצה על עמודה פותחת את החודש</p>
          <MonthBars items={months} selected={v.month} onPick={onPickMonth} />
        </div>
      )}
    </section>
  );
}

function StatementCard({ s, v, badge, pick }: { s: HekefStatement; v: HekefView; badge: (topic: string) => React.ReactNode; pick?: KpiPick }) {
  const cy = s.currentYear;
  const pay = cy.payThisMonth ?? 0;
  const shk = s.priorYears.payThisMonth ?? 0;
  // מקדמה שלילית לא מקוזזת באותו חודש — נדחית עד שהזכאות המצטברת חוזרת למעלה
  const paidAdvance = Math.max(0, pay);
  const paidNow = paidAdvance + shk;
  const receivedYtd = (cy.paidPreviousMonths ?? 0) + paidAdvance;
  const payments = [...(s.payments || []), ...(s.month ? [{ month: s.month, amount: paidAdvance }] : [])];
  const tiersAhead = nextTiers(s);
  const remaining = Math.max(0, cy.totalNetEntitlement - receivedYtd);
  // כל קוביה מפוצלת לשנה הנוכחית ולשנים קודמות — כך רואים מאיפה מגיע מינוס של החודש
  const year = s.month.slice(0, 4);
  const k = v.flows.byKind;
  const pctTag = (() => { const p = advancePct(s); return p && p < 100 ? ` (${p}%)` : ''; })();
  const split = (cur: number, prior: number) => [`${year}: ${ltr(fmt(cur))}${pctTag}`, `שנים קודמות: ${ltr(fmt(prior))}`];
  // השנה הנוכחית: כלל משלמת רק pct% עכשיו. היתרה (100−pct) על מה שקרה החודש נוספת לסוף השנה —
  // או מקוזזת ממנו, כשהחודש היו בעיקר ביטולים. מקדמה שלילית לא יורדת עכשיו אלא מהמקדמות הבאות.
  const pct = advancePct(s);
  const rest = pct && pct < 100 && Math.abs(pay) > 0.004 ? (pay * (100 - pct)) / pct : 0;
  const yearLine =
    `${year}: ${ltr(fmt(pay))}${pct ? ` (${pct}%)` : ''}` +
    (pay < -0.004 ? ' — יקוזז מהמקדמות הבאות' : '') +
    (rest > 0.5 ? ` · עוד ${ltr(fmt(rest))} בסוף השנה` : rest < -0.5 ? ` · עוד ${ltr(fmt(rest))} יקוזזו בסוף השנה` : '');

  return (
    <section className={st.card}>
      <div className={st.head}>
        <h2 className={st.h2}>סיכום החודש · {monthName(s.month)} {badge('explainer')}</h2>
      </div>

      <Kpi3
        paid={v.flows.paidTotal}
        offset={v.flows.offsetTotal}
        net={paidNow}
        lines={{
          paid: split(k.current.paid, k.retro.paid),
          offset: split(k.current.offset, k.retro.offset),
          net: [yearLine, `שנים קודמות: ${ltr(fmt(shk))}`],
        }}
        pick={pick}
      />

      {pay < -0.004 && (
        <div className={st.stmtAlert}>
          המקדמה של החודש יצאה במינוס ({fmt2(pay)}). כלל לא מורידה אותה עכשיו — היא תקוזז מהמקדמות הבאות. לכן &quot;נטו החודש&quot; שונה מהחישוב.
        </div>
      )}
      {(cy.purchasedPortfoliosOffset ?? 0) > 0.004 && (
        <div className={st.stmtNote}>קוזזו מקדמות של {fmt2(cy.purchasedPortfoliosOffset!)} ששולמו בגין תיקים שנרכשו.</div>
      )}

      <div className={st.block}>
        <div className={st.yearBox}>
          <div className={st.yearCalc}>
            <div className={st.tileK}>מחכה לך בסוף השנה</div>
            <div className={`${st.statV} ${st.num}`}>{fmt(remaining)}</div>
            <div className={st.yearRows}>
              <span>הצטבר לך ב-{year}</span><span className={st.num}>{fmt(cy.totalNetEntitlement)}</span>
              <span>קיבלת עד עכשיו{pctTag}</span><span className={st.num}>{ltr(fmt(-receivedYtd))}</span>
              <b>מחכה לסוף השנה</b><b className={st.num}>{fmt(remaining)}</b>
            </div>
          </div>
          <div className={st.yearText}>
            כלל משלמת כל חודש רק חלק מהעמלה על {year}{pctTag ? ` —${pctTag.replace(/[()]/g, '')}` : ''}, ואת השאר מחזיקה עד ההתחשבנות אחרי סוף השנה.
            הסכום הזה לא מקזז את החודש, ואם פוליסות של {year} יבוטלו — הוא יקטן.
          </div>
        </div>
        {payments.length > 1 && <MonthBars items={payments} selected={s.month} />}
      </div>

      {tiersAhead.length > 0 && (
        <div className={st.block}>
          <h3 className={st.h3}>כמה חסר למדרגה הבאה {badge('tiers')}</h3>
          <div className={st.reasons} style={{ marginTop: 8 }}>
            {tiersAhead.map((t) => (
              <div key={t.product} className={st.tierRow}>
                <b>{t.product}</b>
                <span>
                  עוד <b className={st.num}>{fmt(t.need)}</b> פרמיה, והאחוז עולה מ-{t.rateNow}% ל-{t.rateNext}%.
                </span>
                <div className={st.progress} aria-hidden="true"><i style={{ width: `${Math.min(100, (t.now / (t.now + t.need || 1)) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

type HistoryMonth = {
  month: string;
  net: number;
  premium: number;
  cumulative: number;
  movements: string[];
  lines: { mv: string; kind: string; pct: number; net: number; c: number }[];
};

/* היסטוריית פוליסה — כל חודשי העיבוד שנטענו, נטען רק כשפותחים את הפוליסה */
function PolicyHistory({ agentId, companyId, policy, currentMonth }: { agentId: string; companyId: string; policy: HekefPolicy; currentMonth: string }) {
  const [months, setMonths] = useState<HistoryMonth[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiFetch('/api/hekef-commission/policy-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, companyId, policyNumber: policy.no, agentCode: policy.agent }),
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
        if (!cancelled) setMonths(j.months || []);
      })
      .catch((e) => !cancelled && setErr(e?.message || 'שגיאה'));
    return () => {
      cancelled = true;
    };
  }, [agentId, companyId, policy.no, policy.agent]);

  return (
    <div className={st.history}>
      <div className={st.historyHead}>היסטוריית הפוליסה לאורך הטעינות</div>
      {err ? (
        <div className={st.sub}>{err}</div>
      ) : !months ? (
        <div className={st.sub}>טוען היסטוריה…</div>
      ) : months.length <= 1 ? (
        <div className={st.sub}>
          עד עכשיו הפוליסה הופיעה רק בחודש העיבוד {monthLabel(months[0]?.month || currentMonth)}. ההיסטוריה תתמלא עם כל טעינה חודשית.
        </div>
      ) : (
        <>
          <ol className={st.timeline}>
            {months.map((m) => (
              <li key={m.month} className={`${st.tlItem} ${m.month === currentMonth ? st.tlCurrent : ''}`}>
                <span className={`${st.tlDot} ${m.net < -0.004 ? st.tlDotNeg : m.net > 0.004 ? st.tlDotPos : ''}`} />
                <div className={st.tlMonth}>{monthLabel(m.month)}</div>
                <div className={st.tlBody}>
                  <div>{m.movements.join(' · ')}</div>
                  <div className={st.sub}>
                    {m.lines.length} שורות · פרמיה נטו <span className={st.num}>{fmt2(m.premium)}</span>
                  </div>
                </div>
                <div className={st.tlAmounts}>
                  <b className={`${st.num} ${m.net < -0.004 ? st.neg : m.net > 0.004 ? st.pos : ''}`}>{fmt2(m.net)}</b>
                  <span className={st.sub}>מצטבר <span className={st.num}>{fmt2(m.cumulative)}</span></span>
                </div>
              </li>
            ))}
          </ol>
          <div className={st.note}>
            סך הכול נשאר לך מהפוליסה עד היום: <b className={`${st.num} ${months[months.length - 1].cumulative < 0 ? st.neg : st.pos}`}>{fmt2(months[months.length - 1].cumulative)}</b>
          </div>
        </>
      )}
    </div>
  );
}
