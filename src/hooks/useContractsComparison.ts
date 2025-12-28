// src/hooks/useContractsComparison.ts
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ContractComparisonRow, TemplateDoc } from '@/types/ContractCommissionComparison';
import {
  loadContractsComparisonData,
  type PolicyCommissionSummaryDoc,
} from '@/services/contractCommissionComparisonService';
import { buildContractComparisonRow } from '@/utils/buildContractComparisonRow';

type Args = {
  agentId?: string;
  reportMonth?: string; // YYYY-MM
  company?: string;     // optional companyName

  toleranceAmount: number;
  tolerancePercent: number;

  // בשלב הזה תמיד false, אבל שמרתי אופציה כדי לא לנעול
  minuySochen?: boolean;

  // אופציונלי - אם תרצי יום אחד להחיל גם פה split
  splitPercent?: number;

  // אם תרצי להקפיץ/לדלג על שורות בלי פרמיה
  skipZeroPremium?: boolean;
};

type State = {
  rows: ContractComparisonRow[];
  isLoading: boolean;
  error?: string;
  // עוזר ל"טיוב": כמה שורות השתמשו ב-fallback או לא זוהו alias
  mappingHints: {
    usedFallbackProductCount: number;
    noTemplateCount: number;
    noContractCount: number;
  };
};

export function useContractsComparison(args: Args) {
  const {
    agentId,
    reportMonth,
    company,
    toleranceAmount,
    tolerancePercent,
    minuySochen = false,
    splitPercent,
    skipZeroPremium = false,
  } = args;

  const [state, setState] = useState<State>({
    rows: [],
    isLoading: false,
    error: undefined,
    mappingHints: {
      usedFallbackProductCount: 0,
      noTemplateCount: 0,
      noContractCount: 0,
    },
  });

  const canLoad = useMemo(() => Boolean(agentId && reportMonth), [agentId, reportMonth]);

  const refresh = useCallback(async () => {
    if (!canLoad || !agentId || !reportMonth) {
      setState(s => ({ ...s, rows: [], error: undefined }));
      return;
    }

    setState(s => ({ ...s, isLoading: true, error: undefined }));

    try {
      const { policyRows, templatesById, contracts, systemProductMap } =
        await loadContractsComparisonData({ agentId, reportMonth, company });

      const rows: ContractComparisonRow[] = [];

      let usedFallbackProductCount = 0;
      let noTemplateCount = 0;
      let noContractCount = 0;

      for (const r of policyRows) {
        if (skipZeroPremium && Number(r.totalPremiumAmount ?? 0) <= 0) continue;

        const template = r.templateId ? (templatesById[r.templateId] ?? null) : null;

        const row = buildContractComparisonRow({
          agentId,
          reportMonth,
          row: r,
          template,
          contracts,
          systemProductMap,
          toleranceAmount,
          tolerancePercent,
          splitPercent,
          minuySochen,
        });

        if (row.status === 'no_template') noTemplateCount += 1;
        if (row.status === 'no_contract') noContractCount += 1;
        if (row.debug?.usedFallbackProduct) usedFallbackProductCount += 1;

        rows.push(row);
      }

      setState({
        rows,
        isLoading: false,
        error: undefined,
        mappingHints: {
          usedFallbackProductCount,
          noTemplateCount,
          noContractCount,
        },
      });
    } catch (e: any) {
      setState(s => ({
        ...s,
        isLoading: false,
        error: String(e?.message || e || 'Failed loading contracts comparison'),
      }));
    }
  }, [
    canLoad,
    agentId,
    reportMonth,
    company,
    toleranceAmount,
    tolerancePercent,
    minuySochen,
    splitPercent,
    skipZeroPremium,
  ]);

  // auto-load on inputs change
  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    rows: state.rows,
    isLoading: state.isLoading,
    error: state.error,
    mappingHints: state.mappingHints,
    refresh,
  };
}
