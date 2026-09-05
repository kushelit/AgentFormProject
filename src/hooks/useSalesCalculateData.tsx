'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  QueryConstraint,
  DocumentData,
  Query,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import { CommissionSplit } from '@/types/CommissionSplit';
import { CombinedData } from '../types/Sales';
import { fetchSplits } from '@/services/splitsService';
import fetchDataForAgent from '@/services/fetchDataForAgent';

/* =========================
   Types
========================= */
export type MonthlyTotal = {
  finansimTotal: number;
  pensiaTotal: number;
  insuranceTotal: number;
  niudPensiaTotal: number;
  commissionHekefTotal: number;
  commissionNifraimTotal: number;
  insuranceTravelTotal: number;
  prishaMyaditTotal: number;
};

type MonthlyTotals = Record<string, MonthlyTotal>;

// 🔹 מפתח כל עמודה בטבלה, משמש גם למפתחות הפירוט (drill-down)
export type ColumnKey = keyof MonthlyTotal;

// 🔹 שורת פירוט בודדת שהרכיבה חלק מהסכום בתא מסוים
export type SaleDetailRow = {
  saleId: string;
  agentId: string;
  workerId?: string;
  company: string;
  product: string;
  customerId?: string;
  customerName?: string;
  month: string;
  amount: number;
};

// 🔹 עבור כל חודש - לכל עמודה יש רשימת שורות שהרכיבו אותה
export type MonthlyDetails = Record<string, Record<ColumnKey, SaleDetailRow[]>>;

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

export type AgentContract = BaseContract & { agentId: string };
export type AgencyContract = BaseContract & { agencyId: string };

type Product = {
  productName: string;
  productGroup: string;
  isOneTimeCommission?: boolean;
};

type ViewMode = 'agent' | 'agencyMargin';

type CommissionAmounts = { hekef: number; nifraim: number };

/* =========================
   Helpers
========================= */
const emptyMonth = (): MonthlyTotal => ({
  finansimTotal: 0,
  pensiaTotal: 0,
  insuranceTotal: 0,
  niudPensiaTotal: 0,
  commissionHekefTotal: 0,
  commissionNifraimTotal: 0,
  insuranceTravelTotal: 0,
  prishaMyaditTotal: 0,
});

// 🔹 בסיס ריק לפירוט - חייב להכיל את כל אותם מפתחות כמו MonthlyTotal
const emptyDetails = (): Record<ColumnKey, SaleDetailRow[]> => ({
  finansimTotal: [],
  pensiaTotal: [],
  insuranceTotal: [],
  niudPensiaTotal: [],
  commissionHekefTotal: [],
  commissionNifraimTotal: [],
  insuranceTravelTotal: [],
  prishaMyaditTotal: [],
});

const chunk = <T,>(arr: T[], size: number) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// ── זיהוי ת"ז ללא תלות בפורמט (עם/בלי 0 מוביל) - זהה לעיקרון בכל שאר הקבצים
// (NewCustomer.tsx / DealFormModal.tsx / useEditableTable.ts / fetchDataForAgent.ts) ──
const canonId = (v: any): string => String(v ?? '').trim().replace(/\D/g, '').replace(/^0+/, '');

function formatMonthFromMounthField(mounthValue: any) {
  const date = new Date(mounthValue);
  if (isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const monthNumber = date.getMonth() + 1;
  return `${String(monthNumber).padStart(2, '0')}/${String(year).slice(2)}`;
}

function findSplitAgreementForSale(
  data: any,
  commissionSplits: CommissionSplit[],
  customers: CombinedData[]
): CommissionSplit | undefined {
  // התאמה לפי ת"ז מנורמלת (לא מחרוזת מדויקת) - כדי שעסקה שנשמרה עם פורמט ת"ז אחר
  // (עם/בלי 0 מוביל) עדיין תמצא את הסכם הפיצול הנכון של אותו לקוח בפועל.
  const customer = customers.find(
    (cust) => canonId(cust.IDCustomer) === canonId(data.IDCustomer) && cust.AgentId === data.AgentId
  );

  const sourceValueUnified = customer?.sourceValue || customer?.sourceLead || '';
  if (!sourceValueUnified) return undefined;

  return commissionSplits.find(
    (split) => split.agentId === data.AgentId && split.sourceLeadId === sourceValueUnified
  );
}

function calcCommissionAmounts(
  data: any,
  contract: BaseContract,
  product: Product | undefined,
  commissionSplits: CommissionSplit[],
  customers: CombinedData[],
  isCommissionSplitEnabled: boolean
): CommissionAmounts {
  const isOneTime = product?.isOneTimeCommission ?? false;
  const multiplier = isOneTime ? 1 : 12;

  let productionFactor = 1;
  let commissionFactor = 1;

  if (isCommissionSplitEnabled) {
    const splitAgreement = findSplitAgreementForSale(data, commissionSplits, customers);
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

  const insPremia = (parseInt(data.insPremia) || 0) * productionFactor;
  const pensiaPremia = (parseInt(data.pensiaPremia) || 0) * productionFactor;
  const pensiaZvira = (parseInt(data.pensiaZvira) || 0) * productionFactor;
  const finansimPremia = (parseInt(data.finansimPremia) || 0) * productionFactor;
  const finansimZvira = (parseInt(data.finansimZvira) || 0) * productionFactor;

  let hekef =
    insPremia * (contract.commissionHekef / 100) * multiplier +
    pensiaPremia * (contract.commissionHekef / 100) * multiplier +
    pensiaZvira * (contract.commissionNiud / 100) +
    finansimPremia * (contract.commissionHekef / 100) * multiplier +
    finansimZvira * (contract.commissionNiud / 100);

  let nifraim = 0;
  if (!isOneTime) {
    nifraim =
      insPremia * (contract.commissionNifraim / 100) +
      pensiaPremia * (contract.commissionNifraim / 100) +
      finansimZvira * (contract.commissionNifraim / 100) / 12;
  }

  hekef *= commissionFactor;
  nifraim *= commissionFactor;

  return { hekef: Math.round(hekef), nifraim: Math.round(nifraim) };
}

function findBestContract(
  contractsList: BaseContract[],
  data: any,
  product: Product | undefined
): BaseContract | undefined {
  const productGroup = product?.productGroup;

  const exact = contractsList.find(
    (c) =>
      c.company === data.company &&
      c.product === data.product &&
      (c.minuySochen === data.minuySochen ||
        (c.minuySochen === undefined && data.minuySochen === false))
  );
  if (exact) return exact;

  const group = contractsList.find(
    (c) =>
      c.productsGroup === productGroup &&
      (c.minuySochen === data.minuySochen ||
        (c.minuySochen === undefined && data.minuySochen === false))
  );

  return group;
}

/* =========================
   Hook
========================= */
export default function useSalesData(
  selectedAgentId: string,
  selectedWorkerIdFilter: string,
  selectedCompany: string,
  selectedProduct: string,
  selectedStatusPolicy: string,
  selectedYear: number,
  includePreviousDecember: boolean = false,
  isCommissionSplitEnabled: boolean,
  viewMode: ViewMode,
  agencyId?: string // מגיע מה-detail.agencyId (שהוא mapping מ-agencies)
) {
  const { detail } = useAuth();

  const [monthlyTotals, setMonthlyTotals] = useState<MonthlyTotals>({});
  const [monthlyDetails, setMonthlyDetails] = useState<MonthlyDetails>({});
  const [overallTotals, setOverallTotals] = useState<MonthlyTotal>(emptyMonth());
  const [companyCommissions, setCompanyCommissions] = useState<Record<string, number>>({});
  const [isLoadingData, setIsLoadingData] = useState(false);

  const [loadingMeta, setLoadingMeta] = useState(true);

  const [productMap, setProductMap] = useState<Record<string, Product>>({});
  const [agentContracts, setAgentContracts] = useState<AgentContract[]>([]);
  const [houseContracts, setHouseContracts] = useState<AgencyContract[]>([]);

  const [commissionSplits, setCommissionSplits] = useState<CommissionSplit[]>([]);
  const [customers, setCustomers] = useState<CombinedData[]>([]);

  const isAdmin = detail?.role === 'admin';

  // ✅ agencyId סופי: מהפרמטר אם נשלח, אחרת מה-detail
  const effectiveAgencyId = useMemo(() => agencyId ?? detail?.agencyId ?? '', [agencyId, detail?.agencyId]);

  // -----------------------
  // 1) fetch contracts + products (פעם/כשצריך)
  // -----------------------
  useEffect(() => {
    let cancelled = false;

    const fetchContractsAndProducts = async () => {
      setLoadingMeta(true);

      const [contractsSnapshot, productsSnapshot] = await Promise.all([
        getDocs(collection(db, 'contracts')),
        getDocs(collection(db, 'product')),
      ]);

      const fetchedContracts: AgentContract[] = contractsSnapshot.docs.map((d) => ({
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

      const pm: Record<string, Product> = {};
      productsSnapshot.forEach((d) => {
        const data = d.data();
        pm[data.productName] = {
          productName: data.productName,
          productGroup: data.productGroup,
          isOneTimeCommission: data.isOneTime || false,
        };
      });

      if (cancelled) return;
      setAgentContracts(fetchedContracts);
      setProductMap(pm);
      setLoadingMeta(false);
    };

    // ✅ Agent יכול לעבוד רק אם יש לו selectedAgentId, Admin יכול גם בלי
    if (!selectedAgentId && !isAdmin) return;
    fetchContractsAndProducts();

    return () => {
      cancelled = true;
    };
  }, [selectedAgentId, isAdmin]);

  // -----------------------
  // 2) fetch splits + customers (רק אם סוכן ספציפי נבחר, לא ALL)
  // -----------------------
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // אם זה ALL אין לנו "סוכן אחד" להביא ממנו לקוחות/פיצולים.
      // במקרה ALL אנחנו פשוט לא מפעילים פיצולים (יישאר ריק) — זה בסדר.
      const [splits, customerData] = await Promise.all([
        fetchSplits(selectedAgentId),
        fetchDataForAgent(selectedAgentId),
      ]);

      if (cancelled) return;
      setCommissionSplits(splits);
      setCustomers(customerData);
    };

    if (selectedAgentId && selectedAgentId !== 'all') run();
    else {
      setCommissionSplits([]);
      setCustomers([]);
    }

    return () => {
      cancelled = true;
    };
  }, [selectedAgentId]);

  // -----------------------
  // 3) fetch house contracts (רק במצב agencyMargin, ורק לאדמין)
  // -----------------------
  useEffect(() => {
    let cancelled = false;

    const fetchHouseContracts = async () => {
      if (!isAdmin || viewMode !== 'agencyMargin') {
        setHouseContracts([]);
        return;
      }
      if (!effectiveAgencyId) {
        setHouseContracts([]);
        return;
      }

      const snap = await getDocs(
        collection(db, 'agencies', effectiveAgencyId, 'commissionContracts')
      );

      const arr: AgencyContract[] = snap.docs.map((d) => ({
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

      if (cancelled) return;
      setHouseContracts(arr);
    };

    fetchHouseContracts();

    return () => {
      cancelled = true;
    };
  }, [viewMode, effectiveAgencyId, isAdmin]);

  // -----------------------
  // 4) fetch agency agentIds (users.agencies == agencyId)  ✅ זה הלב של ALL
  // -----------------------
  const [agencyAgentIds, setAgencyAgentIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const fetchAgencyAgents = async () => {
      // only admin uses ALL / agencyMargin across agency
      if (!isAdmin) {
        setAgencyAgentIds([]);
        return;
      }
      if (!effectiveAgencyId) {
        setAgencyAgentIds([]);
        return;
      }

      // 🔥 חשוב: ב-DB זה תמיד agencies
      const qy = query(collection(db, 'users'), where('agencies', '==', effectiveAgencyId));
      const snap = await getDocs(qy);

      const ids = snap.docs
        .map((d) => {
          const raw = d.data() as any;
          return (raw.agentId as string) || d.id; // לרוב זה אותו דבר
        })
        .filter(Boolean);

      // unique
      const uniq = Array.from(new Set(ids));

      if (cancelled) return;
      setAgencyAgentIds(uniq);
    };

    fetchAgencyAgents();

    return () => {
      cancelled = true;
    };
  }, [effectiveAgencyId, isAdmin]);

  // -----------------------
  // 5) build sales queries (supports ALL via chunks)
  // -----------------------
  const buildBaseSalesConstraints = (filterMinuySochen: boolean): QueryConstraint[] => {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = String(currentDate.getMonth() + 1).padStart(2, '0');

    const endOfYear = `${selectedYear}-12-31`;
    const endOfCurrentMonth = `${selectedYear}-${currentMonth}-31`;
    const endDate = selectedYear === currentYear ? endOfCurrentMonth : endOfYear;

    const constraints: QueryConstraint[] = [
      where('statusPolicy', 'in', ['פעילה', 'הצעה']),
      where('mounth', '<=', endDate),
    ];

    if (!includePreviousDecember) {
      const startOfYear = `${selectedYear}-01-01`;
      constraints.push(where('mounth', '>=', startOfYear));
    }

    if (selectedWorkerIdFilter) constraints.push(where('workerId', '==', selectedWorkerIdFilter));
    if (selectedCompany) constraints.push(where('company', '==', selectedCompany));
    if (selectedProduct) constraints.push(where('product', '==', selectedProduct));
    if (selectedStatusPolicy) constraints.push(where('statusPolicy', '==', selectedStatusPolicy));
    if (filterMinuySochen) constraints.push(where('minuySochen', '==', false));

    return constraints;
  };

  const fetchSalesSnapshots = async (filterMinuySochen: boolean) => {
    const base = buildBaseSalesConstraints(filterMinuySochen);

    // case 1: single agent (normal)
    if (selectedAgentId && selectedAgentId !== 'all') {
      const qy = query(collection(db, 'sales'), ...base, where('AgentId', '==', selectedAgentId));
      const snap = await getDocs(qy);
      return snap.docs;
    }

    // case 2: ALL (admin only): all agents of agency
    if (selectedAgentId === 'all') {
      if (!isAdmin) return [];
      if (!agencyAgentIds.length) return [];

      const chunks = chunk(agencyAgentIds, 10);
      const snaps = await Promise.all(
        chunks.map((ids) => {
          const qy = query(collection(db, 'sales'), ...base, where('AgentId', 'in', ids));
          return getDocs(qy);
        })
      );

      return snaps.flatMap((s) => s.docs);
    }

    // selectedAgentId is empty -> nothing
    return [];
  };

  // -----------------------
  // 6) חישוב helpers
  // -----------------------
  const updateTotalsForMonth = (
    data: any,
    saleId: string,
    monthTotals: MonthlyTotal,
    monthDetails: Record<ColumnKey, SaleDetailRow[]>,
    includeMinuySochen: boolean,
    product: Product | undefined,
    formatted: string
  ) => {
    if (includeMinuySochen) return;

    const isOneTime = product?.isOneTimeCommission ?? false;

    // במצב ALL אין לנו split בצורה אמינה כרגע (כי זה פר-סוכן),
    // אז אנחנו מפעילים split רק כשיש selectedAgentId ספציפי.
    const canSplit =
      isCommissionSplitEnabled &&
      selectedAgentId !== 'all' &&
      !!selectedAgentId;

    let productionFactor = 1;

    if (canSplit) {
      const splitAgreement = findSplitAgreementForSale(data, commissionSplits, customers);
      if (splitAgreement && splitAgreement.splitMode === 'production') {
        productionFactor = (splitAgreement.percentToAgent ?? 100) / 100;
      }
    }

    const baseRow: Omit<SaleDetailRow, 'amount'> = {
      saleId,
      agentId: data.AgentId,
      workerId: data.workerId,
      company: data.company,
      product: data.product,
      customerId: data.IDCustomer,
      customerName:
        `${data.firstNameCustomer || ''} ${data.lastNameCustomer || ''}`.trim() || data.IDCustomer,
      month: formatted,
    };

    const pushDetail = (columnKey: ColumnKey, amount: number) => {
      if (!amount) return;
      monthDetails[columnKey].push({ ...baseRow, amount });
    };

    if (isOneTime) {
      const travelAmount = (parseInt(data.insPremia) || 0) * productionFactor;
      const prishaAmount = (parseInt(data.pensiaZvira) || 0) * productionFactor;

      monthTotals.insuranceTravelTotal += travelAmount;
      monthTotals.prishaMyaditTotal += prishaAmount;

      pushDetail('insuranceTravelTotal', travelAmount);
      pushDetail('prishaMyaditTotal', prishaAmount);
    } else {
      const finansimAmount = (parseInt(data.finansimZvira) || 0) * productionFactor;
      const insuranceAmount = ((parseInt(data.insPremia) || 0) * 12) * productionFactor;
      const pensiaAmount = ((parseInt(data.pensiaPremia) || 0) * 12) * productionFactor;
      const niudAmount = (parseInt(data.pensiaZvira) || 0) * productionFactor;

      monthTotals.finansimTotal += finansimAmount;
      monthTotals.insuranceTotal += insuranceAmount;
      monthTotals.pensiaTotal += pensiaAmount;
      monthTotals.niudPensiaTotal += niudAmount;

      pushDetail('finansimTotal', finansimAmount);
      pushDetail('insuranceTotal', insuranceAmount);
      pushDetail('pensiaTotal', pensiaAmount);
      pushDetail('niudPensiaTotal', niudAmount);
    }
  };

  const updateCommissionsForMonth = (
    data: any,
    saleId: string,
    monthTotals: MonthlyTotal,
    monthDetails: Record<ColumnKey, SaleDetailRow[]>,
    product: Product | undefined,
    companyAgg: Record<string, number>,
    formatted: string
  ) => {
    // חוזה סוכן
    const agentContractsForSale = agentContracts.filter((c) => c.agentId === data.AgentId);
    const agentContract = findBestContract(agentContractsForSale, data, product);
    if (!agentContract) return;

    const canSplit =
      isCommissionSplitEnabled &&
      selectedAgentId !== 'all' &&
      !!selectedAgentId;

    const agentAmounts = calcCommissionAmounts(
      data,
      agentContract,
      product,
      commissionSplits,
      customers,
      canSplit
    );

    const baseRow: Omit<SaleDetailRow, 'amount'> = {
      saleId,
      agentId: data.AgentId,
      workerId: data.workerId,
      company: data.company,
      product: data.product,
      customerId: data.IDCustomer,
      customerName:
        `${data.firstNameCustomer || ''} ${data.lastNameCustomer || ''}`.trim() || data.IDCustomer,
      month: formatted,
    };

    // מצב רגיל
    if (viewMode !== 'agencyMargin' || !isAdmin) {
      monthTotals.commissionHekefTotal += agentAmounts.hekef;
      monthTotals.commissionNifraimTotal += agentAmounts.nifraim;

      if (agentAmounts.hekef) {
        monthDetails.commissionHekefTotal.push({ ...baseRow, amount: agentAmounts.hekef });
      }
      if (agentAmounts.nifraim) {
        monthDetails.commissionNifraimTotal.push({ ...baseRow, amount: agentAmounts.nifraim });
      }

      if (data.company) companyAgg[data.company] = (companyAgg[data.company] || 0) + agentAmounts.hekef;
      return;
    }

    // מצב מרווח בית סוכן (admin בלבד)
    const houseContract = findBestContract(houseContracts, data, product);
    if (!houseContract) return;

    const houseAmounts = calcCommissionAmounts(
      data,
      houseContract,
      product,
      commissionSplits,
      customers,
      canSplit
    );

    const marginHekef = houseAmounts.hekef - agentAmounts.hekef;
    const marginNifraim = houseAmounts.nifraim - agentAmounts.nifraim;

    monthTotals.commissionHekefTotal += marginHekef;
    monthTotals.commissionNifraimTotal += marginNifraim;

    if (marginHekef) {
      monthDetails.commissionHekefTotal.push({ ...baseRow, amount: marginHekef });
    }
    if (marginNifraim) {
      monthDetails.commissionNifraimTotal.push({ ...baseRow, amount: marginNifraim });
    }

    if (data.company) companyAgg[data.company] = (companyAgg[data.company] || 0) + marginHekef;
  };

  const aggregateOverallTotals = (mt: MonthlyTotals) => {
    const totals = emptyMonth();
    Object.values(mt).forEach((m) => {
      totals.finansimTotal += m.finansimTotal;
      totals.pensiaTotal += m.pensiaTotal;
      totals.insuranceTotal += m.insuranceTotal;
      totals.niudPensiaTotal += m.niudPensiaTotal;
      totals.commissionHekefTotal += m.commissionHekefTotal;
      totals.commissionNifraimTotal += m.commissionNifraimTotal;
      totals.insuranceTravelTotal += m.insuranceTravelTotal || 0;
      totals.prishaMyaditTotal += m.prishaMyaditTotal || 0;
    });
    setOverallTotals(totals);
  };

  // -----------------------
  // 7) MAIN fetchData
  // -----------------------
  useEffect(() => {
    let cancelled = false;

    const resetAll = () => {
      setMonthlyTotals({});
      setMonthlyDetails({});
      setCompanyCommissions({});
      setOverallTotals(emptyMonth());
    };

    const fetchData = async () => {
      // wait for meta
      if (loadingMeta) return;

      // empty selection
      if (!selectedAgentId) {
        resetAll();
        return;
      }

      // agencyMargin guard (admin only + must have house contracts loaded)
      if (viewMode === 'agencyMargin') {
        if (!isAdmin) {
          // לאדמין בלבד
          resetAll();
          return;
        }
        if (!effectiveAgencyId) {
          setIsLoadingData(false);
          resetAll();
          return;
        }
        if (houseContracts.length === 0) {
          // עדיין נטען / אין חוזים
          setIsLoadingData(false);
          resetAll();
          return;
        }
      }

      setIsLoadingData(true);
      resetAll();

      try {
        // נפריד: general (תפוקות) + commissions (מינוי סוכן false)
        const [generalDocs, commissionDocs] = await Promise.all([
          fetchSalesSnapshots(false),
          fetchSalesSnapshots(false),
        ]);

        const newMonthly: MonthlyTotals = {};
        const newDetails: MonthlyDetails = {};
        const newCompany: Record<string, number> = {};

        const ensureMonth = (formatted: string) => {
          if (!newMonthly[formatted]) newMonthly[formatted] = emptyMonth();
          if (!newDetails[formatted]) newDetails[formatted] = emptyDetails();
        };

        // general totals
        generalDocs.forEach((d) => {
          const data = d.data() as DocumentData;
          const formatted = formatMonthFromMounthField(data.mounth);
          if (!formatted) return;

          // עוד מסנן בטיחותי לשנה הנבחרת
          if (!includePreviousDecember) {
            const date = new Date(data.mounth);
            if (date.getFullYear() !== selectedYear) return;
          }

          ensureMonth(formatted);

          updateTotalsForMonth(
            data,
            d.id,
            newMonthly[formatted],
            newDetails[formatted],
            data.minuySochen,
            productMap[data.product],
            formatted
          );
        });

        // commissions (hekef/nifraim)
        commissionDocs.forEach((d) => {
          const data = d.data() as DocumentData;
          const formatted = formatMonthFromMounthField(data.mounth);
          if (!formatted) return;

          if (!includePreviousDecember) {
            const date = new Date(data.mounth);
            if (date.getFullYear() !== selectedYear) return;
          }

          ensureMonth(formatted);

          updateCommissionsForMonth(
            data,
            d.id,
            newMonthly[formatted],
            newDetails[formatted],
            productMap[data.product],
            newCompany,
            formatted
          );
        });

        if (cancelled) return;
        setMonthlyTotals(newMonthly);
        setMonthlyDetails(newDetails);
        setCompanyCommissions(newCompany);
        aggregateOverallTotals(newMonthly);
      } finally {
        if (!cancelled) setIsLoadingData(false);
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [
    loadingMeta,
    selectedAgentId,
    selectedWorkerIdFilter,
    selectedCompany,
    selectedProduct,
    selectedStatusPolicy,
    selectedYear,
    includePreviousDecember,
    isCommissionSplitEnabled,
    viewMode,
    isAdmin,
    effectiveAgencyId,
    agencyAgentIds.length,
    houseContracts.length,
    agentContracts.length,
    productMap,
  ]);

  return {
    monthlyTotals,
    monthlyDetails,
    overallTotals,
    isLoadingData,
    companyCommissions,
  };
}