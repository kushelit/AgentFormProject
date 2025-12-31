// app/importCommissionHub/CompareRealToReported/CompareReportedVsMagic.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import type { ContractForCompareCommissions } from '@/types/Contract';
import type { SalesToCompareCommissions } from '@/types/Sales';
import { calculateCommissions } from '@/utils/commissionCalculations';
import * as XLSX from 'xlsx';
import { useRouter, useSearchParams } from 'next/navigation';
import type { CommissionSplit } from '@/types/CommissionSplit';

// ✅ Contracts comparison (new tab)
import type { ViewMode, ContractComparisonRow } from '@/types/ContractCommissionComparison';
import { useContractsComparison } from '@/hooks/useContractsComparison';

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
  reportedAmount: number; // סכום בקובץ
  magicAmount: number; // סכום מחושב במערכת
  diff: number; // קובץ − MAGIC
  diffPercent: number; // נגד הקובץ
  status: Status;
  agentCode?: string;
  customerId?: string;
  product?: string;
  _rawKey?: string;
  _extRow?: ExternalCommissionRow | null;
};

const statusOptions = [
  { value: '', label: 'הצג הכל' },
  { value: 'unchanged', label: 'ללא שינוי' },
  { value: 'changed', label: 'שינוי' },
  { value: 'not_reported', label: 'לא דווח בקובץ' },
  { value: 'not_found', label: 'אין מכירה במערכת' },
] as const;

/* ---------- helpers ---------- */

const canon = (v?: string | null) => String(v ?? '').trim();

// ⚙️ נירמול מספר פוליסה – כמו policyNumberKey: בלי רווחים בכלל
const normPolicy = (v: any) =>
  String(v ?? '')
    .trim()
    .replace(/\s+/g, '');

/** YYYY-MM מכל מני פורמטים שכיחים */
const parseToYm = (v?: string | null) => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7); // YYYY-MM[-DD]
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
    // DD.MM.YYYY
    const [, mm, yyyy] = s.split('.');
    return `${yyyy}-${mm}`;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    // DD/MM/YYYY
    const [, mm, yyyy] = s.split('/');
    return `${yyyy}-${mm}`;
  }
  return '';
};

const policyKey = (agentId: string, companyCanon: string, policyNumber: string) =>
  `${agentId}::${companyCanon}::${policyNumber}`;

/** קבלת כל בני המשפחה */
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
  const ids = fSnap.docs.map(d => (d.data() as any).IDCustomer).filter((x): x is string => Boolean(x));
  return ids.length ? Array.from(new Set(ids)) : [lockedCustomerId];
}

function findSplitAgreementForSale(
  sale: any,
  commissionSplits: CommissionSplit[],
  customers: any[]
): CommissionSplit | undefined {
  // מזהי לקוח וסוכן מהמכירה
  const cid = String(sale.customerId || sale.IDCustomer || '').trim();
  const agentId = String(sale.AgentId || sale.agentId || '').trim();

  if (!cid || !agentId) return undefined;

  // מחפשים את הלקוח המתאים
  const customer = customers.find(
    c =>
      String(c.IDCustomer || '').trim() === cid &&
      String(c.AgentId || c.agentId || '').trim() === agentId
  );

  const sourceUnified = String(customer?.sourceValue || customer?.sourceLead || '').trim();
  if (!sourceUnified) return undefined;

  // מחפשים הסכם פיצול שמוגדר על אותו מקור ליד
  return commissionSplits.find(
    split =>
      String(split.agentId || '').trim() === agentId &&
      String(split.sourceLeadId || '').trim() === sourceUnified
  );
}

/* ---------- products map ---------- */
type Product = { productName: string; productGroup: string; isOneTime?: boolean };

const normalizeMinuy = (val: any): boolean => {
  if (typeof val === 'boolean') return val;
  const s = String(val ?? '').trim().toLowerCase();
  if (!s) return false;
  return ['1', 'true', 'כן', 'y', 't', 'on'].includes(s);
};

const matchMinuy = (cMin?: any, sMin?: any) => normalizeMinuy(cMin) === normalizeMinuy(sMin);

/* ---------- contracts statuses ---------- */
type ContractStatus = ContractComparisonRow['status'];

const contractStatusOptions: Array<{ value: ContractStatus | ''; label: string }> = [
  { value: '', label: 'כל הסטטוסים' },
  { value: 'ok', label: 'תקין' },
  { value: 'diff', label: 'פער' },
  { value: 'no_contract', label: 'לא נמצא חוזה' },
  { value: 'no_template', label: 'לא נמצאה תבנית' },
];

/* ---------- row colors ---------- */

const contractsRowClass = (s: ContractStatus) => {
  switch (s) {
    case 'ok':
      return 'bg-emerald-50 hover:bg-emerald-100';
    case 'diff':
      return 'bg-amber-50 hover:bg-amber-100';
    case 'no_contract':
    case 'no_template':
      return 'bg-rose-50 hover:bg-rose-100';
    default:
      return 'hover:bg-gray-50';
  }
};

const salesRowClass = (s: Status) => {
  switch (s) {
    case 'unchanged':
      return 'bg-emerald-50/60 hover:bg-emerald-100/60';
    case 'changed':
      return 'bg-amber-50/70 hover:bg-amber-100/70';
    case 'not_found':
    case 'not_reported':
      return 'bg-rose-50/60 hover:bg-rose-100/60';
    default:
      return 'hover:bg-gray-50';
  }
};

/* ---------- component ---------- */

export default function CompareReportedVsMagic() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();
  const agentIdFromUrl = (searchParams.get('agentId') || '').trim();

  const isAdmin = detail?.role === 'admin';
const canSeeContractsTab = isAdmin; // ✅ רק אדמין


  // UI/filters
  const [company, setCompany] = useState<string>('');
  const [reportMonth, setReportMonth] = useState<string>('');
  const [includeFamily, setIncludeFamily] = useState<boolean>(false);
  const [splitEnabled, setSplitEnabled] = useState<boolean>(false);

  const [availableCompanies, setAvailableCompanies] = useState<string[]>([]);
  const [rows, setRows] = useState<ComparisonRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [agentCodeFilter, setAgentCodeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<Status | ''>('');
  const [drillStatus, setDrillStatus] = useState<Status | null>(null);

  // Contracts UI
  const [viewMode, setViewMode] = useState<ViewMode>('sales');
  const [contractStatusFilter, setContractStatusFilter] = useState<ContractStatus | ''>('');
  const [contractDrillStatus, setContractDrillStatus] = useState<ContractStatus | null>(null);

  // פיצולי עמלות + לקוחות לצורך מציאת מקור ליד
  const [commissionSplits, setCommissionSplits] = useState<CommissionSplit[]>([]);
  const [customersForSplit, setCustomersForSplit] = useState<any[]>([]);

  // ספי סטייה (נשמרים/נטענים עבור הסוכן)
  const [toleranceAmount, setToleranceAmount] = useState<number>(0);
  const [tolerancePercent, setTolerancePercent] = useState<number>(0);
  const saveToleranceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // lock to customer / navigation
  const lockedCustomerId = (searchParams.get('customerId') || '').trim();
  const lockedToCustomer = !!lockedCustomerId;
  const retParam = searchParams.get('returnTo') || '';
  const canGoBack = !!retParam || lockedToCustomer;

  // products map
  const [productMap, setProductMap] = useState<Record<string, Product>>({});

  // read `family=1` once
  const hydratedOnce = useRef(false);


  const SHOW_CONTRACTS_TAB = false; // ✅ זמני

  // ✅ Contracts hook
  const {
    rows: contractRows,
    isLoading: contractsLoading,
    error: contractsError,
    mappingHints,
  } = useContractsComparison({
    agentId: selectedAgentId,
    reportMonth,
    company,
    toleranceAmount,
    tolerancePercent,
    minuySochen: false,
  });


  useEffect(() => {
    if (!canSeeContractsTab && viewMode === 'contracts') {
      setViewMode('sales');
    }
  }, [canSeeContractsTab, viewMode]);
  


  const handleBackToCustomer = () => {
    if (!canGoBack) return;
    const ret = retParam;
    if (ret) {
      router.push(decodeURIComponent(ret));
    } else {
      const agentId = searchParams.get('agentId') || '';
      const customerId = searchParams.get('customerId') || '';
      const fam = includeFamily ? '&family=1' : '';
      const split = splitEnabled ? '&split=1' : '';
      router.push(`/customers?agentId=${agentId}&highlightCustomer=${customerId}${fam}${split}`);
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
        .map(d => (d.data() as any)?.companyName as string)
        .filter((x): x is string => Boolean(x))
        .sort();
      setAvailableCompanies(companies);
    })();
  }, []);

  /* --- load products map --- */
  useEffect(() => {
    (async () => {
      const qs = await getDocs(collection(db, 'product'));
      const map: Record<string, Product> = {};
      qs.forEach(d => {
        const p = d.data() as Product;
        if (!p?.productName) return;
        map[p.productName] = {
          productName: p.productName,
          productGroup: p.productGroup,
          isOneTime: !!p.isOneTime,
        };
      });
      setProductMap(map);
    })();
  }, []);

  /* --- טעינת ספי ברירת-מחדל של הסוכן --- */
  useEffect(() => {
    (async () => {
      if (!selectedAgentId) return;
      try {
        const uref = doc(db, 'users', selectedAgentId);
        const snap = await getDoc(uref);
        if (snap.exists()) {
          const t = (snap.data() as any)?.comparisonTolerance;
          if (t) {
            if (typeof t.amount !== 'undefined') setToleranceAmount(Number(t.amount) || 0);
            if (typeof t.rate !== 'undefined') setTolerancePercent(Number(t.rate) || 0);
            if (typeof t.percent !== 'undefined') setTolerancePercent(Number(t.percent) || 0); // תאימות לשם שדה ישן
          }
        }
      } catch {
        /* ignore */
      }
    })();
  }, [selectedAgentId]);

  /* --- שמירה אוטומטית (debounce) של הספים --- */
  useEffect(() => {
    if (!selectedAgentId) return;
    if (saveToleranceTimer.current) clearTimeout(saveToleranceTimer.current);
    saveToleranceTimer.current = setTimeout(async () => {
      try {
        await updateDoc(doc(db, 'users', selectedAgentId), {
          comparisonTolerance: { amount: toleranceAmount, rate: tolerancePercent },
        });
      } catch {
        /* ignore */
      }
    }, 600);
    return () => {
      if (saveToleranceTimer.current) clearTimeout(saveToleranceTimer.current);
    };
  }, [toleranceAmount, tolerancePercent, selectedAgentId]);

  /* --- hydrate once from URL --- */
  useEffect(() => {
    if (hydratedOnce.current) return;
    hydratedOnce.current = true;

    const agentId = searchParams.get('agentId') || '';
    const comp = searchParams.get('company') || '';
    const repYm = searchParams.get('reportMonth') || '';
    const fam = searchParams.get('family') === '1';
    const split = searchParams.get('split') === '1';

    if (agentId) handleAgentChange({ target: { value: agentId } } as any);
    if (comp) setCompany(comp);
    if (repYm) setReportMonth(repYm);
    if (fam) setIncludeFamily(true);
    if (split) setSplitEnabled(true);

    // אם נעולים ללקוח אך לא על תא משפחתי, הטמע חיפוש לפי ת"ז
    if (lockedCustomerId && !fam) setSearchTerm(lockedCustomerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!agents?.length) return;
    if (!agentIdFromUrl) return;
    if (selectedAgentId === agentIdFromUrl) return;

    handleAgentChange({ target: { value: agentIdFromUrl } } as any);
  }, [agents, agentIdFromUrl, selectedAgentId, handleAgentChange]);

  /* --- keep URL in sync after hydrate --- */
  useEffect(() => {
    if (!hydratedOnce.current) return;
    if (!selectedAgentId || !reportMonth) return;

    setQueryParams({
      agentId: selectedAgentId || null,
      company: company || null,
      reportMonth: reportMonth || null,
      family: includeFamily ? '1' : null,
      split: splitEnabled ? '1' : null,
    });
  }, [selectedAgentId, company, reportMonth, includeFamily, splitEnabled]);

  /* --- UX: כשעוברים לתא משפחתי ננקה חיפוש שמגביל לת"ז הנעולה --- */
  useEffect(() => {
    if (lockedToCustomer && includeFamily && searchTerm === lockedCustomerId) {
      setSearchTerm('');
    }
  }, [includeFamily, lockedToCustomer, lockedCustomerId, searchTerm]);

  /* --- טעינת הסכמי פיצול עמלות של הסוכן --- */
  useEffect(() => {
    if (!selectedAgentId) {
      setCommissionSplits([]);
      return;
    }

    (async () => {
      try {
        const qSplits = query(collection(db, 'commissionSplits'), where('agentId', '==', selectedAgentId));
        const snap = await getDocs(qSplits);
        setCommissionSplits(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
      } catch {
        // אפשר להוסיף toast אם תרצי
      }
    })();
  }, [selectedAgentId]);

  /* --- טעינת לקוחות לצורך פיצול (sourceValue / sourceLead) --- */
  useEffect(() => {
    if (!selectedAgentId) {
      setCustomersForSplit([]);
      return;
    }

    (async () => {
      try {
        // אם נעולים ללקוח – נטען רק אותו / את התא המשפחתי
        if (lockedToCustomer && lockedCustomerId) {
          const ids = includeFamily ? await getFamilyIds(selectedAgentId, lockedCustomerId) : [lockedCustomerId];

          const chunks: string[][] = [];
          for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

          const out: any[] = [];
          for (const chunk of chunks) {
            const qCust = query(
              collection(db, 'customer'),
              where('AgentId', '==', selectedAgentId),
              where('IDCustomer', 'in', chunk as any)
            );
            const snap = await getDocs(qCust);
            snap.docs.forEach(d => out.push(d.data()));
          }
          setCustomersForSplit(out);
          return;
        }

        // אחרת – כל לקוחות הסוכן
        const qAll = query(collection(db, 'customer'), where('AgentId', '==', selectedAgentId));
        const snapAll = await getDocs(qAll);
        setCustomersForSplit(snapAll.docs.map(d => d.data()));
      } catch {
        // אפשר להוסיף toast אם תרצי
      }
    })();
  }, [selectedAgentId, lockedToCustomer, lockedCustomerId, includeFamily]);

  /* --- link dialog state --- */
  const [linkOpen, setLinkOpen] = useState<boolean>(false);
  const [linkTarget, setLinkTarget] = useState<ExternalCommissionRow | null>(null);
  const [linkCandidates, setLinkCandidates] = useState<Array<{ id: string; summary: string }>>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [linkSaving, setLinkSaving] = useState<boolean>(false);

  /* ----- עזר למשיכת מסמכים לפי IN כפול (customerId / IDCustomer) ----- */
  async function fetchDocsByFamilyDualFields<T>(
    collName: string,
    baseWheres: any[],
    ids: string[],
    mapFn: (raw: any, id: string) => T,
    extraClientFilter?: (raw: any) => boolean
  ): Promise<T[]> {
    const out: T[] = [];
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

    for (const field of ['customerId', 'IDCustomer'] as const) {
      for (const chunk of chunks) {
        const qx = query(collection(db, collName), ...baseWheres, where(field as any, 'in', chunk as any));
        const snap = await getDocs(qx);
        snap.docs.forEach(d => {
          const raw = d.data();
          if (extraClientFilter && !extraClientFilter(raw)) return;
          out.push(mapFn(raw, d.id));
        });
      }
    }

    // דה-דופ
    const seen = new Set<string>();
    const unique: T[] = [];
    (out as any[]).forEach(row => {
      const key = JSON.stringify(row);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(row);
      }
    });
    return unique;
  }

  /* ---------- core fetch (Sales) ---------- */
  const fetchData = useCallback(async () => {
    if (!selectedAgentId || !reportMonth) {
      setRows([]);
      return;
    }
    setIsLoading(true);

    // family scope (when locked to customer)
    let scopeCustomerIds: string[] | null = null;
    if (lockedToCustomer) {
      scopeCustomerIds = includeFamily ? await getFamilyIds(selectedAgentId, lockedCustomerId) : [lockedCustomerId];
    }

    /* ------- policyCommissionSummaries (צד קובץ) ------- */
    const extBase: any[] = [where('agentId', '==', selectedAgentId), where('reportMonth', '==', reportMonth)];
    if (company) extBase.push(where('company', '==', company));

    let extRows: ExternalCommissionRow[] = [];

    if (scopeCustomerIds) {
      const fetched = await fetchDocsByFamilyDualFields<ExternalCommissionRow>(
        'policyCommissionSummaries',
        extBase,
        scopeCustomerIds,
        raw => {
          const comp = canon(raw.company);
          const pol = normPolicy((raw as any).policyNumberKey ?? (raw as any).policyNumber);
          return {
            policyNumber: pol,
            commissionAmount: Number((raw as any).totalCommissionAmount ?? 0),
            company: comp,
            reportMonth: (raw as any).reportMonth,
            customerId: String((raw as any).customerId ?? '').trim() || undefined,
            agentCode: String((raw as any).agentCode ?? '').trim() || undefined,
            _company: comp,
            _displayPolicy: pol || '-',
          };
        }
      );

      if (!fetched.length) {
        const qAll = query(collection(db, 'policyCommissionSummaries'), ...extBase);
        const sAll = await getDocs(qAll);
        const famSet = new Set(scopeCustomerIds);
        sAll.docs.forEach(d => {
          const raw: any = d.data();
          const cid = String(raw.customerId ?? '').trim();
          if (!famSet.has(cid)) return;

          const comp = canon(raw.company);
          const pol = normPolicy(raw.policyNumberKey ?? raw.policyNumber);
          extRows.push({
            policyNumber: pol,
            commissionAmount: Number(raw.totalCommissionAmount ?? 0),
            company: comp,
            reportMonth: raw.reportMonth,
            customerId: cid || undefined,
            agentCode: String(raw.agentCode ?? '').trim() || undefined,
            _company: comp,
            _displayPolicy: pol || '-',
          });
        });
      } else {
        extRows = fetched;
      }
    } else {
      const qBase = query(collection(db, 'policyCommissionSummaries'), ...extBase);
      const s = await getDocs(qBase);
      extRows = s.docs.map(d => {
        const raw = d.data() as any;
        const comp = canon(raw.company);
        const pol = normPolicy(raw.policyNumberKey ?? raw.policyNumber);
        return {
          policyNumber: pol,
          commissionAmount: Number(raw.totalCommissionAmount ?? 0),
          company: comp,
          reportMonth: raw.reportMonth,
          customerId: String(raw.customerId ?? '').trim() || undefined,
          agentCode: String(raw.agentCode ?? '').trim() || undefined,
          _company: comp,
          _displayPolicy: pol || '-',
        };
      });
    }

    const externalByKey = new Map<string, ExternalCommissionRow>();

    // מאחדים לפי (company + policy)
    extRows.forEach((raw, idx) => {
      const pol = normPolicy(raw.policyNumber);
      const key = pol ? `${raw._company}::${pol}` : `${raw._company}::__NO_POLICY__:${idx}`;
      const existing = externalByKey.get(key);
      if (existing) {
        existing.commissionAmount = Number(existing.commissionAmount ?? 0) + Number(raw.commissionAmount ?? 0);
      } else {
        externalByKey.set(key, { ...raw });
      }
    });

    /* ------- sales (policyYm ≤ reportMonth, סטטוסים פעילה/הצעה) ------- */
    const salesBase: any[] = [where('AgentId', '==', selectedAgentId)];
    if (company) salesBase.push(where('company', '==', company));

    type SalesBucket = {
      items: (SalesToCompareCommissions & { _company: string; _displayPolicy?: string; _docId?: string })[];
    };
    const salesByKey = new Map<string, SalesBucket>();

    const pushSale = (raw: any, id: string) => {
      const comp = canon(raw.company);
      const pol = normPolicy(raw.policyNumber);
      const policyYm = parseToYm(raw.month || raw.mounth);
      if (!policyYm || policyYm > reportMonth) return;

      const sp = String(raw.statusPolicy ?? raw.status ?? '').trim();
      if (!['פעילה', 'הצעה'].includes(sp)) return;

      const key = pol ? `${comp}::${pol}` : `${comp}::__NO_POLICY__:${id}`;
      const bucket = salesByKey.get(key) ?? { items: [] };
      bucket.items.push({
        ...(raw as any),
        policyNumber: pol,
        _company: comp,
        _displayPolicy: pol || '-',
        _docId: id,
      });
      salesByKey.set(key, bucket);
    };

    if (scopeCustomerIds) {
      const fetched = await fetchDocsByFamilyDualFields<{ raw: any; id: string }>(
        'sales',
        salesBase,
        scopeCustomerIds,
        (raw, id) => ({ raw, id }),
        raw => {
          const policyYm = parseToYm(raw.month || raw.mounth);
          if (!policyYm || policyYm > reportMonth) return false;
          const sp = String(raw.statusPolicy ?? raw.status ?? '').trim();
          return ['פעילה', 'הצעה'].includes(sp);
        }
      );
      fetched.forEach(({ raw, id }) => pushSale(raw, id));

      if (salesByKey.size === 0) {
        const qAll = query(collection(db, 'sales'), ...salesBase);
        const sAll = await getDocs(qAll);
        const famSet = new Set(scopeCustomerIds);
        sAll.docs.forEach(d => {
          const raw: any = d.data();
          const cid = String(raw.customerId ?? raw.IDCustomer ?? '').trim();
          if (!famSet.has(cid)) return;
          pushSale(raw, d.id);
        });
      }
    } else {
      const qSales = query(collection(db, 'sales'), ...salesBase);
      const snap = await getDocs(qSales);
      snap.docs.forEach(d => pushSale(d.data(), d.id));
    }

    /* ------- contracts ------- */
    const contractsSnap = await getDocs(
      query(collection(db, 'contracts'), where('AgentId', '==', selectedAgentId))
    );
    const allContracts = contractsSnap.docs.map(d => d.data() as ContractForCompareCommissions);

    const contractsForDirectMatch = company
      ? allContracts.filter(c => canon((c as any).company) === canon(company))
      : allContracts;

    /* ------- unify keys ------- */
    const allKeysSet = new Set<string>();
    for (const k of externalByKey.keys()) allKeysSet.add(k);
    for (const k of salesByKey.keys()) allKeysSet.add(k);
    const allKeys: string[] = Array.from(allKeysSet);

    const computed: ComparisonRow[] = [];

    const ensureProductInMap = (productName?: string) => {
      const p = String(productName ?? '').trim();
      if (!p) return;
      if (!productMap[p]) {
        (productMap as any)[p] = { productName: p, productGroup: 'לא מסווג', isOneTime: false } as Product;
      }
    };

    for (const key of allKeys) {
      const [comp] = key.split('::');
      const reported = externalByKey.get(key) || null;
      const saleBucket = salesByKey.get(key) || null;

      // אין קובץ – יש מכירה ⇒ not_reported
      if (!reported && saleBucket) {
        let magicAmountSum = 0;
        let productForDisplay: string | undefined;
        let customerForDisplay: string | undefined;

        for (const sale of saleBucket.items) {
          ensureProductInMap((sale as any).product);

          const contractMatch =
            contractsForDirectMatch.find(
              c =>
                c.AgentId === selectedAgentId &&
                canon((c as any).company) === comp &&
                (c as any).product === (sale as any).product &&
                matchMinuy((c as any).minuySochen, (sale as any).minuySochen)
            ) || undefined;

          const commissions = calculateCommissions(sale as any, contractMatch, allContracts, productMap, selectedAgentId);
          let magicNifraim = Number((commissions as any)?.commissionNifraim ?? 0);

          if (splitEnabled) {
            const split = findSplitAgreementForSale(sale, commissionSplits, customersForSplit);
            if (split) magicNifraim = Math.round(magicNifraim * (split.percentToAgent / 100));
          }

          magicAmountSum += magicNifraim;

          if (!productForDisplay) productForDisplay = (sale as any)?.product;
          if (!customerForDisplay) customerForDisplay = (sale as any)?.customerId || (sale as any)?.IDCustomer;
        }

        const reportedAmount = 0;
        const magicAmount = Number(magicAmountSum);
        const diff = reportedAmount - magicAmount;
        const diffPercent = 0;

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
        const diff = rAmt - 0;
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

      // שני הצדדים קיימים ⇒ מחשבים MAGIC
      if (reported && saleBucket) {
        let magicAmountSum = 0;
        let productForDisplay: string | undefined;
        let customerForDisplay: string | undefined;

        for (const sale of saleBucket.items) {
          ensureProductInMap((sale as any).product);

          const contractMatch =
            contractsForDirectMatch.find(
              c =>
                c.AgentId === selectedAgentId &&
                canon((c as any).company) === comp &&
                (c as any).product === (sale as any).product &&
                matchMinuy((c as any).minuySochen, (sale as any).minuySochen)
            ) || undefined;

          const commissions = calculateCommissions(sale as any, contractMatch, allContracts, productMap, selectedAgentId);
          let magicNifraim = Number((commissions as any)?.commissionNifraim ?? 0);

          if (splitEnabled) {
            const split = findSplitAgreementForSale(sale, commissionSplits, customersForSplit);
            if (split) magicNifraim = Math.round(magicNifraim * (split.percentToAgent / 100));
          }

          magicAmountSum += magicNifraim;

          if (!productForDisplay) productForDisplay = (sale as any)?.product;
          if (!customerForDisplay) customerForDisplay = (sale as any)?.customerId || (sale as any)?.IDCustomer;
        }

        const reportedAmount = Number(reported.commissionAmount ?? 0);
        const magicAmount = Number(magicAmountSum);
        const diff = reportedAmount - magicAmount;
        const base = reportedAmount === 0 ? 1 : reportedAmount;
        const diffPercent = (Math.abs(diff) / base) * 100;

        const withinAmount = Math.abs(diff) <= toleranceAmount;
        const withinPercent = diffPercent <= tolerancePercent;
        const status: Status = withinAmount || withinPercent ? 'unchanged' : 'changed';

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
    productMap,
    commissionSplits,
    customersForSplit,
    splitEnabled,
  ]);

  // ✅ fetch only when sales tab is active
  useEffect(() => {
    if (viewMode !== 'sales') return;
    fetchData();
  }, [fetchData, viewMode]);

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
      const pol = normPolicy(linkTarget.policyNumber);
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

  /* ---------- derived (sales) ---------- */

  const agentCodes = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => {
      if (r.agentCode) s.add(r.agentCode);
    });
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const text = searchTerm.trim();
    const isFamilyScope = lockedToCustomer && includeFamily;

    return rows.filter(r => {
      const txtMatch =
        !text || String(r.policyNumber || '').includes(text) || (!isFamilyScope && String(r.customerId || '').includes(text));

      const matchesAgent = !agentCodeFilter || r.agentCode === agentCodeFilter;
      const matchesStatus = !statusFilter || r.status === statusFilter;
      const matchesCompany = !company || r.company === company;

      return txtMatch && matchesAgent && matchesStatus && matchesCompany;
    });
  }, [rows, searchTerm, agentCodeFilter, statusFilter, company, includeFamily, lockedToCustomer]);

  const visibleRows = useMemo(() => (drillStatus ? filtered.filter(r => r.status === drillStatus) : filtered), [filtered, drillStatus]);

  const handleExportSales = () => {
    const totalsLocal = visibleRows.reduce(
      (acc, r) => {
        acc.reported += r.reportedAmount;
        acc.magic += r.magicAmount;
        acc.diff += r.diff;
        return acc;
      },
      { reported: 0, magic: 0, diff: 0 } as { reported: number; magic: number; diff: number }
    );

    const rowsForXlsx = visibleRows.map(r => ({
      חברה: r.company,
      'מס׳ פוליסה': r.policyNumber,
      'ת״ז לקוח': r.customerId ?? '',
      'מס׳ סוכן (מהקובץ)': r.agentCode ?? '',
      מוצר: r.product ?? '',
      'עמלה (קובץ)': r.reportedAmount.toFixed(2),
      'עמלה (MAGIC)': r.magicAmount.toFixed(2),
      'פער ₪ (קובץ−MAGIC)': r.diff.toFixed(2),
      'פער %': r.diffPercent.toFixed(2),
      סטטוס: (statusOptions as readonly any[]).find((s: any) => s.value === r.status)?.label || r.status,
    }));

    rowsForXlsx.push({
      חברה: '',
      'מס׳ פוליסה': 'סה״כ',
      'ת״ז לקוח': '',
      'מס׳ סוכן (מהקובץ)': '',
      מוצר: '',
      'עמלה (קובץ)': totalsLocal.reported.toFixed(2),
      'עמלה (MAGIC)': totalsLocal.magic.toFixed(2),
      'פער ₪ (קובץ−MAGIC)': totalsLocal.diff.toFixed(2),
      'פער %': '',
      סטטוס: '',
    } as any);

    const ws = XLSX.utils.json_to_sheet(rowsForXlsx);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales');
    XLSX.writeFile(wb, `השוואת_טעינה_מול_MAGIC_${company || 'כל_החברות'}_${reportMonth || 'חודש'}.xlsx`);
  };

  const statusSummary = useMemo(() => {
    return filtered.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {} as Record<Status, number>);
  }, [filtered]);

  /* ---------- derived (contracts) ---------- */

  const filteredContracts = useMemo(() => {
    const text = searchTerm.trim();
    return contractRows.filter(r => {
      const txtMatch =
        !text ||
        String(r.policyNumber || '').includes(text) ||
        String(r.customerId || '').includes(text);

      const matchesCompany = !company || String(r.company || '').trim() === String(company).trim();
      const matchesStatus = !contractStatusFilter || r.status === contractStatusFilter;
      return txtMatch && matchesCompany && matchesStatus;
    });
  }, [contractRows, searchTerm, company, contractStatusFilter]);

  const visibleContractRows = useMemo(
    () => (contractDrillStatus ? filteredContracts.filter(r => r.status === contractDrillStatus) : filteredContracts),
    [filteredContracts, contractDrillStatus]
  );

  const contractStatusSummary = useMemo(() => {
    return filteredContracts.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {} as Record<ContractStatus, number>);
  }, [filteredContracts]);

  const handleExportContracts = () => {
    const totalsC = visibleContractRows.reduce(
      (acc, r) => {
        acc.reported += Number(r.reportedCommissionAmount || 0);
        acc.expected += Number(r.expectedAmount || 0);
        acc.delta += Number(r.amountDiff || 0);
        return acc;
      },
      { reported: 0, expected: 0, delta: 0 }
    );

    const rowsForXlsx = visibleContractRows.map(r => ({
      חברה: r.company,
      'מס׳ פוליסה': r.policyNumber,
      'ת״ז לקוח': r.customerId ?? '',
      'מוצר (Raw)': r.productRaw ?? '',
      'מוצר (Canonical)': r.canonicalProduct ?? '',
      פרמיה: Number(r.premiumAmount || 0).toFixed(2),
      'עמלה (קובץ)': Number(r.reportedCommissionAmount || 0).toFixed(2),
      'עמלה צפויה': Number(r.expectedAmount || 0).toFixed(2),
      'Δ ₪': Number(r.amountDiff || 0).toFixed(2),
      '% עמלה (קובץ)': Number(r.reportedRate || 0).toFixed(2),
'% עמלה (הסכם)': Number(r.contractRate || 0).toFixed(2),
'Δ %': Number(r.rateDiff || 0).toFixed(2),

      סטטוס: r.status,
    }));

    rowsForXlsx.push({
      חברה: '',
      'מס׳ פוליסה': 'סה״כ',
      'ת״ז לקוח': '',
      'מוצר (Raw)': '',
      'מוצר (Canonical)': '',
      פרמיה: '',
      'עמלה (קובץ)': totalsC.reported.toFixed(2),
      'עמלה צפויה': totalsC.expected.toFixed(2),
      'Δ ₪': totalsC.delta.toFixed(2),
      סטטוס: '',
    } as any);

    const ws = XLSX.utils.json_to_sheet(rowsForXlsx);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contracts');
    XLSX.writeFile(wb, `השוואת_קובץ_מול_הסכם_${company || 'כל_החברות'}_${reportMonth || 'חודש'}.xlsx`);
  };

  /* ---------- dashboard (active) ---------- */

  const isContracts = viewMode === 'contracts';

  const activeTotals = useMemo(() => {
    if (!isContracts) {
      const reported = visibleRows.reduce((s, r) => s + r.reportedAmount, 0);
      const expected = visibleRows.reduce((s, r) => s + r.magicAmount, 0);
      return { reported, expected, delta: reported - expected };
    }
    const reported = visibleContractRows.reduce((s, r) => s + Number(r.reportedCommissionAmount || 0), 0);
    const expected = visibleContractRows.reduce((s, r) => s + Number(r.expectedAmount || 0), 0);
    return { reported, expected, delta: reported - expected };
  }, [isContracts, visibleRows, visibleContractRows]);

  const hasActiveData = isContracts ? contractRows.length > 0 : rows.length > 0;

  /* ---------- UI ---------- */

  return (
    <div className="compare-page p-6 max-w-7xl mx-auto text-right" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">השוואת טעינת עמלות (קובץ) מול MAGIC</h1>

        {canSeeContractsTab ? (
  <div className="flex items-center rounded-full border border-blue-200 bg-blue-50 p-1 gap-1">
    <button
      type="button"
      onClick={() => {
        setViewMode('sales');
        setContractDrillStatus(null);
        setContractStatusFilter('');
      }}
      className={`px-4 py-1.5 rounded-full text-sm font-semibold transition ${
        viewMode === 'sales'
          ? 'bg-white text-blue-700 shadow-sm'
          : 'text-gray-500 hover:text-blue-700'
      }`}
    >
      השוואה מול Magic 
    </button>

    <button
      type="button"
      onClick={() => {
        setViewMode('contracts');
        setDrillStatus(null);
        setStatusFilter('');
      }}
      className={`px-4 py-1.5 rounded-full text-sm font-semibold transition ${
        viewMode === 'contracts'
          ? 'bg-white text-blue-700 shadow-sm'
          : 'text-gray-500 hover:text-blue-700'
      }`}
    >
      השוואה מול הסכם 
    </button>
  </div>
) : null}

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
          <div className="text-emerald-800 font-semibold mb-1">
            {viewMode === 'contracts' ? 'צפוי לפי הסכם' : 'MAGIC – נפרעים'}
          </div>
          <div className="text-3xl font-bold">{activeTotals.expected.toLocaleString()} ₪</div>
        </div>
        <div className="p-6 rounded-xl border bg-sky-50">
          <div className="text-sky-800 font-semibold mb-1">קובץ טעינה – סכום</div>
          <div className="text-3xl font-bold">{activeTotals.reported.toLocaleString()} ₪</div>
        </div>
        <div className="p-6 rounded-xl border bg-amber-50">
          <div className="text-amber-800 font-semibold mb-1">
            {viewMode === 'contracts' ? 'Delta (קובץ − צפוי)' : 'Delta (קובץ − MAGIC)'}
          </div>
          <div className="text-3xl font-bold">{activeTotals.delta.toLocaleString()} ₪</div>
        </div>
      </div>

      {/* filters row */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 mb-4 items-end">
        {/* בחר סוכן */}
        <div>
          <label className="block mb-1 font-semibold">בחר סוכן:</label>
          <select value={selectedAgentId} onChange={handleAgentChange} className="select-input w-full">
            {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
            {agents.map(a => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* בחר חברה */}
        <div>
          <label className="block mb-1 font-semibold">בחר חברה (רשות):</label>
          <select value={company} onChange={e => setCompany(e.target.value)} className="select-input w-full">
            <option value="">כל החברות</option>
            {availableCompanies.map((c, i) => (
              <option key={i} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* חודש דיווח */}
        <div>
          <label className="block mb-1 font-semibold">חודש דיווח (קובץ):</label>
          <input
            type="month"
            value={reportMonth}
            onChange={e => setReportMonth(e.target.value)}
            className="input w-full"
          />
        </div>

        {/* תא משפחתי */}
        <div className="flex items-center h-full">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={includeFamily} onChange={e => setIncludeFamily(e.target.checked)} />
            תא משפחתי
          </label>
        </div>

        {/* מתג פיצול עמלות */}
        <div className="flex items-center h-full">
          <div className="flex bg-blue-100 rounded-full p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setSplitEnabled(false)}
              className={`px-3 py-0.5 rounded-full transition-all duration-200 ${
                !splitEnabled ? 'bg-white text-blue-800 font-bold' : 'text-gray-500'
              }`}
            >
              ללא פיצול עמלות
            </button>
            <button
              type="button"
              onClick={() => setSplitEnabled(true)}
              className={`px-3 py-0.5 rounded-full transition-all duration-200 ${
                splitEnabled ? 'bg-white text-blue-800 font-bold' : 'text-gray-500'
              }`}
            >
              עם פיצול עמלות
            </button>
          </div>
        </div>
      </div>

      {/* search / status / export + ספי סטייה */}
      {hasActiveData && (
        <div className="flex flex-col sm:flex-row gap-3 mb-4 items-end">
          <input
            type="text"
            placeholder="חיפוש לפי מס׳ פוליסה / ת״ז"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input w-full sm:w-1/3 text-right"
          />

          {/* Sales-only agentCode */}
          {viewMode === 'sales' && (
            <select
              value={agentCodeFilter}
              onChange={e => setAgentCodeFilter(e.target.value)}
              className="select-input w-full sm:w-1/3"
            >
              <option value="">מס׳ סוכן (מהקובץ)</option>
              {agentCodes.map(code => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          )}

          {/* status filter per tab */}
          {viewMode === 'sales' ? (
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as Status | '')}
              className="select-input w-full sm:w-1/3"
            >
              {statusOptions.map(s => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={contractStatusFilter}
              onChange={e => setContractStatusFilter(e.target.value as ContractStatus | '')}
              className="select-input w-full sm:w-1/3"
            >
              {contractStatusOptions.map(s => (
                <option key={String(s.value)} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          )}

          {/* tolerances + export */}
          <div className="flex items-end gap-3 w-full sm:w-auto">
            <div className="w-40">
              <label className="block mb-1 text-xs font-medium">סף סטייה בסכום (₪)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={toleranceAmount}
                onChange={e => setToleranceAmount(Number(e.target.value) || 0)}
                className="input h-9 px-2 w-full text-right text-sm"
                placeholder="למשל 5"
              />
            </div>

            <div className="w-44">
              <label className="block mb-1 text-xs font-medium">סף סטייה באחוזים (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={tolerancePercent}
                onChange={e => setTolerancePercent(Number(e.target.value) || 0)}
                className="input h-9 px-2 w-full text-right text-sm"
                placeholder="למשל 0.3"
                title="מחושב יחסית לסכום המדווח בקובץ"
              />
            </div>

            <button
              onClick={() => (viewMode === 'sales' ? handleExportSales() : handleExportContracts())}
              className="h-9 w-9 rounded border bg-white hover:bg-gray-50 inline-flex items-center justify-center"
              title="ייצוא לאקסל"
            >
              <img src="/static/img/excel-icon.svg" alt="" className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {/* סיכום לפי סטטוס */}
      {hasActiveData && (
        <>
          <h2 className="text-xl font-bold mb-2">סיכום לפי סטטוס</h2>
          <table className="w-full text-sm border mb-6">
            <thead>
              <tr className="bg-gray-300 text-right font-bold">
                <th className="border p-2">סטטוס</th>
                <th className="border p-2">כמות</th>
              </tr>
            </thead>
            <tbody>
              {viewMode === 'sales'
                ? statusOptions
                    .filter(s => s.value && (statusSummary as any)[s.value as Status])
                    .map(s => (
                      <tr
                        key={s.value}
                        className="hover:bg-gray-100 cursor-pointer"
                        onClick={() => setDrillStatus(s.value as Status)}
                      >
                        <td className="border p-2">{s.label}</td>
                        <td className="border p-2 text-center text-blue-600 underline">
                          {filtered.reduce((acc, r) => (r.status === s.value ? acc + 1 : acc), 0)}
                        </td>
                      </tr>
                    ))
                : contractStatusOptions
                    .filter(s => s.value && (contractStatusSummary as any)[s.value as ContractStatus])
                    .map(s => (
                      <tr
                        key={String(s.value)}
                        className="hover:bg-gray-100 cursor-pointer"
                        onClick={() => setContractDrillStatus(s.value as ContractStatus)}
                      >
                        <td className="border p-2">{s.label}</td>
                        <td className="border p-2 text-center text-blue-600 underline">
                          {filteredContracts.reduce((acc, r) => (r.status === s.value ? acc + 1 : acc), 0)}
                        </td>
                      </tr>
                    ))}
            </tbody>
          </table>

          {viewMode === 'sales'
            ? !drillStatus && <p className="text-gray-500">אפשר ללחוץ על סטטוס להצגת פירוט.</p>
            : !contractDrillStatus && <p className="text-gray-500">אפשר ללחוץ על סטטוס להצגת פירוט.</p>}
        </>
      )}

      {/* SALES TABLE */}
      {viewMode === 'sales' && !isLoading && visibleRows.length > 0 && (
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
                <tr
                  key={`${r.company}|${r.policyNumber}|${r.agentCode || ''}|${r.customerId || ''}`}
                  className={salesRowClass(r.status)}
                >
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

      {viewMode === 'sales' && isLoading && <p className="text-gray-500 mt-4">טוען נתונים…</p>}

      {/* CONTRACTS TABLE */}
      {viewMode === 'contracts' && (
        <>
          {contractsError && (
            <div className="bg-red-100 border border-red-300 text-red-800 p-3 rounded mb-3">{contractsError}</div>
          )}

          {contractsLoading ? (
            <p className="text-gray-500 mt-4">טוען נתונים…</p>
          ) : visibleContractRows.length > 0 ? (
            <div className="mt-2 overflow-x-auto">
              {contractDrillStatus && (
                <button
                  className="mb-4 px-4 py-2 bg-gray-500 text-white rounded"
                  onClick={() => setContractDrillStatus(null)}
                >
                  חזור לכל הסטטוסים
                </button>
              )}

              <h2 className="text-xl font-bold mb-2">
                פירוט {contractDrillStatus ? `— ${contractStatusOptions.find(s => s.value === contractDrillStatus)?.label}` : ''} ({visibleContractRows.length} שורות)
              </h2>

              <table className="w-full border text-sm rounded-lg overflow-hidden">
                <thead>
                  <tr className="bg-gray-100 text-right">
                    <th className="border p-2">חברה</th>
                    <th className="border p-2">מס׳ פוליסה</th>
                    <th className="border p-2">ת״ז</th>
                    <th className="border p-2">מוצר (Raw)</th>
                    <th className="border p-2">מוצר (Canonical)</th>
                    <th className="border p-2 text-center">פרמיה</th>
                    <th className="border p-2 text-center bg-sky-50">עמלה (קובץ)</th>
                    <th className="border p-2 text-center bg-emerald-50">עמלה צפויה</th>
                    <th className="border p-2 text-center">Δ ₪</th>
                    <th className="border p-2 text-center bg-sky-50">% עמלה (קובץ)</th>
                    <th className="border p-2 text-center bg-emerald-50">% עמלה (הסכם)</th>
                    <th className="border p-2 text-center">Δ %</th>
                    <th className="border p-2">סטטוס</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleContractRows.map(r => (
                    <tr
                      key={`${r.company}|${r.policyNumber}|${r.customerId || ''}|${r.templateId || ''}|${r.productRaw || ''}`}
                      className={contractsRowClass(r.status)}
                    >
                      <td className="border p-2">{r.company}</td>
                      <td className="border p-2">{r.policyNumber || '-'}</td>
                      <td className="border p-2">{r.customerId ?? '-'}</td>
                      <td className="border p-2">{r.productRaw || '-'}</td>
                      <td className="border p-2">{r.canonicalProduct || '-'}</td>
                      <td className="border p-2 text-center">{Number(r.premiumAmount || 0).toFixed(2)}</td>
                      <td className="border p-2 text-center bg-sky-50">{Number(r.reportedCommissionAmount || 0).toFixed(2)}</td>
                      <td className="border p-2 text-center bg-emerald-50">{Number(r.expectedAmount || 0).toFixed(2)}</td>
                      <td className="border p-2 text-center">{Number(r.amountDiff || 0).toFixed(2)}</td>
                      <td className="border p-2 text-center bg-sky-50">
  {Number(r.reportedRate || 0).toFixed(2)}%
</td>

<td className="border p-2 text-center bg-emerald-50">
  {Number(r.contractRate || 0).toFixed(2)}%
</td>

<td className="border p-2 text-center">
  {Number(r.rateDiff || 0).toFixed(2)}%
</td>
                      <td className="border p-2 font-bold">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="text-xs text-gray-500 mt-2">
                fallbackProduct: {mappingHints.usedFallbackProductCount} | no_template: {mappingHints.noTemplateCount} | no_contract: {mappingHints.noContractCount}
              </div>

              {/* legend */}
              <div className="flex gap-3 text-xs mt-3">
                <span className="inline-flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-emerald-200 inline-block" /> תקין
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-amber-200 inline-block" /> פער
                </span>
                <span className="inline-flex items-center gap-2">
                  <span className="w-3 h-3 rounded bg-rose-200 inline-block" /> חסר חוזה / תבנית
                </span>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 mt-4">אין נתונים להצגה.</p>
          )}
        </>
      )}

      {/* link dialog */}
      {linkOpen && linkTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow p-4 w-full max-w-xl" dir="rtl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold">קישור פוליסה מהקובץ לפוליסה במערכת</h3>
              <button
                onClick={() => setLinkOpen(false)}
                className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <div>
                <b>חברה:</b> {linkTarget.company}
              </div>
              <div>
                <b>מס׳ פוליסה (קובץ):</b> {String(linkTarget.policyNumber || '-')}
              </div>
              {linkTarget.customerId && (
                <div>
                  <b>ת״ז לקוח (מהקובץ):</b> {linkTarget.customerId}
                </div>
              )}

              <div className="mt-2">
                <label className="block mb-1">בחרי פוליסה במערכת (ללא מספר):</label>
                <select
                  className="select-input w-full"
                  value={selectedCandidateId}
                  onChange={e => setSelectedCandidateId(e.target.value)}
                >
                  {linkCandidates.length === 0 && <option value="">לא נמצאו מועמדות מתאימות</option>}
                  {linkCandidates.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.summary}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button
                className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300"
                onClick={() => setLinkOpen(false)}
                disabled={linkSaving}
              >
                ביטול
              </button>

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
