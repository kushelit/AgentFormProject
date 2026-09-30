'use client';
// src/app/admin/claude-usage/page.tsx
// ניטור שימוש ב-Claude API.
//   לשונית "כל השימושים" — מ-aiUsageLogs: כל קריאות ה-AI במערכת (סקירת AI, ניתוח פוליסות, פיצ'רים עתידיים),
//                          לפי פיצ'ר / סוכן, כולל כשלונות, ואילו מפתחות (4 תווים אחרונים) בשימוש.
//   לשונית "ניתוח פוליסות"  — מ-policy_usage_logs: פירוט לפי סוכן ופוליסה (כמו קודם).
// ⚠ העלויות כאן הן הערכה (lib/ai/pricing). החיוב בפועל — דף Cost ב-Console של Anthropic.

import React, { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase/firebase';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, Timestamp } from 'firebase/firestore';
import AdminGuard from '@/app/admin/_components/AdminGuard';
import { estimateCostUsd } from '@/lib/ai/pricing';

// ─── Console links ────────────────────────────────────────────
const CONSOLE_LINKS = [
  { label: 'שימוש (Usage)', href: 'https://console.anthropic.com/settings/usage', hint: 'טוקנים לפי Workspace / מפתח / מודל' },
  { label: 'עלות (Cost)', href: 'https://console.anthropic.com/settings/cost', hint: 'דולרים — מקור האמת לחיוב' },
  { label: 'מפתחות (API keys)', href: 'https://console.anthropic.com/settings/keys', hint: 'אילו מפתחות קיימים ולאיזה Workspace' },
  { label: 'תקרות (Limits)', href: 'https://console.anthropic.com/settings/limits', hint: 'תקרת הוצאה חודשית' },
  { label: 'חיוב (Billing)', href: 'https://console.anthropic.com/settings/billing', hint: 'קרדיטים וטעינה אוטומטית' },
];

// ─── Types ────────────────────────────────────────────────────
interface AiLog {
  id: string;
  feature: string;
  model?: string;
  ok?: boolean;
  error?: string;
  detail?: string;
  input_tokens?: number;
  output_tokens?: number;
  estimatedCostUsd?: number;
  ms?: number;
  keyHint?: string;
  agentId?: string;
  agentUid?: string;
  createdAt: Timestamp | null;
}

interface PolicyUsageLog {
  id: string;
  agentUid: string;
  agentEmail: string;
  insuredName: string | null;
  policyNumber: string | null;
  companyName: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  model: string;
  fileName: string;
  parseConfidence: 'high' | 'medium' | 'low';
  timestamp: Timestamp | null;
}

// ─── Helpers ──────────────────────────────────────────────────
const AI_LOGS_LIMIT = 3000;
const ymOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;
const num = (n: number) => Math.round(n).toLocaleString('he-IL');

function fmtDateTime(d: Date | null) {
  if (!d) return '—';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function fmtDate(d: Date | null) {
  if (!d) return '—';
  return d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

const FEATURE_LABEL: Record<string, string> = {
  'agent-insights': 'סקירת AI (דף מסכם)',
  'parse-policy': 'ניתוח פוליסות PDF',
};
const featureLabel = (f: string) => FEATURE_LABEL[f] || f;

function logCost(l: AiLog) {
  if (typeof l.estimatedCostUsd === 'number') return l.estimatedCostUsd;
  return estimateCostUsd(l.model, l.input_tokens ?? 0, l.output_tokens ?? 0).cost;
}

/** שגיאה שמרמזת על תקרת הוצאה / קרדיט שנגמר */
const looksLikeLimit = (l: AiLog) => /credit|balance|spend|limit|quota|billing/i.test(`${l.detail ?? ''} ${l.error ?? ''}`);

function confidenceBadge(c: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    high: { bg: '#EAF3DE', color: '#3B6D11', label: 'גבוה' },
    medium: { bg: '#FAEEDA', color: '#854F0B', label: 'בינוני' },
    low: { bg: '#FCEBEB', color: '#A32D2D', label: 'נמוך' },
  };
  const s = map[c] || map['medium'];
  return <span style={{ background: s.bg, color: s.color, fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600 }}>{s.label}</span>;
}

// ═══════════════════════════════════════════════════════════════
// לשונית 1 — כל השימושים (aiUsageLogs)
// ═══════════════════════════════════════════════════════════════
function AllUsageSection() {
  const [logs, setLogs] = useState<AiLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState('');
  const [featureFilter, setFeatureFilter] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'aiUsageLogs'), orderBy('createdAt', 'desc'), limit(AI_LOGS_LIMIT)));
        setLogs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AiLog, 'id'>) })));
      } catch (e: any) {
        console.error('aiUsageLogs fetch error:', e);
        setError(
          /permission/i.test(String(e?.message))
            ? 'אין הרשאת קריאה לאוסף aiUsageLogs. יש להוסיף ב-Firestore rules הרשאת קריאה לאדמין (כמו ל-policy_usage_logs).'
            : `שגיאה בטעינה: ${e?.message ?? e}`
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const months = useMemo(() => {
    const s = new Set<string>();
    logs.forEach((l) => l.createdAt && s.add(ymOf(l.createdAt.toDate())));
    return Array.from(s).sort().reverse();
  }, [logs]);

  const features = useMemo(() => Array.from(new Set(logs.map((l) => l.feature))).sort(), [logs]);

  const filtered = useMemo(
    () =>
      logs.filter((l) => {
        if (featureFilter && l.feature !== featureFilter) return false;
        if (monthFilter && (!l.createdAt || ymOf(l.createdAt.toDate()) !== monthFilter)) return false;
        return true;
      }),
    [logs, monthFilter, featureFilter]
  );

  const totals = useMemo(() => {
    let cost = 0;
    let inTok = 0;
    let outTok = 0;
    let failed = 0;
    let unknownPrice = false;
    filtered.forEach((l) => {
      cost += logCost(l);
      inTok += l.input_tokens ?? 0;
      outTok += l.output_tokens ?? 0;
      if (l.ok === false) failed++;
      if (typeof l.estimatedCostUsd !== 'number' && !estimateCostUsd(l.model, 1, 1).known) unknownPrice = true;
    });
    return { calls: filtered.length, cost, inTok, outTok, failed, unknownPrice };
  }, [filtered]);

  const byFeature = useMemo(() => {
    const m = new Map<string, { calls: number; cost: number; inTok: number; outTok: number; failed: number; ms: number; msN: number }>();
    filtered.forEach((l) => {
      const x = m.get(l.feature) ?? { calls: 0, cost: 0, inTok: 0, outTok: 0, failed: 0, ms: 0, msN: 0 };
      x.calls++;
      x.cost += logCost(l);
      x.inTok += l.input_tokens ?? 0;
      x.outTok += l.output_tokens ?? 0;
      if (l.ok === false) x.failed++;
      if (l.ms) {
        x.ms += l.ms;
        x.msN++;
      }
      m.set(l.feature, x);
    });
    return Array.from(m.entries()).sort((a, b) => b[1].cost - a[1].cost);
  }, [filtered]);

  const byAgent = useMemo(() => {
    const m = new Map<string, { calls: number; cost: number; features: Set<string>; last: Date | null }>();
    filtered.forEach((l) => {
      const id = l.agentId || l.agentUid || '—';
      const x = m.get(id) ?? { calls: 0, cost: 0, features: new Set<string>(), last: null };
      x.calls++;
      x.cost += logCost(l);
      x.features.add(l.feature);
      const d = l.createdAt?.toDate() ?? null;
      if (d && (!x.last || d > x.last)) x.last = d;
      m.set(id, x);
    });
    return Array.from(m.entries()).sort((a, b) => b[1].cost - a[1].cost);
  }, [filtered]);

  const byKey = useMemo(() => {
    const m = new Map<string, { calls: number; last: Date | null; models: Set<string> }>();
    logs.forEach((l) => {
      const k = l.keyHint || '(לא נרשם)';
      const x = m.get(k) ?? { calls: 0, last: null, models: new Set<string>() };
      x.calls++;
      if (l.model) x.models.add(l.model);
      const d = l.createdAt?.toDate() ?? null;
      if (d && (!x.last || d > x.last)) x.last = d;
      m.set(k, x);
    });
    return Array.from(m.entries()).sort((a, b) => (b[1].last?.getTime() ?? 0) - (a[1].last?.getTime() ?? 0));
  }, [logs]);

  const failures = useMemo(() => filtered.filter((l) => l.ok === false).slice(0, 15), [filtered]);

  // שמות סוכנים (לפי מזהה) — עד 30 הראשונים
  useEffect(() => {
    const ids = byAgent.map(([id]) => id).filter((id) => id !== '—' && !names[id]).slice(0, 30);
    if (!ids.length) return;
    let cancelled = false;
    (async () => {
      const found: Record<string, string> = {};
      await Promise.all(
        ids.map(async (id) => {
          try {
            const s = await getDoc(doc(db, 'users', id));
            const d: any = s.exists() ? s.data() : null;
            found[id] = String(d?.name || d?.fullName || d?.email || id);
          } catch {
            found[id] = id;
          }
        })
      );
      if (!cancelled) setNames((prev) => ({ ...prev, ...found }));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byAgent]);

  if (loading) return <p className="text-center text-slate-500 py-10">טוען נתונים…</p>;
  if (error) return <div className="p-4 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>;

  const th = 'px-3 py-2 text-right font-medium text-slate-500 whitespace-nowrap border-b border-slate-200';
  const td = 'px-3 py-2 text-right';

  return (
    <div className="space-y-5">
      {/* כרטיסי סיכום */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'קריאות AI', value: num(totals.calls) },
          { label: 'עלות משוערת', value: usd(totals.cost) },
          { label: 'טוקנים (קלט / פלט)', value: `${num(totals.inTok)} / ${num(totals.outTok)}` },
          { label: 'כשלונות', value: num(totals.failed), warn: totals.failed > 0 },
          { label: 'ממוצע לקריאה', value: totals.calls ? usd(totals.cost / totals.calls) : '—' },
        ].map((c) => (
          <div key={c.label} className={`rounded-xl border px-4 py-3 ${c.warn ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
            <div className={`text-xs font-medium ${c.warn ? 'text-amber-800' : 'text-slate-500'}`}>{c.label}</div>
            <div className={`text-xl font-semibold mt-1 ${c.warn ? 'text-amber-900' : 'text-slate-900'}`}>{c.value}</div>
          </div>
        ))}
      </div>
      {totals.unknownPrice && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          חלק מהקריאות נעשו במודל שאין לו מחיר ב-lib/ai/pricing.ts — העלות שלהן מוערכת לפי מחיר ברירת המחדל.
        </div>
      )}

      {/* פילטרים */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-end gap-4">
        <label className="text-xs font-medium text-slate-500">
          חודש
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className="block mt-1 text-sm border border-slate-200 rounded-lg px-2 py-1.5 min-w-[140px]">
            <option value="">כל התקופה</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      <label className="text-xs font-medium text-slate-500">
  פיצ&apos;ר
  <select
    value={featureFilter}
    onChange={(e) => setFeatureFilter(e.target.value)}
    className="block mt-1 text-sm border border-slate-200 rounded-lg px-2 py-1.5 min-w-[180px]"
  >
    <option value="">כל הפיצ&apos;רים</option>
            {features.map((f) => (
              <option key={f} value={f}>
                {featureLabel(f)}
              </option>
            ))}
          </select>
        </label>
        {(monthFilter || featureFilter) && (
          <button
            onClick={() => {
              setMonthFilter('');
              setFeatureFilter('');
            }}
            className="text-sm text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50"
          >
            נקה
          </button>
        )}
        {logs.length >= AI_LOGS_LIMIT && <span className="text-xs text-slate-400 mr-auto">מוצגות {AI_LOGS_LIMIT} הקריאות האחרונות</span>}
      </div>

      {/* לפי פיצ'ר */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
<div className="px-4 py-3 border-b border-slate-200 font-semibold text-sm">
  לפי פיצ&apos;ר
</div>        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['פיצ\'ר', 'קריאות', 'קלט', 'פלט', 'עלות משוערת', 'ממוצע לקריאה', 'זמן ממוצע', 'כשלונות'].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byFeature.map(([f, x]) => (
                <tr key={f} className="border-t border-slate-100">
                  <td className={`${td} font-medium`}>
                    {featureLabel(f)}
                    <div className="text-[11px] font-normal text-slate-400">{f}</div>
                  </td>
                  <td className={`${td} font-semibold`}>{num(x.calls)}</td>
                  <td className={`${td} text-slate-500`}>{num(x.inTok)}</td>
                  <td className={`${td} text-slate-500`}>{num(x.outTok)}</td>
                  <td className={`${td} font-semibold`}>{usd(x.cost)}</td>
                  <td className={td}>{usd(x.cost / x.calls)}</td>
                  <td className={`${td} text-slate-500`}>{x.msN ? `${(x.ms / x.msN / 1000).toFixed(1)} שנ'` : '—'}</td>
                  <td className={`${td} ${x.failed ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>{x.failed || '—'}</td>
                </tr>
              ))}
              {!byFeature.length && (
                <tr>
                  <td colSpan={8} className="text-center text-slate-400 py-6">
                    אין קריאות לתקופה
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* לפי סוכן */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 font-semibold text-sm">לפי סוכן</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['סוכן', 'קריאות', 'עלות משוערת', 'פיצ\'רים', 'פעילות אחרונה'].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byAgent.slice(0, 50).map(([id, x]) => (
                <tr key={id} className="border-t border-slate-100">
                  <td className={`${td} font-medium`}>{names[id] || id}</td>
                  <td className={`${td} font-semibold`}>{num(x.calls)}</td>
                  <td className={`${td} font-semibold`}>{usd(x.cost)}</td>
                  <td className={`${td} text-slate-500`}>{Array.from(x.features).map(featureLabel).join(' · ')}</td>
                  <td className={`${td} text-slate-500 text-xs`}>{fmtDateTime(x.last)}</td>
                </tr>
              ))}
              {!byAgent.length && (
                <tr>
                  <td colSpan={5} className="text-center text-slate-400 py-6">
                    אין קריאות לתקופה
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* מפתחות בשימוש */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <div className="font-semibold text-sm">מפתחות API שבהם נעשה שימוש</div>
          <div className="text-xs text-slate-500 mt-0.5">
            מוצגים 4 התווים האחרונים של המפתח, כפי שהם מופיעים גם בדף ה-API keys ב-Console. אם מופיע יותר ממפתח אחד, הסביבה משתמשת בכמה מפתחות.
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {['מפתח', 'קריאות', 'מודלים', 'שימוש אחרון'].map((h) => (
                  <th key={h} className={th}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byKey.map(([k, x]) => (
                <tr key={k} className="border-t border-slate-100">
                  <td className={`${td} font-mono`}>{k.startsWith('(') ? k : `••••${k}`}</td>
                  <td className={`${td} font-semibold`}>{num(x.calls)}</td>
                  <td className={`${td} text-slate-500 text-xs`}>{Array.from(x.models).join(', ') || '—'}</td>
                  <td className={`${td} text-slate-500 text-xs`}>{fmtDateTime(x.last)}</td>
                </tr>
              ))}
              {!byKey.length && (
                <tr>
                  <td colSpan={4} className="text-center text-slate-400 py-6">
                    אין נתונים
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* כשלונות אחרונים */}
      {failures.length > 0 && (
        <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-red-100 bg-red-50/60 font-semibold text-sm text-red-800">כשלונות אחרונים ({failures.length})</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {['זמן', 'פיצ\'ר', 'שגיאה', 'פירוט', 'מפתח'].map((h) => (
                    <th key={h} className={th}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {failures.map((l) => (
                  <tr key={l.id} className="border-t border-slate-100 align-top">
                    <td className={`${td} text-slate-500 text-xs whitespace-nowrap`}>{fmtDateTime(l.createdAt?.toDate() ?? null)}</td>
                    <td className={td}>{featureLabel(l.feature)}</td>
                    <td className={`${td} font-mono text-xs`}>
                      {l.error || '—'}
                      {looksLikeLimit(l) && (
                        <div className="mt-1 inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-sans font-semibold">חשד לתקרה / קרדיט</div>
                      )}
                    </td>
                    <td className={`${td} text-slate-600 text-xs max-w-[420px]`}>{l.detail || '—'}</td>
                    <td className={`${td} font-mono text-xs`}>{l.keyHint ? `••••${l.keyHint}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// לשונית 2 — ניתוח פוליסות (policy_usage_logs) — כמו קודם
// ═══════════════════════════════════════════════════════════════
interface AgentStats {
  email: string;
  uid: string;
  policies: number;
  totalCost: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  highConfidenceCount: number;
  lastActivity: Date | null;
  logs: PolicyUsageLog[];
}

function PolicyUsageSection() {
  const [logs, setLogs] = useState<PolicyUsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState('');
  const [agentFilter, setAgentFilter] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'policy_usage_logs'), orderBy('timestamp', 'desc')));
        setLogs(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PolicyUsageLog, 'id'>) })));
      } catch (e) {
        console.error('ClaudeUsage fetch error:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredLogs = useMemo(
    () =>
      logs.filter((log) => {
        if (agentFilter && !log.agentEmail.toLowerCase().includes(agentFilter.toLowerCase())) return false;
        if (confidenceFilter && log.parseConfidence !== confidenceFilter) return false;
        if (monthFilter && log.timestamp && ymOf(log.timestamp.toDate()) !== monthFilter) return false;
        return true;
      }),
    [logs, agentFilter, monthFilter, confidenceFilter]
  );

  const agentStats = useMemo(() => {
    const map = new Map<string, AgentStats>();
    for (const log of filteredLogs) {
      const key = log.agentEmail;
      if (!map.has(key)) {
        map.set(key, { email: key, uid: log.agentUid, policies: 0, totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, highConfidenceCount: 0, lastActivity: null, logs: [] });
      }
      const s = map.get(key)!;
      s.policies++;
      s.totalCost += log.estimatedCostUsd;
      s.totalInputTokens += log.inputTokens;
      s.totalOutputTokens += log.outputTokens;
      if (log.parseConfidence === 'high') s.highConfidenceCount++;
      const ts = log.timestamp ? log.timestamp.toDate() : null;
      if (ts && (!s.lastActivity || ts > s.lastActivity)) s.lastActivity = ts;
      s.logs.push(log);
    }
    return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
  }, [filteredLogs]);

  const totals = useMemo(() => {
    const cost = filteredLogs.reduce((s, r) => s + r.estimatedCostUsd, 0);
    return {
      agents: agentStats.length,
      policies: filteredLogs.length,
      cost,
      avgCost: filteredLogs.length ? cost / filteredLogs.length : 0,
      lowConfidence: filteredLogs.filter((r) => r.parseConfidence === 'low'),
    };
  }, [filteredLogs, agentStats]);

  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    logs.forEach((log) => log.timestamp && months.add(ymOf(log.timestamp.toDate())));
    return Array.from(months).sort().reverse();
  }, [logs]);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'סוכנים פעילים', value: totals.agents },
          { label: 'פוליסות נותחו', value: totals.policies },
          { label: 'עלות כוללת', value: `$${totals.cost.toFixed(3)}` },
          { label: 'ממוצע לפוליסה', value: `$${totals.avgCost.toFixed(4)}` },
          { label: 'Confidence נמוך', value: totals.lowConfidence.length, warn: totals.lowConfidence.length > 0 },
        ].map((c) => (
          <div key={c.label} style={{ background: c.warn ? '#FAEEDA' : '#f8fafc', border: `1px solid ${c.warn ? '#fcd34d' : '#e2e8f0'}`, borderRadius: 10, padding: '14px 16px' }}>
            <p style={{ fontSize: 12, color: c.warn ? '#92400e' : '#64748b', margin: '0 0 6px', fontWeight: 500 }}>{c.label}</p>
            <p style={{ fontSize: 22, fontWeight: 600, margin: 0, color: c.warn ? '#92400e' : '#0f172a' }}>{c.value}</p>
          </div>
        ))}
      </div>

      {totals.lowConfidence.length > 0 && (
        <div style={{ background: '#FAEEDA', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: '#92400e' }}>
          <span style={{ fontWeight: 600 }}>⚠️ {totals.lowConfidence.length} פוליסות עם confidence נמוך — מומלץ לבדוק ידנית: </span>
          {totals.lowConfidence.map((r) => r.policyNumber).join(', ')}
        </div>
      )}

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: '#64748b', display: 'block', marginBottom: 4 }}>חודש</label>
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', minWidth: 140 }}>
            <option value="">כל התקופה</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: '#64748b', display: 'block', marginBottom: 4 }}>סוכן</label>
          <input value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} placeholder="חיפוש לפי אימייל..." style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', minWidth: 200 }} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 500, color: '#64748b', display: 'block', marginBottom: 4 }}>Confidence</label>
          <select value={confidenceFilter} onChange={(e) => setConfidenceFilter(e.target.value)} style={{ fontSize: 13, padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
            <option value="">הכל</option>
            <option value="high">גבוה</option>
            <option value="medium">בינוני</option>
            <option value="low">נמוך</option>
          </select>
        </div>
        {(monthFilter || agentFilter || confidenceFilter) && (
          <button
            onClick={() => {
              setMonthFilter('');
              setAgentFilter('');
              setConfidenceFilter('');
            }}
            style={{ fontSize: 13, padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', color: '#64748b' }}
          >
            נקה פילטרים
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>טוען נתונים...</p>
      ) : agentStats.length === 0 ? (
        <p style={{ color: '#64748b', textAlign: 'center', padding: 40 }}>לא נמצאו רשומות</p>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>פירוט לפי סוכן</p>
            <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
              {agentStats.length} סוכנים, {filteredLogs.length} פוליסות
            </p>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['סוכן', 'פוליסות', 'טוקנים input', 'עלות כוללת', 'ממוצע לפוליסה', 'Confidence גבוה', 'פעילות אחרונה', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 500, color: '#64748b', whiteSpace: 'nowrap', borderBottom: '1px solid #e2e8f0' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {agentStats.map((agent, i) => {
                const isExpanded = expandedAgent === agent.email;
                const highPct = Math.round((agent.highConfidenceCount / agent.policies) * 100);
                return (
                  <React.Fragment key={agent.email}>
                    <tr style={{ borderTop: '1px solid #f1f5f9', background: i === 0 ? '#f8fafc' : 'white' }}>
                      <td style={{ padding: '12px 14px' }}>
                        <p style={{ margin: 0, fontWeight: 500 }}>{agent.email}</p>
                        {i === 0 && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#0ea5e9' }}>הכי פעיל</p>}
                      </td>
                      <td style={{ padding: '12px 14px', fontWeight: 600 }}>{agent.policies}</td>
                      <td style={{ padding: '12px 14px', color: '#64748b' }}>{agent.totalInputTokens.toLocaleString()}</td>
                      <td style={{ padding: '12px 14px', fontWeight: 600 }}>${agent.totalCost.toFixed(3)}</td>
                      <td style={{ padding: '12px 14px' }}>${(agent.totalCost / agent.policies).toFixed(4)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ color: highPct >= 80 ? '#16a34a' : highPct >= 50 ? '#854f0b' : '#a32d2d', fontWeight: 600 }}>{highPct}%</span>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#64748b', fontSize: 12 }}>{fmtDateTime(agent.lastActivity)}</td>
                      <td style={{ padding: '12px 14px' }}>
                        <button onClick={() => setExpandedAgent(isExpanded ? null : agent.email)} style={{ fontSize: 12, color: '#0ea5e9', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500 }}>
                          {isExpanded ? 'סגור ▲' : 'פרטים ▼'}
                        </button>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr>
                        <td colSpan={8} style={{ padding: 0, background: '#f8fafc' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ background: '#f1f5f9' }}>
                                {['תאריך', 'מבוטח', 'פוליסה', 'חברה', 'קובץ', 'Input tokens', 'Output tokens', 'עלות', 'Confidence'].map((h) => (
                                  <th key={h} style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 500, color: '#64748b', whiteSpace: 'nowrap' }}>
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {agent.logs.map((log) => (
                                <tr key={log.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                                  <td style={{ padding: '8px 14px', color: '#64748b' }}>{log.timestamp ? fmtDate(log.timestamp.toDate()) : '—'}</td>
                                  <td style={{ padding: '8px 14px', fontWeight: 500 }}>{log.insuredName || '—'}</td>
                                  <td style={{ padding: '8px 14px', fontFamily: 'monospace' }}>{log.policyNumber || '—'}</td>
                                  <td style={{ padding: '8px 14px' }}>{log.companyName || '—'}</td>
                                  <td style={{ padding: '8px 14px', color: '#64748b', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.fileName}</td>
                                  <td style={{ padding: '8px 14px' }}>{log.inputTokens.toLocaleString()}</td>
                                  <td style={{ padding: '8px 14px' }}>{log.outputTokens.toLocaleString()}</td>
                                  <td style={{ padding: '8px 14px', fontWeight: 500 }}>${log.estimatedCostUsd.toFixed(4)}</td>
                                  <td style={{ padding: '8px 14px' }}>{confidenceBadge(log.parseConfidence)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════
export default function ClaudeUsageAdminPage() {
  const [tab, setTab] = useState<'all' | 'policies'>('all');
  const projectId = String((db as any)?.app?.options?.projectId ?? '');

  return (
    <AdminGuard>
      <div dir="rtl" style={{ padding: '24px 32px', maxWidth: 1150, margin: '0 auto', fontFamily: 'inherit' }}>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0, color: '#0f172a' }}>ניטור שימוש Claude API</h1>
            <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
              כל קריאות ה-AI במערכת. העלויות כאן הן <b>הערכה</b> — החיוב בפועל ב-Console.
            </p>
          </div>
          {projectId && (
            <div className="text-xs bg-slate-100 border border-slate-200 rounded-lg px-3 py-2">
              <span className="text-slate-500">סביבה (פרויקט Firebase): </span>
              <b className="font-mono text-slate-800">{projectId}</b>
            </div>
          )}
        </div>

        {/* קישורים ל-Console */}
        <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl px-4 py-3 mb-5">
          <div className="text-xs font-bold text-indigo-900 mb-2">Console של Anthropic — חיוב בפועל, מפתחות ותקרות</div>
          <div className="flex flex-wrap gap-2">
            {CONSOLE_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                title={l.hint}
                className="px-3 py-1.5 rounded-lg bg-white border border-indigo-200 text-indigo-700 text-sm font-semibold hover:bg-indigo-50"
              >
                {l.label} ↗
              </a>
            ))}
          </div>
        </div>

        {/* לשוניות */}
        <div className="flex gap-1 border-b border-slate-200 mb-5">
          {(
            [
              ['all', 'כל השימושים'],
              ['policies', 'ניתוח פוליסות (לפי סוכן)'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`px-5 py-2.5 text-sm font-bold border-b-2 -mb-px ${tab === k ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'all' ? <AllUsageSection /> : <PolicyUsageSection />}
      </div>
    </AdminGuard>
  );
}