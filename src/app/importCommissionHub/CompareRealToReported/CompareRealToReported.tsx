// app/importCommissionHub/CompareRealToReported/CompareReportedVsMagic.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
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
  agentCode?: string; // מספר סוכן מהקובץ בלבד
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
  agentCode?: string;  // תמיד מהקובץ
  customerId?: string;
  product?: string;
};

const statusOptions = [
  { value: '',              label: 'הצג הכל' },
  { value: 'unchanged',     label: 'ללא שינוי' },
  { value: 'changed',       label: 'שינוי' },
  { value: 'not_reported',  label: 'לא דווח בקובץ' },
  { value: 'not_found',     label: 'אין מכירה במערכת' },
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

  // ספי סטייה — 0 נחשב
  const [toleranceAmount, setToleranceAmount] = useState<number>(0);   // ₪
  const [tolerancePercent, setTolerancePercent] = useState<number>(0); // נק' אחוז

  const searchParams = useSearchParams();
  const router = useRouter();

  // --- "נעילה ללקוח" כשמגיעים מקפיצה
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

  // טען רשימת חברות להצעה ב־select
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
      // handleAgentChange מצפה לאירוע <select>
      handleAgentChange({ target: { value: agentId } } as any);
    }
    if (comp) setCompany(comp);
    if (repYm) setReportMonth(repYm);
    if (custId) setSearchTerm(custId); // ייתן חיפוש גם בטבלה
  }, [searchParams, handleAgentChange]);

  useEffect(() => {
    const fetchData = async () => {
      // נדרשים: סוכן וחודש-דיווח. חברה – רשות.
      if (!selectedAgentId || !reportMonth) {
        setRows([]);
        return;
      }

      setIsLoading(true);

      // --- externalCommissions
      // אם יש סינון חברה – נוסיף where('company'=='...'), אחרת לא.
      // אם נעולים ללקוח – נוסיף where('customerId'=='...') (fallback למטה אם אין אינדקס/שדה).
      const extQ = company
        ? (lockedToCustomer
            ? query(
                collection(db, 'externalCommissions'),
                where('agentId','==',selectedAgentId),
                where('company','==',company),
                where('reportMonth','==',reportMonth),
                where('customerId','==',lockedCustomerId)
              )
            : query(
                collection(db, 'externalCommissions'),
                where('agentId','==',selectedAgentId),
                where('company','==',company),
                where('reportMonth','==',reportMonth)
              ))
        : (lockedToCustomer
            ? query(
                collection(db, 'externalCommissions'),
                where('agentId','==',selectedAgentId),
                where('reportMonth','==',reportMonth),
                where('customerId','==',lockedCustomerId)
              )
            : query(
                collection(db, 'externalCommissions'),
                where('agentId','==',selectedAgentId),
                where('reportMonth','==',reportMonth)
              ));

      const extSnap = await getDocs(extQ);

      // --- sales
      const salesQ = company
        ? (lockedToCustomer
            ? query(
                collection(db, 'sales'),
                where('AgentId','==',selectedAgentId),
                where('company','==',company),
                where('IDCustomer','==',lockedCustomerId)
              )
            : query(
                collection(db, 'sales'),
                where('AgentId','==',selectedAgentId),
                where('company','==',company)
              ))
        : (lockedToCustomer
            ? query(
                collection(db, 'sales'),
                where('AgentId','==',selectedAgentId),
                where('IDCustomer','==',lockedCustomerId)
              )
            : query(
                collection(db, 'sales'),
                where('AgentId','==',selectedAgentId)
              ));

      const salesSnap = await getDocs(salesQ);

      // --- contracts (לפי סוכן; אם יש חברה – נסנן כבר בשאילתה)
      const contractsQ = company
        ? query(
            collection(db, 'contracts'),
            where('AgentId','==',selectedAgentId),
            where('company','==',company)
          )
        : query(
            collection(db, 'contracts'),
            where('AgentId','==',selectedAgentId)
          );

      const contractsSnap = await getDocs(contractsQ);
      const contracts = contractsSnap.docs.map(d => d.data() as ContractForCompareCommissions);

      // --- נבנה מיפוי לפי מפתח מרוכב: company::policyNumber, כך שעובד גם ללא סינון חברה
      const externalByKey = new Map<string, ExternalCommissionRow & { _company: string }>();
      extSnap.docs.forEach(d => {
        const raw = d.data() as any;
        const comp = String(raw.company ?? '').trim();
        const pol  = String(raw.policyNumber ?? '').trim();
        if (!pol) return;
        const norm: ExternalCommissionRow & { _company: string } = {
          policyNumber: pol,
          commissionAmount: Number(raw.commissionAmount ?? 0),
          company: comp,
          reportMonth: raw.reportMonth,
          customerId: raw.customerId ?? raw.IDCustomer ?? undefined,
          agentCode: String(raw.agentCode ?? raw.AgentCode ?? '').trim() || undefined,
          _company: comp,
        };
        externalByKey.set(`${comp}::${pol}`, norm);
      });

      const salesByKey = new Map<string, SalesToCompareCommissions & { _company: string }>();
      salesSnap.docs.forEach(d => {
        const s = d.data() as SalesToCompareCommissions;
        const comp = String((s as any).company ?? '').trim();
        const pol  = String((s as any).policyNumber ?? '').trim();
        if (!pol) return;
        salesByKey.set(`${comp}::${pol}`, { ...s, policyNumber: pol, _company: comp });
      });

      // --- Fallback סינון ללקוח בצד-לקוח (למקרה שאין אינדקס/שדה customerId באקסטרנל)
      if (lockedToCustomer) {
        for (const [k, v] of externalByKey) {
          const cid = (v.customerId || '').trim();
          if (cid !== lockedCustomerId) externalByKey.delete(k);
        }
        for (const [k, v] of salesByKey) {
          const cid = ((v as any).customerId || (v as any).IDCustomer || '').trim();
          if (cid !== lockedCustomerId) salesByKey.delete(k);
        }
      }

      // --- כל המפתחות
      const allKeys = Array.from(new Set<string>([
        ...externalByKey.keys(),
        ...salesByKey.keys(),
      ]));

      const computed: ComparisonRow[] = [];

      for (const key of allKeys) {
        const [comp, pol] = key.split('::');
        const reported = externalByKey.get(key) || null;
        const sale     = salesByKey.get(key) || null;

        // אין דיווח בקובץ (יש מכירה, אין חיצוני)
        if (!reported && sale) {
          computed.push({
            policyNumber: pol,
            company: comp,
            reportedAmount: 0,
            magicAmount: 0, // ייחשב רק כשיש חוזה — כאן הכוונה להבליט שהוא לא דווח בכלל
            diff: 0,
            diffPercent: 0,
            status: 'not_reported',
            agentCode: undefined,
            customerId: (sale as any)?.customerId || (sale as any)?.IDCustomer,
            product: (sale as any)?.product,
          });
          continue;
        }

        // אין מכירה במערכת (יש חיצוני, אין sale)
        if (reported && !sale) {
          const rAmt = Number(reported.commissionAmount ?? 0);
          computed.push({
            policyNumber: pol,
            company: comp,
            reportedAmount: rAmt,
            magicAmount: 0,
            diff: -rAmt,
            diffPercent: rAmt === 0 ? 0 : 100,
            status: 'not_found',
            agentCode: reported.agentCode,
            customerId: reported.customerId,
          });
          continue;
        }

        // שני הצדדים קיימים → לחשב
        if (reported && sale) {
          const contractMatch =
            contracts.find(c =>
              c.AgentId === selectedAgentId &&
              c.company === comp &&
              (c as any).product === (sale as any).product &&
              (c as any).minuySochen === (sale as any).minuySochen
            ) || undefined;

          const commissions = calculateCommissions(
            sale,
            contractMatch,
            contracts,
            {} as any, // productMap לא נדרש כאן
            selectedAgentId
          );

          const reportedAmount = Number(reported.commissionAmount ?? 0);
          const magicAmount    = Number((commissions as any)?.commissionNifraim ?? 0);
          const diff           = magicAmount - reportedAmount;

          let diffPercent = 0;
          if (reportedAmount === 0) diffPercent = magicAmount === 0 ? 0 : 100;
          else diffPercent = Math.abs(diff) / reportedAmount * 100;

          const withinAmount  = Math.abs(diff) <= toleranceAmount;
          const withinPercent = diffPercent <= tolerancePercent;
          const status: Status = (withinAmount && withinPercent) ? 'unchanged' : 'changed';

          computed.push({
            policyNumber: pol,
            company: comp,
            reportedAmount,
            magicAmount,
            diff,
            diffPercent,
            status,
            agentCode: reported.agentCode, // רק מהקובץ
            customerId: reported.customerId ?? (sale as any)?.customerId ?? (sale as any)?.IDCustomer,
            product: (sale as any)?.product,
          });
        }
      }

      setRows(computed);
      setIsLoading(false);
    };

    fetchData();
  }, [selectedAgentId, company, reportMonth, toleranceAmount, tolerancePercent, lockedToCustomer, lockedCustomerId]);

  // מסנן "מס' סוכן" — מתבסס רק על המספרים שהגיעו מהקובץ
  const agentCodes = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => { if (r.agentCode) s.add(r.agentCode); });
    return Array.from(s).sort();
  }, [rows]);

  // ⚠️ נספר לפי filtered (התצוגה), לא לפי כל rows
  const filtered = useMemo(() => {
    return rows.filter(r => {
      const matchesTxt =
        !searchTerm ||
        String(r.policyNumber || '').includes(searchTerm) ||
        String(r.customerId || '').includes(searchTerm);

      const matchesAgent  = !agentCodeFilter || r.agentCode === agentCodeFilter;
      const matchesStatus = !statusFilter || r.status === statusFilter;

      // אם המשתמש בחר חברה ב־select – נטמיע את הסינון גם בצד־לקוח (מקרה של “כל החברות” שמצומצם עכשיו)
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

      {/* תווית "נעול ללקוח" לנראות */}
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

      {/* סיכום לפי סטטוס (על בסיס filtered!) */}
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
        <div className="mt-2">
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
                <th className="border p-2 text-center bg-emerלד-50">עמלה (MAGIC)</th>
                <th className="border p-2 text-center">פער ₪</th>
                <th className="border p-2 text-center">פער %</th>
                <th className="border p-2">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map(r => (
                <tr key={`${r.company}|${r.policyNumber}|${r.agentCode || ''}`}>
                  <td className="border p-2">{r.company}</td>
                  <td className="border p-2">{r.policyNumber}</td>
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
                </tr>
              ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="text-center py-4 text-gray-500">לא נמצאו שורות תואמות.</td>
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
