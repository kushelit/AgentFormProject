'use client';
// src/components/commission/CommissionSummaryAgentTab.tsx
// מסך סיכום עמלות לסוכן — מעטפת: בחירת סוכן/שנה + לשוניות.
//   סקירה          → /api/agent-insights (+ סקירת AI)
//   עמלות לפי חודש → /api/commission-summary (טבלאות + דרילים)
//   מוצרים         → /api/agent-insights (אותה תשובה של הסקירה)
import React, { useState } from 'react';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { useAuth } from '@/lib/firebase/AuthContext';
import AnomalyPoliciesModal from '@/components/commission/AnomalyPoliciesModal';
import CustomerImportFromCommissions from '@/components/customers/CustomerImportFromCommissions';
import useAgentInsights from '@/hooks/useAgentInsights';
import useCommissionSummary from '@/hooks/useCommissionSummary';
import OverviewTab from '@/components/commission/summary/OverviewTab';
import CommissionTablesTab from '@/components/commission/summary/CommissionTablesTab';
import ProductsTab from '@/components/commission/summary/ProductsTab';
import { clearFetchCache } from '@/lib/fetchCache';

type TabKey = 'overview' | 'tables' | 'products';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'סקירה' },
  { key: 'tables', label: 'עמלות לפי חודש' },
  { key: 'products', label: 'מוצרים' },
];

const CommissionSummaryAgentTab: React.FC = () => {
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [tab, setTab] = useState<TabKey>('overview');
  const [showAnomalies, setShowAnomalies] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const insights = useAgentInsights(selectedAgentId, selectedYear, reloadKey);
  const summary = useCommissionSummary(selectedAgentId, selectedYear, reloadKey);

  /** רענון נתונים: מנקה את הזיכרון בדפדפן ומבקש חישוב מחדש בשרת */
  const refreshData = () => {
    clearFetchCache();
    setReloadKey((k) => k + 1);
  };

  const ready = !!selectedAgentId && !!selectedYear;

  return (
    <div className="p-4 w-full text-right" dir="rtl">
      <h2 className="text-xl font-bold mb-4">סיכום עמלות</h2>

      {/* ─── סוכן + שנה + פעולות ─── */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div className="flex-1 min-w-[220px]">
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
        <div className="w-40">
          <label className="block font-semibold mb-1">בחר שנה:</label>
          <select className="select-input w-full" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
            {Array.from({ length: 10 }, (_, i) => currentYear - i).map((y) => (
              <option key={y} value={y.toString()}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <CustomerImportFromCommissions agentId={ready ? selectedAgentId : ''} />
        <button
          type="button"
          onClick={() => setShowAnomalies(true)}
          disabled={!ready}
          className="bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded-lg font-bold hover:bg-red-100 transition disabled:opacity-40"
        >
          ⚠️ פוליסות חריגות
        </button>
      </div>

      {!ready ? (
        <div className="p-6 text-sm text-slate-500 border rounded-2xl bg-white">בחרי סוכן כדי להציג נתונים.</div>
      ) : (
        <>
          {/* ─── לשוניות ─── */}
          <div className="flex items-center gap-1 border-b mb-6">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-5 py-2.5 text-sm font-bold border-b-2 -mb-px transition-colors ${
                  tab === t.key ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {t.label}
              </button>
            ))}
            <button
              type="button"
              onClick={refreshData}
              disabled={insights.loading || summary.loading}
              title="חישוב מחדש מהנתונים העדכניים (למשל אחרי טעינה חדשה או קישור משפחה)"
              className="mr-auto text-xs text-slate-500 hover:text-indigo-700 px-2 py-1 disabled:opacity-40"
            >
              ↻ רענון נתונים
            </button>
          </div>

          {tab === 'overview' && (
            <OverviewTab
              agentId={selectedAgentId}
              year={selectedYear}
              insights={insights.insights}
              loading={insights.loading}
              error={insights.error}
              ai={insights.ai}
              aiLoading={insights.aiLoading}
              aiError={insights.aiError}
              onRefreshAi={insights.refreshAi}
            />
          )}

          {tab === 'tables' && (
            <CommissionTablesTab agentId={selectedAgentId} year={selectedYear} data={summary.data} loading={summary.loading} />
          )}

          {tab === 'products' && (
            <ProductsTab year={selectedYear} products={insights.insights?.products ?? null} loading={insights.loading} />
          )}
        </>
      )}

      {showAnomalies && selectedAgentId && (
        <AnomalyPoliciesModal agentId={selectedAgentId} selectedYear={selectedYear} onClose={() => setShowAnomalies(false)} />
      )}
    </div>
  );
};

export default CommissionSummaryAgentTab;