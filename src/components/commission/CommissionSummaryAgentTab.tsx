'use client';
// src/components/commission/CommissionSummaryAgentTab.tsx
// מסך סיכום עמלות לסוכן — מעטפת: בחירת סוכן/שנה + פעולות + לשוניות.
//   סקירה          → /api/agent-insights: תיק נוכחי, הכנסות, גרפים (+ הפניה לתובנות)
//   תובנות         → סקירת AI + יעילות תיק (משק בית, עומק, פוטנציאל, רשימת עבודה)
//   עמלות לפי חודש → /api/commission-summary (טבלאות + דרילים)
//   מוצרים         → /api/agent-insights (אותה תשובה של הסקירה)
// הכותרת ("דף עמלות – נפרעים / תפוקות") נמצאת בדף העוטף — כאן אין כותרת נוספת.
import React, { useState } from 'react';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { useAuth } from '@/lib/firebase/AuthContext';
import AnomalyPoliciesModal from '@/components/commission/AnomalyPoliciesModal';
import NifraimFromLoadReportModal from '@/components/commission/NifraimFromLoadReportModal';
import CustomerImportFromCommissions from '@/components/customers/CustomerImportFromCommissions';
import useAgentInsights from '@/hooks/useAgentInsights';
import useCommissionSummary from '@/hooks/useCommissionSummary';
import OverviewTab from '@/components/commission/summary/OverviewTab';
import InsightsTab from '@/components/commission/summary/InsightsTab';
import CommissionTablesTab from '@/components/commission/summary/CommissionTablesTab';
import ProductsTab from '@/components/commission/summary/ProductsTab';
import { clearFetchCache } from '@/lib/fetchCache';

type TabKey = 'overview' | 'insights' | 'tables' | 'products';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'סקירה' },
  { key: 'insights', label: '✨ תובנות' },
  { key: 'tables', label: 'עמלות לפי חודש' },
  { key: 'products', label: 'מוצרים' },
];

/** תפקידים שיש להם עץ סוכנים — רק הם רואים את בחירת הסוכן */
const AGENT_PICKER_ROLES = ['admin', 'manager'];

const CommissionSummaryAgentTab: React.FC = () => {
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange, selectedAgentName, companies } = useFetchAgentData();

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>(currentYear.toString());
  const [tab, setTab] = useState<TabKey>('overview');
  const [showAnomalies, setShowAnomalies] = useState(false);
  const [showNifraimReport, setShowNifraimReport] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);
  const insights = useAgentInsights(selectedAgentId, selectedYear, reloadKey);
  const summary = useCommissionSummary(selectedAgentId, selectedYear, reloadKey);

  /** רענון נתונים: מנקה את הזיכרון בדפדפן ומבקש חישוב מחדש בשרת */
  const refreshData = () => {
    clearFetchCache();
    setReloadKey((k) => k + 1);
  };

  const ready = !!selectedAgentId && !!selectedYear;

  // בחירת סוכן — רק למי שיש לו עץ סוכנים (אדמין / מנהל), או יותר מסוכן אחד לבחור ממנו
  const canPickAgent = AGENT_PICKER_ROLES.includes(String(detail?.role || '')) || agents.length > 1;

  return (
    <div className="px-4 pt-3 pb-4 w-full text-right" dir="rtl">
      {/* ─── סוכן + שנה + פעולות — שורה אחת קומפקטית ─── */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {canPickAgent && (
          <select
            value={selectedAgentId}
            onChange={handleAgentChange}
            className="select-input h-9 min-w-[220px] max-w-[320px] flex-1"
            aria-label="סוכן"
          >
            {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        )}
        <select
          className="select-input h-9 w-28"
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
          aria-label="שנה"
        >
          {Array.from({ length: 10 }, (_, i) => currentYear - i).map((y) => (
            <option key={y} value={y.toString()}>
              {y}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-2 mr-auto">
          <CustomerImportFromCommissions agentId={ready ? selectedAgentId : ''} />
          <button
            type="button"
            onClick={() => setShowAnomalies(true)}
            disabled={!ready}
            className="bg-red-50 text-red-700 border border-red-200 px-4 py-2 rounded-lg font-bold hover:bg-red-100 transition disabled:opacity-40"
          >
            ⚠️ פוליסות חריגות
          </button>
          <button
            type="button"
            onClick={() => setShowNifraimReport(true)}
            disabled={!ready}
            className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-4 py-2 rounded-lg font-bold hover:bg-emerald-100 transition disabled:opacity-40"
          >
            📥 דוח נפרעים מטעינות
          </button>
        </div>
      </div>

      {!ready ? (
        <div className="p-6 text-sm text-slate-500 border rounded-2xl bg-white">בחרי סוכן כדי להציג נתונים.</div>
      ) : (
        <>
          {/* ─── לשוניות ─── */}
          <div className="flex items-center gap-1 border-b mb-5">
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
              onOpenInsights={() => setTab('insights')}
            />
          )}

          {tab === 'insights' && (
            <InsightsTab
              agentId={selectedAgentId}
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

      {showNifraimReport && selectedAgentId && (
        <NifraimFromLoadReportModal
          agentId={selectedAgentId}
          agentName={selectedAgentName}
          companies={companies}
          onClose={() => setShowNifraimReport(false)}
        />
      )}
    </div>
  );
};

export default CommissionSummaryAgentTab;