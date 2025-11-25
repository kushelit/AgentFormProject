'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import useFetchMD from '@/hooks/useMD';
import useSalesData from '@/hooks/useSalesCalculateData';
import { useDesignFlag } from '@/hooks/useDesignFlag';
import { usePermission } from '@/hooks/usePermission';
import { db } from '@/lib/firebase/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

import '@/app/NewSummaryTable/NewSummaryTable.css';

type MonthlyTotal = {
  finansimTotal: number;
  pensiaTotal: number;
  insuranceTotal: number;
  niudPensiaTotal: number;
  commissionHekefTotal: number;
  commissionNifraimTotal: number;
  insuranceTravelTotal: number;
  prishaMyaditTotal: number;
};

type AgentTotalsMap = Record<string, MonthlyTotal>;

const emptyTotals: MonthlyTotal = {
  finansimTotal: 0,
  pensiaTotal: 0,
  insuranceTotal: 0,
  niudPensiaTotal: 0,
  commissionHekefTotal: 0,
  commissionNifraimTotal: 0,
  insuranceTravelTotal: 0,
  prishaMyaditTotal: 0,
};

type SortColumn =
  | 'agentName'
  | 'finansimTotal'
  | 'pensiaTotal'
  | 'insuranceTotal'
  | 'niudPensiaTotal'
  | 'insuranceTravelTotal'
  | 'prishaMyaditTotal'
  | 'commissionHekefTotal'
  | 'commissionNifraimTotal';

type SortOrder = 'asc' | 'desc';

interface AgentRowProps {
  agentId: string;
  agentName: string;
  selectedYear: number;
  selectedProduct: string;
  selectedStatusPolicy: string;
  isCommissionSplitEnabled: boolean;
  onTotalsChange: (agentId: string, totals: MonthlyTotal) => void;
  canViewCommissions: boolean;
}

const AgentYearRow: React.FC<AgentRowProps> = ({
  agentId,
  agentName,
  selectedYear,
  selectedProduct,
  selectedStatusPolicy,
  isCommissionSplitEnabled,
  onTotalsChange,
  canViewCommissions,
}) => {
  const { monthlyTotals, overallTotals, isLoadingData } = useSalesData(
    agentId,
    '', // כל העובדים
    '', // כל החברות
    selectedProduct,
    selectedStatusPolicy,
    selectedYear,
    false, // includePreviousDecember – רק שנה קלנדרית
    isCommissionSplitEnabled
  );

  useEffect(() => {
    onTotalsChange(agentId, overallTotals);
  }, [agentId, overallTotals, onTotalsChange]);

  const totals: MonthlyTotal =
    Object.keys(monthlyTotals).length === 0 ? emptyTotals : overallTotals;

  // כמה עמודות יהיו אחרי עמודת "סוכן"
  const numericColumnsCount = 6 + (canViewCommissions ? 2 : 0);

  // 🔹 בזמן טעינה – מציגים מצב טעינה במקום ערכים 0
  if (isLoadingData) {
    return (
      <tr>
        <td>{agentName}</td>
        <td
          colSpan={numericColumnsCount}
          style={{
            textAlign: 'center',
            fontSize: '0.85rem',
            color: '#666',
          }}
        >
          טוען נתונים עבור הסוכן...
        </td>
      </tr>
    );
  }

  return (
    <tr>
      <td>{agentName}</td>
      <td>{totals.finansimTotal.toLocaleString()}</td>
      <td>{totals.pensiaTotal.toLocaleString()}</td>
      <td>{totals.insuranceTotal.toLocaleString()}</td>
      <td>{totals.niudPensiaTotal.toLocaleString()}</td>
      <td>{totals.insuranceTravelTotal?.toLocaleString() || '0'}</td>
      <td>{totals.prishaMyaditTotal?.toLocaleString() || '0'}</td>
      {canViewCommissions && (
        <td>{totals.commissionHekefTotal.toLocaleString()}</td>
      )}
      {canViewCommissions && (
        <td>{totals.commissionNifraimTotal.toLocaleString()}</td>
      )}
    </tr>
  );
};

const AgencySummaryAgentsTab: React.FC = () => {
  // 🔹 כל ה־hooks למעלה, ללא תנאים
  const { agents } = useFetchAgentData();
  const isNewDesignEnabled = useDesignFlag();
  const { canAccess } = usePermission('view_commissions_field');
  const canViewCommissions = !!canAccess;
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  const [selectedYear, setSelectedYear] = useState<number>(
    new Date().getFullYear()
  );
  const [isCommissionSplitEnabled, setIsCommissionSplitEnabled] =
    useState(false);

  // מצב תצוגת סוכנים (כמו בדף עמלות)
  const [agentFilterMode, setAgentFilterMode] = useState<'all' | 'selected'>(
    'all'
  );
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(
    () => new Set()
  );
  const [agentSearchTerm, setAgentSearchTerm] = useState('');
  const { user, detail } = useAuth();

  // MD – מוצר / סטטוס פוליסה
  const {
    products,
    selectedProduct,
    setSelectedProduct,
    selectedStatusPolicy,
    setSelectedStatusPolicy,
    statusPolicies,
  } = useFetchMD();

  const [agentTotalsMap, setAgentTotalsMap] = useState<AgentTotalsMap>({});

  const handleTotalsChange = useCallback(
    (agentId: string, totals: MonthlyTotal) => {
      setAgentTotalsMap((prev) => ({
        ...prev,
        [agentId]: totals,
      }));
    },
    []
  );

  // 🔹 סטייט מיון
  const [sortColumn, setSortColumn] =
  useState<SortColumn | null>('commissionNifraimTotal');
const [sortOrder, setSortOrder] = useState<SortOrder>('desc');


const handleSort = (column: SortColumn) => {
  if (sortColumn === column) {
    // לוחצים שוב על אותה עמודה → רק הופכים את הכיוון
    setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
  } else {
    // עמודה חדשה → עוברים אליה ומתחילים מ-asc
    setSortColumn(column);
    setSortOrder('asc');
  }
};

  const sortArrow = (column: SortColumn) => {
    if (sortColumn !== column) return '';
    return sortOrder === 'asc' ? ' ▲' : ' ▼';
  };

  useEffect(() => {
    const loadPreferences = async () => {
      if (!user) return;

      try {
        const prefRef = doc(
          db,
          'userPreferences',
          user.uid,
          'views',
          'agencySummaryAgents'
        );

        const snap = await getDoc(prefRef);
        if (snap.exists()) {
          const data = snap.data() as any;
          if (data.agentFilterMode === 'selected') {
            setAgentFilterMode('selected');
          } else {
            setAgentFilterMode('all');
          }

          if (Array.isArray(data.selectedAgentIds)) {
            setSelectedAgentIds(new Set<string>(data.selectedAgentIds));
          }
        }
      } catch (err) {
        console.error('Failed to load agency view preferences', err);
      } finally {
        setPreferencesLoaded(true);
      }
    };

    loadPreferences();
  }, [user]);

  // ברירת מחדל: כל הסוכנים מסומנים
  useEffect(() => {
    // אם יש כבר העדפות שנטענו – לא דורכים עליהן
    if (!preferencesLoaded) return;

    // אם אין עדיין בחירה – ברירת מחדל: כל הסוכנים
    if (agents && agents.length > 0 && selectedAgentIds.size === 0) {
      setSelectedAgentIds(new Set(agents.map((a) => a.id)));
    }
  }, [agents, preferencesLoaded, selectedAgentIds.size]);

  useEffect(() => {
    if (!user) return;
    if (!preferencesLoaded) return; // שלא נשמור ערכים חלקיים לפני טעינת העדפות

    const savePreferences = async () => {
      try {
        const prefRef = doc(
          db,
          'userPreferences',
          user.uid,
          'views',
          'agencySummaryAgents'
        );

        await setDoc(
          prefRef,
          {
            agentFilterMode,
            selectedAgentIds: Array.from(selectedAgentIds),
          },
          { merge: true }
        );
      } catch (err) {
        console.error('Failed to save agency view preferences', err);
      }
    };

    savePreferences();
  }, [user, agentFilterMode, selectedAgentIds, preferencesLoaded]);

  const visibleAgents = useMemo(() => agents, [agents]);

  const agentsMatchingSearch = useMemo(() => {
    const term = agentSearchTerm.trim().toLowerCase();
    if (!term) return visibleAgents;
    return visibleAgents.filter((a) => a.name.toLowerCase().includes(term));
  }, [visibleAgents, agentSearchTerm]);

  const filteredAgents = useMemo(() => {
    if (agentFilterMode === 'all') {
      return visibleAgents;
    }
    return visibleAgents.filter((a) => selectedAgentIds.has(a.id));
  }, [visibleAgents, agentFilterMode, selectedAgentIds]);

  // 🔹 מיון סוכנים לפי sortColumn + sortOrder
  const sortedAgents = useMemo(() => {
    if (!sortColumn) return filteredAgents;

    const arr = [...filteredAgents];

    arr.sort((a, b) => {
      const totalsA = agentTotalsMap[a.id] || emptyTotals;
      const totalsB = agentTotalsMap[b.id] || emptyTotals;

      let valA: string | number;
      let valB: string | number;

      switch (sortColumn) {
        case 'agentName':
          valA = a.name || '';
          valB = b.name || '';
          break;
        case 'finansimTotal':
          valA = totalsA.finansimTotal;
          valB = totalsB.finansimTotal;
          break;
        case 'pensiaTotal':
          valA = totalsA.pensiaTotal;
          valB = totalsB.pensiaTotal;
          break;
        case 'insuranceTotal':
          valA = totalsA.insuranceTotal;
          valB = totalsB.insuranceTotal;
          break;
        case 'niudPensiaTotal':
          valA = totalsA.niudPensiaTotal;
          valB = totalsB.niudPensiaTotal;
          break;
        case 'insuranceTravelTotal':
          valA = totalsA.insuranceTravelTotal;
          valB = totalsB.insuranceTravelTotal;
          break;
        case 'prishaMyaditTotal':
          valA = totalsA.prishaMyaditTotal;
          valB = totalsB.prishaMyaditTotal;
          break;
        case 'commissionHekefTotal':
          valA = totalsA.commissionHekefTotal;
          valB = totalsB.commissionHekefTotal;
          break;
        case 'commissionNifraimTotal':
          valA = totalsA.commissionNifraimTotal;
          valB = totalsB.commissionNifraimTotal;
          break;
        default:
          valA = 0;
          valB = 0;
      }

      let cmp = 0;
      if (typeof valA === 'string' || typeof valB === 'string') {
        cmp = String(valA).localeCompare(String(valB), 'he');
      } else {
        cmp = (valA as number) - (valB as number);
      }

      return sortOrder === 'asc' ? cmp : -cmp;
    });

    return arr;
  }, [filteredAgents, sortColumn, sortOrder, agentTotalsMap]);

  const summaryTotals: MonthlyTotal = useMemo(() => {
    const base: MonthlyTotal = { ...emptyTotals };

    for (const agent of filteredAgents) {
      const t = agentTotalsMap[agent.id];
      if (!t) continue;
      base.finansimTotal += t.finansimTotal;
      base.pensiaTotal += t.pensiaTotal;
      base.insuranceTotal += t.insuranceTotal;
      base.niudPensiaTotal += t.niudPensiaTotal;
      base.commissionHekefTotal += t.commissionHekefTotal;
      base.commissionNifraimTotal += t.commissionNifraimTotal;
      base.insuranceTravelTotal += t.insuranceTravelTotal || 0;
      base.prishaMyaditTotal += t.prishaMyaditTotal || 0;
    }

    return base;
  }, [agentTotalsMap, filteredAgents]);

  const agentsCount = filteredAgents.length || 1;

  const averagePerAgent: MonthlyTotal = useMemo(() => {
    return {
      finansimTotal: Math.round(summaryTotals.finansimTotal / agentsCount),
      pensiaTotal: Math.round(summaryTotals.pensiaTotal / agentsCount),
      insuranceTotal: Math.round(summaryTotals.insuranceTotal / agentsCount),
      niudPensiaTotal: Math.round(summaryTotals.niudPensiaTotal / agentsCount),
      commissionHekefTotal: Math.round(
        summaryTotals.commissionHekefTotal / agentsCount
      ),
      commissionNifraimTotal: Math.round(
        summaryTotals.commissionNifraimTotal / agentsCount
      ),
      insuranceTravelTotal: Math.round(
        summaryTotals.insuranceTravelTotal / agentsCount
      ),
      prishaMyaditTotal: Math.round(
        summaryTotals.prishaMyaditTotal / agentsCount
      ),
    };
  }, [summaryTotals, agentsCount]);

  const toggleAgentSelection = (agentId: string) => {
    setSelectedAgentIds((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };

  const selectAllAgents = () => {
    setSelectedAgentIds(new Set(visibleAgents.map((a) => a.id)));
  };

  const clearAgentsSelection = () => {
    setSelectedAgentIds(new Set());
  };

  // 🔐 אחרי שכל ה־hooks נקראו – אפשר לבדוק הרשאה
  const canSeeAgencyTab =
    !!detail && ['admin', 'manager'].includes(detail.role);

  if (!canSeeAgencyTab) {
    return (
      <div className="p-6 max-w-5xl mx-auto text-right" dir="rtl">
        אין לך הרשאה לצפות בדוח זה.
      </div>
    );
  }

  return (
    <div className="content-container-NewAgentForm" dir="rtl">
      <div className="table-container-AgentForm-new-design">
        <div className="table-header">
          <div className="table-title">דף המרכז – סיכומי סוכנות לפי סוכן</div>
          <div className="text-xs text-gray-600 mt-1">
            כל שורה מייצגת סוכן אחד – סיכום שנתי לכל אחד מסוגי התפוקה והעמלות.
          </div>
        </div>

        {/* 🔹 פילטרים כלליים */}
        <div className="filter-inputs-container-new">
          {/* שנה */}
          <div className="filter-select-container">
            <select
              id="yearPicker"
              className="select-input"
              value={selectedYear}
              onChange={(e) =>
                setSelectedYear(parseInt(e.target.value, 10))
              }
            >
              <option value="">בחר שנה</option>
              {Array.from(
                { length: 10 },
                (_, i) => new Date().getFullYear() - i
              ).map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {/* מוצר */}
          <div className="filter-select-container">
            <select
              id="productSelect"
              className="select-input"
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
            >
              <option value="">כל המוצרים</option>
              {products.map((product) => (
                <option key={product.id} value={product.name}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>

          {/* סטטוס פוליסה */}
          <div className="filter-select-container">
            <select
              id="statusPolicySelect"
              className="select-input"
              value={selectedStatusPolicy}
              onChange={(e) => setSelectedStatusPolicy(e.target.value)}
            >
              <option value="">כל הסטטוסים</option>
              {statusPolicies.map((status, index) => (
                <option key={index} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          {/* בלי/עם פיצול עמלות */}
          <div dir="rtl" className="flex items-center gap-2">
            <div className="flex bg-blue-100 rounded-full p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setIsCommissionSplitEnabled(false)}
                className={`px-3 py-0.5 rounded-full transition-all duration-200 ${
                  !isCommissionSplitEnabled
                    ? 'bg-white text-blue-800 font-bold'
                    : 'text-gray-500'
                }`}
              >
                ללא פיצול עמלות
              </button>
              <button
                type="button"
                onClick={() => setIsCommissionSplitEnabled(true)}
                className={`px-3 py-0.5 rounded-full transition-all duration-200 ${
                  isCommissionSplitEnabled
                    ? 'bg-white text-blue-800 font-bold'
                    : 'text-gray-500'
                }`}
              >
                עם פיצול עמלות
              </button>
            </div>
          </div>
        </div>

        {/* 🔹 בחירת סוכנים (כמו בעמוד עמלות) */}
        <div className="mt-4 mb-4">
          <div className="mb-2 flex items-center gap-4 text-sm">
            <span className="font-semibold">מצב תצוגת סוכנים:</span>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="agentDisplayMode"
                value="all"
                checked={agentFilterMode === 'all'}
                onChange={() => setAgentFilterMode('all')}
              />
              <span>כל הסוכנים</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="agentDisplayMode"
                value="selected"
                checked={agentFilterMode === 'selected'}
                onChange={() => setAgentFilterMode('selected')}
              />
              <span>סוכנים נבחרים בלבד</span>
            </label>
          </div>

          {agentFilterMode === 'selected' && (
            <div className="border rounded-lg p-3 bg-gray-50">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <input
                  type="text"
                  className="border rounded px-2 py-1 text-sm flex-1 min-w-[180px]"
                  placeholder="חיפוש סוכן: התחילי להקליד שם..."
                  value={agentSearchTerm}
                  onChange={(e) => setAgentSearchTerm(e.target.value)}
                />
                <button
                  type="button"
                  className="px-3 py-1 text-xs border rounded bg-white hover:bg-gray-100"
                  onClick={selectAllAgents}
                >
                  בחר את כולם
                </button>
                <button
                  type="button"
                  className="px-3 py-1 text-xs border rounded bg-white hover:bg-gray-100"
                  onClick={clearAgentsSelection}
                >
                  נקה בחירה
                </button>
                <span className="text-xs text-gray-500 mr-auto">
                  נבחרו {selectedAgentIds.size} מתוך {visibleAgents.length}{' '}
                  סוכנים.
                </span>
              </div>

              <div className="max-h-52 overflow-y-auto bg-white rounded border">
                {agentsMatchingSearch.map((agent) => {
                  const checked = selectedAgentIds.has(agent.id);
                  return (
                    <label
                      key={agent.id}
                      className="flex items-center gap-2 px-3 py-1 text-sm hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleAgentSelection(agent.id)}
                      />
                      <span>{agent.name}</span>
                    </label>
                  );
                })}

                {agentsMatchingSearch.length === 0 && (
                  <div className="px-3 py-2 text-xs text-gray-500">
                    לא נמצאו סוכנים תואמים לחיפוש.
                  </div>
                )}
              </div>

              <p className="mt-1 text-xs text-gray-500">
                הטבלה למטה תציג רק את הסוכנים שסומנו ברשימה.
              </p>
            </div>
          )}
        </div>

        {/* 🔹 טבלה – שורות של סוכנים */}
        <div className="table-container" style={{ width: '100%' }}>
          <div
            className={`table-Data-AgentForm ${
              isNewDesignEnabled ? 'is-new-design' : ''
            }`}
          >
            <table>
              <thead>
                <tr>
                  <th
                    onClick={() => handleSort('agentName')}
                    className="cursor-pointer"
                  >
                    סוכן{sortArrow('agentName')}
                  </th>
                  <th
                    onClick={() => handleSort('finansimTotal')}
                    className="cursor-pointer"
                  >
                    סך פיננסים (שנתי){sortArrow('finansimTotal')}
                  </th>
                  <th
                    onClick={() => handleSort('pensiaTotal')}
                    className="cursor-pointer"
                  >
                    סך פנסיה (שנתי){sortArrow('pensiaTotal')}
                  </th>
                  <th
                    onClick={() => handleSort('insuranceTotal')}
                    className="cursor-pointer"
                  >
                    סך ביטוח (שנתי){sortArrow('insuranceTotal')}
                  </th>
                  <th
                    onClick={() => handleSort('niudPensiaTotal')}
                    className="cursor-pointer"
                  >
                    ניוד פנסיה (שנתי){sortArrow('niudPensiaTotal')}
                  </th>
                  <th
                    onClick={() => handleSort('insuranceTravelTotal')}
                    className="cursor-pointer"
                  >
                    סך נסיעות חול (שנתי){sortArrow('insuranceTravelTotal')}
                  </th>
                  <th
                    onClick={() => handleSort('prishaMyaditTotal')}
                    className="cursor-pointer"
                  >
                    סך פרישה מיידית (שנתי){sortArrow('prishaMyaditTotal')}
                  </th>
                  {canViewCommissions && (
                    <th
                      onClick={() => handleSort('commissionHekefTotal')}
                      className="cursor-pointer"
                    >
                      עמלת היקף (שנתית){sortArrow('commissionHekefTotal')}
                    </th>
                  )}
                  {canViewCommissions && (
                    <th
                      onClick={() => handleSort('commissionNifraimTotal')}
                      className="cursor-pointer"
                    >
                      עמלת נפרעים (שנתית){sortArrow('commissionNifraimTotal')}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedAgents.map((agent) => (
                  <AgentYearRow
                    key={agent.id}
                    agentId={agent.id}
                    agentName={agent.name}
                    selectedYear={selectedYear}
                    selectedProduct={selectedProduct}
                    selectedStatusPolicy={selectedStatusPolicy}
                    isCommissionSplitEnabled={isCommissionSplitEnabled}
                    onTotalsChange={handleTotalsChange}
                    canViewCommissions={canViewCommissions}
                  />
                ))}

                {/* סיכום סוכנות */}
                <tr>
                  <td>
                    <strong>סיכום סוכנות</strong>
                  </td>
                  <td>
                    <strong>
                      {summaryTotals.finansimTotal.toLocaleString()}
                    </strong>
                  </td>
                  <td>
                    <strong>
                      {summaryTotals.pensiaTotal.toLocaleString()}
                    </strong>
                  </td>
                  <td>
                    <strong>
                      {summaryTotals.insuranceTotal.toLocaleString()}
                    </strong>
                  </td>
                  <td>
                    <strong>
                      {summaryTotals.niudPensiaTotal.toLocaleString()}
                    </strong>
                  </td>
                  <td>
                    <strong>
                      {summaryTotals.insuranceTravelTotal.toLocaleString()}
                    </strong>
                  </td>
                  <td>
                    <strong>
                      {summaryTotals.prishaMyaditTotal.toLocaleString()}
                    </strong>
                  </td>
                  {canViewCommissions && (
                    <td>
                      <strong>
                        {summaryTotals.commissionHekefTotal.toLocaleString()}
                      </strong>
                    </td>
                  )}
                  {canViewCommissions && (
                    <td>
                      <strong>
                        {summaryTotals.commissionNifraimTotal.toLocaleString()}
                      </strong>
                    </td>
                  )}
                </tr>

                {/* ממוצע לסוכן */}
                <tr>
                  <td>
                    <strong>ממוצע לסוכן</strong>
                  </td>
                  <td>
                    <strong>
                      {averagePerAgent.finansimTotal.toLocaleString()}
                    </strong>
                  </td>
                  <td>
                    <strong>
                      {averagePerAgent.pensiaTotal.toLocaleString()}
                    </strong>
                  </td>
                  <td>
                    <strong>
                      {averagePerAgent.insuranceTotal.toLocaleString()}
                    </strong>
                  </td>
                  <td>
                    <strong>
                      {averagePerAgent.niudPensiaTotal.toLocaleString()}
                    </strong>
                  </td>
                  <td>
                    <strong>
                      {averagePerAgent.insuranceTravelTotal.toLocaleString()}
                    </strong>
                  </td>
                  <td>
                    <strong>
                      {averagePerAgent.prishaMyaditTotal.toLocaleString()}
                    </strong>
                  </td>
                  {canViewCommissions && (
                    <td>
                      <strong>
                        {averagePerAgent.commissionHekefTotal.toLocaleString()}
                      </strong>
                    </td>
                  )}
                  {canViewCommissions && (
                    <td>
                      <strong>
                        {averagePerAgent.commissionNifraimTotal.toLocaleString()}
                      </strong>
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgencySummaryAgentsTab;
