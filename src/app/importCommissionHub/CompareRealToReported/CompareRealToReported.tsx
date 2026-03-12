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
import useFetchMD from '@/hooks/useMD';

/* ---------- types ---------- */

type ExternalCommissionRow = {
  policyNumber: string | number;
  commissionAmount: number;
  company: string;
  product?: string;
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
  { value: 'unchanged', label: 'לתקין / בטווח סטייה' },
  { value: 'changed', label: 'פער הדורש בדיקה' },
  { value: 'not_reported', label: 'לא דווח בקובץ' },
  { value: 'not_found', label: 'אין מכירה במערכת' },
] as const;

/* ---------- helpers ---------- */


const canon = (v?: string | null) => String(v ?? '').trim();

/* ---------- ID (ת"ז) helpers: canonical + variants ---------- */
const digitsOnly = (v: any) => String(v ?? '').replace(/\D/g, '');
const stripLeadingZeros = (s: string) => s.replace(/^0+/, '') || '';
const canonId = (v: any) => stripLeadingZeros(digitsOnly(v));           // "2231578"
const toPadded9Local = (v: any) => {
  const c = canonId(v);
  if (!c) return '';
  return c.padStart(9, '0');                                            // "022315780"
};
const idVariants = (v: any) => {
  const c = canonId(v);
  const p = toPadded9Local(v);
  return Array.from(new Set([c, p].filter(Boolean)));
};

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
  const lockedVariants = idVariants(lockedCustomerId);

  const cq = query(
    collection(db, 'customer'),
    where('AgentId', '==', dbAgentId),
    where('IDCustomer', 'in', lockedVariants as any)
  );
  const cSnap = await getDocs(cq);
  const parent = cSnap.docs[0]?.data()?.parentID;

  // אם לא מצאנו parent, נחזיר את כל הווריאנטים כדי שה-IN על מכירות/קובץ יתפוס
  if (!parent) return Array.from(new Set(lockedVariants));

  const familyQ = query(
    collection(db, 'customer'),
    where('AgentId', '==', dbAgentId),
    where('parentID', '==', parent)
  );
  const fSnap = await getDocs(familyQ);

  const idsRaw = fSnap.docs.map(d => (d.data() as any).IDCustomer).filter((x): x is string => Boolean(x));

  // חשוב: להרחיב ולרפד כדי שנתפוס גם 7/8 ספרות וגם 9 ספרות
  const idsExpanded = Array.from(new Set(idsRaw.flatMap(idVariants).map(toPadded9Local))).filter(Boolean);

  return idsExpanded.length ? idsExpanded : Array.from(new Set(lockedVariants.map(toPadded9Local))).filter(Boolean);
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
      canonId(c.IDCustomer || '') === canonId(cid) &&
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

//   const isAdmin = detail?.role === 'admin';
// const canSeeContractsTab = isAdmin; // ✅ רק אדמין

const ENABLE_CONTRACTS_COMPARE = true; // ⛔ כרגע כבוי בייצור

const canSeeContractsTab = ENABLE_CONTRACTS_COMPARE;


  // UI/filters
  const [company, setCompany] = useState<string>('');
  const [reportMonth, setReportMonth] = useState<string>('');
  const [includeFamily, setIncludeFamily] = useState<boolean>(false);
  const [splitEnabled, setSplitEnabled] = useState<boolean>(false);

  const [availableCompanies, setAvailableCompanies] = useState<string[]>([]);
const [rawSalesRows, setRawSalesRows] = useState<ComparisonRow[]>([]);
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


const rows = useMemo(() => {
  return rawSalesRows.map(r => {
    // אם הפוליסה לא נמצאה בכלל, אין מה לבדוק סטייה
    if (r.status === 'not_found' || r.status === 'not_reported') return r;

    const diffVal = Math.abs(r.diff);
    const diffPercVal = r.diffPercent;

    // כאן קורה הקסם: בדיקה מול הספים שהזנת בתיבות
    const isWithinTolerance = diffVal <= toleranceAmount || diffPercVal <= tolerancePercent;
    
    return {
      ...r,
      status: (isWithinTolerance ? 'unchanged' : 'changed') as Status
    };
  });
}, [rawSalesRows, toleranceAmount, tolerancePercent]);



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
          const ids = includeFamily
          ? await getFamilyIds(selectedAgentId, lockedCustomerId)
          : idVariants(lockedCustomerId);
        
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
          
          /** ✅ fallback שקט: אם לא מצאנו כלום — ננסה גם על פורמט חלופי */
          if (out.length === 0) {
            const altIds = Array.from(new Set(ids.flatMap(idVariants).map(toPadded9Local))).filter(Boolean);
          
            const altChunks: string[][] = [];
            for (let i = 0; i < altIds.length; i += 10) altChunks.push(altIds.slice(i, i + 10));
          
            for (const chunk of altChunks) {
              const qCust2 = query(
                collection(db, 'customer'),
                where('AgentId', '==', selectedAgentId),
                where('IDCustomer', 'in', chunk as any)
              );
              const snap2 = await getDocs(qCust2);
              snap2.docs.forEach(d => out.push(d.data()));
            }
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
      setRawSalesRows([]);
      return;
    }
    setIsLoading(true);

    // family scope (when locked to customer)
  // family scope (when locked to customer)
let scopeCustomerIds: string[] | null = null;
if (lockedToCustomer) {
  const baseIds = includeFamily
    ? await getFamilyIds(selectedAgentId, lockedCustomerId)
    : idVariants(lockedCustomerId);

  // מרחיבים + מרפדים ל-9 ספרות (כדי שתמיד נתפוס גם "2231578" וגם "022315780")
  scopeCustomerIds = Array.from(new Set(baseIds.flatMap(idVariants).map(toPadded9Local)))
    .filter(Boolean);
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
            product: (raw as any).product || (raw as any).productRaw || 'מוצר לא מזוהה',
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
          const cid = toPadded9Local(raw.customerId ?? raw.IDCustomer);
          if (!famSet.has(cid)) return;
          
          const comp = canon(raw.company);
          const pol = normPolicy(raw.policyNumberKey ?? raw.policyNumber);
          extRows.push({
            policyNumber: pol,
            commissionAmount: Number(raw.totalCommissionAmount ?? 0),
            company: comp,
            product: (raw as any).product || (raw as any).productRaw || 'מוצר לא מזוהה',
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
          product: (raw as any).product || (raw as any).productRaw || 'מוצר לא מזוהה',
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
          const cid = toPadded9Local(raw.customerId ?? raw.IDCustomer);
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
          product: (reported as any).product || (reported as any).productRaw || 'מוצר לא מזוהה',
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
          product: productForDisplay || (reported as any).product || 'מוצר לא מזוהה',
          _rawKey: key,
          _extRow: reported,
        });
      }
    }

setRawSalesRows(computed);
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

      if (ext.customerId) {
        const cidSale = canonId(s.customerId || s.IDCustomer || '');
        const cidExt = canonId(ext.customerId || '');
        if (cidSale && cidExt && cidSale !== cidExt) return;
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
  const summary = { unchanged: 0, changed: 0, not_found: 0, not_reported: 0 };
  
  // רק אם אנחנו בלשונית מכירות, נחשב את הסטטוסים האלו
  if (viewMode === 'sales') {
    rows.forEach(r => {
      if (summary[r.status] !== undefined) summary[r.status]++;
    });
  }
  return summary;
}, [rows, viewMode]);

  
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

// ✅ הוספת סיכום ייעודי ללשונית חוזים
const contractStatusSummary = useMemo(() => {
  const summary = { ok: 0, diff: 0, no_contract: 0, no_template: 0 };
  
  if (viewMode === 'contracts') {
    contractRows.forEach(r => {
      if (summary[r.status] !== undefined) summary[r.status]++;
    });
  }
  return summary;
}, [contractRows, viewMode]);

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

const insights = useMemo(() => {
  // חישובים עבור טאב החוזים בלבד
  const diffRows = contractRows.filter(r => r.status === 'diff');
  const noContractRows = contractRows.filter(r => r.status === 'no_contract');
  
  // חישוב החברה הכי בעייתית (לפי סך פער כספי)
  const companySums = diffRows.reduce((acc, r) => {
    acc[r.company] = (acc[r.company] || 0) + Math.abs(r.amountDiff);
    return acc;
  }, {} as Record<string, number>);
  
  const worstCompany = Object.entries(companySums).sort((a, b) => b[1] - a[1])[0];

  return {
    totalLostMoney: diffRows.reduce((sum, r) => sum + (r.amountDiff < 0 ? Math.abs(r.amountDiff) : 0), 0),
    worstCompanyName: worstCompany?.[0] || 'אין חריגות',
    noContractCount: noContractRows.length,
    diffCount: diffRows.length,
    okCount: contractRows.filter(r => r.status === 'ok').length
  };
}, [contractRows]);


  const {
    productGroupsDB, 
  } = useFetchMD();

  
const getGroupName = (id?: string) => {
  if (!id) return 'ללא קבוצה';
  return productGroupsDB.find(g => g.id === id)?.name || `קבוצה ${id}`;
};



  /* ---------- UI ---------- */
return (
    <div className="p-6 max-w-7xl mx-auto text-right bg-slate-50 min-h-screen" dir="rtl">
      
      {/* --- Header & View Switcher --- */}
      <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 text-right">השוואת טעינת עמלות</h1>
          <p className="text-sm text-slate-500 mt-1 text-right">ניהול ובקרת הפרשים בין קבצי חברה למערכת MAGIC והסכמי סוכן</p>
        </div>

        <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100 p-1 gap-1">
          <button
            onClick={() => { setViewMode('sales'); setDrillStatus(null); }}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'sales' ? 'bg-white text-blue-700 shadow-md' : 'text-slate-500 hover:text-blue-600'}`}
          >
            השוואה מול Magic
          </button>
          <button
            onClick={() => { setViewMode('contracts'); setContractDrillStatus(null); }}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${viewMode === 'contracts' ? 'bg-white text-blue-700 shadow-md' : 'text-slate-500 hover:text-blue-600'}`}
          >
            השוואה מול הסכם
          </button>
        </div>
        
        {canGoBack && (
          <button onClick={handleBackToCustomer} className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg border border-slate-200 transition">
            ← חזרה ללקוח
          </button>
        )}
      </div>

      {/* --- Unified Filters Area --- */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6 text-right">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-end">
          <div className="text-right">
            <label className="block mb-1 text-xs font-bold text-slate-600 text-right">בחר סוכן</label>
            <select value={selectedAgentId} onChange={handleAgentChange} className="select-input w-full bg-slate-50 border-slate-200 text-right">
              {detail?.role === 'admin' && <option value="">כל הסוכנים</option>}
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="text-right">
            <label className="block mb-1 text-xs font-bold text-slate-600 text-right">חברה</label>
            <select value={company} onChange={e => setCompany(e.target.value)} className="select-input w-full bg-slate-50 border-slate-200 text-right">
              <option value="">כל החברות</option>
              {availableCompanies.map((c, i) => <option key={i} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="text-right">
            <label className="block mb-1 text-xs font-bold text-slate-600 text-right">חודש דיווח</label>
            <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className="input w-full bg-slate-50 border-slate-200 text-right" />
          </div>
          <div className="flex flex-col gap-2 pb-1 text-right">
             <label className="inline-flex items-center gap-2 cursor-pointer text-sm font-medium text-slate-700">
               <input type="checkbox" checked={includeFamily} onChange={e => setIncludeFamily(e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500" />
               תא משפחתי
             </label>
             <div className="flex bg-slate-100 rounded-lg p-0.5 text-[10px] border border-slate-200">
                <button onClick={() => setSplitEnabled(false)} className={`flex-1 py-1 px-2 rounded-md transition ${!splitEnabled ? 'bg-white shadow-sm font-bold text-blue-700' : 'text-slate-500'}`}>ללא פיצול</button>
                <button onClick={() => setSplitEnabled(true)} className={`flex-1 py-1 px-2 rounded-md transition ${splitEnabled ? 'bg-white shadow-sm font-bold text-blue-700' : 'text-slate-500'}`}>עם פיצול</button>
             </div>
          </div>
          <div className="flex gap-2 text-right">
             <div className="flex-1 text-right">
                <label className="block mb-1 text-[10px] font-bold text-slate-500 text-right">סף סטייה (₪)</label>
                <input type="number" step="0.01" value={toleranceAmount} onChange={e => setToleranceAmount(Number(e.target.value))} className="input w-full bg-slate-50 border-slate-200 h-9 text-xs text-right" />
             </div>
             <div className="flex-1 text-right">
                <label className="block mb-1 text-[10px] font-bold text-slate-500 text-right">סף סטייה (%)</label>
                <input type="number" step="0.01" value={tolerancePercent} onChange={e => setTolerancePercent(Number(e.target.value))} className="input w-full bg-slate-50 border-slate-200 h-9 text-xs text-right" />
             </div>
          </div>
        </div>
      </div>

   {/* --- שורת סיכום כספי (KPIs) --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        
        {/* 1. מה שנטען מהקובץ */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border-b-4 border-sky-500 transition-transform hover:scale-[1.01]">
          <div className="text-slate-500 text-xs mb-1 text-right font-bold">סך עמלה בקובץ (חברה)</div>
          <div className="text-3xl font-black text-sky-700 text-right">
            {activeTotals.reported.toLocaleString()} ₪
          </div>
          <div className="text-[10px] text-slate-400 mt-2 text-right italic">
            סך הכל כפי שדווח על ידי חברות הביטוח
          </div>
        </div>

        {/* 2. מה שהיה אמור להיות (Magic / הסכם) */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border-b-4 border-emerald-500 transition-transform hover:scale-[1.01]">
          <div className="text-slate-500 text-xs mb-1 text-right font-bold">
            {viewMode === 'contracts' ? 'סך עמלה לפי הסכם' : 'סך עמלה צפויה (Magic)'}
          </div>
          <div className="text-3xl font-black text-emerald-700 text-right">
            {activeTotals.expected.toLocaleString()} ₪
          </div>
          <div className="text-[10px] text-slate-400 mt-2 text-right italic">
            הסכום המחושב במערכת {viewMode === 'contracts' ? 'מול ההסכמים' : 'מול נתוני המכירות'}
          </div>
        </div>

        {/* 3. הפער הסופי */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border-b-4 border-rose-500 transition-transform hover:scale-[1.01]">
          <div className="text-slate-500 text-xs mb-1 text-right font-bold">פער כספי</div>
          <div className="text-3xl font-black text-rose-600 text-right">
            {activeTotals.delta.toLocaleString()} ₪
          </div>
          <div className="text-[10px] text-slate-400 mt-2 text-right italic">
             {activeTotals.delta < 0 ? 'חוסר בעמלה לטובת הסוכן' : 'עודף עמלה בקובץ'}
          </div>
        </div>
      </div>
{/* --- שורת סטטיסטיקה משנית (ציון תקינות וחריגות) --- */}
<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
  
  {/* 1. כרטיסיית תקינות - עובדת נכון ✅ */}
  <div className="bg-white py-4 px-6 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center">
    <span className="text-slate-500 text-xs font-bold">ציון תקינות דוח:</span>
    <span className="text-xl font-black text-emerald-600">
      {viewMode === 'contracts' 
        ? (contractRows.length > 0 ? Math.round((contractStatusSummary.ok / contractRows.length) * 100) : 0)
        : (rows.length > 0 ? Math.round((statusSummary.unchanged / rows.length) * 100) : 0)
      }%
    </span>
  </div>

  {/* 2. כרטיסיית מוקד חריגה - עודכן להיות דינמי ⚡ */}
  <div className="bg-white py-4 px-6 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center">
    <span className="text-slate-500 text-xs font-bold text-right">מוקד חריגה מרכזי:</span>
    <span className="text-sm font-black text-rose-600 truncate max-w-[150px]">
      {viewMode === 'contracts' 
        ? (contractStatusSummary.diff > 0 ? (company || 'חברות מרובות') : 'אין חריגות')
        : (statusSummary.changed > 0 ? (company || 'חברות מרובות') : 'אין חריגות')
      }
    </span>
  </div>

  {/* 3. כרטיסיית הפעולה - עובדת נכון ✅ */}
  <div 
    onClick={() => viewMode === 'contracts' ? setContractStatusFilter('diff') : setStatusFilter('changed')}
    className="bg-rose-50 py-4 px-6 rounded-2xl shadow-sm border border-rose-100 flex justify-between items-center cursor-pointer hover:bg-rose-100 transition-colors"
  >
    <span className="text-rose-700 text-xs font-bold">
      {viewMode === 'contracts' ? 'פוליסות עם פער עמלה מול חוזה:' : 'פוליסות עם פער כספי (לטיפול):'}
    </span>
    <span className="text-2xl font-black text-rose-600">
       {viewMode === 'contracts' ? (contractStatusSummary.diff || 0) : (statusSummary.changed || 0)}
    </span>
  </div>
</div>

      {/* --- Main Table Container --- */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between gap-4">
          
          <div className="flex items-center gap-3 flex-grow text-right">
            {/* 1. חיפוש רחב */}
            <div className="relative flex-grow max-w-2xl text-right">
              <input 
                type="text" 
                placeholder="חיפוש לפי פוליסה או ת״ז..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)}
                className="input w-full pr-10 pl-4 bg-white border-slate-200 rounded-xl text-sm h-10 shadow-sm text-right"
              />
              <span className="absolute right-3 top-2.5 opacity-30 text-lg">🔍</span>
            </div>

            {/* 2. קוד סוכן קצר */}
            {viewMode === 'sales' && (
              <select
                value={agentCodeFilter}
                onChange={e => setAgentCodeFilter(e.target.value)}
                className="select-input bg-white border-slate-200 rounded-xl text-xs w-40 h-10 shadow-sm text-right"
              >
                <option value="">קוד סוכן (בקובץ)</option>
                {agentCodes.map(code => <option key={code} value={code}>{code}</option>)}
              </select>
            )}

            {/* 3. סטטוס קצר */}
            <select 
                value={viewMode === 'contracts' ? contractStatusFilter : statusFilter} 
                onChange={e => viewMode === 'contracts' ? setContractStatusFilter(e.target.value as any) : setStatusFilter(e.target.value as any)}
                className="select-input bg-white border-slate-200 rounded-xl text-xs w-40 h-10 shadow-sm text-right"
            >
                {viewMode === 'contracts' 
                  ? contractStatusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)
                  : statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)
                }
            </select>
          </div>

          {/* 4. ייצוא אקסל בקצה */}
          <div className="flex-shrink-0 text-right">
            <button 
              onClick={() => viewMode === 'sales' ? handleExportSales() : handleExportContracts()} 
              className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition shadow-md whitespace-nowrap active:scale-95"
            >
              <img src="/static/img/excel-icon.svg" alt="" className="w-5 h-5 invert" />
              ייצוא אקסל
            </button>
          </div>
        </div>

        {/* Tables */}
        <div className="overflow-x-auto text-right">
          {isLoading || contractsLoading ? (
            <div className="p-20 text-center text-slate-400 italic font-medium text-right">טוען נתונים מהמערכת...</div>
          ) : viewMode === 'sales' ? (
            <table className="w-full text-sm text-right border-collapse">
               <thead>
                <tr className="bg-slate-50 text-slate-600 border-b text-right font-bold">
                  <th className="p-3 text-right">חברה</th>
                  <th className="p-3 text-right">פוליסה / לקוח</th>
                  <th className="p-3 text-right">מוצר</th>
                  <th className="p-3 text-center bg-sky-50/50 text-sky-900">קובץ</th>
                  <th className="p-3 text-center bg-emerald-50/50 text-emerald-900">Magic</th>
                  <th className="p-3 text-center text-rose-600">פער Δ</th>
                  <th className="p-3 text-right text-right">סטטוס</th>
                  <th className="p-3 text-center">פעולה</th>
                </tr>
              </thead>
              <tbody className="divide-y text-right">
                {visibleRows.map((r, idx) => (
                  <tr key={`${r.company}-${idx}`} className={`hover:bg-slate-50 transition-colors ${salesRowClass(r.status)} text-right`}>
                    <td className="p-3 font-medium text-slate-900 text-right">{r.company}</td>
                    <td className="p-3 text-right">
                        <div className="font-bold text-slate-800 text-right">{r.policyNumber}</div>
                        <div className="text-[10px] opacity-60 font-medium text-right">{r.customerId}</div>
                    </td>
                    <td className="p-3 text-slate-700 text-right">{r.product || '-'}</td>
                    <td className="p-3 text-center bg-sky-50/20 font-bold text-sky-900">{r.reportedAmount.toFixed(2)}</td>
                    <td className="p-3 text-center bg-emerald-50/20 font-bold text-emerald-900">{r.magicAmount.toFixed(2)}</td>
                    <td className="p-3 text-center font-bold text-rose-600 border-x border-rose-100/50">{r.diff.toFixed(2)}</td>
                    <td className="p-3 font-bold text-[11px] whitespace-nowrap text-right">
                        {statusOptions.find(o => o.value === r.status)?.label}
                    </td>
                    <td className="p-3 text-center">
                        {r.status === 'not_found' && r._extRow && (
                            <button 
                                onClick={() => openLinkDialog(r)}
                                className="bg-blue-600 text-white text-[10px] px-3 py-1.5 rounded-lg hover:bg-blue-700 shadow-sm transition font-bold"
                            >
                                קישור לפוליסה
                            </button>
                        )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            /* טבלת החוזים */
            <table className="w-full text-sm text-right border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b text-right">
                  <th className="p-3 font-semibold text-right">פרטי פוליסה</th>
                  <th className="p-3 font-semibold text-right">זיהוי מוצר</th>
                  <th className="p-3 font-semibold text-center bg-sky-50/50 text-sky-900 font-bold">קובץ</th>
                  <th className="p-3 font-semibold text-center bg-emerald-50/50 text-emerald-900 font-bold">הסכם</th>
                  <th className="p-3 font-semibold text-center text-rose-600">פער Δ</th>
                  <th className="p-3 font-semibold text-right">סטטוס</th>
                </tr>
              </thead>
              <tbody className="divide-y text-right">
                {visibleContractRows.map((r, idx) => (
                  <tr key={`${r.policyNumber}-${idx}`} className={`hover:bg-slate-50 transition-colors ${contractsRowClass(r.status)} text-right`}>
                    <td className="p-3 text-right">
                      <div className="font-bold text-slate-800 text-right">{r.company}</div>
                      <div className="text-xs text-slate-500 text-right">{r.policyNumber}</div>
                      <div className="text-[11px] text-blue-600 mt-1 font-medium italic text-right">{r.customerId}</div>
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex flex-col text-right">
                        <span className="font-bold text-slate-900 text-right">{r.canonicalProduct || '---'}</span>
                        <span className="text-[10px] text-slate-500 font-bold italic text-right">קבוצה: {getGroupName(r.productGroup)}</span>
                        <div className="flex items-center gap-1 mt-1 justify-end">
                          {r.debug?.usedFallbackProduct && <span className="bg-amber-100 text-amber-700 text-[8px] px-1 rounded font-black border border-amber-200">FALLBACK</span>}
                          <span className="text-[10px] text-slate-400 italic truncate max-w-[120px]" title={r.productRaw}>מקור: {r.productRaw}</span>
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-center bg-sky-50/20">
                      <div className="font-bold text-sky-900 text-right">{r.reportedCommissionAmount.toFixed(2)} ₪</div>
                      <div className="text-[10px] text-sky-600 font-medium text-right">פרמיה: {r.premiumAmount.toLocaleString()}</div>
                      <div className="text-[10px] bg-sky-100 text-sky-700 rounded px-1 mt-1 inline-block font-bold border border-sky-200 text-right">{r.reportedRate.toFixed(2)}%</div>
                    </td>
                    <td className="p-3 text-center bg-emerald-50/20">
                      <div className="font-bold text-emerald-900 text-right">{r.expectedAmount.toFixed(2)} ₪</div>
                      <div className="text-[10px] text-emerald-600 font-bold italic text-right">הסכם: {r.contractRate.toFixed(2)}%</div>
                    </td>
                 <td className="p-3 text-center">
  <div className={`font-black text-sm ${
    r.amountDiff < 0 
      ? 'text-rose-600'  // חוסר - חברת הביטוח חייבת כסף לסוכן
      : r.amountDiff > 0 
        ? 'text-amber-600' // עודף - הסוכן קיבל יותר מההסכם
        : 'text-slate-700'  // תקין בדיוק
  }`}>
    {r.amountDiff.toFixed(2)} ₪
  </div>
  <div className="text-[10px] opacity-60 font-bold">
    {r.rateDiff.toFixed(2)}%
  </div>
</td>
               <td className="p-3 text-right">
                      <div className="flex flex-col gap-1 items-start text-right">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-center border shadow-sm ${
                            r.status === 'ok' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                            r.status === 'diff' ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-rose-100 text-rose-700 border-rose-200'
                        }`}>{r.status === 'ok' ? 'תקין' : r.status === 'diff' ? 'פער' : 'חסר הסכם'}</span>
                        {r.status === 'no_contract' && (
                            <button onClick={() => window.open(`/contracts?agentId=${selectedAgentId}&company=${r.company}&product=${r.canonicalProduct}`, '_blank')} className="text-[10px] text-blue-600 underline font-black mt-1 hover:text-blue-800 transition">הגדר +</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Global Dialogs */}
      {linkOpen && linkTarget && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 backdrop-blur-sm p-4">
             <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-xl text-right" dir="rtl">
                <div className="flex items-center justify-between mb-4 text-right">
                  <h3 className="text-xl font-bold text-slate-800 text-right">קישור פוליסה מהקובץ ל-MAGIC</h3>
                  <button onClick={() => setLinkOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition text-slate-400">✕</button>
                </div>
                <div className="space-y-4 text-right">
                  <div className="p-4 bg-slate-50 rounded-xl text-sm border border-slate-100 text-right">
                    <div className="mb-1 text-right"><b>חברה:</b> {linkTarget.company}</div>
                    <div className="mb-1 text-right"><b>מס׳ פוליסה בקובץ:</b> {String(linkTarget.policyNumber || '-')}</div>
                    {linkTarget.customerId && <div className="text-right"><b>ת״ז לקוח:</b> {linkTarget.customerId}</div>}
                  </div>
                  <div className="text-right">
                    <label className="block text-sm font-bold text-slate-700 mb-2 text-right">בחרי פוליסה קיימת לקישור:</label>
                    <select
                      className="select-input w-full bg-slate-50 border-slate-200 rounded-xl shadow-sm text-right h-11"
                      value={selectedCandidateId}
                      onChange={e => setSelectedCandidateId(e.target.value)}
                    >
                      {linkCandidates.length === 0 && <option value="">לא נמצאו פוליסות מועמדות</option>}
                      {linkCandidates.map(c => <option key={c.id} value={c.id}>{c.summary}</option>)}
                    </select>
                  </div>
                </div>
                <div className="mt-8 flex gap-3 justify-end font-bold text-right">
                   <button onClick={() => setLinkOpen(false)} className="px-6 py-2.5 text-slate-500 hover:bg-slate-100 rounded-xl transition">ביטול</button>
                   <button 
                    disabled={!selectedCandidateId || linkSaving}
                    onClick={doLink}
                    className="px-8 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 transition shadow-lg active:scale-95 text-right font-bold"
                   >
                     {linkSaving ? 'מקשר...' : 'קשר פוליסה'}
                   </button>
                </div>
             </div>
          </div>
      )}
    </div>
  );
}
