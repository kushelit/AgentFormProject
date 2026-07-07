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
  companyAutoDownloadEnabled?: boolean;
  companyAutoDownloadMessage?: string;
  allowEarlyDownload?: boolean;
};

export type AutoCompanyUiStatus =
  | 'done'
  | 'running'
  | 'error'
  | 'ready'
  | 'queued'
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
  missingReports?: Array<{ templateId: string; status: string }>;
  errorMessage?: string;

};

type Params = {
  db: Firestore;
  selectedAgentId?: string;
  companies: AutomaticCompany[];
  isAutoEnabledByFlag: boolean;
  refreshKey?: number;
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
  lockState?: string;
  isAutoEnabledByFlag: boolean;
  isCompanyAutoEnabled: boolean;
}): AutoCompanyUiStatus {
  const {
    runStatus,
    runStep,
    hasLock,
    lockState,
    isAutoEnabledByFlag,
    isCompanyAutoEnabled,
  } = params;

  if (!isAutoEnabledByFlag || !isCompanyAutoEnabled) return 'disabled_by_flag';
  if (!hasLock && !runStatus) return 'ready';

  if (
    runStatus === 'error' ||
    runStatus === 'failed' ||
    runStep === 'import_error' ||
    lockState === 'error'
  ) {
    return 'error';
  }

  if (
    runStatus === 'success' && runStep === 'import_done'
  ) {
    return 'done';
  }

  if (runStatus === 'skipped') {
    if (runStep === 'duplicate_running') return 'running';
    return 'done';
  }

  if (
    lockState === 'running' ||
    runStatus === 'queued' ||
    runStatus === 'running' ||
    runStatus === 'otp_required' ||
    runStatus === 'logged_in' ||
    runStatus === 'file_uploaded' ||
    runStatus === 'done'
  ) {
    return 'running';
  }

  if (lockState === 'done') {
    return 'done';
  }

  return 'ready';
}

export function useAutomationDashboardStatus({
  db,
  selectedAgentId,
  companies,
  isAutoEnabledByFlag,
  refreshKey = 0,
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
          let errorMessage = '';
          let lastRunAt: Date | null = null;
          let missingReports: any[] = [];
         


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
              errorMessage = String(runData.error?.message || '').trim();
              lastRunAt =
                toDateSafe(runData.updatedAt) ||
                toDateSafe(runData.createdAt) ||
                null;
          const reportsSummary: any[] = runData?.reportsSummary || [];
               const missingAgents: any[] = runData?.missingAgents || [];
               missingReports = [
                 ...reportsSummary.filter((r: any) => r.status !== "ok"),
                 ...missingAgents.map((a: any) => ({
                   templateId: 'meitav_insurance',
                   templateName: `סוכן ${a.agentName}`,
                   status: 'not_downloaded',
                 })),
               ];
            }
          }

     const uiStatus = mapRunToUiStatus({
  runStatus,
  runStep,
  hasLock: lockExists,
  lockState,
  isAutoEnabledByFlag,
  isCompanyAutoEnabled: company.companyAutoDownloadEnabled !== false,
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
            errorMessage: errorMessage || undefined,
            lastRunAt,
            uiStatus,
            missingReports: missingReports.length ? missingReports : undefined,
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
  }, [selectedAgentId, JSON.stringify(automaticCompanies), isAutoEnabledByFlag, refreshKey]);

  return {
    items,
    loading,
    refresh: load,
  };
}