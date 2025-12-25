'use client';

import { useMemo } from 'react';
import useSalesData from '@/hooks/useSalesCalculateData';

type ViewMode = 'agent' | 'agencyMargin';

export type YoYSeries = { year: number; data: Array<number | null> };

type Args = {
  selectedAgentId: string; // אצלך בפועל זה string בקומפוננט
  selectedWorkerIdFilter: string;
  selectedCompany: string;
  selectedProduct: string;
  selectedStatusPolicy: string;
  selectedYear: number;
  isCommissionSplitEnabled: boolean;
  viewMode: ViewMode;
  agencyId?: string;
};

const MONTH_LABELS = ['01','02','03','04','05','06','07','08','09','10','11','12'] as const;

function currentMonthCap(selectedYear: number) {
  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1; // 1..12
  return selectedYear === nowYear ? nowMonth : 12;
}

export function useHekefYoYData(args: Args) {
  const { selectedYear } = args;

  // תמיד קוראים 3 פעמים (חוק hooks)
  const y0 = useSalesData(
    args.selectedAgentId,
    args.selectedWorkerIdFilter,
    args.selectedCompany,
    args.selectedProduct,
    args.selectedStatusPolicy,
    selectedYear,
    false,
    args.isCommissionSplitEnabled,
    args.viewMode,
    args.agencyId
  );

  const y1 = useSalesData(
    args.selectedAgentId,
    args.selectedWorkerIdFilter,
    args.selectedCompany,
    args.selectedProduct,
    args.selectedStatusPolicy,
    selectedYear - 1,
    false,
    args.isCommissionSplitEnabled,
    args.viewMode,
    args.agencyId
  );

  const y2 = useSalesData(
    args.selectedAgentId,
    args.selectedWorkerIdFilter,
    args.selectedCompany,
    args.selectedProduct,
    args.selectedStatusPolicy,
    selectedYear - 2,
    false,
    args.isCommissionSplitEnabled,
    args.viewMode,
    args.agencyId
  );

  const labels = useMemo(() => {
    const cap = currentMonthCap(selectedYear);
    return MONTH_LABELS.slice(0, cap);
  }, [selectedYear]);

  const series: YoYSeries[] = useMemo(() => {
    const cap = currentMonthCap(selectedYear);

    const pick = (monthlyTotals: any, year: number) => {
      // monthlyTotals keys: 'MM/YY'
      const yy = String(year).slice(2);
      const arr: Array<number | null> = [];

      for (let m = 1; m <= cap; m++) {
        const key = `${String(m).padStart(2, '0')}/${yy}`;
        const v = monthlyTotals?.[key]?.commissionHekefTotal;
        arr.push(typeof v === 'number' ? v : 0); // ✅ אם אין חודש — 0
      }
      return arr;
    };

    return [
      { year: selectedYear, data: pick(y0.monthlyTotals, selectedYear) },
      { year: selectedYear - 1, data: pick(y1.monthlyTotals, selectedYear - 1) },
      { year: selectedYear - 2, data: pick(y2.monthlyTotals, selectedYear - 2) },
    ];
  }, [selectedYear, y0.monthlyTotals, y1.monthlyTotals, y2.monthlyTotals]);

  const loading = y0.isLoadingData || y1.isLoadingData || y2.isLoadingData;

  return { labels, series, loading };
}
