'use client';

import React, { useMemo, useState } from 'react';
import type { Firestore } from 'firebase/firestore';
import AutoCompanyCard from './AutoCompanyCard';
import {
  useAutomationDashboardStatus,
  type AutomaticCompany,
  type AutoCompanyUiStatus,
} from '@/hooks/useAutomationDashboardStatus';

type Props = {
  db: Firestore;
  selectedAgentId?: string;
  companies: AutomaticCompany[];
  isAutoEnabledByFlag: boolean;
  autoDisabledReason: string;
  refreshKey?: number;
  activeCompanyId?: string;
  isRunActive?: boolean;
  onStartRun: (company: AutomaticCompany) => Promise<void>;
  onStartBatch?: (companies: AutomaticCompany[]) => Promise<void>;
};

type RunMode = 'single' | 'multi';

const AutomaticRunsDashboard: React.FC<Props> = ({
  db,
  selectedAgentId,
  companies,
  isAutoEnabledByFlag,
  autoDisabledReason,
  onStartRun,
  onStartBatch,
  refreshKey = 0,
  activeCompanyId,
  isRunActive = false,
}) => {
  const [startingCompanyId, setStartingCompanyId] = useState<string>('');
  const [mode, setMode] = useState<RunMode>('single');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);

  const { items, loading, refresh } = useAutomationDashboardStatus({
    db,
    selectedAgentId,
    companies,
    isAutoEnabledByFlag,
    refreshKey,
  });

  const automaticCompanies = useMemo(
    () => companies.filter((c) => c.automationEnabled),
    [companies]
  );

  const byCompanyId = useMemo(
    () => Object.fromEntries(automaticCompanies.map((c) => [c.id, c])),
    [automaticCompanies]
  );

  const activeRunningItem = items.find((item) => item.uiStatus === 'running');
  const globallyBusy = Boolean(activeRunningItem || startingCompanyId);

  const stats = useMemo(() => {
    const done = items.filter((i) => i.uiStatus === 'done').length;
    const running = items.filter((i) => i.uiStatus === 'running').length;
    const error = items.filter((i) => i.uiStatus === 'error').length;
    const ready = items.filter((i) => i.uiStatus === 'ready').length;

    return { done, running, error, ready, total: items.length };
  }, [items]);

  const selectedCompanies = useMemo(
    () =>
      selectedIds
        .map((id) => byCompanyId[id])
        .filter(Boolean) as AutomaticCompany[],
    [selectedIds, byCompanyId]
  );

  function canSelectForBatch(
    uiStatus: AutoCompanyUiStatus,
    company?: AutomaticCompany
  ) {
    if (!company) return false;
    if (!isAutoEnabledByFlag) return false;
    if (company.companyAutoDownloadEnabled === false) return false;

    return uiStatus === 'ready' || uiStatus === 'error';
  }

  function toggleCompany(companyId: string) {
    setSelectedIds((prev) =>
      prev.includes(companyId)
        ? prev.filter((id) => id !== companyId)
        : [...prev, companyId]
    );
  }

  const handleStart = async (companyId: string) => {
    const company = byCompanyId[companyId];
    if (!company) return;

    const item = items.find((x) => x.companyId === companyId);
    if (!item) return;

    if (
      item.uiStatus === 'done' ||
      item.uiStatus === 'running' ||
      item.uiStatus === 'disabled_by_flag'
    ) {
      return;
    }

    if (company.companyAutoDownloadEnabled === false) {
      return;
    }

    if (globallyBusy) {
      return;
    }

    try {
      setStartingCompanyId(companyId);
      await onStartRun(company);
      await refresh();
    } finally {
      setStartingCompanyId('');
    }
  };

  const handleStartBatch = async () => {
    if (!onStartBatch || !selectedCompanies.length) return;

    try {
      setIsSubmittingBatch(true);
      await onStartBatch(selectedCompanies);
      setSelectedIds([]);
      setMode('single');
      await refresh();
    } finally {
      setIsSubmittingBatch(false);
    }
  };

  if (!selectedAgentId || automaticCompanies.length === 0) return null;

  return (
    <section className="space-y-4" key={refreshKey}>
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-center">
            <div className="text-sm font-bold text-blue-700">מוכנות להפעלה</div>
            <div className="mt-1 text-4xl font-black text-blue-700">{stats.ready}</div>
          </div>

          <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-center">
            <div className="text-sm font-bold text-red-700">שגיאות</div>
            <div className="mt-1 text-4xl font-black text-red-700">{stats.error}</div>
          </div>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-center">
            <div className="text-sm font-bold text-indigo-700">בריצה</div>
            <div className="mt-1 text-4xl font-black text-indigo-700">{stats.running}</div>
          </div>

          <div className="rounded-2xl border border-green-100 bg-green-50 p-4 text-center">
            <div className="text-sm font-bold text-green-700">הושלמו</div>
            <div className="mt-1 text-4xl font-black text-green-700">{stats.done}</div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-md rounded-2xl bg-gray-100 p-1 shadow-sm">
        <button
          type="button"
          onClick={() => {
            setMode('single');
            setSelectedIds([]);
          }}
          className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
            mode === 'single'
              ? 'bg-white text-blue-700 shadow'
              : 'text-gray-600'
          }`}
        >
          ריצה בודדת
        </button>

        <button
          type="button"
          onClick={() => setMode('multi')}
          className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
            mode === 'multi'
              ? 'bg-white text-blue-700 shadow'
              : 'text-gray-600'
          }`}
        >
          ריבוי חברות
        </button>
      </div>

      {mode === 'multi' && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          בחרי חברות שמוכנות להפעלה או כאלה שבשגיאה. הדשבורד ישלח אותן לתור לריצה אחת אחרי השנייה.
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          טוען סטטוסים...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item) => {
            const company = byCompanyId[item.companyId];

         let effectiveStatus: AutoCompanyUiStatus = item.uiStatus;

if (
  startingCompanyId === item.companyId ||
  (isRunActive && activeCompanyId === item.companyId)
) {
  effectiveStatus = 'running';
}

            const itemAutoDisabledReason = !isAutoEnabledByFlag
              ? autoDisabledReason
              : company?.companyAutoDownloadMessage || 'הדוחות של חברה זו עדיין לא זמינים להורדה.';

         const anotherRunActive =
  (isRunActive && activeCompanyId && activeCompanyId !== item.companyId) ||
  (activeRunningItem && activeRunningItem.companyId !== item.companyId) ||
  (startingCompanyId && startingCompanyId !== item.companyId);

const globallyBlocked =
  mode === 'single' &&
  Boolean(anotherRunActive) &&
  effectiveStatus !== 'done' &&
  effectiveStatus !== 'running' &&
  effectiveStatus !== 'disabled_by_flag';

            const selectableInBatch = canSelectForBatch(effectiveStatus, company);
            const selected = selectedIds.includes(item.companyId);

            return (
              <div
                key={item.companyId}
                className={`relative rounded-2xl transition ${
                  mode === 'multi' && selectableInBatch
                    ? 'cursor-pointer'
                    : ''
                } ${
                  mode === 'multi' && selected
                    ? 'ring-2 ring-blue-500 ring-offset-2'
                    : ''
                }`}
                onClick={() => {
                  if (mode !== 'multi') return;
                  if (!selectableInBatch) return;
                  toggleCompany(item.companyId);
                }}
              >
                {mode === 'multi' && selectableInBatch && (
                  <div
                    className={`absolute left-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold ${
                      selected
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 bg-white text-gray-500'
                    }`}
                  >
                    ✓
                  </div>
                )}

                <AutoCompanyCard
                  companyName={item.companyName}
                  monthLabel={item.monthLabel}
                  uiStatus={effectiveStatus}
                  autoDisabledReason={itemAutoDisabledReason}
                  lastRunAt={item.lastRunAt}
                  busy={startingCompanyId === item.companyId || isSubmittingBatch}
                  globallyBlocked={mode === 'single' ? globallyBlocked : false}
                  globallyBlockedReason="יש ריצה פעילה כרגע"                  
                  onStart={
                    mode === 'single'
                      ? () => handleStart(item.companyId)
                      : undefined
                  }
                />
              </div>
            );
          })}
        </div>
      )}

      {mode === 'multi' && (
        <div className="sticky bottom-4 z-10">
          <div className="mx-auto flex max-w-md items-center justify-between rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-lg">
            <div className="text-sm text-gray-600">
              נבחרו <span className="font-bold text-gray-900">{selectedCompanies.length}</span> חברות
            </div>

            <button
              type="button"
              onClick={handleStartBatch}
              disabled={!selectedCompanies.length || isSubmittingBatch}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isSubmittingBatch ? 'שולח...' : 'התחל Batch'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default AutomaticRunsDashboard;