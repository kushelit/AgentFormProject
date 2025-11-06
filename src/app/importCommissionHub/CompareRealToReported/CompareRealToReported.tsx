// app/importCommissionHub/CompareRealToReported/CompareReportedVsMagic.tsx
'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  updateDoc,
  getDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { useAuth } from '@/lib/firebase/AuthContext';
import { calculateCommissions } from '@/utils/commissionCalculations';
import type { ContractForCompareCommissions } from '@/types/Contract';
import type { SalesToCompareCommissions } from '@/types/Sales';
import * as XLSX from 'xlsx';
import { useSearchParams, useRouter } from 'next/navigation';

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
  diff: number;        // קובץ − MAGIC
  diffPercent: number; // בסיס: הקובץ
  status: Status;
  agentCode?: string;
  customerId?: string;
  product?: string;
  _rawKey?: string;
  _extRow?: ExternalCommissionRow | null;
};

type Product = { productName: string; productGroup: string; isOneTime?: boolean };

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

const parseToYm = (v?: string | null) => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) { const [dd, mm, yyyy] = s.split('.'); return `${yyyy}-${mm}`; }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) { const [dd, mm, yyyy] = s.split('/'); return `${yyyy}-${mm}`; }
  return '';
};

const policyKey = (agentId: string, companyCanon: string, policyNumber: string) =>
  `${agentId}::${companyCanon}::${policyNumber}`;

const percentAgainstReported = (reported: number, magic: number) => {
  const diff = reported - magic; // קובץ − MAGIC
  const base = reported === 0 ? 1 : reported;
  return Math.abs(diff) / base * 100;
};

const matchMinuy = (cMin?: boolean, sMin?: boolean) =>
  cMin === sMin || (cMin === undefined && !sMin);

/* ---------- component ---------- */

export default function CompareReportedVsMagic() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  // בסיס
  const [company, setCompany] = useState('');
  const [reportMonth, setReportMonth] = useState('');
  const [includeFamily, setIncludeFamily] = useState<boolean>(false);

  const [availableCompanies, setAvailableCompanies] = useState<string[]>([]);
  const [rows, setRows] = useState<ComparisonRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // מסננים
  const [searchTerm, setSearchTerm] = useState('');
  const [agentCodeFilter, setAgentCodeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | ''>('');
  const [drillStatus, setDrillStatus] = useState<Status | null>(null);

  // ספי סטייה (נטענים ונשמרים למסמך הסוכן)
  const [toleranceAmount, setToleranceAmount] = useState<number>(0);   // ₪
  const [tolerancePercent, setTolerancePercent] = useState<number>(0); // נק' אחוז
  const saveToleranceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // product map
  const [productMap, setProductMap] = useState<Record<string, Product>>({});

  // "נעילה ללקוח"
  const lockedCustomerId = (searchParams.get('customerId') || '').trim();
  const lockedToCustomer = !!lockedCustomerId;
  const retParam = searchParams.get('returnTo') || '';
  const canGoBack = !!retParam || lockedToCustomer;

  const hydratedOnce = useRef(false);

  const handleBackToCustomer = () => {
    if (!canGoBack) return;
    if (retParam) router.push(decodeURIComponent(retParam));
    else {
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

  /* --- רשימת חברות --- */
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

  /* --- product map לחישובים --- */
  useEffect(() => {
    (async () => {
      const qs = await getDocs(collection(db, 'product'));
      const map: Record<string, Product> = {};
      qs.forEach(d => {
        const p = d.data() as Product;
        map[p.productName] = { productName: p.productName, productGroup: p.productGroup, isOneTime: !!p.isOneTime };
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
            if (typeof t.rate   !== 'undefined') setTolerancePercent(Number(t.rate) || 0);
            if (typeof t.percent!== 'undefined') setTolerancePercent(Number(t.percent) || 0); // תCompat
          }
        }
      } catch {/* ignore */}
    })();
  }, [selectedAgentId]);

  /* --- שמירה אוטומטית (debounce) של הספים --- */
  useEffect(() => {
    if (!selectedAgentId) return;
    if (saveToleranceTimer.current) clearTimeout(saveToleranceTimer.current);
    saveToleranceTimer.current = setTimeout(async () => {
      try {
        await updateDoc(doc(db, 'users', selectedAgentId), {
          comparisonTolerance: { amount: toleranceAmount, rate: tolerancePercent }
        });
      } catch {/* ignore */}
    }, 600);
    return () => { if (saveToleranceTimer.current) clearTimeout(saveToleranceTimer.current); };
  }, [toleranceAmount, tolerancePercent, selectedAgentId]);

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

  /* ---------- FAMILY scope helpers ---------- */
  const fetchFamilyIds = useCallback(async (agentId: string, rootId: string): Promise<string[]> => {
    // מוצא parentID ואז את כל הילדים של אותו parentID
    const cq = query(collection(db, 'customer'), where('AgentId', '==', agentId), where('IDCustomer', '==', rootId));
    const cSnap = await getDocs(cq);
    const parent = cSnap.docs[0]?.data()?.parentID;
    if (!parent) return [rootId];

    const fQ = query(collection(db, 'customer'), where('AgentId', '==', agentId), where('parentID', '==', parent));
    const fSnap = await getDocs(fQ);
    const ids = fSnap.docs.map(d => (d.data() as any).IDCustomer).filter(Boolean);
    const uniq = Array.from(new Set([rootId, ...ids]));
    return uniq.length ? uniq : [rootId];
  }, []);

  const fetchByCustomerIn = useCallback(async <T,>(
    coll: string,
    baseWhere: Array<ReturnType<typeof where>>,
    customerIds: string[],
    map: (d: any, id: string) => T
  ): Promise<T[]> => {
    const out: T[] = [];
    for (let i = 0; i < customerIds.length; i += 10) {
      const chunk = customerIds.slice(i, i + 10);
      const qy = query(collection(db, coll), ...baseWhere, where('customerId', 'in', chunk as any));
      const snap = await getDocs(qy);
      snap.docs.forEach(d => out.push(map(d.data(), d.id)));
    }
    return out;
  }, []);

  /* ---------- FETCH CORE ---------- */
  const fetchData = useCallback(async () => {
    if (!selectedAgentId || !reportMonth) {
      setRows([]);
      return;
    }
    setIsLoading(true);

    // family scope
    let scopeCustomerIds: string[] | null = null;
    if (lockedToCustomer) {
      scopeCustomerIds = includeFamily
        ? await fetchFamilyIds(selectedAgentId, lockedCustomerId)
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
      extRows = await fetchByCustomerIn<ExternalCommissionRow>(
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

      const policyYm = parseToYm(s.month || s.mounth);
      if (!policyYm || policyYm > reportMonth) return;

      // רק סטטוסים תואמים לדף הלקוח (פעילה/הצעה)
      const sp = String(s.statusPolicy ?? s.status ?? '').trim();
      if (!['פעילה', 'הצעה'].includes(sp)) return;

      if (scopeCustomerIds) {
        const cid = String(s.customerId || s.IDCustomer || '').trim();
        if (cid && !scopeCustomerIds!.includes(cid)) return;
      }

      const key = pol ? `${comp}::${pol}` : `${comp}::__NO_POLICY__:${id}`;
      const bucket = salesByKey.get(key) ?? { items: [] };
      bucket.items.push({ ...(s as any), policyNumber: pol, _company: comp, _displayPolicy: pol || '-', _docId: id });
      salesByKey.set(key, bucket);
    };

    if (scopeCustomerIds) {
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

    /* ------- unify keys & compute ------- */
    const allKeys = Array.from(new Set<string>([...externalByKey.keys(), ...salesByKey.keys()]));
    const computed: ComparisonRow[] = [];

    for (const key of allKeys) {
      const [comp] = key.split('::');
      const reported = externalByKey.get(key) || null;
      const saleBucket = salesByKey.get(key) || null;

      // יש מכירה – אין קובץ
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
            productMap,
            selectedAgentId
          );
          magicAmountSum += Number((commissions as any)?.commissionNifraim ?? 0);

          if (!productForDisplay) productForDisplay = (sale as any)?.product;
          if (!customerForDisplay) customerForDisplay = (sale as any)?.customerId || (sale as any)?.IDCustomer;
        }

        computed.push({
          policyNumber: saleBucket.items[0]?._displayPolicy || '-',
          company: comp,
          reportedAmount: 0,
          magicAmount: Number(magicAmountSum),
          diff: 0,               // אין בסיס קובץ
          diffPercent: 0,
          status: 'not_reported',
          customerId: customerForDisplay,
          product: productForDisplay,
          _rawKey: key,
          _extRow: null,
        });
        continue;
      }

      // יש קובץ – אין מכירה
      if (reported && !saleBucket) {
        const rAmt = Number(reported.commissionAmount ?? 0);
        computed.push({
          policyNumber: reported?._displayPolicy || '-',
          company: comp,
          reportedAmount: rAmt,
          magicAmount: 0,
          diff: rAmt - 0, // קובץ − MAGIC
          diffPercent: rAmt === 0 ? 0 : 100,
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
            productMap,
            selectedAgentId
          );
          magicAmountSum += Number((commissions as any)?.commissionNifraim ?? 0);

          if (!productForDisplay) productForDisplay = (sale as any)?.product;
          if (!customerForDisplay) customerForDisplay = (sale as any)?.customerId || (sale as any)?.IDCustomer;
        }

        const reportedAmount = Number(reported.commissionAmount ?? 0);
        const magicAmount = Number(magicAmountSum);
        const diff = reportedAmount - magicAmount; // קובץ − MAGIC
        const diffPercent = percentAgainstReported(reportedAmount, magicAmount);

        // סיווג: אם לפחות אחת מהבדיקות בתוך הסף → "ללא שינוי"
        const amountWithin  = Math.abs(diff) <= toleranceAmount;
        const percentWithin = diffPercent <= tolerancePercent;
        const status: Status = (amountWithin || percentWithin) ? 'unchanged' : 'changed';

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
    lockedToCustomer,
    lockedCustomerId,
    includeFamily,
    productMap,
    toleranceAmount,
    tolerancePercent
  ]);

  useEffect(() => { fetchData(); }, [fetchData]);

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

  const statusSummary = useMemo(() => {
    return filtered.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {} as Record<Status, number>);
  }, [filtered]);

  const visibleRows = useMemo(
    () => (drillStatus ? filtered.filter(r => r.status === drillStatus) : filtered),
    [filtered, drillStatus]
  );

  const totals = useMemo(() => {
    const reported = visibleRows.reduce((s, r) => s + r.reportedAmount, 0);
    const magic = visibleRows.reduce((s, r) => s + r.magicAmount, 0);
    const delta = reported - magic; // קובץ − MAGIC
    return { reported, magic, delta };
  }, [visibleRows]);

  const handleExport = () => {
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
      'פער ₪ (קובץ−MAGIC)': totals.delta.toFixed(2),
      'פער %': '',
      'סטטוס': '',
    } as any);

    const ws = XLSX.utils.json_to_sheet(rowsForXlsx);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'השוואה קובץ מול MAGIC');
    XLSX.writeFile(wb, `השוואת_טעינה_מול_MAGIC_${company || 'כל_החברות'}_${reportMonth || 'חודש'}.xlsx`);
  };

  /* ---------- UI ---------- */
  return (
    <div className="p-6 max-w-7xl mx-auto text-right" dir="rtl">
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

      {lockedToCustomer && (
        <div className="mb-3 text-sm">
          <span className="inline-flex items-center gap-2 px-2 py-1 bg-amber-100 rounded">
            מסונן ללקוח: <b>{lockedCustomerId}</b>
          </span>
        </div>
      )}

      {/* בחירות בסיס + ספי סטייה + ייצוא */}
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

      {/* ספי סטייה + כפתור אקסל (אייקון בלבד) */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="w-44">
          <label className="block mb-1 text-sm font-medium">סף סטייה בסכום עמלה (₪)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={toleranceAmount}
            onChange={(e) => setToleranceAmount(Number(e.target.value) || 0)}
            onBlur={() => { /* נשמר אוטומטית ב-debounce */ }}
            className="input h-9 px-2 w-full text-right text-sm"
            placeholder="למשל 5"
          />
        </div>
        <div className="w-48">
          <label className="block mb-1 text-sm font-medium">סף סטייה באחוזים (%)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={tolerancePercent}
            onChange={(e) => setTolerancePercent(Number(e.target.value) || 0)}
            onBlur={() => { /* נשמר אוטומטית ב-debounce */ }}
            className="input h-9 px-2 w-full text-right text-sm"
            placeholder="למשל 0.3"
            title="חישוב האחוזים מבוסס על הסכום המדווח בקובץ."
          />
        </div>

        <button
          onClick={handleExport}
          className="h-9 w-9 rounded border bg-white hover:bg-gray-50 inline-flex items-center justify-center self-end"
          title="ייצוא לאקסל"
        >
          <img src="/static/img/excel-icon.svg" alt="" className="w-6 h-6" />
        </button>
      </div>

      {/* מסננים למטה */}
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
        </div>
      )}

      {/* דשבורד סכומים */}
      {rows.length > 0 && (
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
      )}

      {/* סיכום לפי סטטוס */}
      {rows.length > 0 && (
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
              {statusOptions
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
                ))}
            </tbody>
          </table>
          {!drillStatus && <p className="text-gray-500">אפשר ללחוץ על סטטוס להצגת פירוט.</p>}
        </>
      )}

      {/* טבלת פירוט */}
      {!isLoading && visibleRows.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          {drillStatus && (
            <button
              className="mb-4 px-4 py-2 bg-gray-500 text-white rounded"
              onClick={() => setDrillStatus(null)}
            >
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
                        onClick={() => {
                          // נפתח דיאלוג הקישור המקורי (אם תרצי להשיב: יש לך אותו בקוד הקודם)
                          alert('פתחי את דיאלוג הקישור כפי שמומש אצלך – השארתי את השדות/זיהוי כמו קודם.');
                        }}
                        title="קשר רשומת קובץ זו לפוליסה קיימת במערכת ללא מספר"
                      >
                        קישור פוליסה
                      </button>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-4 text-gray-500">לא נמצאו שורות תואמות.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {isLoading && <p className="text-gray-500 mt-4">טוען נתונים…</p>}
    </div>
  );
}
