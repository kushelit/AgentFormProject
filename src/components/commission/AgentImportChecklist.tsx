'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Spinner } from '@/components/Spinner';

type Props = { agentId: string; year: string };

type TemplateRow = {
  templateId: string;
  templateName: string;
  byMonth: Record<string, boolean>;
};

type CompanyRow = {
  companyId: string;
  companyName: string;
  templates: TemplateRow[];
};

type ApiResponse = {
  ok: boolean;
  months: string[]; // ["YYYY-MM", ...]
  rows: CompanyRow[];
  error?: string;
};

function CellMark({ ok, title }: { ok: boolean; title: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      className={[
        'inline-flex items-center justify-center',
        'w-full h-6',
        'text-sm font-medium',
        ok ? 'text-emerald-600' : 'text-rose-500',
      ].join(' ')}
    >
      {ok ? 'V' : '—'}
    </span>
  );
}


export default function AgentImportChecklist({ agentId, year }: Props) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [openCompanyId, setOpenCompanyId] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId || !year) return;

    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/agent-import-checklist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, year }),
        });

        const json = (await res.json()) as ApiResponse;
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) {
          setData({
            ok: false,
            months: [],
            rows: [],
            error: String(e?.message || e),
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [agentId, year]);

  const months = data?.months || [];

  // ✅ חישוב מצב חברה לחודש: V רק אם ALL templates loaded (לפי מה שביקשת)
  const computedRows = useMemo(() => {
    if (!data?.ok) return [];
    return (data.rows || []).map((c) => {
      const byMonth: Record<string, boolean> = {};
      for (const m of months) {
        const hasTemplates = (c.templates || []).length > 0;
        const allLoaded =
          hasTemplates && (c.templates || []).every((t) => !!t.byMonth?.[m]);
        byMonth[m] = allLoaded;
      }
      return { ...c, byMonth };
    });
  }, [data, months]);

  const monthLabel = (m: string) => {
    // m = "YYYY-MM"
    return m?.slice(5, 7) || '';
  };

  if (loading) return <Spinner />;

  if (!data?.ok) {
    return (
      <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
        שגיאה בטעינת בדיקת שלמות נתונים{data?.error ? `: ${data.error}` : ''}
      </div>
    );
  }

  return (
    <div className="w-full" dir="rtl">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="font-semibold text-gray-800">בדיקת שלמות נתונים</div>
          <div className="text-xs text-gray-500 mt-1">
            V = כל התבניות של החברה נטענו לחודש • X = חסרה לפחות תבנית אחת
          </div>
        </div>

        <div className="text-xs text-gray-500">
          שנה: <span className="font-semibold text-gray-700">{year}</span>
        </div>
      </div>

      {/* טבלת חברות */}
      <div className="border rounded-xl overflow-auto bg-white">
        <table className="min-w-max w-full text-sm text-right">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 border-b text-right min-w-[180px]">
                חברה
              </th>
              {months.map((m) => (
                <th
                  key={m}
                  className="px-2 py-2 border-b text-center min-w-[56px]"
                >
                  {monthLabel(m)}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {computedRows.map((r, idx) => {
              const isOpen = openCompanyId === r.companyId;

              return (
                <React.Fragment key={r.companyId}>
                  <tr
                    className={[
                      'cursor-pointer',
                      'hover:bg-gray-50',
                      idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30',
                      isOpen ? 'bg-blue-50/30' : '',
                    ].join(' ')}
                    onClick={() =>
                      setOpenCompanyId((prev) =>
                        prev === r.companyId ? null : r.companyId
                      )
                    }
                    title="לחצי לפתיחת פירוט תבניות"
                  >
                    <td className="px-3 py-2 border-b font-semibold text-gray-800 whitespace-nowrap">
                      {r.companyName}
                    </td>

                    {months.map((m) => {
                      const ok = !!(r as any).byMonth?.[m];
                      return (
                        <td key={m} className="px-2 py-2 border-b text-center">
                          <CellMark
                            ok={ok}
                            title={
                              ok
                                ? `כל התבניות נטענו (${r.companyName}) • חודש ${m}`
                                : `חסרות תבניות (${r.companyName}) • חודש ${m}`
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>

                  {/* פירוט תבניות */}
                  {isOpen && (
                    <tr className="bg-white">
                      <td className="px-3 py-3 border-b" colSpan={1 + months.length}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs text-gray-500">
                            פירוט תבניות עבור{' '}
                            <span className="font-semibold text-gray-700">
                              {r.companyName}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="text-xs text-gray-500 underline hover:no-underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenCompanyId(null);
                            }}
                          >
                            סגור פירוט
                          </button>
                        </div>

                        <div className="border rounded-xl overflow-auto">
                          <table className="min-w-max w-full text-sm text-right">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 border-b min-w-[260px]">
                                  תבנית
                                </th>
                                {months.map((m) => (
                                  <th
                                    key={m}
                                    className="px-2 py-2 border-b text-center min-w-[56px]"
                                  >
                                    {monthLabel(m)}
                                  </th>
                                ))}
                              </tr>
                            </thead>

                            <tbody>
                              {r.templates
                                .slice()
                                .sort((a, b) =>
                                  a.templateName.localeCompare(b.templateName, 'he')
                                )
                                .map((t, tIdx) => (
                                  <tr
                                    key={t.templateId}
                                    className={tIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}
                                  >
                                    <td className="px-3 py-2 border-b whitespace-nowrap text-gray-800">
                                      {t.templateName}
                                    </td>

                                    {months.map((m) => {
                                      const ok = !!t.byMonth?.[m];
                                      return (
                                        <td key={m} className="px-2 py-2 border-b text-center">
                                          <CellMark
                                            ok={ok}
                                            title={
                                              ok
                                                ? `נטען: ${t.templateName} • חודש ${m}`
                                                : `לא נטען: ${t.templateName} • חודש ${m}`
                                            }
                                          />
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {computedRows.length === 0 && (
              <tr>
                <td
                  colSpan={1 + months.length}
                  className="px-3 py-6 text-center text-sm text-gray-500"
                >
                  לא נמצאו תבניות/חברות פעילות להצגה.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
