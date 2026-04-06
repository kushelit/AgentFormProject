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
  onStartRun: (company: AutomaticCompany) => Promise<void>;
};

const AutomaticRunsDashboard: React.FC<Props> = ({
  db,
  selectedAgentId,
  companies,
  isAutoEnabledByFlag,
  autoDisabledReason,
  onStartRun,
}) => {
  const [startingCompanyId, setStartingCompanyId] = useState<string>('');

  const { items, loading, refresh } = useAutomationDashboardStatus({
    db,
    selectedAgentId,
    companies,
    isAutoEnabledByFlag,
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

  if (!selectedAgentId || automaticCompanies.length === 0) return null;

  return (
    <section className="space-y-4" dir="rtl">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              מצב החברות בטעינה אוטומטית
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              מעקב אחר הדוחות שפורסמו החודש ולחיצה להפעלה במידת הצורך
            </p>
          </div>

          <div
            className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
              isAutoEnabledByFlag
                ? 'bg-green-50 text-green-700 border-green-200'
                : 'bg-gray-100 text-gray-600 border-gray-200'
            }`}
          >
            {isAutoEnabledByFlag ? 'אוטומציה זמינה' : 'אוטומציה מושהית'}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
          <div className="rounded-xl bg-green-50 border border-green-100 p-3">
            <div className="text-xs text-green-700 font-bold">הושלמו</div>
            <div className="text-2xl font-black text-green-800">{stats.done}</div>
          </div>

          <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3">
            <div className="text-xs text-indigo-700 font-bold">בריצה</div>
            <div className="text-2xl font-black text-indigo-800">{stats.running}</div>
          </div>

          <div className="rounded-xl bg-red-50 border border-red-100 p-3">
            <div className="text-xs text-red-700 font-bold">שגיאות</div>
            <div className="text-2xl font-black text-red-800">{stats.error}</div>
          </div>

          <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
            <div className="text-xs text-blue-700 font-bold">מוכנות להפעלה</div>
            <div className="text-2xl font-black text-blue-800">{stats.ready}</div>
          </div>
        </div>

        {!isAutoEnabledByFlag && (
          <div className="mt-4 rounded-xl bg-gray-50 border border-gray-200 p-3 text-sm text-gray-700">
            {autoDisabledReason}
          </div>
        )}

        {globallyBusy && (
          <div className="mt-4 rounded-xl bg-indigo-50 border border-indigo-100 p-3 text-sm text-indigo-800">
            כרגע מתבצעת ריצה אחת במערכת. ניתן להפעיל חברה נוספת רק לאחר סיום הריצה הנוכחית.
          </div>
        )}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          טוען סטטוסים...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item) => {
            let effectiveStatus: AutoCompanyUiStatus = item.uiStatus;

            if (startingCompanyId === item.companyId) {
              effectiveStatus = 'running';
            }

            const anotherRunActive =
              (activeRunningItem && activeRunningItem.companyId !== item.companyId) ||
              (startingCompanyId && startingCompanyId !== item.companyId);

            const globallyBlocked =
              Boolean(anotherRunActive) &&
              effectiveStatus !== 'done' &&
              effectiveStatus !== 'running' &&
              effectiveStatus !== 'disabled_by_flag';

            return (
              <AutoCompanyCard
                key={item.companyId}
                companyName={item.companyName}
                monthLabel={item.monthLabel}
                uiStatus={effectiveStatus}
                autoDisabledReason={autoDisabledReason}
                lastRunAt={item.lastRunAt}
                busy={startingCompanyId === item.companyId}
                globallyBlocked={globallyBlocked}
                globallyBlockedReason="ממתין לסיום ריצה אחרת"
                onStart={() => handleStart(item.companyId)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
};

export default AutomaticRunsDashboard;