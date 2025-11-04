// app/importCommissionHub/CompareRealToReported/CompareReportedVsMagic.tsx
'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { useAuth } from '@/lib/firebase/AuthContext';
import { calculateCommissions } from '@/utils/commissionCalculations';
import type { ContractForCompareCommissions } from '@/types/Contract';
import type { SalesToCompareCommissions } from '@/types/Sales';
import * as XLSX from 'xlsx';
import { useSearchParams, useRouter } from 'next/navigation';

type ExternalCommissionRow = {
  policyNumber: string | number;
  commissionAmount: number;
  company: string;
  reportMonth?: string;
  customerId?: string;
  agentCode?: string; // מהקובץ בלבד
  _company?: string;
  _displayPolicy?: string;
};

type Status = 'unchanged' | 'changed' | 'not_reported' | 'not_found';

type ComparisonRow = {
  policyNumber: string;
  company: string;
  reportedAmount: number;
  magicAmount: number;
  diff: number;
  diffPercent: number;
  status: Status;
  agentCode?: string;
  customerId?: string;
  product?: string;
  // נשתמש להצגת כפתור קישור:
  _rawKey?: string;             // מפתח פנימי לזיהוי השורה
  _extRow?: ExternalCommissionRow | null; // מקור חיצוני
};

const statusOptions = [
  { value: '',             label: 'הצג הכל' },
  { value: 'unchanged',    label: 'ללא שינוי' },
  { value: 'changed',      label: 'שינוי' },
  { value: 'not_reported', label: 'לא דווח בקובץ' },
  { value: 'not_found',    label: 'אין מכירה במערכת' },
] as const;

export default function CompareReportedVsMagic() {
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  const [company, setCompany] = useState('');
  const [reportMonth, setReportMonth] = useState('');

  const [availableCompanies, setAvailableCompanies] = useState<string[]>([]);
  const [rows, setRows] = useState<ComparisonRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [agentCodeFilter, setAgentCodeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<Status | ''>('');
  const [drillStatus, setDrillStatus] = useState<Status | null>(null);

  // ספי סטייה
  const [toleranceAmount, setToleranceAmount] = useState<number>(0);   // ₪
  const [tolerancePercent, setTolerancePercent] = useState<number>(0); // %

  const searchParams = useSearchParams();
  const router = useRouter();

  // "נעילה ללקוח" כשמגיעים מקפיצה
  const lockedCustomerId = (searchParams.get('customerId') || '').trim();
  const lockedToCustomer = !!lockedCustomerId;

  const handleBackToCustomer = () => {
    const ret = searchParams.get('returnTo');
    if (ret) {
      router.push(decodeURIComponent(ret));
    } else {
      const agentId = searchParams.get('agentId') || '';
      const customerId = searchParams.get('customerId') || '';
      const fallback = `/customers?agentId=${agentId}&highlightCustomer=${customerId}`;
      router.push(fallback);
    }
  };

  // עוזרים
  const toYm = (s?: string | null) => (s || '').toString().slice(0, 7);
  const canon = (v?: string | null) => String(v ?? '').trim();
  const normPolicy = (v: any) => String(v ?? '').trim();

  // policyNumberKey אחיד
  const policyKey = (agentId: string, companyCanon: string, policyNumber: string) =>
    `${agentId}::${companyCanon}::${policyNumber}`;

  // טען רשימת חברות
  useEffect(() => {
    (async () => {
      const snapshot = await getDocs(collection(db, 'company'));
      const companies = snapshot.docs
        .map(doc => (doc.data() as any)?.companyName)
        .filter(Boolean)
        .sort();
      setAvailableCompanies(companies);
    })();
  }, []);

  // קבלת פרמטרים מה־URL בהגעה ראשונה
  useEffect(() => {
    const agentId  = searchParams.get('agentId') || '';
    const comp     = searchParams.get('company') || '';
    const repYm    = searchParams.get('reportMonth') || '';
    const custId   = searchParams.get('customerId') || '';

    if (agentId) {
      handleAgentChange({ target: { value: agentId } } as any);
    }
    if (comp) setCompany(comp);
    if (repYm) setReportMonth(repYm);
    if (custId) setSearchTerm(custId);
  }, [searchParams, handleAgentChange]);

  // דיאלוג קישור
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkTarget, setLinkTarget] = useState<ExternalCommissionRow | null>(null); // שורת הקובץ
  const [linkCandidates, setLinkCandidates] = useState<Array<{ id: string; summary: string }>>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>('');
  const [linkSaving, setLinkSaving] = useState(false);

  // === הבאת נתונים — ב־useCallback כדי לאפשר ריענון אחרי קישור ===
  const fetchData = useCallback(async () => {
    // חובת בחירה: סוכן + חודש דיווח
    if (!selectedAgentId || !reportMonth) {
      setRows([]);
      return;
    }
    setIsLoading(true);

    // --- externalCommissions (reportMonth מדויק)
    const extQ = company
      ? (lockedToCustomer
          ? query(
              collection(db, 'externalCommissions'),
              where('agentId', '==', selectedAgentId),
              where('company', '==', company),
              where('reportMonth', '==', reportMonth),
              where('customerId', '==', lockedCustomerId)
            )
          : query(
              collection(db, 'externalCommissions'),
              where('agentId', '==', selectedAgentId),
              where('company', '==', company),
              where('reportMonth', '==', reportMonth)
            ))
      : (lockedToCustomer
          ? query(
              collection(db, 'externalCommissions'),
              where('agentId', '==', selectedAgentId),
              where('reportMonth', '==', reportMonth),
              where('customerId', '==', lockedCustomerId)
            )
          : query(
              collection(db, 'externalCommissions'),
              where('agentId', '==', selectedAgentId),
              where('reportMonth', '==', reportMonth)
            ));

    const extSnap = await getDocs(extQ);

    // --- sales (נסנן בצד לקוח לפי policyYm ≤ reportMonth)
    const salesQ = company
      ? (lockedToCustomer
          ? query(
              collection(db, 'sales'),
              where('AgentId', '==', selectedAgentId),
              where('company', '==', company),
              where('IDCustomer', '==', lockedCustomerId)
            )
          : query(
              collection(db, 'sales'),
              where('AgentId', '==', selectedAgentId),
              where('company', '==', company)
            ))
      : (lockedToCustomer
          ? query(
              collection(db, 'sales'),
              where('AgentId', '==', selectedAgentId),
              where('IDCustomer', '==', lockedCustomerId)
            )
          : query(
              collection(db, 'sales'),
              where('AgentId', '==', selectedAgentId)
            ));

    const salesSnap = await getDocs(salesQ);

    // --- contracts (לפי סוכן; אם יש חברה – מסננים)
    const contractsQ = company
      ? query(
          collection(db, 'contracts'),
          where('AgentId', '==', selectedAgentId),
          where('company', '==', company)
        )
      : query(
          collection(db, 'contracts'),
          where('AgentId', '==', selectedAgentId)
        );

    const contractsSnap = await getDocs(contractsQ);
    const contracts = contractsSnap.docs.map(d => d.data() as ContractForCompareCommissions);

    // --- חיצוני: מפה לפי company::policyNumber (או מפתח מדמה כשאין)
    const externalByKey = new Map<string, ExternalCommissionRow>();
    extSnap.docs.forEach(d => {
      const raw = d.data() as any;
      const comp = canon(raw.company);
      const pol  = normPolicy(raw.policyNumber);
      const key  = pol ? `${comp}::${pol}` : `${comp}::__NO_POLICY__:${d.id}`;
      externalByKey.set(key, {
        policyNumber: pol,
        commissionAmount: Number(raw.commissionAmount ?? 0),
        company: comp,
        reportMonth: raw.reportMonth,
        customerId: raw.customerId ?? raw.IDCustomer ?? undefined,
        agentCode: String(raw.agentCode ?? raw.AgentCode ?? '').trim() || undefined,
        _company: comp,
        _displayPolicy: pol || '-',
      });
    });

    // --- מכירות: רק שורות שה-policyYm ≤ reportMonth
    type SalesBucket = {
      items: (SalesToCompareCommissions & { _company: string; _displayPolicy?: string; _docId?: string })[];
    };
    const salesByKey = new Map<string, SalesBucket>();

    salesSnap.docs.forEach(d => {
      const s = d.data() as any;
      const comp = canon(s.company);
      const pol  = normPolicy(s.policyNumber);
      const policyYm = toYm(s.month || s.mounth);
      if (!policyYm || policyYm > reportMonth) return;

      if (lockedToCustomer) {
        const cid = String(s.customerId || s.IDCustomer || '').trim();
        if (cid !== lockedCustomerId) return;
      }

      const key = pol ? `${comp}::${pol}` : `${comp}::__NO_POLICY__:${d.id}`;
      const bucket = salesByKey.get(key) ?? { items: [] };
      bucket.items.push({ ...(s as any), policyNumber: pol, _company: comp, _displayPolicy: pol || '-', _docId: d.id });
      salesByKey.set(key, bucket);
    });

    // --- כל המפתחות
    const allKeys = Array.from(new Set<string>([
      ...externalByKey.keys(),
      ...salesByKey.keys(),
    ]));

    const computed: ComparisonRow[] = [];

    for (const key of allKeys) {
      const [comp] = key.split('::');
      const reported = externalByKey.get(key) || null;
      const saleBucket = salesByKey.get(key) || null;

      // אין דיווח בקובץ (יש מכירה)
      if (!reported && saleBucket) {
        const displayPolicy = saleBucket.items[0]?._displayPolicy || '-';
        const anySale = saleBucket.items[0] as any;
        // מראים כ"לא דווח בקובץ" + עמלת MAGIC = 0 להצפה (ניתן לשנות אם תרצי)
        computed.push({
          policyNumber: displayPolicy,
          company: comp,
          reportedAmount: 0,
          magicAmount: 0,
          diff: 0,
          diffPercent: 0,
          status: 'not_reported',
          agentCode: undefined,
          customerId: anySale?.customerId || anySale?.IDCustomer,
          product: anySale?.product,
          _rawKey: key,
          _extRow: null,
        });
        continue;
      }

      // אין מכירה במערכת (יש חיצוני)
      if (reported && !saleBucket) {
        const rAmt = Number(reported.commissionAmount ?? 0);
        computed.push({
          policyNumber: reported?._displayPolicy || '-',
          company: comp,
          reportedAmount: rAmt,
          magicAmount: 0,
          diff: -rAmt,
          diffPercent: rAmt === 0 ? 0 : 100,
          status: 'not_found',
          agentCode: reported.agentCode,
          customerId: reported.customerId,
          _rawKey: key,
          _extRow: reported,
        });
        continue;
      }

      // יש שני הצדדים → מחושבים (סכום MAGIC על כל פריטי המפתח)
      if (reported && saleBucket) {
        let magicAmountSum = 0;
        let productForDisplay: string | undefined = undefined;
        let customerForDisplay: string | undefined = undefined;

        for (const sale of saleBucket.items) {
          const contractMatch =
            contracts.find(c =>
              c.AgentId === selectedAgentId &&
              c.company === comp &&
              (c as any).product === (sale as any).product &&
              (c as any).minuySochen === (sale as any).minuySochen
            ) || undefined;

        const commissions = calculateCommissions(
            sale as any,
            contractMatch,
            contracts,
            {} as any,
            selectedAgentId
          );
          magicAmountSum += Number((commissions as any)?.commissionNifraim ?? 0);

          if (!productForDisplay) productForDisplay = (sale as any)?.product;
          if (!customerForDisplay) customerForDisplay = (sale as any)?.customerId || (sale as any)?.IDCustomer;
        }

        const reportedAmount = Number(reported.commissionAmount ?? 0);
        const magicAmount    = Number(magicAmountSum);
        const diff           = magicAmount - reportedAmount;

        let diffPercent = 0;
        if (reportedAmount === 0) diffPercent = magicAmount === 0 ? 0 : 100;
        else diffPercent = Math.abs(diff) / reportedAmount * 100;

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
    lockedCustomerId
  ]);

  // הרצת הבאת הנתונים
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // מסנן "מס' סוכן" — מהקובץ
  const agentCodes = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { if (r.agentCode) s.add(r.agentCode); });
    return Array.from(s).sort();
  }, [rows]);

  // סינון לתצוגה (כולל חברה)
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

  // === דיאלוג קישור: פתיחה ===
  const openLinkDialog = async (row: ComparisonRow) => {
    if (row.status !== 'not_found' || !row._extRow) return;

    const ext = row._extRow;
    setLinkTarget(ext);

    // שולפים מועמדות מ-sales ללא policyNumber, תואמות חברה/לקוח, policyYm ≤ reportMonth
    const baseQ = company
      ? query(
          collection(db, 'sales'),
          where('AgentId', '==', selectedAgentId),
          where('company', '==', ext.company)
        )
      : query(
          collection(db, 'sales'),
          where('AgentId', '==', selectedAgentId)
        );

    const snap = await getDocs(baseQ);
    const candidates: Array<{ id: string; summary: string }> = [];

    snap.docs.forEach(d => {
      const s = d.data() as any;
      const policyYm = toYm(s.month || s.mounth);
      const hasPolicy = !!normPolicy(s.policyNumber);
      if (!policyYm || policyYm > reportMonth) return;           // חייב להיות פעיל עד reportMonth
      if (hasPolicy) return;                                     // נציע רק כאלו שעדיין אין להן policyNumber
      if (ext.customerId) {
        const cid = String(s.customerId || s.IDCustomer || '').trim();
        if (cid && ext.customerId && cid !== ext.customerId) return; // אם יש לקוח בקובץ – נדרוש התאמה
      }
      // התאמת חברה
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

  // === דיאלוג קישור: ביצוע ===
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

      // סגירה וניקוי
      setLinkOpen(false);
      setSelectedCandidateId('');
      setLinkCandidates([]);
      setLinkTarget(null);

      // ריענון מיידי של הנתונים (בלי F5)
      await fetchData();
    } finally {
      setLinkSaving(false);
    }
  };

  // ייצוא לאקסל
  const handleExport = () => {
    const totals = visibleRows.reduce(
      (acc, r) => {
        acc.reported += r.reportedAmount;
        acc.magic += r.magicAmount;
        acc.diff += r.diff;
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
      'פער ₪': r.diff.toFixed(2),
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
      'פער ₪': totals.diff.toFixed(2),
      'פער %': '',
      'סטטוס': '',
    } as any);

    const ws = XLSX.utils.json_to_sheet(rowsForXlsx);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'השוואה קובץ מול MAGIC');
    XLSX.writeFile(wb, `השוואת_טעינה_מול_MAGIC_${company || 'כל_החברות'}_${reportMonth || 'חודש'}.xlsx`);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto text-right" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">השוואת טעינת עמלות (קובץ) מול MAGIC</h1>
        <button
          type="button"
          onClick={handleBackToCustomer}
          className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300"
        >
          ← חזרה ללקוח
        </button>
      </div>

      {lockedToCustomer && (
        <div className="mb-3 text-sm">
          <span className="inline-flex items-center gap-2 px-2 py-1 bg-amber-100 rounded">
            מסונן ללקוח: <b>{lockedCustomerId}</b>
          </span>
        </div>
      )}

      {/* בחירות בסיס */}
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
            {availableCompanies.map((c, i) => (
              <option key={i} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block mb-1 font-semibold">חודש דיווח (קובץ):</label>
          <input
            type="month"
            value={reportMonth}
            onChange={e => setReportMonth(e.target.value)}
            className="input w-full"
          />
        </div>

        <div className="flex gap-3">
          <div className="w-full">
            <label className="block mb-1 text-sm font-medium">סף ₪</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={toleranceAmount}
              onChange={(e) => setToleranceAmount(Number(e.target.value) || 0)}
              className="input h-9 px-2 w-full text-right"
              placeholder="למשל 5"
            />
          </div>
          <div className="w-full">
            <label className="block mb-1 text-sm font-medium">סף %</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={tolerancePercent}
              onChange={(e) => setTolerancePercent(Number(e.target.value) || 0)}
              className="input h-9 px-2 w-full text-right"
              placeholder="למשל 1"
              title="סף אחוזים מבוסס על המדווח בקובץ. 0% מחייב זהות מוחלטת."
            />
          </div>
        </div>
      </div>

      {/* מסננים + ייצוא */}
      {rows.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <input
            type="text"
            placeholder="חיפוש לפי מס׳ פוליסה / ת״ז"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input w-full sm:w-1/3 text-right"
          />

          <select
            value={agentCodeFilter}
            onChange={(e) => setAgentCodeFilter(e.target.value)}
            className="select-input w-full sm:w-1/3"
          >
            <option value="">מס׳ סוכן (מהקובץ)</option>
            {agentCodes.map(code => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as Status | '')}
            className="select-input w-full sm:w-1/3"
          >
            {statusOptions.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleExport}
            className="px-4 py-2 rounded bg-white border hover:bg-gray-50"
            title="ייצוא של התצוגה המסוננת (כולל שורת סיכום)"
          >
            ייצוא לאקסל
          </button>
        </div>
      )}

      {/* סיכום לפי סטטוס (על בסיס filtered) */}
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
                <th className="border p-2 text-center">פער ₪</th>
                <th className="border p-2 text-center">פער %</th>
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

      {/* דיאלוג קישור */}
      {linkOpen && linkTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow p-4 w-full max-w-xl" dir="rtl">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold">קישור פוליסה מהקובץ לפוליסה במערכת</h3>
              <button onClick={() => setLinkOpen(false)} className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300">
                ✕
              </button>
            </div>

            <div className="space-y-2 text-sm">
              <div><b>חברה:</b> {linkTarget.company}</div>
              <div><b>מס׳ פוליסה (קובץ):</b> {String(linkTarget.policyNumber || '-')}</div>
              {linkTarget.customerId && <div><b>ת״ז לקוח (מהקובץ):</b> {linkTarget.customerId}</div>}
              <div className="mt-2">
                <label className="block mb-1">בחרי פוליסה במערכת (ללא מספר):</label>
                <select
                  className="select-input w-full"
                  value={selectedCandidateId}
                  onChange={e => setSelectedCandidateId(e.target.value)}
                >
                  {linkCandidates.length === 0 && <option value="">לא נמצאו מועמדות מתאימות</option>}
                  {linkCandidates.map(c => (
                    <option key={c.id} value={c.id}>{c.summary}</option>
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
