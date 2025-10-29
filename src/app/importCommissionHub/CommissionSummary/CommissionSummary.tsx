'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { useAuth } from '@/lib/firebase/AuthContext';
import { Spinner } from '@/components/Spinner';
import { ChevronLeft, ChevronRight } from 'lucide-react';
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

export default function CommissionSummaryPage() {
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();
  const [summaries, setSummaries] = useState<CommissionSummary[]>([]);
  const [companyMap, setCompanyMap] = useState<CompanyMap>({});
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<{ month: string; company: string } | null>(null);
  const drillScrollerRef = useRef<HTMLDivElement>(null);

  const handleToggleExpandCompany = (company: string) => {
    setExpanded((prev) => (prev?.company === company ? null : { month: 'ALL', company }));
  };

  useEffect(() => {
    const fetchSummaries = async () => {
      if (!selectedAgentId) return;
      setLoading(true);
      const q = query(collection(db, 'commissionSummaries'), where('agentId', '==', selectedAgentId));
      const snapshot = await getDocs(q);
      const fetched = snapshot.docs.map((doc) => doc.data() as CommissionSummary);
      setSummaries(fetched);
      setLoading(false);
    };
    fetchSummaries();
  }, [selectedAgentId]);

  useEffect(() => {
    const fetchCompanyMap = async () => {
      try {
        const templatesSnap = await getDocs(collection(db, 'commissionTemplates'));
        const map: CompanyMap = {};

        for (const docSnap of templatesSnap.docs) {
          const data = docSnap.data();
          const templateId = docSnap.id;

          if (data?.companyId) {
            const companyRef = doc(db, 'company', data.companyId);
            const companySnap = await getDoc(companyRef);

            if (companySnap.exists()) {
              const companyData = companySnap.data();
              map[templateId] = companyData?.companyName || 'חברה ללא שם';
            } else {
              map[templateId] = 'חברה לא נמצאה';
            }
          } else {
            map[templateId] = 'לא ידוע';
          }
        }

        setCompanyMap(map);
      } catch (error) {
        console.error('שגיאה בעת שליפת מפת החברות:', error);
      }
    };

    fetchCompanyMap();
  }, []);

  const summaryByMonthCompany = useMemo(() => {
    return summaries.reduce((acc, curr) => {
      const company = companyMap[curr.templateId] || 'לא ידוע';
      const month = curr.reportMonth;
      if (!acc[month]) acc[month] = {} as Record<string, number>;
      if (!acc[month][company]) acc[month][company] = 0;
      acc[month][company] += curr.totalCommissionAmount || 0;
      return acc;
    }, {} as Record<string, Record<string, number>>);
  }, [summaries, companyMap]);

  const summaryByCompanyAgentMonth = useMemo(() => {
    return summaries.reduce((acc, curr) => {
      const company = companyMap[curr.templateId] || 'לא ידוע';
      const month = curr.reportMonth;
      const agentCode = curr.agentCode || '-';
      if (!acc[company]) acc[company] = {} as Record<string, Record<string, number>>;
      if (!acc[company][agentCode]) acc[company][agentCode] = {} as Record<string, number>;
      if (!acc[company][agentCode][month]) acc[company][agentCode][month] = 0;
      acc[company][agentCode][month] += curr.totalCommissionAmount || 0;
      return acc;
    }, {} as AgentMonthMap);
  }, [summaries, companyMap]);

  const allMonths = useMemo(() => Object.keys(summaryByMonthCompany).sort(), [summaryByMonthCompany]);
  const allCompanies = useMemo(
    () => Array.from(new Set(Object.values(summaryByMonthCompany).flatMap((m) => Object.keys(m)))),
    [summaryByMonthCompany]
  );

  const handleToggleExpand = (month: string, company: string) => {
    if (expanded?.month === month && expanded.company === company) {
      setExpanded(null);
    } else {
      setExpanded({ month, company });
    }
  };

  const selectedCompany = expanded?.company;

  // ===== Helpers for charts =====
  const formatCurrency = (v: number | string) =>
    Number(v).toLocaleString('he-IL', { maximumFractionDigits: 2 });

  // Data for Chart 1: monthly totals ("גרף נפרעים לפי חודש")
  const monthlyTotalsData = useMemo(
    () =>
      allMonths.map((month) => ({
        month,
        total: allCompanies.reduce((sum, company) => sum + (summaryByMonthCompany[month]?.[company] || 0), 0),
      })),
    [allMonths, allCompanies, summaryByMonthCompany]
  );

  // Data for Chart 2: per-company line series over months ("גרף נפרעים לפי חברה")
  const perCompanyOverMonthsData = useMemo(() => {
    return allMonths.map((month) => {
      const row: Record<string, number | string> = { month };
      allCompanies.forEach((company) => {
        row[company] = summaryByMonthCompany[month]?.[company] || 0;
      });
      return row;
    });
  }, [allMonths, allCompanies, summaryByMonthCompany]);

  const palette = [
    '#2563eb', // blue-600
    '#16a34a', // green-600
    '#dc2626', // red-600
    '#7c3aed', // violet-600
    '#f59e0b', // amber-500
    '#0891b2', // cyan-700
    '#fb7185', // rose-400
    '#84cc16', // lime-500
    '#0ea5e9', // sky-500
    '#a855f7', // purple-500
  ];

  return (
    <div className="p-6 max-w-6xl mx-auto text-right" dir="rtl">
      <h2 className="text-2xl font-bold mb-4">סיכום עמלות לפי חודש וחברה</h2>

      <div className="mb-4">
        <label className="block font-semibold mb-1">בחר סוכן:</label>
        <select value={selectedAgentId} onChange={handleAgentChange} className="select-input w-full">
          {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <table className="table-auto w-full border text-sm text-right mt-6">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-2 py-1">חודש</th>
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
                      {/* In RTL, ChevronRight visually points to the scroll direction */}
                      <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
                    </button>
                  </th>
                );
              })}
<th className="border px-2 py-1 font-bold bg-gray-50">סה&quot;כ לחודש</th>
</tr>
          </thead>
          <tbody>
            {allMonths.map((month) => {
              const monthTotal = allCompanies.reduce((sum, company) => sum + (summaryByMonthCompany[month]?.[company] || 0), 0);
              return (
                <tr key={month}>
                  <td className="border px-2 py-1 font-semibold">{month}</td>
                  {allCompanies.map((company) => (
                    <td
                      key={company}
                      className="border px-2 py-1 cursor-pointer hover:bg-gray-100"
                      onClick={() => handleToggleExpand(month, company)}
                    >
                      {summaryByMonthCompany[month]?.[company]?.toLocaleString() ?? '-'}
                    </td>
                  ))}
                  <td className="border px-2 py-1 font-bold bg-gray-100">{monthTotal.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* ===== Charts Section ===== */}
      {!loading && allMonths.length > 0 && (
        <div className="mt-10 space-y-10">
          {/* Chart 1: Monthly totals */}
          <section>
          <h3 className="text-xl font-semibold mb-3">גרף נפרעים לפי חודש (סה&quot;כ חודשי)</h3>
          <div className="w-full h-80 rounded-xl border bg-white">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyTotalsData} margin={{ top: 10, right: 64, left: 10, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" interval={0} angle={0} height={50} tickMargin={10} padding={{ left: 10, right: 28 }} />
                  <YAxis tickFormatter={formatCurrency} width={80} />
                  <Tooltip formatter={(value) => [formatCurrency(value as number), 'סה"כ']} labelFormatter={(label) => `חודש: ${label}`} />
                  <Line type="monotone" dataKey="total" stroke={palette[0]} strokeWidth={3} dot={{ r: 3 }} name='סה"כ' />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Chart 2: Per-company over months */}
          <section>
            <h3 className="text-xl font-semibold mb-3">גרף נפרעים לפי חברה (התפתחות חודשית)</h3>
            <div className="w-full h-96 rounded-xl border bg-white">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={perCompanyOverMonthsData} margin={{ top: 10, right: 64, left: 10, bottom: 28 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" interval={0} height={50} tickMargin={10} padding={{ left: 10, right: 28 }} />
                  <YAxis tickFormatter={formatCurrency} width={80} />
                  <Tooltip formatter={(value, key) => [formatCurrency(value as number), key as string]} labelFormatter={(label) => `חודש: ${label}`} />
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

      {/* ===== Drill-down table ===== */}
      {selectedCompany && (
        <div className="mt-10">
          <h3 className="text-xl font-semibold mb-2">פירוט עבור חברה: {selectedCompany}</h3>

          <div className="flex items-center gap-2 mb-2">
            <button
              type="button"
              className="p-2 rounded border hover:bg-gray-100"
              title="גלול ימינה"
              onClick={() => drillScrollerRef.current?.scrollBy({ left: -400, behavior: 'smooth' })}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="p-2 rounded border hover:bg-gray-100"
              title="גלול שמאלה"
              onClick={() => drillScrollerRef.current?.scrollBy({ left: 400, behavior: 'smooth' })}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>

            <span className="text-xs text-gray-500 mr-auto">אפשר לגרור עם העכבר או להשתמש בחיצים לגלילה אופקית</span>
          </div>

          <div ref={drillScrollerRef} className="overflow-x-auto border rounded">
            <table className="table-auto min-w-max w-full text-sm text-right whitespace-nowrap">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-2 py-1 sticky right-0 z-10 bg-gray-100">חודש</th>

                  {Object.keys(summaryByCompanyAgentMonth[selectedCompany] || {})
                    .sort()
                    .map((agentCode) => (
                      <th key={agentCode} className="border px-2 py-1">
                        {agentCode}
                      </th>
                    ))}

<th className="border px-2 py-1 font-bold bg-gray-50">סה&quot;כ לחודש</th>
                </tr>
              </thead>

              <tbody>
                {Array.from(
                  new Set(
                    Object.values(summaryByCompanyAgentMonth[selectedCompany] || {}).flatMap((m) => Object.keys(m))
                  )
                )
                  .sort()
                  .map((month) => {
                    const rowTotal = Object.keys(summaryByCompanyAgentMonth[selectedCompany] || {}).reduce(
                      (sum, agentCode) => sum + (summaryByCompanyAgentMonth[selectedCompany]?.[agentCode]?.[month] || 0),
                      0
                    );

                    return (
                      <tr key={month}>
                        <td className="border px-2 py-1 font-semibold sticky right-0 z-10 bg-white">{month}</td>

                        {Object.keys(summaryByCompanyAgentMonth[selectedCompany] || {})
                          .sort()
                          .map((agentCode) => (
                            <td key={agentCode} className="border px-2 py-1">
                              {summaryByCompanyAgentMonth[selectedCompany]?.[agentCode]?.[month]?.toLocaleString() ?? '-'}
                            </td>
                          ))}

                        <td className="border px-2 py-1 font-bold bg-gray-100">{rowTotal.toLocaleString()}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
