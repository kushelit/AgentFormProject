// src/hooks/useCommissionSummary.ts
// נתוני טבלאות העמלות (/api/commission-summary) — לפי חודש פרסום ולפי חודש דיווח.
import { useEffect, useRef, useState } from 'react';
import { postJsonCached } from '@/lib/fetchCache';

export type CommissionSummaryData = {
  companyIdByName: Record<string, string>;
  summaryByMonthCompany: Record<string, Record<string, number>>;
  summaryByYmCompany: Record<string, Record<string, number>>;
  allMonths: string[];
  allCompanies: string[];
};

const EMPTY: CommissionSummaryData = {
  companyIdByName: {},
  summaryByMonthCompany: {},
  summaryByYmCompany: {},
  allMonths: [],
  allCompanies: [],
};

export default function useCommissionSummary(agentId: string, year: string) {
  const [data, setData] = useState<CommissionSummaryData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const reqRef = useRef(0);

  useEffect(() => {
    const reqId = ++reqRef.current;
    setData(EMPTY);

    if (!agentId || !year) {
      setLoading(false);
      return;
    }

    setLoading(true);
    (async () => {
      try {
        const d: any = await postJsonCached('/api/commission-summary', { agentId, year, lite: true }).catch(() => ({}));
        if (reqId !== reqRef.current) return;
        setData({
          companyIdByName: d.companyIdByName ?? {},
          summaryByMonthCompany: d.summaryByMonthCompany ?? {},
          summaryByYmCompany: d.summaryByYmCompany ?? {},
          allMonths: d.allMonths ?? [],
          allCompanies: d.allCompanies ?? [],
        });
      } catch {
        // נשאר ריק
      } finally {
        if (reqId === reqRef.current) setLoading(false);
      }
    })();
  }, [agentId, year]);

  return { data, loading };
}