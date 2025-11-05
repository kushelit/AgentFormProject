'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import type { ContractForCompareCommissions } from '@/types/Contract';
import type { SalesToCompareCommissions } from '@/types/Sales';
import { calculateCommissions } from '@/utils/commissionCalculations';
import * as XLSX from 'xlsx';
import { useRouter, useSearchParams } from 'next/navigation';

/* ---------- types ---------- */

type ExternalCommissionRow = {
  policyNumber: string | number;
  commissionAmount: number;
  company: string;
  reportMonth?: string;
  customerId?: string;
  agentCode?: string;
  _company?: string;
  _displayPolicy?: string;
};

type Status = 'unchanged' | 'changed' | 'not_reported' | 'not_found';

type ComparisonRow = {
  policyNumber: string;
  company: string;
  reportedAmount: number;
  magicAmount: number;
  diff: number;          // reported - magic (קובץ − MAGIC)
  diffPercent: number;   // נגד הקובץ
  status: Status;
  agentCode?: string;
  customerId?: string;
  product?: string;
  _rawKey?: string;
  _extRow?: ExternalCommissionRow | null;
};

const statusOptions = [
  { value: '',             label: 'הצג הכל' },
  { value: 'unchanged',    label: 'ללא שינוי' },
  { value: 'changed',      label: 'שינוי' },
  { value: 'not_reported', label: 'לא דווח בקובץ' },
  { value: 'not_found',    label: 'אין מכירה במערכת' },
] as const;

/* ---------- helpers ---------- */

const toYm = (s?: string | null) => (s || '').toString().slice(0, 7);
const canon = (v?: string | null) => String(v ?? '').trim();
const normPolicy = (v: any) => String(v ?? '').trim();

const policyKey = (agentId: string, companyCanon: string, policyNumber: string) =>
  `${agentId}::${companyCanon}::${policyNumber}`;

/* פרסור תאריך גמיש ל־YYYY-MM */
const parseToYm = (v?: string | null) => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);           // YYYY-MM[-DD]
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {                       // DD.MM.YYYY
    const [dd, mm, yyyy] = s.split('.');
    return `${yyyy}-${mm}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {                       // DD/MM/YYYY
    const [dd, mm, yyyy] = s.split('/');
    return `${yyyy}-${mm}`;
  }
  return '';
};

/* קבלת כל בני המשפחה מה-DB כשנעולים ללקוח ורוצים תא משפחתי */
async function getFamilyIds(dbAgentId: string, lockedCustomerId: string): Promise<string[]> {
  const cq = query(
    collection(db, 'customer'),
    where('AgentId', '==', dbAgentId),
    where('IDCustomer', '==', lockedCustomerId)
  );
  const cSnap = await getDocs(cq);
  const parent = cSnap.docs[0]?.data()?.parentID;
  if (!parent) return [lockedCustomerId];

  const familyQ = query(
    collection(db, 'customer'),
    where('AgentId', '==', dbAgentId),
    where('parentID', '==', parent)
  );
  const fSnap = await getDocs(familyQ);
  const ids = fSnap.docs.map(d => (d.data() as any).IDCustomer).filter(Boolean);
  return ids.length ? Array.from(new Set(ids)) : [lockedCustomerId];
}

/* fetcher שעושה chunking ל-IN של Firestore */
async function fetchByCustomerIn<T = any>(
  coll: string,
  baseWhere: Array<ReturnType<typeof where>>,
  customerIds: string[],
  map: (d: any, id: string) => T
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < customerIds.length; i += 10) {
    const chunk = customerIds.slice(i, i + 10);
    const q = query(
      collection(db, coll),
      ...baseWhere,
      where('customerId', 'in', chunk as any)
    );
    const snap = await getDocs(q);
    snap.docs.forEach(d => out.push(map(d.data(), d.id)));
  }
  return out;
}

/* ---------- products map (לוגיקת ברירת מחדל בחישובים) ---------- */
type Product = { productName: string; productGroup: string; isOneTime?: boolean };

/* ---------- component ---------- */

export default function CompareReportedVsMagic() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  // UI/filters
  const [company, setCompany] = useState('');
  const [reportMonth, setReportMonth] = useState('');
  const [includeFamily, setIncludeFamily] = useState<boolean>(false);

  const [availableCompanies, setAvailableCompanies] = useState<string[]>([]);
  const [rows, setRows] = useState<ComparisonRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [agentCodeFilter, setAgentCodeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | ''>('');
  const [drillStatus, setDrillStatus] = useState<Status | null>(null);

  const [toleranceAmount, setToleranceAmount] = useState<number>(0);
  const [tolerancePercent, setTolerancePercent] = useState<number>(0);

  // lock to customer / navigation
  const lockedCustomerId = (searchParams.get('customerId') || '').trim();
  const lockedToCustomer = !!lockedCustomerId;
  const retParam = searchParams.get('returnTo') || '';
  const canGoBack = !!retParam || lockedToCustomer;

  // products map
  const [productMap, setProductMap] = useState<Record<string, Product>>({});

  // read `family=1` from URL on first hydrate
  const hydratedOnce = useRef(false);

  const handleBackToCustomer = () => {
    if (!canGoBack) return;
    const ret = retParam;
    if (ret) {
      router.push(decodeURIComponent(ret));
    } else {
      const agentId = searchParams.get('agentId') || '';
      const customerId = searchParams.get('customerId') || '';
      const fam = includeFamily ? '&family=1' : '';
      router.push(`/customers?agentId=${agentId}&highlightCustomer=${customerId}${fam}`);
    }
  };

  const setQueryParams = (changes: Record<string, string | null | undefined>) => {
    const usp = new URLSearchParams(window.location.search);
    Object.entries(changes).forEach(([k, v]) => {
      if (v && String(v).trim() !== '') usp.set(k, String(v).trim());
      else usp.delete(k);
    });
    router.replace(`${window.location.pathname}${usp.toString() ? `?${usp}` : ''}`);
  };

  /* --- load companies --- */
  useEffect(() => {
    (async () => {
      const snapshot = await getDocs(collection(db, 'company'));
      const companies = snapshot.docs
        .map(d => (d.data() as any)?.companyName)
        .filter(Boolean)
        .sort();
      setAvailableCompanies(companies);
    })();
  }, []);

  /* --- load products map (חובה לחישובים תקינים) --- */
  useEffect(() => {
    (async () => {
      const qs = await getDocs(collection(db, 'product'));
      const map: Record<string, Product> = {};
      qs.forEach(d => {
        const p = d.data() as Product;
        map[p.productName] = {
          productName: p.productName,
          productGroup: p.productGroup,
          isOneTime: !!p.isOneTime,
        };
      });
      setProductMap(map);
    })();
  }, []);

  /* --- hydrate once from URL --- */
  useEffect(() => {
    if (hydratedOnce.current) return;
    hydratedOnce.current = true;

    const agentId = searchParams.get('agentId') || '';
    const comp = searchParams.get('company') || '';
    const repYm = searchParams.get('reportMonth') || '';
    const fam = searchParams.get('family') === '1';

    if (agentId) handleAgentChange({ target: { value: agentId } } as any);
    if (comp) setCompany(comp);
    if (repYm) setReportMonth(repYm);
    if (fam) setIncludeFamily(true);
    if (lockedCustomerId) setSearchTerm(lockedCustomerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --- keep URL in sync after hydrate --- */
  useEffect(() => {
    if (!hydratedOnce.current) return;
    if (!selectedAgentId || !reportMonth) return;

    setQueryParams({
      agentId: selectedAgentId || null,
      company: company || null,
      reportMonth: reportMonth || null,
      family: includeFamily ? '1' : null,
    });
  }, [selectedAgentId, company, reportMonth, includeFamily]); // eslint-disable-line

  /* --- link dialog state --- */
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState<ExternalCommissionRow | null>(null);
  const [linkCandidates, setLinkCandidates] = useState<Array<{ id: string; summary: string }>>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [linkSaving, setLinkSaving] = useState(false);

  /* ---------- helpers inside fetch ---------- */
  const matchMinuy = (cMin?: boolean, sMin?: boolean) =>
    cMin === sMin || (cMin === undefined && !sMin);

  /* ---------- core fetch ---------- */
  const fetchData = useCallback(async () => {
    if (!selectedAgentId || !reportMonth) {
      setRows([]);
      return;
    }
    setIsLoading(true);

    // family scope (when locked to customer)
    let scopeCustomerIds: string[] | null = null;
    if (lockedToCustomer) {
      scopeCustomerIds = includeFamily
        ? await getFamilyIds(selectedAgentId, lockedCustomerId)
        : [lockedCustomerId];
    }

    /* ------- externalCommissions ------- */
    const extBase: any[] = [
      where('agentId', '==', selectedAgentId),
      where('reportMonth', '==', reportMonth),
    ];
    if (company) extBase.push(where('company', '==', company));

    let extRows: ExternalCommissionRow[] = [];
    if (scopeCustomerIds) {
      const fetched = await fetchByCustomerIn<ExternalCommissionRow>(
        'externalCommissions',
        extBase as any,
        scopeCustomerIds,
        (raw) => {
          const comp = canon(raw.company);
          const pol = normPolicy(raw.policyNumber);
          return {
            policyNumber: pol,
            commissionAmount: Number(raw.commissionAmount ?? 0),
            company: comp,
            reportMonth: raw.reportMonth,
            customerId: raw.customerId ?? raw.IDCustomer ?? undefined,
            agentCode: String(raw.agentCode ?? raw.AgentCode ?? '').trim() || undefined,
            _company: comp,
            _displayPolicy: pol || '-',
          };
        }
      );
      extRows = fetched;
    } else {
      const qBase = query(collection(db, 'externalCommissions'), ...extBase);
      const s = await getDocs(qBase);
      extRows = s.docs.map(d => {
        const raw = d.data() as any;
        const comp = canon(raw.company);
        const pol = normPolicy(raw.policyNumber);
        return {
          policyNumber: pol,
          commissionAmount: Number(raw.commissionAmount ?? 0),
          company: comp,
          reportMonth: raw.reportMonth,
          customerId: raw.customerId ?? raw.IDCustomer ?? undefined,
          agentCode: String(raw.agentCode ?? raw.AgentCode ?? '').trim() || undefined,
          _company: comp,
          _displayPolicy: pol || '-',
        };
      });
    }

    const externalByKey = new Map<string, ExternalCommissionRow>();
    extRows.forEach((raw, idx) => {
      const pol = normPolicy(raw.policyNumber);
      const key = pol ? `${raw._company}::${pol}` : `${raw._company}::__NO_POLICY__:${idx}`;
      externalByKey.set(key, raw);
    });

    /* ------- sales (policyYm ≤ reportMonth) ------- */
    const salesBase: any[] = [where('AgentId', '==', selectedAgentId)];
    if (company) salesBase.push(where('company', '==', company));

    type SalesBucket = {
      items: (SalesToCompareCommissions & { _company: string; _displayPolicy?: string; _docId?: string })[];
    };
    const salesByKey = new Map<string, SalesBucket>();

    const pushSale = (d: any, id: string) => {
      const s = d as any;
      const comp = canon(s.company);
      const pol = normPolicy(s.policyNumber);

      // חודש תוקף לפי כל פורמט
      const policyYm = parseToYm(s.month || s.mounth);
      if (!policyYm || policyYm > reportMonth) return;

      // ליישר לוגיקה לדף הלקוח — רק סטטוסים אלו
      const sp = String(s.statusPolicy ?? s.status ?? '').trim();
      if (!['פעילה', 'הצעה'].includes(sp)) return;

      const key = pol ? `${comp}::${pol}` : `${comp}::__NO_POLICY__:${id}`;
      const bucket = salesByKey.get(key) ?? { items: [] };
      bucket.items.push({ ...(s as any), policyNumber: pol, _company: comp, _displayPolicy: pol || '-', _docId: id });
      salesByKey.set(key, bucket);
    };

    if (scopeCustomerIds) {
      // chunk by IDCustomer
      for (let i = 0; i < scopeCustomerIds.length; i += 10) {
        const chunk = scopeCustomerIds.slice(i, i + 10);
        const qSales = query(
          collection(db, 'sales'),
          ...salesBase,
          where('IDCustomer', 'in', chunk as any)
        );
        const snap = await getDocs(qSales);
        snap.docs.forEach(d => pushSale(d.data(), d.id));
      }
    } else {
      const qSales = query(collection(db, 'sales'), ...salesBase);
      const snap = await getDocs(qSales);
      snap.docs.forEach(d => pushSale(d.data(), d.id));
    }

    /* ------- contracts ------- */
    const contractsQ = company
      ? query(collection(db, 'contracts'), where('AgentId', '==', selectedAgentId), where('company', '==', company))
      : query(collection(db, 'contracts'), where('AgentId', '==', selectedAgentId));
    const contractsSnap = await getDocs(contractsQ);
    const contracts = contractsSnap.docs.map(d => d.data() as ContractForCompareCommissions);

    /* ------- unify keys ------- */
    const allKeys = Array.from(new Set<string>([
      ...externalByKey.keys(),
      ...salesByKey.keys(),
    ]));

    const computed: ComparisonRow[] = [];

    for (const key of allKeys) {
      const [comp] = key.split('::');
      const reported = externalByKey.get(key) || null;
      const saleBucket = salesByKey.get(key) || null;

      // אין קובץ – יש מכירה ⇒ not_reported, אבל מחשבים MAGIC כרגיל!
      if (!reported && saleBucket) {
        let magicAmountSum = 0;
        let productForDisplay: string | undefined;
        let customerForDisplay: string | undefined;

        for (const sale of saleBucket.items) {
          const contractMatch =
            contracts.find(c =>
              c.AgentId === selectedAgentId &&
              c.company === comp &&
              (c as any).product === (sale as any).product &&
              matchMinuy((c as any).minuySochen, (sale as any).minuySochen)
            ) || undefined;

          const commissions = calculateCommissions(
            sale as any,
            contractMatch,
            contracts,
            productMap,            // <<< חשוב
            selectedAgentId
          );
          magicAmountSum += Number((commissions as any)?.commissionNifraim ?? 0);

          if (!productForDisplay) productForDisplay = (sale as any)?.product;
          if (!customerForDisplay) customerForDisplay = (sale as any)?.customerId || (sale as any)?.IDCustomer;
        }

        const reportedAmount = 0;
        const magicAmount = Number(magicAmountSum);
        const diff = reportedAmount - magicAmount; // קובץ - MAGIC
        const diffPercent = 0; // אין בסיס בקובץ

        computed.push({
          policyNumber: saleBucket.items[0]?._displayPolicy || '-',
          company: comp,
          reportedAmount,
          magicAmount,
          diff,
          diffPercent,
          status: 'not_reported',
          customerId: customerForDisplay,
          product: productForDisplay,
          _rawKey: key,
          _extRow: null,
        });
        continue;
      }

      // יש קובץ – אין מכירה ⇒ not_found
      if (reported && !saleBucket) {
        const rAmt = Number(reported.commissionAmount ?? 0);
        const diff = rAmt - 0; // קובץ - MAGIC
        const diffPercent = rAmt === 0 ? 0 : 100;

        computed.push({
          policyNumber: reported?._displayPolicy || '-',
          company: comp,
          reportedAmount: rAmt,
          magicAmount: 0,
          diff,
          diffPercent,
          status: 'not_found',
          agentCode: reported.agentCode,
          customerId: reported.customerId,
          _rawKey: key,
          _extRow: reported,
        });
        continue;
      }

      // שני הצדדים קיימים
      if (reported && saleBucket) {
        let magicAmountSum = 0;
        let productForDisplay: string | undefined;
        let customerForDisplay: string | undefined;

        for (const sale of saleBucket.items) {
          const contractMatch =
            contracts.find(c =>
              c.AgentId === selectedAgentId &&
              c.company === comp &&
              (c as any).product === (sale as any).product &&
              matchMinuy((c as any).minuySochen, (sale as any).minuySochen)
            ) || undefined;

          const commissions = calculateCommissions(
            sale as any,
            contractMatch,
            contracts,
            productMap,            // <<< חשוב
            selectedAgentId
          );
          magicAmountSum += Number((commissions as any)?.commissionNifraim ?? 0);

          if (!productForDisplay) productForDisplay = (sale as any)?.product;
          if (!customerForDisplay) customerForDisplay = (sale as any)?.customerId || (sale as any)?.IDCustomer;
        }

        const reportedAmount = Number(reported.commissionAmount ?? 0);
        const magicAmount = Number(magicAmountSum);
        const diff = reportedAmount - magicAmount; // קובץ - MAGIC
        const base = reportedAmount === 0 ? 1 : reportedAmount;
        const diffPercent = Math.abs(diff) / base * 100;

        const withinAmount  = Math.abs(diff) <= toleranceAmount;
        const withinPercent = diffPercent <= tolerancePercent;
        const status: Status = (withinAmount && withinPercent) ? 'unchanged' : 'changed';

        computed.push({
          policyNumber: saleBucket.items[0]?._displayPolicy || reported?._displayPolicy || '-',
          company: comp,
          reportedAmount,
          magicAmount,
          diff,
          diffPercent,
          status,
          agentCode: reported.agentCode,
          customerId: reported.customerId ?? customerForDisplay,
          product: productForDisplay,
          _rawKey: key,
          _extRow: reported,
        });
      }
    }

    setRows(computed);
    setIsLoading(false);
  }, [
    selectedAgentId,
    company,
    reportMonth,
    toleranceAmount,
    tolerancePercent,
    lockedToCustomer,
    lockedCustomerId,
    includeFamily,
    productMap, // חשוב כדי להטריע לריצה אחרי שניטען
  ]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ---------- link flow ---------- */
  const openLinkDialog = async (row: ComparisonRow) => {
    if (row.status !== 'not_found' || !row._extRow) return;

    const ext = row._extRow;
    setLinkTarget(ext);

    const baseQ = company
      ? query(collection(db, 'sales'), where('AgentId', '==', selectedAgentId), where('company', '==', ext.company))
      : query(collection(db, 'sales'), where('AgentId', '==', selectedAgentId));

    const snap = await getDocs(baseQ);
    const candidates: Array<{ id: string; summary: string }> = [];

    snap.docs.forEach(d => {
      const s = d.data() as any;
      const policyYm = parseToYm(s.month || s.mounth);
      const hasPolicy = !!normPolicy(s.policyNumber);
      if (!policyYm || policyYm > reportMonth) return;

      const sp = String(s.statusPolicy ?? s.status ?? '').trim();
      if (!['פעילה', 'הצעה'].includes(sp)) return;

      if (hasPolicy) return;
      if (ext.customerId) {
        const cid = String(s.customerId || s.IDCustomer || '').trim();
        if (cid && ext.customerId && cid !== ext.customerId) return;
      }
      const comp = canon(s.company);
      if (comp !== ext.company) return;

      const name = `${s.firstNameCustomer || ''} ${s.lastNameCustomer || ''}`.trim();
      const prod = s.product || '';
      candidates.push({
        id: d.id,
        summary: `${name || '-'} | ת״ז: ${s.IDCustomer || s.customerId || '-'} | מוצר: ${prod} | חודש: ${policyYm}`,
      });
    });

    setLinkCandidates(candidates);
    setSelectedCandidateId(candidates[0]?.id || '');
    setLinkOpen(true);
  };

  const doLink = async () => {
    if (!linkTarget || !selectedCandidateId) return;
    setLinkSaving(true);
    try {
      const comp = canon(linkTarget.company);
      const pol  = normPolicy(linkTarget.policyNumber);
      const ref = doc(db, 'sales', selectedCandidateId);
      await updateDoc(ref, {
        policyNumber: pol,
        policyNumberKey: policyKey(selectedAgentId, comp, pol),
      });
      setLinkOpen(false);
      setSelectedCandidateId('');
      setLinkCandidates([]);
      setLinkTarget(null);
      await fetchData();
    } finally {
      setLinkSaving(false);
    }
  };

  /* ---------- filtering & export ---------- */
  const agentCodes = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { if (r.agentCode) s.add(r.agentCode); });
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      const matchesTxt =
        !searchTerm ||
        String(r.policyNumber || '').includes(searchTerm) ||
        String(r.customerId || '').includes(searchTerm);

      const matchesAgent  = !agentCodeFilter || r.agentCode === agentCodeFilter;
      const matchesStatus = !statusFilter || r.status === statusFilter;
      const matchesCompany = !company || r.company === company;

      return matchesTxt && matchesAgent && matchesStatus && matchesCompany;
    });
  }, [rows, searchTerm, agentCodeFilter, statusFilter, company]);

  const visibleRows = useMemo(
    () => (drillStatus ? filtered.filter(r => r.status === drillStatus) : filtered),
    [filtered, drillStatus]
  );

  const handleExport = () => {
    const totals = visibleRows.reduce(
      (acc, r) => {
        acc.reported += r.reportedAmount;
        acc.magic += r.magicAmount;
        acc.diff += r.diff; // כבר קובץ - MAGIC
        return acc;
      },
      { reported: 0, magic: 0, diff: 0 }
    );

    const rowsForXlsx = visibleRows.map(r => ({
      'חברה': r.company,
      'מס׳ פוליסה': r.policyNumber,
      'ת״ז לקוח': r.customerId ?? '',
      'מס׳ סוכן (מהקובץ)': r.agentCode ?? '',
      'מוצר': r.product ?? '',
      'עמלה (קובץ)': r.reportedAmount.toFixed(2),
      'עמלה (MAGIC)': r.magicAmount.toFixed(2),
      'פער ₪ (קובץ−MAGIC)': r.diff.toFixed(2),
      'פער %': r.diffPercent.toFixed(2),
      'סטטוס': (statusOptions as any).find((s: any) => s.value === r.status)?.label || r.status,
    }));

    rowsForXlsx.push({
      'חברה': '',
      'מס׳ פוליסה': 'סה״כ',
      'ת״ז לקוח': '',
      'מס׳ סוכן (מהקובץ)': '',
      'מוצר': '',
      'עמלה (קובץ)': totals.reported.toFixed(2),
      'עמלה (MAGIC)': totals.magic.toFixed(2),
      'פער ₪ (קובץ−MAGIC)': totals.diff.toFixed(2),
      'פער %': '',
      'סטטוס': '',
    } as any);

    const ws = XLSX.utils.json_to_sheet(rowsForXlsx);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'השוואה קובץ מול MAGIC');
    XLSX.writeFile(wb, `השוואת_טעינה_מול_MAGIC_${company || 'כל_החברות'}_${reportMonth || 'חודש'}.xlsx`);
  };

  /* ---------- dashboard totals ---------- */
  const totals = useMemo(() => {
    const reported = visibleRows.reduce((s, r) => s + r.reportedAmount, 0);
    const magic = visibleRows.reduce((s, r) => s + r.magicAmount, 0);
    const delta = reported - magic; // קובץ − MAGIC
    return { reported, magic, delta };
  }, [visibleRows]);

  /* ---------- UI ---------- */
  return (
    <div className="compare-page p-6 max-w-7xl mx-auto text-right" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">השוואת טעינת עמלות (קובץ) מול MAGIC</h1>
        {canGoBack ? (
          <button
            type="button"
            onClick={handleBackToCustomer}
            className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300"
          >
            ← חזרה ללקוח
          </button>
        ) : null}
      </div>

      {/* DASHBOARD */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="p-6 rounded-xl border bg-emerald-50">
          <div className="text-emerald-800 font-semibold mb-1">MAGIC – נפרעים</div>
          <div className="text-3xl font-bold">{totals.magic.toLocaleString()} ₪</div>
        </div>
        <div className="p-6 rounded-xl border bg-sky-50">
          <div className="text-sky-800 font-semibold mb-1">קובץ טעינה – סכום</div>
          <div className="text-3xl font-bold">{totals.reported.toLocaleString()} ₪</div>
        </div>
        <div className="p-6 rounded-xl border bg-amber-50">
          <div className="text-amber-800 font-semibold mb-1">Delta (קובץ − MAGIC)</div>
          <div className="text-3xl font-bold">{totals.delta.toLocaleString()} ₪</div>
        </div>
      </div>

      {/* filters row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
        <div>
          <label className="block mb-1 font-semibold">בחר סוכן:</label>
          <select value={selectedAgentId} onChange={handleAgentChange} className="select-input w-full">
            {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block mb-1 font-semibold">בחר חברה (רשות):</label>
          <select value={company} onChange={e => setCompany(e.target.value)} className="select-input w-full">
            <option value="">כל החברות</option>
            {availableCompanies.map((c, i) => <option key={i} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block mb-1 font-semibold">חודש דיווח (קובץ):</label>
          <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className="input w-full" />
        </div>
        <label className="inline-flex items-center gap-2 mt-7">
          <input type="checkbox" checked={includeFamily} onChange={e => setIncludeFamily(e.target.checked)} />
          תא משפחתי
        </label>
      </div>

      {/* search / status / export */}
      {rows.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            placeholder="חיפוש לפי מס׳ פוליסה / ת״ז"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input w-full sm:w-1/3 text-right"
          />
          <select value={agentCodeFilter} onChange={(e) => setAgentCodeFilter(e.target.value)} className="select-input w-full sm:w-1/3">
            <option value="">מס׳ סוכן (מהקובץ)</option>
            {agentCodes.map(code => <option key={code} value={code}>{code}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as Status | '')} className="select-input w-full sm:w-1/3">
            {statusOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-2 px-3 py-2 rounded border bg-white hover:bg-gray-50"
            title="ייצוא של התצוגה המסוננת (כולל שורת סיכום)"
          >
            <img src="/static/img/excel-icon.svg" alt="" width={18} height={18} />
            ייצוא לאקסל
          </button>
        </div>
      )}

      {/* table */}
      {!isLoading && visibleRows.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          {drillStatus && (
            <button className="mb-4 px-4 py-2 bg-gray-500 text-white rounded" onClick={() => setDrillStatus(null)}>
              חזור לכל הסטטוסים
            </button>
          )}
          <h2 className="text-xl font-bold mb-2">
            פירוט {drillStatus ? `— ${statusOptions.find(s => s.value === drillStatus)?.label}` : ''} ({visibleRows.length} שורות)
          </h2>
          <table className="w-full border text-sm rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-gray-100 text-right">
                <th className="border p-2">חברה</th>
                <th className="border p-2">מס׳ פוליסה</th>
                <th className="border p-2">ת״ז לקוח</th>
                <th className="border p-2">מס׳ סוכן (מהקובץ)</th>
                <th className="border p-2">מוצר</th>
                <th className="border p-2 text-center bg-sky-50">עמלה (קובץ)</th>
                <th className="border p-2 text-center bg-emerald-50">עמלה (MAGIC)</th>
                <th className="border p-2 text-center">₪ Δ (קובץ−MAGIC)</th>
                <th className="border p-2 text-center">% Δ</th>
                <th className="border p-2">סטטוס</th>
                <th className="border p-2">קישור</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(r => (
                <tr key={`${r.company}|${r.policyNumber}|${r.agentCode || ''}|${r.customerId || ''}`}>
                  <td className="border p-2">{r.company}</td>
                  <td className="border p-2">{r.policyNumber || '-'}</td>
                  <td className="border p-2">{r.customerId ?? '-'}</td>
                  <td className="border p-2">{r.agentCode ?? '-'}</td>
                  <td className="border p-2">{r.product ?? '-'}</td>
                  <td className="border p-2 text-center bg-sky-50">{r.reportedAmount.toFixed(2)}</td>
                  <td className="border p-2 text-center bg-emerald-50">{r.magicAmount.toFixed(2)}</td>
                  <td className="border p-2 text-center">{r.diff.toFixed(2)}</td>
                  <td className="border p-2 text-center">{r.diffPercent.toFixed(2)}%</td>
                  <td className="border p-2 font-bold">
                    {statusOptions.find(s => s.value === r.status)?.label ?? '—'}
                  </td>
                  <td className="border p-2 text-center">
                    {r.status === 'not_found' && r._extRow ? (
                      <button
                        className="px-2 py-1 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
                        onClick={() => openLinkDialog(r)}
                        title="קשר רשומת קובץ זו לפוליסה קיימת במערכת ללא מספר"
                      >
                        קישור לפוליסה
                      </button>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isLoading && <p className="text-gray-500 mt-4">טוען נתונים…</p>}

      {/* link dialog */}
      {linkOpen && linkTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow p-4 w-full max-w-xl" dir="rtl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold">קישור פוליסה מהקובץ לפוליסה במערכת</h3>
              <button onClick={() => setLinkOpen(false)} className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300">✕</button>
            </div>
            <div className="space-y-2 text-sm">
              <div><b>חברה:</b> {linkTarget.company}</div>
              <div><b>מס׳ פוליסה (קובץ):</b> {String(linkTarget.policyNumber || '-')}</div>
              {linkTarget.customerId && <div><b>ת״ז לקוח (מהקובץ):</b> {linkTarget.customerId}</div>}
              <div className="mt-2">
                <label className="block mb-1">בחרי פוליסה במערכת (ללא מספר):</label>
                <select className="select-input w-full" value={selectedCandidateId} onChange={e => setSelectedCandidateId(e.target.value)}>
                  {linkCandidates.length === 0 && <option value="">לא נמצאו מועמדות מתאימות</option>}
                  {linkCandidates.map(c => <option key={c.id} value={c.id}>{c.summary}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
              <button className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300" onClick={() => setLinkOpen(false)} disabled={linkSaving}>ביטול</button>
              <button
                className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                onClick={doLink}
                disabled={!selectedCandidateId || linkSaving}
                title="נעדכן ב-sale את policyNumber ו-policyNumberKey"
              >
                {linkSaving ? 'שומר…' : 'קשר פוליסה'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
