'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from '@/hooks/useFetchAgentData';
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

interface AdminMatrixResponse {
  allCompanies: string[];
  allMonths: string[];
  // agentId -> company -> total
  totalsByAgentCompany: Record<string, Record<string, number>>;
  // company -> agentId -> month -> total
  breakdownByCompanyAgentMonth: Record<
    string,
    Record<string, Record<string, number>>
  >;
}

type AgentFilterMode = 'all' | 'custom';

export default function AdminCommissionSummaryMatrixPage() {
  const { detail } = useAuth();
  const { agents } = useFetchAgentData();

  const [selectedYear, setSelectedYear] = useState<string>(
    new Date().getFullYear().toString()
  );

  const [mode, setMode] = useState<AgentFilterMode>('all');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [agentSearch, setAgentSearch] = useState('');

  const [loading, setLoading] = useState(false);
  const [matrix, setMatrix] = useState<AdminMatrixResponse | null>(null);
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null);

  const drillScrollerRef = useRef<HTMLDivElement>(null);
  const currentYear = new Date().getFullYear();

  // 👮‍♀️ הגבלת גישה – תתאימי לפי הצורך
  if (detail && !['admin', 'manager'].includes(detail.role)) {
    return (
      <div className="p-6 max-w-5xl mx-auto text-right" dir="rtl">
        אין לך הרשאה לצפות בדוח זה.
      </div>
    );
  }

  // ברירת מחדל: במצב "כל הסוכנים" – לבחור את כולם
  useEffect(() => {
    if (agents.length === 0) return;
    if (mode === 'all') {
      setSelectedAgentIds(agents.map((a) => a.id));
    }
  }, [agents, mode]);

  // 🔁 קריאת API לפי שנה + סוכנים נבחרים
  useEffect(() => {
    const fetchMatrix = async () => {
      if (!selectedYear || agents.length === 0) {
        setMatrix(null);
        return;
      }

      if (selectedAgentIds.length === 0) {
        setMatrix(null);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch('/api/admin/commission-summary-matrix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            year: selectedYear,
            agentIds: selectedAgentIds,
          }),
        });

        if (!res.ok) {
          console.error(
            'API /api/admin/commission-summary-matrix failed',
            await res.text()
          );
          setMatrix(null);
          return;
        }

        const data: AdminMatrixResponse = await res.json();
        setMatrix(data);
      } catch (err) {
        console.error('fetchMatrix error:', err);
        setMatrix(null);
      } finally {
        setLoading(false);
      }
    };

    fetchMatrix();
  }, [selectedYear, agents, selectedAgentIds]);

  const formatCurrency = (v: number | string | undefined) =>
    Number(v || 0).toLocaleString('he-IL', { maximumFractionDigits: 2 });

  const handleToggleCompany = (company: string) => {
    setExpandedCompany((prev) => (prev === company ? null : company));
  };

  const allCompanies = matrix?.allCompanies ?? [];
  const allMonths = matrix?.allMonths ?? [];

  const noAgentsAvailable = !loading && agents.length === 0;
  const noAgentsSelected =
    !loading && agents.length > 0 && selectedAgentIds.length === 0;

  // 🎨 צבעים לגרפים
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

  // סוכנים שמופיעים בפועל בדוח (רק הנבחרים)
  const visibleAgents = useMemo(
    () => agents.filter((a) => selectedAgentIds.includes(a.id)),
    [agents, selectedAgentIds]
  );

  // סוכנים ברשימת הבחירה (מסוננים לפי חיפוש)
  const filteredAgents = useMemo(() => {
    const term = agentSearch.trim();
    if (!term) return agents;
    return agents.filter((a) =>
      a.name.toLowerCase().includes(term.toLowerCase())
    );
  }, [agents, agentSearch]);

  // 📈 גרף 1 – סה"כ עמלות לכל הסוכנים הנבחרים לפי חודש
  const monthlyTotalsData = useMemo(() => {
    if (!matrix) return [];
    const { allMonths, breakdownByCompanyAgentMonth } = matrix;

    return allMonths.map((month) => {
      let total = 0;
      for (const company of Object.keys(breakdownByCompanyAgentMonth)) {
        const byAgent = breakdownByCompanyAgentMonth[company];
        for (const agentId of Object.keys(byAgent)) {
          total += byAgent[agentId][month] || 0;
        }
      }
      return { month, total };
    });
  }, [matrix]);

  // 📈 גרף 2 – התפתחות לפי חברה (מצטבר לכל הסוכנים הנבחרים)
  const perCompanyOverMonthsData = useMemo(() => {
    if (!matrix) return [];
    const { allMonths, allCompanies, breakdownByCompanyAgentMonth } = matrix;

    return allMonths.map((month) => {
      const row: Record<string, string | number> = { month };
      for (const company of allCompanies) {
        const byAgent = breakdownByCompanyAgentMonth[company] || {};
        let sum = 0;
        for (const agentId of Object.keys(byAgent)) {
          sum += byAgent[agentId][month] || 0;
        }
        row[company] = sum;
      }
      return row;
    });
  }, [matrix]);

  // 🧩 toggle של סוכן יחיד בצ'קבוקס
  const toggleAgent = (agentId: string) => {
    setSelectedAgentIds((prev) =>
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId]
    );
  };

  const handleSelectAllAgents = () => {
    setSelectedAgentIds(agents.map((a) => a.id));
  };

  const handleClearAgents = () => {
    setSelectedAgentIds([]);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto text-right" dir="rtl">
      <h2 className="text-2xl font-bold mb-4">
        דוח מנהל: סיכום עמלות לפי סוכן וחברה
      </h2>

      {/* פילטרים: שנה + מצב סינון סוכנים */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 items-start">
        {/* בחירת שנה */}
        <div className="max-w-xs">
          <label className="block font-semibold mb-1">בחר שנה:</label>
          <select
            className="select-input w-full"
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
          >
            {Array.from({ length: 10 }, (_, idx) => currentYear - idx).map(
              (year) => (
                <option key={year} value={year.toString()}>
                  {year}
                </option>
              )
            )}
          </select>
        </div>

        {/* מצב סינון + בחירת סוכנים */}
        <div className="md:col-span-2 space-y-2">
          <div className="flex flex-wrap gap-4 items-center">
            <span className="font-semibold">מצב תצוגת סוכנים:</span>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="agentMode"
                value="all"
                checked={mode === 'all'}
                onChange={() => setMode('all')}
              />
              <span>כל הסוכנים</span>
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="agentMode"
                value="custom"
                checked={mode === 'custom'}
                onChange={() => setMode('custom')}
              />
              <span>סוכנים נבחרים בלבד</span>
            </label>

            {mode === 'custom' && (
              <div className="flex gap-2 text-sm">
                <button
                  type="button"
                  className="px-3 py-1 rounded border bg-white hover:bg-gray-50"
                  onClick={handleSelectAllAgents}
                >
                  בחר את כולם
                </button>
                <button
                  type="button"
                  className="px-3 py-1 rounded border bg-white hover:bg-gray-50"
                  onClick={handleClearAgents}
                >
                  נקה בחירה
                </button>
              </div>
            )}
          </div>

          {mode === 'custom' && (
            <div className="border rounded p-3 bg-gray-50 space-y-2">
              <div className="flex flex-wrap gap-2 items-center mb-1">
                <span className="text-sm font-semibold">חיפוש סוכן:</span>
                <input
                  type="text"
                  className="input w-full md:w-64 text-sm"
                  placeholder="התחילי להקליד שם סוכן..."
                  value={agentSearch}
                  onChange={(e) => setAgentSearch(e.target.value)}
                />
                <span className="text-xs text-gray-500 mr-auto">
                  נבחרו {selectedAgentIds.length} מתוך {agents.length} סוכנים.
                </span>
              </div>

              <div className="max-h-56 overflow-y-auto border rounded bg-white px-3 py-2 text-sm space-y-1">
                {filteredAgents.map((agent) => (
                  <label
                    key={agent.id}
                    className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5"
                  >
                    <input
                      type="checkbox"
                      checked={selectedAgentIds.includes(agent.id)}
                      onChange={() => toggleAgent(agent.id)}
                    />
                    <span>{agent.name}</span>
                  </label>
                ))}
                {filteredAgents.length === 0 && (
                  <div className="text-xs text-gray-400">
                    לא נמצאו סוכנים תואמים לחיפוש.
                  </div>
                )}
              </div>
            </div>
          )}

          <p className="mt-1 text-xs text-gray-500">
            הגרפים והטבלאות יוצגו רק עבור הסוכנים הפעילים בתצוגה.
          </p>
        </div>
      </div>

      {loading && <Spinner />}

      {noAgentsAvailable && (
        <p className="mt-4 text-sm text-red-600">
          אין לך סוכנים זמינים לפי ההרשאות שלך
          (בדקי שהמשתמש משויך ל־agencies / קבוצת הסוכנים הנכונה).
        </p>
      )}

      {noAgentsSelected && mode === 'custom' && (
        <p className="mt-2 text-sm text-orange-600">
          בחרי לפחות סוכן אחד להצגה או עבורי למצב "כל הסוכנים".
        </p>
      )}

      {!loading &&
        !noAgentsAvailable &&
        selectedAgentIds.length > 0 &&
        !matrix && (
          <p className="mt-4 text-sm text-gray-500">
            אין נתונים להצגה (בדקי שיש עמלות לשנה שנבחרה).
          </p>
        )}

      {!loading && matrix && visibleAgents.length > 0 && (
        <>
          {/* 🔢 טבלת סוכן × חברה */}
          <div className="overflow-x-auto border rounded mt-4">
            <table className="table-auto min-w-full text-sm text-right whitespace-nowrap">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border px-2 py-1 sticky right-0 bg-gray-100 z-10">
                    סוכן
                  </th>
                  {allCompanies.map((company) => (
                    <th key={company} className="border px-2 py-1">
                      <button
                        type="button"
                        className="w-full flex items-center justify-between gap-2 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 rounded px-1 py-0.5"
                        onClick={() => handleToggleCompany(company)}
                        title="לחצו כדי לראות פירוט לפי חודשים לכל הסוכנים בחברה זו"
                      >
                        <span>{company}</span>
                        <ChevronRight
                          className={`h-4 w-4 transition-transform ${
                            expandedCompany === company ? 'rotate-90' : ''
                          }`}
                        />
                      </button>
                    </th>
                  ))}
                  <th className="border px-2 py-1 bg-gray-50 font-bold">
                    סה&quot;כ לסוכן
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleAgents.map((agent) => {
                  const row = matrix.totalsByAgentCompany[agent.id] || {};
                  const rowTotal = allCompanies.reduce(
                    (sum, company) => sum + (row[company] || 0),
                    0
                  );
                  return (
                    <tr key={agent.id}>
                      <td className="border px-2 py-1 sticky right-0 bg-white z-10 font-semibold">
                        {agent.name}
                      </td>
                      {allCompanies.map((company) => (
                        <td
                          key={company}
                          className="border px-2 py-1 text-left cursor-pointer hover:bg-gray-50"
                          onClick={() => handleToggleCompany(company)}
                        >
                          {formatCurrency(row[company] || 0)}
                        </td>
                      ))}
                      <td className="border px-2 py-1 bg-gray-100 font-bold">
                        {formatCurrency(rowTotal)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* 🔍 דרילדאון לפי חברה */}
          {expandedCompany && (
            <div className="mt-8">
              <h3 className="text-xl font-semibold mb-2">
                פירוט לפי חודשים – חברה: {expandedCompany}
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
                      <th className="border px-2 py-1 sticky right-0 bg-gray-100 z-10">
                        סוכן
                      </th>
                      {allMonths.map((month) => (
                        <th key={month} className="border px-2 py-1">
                          {month}
                        </th>
                      ))}
                      <th className="border px-2 py-1 bg-gray-50 font-bold">
                        סה&quot;כ לשנה
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAgents.map((agent) => {
                      const byMonth =
                        matrix.breakdownByCompanyAgentMonth[expandedCompany!]?.[
                          agent.id
                        ] || {};
                      const rowTotal = allMonths.reduce(
                        (sum, month) => sum + (byMonth[month] || 0),
                        0
                      );
                      return (
                        <tr key={agent.id}>
                          <td className="border px-2 py-1 sticky right-0 bg-white z-10 font-semibold">
                            {agent.name}
                          </td>
                          {allMonths.map((month) => (
                            <td key={month} className="border px-2 py-1">
                              {formatCurrency(byMonth[month] || 0)}
                            </td>
                          ))}
                          <td className="border px-2 py-1 bg-gray-100 font-bold">
                            {formatCurrency(rowTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 📊 גרפים – על כל הסוכנים הנבחרים */}
          {matrix && allMonths.length > 0 && (
            <div className="mt-10 space-y-10">
              {/* גרף 1: סה"כ חודשי לכל הסוכנים הנבחרים */}
              <section>
                <h3 className="text-xl font-semibold mb-3">
                  גרף עמלות לפי חודש (סה&quot;כ חודשי – הסוכנים בתצוגה)
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

              {/* גרף 2: לפי חברה – כל הסוכנים הנבחרים */}
              <section>
                <h3 className="text-xl font-semibold mb-3">
                  גרף עמלות לפי חברה (התפתחות חודשית – הסוכנים בתצוגה)
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
        </>
      )}
    </div>
  );
}
