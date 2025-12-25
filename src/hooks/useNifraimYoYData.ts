// /src/hooks/useNifraimYoYData.ts
'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  DocumentData,
  QueryConstraint,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import type { CommissionSplit } from '@/types/CommissionSplit';
import type { CombinedData } from '../types/Sales';
import { fetchSplits } from '@/services/splitsService';
import fetchDataForAgent from '@/services/fetchDataForAgent';

type ViewMode = 'agent' | 'agencyMargin';

type Product = {
  productName: string;
  productGroup: string;
  isOneTimeCommission?: boolean;
};

type BaseContract = {
  id: string;
  company: string;
  product: string;
  productsGroup: string;
  commissionNifraim: number;
  commissionHekef: number;
  commissionNiud: number;
  minuySochen: boolean;
};

type AgentContract = BaseContract & { agentId: string };
type AgencyContract = BaseContract & { agencyId: string };

export type YoYSeries = { year: number; data: (number | null)[] };

type HookArgs = {
  selectedAgentId: string | null;
  selectedWorkerIdFilter: string;
  selectedCompany: string;
  selectedProduct: string;
  selectedStatusPolicy: string;
  selectedYear: number;
  isCommissionSplitEnabled: boolean;
  viewMode: ViewMode;
  agencyId?: string;
};

const canon = (v: any) => String(v ?? '').trim();

const chunk = <T,>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

function findSplitAgreementForSale(
  sale: any,
  commissionSplits: CommissionSplit[],
  customers: CombinedData[]
): CommissionSplit | undefined {
  const customer = customers.find(
    (cust) => cust.IDCustomer === sale.IDCustomer && cust.AgentId === sale.AgentId
  );

  const sourceValueUnified = customer?.sourceValue || customer?.sourceLead || '';
  if (!sourceValueUnified) return undefined;

  return commissionSplits.find(
    (split) => split.agentId === sale.AgentId && split.sourceLeadId === sourceValueUnified
  );
}

function findBestContract(
  contractsList: BaseContract[],
  sale: any,
  product: Product | undefined
): BaseContract | undefined {
  const productGroup = product?.productGroup;

  const exact = contractsList.find(
    (c) =>
      c.company === sale.company &&
      c.product === sale.product &&
      (c.minuySochen === sale.minuySochen ||
        (c.minuySochen === undefined && sale.minuySochen === false))
  );
  if (exact) return exact;

  const group = contractsList.find(
    (c) =>
      c.productsGroup === productGroup &&
      (c.minuySochen === sale.minuySochen ||
        (c.minuySochen === undefined && sale.minuySochen === false))
  );

  return group;
}

function calcCommissionNifraimInt(
  sale: any,
  contract: BaseContract,
  product: Product | undefined,
  commissionSplits: CommissionSplit[],
  customers: CombinedData[],
  canSplit: boolean
): number {
  const isOneTime = product?.isOneTimeCommission ?? false;

  let productionFactor = 1;
  let commissionFactor = 1;

  if (canSplit) {
    const splitAgreement = findSplitAgreementForSale(sale, commissionSplits, customers);
    if (splitAgreement) {
      const percentToAgent = (splitAgreement.percentToAgent ?? 100) / 100;
      const splitMode = splitAgreement.splitMode || 'commission';

      if (splitMode === 'production') {
        productionFactor = percentToAgent;
        commissionFactor = 1;
      } else {
        productionFactor = 1;
        commissionFactor = percentToAgent;
      }
    }
  }

  const insPremia = (parseInt(sale.insPremia) || 0) * productionFactor;
  const pensiaPremia = (parseInt(sale.pensiaPremia) || 0) * productionFactor;
  const finansimZvira = (parseInt(sale.finansimZvira) || 0) * productionFactor;

  let nifraim = 0;
  if (!isOneTime) {
    nifraim =
      insPremia * (contract.commissionNifraim / 100) +
      pensiaPremia * (contract.commissionNifraim / 100) +
      (finansimZvira * (contract.commissionNifraim / 100)) / 12;
  }

  nifraim *= commissionFactor;
  return Math.round(nifraim);
}

function getMonthIndexFromMounthField(mounthValue: any): number | null {
  const d = new Date(mounthValue);
  if (isNaN(d.getTime())) return null;
  return d.getMonth(); // 0..11
}

function buildYearRangeStrings(year: number) {
  const start = `${year}-01-01`;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = String(now.getMonth() + 1).padStart(2, '0');
  const end =
    year === currentYear
      ? `${year}-${currentMonth}-31`
      : `${year}-12-31`;

  // אם בוחרים שנה עתידית, עדיין נרצה “עד חודש נוכחי” של אותה שנה (כלומר עד היום)
  // אבל בפועל אין מכירות עתידיות, אז זה לא מזיק.
  return { start, end };
}

export function useNifraimYoYData(args: HookArgs) {
  const {
    selectedAgentId,
    selectedWorkerIdFilter,
    selectedCompany,
    selectedProduct,
    selectedStatusPolicy,
    selectedYear,
    isCommissionSplitEnabled,
    viewMode,
    agencyId,
  } = args;

  const { detail } = useAuth();
  const isAdmin = detail?.role === 'admin';

  const effectiveAgencyId = useMemo(
    () => agencyId ?? detail?.agencyId ?? '',
    [agencyId, detail?.agencyId]
  );

  const [labels, setLabels] = useState<string[]>([]);
  const [series, setSeries] = useState<YoYSeries[]>([]);
  const [loading, setLoading] = useState(false);

  // labels = 01..12 (אבל אם זו השנה הנוכחית/עתידית – עד החודש הנוכחי בלבד)
  useEffect(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const maxMonth =
      selectedYear >= currentYear ? now.getMonth() + 1 : 12; // 1..12

    const labs = Array.from({ length: maxMonth }, (_, i) =>
      String(i + 1).padStart(2, '0')
    );
    setLabels(labs);
  }, [selectedYear]);

  // תומך ALL (admin) בדומה ל-useSalesData
  const [agencyAgentIds, setAgencyAgentIds] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;

    const fetchAgencyAgents = async () => {
      if (!isAdmin) {
        setAgencyAgentIds([]);
        return;
      }
      if (!effectiveAgencyId) {
        setAgencyAgentIds([]);
        return;
      }

      const qy = query(
        collection(db, 'users'),
        where('agencies', '==', effectiveAgencyId)
      );
      const snap = await getDocs(qy);

      const ids = snap.docs
        .map((d) => {
          const raw = d.data() as any;
          return (raw.agentId as string) || d.id;
        })
        .filter(Boolean);

      const uniq = Array.from(new Set(ids));
      if (!cancelled) setAgencyAgentIds(uniq);
    };

    fetchAgencyAgents();
    return () => {
      cancelled = true;
    };
  }, [effectiveAgencyId, isAdmin]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!selectedAgentId) {
        setSeries([]);
        return;
      }

      setLoading(true);

      try {
        // 1) load contracts + products
        const [contractsSnap, productsSnap] = await Promise.all([
          getDocs(collection(db, 'contracts')),
          getDocs(collection(db, 'product')),
        ]);

        const agentContracts: AgentContract[] = contractsSnap.docs.map((d) => ({
          id: d.id,
          company: d.data().company ?? '',
          product: d.data().product ?? '',
          productsGroup: d.data().productsGroup ?? '',
          agentId: d.data().AgentId ?? '',
          commissionNifraim: Number(d.data().commissionNifraim ?? 0),
          commissionHekef: Number(d.data().commissionHekef ?? 0),
          commissionNiud: Number(d.data().commissionNiud ?? 0),
          minuySochen: Boolean(d.data().minuySochen ?? false),
        }));

        const productMap: Record<string, Product> = {};
        productsSnap.forEach((d) => {
          const p = d.data() as any;
          productMap[p.productName] = {
            productName: p.productName,
            productGroup: p.productGroup,
            isOneTimeCommission: p.isOneTime || false,
          };
        });

        // 2) house contracts if agencyMargin
        let houseContracts: AgencyContract[] = [];
        if (viewMode === 'agencyMargin' && isAdmin && effectiveAgencyId) {
          const snap = await getDocs(
            collection(db, 'agencies', effectiveAgencyId, 'commissionContracts')
          );
          houseContracts = snap.docs.map((d) => ({
            id: d.id,
            company: d.data().company ?? '',
            product: d.data().product ?? '',
            productsGroup: d.data().productsGroup ?? '',
            agencyId: effectiveAgencyId,
            commissionNifraim: Number(d.data().commissionNifraim ?? 0),
            commissionHekef: Number(d.data().commissionHekef ?? 0),
            commissionNiud: Number(d.data().commissionNiud ?? 0),
            minuySochen: Boolean(d.data().minuySochen ?? false),
          }));
        }

        // 3) splits+customers (רק כשסוכן ספציפי ולא ALL)
        let commissionSplits: CommissionSplit[] = [];
        let customers: CombinedData[] = [];
        const canFetchSplitData =
          isCommissionSplitEnabled &&
          !!selectedAgentId &&
          selectedAgentId !== 'all';

        if (canFetchSplitData) {
          const [splits, custs] = await Promise.all([
            fetchSplits(selectedAgentId),
            fetchDataForAgent(selectedAgentId),
          ]);
          commissionSplits = splits;
          customers = custs;
        }

        // 4) build per-year aggregation arrays
        const years = [selectedYear, selectedYear - 1, selectedYear - 2];

        const now = new Date();
        const currentYear = now.getFullYear();
        const maxMonth =
          selectedYear >= currentYear ? now.getMonth() + 1 : 12;

        const mkEmpty = () =>
          Array.from({ length: maxMonth }, () => 0);

        const yearToArr = new Map<number, number[]>();
        years.forEach((y) => yearToArr.set(y, mkEmpty()));

        // 5) build sales query constraints (same filters)
        const baseConstraints = (year: number): QueryConstraint[] => {
          const { start, end } = buildYearRangeStrings(year);
          const cons: QueryConstraint[] = [
            where('mounth', '>=', start),
            where('mounth', '<=', end),
          ];

          // statusPolicy: אם יש פילטר ספציפי – משתמשים בו (ולא IN)
          if (selectedStatusPolicy) {
            cons.push(where('statusPolicy', '==', selectedStatusPolicy));
          } else {
            cons.push(where('statusPolicy', 'in', ['פעילה', 'הצעה']));
          }

          if (selectedWorkerIdFilter)
            cons.push(where('workerId', '==', selectedWorkerIdFilter));
          if (selectedCompany) cons.push(where('company', '==', selectedCompany));
          if (selectedProduct) cons.push(where('product', '==', selectedProduct));

          // כמו אצלך: דוחים מינוי סוכן (false בלבד)
          cons.push(where('minuySochen', '==', false));

          return cons;
        };

        const fetchDocsForYear = async (year: number) => {
          const base = baseConstraints(year);

          // single agent
          if (selectedAgentId !== 'all') {
            const qy = query(
              collection(db, 'sales'),
              ...base,
              where('AgentId', '==', selectedAgentId)
            );
            const snap = await getDocs(qy);
            return snap.docs;
          }

          // ALL (admin)
          if (!isAdmin || !agencyAgentIds.length) return [];
          const chunks = chunk(agencyAgentIds, 10);
          const snaps = await Promise.all(
            chunks.map((ids) =>
              getDocs(
                query(
                  collection(db, 'sales'),
                  ...base,
                  where('AgentId', 'in', ids)
                )
              )
            )
          );
          return snaps.flatMap((s) => s.docs);
        };

        // 6) aggregate
        for (const y of years) {
          const docs = await fetchDocsForYear(y);
          const arr = yearToArr.get(y)!;

          docs.forEach((doc) => {
            const sale = doc.data() as DocumentData;
            const mIdx = getMonthIndexFromMounthField(sale.mounth);
            if (mIdx === null) return;
            if (mIdx >= maxMonth) return; // לא מציגים חודשים עתידיים

            const product = productMap[sale.product];

            // בחירת חוזה סוכן
            const agentContractsForSale = agentContracts.filter(
              (c) => c.agentId === sale.AgentId
            );
            const agentContract = findBestContract(
              agentContractsForSale,
              sale,
              product
            );
            if (!agentContract) return;

            const canSplit =
              isCommissionSplitEnabled &&
              selectedAgentId !== 'all' &&
              !!selectedAgentId;

            const agentNifraim = calcCommissionNifraimInt(
              sale,
              agentContract,
              product,
              commissionSplits,
              customers,
              canSplit
            );

            // אם לא agencyMargin → זה הערך
            if (viewMode !== 'agencyMargin' || !isAdmin) {
              arr[mIdx] += agentNifraim;
              return;
            }

            // agencyMargin: צריך חוזה בית סוכן
            const houseContract = findBestContract(houseContracts, sale, product);
            if (!houseContract) return;

            const houseNifraim = calcCommissionNifraimInt(
              sale,
              houseContract,
              product,
              commissionSplits,
              customers,
              canSplit
            );

            arr[mIdx] += houseNifraim - agentNifraim;
          });
        }

        if (cancelled) return;

        // 7) output series (with null for months with no data? כאן נשאיר 0 כדי שיהיה ברור)
        const out: YoYSeries[] = years.map((y) => ({
          year: y,
          data: (yearToArr.get(y) ?? []).map((v) => (v === 0 ? 0 : v)),
        }));

        setSeries(out);
      } catch (e) {
        if (!cancelled) setSeries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [
    selectedAgentId,
    selectedWorkerIdFilter,
    selectedCompany,
    selectedProduct,
    selectedStatusPolicy,
    selectedYear,
    isCommissionSplitEnabled,
    viewMode,
    isAdmin,
    effectiveAgencyId,
    agencyAgentIds,
  ]);

  return { labels, series, loading };
}
