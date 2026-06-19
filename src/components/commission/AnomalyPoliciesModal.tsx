'use client';

import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';

// ─── Types ────────────────────────────────────────────────────────────────────

type AnomalyRow = {
  policyNumberKey: string;
  customerId: string;
  fullName?: string;
  product?: string;
  templateId: string;
  companyId: string;
  company: string;
  agentCode: string;
  reportMonth: string;
  totalCommissionAmount: number;
  totalPremiumAmount: number;
  commissionRate: number;
  validMonth?: string;
};

type HistoryRow = {
  reportMonth: string;
  agentCode: string;
  totalCommissionAmount: number;
  totalPremiumAmount: number;
  commissionRate: number;
  product?: string;
  customerId?: string;
  fullName?: string;
  templateId: string;
  validMonth?: string;
};

type AnomalyType = 'all' | 'zero_commission' | 'negative_commission' | 'premium_positive_commission_zero';

type Props = {
  agentId: string;
  selectedYear: string;
  onClose: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(v: number) {
  const n = Math.round(Number(v) * 100) / 100;
  if (Object.is(n, -0)) return '0'; // טיפול ספציפי ב--0
  if (n === 0) return '0';
  return n.toLocaleString('he-IL', { maximumFractionDigits: 2 });
}

function getDefaultMonth(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (m === 0) return `${y - 1}-12`;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function commissionColor(amount: number) {
  if (amount < 0) return 'text-red-700 font-bold';
  if (amount === 0) return 'text-orange-600 font-bold';
  return 'text-gray-800';
}

function premiumColor(premium: number, commission: number) {
  if (premium > 0 && commission <= 0) return 'text-red-600 font-bold';
  return 'text-gray-800';
}

function anomalyBadge(row: AnomalyRow) {
  const comm = row.totalCommissionAmount;
  const prem = row.totalPremiumAmount;
  
  if (prem > 0 && comm < -0.001) {
    return { label: 'פרמיה חיובית + עמלה שלילית', color: 'bg-red-100 text-red-700 border-red-200' };
  }
  if (prem > 0 && Math.abs(comm) < 0.001) {
    return { label: 'פרמיה ללא עמלה', color: 'bg-orange-100 text-orange-700 border-orange-200' };
  }
  if (comm < -0.001) {
    return { label: 'עמלה שלילית', color: 'bg-red-100 text-red-700 border-red-200' };
  }
  return { label: 'עמלה 0', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
}

// ─── PolicyHistoryModal ───────────────────────────────────────────────────────

function PolicyHistoryModal({
  agentId,
  companyId,
  policyNumberKey,
  fullName,
  customerId,
  onClose,
}: {
  agentId: string;
  companyId: string;
  policyNumberKey: string;
  fullName?: string;
  customerId?: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/policy-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId, companyId, policyNumberKey }),
        });
        const data = await res.json();
        setRows(data.rows ?? []);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [agentId, companyId, policyNumberKey]);

  const exportHistory = () => {
    if (!rows.length) return;
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      'חודש דיווח': r.reportMonth,
      'מספר סוכן': r.agentCode,
      'מוצר': r.product ?? '',
      'פרמיה': r.totalPremiumAmount,
      'עמלה': r.totalCommissionAmount,
      '% עמלה': r.commissionRate,
      'חודש תחילה': r.validMonth ?? '',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'היסטוריה');
    XLSX.writeFile(wb, `היסטוריה_${policyNumberKey}.xlsx`);
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center" dir="rtl">
      <div className="bg-white w-[min(800px,95vw)] max-h-[80vh] overflow-auto rounded-2xl shadow-2xl">

        {/* Header */}
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between z-10">
          <div>
            <div className="font-bold text-gray-900 text-base">
              היסטוריית פוליסה: {policyNumberKey}
            </div>
            {fullName && (
              <div className="text-sm text-gray-500 mt-0.5">
                {fullName}
                {customerId && <span className="mr-2 text-gray-400">· ת״ז: {customerId}</span>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportHistory}
              disabled={!rows.length}
              className="text-xs px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-40"
            >
              ייצוא אקסל
            </button>
            <button onClick={onClose} className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50">
              סגור
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {loading ? (
            <div className="py-12 text-center text-gray-400 animate-pulse">טוען...</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-gray-400">לא נמצאו רשומות</div>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs">
                  <th className="border px-3 py-2 text-right">חודש</th>
                  <th className="border px-3 py-2 text-right">מספר סוכן</th>
                  <th className="border px-3 py-2 text-right">מוצר</th>
                  <th className="border px-3 py-2 text-right">פרמיה/צבירה</th>
                  <th className="border px-3 py-2 text-right">עמלה</th>
                  <th className="border px-3 py-2 text-right">% עמלה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r, i) => {
                  const isAnomaly = r.totalCommissionAmount < 0.001;
                  return (
                    <tr key={i} className={isAnomaly ? 'bg-red-50/40' : 'hover:bg-gray-50'}>
                      <td className="border px-3 py-2 font-medium">{r.reportMonth}</td>
                      <td className="border px-3 py-2 text-gray-600">{r.agentCode}</td>
                      <td className="border px-3 py-2 text-gray-600">{r.product ?? '-'}</td>
                      <td className={`border px-3 py-2 text-right ${premiumColor(r.totalPremiumAmount, r.totalCommissionAmount)}`}>
                        {fmtNum(r.totalPremiumAmount)}
                      </td>
                      <td className={`border px-3 py-2 text-right ${commissionColor(r.totalCommissionAmount)}`}>
                        {fmtNum(r.totalCommissionAmount)}
                        {r.totalCommissionAmount < 0 && ' ⚠️'}
                        {r.totalCommissionAmount === 0 && r.totalPremiumAmount > 0 && ' 🔴'}
                      </td>
                      <td className="border px-3 py-2 text-right text-gray-600">
                        {fmtNum(r.commissionRate)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AnomalyPoliciesModal ─────────────────────────────────────────────────────

export default function AnomalyPoliciesModal({ agentId, selectedYear, onClose }: Props) {
  const [rows, setRows] = useState<AnomalyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);

  const [selectedMonth, setSelectedMonth] = useState<string>(getDefaultMonth);

  const [filterType, setFilterType] = useState<AnomalyType>('all');
  const [filterCompany, setFilterCompany] = useState('');
  const [search, setSearch] = useState('');

  const [historyPolicy, setHistoryPolicy] = useState<AnomalyRow | null>(null);
  const [activeStatFilter, setActiveStatFilter] = useState<'negative' | 'zero' | 'premium_positive' | null>(null);

  const [filterAgentCode, setFilterAgentCode] = useState('');
  const agentCodes = useMemo(() => Array.from(new Set(rows.map(r => r.agentCode).filter(Boolean))).sort(), [rows]);

const isNegative = (v: number) => Math.round(v * 100) / 100 < 0;

  const load = async () => {
    if (!selectedMonth) return;
    setLoading(true);
    setHasSearched(false);
    try {
      const res = await fetch('/api/anomaly-policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, reportMonth: selectedMonth }),
      });
      const data = await res.json();
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
      setHasSearched(true);
    } finally {
      setLoading(false);
    }
  };

  const companies = useMemo(() => Array.from(new Set(rows.map(r => r.company))).sort(), [rows]);

  const filtered = useMemo(() => {
    return rows.filter(r => {

      if (activeStatFilter === 'negative' && !isNegative(r.totalCommissionAmount)) return false;      if (activeStatFilter === 'zero' && r.totalCommissionAmount !== 0) return false;
      if (activeStatFilter === 'premium_positive' &&
      !(r.totalPremiumAmount > 0 && r.totalCommissionAmount <= 0)) return false;
      if (filterType === 'zero_commission' && r.totalCommissionAmount !== 0) return false;
      if (filterType === 'negative_commission' && !isNegative(r.totalCommissionAmount)) return false;
      if (filterType === 'premium_positive_commission_zero' &&
        !(r.totalPremiumAmount > 0 && r.totalCommissionAmount <= 0)) return false;
      if (filterCompany && r.company !== filterCompany) return false;
      if (filterAgentCode && r.agentCode !== filterAgentCode) return false;
      if (search) {
        const q = search.toLowerCase();
        const match =
          r.policyNumberKey?.toLowerCase().includes(q) ||
          r.fullName?.toLowerCase().includes(q) ||
          r.customerId?.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [rows, filterType, filterCompany , filterAgentCode, search , activeStatFilter]);

  const exportToExcel = () => {
    if (!filtered.length) return;
    const ws = XLSX.utils.json_to_sheet(filtered.map(r => ({
      'פוליסה': r.policyNumberKey,
      'ת״ז': r.customerId,
      'לקוח': r.fullName ?? '',
      'חברה': r.company,
      'מוצר': r.product ?? '',
      'חודש דיווח': r.reportMonth,
      'מספר סוכן': r.agentCode,
      'פרמיה': r.totalPremiumAmount,
      'עמלה': r.totalCommissionAmount,
      '% עמלה': r.commissionRate,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'פוליסות חריגות');
    XLSX.writeFile(wb, `פוליסות_חריגות_${selectedMonth}.xlsx`);
  };

  const stats = useMemo(() => {
    const zeroCommission = rows.filter(r => r.totalCommissionAmount === 0).length;
    const negativeCommission = rows.filter(r => r.totalCommissionAmount < 0).length;
    const premiumPositive = rows.filter(r => r.totalPremiumAmount > 0 && r.totalCommissionAmount <= 0).length;
    return { zeroCommission, negativeCommission, premiumPositive };
  }, [rows]);


  useEffect(() => {
  load();
}, []); // רץ פעם אחת בטעינה

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center" dir="rtl">
        <div className="bg-white w-[min(1200px,96vw)] max-h-[90vh] overflow-auto rounded-2xl shadow-2xl flex flex-col">

          {/* Header */}
          <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
            <div>
              <h2 className="text-lg font-bold text-gray-900">⚠️ פוליסות חריגות</h2>
              {hasSearched && (
                <p className="text-xs text-gray-400 mt-0.5">חודש: {selectedMonth} · נמצאו {total} פוליסות</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hasSearched && (
                <button
                  onClick={exportToExcel}
                  disabled={!filtered.length}
                  className="text-xs px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-40"
                >
                  ייצוא אקסל ({filtered.length})
                </button>
              )}
              <button onClick={onClose} className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50">
                סגור
              </button>
            </div>
          </div>

          {/* Month picker */}
          <div className="px-6 py-3 border-b bg-gray-50 flex items-center gap-3">
            <label className="text-sm font-medium text-gray-600">חודש דיווח:</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="text-sm border rounded-lg px-3 py-1.5 bg-white"
            />
            <button
              onClick={load}
              disabled={!selectedMonth || loading}
              className="text-sm px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
            >
              {loading ? 'טוען...' : 'טען'}
            </button>
          </div>

          <div className="p-5 flex-1 overflow-auto">
            {!hasSearched && !loading ? (
              <div className="py-20 text-center text-gray-400 text-sm">
                בחרי חודש ולחצי טען
              </div>
            ) : loading ? (
              <div className="py-20 text-center text-gray-400 animate-pulse text-sm">טוען נתונים...</div>
            ) : (
              <>
                {/* Stats */}
                <div className="grid grid-cols-3 gap-3 mb-5">
              <div
  onClick={() => setActiveStatFilter(prev => prev === 'negative' ? null : 'negative')}
  className={`rounded-xl border p-4 text-center cursor-pointer transition ${
    activeStatFilter === 'negative'
      ? 'border-red-400 bg-red-100 ring-2 ring-red-400'
      : 'border-red-100 bg-red-50 hover:bg-red-100'
  }`}
>
  <div className="text-xs text-red-500 font-bold mb-1">עמלה שלילית</div>
  <div className="text-3xl font-black text-red-600">{stats.negativeCommission}</div>
</div>

<div
  onClick={() => setActiveStatFilter(prev => prev === 'zero' ? null : 'zero')}
  className={`rounded-xl border p-4 text-center cursor-pointer transition ${
    activeStatFilter === 'zero'
      ? 'border-orange-400 bg-orange-100 ring-2 ring-orange-400'
      : 'border-orange-100 bg-orange-50 hover:bg-orange-100'
  }`}
>
  <div className="text-xs text-orange-500 font-bold mb-1">עמלה 0</div>
  <div className="text-3xl font-black text-orange-600">{stats.zeroCommission}</div>
</div>

<div
  onClick={() => setActiveStatFilter(prev => prev === 'premium_positive' ? null : 'premium_positive')}
  className={`rounded-xl border p-4 text-center cursor-pointer transition ${
    activeStatFilter === 'premium_positive'
      ? 'border-yellow-400 bg-yellow-100 ring-2 ring-yellow-400'
      : 'border-yellow-100 bg-yellow-50 hover:bg-yellow-100'
  }`}
>
  <div className="text-xs text-yellow-600 font-bold mb-1">פרמיה חיובית + עמלה 0/שלילית</div>
  <div className="text-3xl font-black text-yellow-600">{stats.premiumPositive}</div>
</div>
</div>
{/* Filters */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <select
                    value={filterType}
                    onChange={e => setFilterType(e.target.value as AnomalyType)}
                    className="text-sm border rounded-lg px-3 py-1.5 bg-white"
                  >
                    <option value="all">כל החריגות</option>
                    <option value="zero_commission">עמלה 0 בלבד</option>
                    <option value="negative_commission">עמלה שלילית בלבד</option>
                    <option value="premium_positive_commission_zero">פרמיה חיובית + עמלה 0/שלילית</option>
                  </select>

                  <select
                    value={filterCompany}
                    onChange={e => setFilterCompany(e.target.value)}
                    className="text-sm border rounded-lg px-3 py-1.5 bg-white"
                  >
                    <option value="">כל החברות</option>
                    {companies.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
<select
  value={filterAgentCode}
  onChange={e => setFilterAgentCode(e.target.value)}
  className="text-sm border rounded-lg px-3 py-1.5 bg-white"
>
  <option value="">כל מספרי הסוכן</option>
  {agentCodes.map(c => <option key={c} value={c}>{c}</option>)}
</select>
                  <input
                    type="text"
                    placeholder="חיפוש פוליסה / לקוח / ת״ז..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="text-sm border rounded-lg px-3 py-1.5 bg-white flex-1 min-w-[180px]"
                  />

                  {(filterType !== 'all' || filterCompany || search) && (
                    <button
                   onClick={() => { setFilterType('all'); setFilterCompany(''); setFilterAgentCode(''); setSearch(''); setActiveStatFilter(null); }}                      className="text-xs text-gray-500 hover:text-gray-700 px-2"
                    >
                      נקה סינון
                    </button>
                  )}
                </div>

                {/* Table */}
                {filtered.length === 0 ? (
                  <div className="py-16 text-center text-gray-400">לא נמצאו פוליסות חריגות לפי הסינון הנוכחי</div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-200">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 text-xs">
                          <th className="border-b px-3 py-2.5 text-right">סוג חריגה</th>
                          <th className="border-b px-3 py-2.5 text-right">פוליסה</th>
                          <th className="border-b px-3 py-2.5 text-right">ת״ז</th>
                          <th className="border-b px-3 py-2.5 text-right">לקוח</th>
                          <th className="border-b px-3 py-2.5 text-right">חברה</th>
                          <th className="border-b px-3 py-2.5 text-right">מספר סוכן</th>
                          <th className="border-b px-3 py-2.5 text-right">מוצר</th>
                          <th className="border-b px-3 py-2.5 text-right">פרמיה/צבירה</th>
                          <th className="border-b px-3 py-2.5 text-right">עמלה</th>
                          <th className="border-b px-3 py-2.5 text-right">היסטוריה</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filtered.map((r, i) => {
                          const badge = anomalyBadge(r);
                          return (
                            <tr key={i} className="hover:bg-gray-50 transition-colors">
                              <td className="px-3 py-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${badge.color}`}>
                                  {badge.label}
                                </span>
                              </td>
                              <td className="px-3 py-2 font-mono text-xs text-gray-700">{r.policyNumberKey}</td>
                              <td className="px-3 py-2 text-gray-600">{r.customerId ?? '-'}</td>
                              <td className="px-3 py-2 text-gray-700">{r.fullName ?? '-'}</td>
                              <td className="px-3 py-2 text-gray-600">{r.company}</td>
                              <td className="px-3 py-2 text-gray-600">{r.agentCode ?? '-'}</td>
                              <td className="px-3 py-2 text-gray-600">{r.product ?? '-'}</td>
                              <td className={`px-3 py-2 text-right ${premiumColor(r.totalPremiumAmount, r.totalCommissionAmount)}`}>
                                {fmtNum(r.totalPremiumAmount)}
                              </td>
                              <td className={`px-3 py-2 text-right ${commissionColor(r.totalCommissionAmount)}`}>
                                {fmtNum(r.totalCommissionAmount)}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  onClick={() => setHistoryPolicy(r)}
                                  className="text-xs px-2.5 py-1 bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100"
                                >
                                  היסטוריה
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {historyPolicy && (
        <PolicyHistoryModal
          agentId={agentId}
          companyId={historyPolicy.companyId}
          policyNumberKey={historyPolicy.policyNumberKey}
          fullName={historyPolicy.fullName}
          customerId={historyPolicy.customerId}
          onClose={() => setHistoryPolicy(null)}
        />
      )}
    </>
  );
}