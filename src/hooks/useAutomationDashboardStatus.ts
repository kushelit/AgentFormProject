'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  doc,
  getDoc,
  Timestamp,
  Firestore,
} from 'firebase/firestore';

export type AutomaticCompany = {
  id: string;
  name: string;
  automationEnabled?: boolean;
  companyAutomationClass?: string;
  portalId?: string;
};

export type AutoCompanyUiStatus =
  | 'done'
  | 'running'
  | 'error'
  | 'ready'
  | 'disabled_by_flag';

export type DashboardCompanyState = {
  companyId: string;
  companyName: string;
  templateId: string;
  ym: string;
  monthLabel: string;
  lockId: string;

  lockExists: boolean;
  lockState?: string;
  lockRunId?: string;

  runId?: string;
  runStatus?: string;
  runStep?: string;
  lastRunAt?: Date | null;

  uiStatus: AutoCompanyUiStatus;
};

type Params = {
  db: Firestore;
  selectedAgentId?: string;
  companies: AutomaticCompany[];
  isAutoEnabledByFlag: boolean;
};

type Result = {
  items: DashboardCompanyState[];
  loading: boolean;
  refresh: () => Promise<void>;
};

const HEB_MONTHS = [
  'ינואר',
  'פברואר',
  'מרץ',
  'אפריל',
  'מאי',
  'יוני',
  'יולי',
  'אוגוסט',
  'ספטמבר',
  'אוקטובר',
  'נובמבר',
  'דצמבר',
];

function getCurrentPublicationYm(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function labelFromYm(ym: string): string {
  const [y, m] = ym.split('-');
  const idx = Number(m) - 1;
  return `${HEB_MONTHS[idx] || m} ${y}`;
}

function toDateSafe(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value?.toDate === 'function') return value.toDate();
  return null;
}

function getAutoBundleTemplateId(company: { id: string; portalId?: string }) {
  const portalId = String(company.portalId || company.id);
  return `bundle_${portalId}_commissions`;
}

function mapRunToUiStatus(params: {
  runStatus?: string;
  runStep?: string;
  hasLock: boolean;
  isAutoEnabledByFlag: boolean;
}): AutoCompanyUiStatus {
  const { runStatus, runStep, hasLock, isAutoEnabledByFlag } = params;

  if (!isAutoEnabledByFlag) return 'disabled_by_flag';
  if (!hasLock && !runStatus) return 'ready';

  if (runStatus === 'done' || runStatus === 'success') return 'done';
  if (runStatus === 'error' || runStatus === 'failed') return 'error';

  if (runStatus === 'skipped') {
    if (runStep === 'duplicate_running') return 'running';
    return 'done';
  }

  return 'running';
}

export function useAutomationDashboardStatus({
  db,
  selectedAgentId,
  companies,
  isAutoEnabledByFlag,
}: Params): Result {
  const [items, setItems] = useState<DashboardCompanyState[]>([]);
  const [loading, setLoading] = useState(false);

  const automaticCompanies = useMemo(
    () => companies.filter((c) => c.automationEnabled),
    [companies]
  );

  const load = async () => {
    if (!selectedAgentId || automaticCompanies.length === 0) {
      setItems([]);
      return;
    }

    setLoading(true);
    try {
      const ym = getCurrentPublicationYm();
      const monthLabel = labelFromYm(ym);

      const next = await Promise.all(
        automaticCompanies.map(async (company) => {
          const templateId = getAutoBundleTemplateId(company);
          const lockId = `${selectedAgentId}_${templateId}_${ym}`;

          const lockSnap = await getDoc(doc(db, 'portalImportLocks', lockId));

          let lockExists = false;
          let lockState = '';
          let lockRunId = '';

          let runId = '';
          let runStatus = '';
          let runStep = '';
          let lastRunAt: Date | null = null;

          if (lockSnap.exists()) {
            lockExists = true;
            const lockData: any = lockSnap.data() || {};
            lockState = String(lockData.state || '').trim();
            lockRunId = String(lockData.runId || '').trim();
          }

          if (lockRunId) {
            const runSnap = await getDoc(doc(db, 'portalImportRuns', lockRunId));
            if (runSnap.exists()) {
              const runData: any = runSnap.data() || {};
              runId = String(runData.runId || runSnap.id);
              runStatus = String(runData.status || '').trim();
              runStep = String(runData.step || '').trim();
              lastRunAt =
                toDateSafe(runData.updatedAt) ||
                toDateSafe(runData.createdAt) ||
                null;
            }
          }

          const uiStatus = mapRunToUiStatus({
            runStatus,
            runStep,
            hasLock: lockExists,
            isAutoEnabledByFlag,
          });

          return {
            companyId: company.id,
            companyName: company.name,
            templateId,
            ym,
            monthLabel,
            lockId,
            lockExists,
            lockState,
            lockRunId,
            runId: runId || undefined,
            runStatus: runStatus || undefined,
            runStep: runStep || undefined,
            lastRunAt,
            uiStatus,
          } satisfies DashboardCompanyState;
        })
      );

      setItems(next);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgentId, JSON.stringify(automaticCompanies), isAutoEnabledByFlag]);

  return {
    items,
    loading,
    refresh: load,
  };
}