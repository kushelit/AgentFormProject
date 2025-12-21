'use client';

import { useEffect, useState } from 'react';
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

import { CommissionSplit } from '@/types/CommissionSplit';
import { CombinedData } from '../types/Sales';

import { fetchSplits } from '@/services/splitsService';
import fetchDataForAgent from '@/services/fetchDataForAgent';
import { fetchSourceLeadsForAgent } from '@/services/sourceLeadService';

/** ---------- Types ---------- */
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

type Product = {
  productName: string;
  productGroup: string;
  isOneTimeCommission?: boolean;
};

type CommissionAmounts = { hekef: number; nifraim: number };

export type ProfitByLeadSourceRow = {
  leadSource: string; // ✅ DISPLAY NAME (not id)
  commissionHekefTotal: number;
  commissionNifraimTotal: number;
  customersCount: number; // ✅ unique customers (not sales)
};

/** ---------- Helpers ---------- */
function findSplitAgreementForSale(
  sale: any,
  commissionSplits: CommissionSplit[],
  customers: CombinedData[]
) {
  const customer = customers.find(
    (cust) => cust.IDCustomer === sale.IDCustomer && cust.AgentId === sale.AgentId
  );

  const sourceValueUnified = (customer?.sourceValue || customer?.sourceLead || '').trim();
  if (!sourceValueUnified) return undefined;

  return commissionSplits.find(
    (split) => split.agentId === sale.AgentId && split.sourceLeadId === sourceValueUnified
  );
}

function calcCommissionAmounts(
  sale: any,
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
  const pensiaZvira = (parseInt(sale.pensiaZvira) || 0) * productionFactor;
  const finansimPremia = (parseInt(sale.finansimPremia) || 0) * productionFactor;
  const finansimZvira = (parseInt(sale.finansimZvira) || 0) * productionFactor;

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

function findBestContract(contractsList: BaseContract[], sale: any, product: Product | undefined) {
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

const buildBaseSalesConstraints = (
  selectedYear: number,
  selectedWorkerIdFilter: string,
  selectedCompany: string,
  selectedProduct: string,
  selectedStatusPolicy: string
): QueryConstraint[] => {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = String(currentDate.getMonth() + 1).padStart(2, '0');

  const endOfYear = `${selectedYear}-12-31`;
  const endOfCurrentMonth = `${selectedYear}-${currentMonth}-31`;
  const endDate = selectedYear === currentYear ? endOfCurrentMonth : endOfYear;

  const constraints: QueryConstraint[] = [
    where('statusPolicy', 'in', ['פעילה', 'הצעה']),
    where('mounth', '>=', `${selectedYear}-01-01`),
    where('mounth', '<=', endDate),
  ];

  if (selectedWorkerIdFilter) constraints.push(where('workerId', '==', selectedWorkerIdFilter));
  if (selectedCompany) constraints.push(where('company', '==', selectedCompany));
  if (selectedProduct) constraints.push(where('product', '==', selectedProduct));
  if (selectedStatusPolicy) constraints.push(where('statusPolicy', '==', selectedStatusPolicy));

  return constraints;
};

/** ---------- Hook ---------- */
export default function useProfitByLeadSourceData(params: {
  selectedAgentId: string;
  selectedWorkerIdFilter: string;
  selectedCompany: string;
  selectedProduct: string;
  selectedStatusPolicy: string;
  selectedYear: number;
  isCommissionSplitEnabled: boolean;
}) {
  const {
    selectedAgentId,
    selectedWorkerIdFilter,
    selectedCompany,
    selectedProduct,
    selectedStatusPolicy,
    selectedYear,
    isCommissionSplitEnabled,
  } = params;

  const { detail } = useAuth();
  const isAdmin = detail?.role === 'admin';

  const [rows, setRows] = useState<ProfitByLeadSourceRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [productMap, setProductMap] = useState<Record<string, Product>>({});
  const [agentContracts, setAgentContracts] = useState<(BaseContract & { agentId: string })[]>([]);
  const [commissionSplits, setCommissionSplits] = useState<CommissionSplit[]>([]);
  const [customers, setCustomers] = useState<CombinedData[]>([]);

  // ✅ sourceLead id -> display name
  const [sourceLeadMap, setSourceLeadMap] = useState<Record<string, string>>({});

  // 0) sourceLead map (display names)
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!selectedAgentId || selectedAgentId === 'all') {
        setSourceLeadMap({});
        return;
      }

      const leads = await fetchSourceLeadsForAgent(selectedAgentId);

      const map: Record<string, string> = {};
      leads.forEach((l) => {
        const id = (l as any).id as string | undefined;
        const name = String((l as any).sourceLead || '').trim();
        if (id && name) map[id] = name;
      });

      if (!cancelled) setSourceLeadMap(map);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [selectedAgentId]);

  // 1) contracts + products
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!selectedAgentId) return;

      const [contractsSnapshot, productsSnapshot] = await Promise.all([
        getDocs(collection(db, 'contracts')),
        getDocs(collection(db, 'product')),
      ]);

      const fetchedContracts = contractsSnapshot.docs.map((d) => ({
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
        const data = d.data() as any;
        pm[data.productName] = {
          productName: data.productName,
          productGroup: data.productGroup,
          isOneTimeCommission: data.isOneTime || false,
        };
      });

      if (cancelled) return;
      setAgentContracts(fetchedContracts);
      setProductMap(pm);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [selectedAgentId]);

  // 2) customers + splits
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!selectedAgentId || selectedAgentId === 'all') {
        setCustomers([]);
        setCommissionSplits([]);
        return;
      }

      const [customerData, splits] = await Promise.all([
        fetchDataForAgent(selectedAgentId),
        isCommissionSplitEnabled ? fetchSplits(selectedAgentId) : Promise.resolve([]),
      ]);

      if (cancelled) return;
      setCustomers(customerData);
      setCommissionSplits(splits);
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [selectedAgentId, isCommissionSplitEnabled]);

  // 3) build rows
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // גרף לסוכן ספציפי בלבד
      if (!selectedAgentId || selectedAgentId === 'all') {
        setRows([]);
        return;
      }

      // מחכים לנתוני בסיס
      if (!agentContracts.length) return;
      if (!customers.length) return; // כי מקור ליד בלקוח

      setLoading(true);

      try {
        const base = buildBaseSalesConstraints(
          selectedYear,
          selectedWorkerIdFilter,
          selectedCompany,
          selectedProduct,
          selectedStatusPolicy
        );

        const qy = query(
          collection(db, 'sales'),
          ...base,
          where('AgentId', '==', selectedAgentId)
        );

        const snap = await getDocs(qy);

        // פנימי: שומרים סט של לקוחות לכל מקור ליד
        const agg: Record<
          string,
          ProfitByLeadSourceRow & { _customerSet?: Set<string> }
        > = {};

        snap.docs.forEach((d) => {
          const sale = d.data() as DocumentData;

          // לקוח תואם
          const cust = customers.find(
            (c) => c.IDCustomer === sale.IDCustomer && c.AgentId === sale.AgentId
          );

          // ✅ מקור ליד הוא ID (sourceLead.id)
          const leadId = (cust?.sourceValue || cust?.sourceLead || '').trim();
          if (!leadId) return; // רק אם יש מקור ליד

          // ✅ שם לתצוגה
          const leadName = sourceLeadMap[leadId];
          if (!leadName) return;

          const leadSource = leadName;

          // חוזה סוכן
          const contractsForSale = agentContracts.filter((c) => c.agentId === sale.AgentId);
          const product = productMap[sale.product];
          const contract = findBestContract(contractsForSale, sale, product);
          if (!contract) return;

          const amounts = calcCommissionAmounts(
            sale,
            contract,
            product,
            commissionSplits,
            customers,
            isCommissionSplitEnabled
          );

          if (!agg[leadSource]) {
            agg[leadSource] = {
              leadSource,
              commissionHekefTotal: 0,
              commissionNifraimTotal: 0,
              customersCount: 0,
              _customerSet: new Set<string>(),
            };
          }

          agg[leadSource].commissionHekefTotal += amounts.hekef;
          agg[leadSource].commissionNifraimTotal += amounts.nifraim;

          const customerId = String(sale.IDCustomer || '').trim();
          if (customerId) agg[leadSource]._customerSet!.add(customerId);
        });

        const out: ProfitByLeadSourceRow[] = Object.values(agg)
          .map((r) => ({
            leadSource: r.leadSource,
            commissionHekefTotal: r.commissionHekefTotal,
            commissionNifraimTotal: r.commissionNifraimTotal,
            customersCount: r._customerSet?.size || 0,
          }))
          .sort((a, b) => {
            // מיון לתצוגה בלבד (אפשר לשנות למיון לפי נפרעים)
            const totalA = a.commissionHekefTotal + a.commissionNifraimTotal;
            const totalB = b.commissionHekefTotal + b.commissionNifraimTotal;
            return totalB - totalA;
          });

        if (!cancelled) setRows(out);
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
    customers,
    agentContracts,
    productMap,
    sourceLeadMap,
    isAdmin,
  ]);

  return { rows, loading };
}
