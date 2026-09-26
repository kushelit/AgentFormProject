'use client';
// src/components/commission/summary/CommissionTablesTab.tsx
// טבלאות עמלות (לפי חודש פרסום / לפי חודש דיווח) + דרילים:
// חברה → תבנית → מספר סוכן → פוליסות
import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { Spinner } from '@/components/Spinner';
import { resolveFromTemplate } from '@/utils/contractCommissionResolvers';
import type { CommissionSummaryData } from '@/hooks/useCommissionSummary';
import t from './table.module.css';
import ClassifiedProduct, { MATCH_LABEL, matchFromDebug } from './ClassifiedProduct';

interface Props {
  agentId: string;
  year: string;
  data: CommissionSummaryData;
  loading: boolean;
}

type DrillKey = { companyId: string; agentCode: string; month: string } | null;

type DrillRow = {
  policyNumberKey: string;
  customerId: string;
  fullName?: string;
  product?: string;
  totalCommissionAmount: number;
  totalPremiumAmount: number;
  commissionRate?: number;
  reportMonth: string;
  templateId: string;
};

const CommissionTablesTab: React.FC<Props> = ({ agentId, year, data, loading }) => {
  const { companyIdByName, summaryByMonthCompany, summaryByYmCompany, allMonths, allCompanies } = data;

  const [subTab, setSubTab] = useState<'ym' | 'reportMonth'>('ym');
  const [templatesById, setTemplatesById] = useState<Record<string, any>>({});

  // דריל תבניות לפי חברה
  const [templateDrill, setTemplateDrill] = useState<{ companyId: string; companyName: string; ym?: string } | null>(null);
  const [byTemplateMonth, setByTemplateMonth] = useState<Record<string, Record<string, number>>>({});
  const [templateNames, setTemplateNames] = useState<Record<string, string>>({});
  const [templateDrillMonths, setTemplateDrillMonths] = useState<string[]>([]);
  const [templateDrillLoading, setTemplateDrillLoading] = useState(false);

  // תבנית לכל השנה
  const [templateYearDrill, setTemplateYearDrill] = useState<{
    companyId: string;
    companyName: string;
    templateId: string;
    templateName: string;
    byMonth: Record<string, number>;
  } | null>(null);

  // דריל לפי מספר סוכן
  const [agentDrill, setAgentDrill] = useState<{ companyName: string; companyId: string; templateId: string; month: string; ym?: string } | null>(null);
  const [agentDrillData, setAgentDrillData] = useState<Record<string, number>>({});
  const [agentDrillLoading, setAgentDrillLoading] = useState(false);
  const [agentDrillSort, setAgentDrillSort] = useState<{ key: 'agentCode' | 'amount'; dir: 'asc' | 'desc' }>({ key: 'amount', dir: 'desc' });

  // דריל פוליסות
  const [drill, setDrill] = useState<DrillKey>(null);
  const [drillRows, setDrillRows] = useState<DrillRow[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, 'commissionTemplates'));
      const map: Record<string, any> = {};
      snap.forEach((d) => {
        map[d.id] = d.data();
      });
      setTemplatesById(map);
    })();
  }, []);

  // סגירת דרילים פתוחים כשמחליפים סוכן/שנה
  useEffect(() => {
    setTemplateDrill(null);
    setTemplateYearDrill(null);
    setAgentDrill(null);
    setDrill(null);
  }, [agentId, year]);

  async function openTemplateDrill(companyId: string, companyName: string, ym?: string) {
    setTemplateDrill({ companyId, companyName, ym });
    setTemplateDrillLoading(true);
    setByTemplateMonth({});
    setTemplateNames({});
    setTemplateDrillMonths([]);
    try {
      const res = await fetch('/api/commission-summary-by-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, companyId, year, ym }),
      });
      const d = await res.json();
      setByTemplateMonth(d.byTemplateMonth ?? {});
      setTemplateNames(d.templateNames ?? {});
      setTemplateDrillMonths(d.allMonths ?? []);
    } finally {
      setTemplateDrillLoading(false);
    }
  }

  async function openTemplateYearDrill(tid: string) {
    if (!templateDrill) return;
    const res = await fetch('/api/commission-summary-by-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId, companyId: templateDrill.companyId, year }),
    });
    const d = await res.json();
    setTemplateYearDrill({
      companyId: templateDrill.companyId,
      companyName: templateDrill.companyName,
      templateId: tid,
      templateName: templateNames[tid] || tid,
      byMonth: d.byTemplateMonth?.[tid] ?? {},
    });
  }

  async function openAgentDrill(companyId: string, companyName: string, templateId: string, month: string, ym?: string) {
    setAgentDrill({ companyName, companyId, templateId, month, ym });
    setAgentDrillLoading(true);
    setAgentDrillData({});
    try {
      const res = await fetch('/api/commission-summary-by-template-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, companyId, templateId, month, ym }),
      });
      const d = await res.json();
      setAgentDrillData(d.byAgent ?? {});
    } finally {
      setAgentDrillLoading(false);
    }
  }

  async function openDrill(companyId: string, agentCode: string, month: string, templateId?: string, ym?: string) {
    setDrill({ companyId, agentCode, month });
    setDrillLoading(true);
    setDrillRows([]);
    try {
      const res = await fetch('/api/commission-summary-drilldown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, companyId, agentCode, reportMonth: month, templateId, ym }),
      });
      if (!res.ok) return;
      const d = await res.json();
      setDrillRows(d.rows ?? []);
    } finally {
      setDrillLoading(false);
    }
  }

  const productOf = (r: DrillRow) => {
    const res = resolveFromTemplate(templatesById[r.templateId], r.product);
    return { product: res.canonicalProduct || 'אחר', matchedBy: matchFromDebug(res) };
  };

  const exportDrillToExcel = () => {
    if (!drill || !drillRows.length) return;
    const rows = drillRows.map((r) => ({
      'פוליסה': r.policyNumberKey,
      'ת״ז': r.customerId ?? '',
      'לקוח': r.fullName ?? '',
      'מוצר': String(r.product ?? '').trim(),
      'מוצר מסווג': productOf(r).product,
      'זיהוי': MATCH_LABEL[productOf(r).matchedBy],
      'פרמיה': r.totalPremiumAmount,
      'עמלה': r.totalCommissionAmount,
      '% עמלה': r.commissionRate,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'פירוט פוליסות');
    XLSX.writeFile(wb, `פירוט_פוליסות_${drill.agentCode}_${drill.month}.xlsx`);
  };

  const companyHeader = (company: string, headerBg: string) => (
    <th key={company} className={`px-3 py-2 ${headerBg}`}>
      <button
        type="button"
        className="hover:underline"
        title="לחצי לפילוח לפי תבניות"
        onClick={() => {
          const companyId = companyIdByName[company];
          if (companyId) openTemplateDrill(companyId, company);
        }}
      >
        {company}
      </button>
    </th>
  );

  if (loading) return <div className="py-16 flex justify-center"><Spinner /></div>;

  return (
    <div>
      <div className="flex gap-2 border-b">
        {([
          ['ym', 'לפי חודש פרסום'],
          ['reportMonth', 'לפי חודש דיווח'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors ${
              subTab === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setSubTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {subTab === 'ym' &&
        (Object.keys(summaryByYmCompany).length === 0 ? (
          <div className="p-6 text-sm text-slate-500">אין נתונים לפי חודש פרסום לשנה {year}.</div>
        ) : (
          <table className={`${t.cleanTable} table-auto w-full text-sm text-right`}>
            <thead>
              <tr>
                <th className="px-3 py-2 min-w-[90px] whitespace-nowrap">חודש פרסום</th>
                {allCompanies.map((c) => companyHeader(c, ''))}
                <th className="px-3 py-2 font-bold bg-blue-100">סה&quot;כ</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(summaryByYmCompany)
                .sort()
                .map((ym) => {
                  const total = allCompanies.reduce((s, c) => s + (summaryByYmCompany[ym]?.[c] || 0), 0);
                  return (
                    <tr key={ym}>
                      <td className="px-3 py-2 font-semibold whitespace-nowrap">{ym}</td>
                      {allCompanies.map((c) => {
                        const v = summaryByYmCompany[ym]?.[c];
                        return (
                          <td
                            key={c}
                            className={`px-3 py-2 ${v ? 'cursor-pointer hover:bg-blue-50' : ''}`}
                            onClick={() => {
                              const companyId = companyIdByName[c];
                              if (companyId && v) openTemplateDrill(companyId, c, ym);
                            }}
                          >
                            {v?.toLocaleString() ?? '-'}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 font-bold bg-blue-50">{total.toLocaleString()}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        ))}

      {subTab === 'reportMonth' &&
        (allMonths.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">אין נתונים לפי חודש דיווח לשנה {year}.</div>
        ) : (
          <table className={`${t.cleanTable} table-auto w-full text-sm text-right`}>
            <thead>
              <tr>
                <th className="px-3 py-2 min-w-[90px] whitespace-nowrap">חודש דיווח</th>
                {allCompanies.map((c) => companyHeader(c, ''))}
                <th className="px-3 py-2 font-bold bg-gray-50">סה&quot;כ לחודש</th>
              </tr>
            </thead>
            <tbody>
              {allMonths.map((month) => {
                const total = allCompanies.reduce((s, c) => s + (summaryByMonthCompany[month]?.[c] || 0), 0);
                return (
                  <tr key={month}>
                    <td className="px-3 py-2 font-semibold whitespace-nowrap">{month}</td>
                    {allCompanies.map((c) => (
                      <td
                        key={c}
                        className="px-3 py-2 cursor-pointer hover:bg-gray-100"
                        onClick={() => {
                          const companyId = companyIdByName[c];
                          if (companyId) openTemplateDrill(companyId, c);
                        }}
                      >
                        {summaryByMonthCompany[month]?.[c]?.toLocaleString() ?? '-'}
                      </td>
                    ))}
                    <td className="px-3 py-2 font-bold bg-gray-100">{total.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ))}

      {/* ─── דריל: תבניות לפי חברה ─── */}
      {templateDrill && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" dir="rtl">
          <div className="bg-white w-[min(1100px,95vw)] max-h-[85vh] overflow-auto rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold">
                פילוח לפי תבניות | {templateDrill.companyName}
                {templateDrill.ym ? ` | חודש פרסום ${templateDrill.ym}` : ''}
              </div>
              <button className="px-3 py-2 border rounded" onClick={() => setTemplateDrill(null)}>סגור</button>
            </div>
            {templateDrillLoading ? (
              <Spinner />
            ) : (
              <table className={`${t.cleanTable} w-full text-sm`}>
                <thead>
                  <tr>
                    <th className="px-3 py-2">תבנית</th>
                    {templateDrillMonths.map((m) => (
                      <th key={m} className="px-3 py-2">{m}</th>
                    ))}
                    <th className="px-3 py-2 font-bold">סה&quot;כ</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(byTemplateMonth).map(([tid, monthMap]) => {
                    const total = Object.values(monthMap).reduce((s, v) => s + v, 0);
                    return (
                      <tr key={tid}>
                        <td
                          className="px-3 py-2 font-semibold cursor-pointer hover:bg-blue-50"
                          onClick={() => openTemplateYearDrill(tid)}
                          title="לחצי לתצוגה שנתית של התבנית"
                        >
                          {templateNames[tid] || tid}
                        </td>
                        {templateDrillMonths.map((m) => (
                          <td
                            key={m}
                            className={`px-3 py-2 ${monthMap[m] ? 'cursor-pointer hover:bg-gray-100' : 'text-gray-300'}`}
                            title="לחצי לפירוט לפי מספר סוכן"
                            onClick={() => {
                              if (!monthMap[m]) return;
                              openAgentDrill(templateDrill.companyId, templateDrill.companyName, tid, m, templateDrill.ym);
                            }}
                          >
                            {monthMap[m]?.toLocaleString() ?? '-'}
                          </td>
                        ))}
                        <td className="px-3 py-2 font-bold bg-gray-50">{total.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ─── דריל: תבנית לאורך השנה ─── */}
      {templateYearDrill && (
        <div className="fixed inset-0 z-[55] bg-black/40 flex items-center justify-center" dir="rtl">
          <div className="bg-white w-[min(900px,95vw)] max-h-[85vh] overflow-auto rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold">
                {templateYearDrill.templateName} | {templateYearDrill.companyName} | {year}
              </div>
              <button className="px-3 py-2 border rounded" onClick={() => setTemplateYearDrill(null)}>סגור</button>
            </div>
            <table className={`${t.cleanTable} w-full text-sm`}>
              <thead>
                <tr>
                  <th className="px-3 py-2">חודש דיווח</th>
                  <th className="px-3 py-2">סכום עמלה</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(templateYearDrill.byMonth)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([month, amount]) => (
                    <tr
                      key={month}
                      className="hover:bg-gray-100 cursor-pointer"
                      onClick={() =>
                        openAgentDrill(templateYearDrill.companyId, templateYearDrill.companyName, templateYearDrill.templateId, month)
                      }
                    >
                      <td className="px-3 py-2">{month}</td>
                      <td className="px-3 py-2 font-semibold">{Number(amount).toLocaleString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── דריל: לפי מספר סוכן ─── */}
      {agentDrill && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center" dir="rtl">
          <div className="bg-white w-[min(900px,95vw)] max-h-[85vh] overflow-auto rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold">
                פירוט לפי מספר סוכן | {templateNames[agentDrill.templateId] || agentDrill.templateId} | {agentDrill.month}
              </div>
              <button className="px-3 py-2 border rounded" onClick={() => setAgentDrill(null)}>סגור</button>
            </div>
            {agentDrillLoading ? (
              <Spinner />
            ) : (
              <table className={`${t.cleanTable} w-full text-sm`}>
                <thead>
                  <tr>
                    <th
                      className="px-3 py-2 cursor-pointer hover:bg-gray-200 select-none"
                      onClick={() =>
                        setAgentDrillSort((s) => ({ key: 'agentCode', dir: s.key === 'agentCode' && s.dir === 'asc' ? 'desc' : 'asc' }))
                      }
                    >
                      מספר סוכן {agentDrillSort.key === 'agentCode' ? (agentDrillSort.dir === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th
                      className="px-3 py-2 cursor-pointer hover:bg-gray-200 select-none"
                      onClick={() =>
                        setAgentDrillSort((s) => ({ key: 'amount', dir: s.key === 'amount' && s.dir === 'desc' ? 'asc' : 'desc' }))
                      }
                    >
                      סכום עמלה {agentDrillSort.key === 'amount' ? (agentDrillSort.dir === 'desc' ? '▼' : '▲') : ''}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(agentDrillData)
                    .sort(([codeA, a], [codeB, b]) => {
                      if (agentDrillSort.key === 'agentCode') {
                        return agentDrillSort.dir === 'asc' ? codeA.localeCompare(codeB) : codeB.localeCompare(codeA);
                      }
                      return agentDrillSort.dir === 'desc' ? b - a : a - b;
                    })
                    .map(([agentCode, amount]) => (
                      <tr
                        key={agentCode}
                        className="cursor-pointer hover:bg-gray-100"
                        onClick={() => {
                          const d = agentDrill;
                          setAgentDrill(null);
                          setTemplateDrill(null);
                          setTemplateYearDrill(null);
                          openDrill(d.companyId, agentCode, d.month, d.templateId, d.ym);
                        }}
                      >
                        <td className="px-3 py-2">{agentCode}</td>
                        <td className="px-3 py-2 font-semibold">{amount.toLocaleString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ─── דריל: פוליסות ─── */}
      {drill && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" dir="rtl">
          <div className="bg-white w-[min(1100px,95vw)] max-h-[85vh] overflow-auto rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold">
                פירוט פוליסות | חודש {drill.month} | מספר סוכן {drill.agentCode}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={exportDrillToExcel}
                  title="ייצוא לאקסל"
                  disabled={!drillRows.length}
                  className={`p-1 rounded hover:bg-gray-100 ${drillRows.length ? '' : 'opacity-50 cursor-not-allowed'}`}
                >
                  <img src="/static/img/excel-icon.svg" alt="ייצוא לאקסל" width={24} height={24} />
                </button>
                <button className="px-3 py-2 border rounded" onClick={() => setDrill(null)}>סגור</button>
              </div>
            </div>
            {drillLoading ? (
              <Spinner />
            ) : (
              <table className={`${t.cleanTable} w-full text-sm`}>
                <thead>
                  <tr>
                    <th className="px-3 py-2">פוליסה</th>
                    <th className="px-3 py-2">ת״ז</th>
                    <th className="px-3 py-2">לקוח</th>
                    <th className="px-3 py-2">מוצר</th>
                    <th className="px-3 py-2">מוצר מסווג</th>
                    <th className="px-3 py-2">פרמיה</th>
                    <th className="px-3 py-2">עמלה</th>
                    <th className="px-3 py-2">% עמלה</th>
                  </tr>
                </thead>
                <tbody>
                  {drillRows.map((r) => (
                    <tr key={`${r.policyNumberKey}_${r.customerId}`}>
                      <td className="px-3 py-2">{r.policyNumberKey}</td>
                      <td className="px-3 py-2">{r.customerId ?? '-'}</td>
                      <td className="px-3 py-2">{r.fullName ?? '-'}</td>
                      <td className="px-3 py-2 text-slate-500">{String(r.product ?? '').trim() || '-'}</td>
                      <td className="px-3 py-2">
                        {(() => {
                          const p = productOf(r);
                          return <ClassifiedProduct product={p.product} matchedBy={p.matchedBy} />;
                        })()}
                      </td>
                      <td className="px-3 py-2">{Number(r.totalPremiumAmount ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-2 font-semibold">{Number(r.totalCommissionAmount ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-2">{Number(r.commissionRate ?? 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CommissionTablesTab;
