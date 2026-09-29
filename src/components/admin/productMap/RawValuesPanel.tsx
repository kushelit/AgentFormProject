'use client';
// src/components/admin/productMap/RawValuesPanel.tsx
// ערכי המוצר שנקלטו בפועל בתבנית + הסיווג שלהם לפי הטיוטה הנוכחית
import React, { useMemo, useState } from 'react';
import { resolveFromTemplate } from '@/utils/contractCommissionResolvers';
import ClassifiedProduct, { isUnmapped, matchFromDebug } from '@/components/commission/summary/ClassifiedProduct';
import t from '@/components/commission/summary/table.module.css';
import type { Draft } from './model';
import { premiumFieldShort } from '@/lib/premiumFields';

export type RawValue = { raw: string; count: number; lastReportMonth: string };

interface Props {
  values: RawValue[];
  loading: boolean;
  error: string | null;
  scanned: number;
  truncated: boolean;
  preview: any; // התבנית לפי הטיוטה
  draft: Draft;
  onAddAlias: (entryId: string, raw: string) => void;
  onNewEntry: (raw: string) => void;
  onRefresh: () => void;
}

const fmt = (n: number) => n.toLocaleString('he-IL');

const RawValuesPanel: React.FC<Props> = ({ values, loading, error, scanned, truncated, preview, draft, onAddAlias, onNewEntry, onRefresh }) => {
  const [onlyUnmapped, setOnlyUnmapped] = useState(true);
  const [search, setSearch] = useState('');

  const resolved = useMemo(
    () =>
      values.map((v) => {
        const r = resolveFromTemplate(preview, v.raw);
        return { ...v, product: r.canonicalProduct || '', premiumField: r.premiumFieldUsed || '', matchedBy: matchFromDebug(r) };
      }),
    [values, preview]
  );

  const unmapped = resolved.filter((r) => isUnmapped(r.matchedBy));
  const unmappedRows = unmapped.reduce((s, r) => s + r.count, 0);
  const totalRows = resolved.reduce((s, r) => s + r.count, 0);

  const shown = resolved.filter(
    (r) => (!onlyUnmapped || isUnmapped(r.matchedBy)) && (!search.trim() || r.raw.toLowerCase().includes(search.trim().toLowerCase()))
  );

  const entryOptions = draft.entries.map((e) => ({ id: e.id, label: e.canonicalProduct || e.key || '(ללא שם)' }));

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b bg-slate-50 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-bold text-slate-700">ערכי מוצר שנקלטו בתבנית</div>
          {!loading && !error && (
            <div className="text-xs text-slate-500 mt-0.5">
              {fmt(resolved.length)} ערכים שונים · {fmt(totalRows)} שורות ·{' '}
              <span className={unmapped.length ? 'text-amber-700 font-bold' : 'text-emerald-700 font-bold'}>
                {unmapped.length ? `${fmt(unmapped.length)} ערכים לא ממופים (${fmt(unmappedRows)} שורות)` : 'הכל ממופה ✓'}
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש ערך"
            className="border rounded-lg px-3 py-1.5 text-sm w-44"
          />
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={onlyUnmapped} onChange={(e) => setOnlyUnmapped(e.target.checked)} />
            רק לא ממופים
          </label>
          <button type="button" onClick={onRefresh} className="text-xs text-indigo-700 hover:underline">
            ↻ רענון
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-sm text-slate-500">סורק את הנתונים שנקלטו…</div>
      ) : error ? (
        <div className="p-6 text-sm text-red-600">{error}</div>
      ) : !resolved.length ? (
        <div className="p-6 text-sm text-slate-500">לא נקלטו עדיין נתונים בתבנית הזו.</div>
      ) : (
        <div className="max-h-[520px] overflow-auto">
          <table className={`${t.cleanTable} text-sm`}>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="px-3 py-2">ערך מהקובץ</th>
                <th className="px-3 py-2">שורות</th>
                <th className="px-3 py-2">אחרון</th>
                <th className="px-3 py-2">מוצר מסווג</th>
                <th className="px-3 py-2">שדה פרמיה</th>
                <th className="px-3 py-2">מיפוי</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.raw || '__empty__'}>
                  <td className="px-3 py-1.5 font-semibold text-slate-800">{r.raw || <span className="text-slate-400">(ריק)</span>}</td>
                  <td className="px-3 py-1.5 tabular-nums text-slate-600">{fmt(r.count)}</td>
                  <td className="px-3 py-1.5 tabular-nums text-slate-500 text-xs">{r.lastReportMonth}</td>
                  <td className="px-3 py-1.5">
                    <ClassifiedProduct product={r.product} matchedBy={r.matchedBy} />
                  </td>
                  <td className="px-3 py-1.5 text-xs text-slate-500">{premiumFieldShort(r.premiumField) || '-'}</td>
                  <td className="px-3 py-1.5">
                    {r.raw ? (
                      <select
                        value=""
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === '__new__') onNewEntry(r.raw);
                          else if (v) onAddAlias(v, r.raw);
                        }}
                        className="border rounded-md px-2 py-1 text-xs bg-white max-w-[190px]"
                      >
                        <option value="">הוסף כ-alias ל…</option>
                        {entryOptions.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                        <option value="__new__">+ מוצר חדש</option>
                      </select>
                    ) : (
                      <span className="text-[11px] text-slate-400">ערך ריק — מקבל ברירת מחדל</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && <div className="p-4 text-sm text-slate-500">אין ערכים להצגה לפי הסינון.</div>}
        </div>
      )}

      {!loading && !error && (
        <div className="px-4 py-2 border-t text-[11px] text-slate-400">
          נסרקו {fmt(scanned)} פוליסות מכל הסוכנים{truncated ? ' · מוצגים 2,000 הערכים הנפוצים' : ''}. הסיווג מחושב לפי הטיוטה, לפני שמירה.
        </div>
      )}
    </div>
  );
};

export default RawValuesPanel;