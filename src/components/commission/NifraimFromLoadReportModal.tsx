'use client';
// ═══════════════════════════════════════════════════════════════════
// src/components/commission/NifraimFromLoadReportModal.tsx
// "דוח נפרעים מטעינות" מתוך דף סיכום העמלות: חודש יחיד (פרסום / דיווח) + חברות,
// הורדה ישירה (/api/nifraimFromLoadReport) או שליחה במייל (/api/sendReport).
// ═══════════════════════════════════════════════════════════════════

import React, { useState } from 'react';
import Select from 'react-select';
import { useAuth } from '@/lib/firebase/AuthContext';
import { apiDownload, apiFetch } from '@/lib/apiFetch';
import NifraimMonthPicker, { useNifraimMonth } from '@/components/commission/NifraimMonthPicker';

type Props = {
  agentId: string;
  agentName?: string;
  companies: string[];
  onClose: () => void;
};

type Status = { type: 'success' | 'error'; text: string } | null;

export default function NifraimFromLoadReportModal({ agentId, agentName, companies, onClose }: Props) {
  const { user } = useAuth();
  const monthState = useNifraimMonth(agentId);
  const { basis, month } = monthState;

  const [selectedCompanies, setSelectedCompanies] = useState<{ value: string; label: string }[]>([]);
  const [emailTo, setEmailTo] = useState(user?.email || '');
  const [busy, setBusy] = useState<'download' | 'email' | null>(null);
  const [status, setStatus] = useState<Status>(null);

  const companyValues = selectedCompanies.map((c) => c.value);

  const download = async () => {
    if (!month) return;
    setBusy('download');
    setStatus(null);
    try {
      const qs = new URLSearchParams({ agentId, dateBasis: basis, month });
      companyValues.forEach((c) => qs.append('company', c));
      await apiDownload(`/api/nifraimFromLoadReport?${qs.toString()}`, `דוח_נפרעים_מטעינות_${month}.xlsx`);
      setStatus({ type: 'success', text: 'הקובץ הורד' });
    } catch (e: any) {
      setStatus({ type: 'error', text: e?.message || 'שגיאה בהורדת הדוח' });
    } finally {
      setBusy(null);
    }
  };

  const sendEmail = async () => {
    if (!month) return;
    if (!emailTo.trim()) {
      setStatus({ type: 'error', text: 'נדרש למלא כתובת מייל' });
      return;
    }
    setBusy('email');
    setStatus(null);
    try {
      const res = await apiFetch('/api/sendReport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportType: 'nifraimFromLoadReport',
          emailTo: emailTo.trim(),
          uid: user?.uid,
          agentId,
          agentName,
          dateBasis: basis,
          month,
          company: companyValues.length ? companyValues : undefined,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || 'שגיאה בשליחת הדוח');
      }
      setStatus({ type: 'success', text: `הדוח נשלח לכתובת ${emailTo.trim()}` });
    } catch (e: any) {
      setStatus({ type: 'error', text: e?.message || 'שגיאה בשליחת הדוח' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white w-[min(640px,96vw)] rounded-2xl shadow-2xl flex flex-col">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">📥 דוח נפרעים מטעינות</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              לפי לקוח, לפי פוליסה (כולל מוצר מקורי ומסווג) ולפי משפחה · חודש יחיד
            </p>
          </div>
          <button onClick={onClose} className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50">
            סגור
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 text-right">
          <div>
            <label className="block font-semibold text-sm mb-1">חודש:</label>
            <NifraimMonthPicker state={monthState} />
          </div>

          <div>
            <label className="block font-semibold text-sm mb-1">חברות (ריק = כל החברות):</label>
            <Select
              isMulti
              options={companies.map((name) => ({ value: name, label: name }))}
              value={selectedCompanies}
              onChange={(selected) => setSelectedCompanies(selected as any)}
              placeholder="כל החברות"
              className="basic-multi-select"
              classNamePrefix="select"
            />
          </div>

          <div className="flex flex-wrap items-end gap-3 pt-2 border-t">
            <button
              type="button"
              onClick={download}
              disabled={!month || !!busy}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700 disabled:opacity-50"
            >
              {busy === 'download' ? 'מכין קובץ…' : '⬇️ הורדה'}
            </button>

            <div className="flex items-end gap-2 mr-auto">
              <input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="כתובת מייל"
                className="input h-10 min-w-[220px]"
              />
              <button
                type="button"
                onClick={sendEmail}
                disabled={!month || !!busy}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
              >
                {busy === 'email' ? 'שולח…' : '✉️ שליחה במייל'}
              </button>
            </div>
          </div>

          {status && (
            <div
              className={`text-sm rounded-lg px-3 py-2 ${
                status.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {status.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
