'use client';
// src/components/commission/summary/PolicyListModal.tsx
// רשימת הפוליסות שמרכיבות קוביית "תיק נוכחי" עבור חברה אחת
import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Spinner } from '@/components/Spinner';
import type { PortfolioCategory, PortfolioPolicyRow } from '@/types/agentInsights';
import { ACCENTS, fmtInt, fmtMoney, type Accent } from './ui';
import t from './table.module.css';
import ClassifiedProduct, { MATCH_LABEL, isUnmapped } from './ClassifiedProduct';
import CustomerLink from './CustomerLink';
import CustomerIssueBar from './CustomerIssueBar';
import useOpenCustomer from '@/hooks/useOpenCustomer';
import { postJsonCached } from '@/lib/fetchCache';

interface Props {
  agentId: string;
  year: string;
  category: PortfolioCategory;
  categoryTitle: string;
  company: string;
  accent: Accent;
  expectedTotal: number; // הסכום שמוצג בפילוח — לבדיקת התאמה
  onClose: () => void;
}

type SortKey = 'fullName' | 'customerId' | 'policyNumberKey' | 'productRaw' | 'product' | 'agentCode' | 'amount' | 'templateName';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'fullName', label: 'לקוח' },
  { key: 'customerId', label: 'ת״ז' },
  { key: 'policyNumberKey', label: 'מספר פוליסה' },
  { key: 'productRaw', label: 'מוצר' },
  { key: 'product', label: 'מוצר מסווג' },
  { key: 'agentCode', label: 'מספר סוכן' },
  { key: 'amount', label: 'סכום' },
  { key: 'templateName', label: 'דוח' },
];

const PAGE = 300;

const PolicyListModal: React.FC<Props> = ({ agentId, year, category, categoryTitle, company, accent, expectedTotal, onClose }) => {
  const a = ACCENTS[accent];
  const [rows, setRows] = useState<PortfolioPolicyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'amount', dir: 'desc' });
  const [visible, setVisible] = useState(PAGE);
  const [onlyUnmapped, setOnlyUnmapped] = useState(false);
  const { openCustomer, isPending, issue, clearIssue } = useOpenCustomer(agentId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // אותו גוף בקשה בדיוק כמו ב-prefetch של OverviewTab — כדי שייקלט מהזיכרון
        const d = await postJsonCached('/api/agent-insights/policies', { agentId, year, category, company });
        if (!cancelled) setRows(d.rows ?? []);
      } catch {
        if (!cancelled) setError('לא הצלחנו לטעון את רשימת הפוליסות.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, year, category, company]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = onlyUnmapped ? rows.filter((r) => isUnmapped(r.matchedBy)) : rows;
    if (q) {
      list = list.filter((r) =>
        [r.fullName, r.customerId, r.policyNumberKey, r.productRaw, r.product, r.agentCode].some((v) =>
          String(v ?? '').toLowerCase().includes(q)
        )
      );
    }
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...list].sort((x, y) => {
      if (sort.key === 'amount') return (x.amount - y.amount) * dir;
      return String(x[sort.key] ?? '').localeCompare(String(y[sort.key] ?? ''), 'he') * dir;
    });
  }, [rows, search, sort, onlyUnmapped]);

  useEffect(() => setVisible(PAGE), [search, sort, onlyUnmapped]);

  const unmappedCount = rows.filter((r) => isUnmapped(r.matchedBy)).length;

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const filteredTotal = filtered.reduce((s, r) => s + r.amount, 0);
  const uniquePolicies = new Set(rows.map((r) => `${r.policyNumberKey}|${r.customerId}`)).size;
  const mismatch = !loading && !error && Math.abs(total - expectedTotal) > 1;
  const showTemplate = new Set(rows.map((r) => r.templateName)).size > 1;
  const columns = showTemplate ? COLUMNS : COLUMNS.filter((c) => c.key !== 'templateName');

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'amount' ? 'desc' : 'asc' }));

  const exportToExcel = () => {
    const data = filtered.map((r) => ({
      'לקוח': r.fullName,
      'ת״ז': r.customerId,
      'מספר פוליסה': r.policyNumberKey,
      'מוצר': r.productRaw,
      'מוצר מסווג': r.product,
      'זיהוי': MATCH_LABEL[r.matchedBy],
      'מספר סוכן': r.agentCode,
      [categoryTitle]: r.amount,
      'דוח': r.templateName,
      'חודש פרסום': r.ym,
      'חודש דיווח': r.reportMonth,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'פוליסות');
    XLSX.writeFile(wb, `${categoryTitle}_${company}_${year}.xlsx`);
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" dir="rtl" onClick={onClose}>
      <div
        className="bg-white w-[min(1200px,96vw)] max-h-[88vh] rounded-2xl shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* כותרת */}
        <div className="px-5 py-4 border-b flex items-start justify-between gap-4">
          <div>
            <div className="font-black text-slate-800">
              {categoryTitle} · {company}
            </div>
            {!loading && !error && (
              <div className="text-xs text-slate-500 mt-1">
                {fmtInt(uniquePolicies)} פוליסות · {rows.length !== uniquePolicies ? `${fmtInt(rows.length)} שורות · ` : ''}
                סה&quot;כ <b className={a.text}>{fmtInt(total)} ₪</b>
                {rows[0] && ` · חודש פרסום ${rows[0].ym}`}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לקוח / ת״ז / פוליסה / מוצר / מספר סוכן"
              className="border rounded-lg px-3 py-1.5 text-sm w-64"
            />
            {unmappedCount > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 cursor-pointer whitespace-nowrap">
                <input type="checkbox" checked={onlyUnmapped} onChange={(e) => setOnlyUnmapped(e.target.checked)} />
                רק לא ממופים ({fmtInt(unmappedCount)})
              </label>
            )}
            <button
              type="button"
              onClick={exportToExcel}
              disabled={!filtered.length}
              className="flex items-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200 text-xs disabled:opacity-40"
            >
              <img src="/static/img/excel-icon.svg" width={16} height={16} alt="" />
              ייצוא
            </button>
            <button type="button" onClick={onClose} className="px-3 py-1.5 border rounded-lg text-sm">
              סגור
            </button>
          </div>
        </div>

        <CustomerIssueBar agentId={agentId} issue={issue} onClose={clearIssue} />

        {mismatch && (
          <div className="px-5 py-2 text-xs bg-amber-50 text-amber-800 border-b border-amber-200">
            ⚠️ סכום הרשימה ({fmtInt(total)} ₪) שונה מהסכום בקוביה ({fmtInt(expectedTotal)} ₪). ייתכן שנטענו נתונים חדשים — רענני את הדף.
          </div>
        )}

        {/* גוף */}
        <div className="overflow-auto flex-1">
          {loading ? (
            <div className="py-16 flex justify-center"><Spinner /></div>
          ) : error ? (
            <div className="p-6 text-sm text-red-600">{error}</div>
          ) : !rows.length ? (
            <div className="p-6 text-sm text-slate-500">אין פוליסות.</div>
          ) : (
            <table className={`${t.cleanTable} text-sm`}>
              <thead className="sticky top-0 bg-slate-50 text-slate-500 text-xs z-10">
                <tr>
                  {columns.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className={`px-3 py-2 font-bold cursor-pointer select-none whitespace-nowrap hover:text-slate-800 border-b ${
                        c.key === 'fullName' ? '' : t.center
                      }`}
                    >
                      {c.label} {sort.key === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.slice(0, visible).map((r, i) => (
                  <tr key={`${r.policyNumberKey}_${r.customerId}_${r.templateName}_${i}`} className="hover:bg-slate-50">
                    <td className="px-3 py-1.5 font-semibold">
                      <CustomerLink customerId={r.customerId} label={r.fullName} name={r.fullName} pending={isPending(r.customerId)} onOpen={openCustomer} />
                    </td>
                    <td className={`px-3 py-1.5 tabular-nums ${t.center}`}>
                      <CustomerLink customerId={r.customerId} label={r.customerId} name={r.fullName} pending={false} onOpen={openCustomer} className="text-slate-600" />
                    </td>
                    <td className={`px-3 py-1.5 text-slate-600 tabular-nums ${t.center}`}>{r.policyNumberKey}</td>
                    <td className={`px-3 py-1.5 text-slate-500 ${t.center}`}>{r.productRaw || '-'}</td>
                    <td className={`px-3 py-1.5 text-slate-700 ${t.center}`}>
                      <ClassifiedProduct product={r.product} matchedBy={r.matchedBy} />
                    </td>
                    <td className={`px-3 py-1.5 text-slate-600 tabular-nums ${t.center}`}>{r.agentCode || '-'}</td>
                    <td className={`px-3 py-1.5 font-bold whitespace-nowrap tabular-nums ${a.text} ${t.center}`}>{fmtMoney(r.amount)} ₪</td>
                    {showTemplate && <td className={`px-3 py-1.5 text-slate-500 text-xs ${t.center}`}>{r.templateName}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* תחתית */}
        {!loading && !error && rows.length > 0 && (
          <div className="px-5 py-2.5 border-t bg-slate-50 flex items-center justify-between text-xs text-slate-600">
            <span>
              מוצגות {fmtInt(Math.min(visible, filtered.length))} מתוך {fmtInt(filtered.length)}
              {search && ` (מסונן מתוך ${fmtInt(rows.length)})`}
              {filtered.length > visible && (
                <button type="button" onClick={() => setVisible((v) => v + PAGE)} className="mr-3 text-indigo-700 hover:underline">
                  הצג עוד
                </button>
              )}
            </span>
            <span>
              סה&quot;כ {search ? 'מסונן' : ''}: <b className={a.text}>{fmtMoney(filteredTotal)} ₪</b>
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default PolicyListModal;