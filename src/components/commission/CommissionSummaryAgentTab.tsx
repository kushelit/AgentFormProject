'use client';

import React, { useEffect, useRef, useState } from 'react';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { useAuth } from '@/lib/firebase/AuthContext';
import { Spinner } from '@/components/Spinner';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import AgentImportChecklist from '@/components/commission/AgentImportChecklist';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import * as XLSX from 'xlsx';

interface CommissionSummary {
  agentId: string;
  agentCode: string;
  reportMonth: string; // YYYY-MM
  templateId: string;
  totalCommissionAmount: number;
}

interface CompanyMap {
  [templateId: string]: string;
}

interface AgentMonthMap {
  [company: string]: {
    [agentCode: string]: {
      [month: string]: number;
    };
  };
}

interface MonthlyTotalRow {
  month: string;
  total: number;
}

type PerCompanyRow = Record<string, string | number>;

interface CommissionSummaryApiResponse {
  summaries: CommissionSummary[];
  companyMap: CompanyMap;
  companyIdByName: Record<string, string>;
  summaryByMonthCompany: Record<string, Record<string, number>>;
  summaryByCompanyAgentMonth: AgentMonthMap;
  allMonths: string[];
  allCompanies: string[];
  monthlyTotalsData: MonthlyTotalRow[];
  perCompanyOverMonthsData: PerCompanyRow[];
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
  validMonth?: string;
  runId?: string;
};


const CommissionSummaryAgentTab: React.FC = () => {
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  const [summaries, setSummaries] = useState<CommissionSummary[]>([]);
  const [companyMap, setCompanyMap] = useState<CompanyMap>({});
  const [summaryByMonthCompany, setSummaryByMonthCompany] = useState<
    Record<string, Record<string, number>>
  >({});
  const [summaryByCompanyAgentMonth, setSummaryByCompanyAgentMonth] =
    useState<AgentMonthMap>({});
  const [allMonths, setAllMonths] = useState<string[]>([]);
  const [allCompanies, setAllCompanies] = useState<string[]>([]);
  const [monthlyTotalsData, setMonthlyTotalsData] = useState<MonthlyTotalRow[]>(
    []
  );
  const [perCompanyOverMonthsData, setPerCompanyOverMonthsData] = useState<
    PerCompanyRow[]
  >([]);

  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<{ month: string; company: string } | null>(
    null
  );
  const drillScrollerRef = useRef<HTMLDivElement>(null);

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>(
    currentYear.toString()
  );

  const [companyIdByName, setCompanyIdByName] = useState<Record<string,string>>({});
  const [showChecklist, setShowChecklist] = useState(false);


  const handleToggleExpandCompany = (company: string) => {
    setExpanded((prev) =>
      prev?.company === company ? null : { month: 'ALL', company }
    );
  };

  const [drill, setDrill] = useState<DrillKey>(null);
  const [drillRows, setDrillRows] = useState<DrillRow[]>([]);
  const [drillLoading, setDrillLoading] = useState(false);


  useEffect(() => {
    const fetchSummaries = async () => {
      if (!selectedAgentId || !selectedYear) {
        setSummaries([]);
        setCompanyMap({});
        setSummaryByMonthCompany({});
        setSummaryByCompanyAgentMonth({});
        setAllMonths([]);
        setAllCompanies([]);
        setMonthlyTotalsData([]);
        setPerCompanyOverMonthsData([]);
        return;
      }

      setLoading(true);

      try {
        const res = await fetch('/api/commission-summary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: selectedAgentId,
            year: selectedYear,
          }),
        });

        if (!res.ok) {
          setSummaries([]);
  setCompanyMap({});
  setCompanyIdByName({});
  setSummaryByMonthCompany({});
  setSummaryByCompanyAgentMonth({});
  setAllMonths([]);
  setAllCompanies([]);
  setMonthlyTotalsData([]);
  setPerCompanyOverMonthsData([]);
          return;
        }

        const data: CommissionSummaryApiResponse = await res.json();

        setSummaries(data.summaries ?? []);
        setCompanyMap(data.companyMap ?? {});
        setCompanyIdByName(data.companyIdByName ?? {});
        setSummaryByMonthCompany(data.summaryByMonthCompany ?? {});
        setSummaryByCompanyAgentMonth(data.summaryByCompanyAgentMonth ?? {});
        setAllMonths(data.allMonths ?? []);
        setAllCompanies(data.allCompanies ?? []);
        setMonthlyTotalsData(data.monthlyTotalsData ?? []);
        setPerCompanyOverMonthsData(data.perCompanyOverMonthsData ?? []);
      } catch (err) {
        // console.error('fetchSummaries error:', err);
        setSummaries([]);
        setCompanyMap({});
        setSummaryByMonthCompany({});
        setSummaryByCompanyAgentMonth({});
        setAllMonths([]);
        setAllCompanies([]);
        setMonthlyTotalsData([]);
        setPerCompanyOverMonthsData([]);
        setCompanyIdByName({});
      } finally {
        setLoading(false);
      }
    };

    fetchSummaries();
  }, [selectedAgentId, selectedYear]);

  const handleToggleExpand = (month: string, company: string) => {
    if (expanded?.month === month && expanded.company === company) {
      setExpanded(null);
    } else {
      setExpanded({ month, company });
    }
  };

  const selectedCompany = expanded?.company;

  const formatCurrency = (v: number | string) =>
    Number(v).toLocaleString('he-IL', { maximumFractionDigits: 2 });

  const palette = [
    '#2563eb',
    '#16a34a',
    '#dc2626',
    '#7c3aed',
    '#f59e0b',
    '#0891b2',
    '#fb7185',
    '#84cc16',
    '#0ea5e9',
    '#a855f7',
  ];


  async function openDrill(companyId: string, agentCode: string, month: string) {
    setDrill({ companyId, agentCode, month });
    setDrillLoading(true);
    setDrillRows([]);
  
    try {
      const res = await fetch('/api/commission-summary-drilldown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgentId,
          companyId,
          agentCode,
          reportMonth: month, // YYYY-MM
        }),
      });
  
      if (!res.ok) return;
      const data = await res.json();
      setDrillRows(data.rows ?? []);
    } finally {
      setDrillLoading(false);
    }
  }
  

  const exportDrillToExcel = () => {
    if (!drill || drillRows.length === 0) return;
  
    const rowsForExcel = drillRows.map((r) => ({
      'פוליסה': r.policyNumberKey,
      'ת״ז': r.customerId ?? '', 
      'לקוח': r.fullName ?? '',
      'מוצר': r.product ?? '',
      'פרמיה': r.totalPremiumAmount,
      'עמלה': r.totalCommissionAmount,
      '% עמלה': r.commissionRate,
    }));
  
    const ws = XLSX.utils.json_to_sheet(rowsForExcel);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'פירוט פוליסות');
  
    const fileName = `פירוט_פוליסות_${drill.agentCode}_${drill.month}.xlsx`;
    XLSX.writeFile(wb, fileName);
  };
  
  return (
    <div className="p-4 max-w-6xl mx-auto text-right" dir="rtl">
      <h2 className="text-xl font-bold mb-4">סיכום עמלות לפי חודש וחברה</h2>
      {/* 🔹 בלוק נפרד מתחת לסלקטים */}
<div className="mb-4 px-4 py-3 text-sm text-gray-600 border rounded bg-white">
  <button
    type="button"
    className="text-blue-600 underline hover:no-underline"
    onClick={() => setShowChecklist(v => !v)}
    disabled={!selectedAgentId}
  >
    בדיקת שלמות נתונים {showChecklist ? '▲' : '▼'}
  </button>

  <div className="text-xs text-gray-500 mt-1">
    הצגת מצב טעינות לפי חברה/תבנית לשנה שנבחרה
  </div>

  {showChecklist && selectedAgentId && selectedYear && (
    <div className="mt-3 bg-gray-50 border rounded p-3">
      <AgentImportChecklist agentId={selectedAgentId} year={selectedYear} />
    </div>
  )}
</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 items-end">
        <div className="md:col-span-2">
          <label className="block font-semibold mb-1">בחר סוכן:</label>
          <select
            value={selectedAgentId}
            onChange={handleAgentChange}
            className="select-input w-full"
          >
            {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-semibold mb-1">בחר שנה:</label>
          <select
            className="select-input w-full"
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
          >
            <option value="">בחר שנה</option>
            {Array.from({ length: 10 }, (_, idx) => currentYear - idx).map(
              (year) => (
                <option key={year} value={year.toString()}>
                  {year}
                </option>
              )
            )}
          </select>
        </div>
      </div>
      {loading ? (
        <Spinner />
      ) : (
        <table className="table-auto w-full border text-sm text-right mt-6">
          <thead className="bg-gray-100">
            <tr>
            <th className="border px-3 py-1 min-w-[90px] whitespace-nowrap">
      חודש
    </th>
              {allCompanies.map((company) => {
                const isOpen = expanded?.company === company;
                return (
                  <th key={company} className="border px-2 py-1">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between gap-2 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 rounded px-1 py-0.5"
                      onClick={() => handleToggleExpandCompany(company)}
                      title="לחצי כדי להציג פירוט לפי מספרי סוכן לחברה זו"
                      aria-expanded={isOpen}
                    >
                      <span>{company}</span>
                      <ChevronRight
                        className={`h-4 w-4 transition-transform ${
                          isOpen ? 'rotate-90' : ''
                        }`}
                        aria-hidden="true"
                      />
                    </button>
                  </th>
                );
              })}
              <th className="border px-2 py-1 font-bold bg-gray-50">
                סה&quot;כ לחודש
              </th>
            </tr>
          </thead>
          <tbody>
            {allMonths.map((month) => {
              const monthTotal = allCompanies.reduce(
                (sum, company) =>
                  sum + (summaryByMonthCompany[month]?.[company] || 0),
                0
              );
              return (
                <tr key={month}>
<td className="border px-3 py-1 font-semibold min-w-[90px] whitespace-nowrap">
          {month}
        </td>    
         {allCompanies.map((company) => (
                    <td
                      key={company}
                      className="border px-2 py-1 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleToggleExpand(month, company)}
                    >
                      {summaryByMonthCompany[month]?.[company]?.toLocaleString() ??
                        '-'}
                    </td>
                  ))}
                  <td className="border px-2 py-1 font-bold bg-gray-100">
                    {monthTotal.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {selectedCompany && (
        <div className="mt-10">
          <h3 className="text-xl font-semibold mb-2">
            פירוט עבור חברה: {selectedCompany}
          </h3>
          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              className="p-2 rounded border hover:bg-gray-100"
              title="גלול ימינה"
              onClick={() =>
                drillScrollerRef.current?.scrollBy({
                  left: -400,
                  behavior: 'smooth',
                })
              }
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="p-2 rounded border hover:bg-gray-100"
              title="גלול שמאלה"
              onClick={() =>
                drillScrollerRef.current?.scrollBy({
                  left: 400,
                  behavior: 'smooth',
                })
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs text-gray-500 mr-auto">
              אפשר לגרור עם העכבר או להשתמש בחיצים לגלילה אופקית
            </span>
          </div>
          <div
            ref={drillScrollerRef}
            className="overflow-x-auto border rounded"
          >
            <table className="table-auto min-w-max w-full text-sm text-right whitespace-nowrap">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-2 py-1 sticky right-0 z-10 bg-gray-100">
                    חודש
                  </th>
                  {Object.keys(summaryByCompanyAgentMonth[selectedCompany] || {})
                    .sort()
                    .map((agentCode) => (
                      <th key={agentCode} className="border px-2 py-1">
                        {agentCode}
                      </th>
                    ))}
                  <th className="border px-2 py-1 font-bold bg-gray-50">
                    סה&quot;כ לחודש
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from(
                  new Set(
                    Object.values(
                      summaryByCompanyAgentMonth[selectedCompany] || {}
                    ).flatMap((m) => Object.keys(m))
                  )
                )
                  .sort()
                  .map((month) => {
                    const rowTotal = Object.keys(
                      summaryByCompanyAgentMonth[selectedCompany] || {}
                    ).reduce(
                      (sum, agentCode) =>
                        sum +
                        (summaryByCompanyAgentMonth[selectedCompany]?.[
                          agentCode
                        ]?.[month] || 0),
                      0
                    );
                    return (
                      <tr key={month}>
                        <td className="border px-2 py-1 font-semibold sticky right-0 z-10 bg-white">
                          {month}
                        </td>
                        {Object.keys(
                          summaryByCompanyAgentMonth[selectedCompany] || {}
                        )
                          .sort()
                          .map((agentCode) => (
                            <td
                            key={agentCode}
                            className="border px-2 py-1 cursor-pointer hover:bg-gray-100"
                            onClick={() => {
                              const companyId = companyIdByName[selectedCompany];
                              if (!companyId) return; 
                              openDrill(companyId, agentCode, month);
                            }}
         title="לחץ לפירוט פוליסות"
                          >
                            {summaryByCompanyAgentMonth[selectedCompany]?.[agentCode]?.[month]?.toLocaleString() ?? '-'}
                          </td>                          
                          ))}
                        <td className="border px-2 py-1 font-bold bg-gray-100">
                          {rowTotal.toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {!loading && allMonths.length > 0 && (
        <div className="mt-10 space-y-10">
          <section>
            <h3 className="text-xl font-semibold mb-3">
              גרף נפרעים לפי חודש (סה&quot;כ חודשי)
            </h3>
            <div className="w-full h-80 rounded-xl border bg-white">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={monthlyTotalsData}
                  margin={{ top: 10, right: 64, left: 10, bottom: 28 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="month"
                    interval={0}
                    angle={0}
                    height={50}
                    tickMargin={10}
                    padding={{ left: 10, right: 28 }}
                  />
                  <YAxis tickFormatter={formatCurrency} width={80} />
                  <Tooltip
                    formatter={(value) => [
                      formatCurrency(value as number),
                      'סה"כ',
                    ]}
                    labelFormatter={(label) => `חודש: ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke={palette[0]}
                    strokeWidth={3}
                    dot={{ r: 3 }}
                    name='סה"כ'
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section>
            <h3 className="text-xl font-semibold mb-3">
              גרף נפרעים לפי חברה (התפתחות חודשית)
            </h3>
            <div className="w-full h-96 rounded-xl border bg-white">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={perCompanyOverMonthsData}
                  margin={{ top: 10, right: 64, left: 10, bottom: 28 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="month"
                    interval={0}
                    height={50}
                    tickMargin={10}
                    padding={{ left: 10, right: 28 }}
                  />
                  <YAxis tickFormatter={formatCurrency} width={80} />
                  <Tooltip
                    formatter={(value, key) => [
                      formatCurrency(value as number),
                      key as string,
                    ]}
                    labelFormatter={(label) => `חודש: ${label}`}
                  />
                  <Legend wrapperStyle={{ direction: 'rtl' }} />
                  {allCompanies.map((company, idx) => (
                    <Line
                      key={company}
                      type="monotone"
                      dataKey={company}
                      stroke={palette[idx % palette.length]}
                      strokeWidth={2}
                      dot={false}
                      name={company}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>
      )}
      {drill && (
  <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" dir="rtl">
    <div className="bg-white w-[min(1100px,95vw)] max-h-[85vh] overflow-auto rounded-xl p-4">
    <div className="flex items-center justify-between mb-3">
  <div className="font-bold">
    פירוט פוליסות | חודש {drill.month} | מספר סוכן {drill.agentCode}
  </div>

  <div className="flex items-center gap-2">
    {/* ייצוא לאקסל */}
    <button
      type="button"
      onClick={exportDrillToExcel}
      title="ייצוא לאקסל"
      className={`p-1 rounded hover:bg-gray-100 ${
        drillRows.length ? '' : 'opacity-50 cursor-not-allowed'
      }`}
      disabled={!drillRows.length}
    >
      <img
        src="/static/img/excel-icon.svg"
        alt="ייצוא לאקסל"
        width={24}
        height={24}
      />
    </button>

    {/* סגירה */}
    <button
      className="px-3 py-1 border rounded"
      onClick={() => setDrill(null)}
    >
      סגור
    </button>
  </div>
</div>
      {drillLoading ? (
        <Spinner />
      ) : (
        <table className="w-full text-sm border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-2 py-1">פוליסה</th>
              <th className="border px-2 py-1">ת״ז</th>
              <th className="border px-2 py-1">לקוח</th>
              <th className="border px-2 py-1">מוצר</th>
              <th className="border px-2 py-1">פרמיה</th>
              <th className="border px-2 py-1">עמלה</th>
              <th className="border px-2 py-1">% עמלה</th>
            </tr>
          </thead>
          <tbody>
            {drillRows.map((r) => (
              <tr key={`${r.policyNumberKey}_${r.customerId}`}>
                <td className="border px-2 py-1">{r.policyNumberKey}</td>
                <td className="border px-2 py-1">{r.customerId ?? '-'}</td>
                <td className="border px-2 py-1">{r.fullName ?? '-'}</td>
                <td className="border px-2 py-1">{r.product ?? '-'}</td>
                <td className="border px-2 py-1">{Number(r.totalPremiumAmount ?? 0).toLocaleString()}</td>
                <td className="border px-2 py-1 font-semibold">{Number(r.totalCommissionAmount ?? 0).toLocaleString()}</td>
                <td className="border px-2 py-1">{Number(r.commissionRate ?? 0).toLocaleString()}</td>
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
export default CommissionSummaryAgentTab;
