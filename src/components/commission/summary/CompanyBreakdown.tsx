'use client';
// src/components/commission/summary/CompanyBreakdown.tsx
// פילוח לפי חברה — רכיב אחד לכל הקוביות
import React from 'react';
import type { CompanyAmount } from '@/types/agentInsights';
import { ACCENTS, fmtInt, type Accent } from './ui';
import t from './table.module.css';

interface Props {
  title: string;
  rows: CompanyAmount[];
  total: number;
  accent: Accent;
  latestYm?: string | null; // אם קיים — חודש ישן יותר מסומן
  onClose: () => void;
  /** אם מוגדר — לחיצה על חברה פותחת את רשימת הפוליסות */
  onCompanyClick?: (company: string) => void;
}

const CompanyBreakdown: React.FC<Props> = ({ title, rows, total, accent, latestYm, onClose, onCompanyClick }) => {
  const a = ACCENTS[accent];
  const showPolicies = rows.some((r) => r.policies !== undefined);
  const showMonths = rows.some((r) => r.months?.length);
  const totalPolicies = rows.reduce((s, r) => s + (r.policies ?? 0), 0);

  return (
    <div className="mt-3 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
        <div className="font-bold text-slate-700 text-sm">
          {title} — פילוח לפי חברה
          {onCompanyClick && <span className="font-normal text-xs text-slate-400 mr-2">לחצי על חברה לרשימת הפוליסות</span>}
        </div>
        <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700">
          סגור ✕
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="p-4 text-sm text-slate-500">אין נתונים.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className={`${t.cleanTable} text-sm`}>
            <thead className="text-slate-500 text-xs">
              <tr className="border-b">
                <th className="px-4 py-2 font-bold">חברה</th>
                {showMonths && <th className="px-4 py-2 font-bold">חודש פרסום</th>}
                {showPolicies && <th className="px-4 py-2 font-bold">פוליסות</th>}
                <th className="px-4 py-2 font-bold">סכום</th>
                <th className="px-4 py-2 font-bold w-[35%]">נתח</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => {
                const share = total ? (r.amount / total) * 100 : 0;
                const old = !!latestYm && !!r.months?.some((m) => m < latestYm);
                return (
                  <tr
                    key={r.company}
                    className={`hover:bg-slate-50 ${onCompanyClick ? 'cursor-pointer' : ''}`}
                    onClick={onCompanyClick ? () => onCompanyClick(r.company) : undefined}
                  >
                    <td className="px-4 py-2 font-semibold text-slate-800">
                      {r.company}
                      {onCompanyClick && <span className="text-slate-400 text-xs mr-1">›</span>}
                    </td>
                    {showMonths && (
                      <td className={`px-4 py-2 whitespace-nowrap ${old ? 'text-amber-700' : 'text-slate-600'}`}>
                        {r.months?.join(', ')}
                      </td>
                    )}
                    {showPolicies && <td className="px-4 py-2 text-slate-600">{fmtInt(r.policies ?? 0)}</td>}
                    <td className={`px-4 py-2 font-bold whitespace-nowrap ${a.text}`}>{fmtInt(r.amount)} ₪</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className={`h-full ${a.bar}`} style={{ width: `${Math.max(share, 0)}%` }} />
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
                {showMonths && <td className="px-4 py-2" />}
                {showPolicies && <td className="px-4 py-2">{fmtInt(totalPolicies)}</td>}
                <td className={`px-4 py-2 whitespace-nowrap ${a.text}`}>{fmtInt(total)} ₪</td>
                <td className="px-4 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
};

export default CompanyBreakdown;
