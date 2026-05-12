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
  batchCompanyStatuses?: Record<string, "queued" | "running" | "done" | "error">;
  isBatchActive?: boolean;
  onStartBatch: (companies: AutomaticCompany[]) => Promise<void>;
};

const AutomaticRunsDashboard: React.FC<Props> = ({
  db,
  selectedAgentId,
  companies,
  isAutoEnabledByFlag,
  autoDisabledReason,
  refreshKey = 0,
  activeCompanyId,
  isRunActive = false,
   batchCompanyStatuses = {},
  isBatchActive = false,
  onStartBatch,
}) => {
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

  // const stats = useMemo(() => {
  //   const done = items.filter((i) => i.uiStatus === 'done').length;
  //   const running = items.filter((i) => i.uiStatus === 'running').length;
  //   const error = items.filter((i) => i.uiStatus === 'error').length;
  //   const ready = items.filter((i) => i.uiStatus === 'ready').length;

  //   return { done, running, error, ready, total: items.length };
  // }, [items]);
const stats = useMemo(() => {
  let done = 0, running = 0, error = 0, ready = 0;

  for (const item of items) {
    const batchStatus = batchCompanyStatuses[item.companyId];
    let effectiveStatus = item.uiStatus;

    if (isBatchActive && batchStatus) {
      if (batchStatus === "running") effectiveStatus = "running";
      else if (batchStatus === "done") effectiveStatus = "done";
      else if (batchStatus === "error") effectiveStatus = "error";
      else if (batchStatus === "queued") effectiveStatus = "queued" as any;
    } else if (isRunActive && activeCompanyId === item.companyId) {
      effectiveStatus = "running";
    }

    if (effectiveStatus === 'done') done++;
    else if (effectiveStatus === 'running') running++;
    else if (effectiveStatus === 'error') error++;
    else if (effectiveStatus === 'ready' || effectiveStatus === 'queued') ready++;
  }

  return { done, running, error, ready, total: items.length };
}, [items, batchCompanyStatuses, isBatchActive, isRunActive, activeCompanyId]);

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

  const handleStartBatch = async () => {
    if (!selectedCompanies.length) return;

    try {
      setIsSubmittingBatch(true);
      await onStartBatch(selectedCompanies);
      setSelectedIds([]);
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

   <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
  בחרי את החברות שייכנסו לתור. אפשר לבחור חברה אחת או כמה חברות, והמערכת תריץ אותן אחת אחרי השנייה.
  {isAutoEnabledByFlag && (
    <div className="text-sm text-blue-700 mt-1">
      {(() => {
        const now = new Date();
        const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const label = twoMonthsAgo.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
        return `בתי השקעות ומוצרי הגמל בחברות הביטוח זמינים בגין חודש ${label}`;
      })()}
    </div>
  )}
</div>
      {!isAutoEnabledByFlag && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
          {autoDisabledReason}
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

const batchStatus = batchCompanyStatuses[item.companyId];
const itemAutoDisabledReason =
  batchStatus === "queued"
    ? "ממתין בתור לריצה"
    : !isAutoEnabledByFlag
    ? autoDisabledReason
    : company?.companyAutoDownloadMessage || "לא זמין";

if (isBatchActive && batchStatus) {
  if (batchStatus === "running") {
    effectiveStatus = "running";
  } else if (batchStatus === "done") {
    effectiveStatus = "done";
  } else if (batchStatus === "error") {
    effectiveStatus = "error";
  } else if (batchStatus === "queued") {
    // 👈 זה הפתרון לבאג שלך
    effectiveStatus = "queued";
  }
} else if (isRunActive && activeCompanyId === item.companyId) {
  effectiveStatus = "running";
}

            const selectableInBatch = canSelectForBatch(effectiveStatus, company);
            const selected = selectedIds.includes(item.companyId);

            return (
              <div
                key={item.companyId}
                className={`relative rounded-2xl transition ${
                  selectableInBatch ? 'cursor-pointer' : ''
                } ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
                onClick={() => {
                  if (!selectableInBatch || isSubmittingBatch) return;
                  toggleCompany(item.companyId);
                }}
              >
                <AutoCompanyCard
                  companyName={item.companyName}
                  monthLabel={item.monthLabel}
                  uiStatus={effectiveStatus}
                  autoDisabledReason={itemAutoDisabledReason}
                  lastRunAt={item.lastRunAt}
                  busy={isSubmittingBatch}
                  globallyBlocked={false}
                  globallyBlockedReason="יש ריצה פעילה כרגע"
                  missingReports={item.missingReports}
                />
              </div>
            );
          })}
        </div>
      )}

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
            {isSubmittingBatch
              ? 'שולח...'
              : selectedCompanies.length <= 1
              ? 'התחל ריצה'
              : `התחל ריצה ל-${selectedCompanies.length} חברות`}
          </button>
        </div>
      </div>
    </section>
  );
};

export default AutomaticRunsDashboard;