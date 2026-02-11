'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from '@/hooks/useFetchAgentData';

type TemplateDoc = {
  id: string;
  Name?: string;
  type?: string;
  companyId: string; // תמיד string אצלך
  automationClass?: string;
  isactive?: boolean;
};

type CompanyDoc = {
  id: string;
  companyName: string;
};

type RunStatus =
  | 'queued'
  | 'otp_required'
  | 'running'
  | 'uploaded'
  | 'imported'
  | 'error';

type PortalImportRun = {
  id: string;
  agentId: string;
  companyId: string;
  templateId: string;
  automationClass: string;

  fromMonth: string;
  toMonth: string;

  status: RunStatus;

  otp?: {
    state?: 'none' | 'required' | 'submitted' | 'expired';
    submittedAt?: any;
  };

  createdAt?: any;
  updatedAt?: any;

  error?: {
    step?: string;
    message?: string;
  };
};

function tsToDisplay(ts: any): string {
  try {
    if (!ts) return '';
    if (ts instanceof Date) return ts.toLocaleString();
    if (ts && typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
    if (ts && typeof ts.seconds === 'number') return new Date(ts.seconds * 1000).toLocaleString();
    return '';
  } catch {
    return '';
  }
}

function monthNowYYYYMM(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export default function ImportCommissionAutoPage() {
  const { detail } = useAuth();
  const isAdmin = detail?.role === 'admin';

  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  const effectiveAgentId = useMemo(() => {
    // Admin בוחר סוכן, Agent "נעול" על עצמו (במערכת שלך לרוב detail.uid/agentId)
    // כאן נעדיף selectedAgentId אם הוא קיים, אחרת fallback ל-detail.uid (אם זה מזהה סוכן אצלך).
    if (isAdmin) return selectedAgentId || '';
    return (selectedAgentId || (detail as any)?.uid || (detail as any)?.agentId || '') as string;
  }, [isAdmin, selectedAgentId, detail]);

  const [companies, setCompanies] = useState<CompanyDoc[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('4'); // כלל default
  const [templates, setTemplates] = useState<TemplateDoc[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('clal_briut'); // בריאות default

  const [fromMonth, setFromMonth] = useState<string>(monthNowYYYYMM());
  const [toMonth, setToMonth] = useState<string>(monthNowYYYYMM());

  const [runs, setRuns] = useState<PortalImportRun[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // OTP modal
  const [otpRunId, setOtpRunId] = useState<string | null>(null);
  const [otpValue, setOtpValue] = useState<string>('');
  const [otpSubmitting, setOtpSubmitting] = useState<boolean>(false);

  // Load companies (for dropdown labels)
  useEffect(() => {
    (async () => {
      const snap = await getDocs(collection(db, 'company'));
      const arr: CompanyDoc[] = snap.docs.map((d) => ({
        id: d.id,
        companyName: String((d.data() as any)?.companyName || ''),
      }));
      // sort by name
      arr.sort((a, b) => a.companyName.localeCompare(b.companyName, 'he'));
      setCompanies(arr);
    })().catch(() => {});
  }, []);

  // Load active templates with automationClass (filter by companyId)
  useEffect(() => {
    (async () => {
      if (!selectedCompanyId) {
        setTemplates([]);
        setSelectedTemplateId('');
        return;
      }

      const qy = query(
        collection(db, 'commissionTemplates'),
        where('isactive', '==', true),
        where('companyId', '==', String(selectedCompanyId))
      );

      const snap = await getDocs(qy);

      const arr: TemplateDoc[] = snap.docs
        .map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            Name: data?.Name,
            type: data?.type,
            companyId: String(data?.companyId || ''),
            automationClass: String(data?.automationClass || ''),
            isactive: !!data?.isactive,
          };
        })
        .filter((t) => !!t.automationClass); // רק תבניות שאפשר לאוטומציה

      // sort
      arr.sort((a, b) => String(a.Name || a.type || '').localeCompare(String(b.Name || b.type || ''), 'he'));

      setTemplates(arr);

      // אם התבנית הנוכחית לא קיימת לחברה הזו—נבחר ראשונה
      if (!arr.some((t) => t.id === selectedTemplateId)) {
        setSelectedTemplateId(arr[0]?.id || '');
      }
    })().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompanyId]);

  // Subscribe runs (realtime)
  useEffect(() => {
    if (!effectiveAgentId) {
      setRuns([]);
      return;
    }

    // Admin: אפשר להראות הכל — אבל עדיף עדיין לסנן לפי agentId שנבחר,
    // אחרת זה יכול להיות עמוס.
    const base = collection(db, 'portalImportRuns');

    const qy = isAdmin
      ? query(base, where('agentId', '==', String(effectiveAgentId)), orderBy('createdAt', 'desc'))
      : query(base, where('agentId', '==', String(effectiveAgentId)), orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const arr: PortalImportRun[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            agentId: String(data.agentId || ''),
            companyId: String(data.companyId || ''),
            templateId: String(data.templateId || ''),
            automationClass: String(data.automationClass || ''),
            fromMonth: String(data.fromMonth || ''),
            toMonth: String(data.toMonth || ''),
            status: (data.status || 'queued') as RunStatus,
            otp: data.otp || undefined,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            error: data.error || undefined,
          };
        });
        setRuns(arr);
      },
      () => {}
    );

    return () => unsub();
  }, [effectiveAgentId, isAdmin]);

  const selectedCompanyName = useMemo(() => {
    return companies.find((c) => c.id === selectedCompanyId)?.companyName || '';
  }, [companies, selectedCompanyId]);

  const selectedTemplateName = useMemo(() => {
    const t = templates.find((x) => x.id === selectedTemplateId);
    return String(t?.Name || t?.type || '');
  }, [templates, selectedTemplateId]);

  const canStart = Boolean(effectiveAgentId && selectedCompanyId && selectedTemplateId && fromMonth && toMonth);

  async function startRun() {
    if (!canStart) return;
    setLoading(true);
    try {
      const res = await fetch('/api/portal-import/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: effectiveAgentId,
          templateId: selectedTemplateId,
          fromMonth,
          toMonth,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        alert(json?.error || 'שגיאה ביצירת ריצה');
        return;
      }

      // הצלחה — הריצה תופיע מייד בטבלה בגלל onSnapshot
    } catch (e: any) {
      alert(e?.message || 'שגיאה לא ידועה');
    } finally {
      setLoading(false);
    }
  }

  function openOtp(runId: string) {
    setOtpRunId(runId);
    setOtpValue('');
  }

  function closeOtp() {
    setOtpRunId(null);
    setOtpValue('');
    setOtpSubmitting(false);
  }

  async function submitOtp() {
    if (!otpRunId) return;
    const otp = otpValue.trim();
    if (!otp) return;

    setOtpSubmitting(true);
    try {
      const res = await fetch(`/api/portal-import/${otpRunId}/otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        alert(json?.error || 'שגיאה בשליחת OTP');
        return;
      }

      closeOtp();
    } catch (e: any) {
      alert(e?.message || 'שגיאה לא ידועה');
    } finally {
      setOtpSubmitting(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto text-right">
      <h1 className="text-2xl font-bold mb-2">טעינת עמלות אוטומטית (פורטלים)</h1>
      <p className="text-gray-600 mb-6">
        יצירת ריצה אוטומטית להורדת דוחות מהפורטל + העלאה/ייבוא (בשלב ראשון: מעטפת + OTP).
      </p>

      {/* Filters / Start */}
      <div className="border rounded p-4 mb-6 bg-white">
        {isAdmin && (
          <div className="mb-4">
            <label className="block font-semibold mb-1">בחר סוכן:</label>
            <select
              value={selectedAgentId || ''}
              onChange={handleAgentChange}
              className="border rounded px-3 py-2 w-full"
            >
              <option value="">בחר סוכן</option>
              {agents.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block font-semibold mb-1">חברה:</label>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="border rounded px-3 py-2 w-full"
            >
              {/* אפשר להשאיר default "4" לכלל */}
              {companies.length === 0 && <option value="4">כלל (4)</option>}
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName} ({c.id})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1">תבנית אוטומציה:</label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="border rounded px-3 py-2 w-full"
            >
              {templates.length === 0 && <option value="">אין תבניות עם automationClass</option>}
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {String(t.Name || t.type || t.id)}
                </option>
              ))}
            </select>
            <div className="text-xs text-gray-500 mt-1">
              מציג רק תבניות פעילות שיש להן <b>automationClass</b>.
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">טווח חודשים (YYYY-MM):</label>
            <div className="flex gap-2">
              <input
                value={fromMonth}
                onChange={(e) => setFromMonth(e.target.value)}
                placeholder="2025-01"
                className="border rounded px-3 py-2 w-1/2"
              />
              <input
                value={toMonth}
                onChange={(e) => setToMonth(e.target.value)}
                placeholder="2025-01"
                className="border rounded px-3 py-2 w-1/2"
              />
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            onClick={startRun}
            disabled={!canStart || loading}
            className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          >
            {loading ? 'יוצר ריצה...' : 'התחל ריצה'}
          </button>
        </div>

        <div className="mt-2 text-xs text-gray-500">
          סוכן: <b>{effectiveAgentId || '—'}</b> | חברה: <b>{selectedCompanyName || selectedCompanyId || '—'}</b> | תבנית:{' '}
          <b>{selectedTemplateName || selectedTemplateId || '—'}</b>
        </div>
      </div>

      {/* Runs table */}
      <div className="border rounded p-4 bg-white">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">ריצות</h2>
          <div className="text-sm text-gray-600">סה״כ: {runs.length}</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-2 py-2">Run</th>
                <th className="border px-2 py-2">חברה</th>
                <th className="border px-2 py-2">תבנית</th>
                <th className="border px-2 py-2">טווח</th>
                <th className="border px-2 py-2">סטטוס</th>
                <th className="border px-2 py-2">עודכן</th>
                <th className="border px-2 py-2">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr>
                  <td className="border px-2 py-3 text-center text-gray-500" colSpan={7}>
                    אין ריצות להצגה
                  </td>
                </tr>
              ) : (
                runs.map((r) => {
                  const needsOtp = r.status === 'otp_required';
                  return (
                    <tr key={r.id}>
                      <td className="border px-2 py-2 font-mono">{r.id.slice(0, 8)}…</td>
                      <td className="border px-2 py-2">{r.companyId}</td>
                      <td className="border px-2 py-2">{r.templateId}</td>
                      <td className="border px-2 py-2">
                        {r.fromMonth} → {r.toMonth}
                      </td>
                      <td className="border px-2 py-2">
                        <span className={r.status === 'error' ? 'text-red-700 font-semibold' : ''}>
                          {r.status}
                        </span>
                        {r.status === 'error' && r.error?.message && (
                          <div className="text-xs text-red-700 mt-1">{r.error.message}</div>
                        )}
                      </td>
                      <td className="border px-2 py-2">{tsToDisplay(r.updatedAt) || tsToDisplay(r.createdAt)}</td>
                      <td className="border px-2 py-2">
                        {needsOtp ? (
                          <button
                            className="px-3 py-1 rounded border"
                            onClick={() => openOtp(r.id)}
                          >
                            הזן OTP
                          </button>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* OTP Modal */}
      {otpRunId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded shadow max-w-md w-full p-4 text-right">
            <div className="text-lg font-semibold mb-2">הזנת OTP</div>
            <div className="text-sm text-gray-600 mb-3">
              ריצה: <span className="font-mono">{otpRunId}</span>
            </div>

            <input
              value={otpValue}
              onChange={(e) => setOtpValue(e.target.value)}
              placeholder="לדוגמה: 123456"
              className="border rounded px-3 py-2 w-full"
            />

            <div className="mt-4 flex gap-2 justify-end">
              <button
                onClick={closeOtp}
                className="px-4 py-2 rounded border"
                disabled={otpSubmitting}
              >
                ביטול
              </button>
              <button
                onClick={submitOtp}
                className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
                disabled={otpSubmitting || !otpValue.trim()}
              >
                {otpSubmitting ? 'שולח...' : 'שלח OTP'}
              </button>
            </div>

            <div className="mt-2 text-xs text-gray-500">
              ה-OTP נשמר זמנית לריצה, וה-Runner יקרא אותו וימחק.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
