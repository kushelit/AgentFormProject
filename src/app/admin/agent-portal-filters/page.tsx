// app/admin/agent-portal-filters/page.tsx
'use client';

import React, { useEffect, useState } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import AdminGuard from '@/app/admin/_components/AdminGuard';

type CompanyOption = {
  id: string;
  name: string;
};

type FilterDoc = {
  agentId: string;
  companyId: string;
  companyName: string;
  agentCodes: string[];
  updatedAt?: any;
};

export default function AgentPortalFiltersPage() {
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [filters, setFilters] = useState<Record<string, FilterDoc>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string>('');
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  // שליפת חברות עם אוטומציה
  useEffect(() => {
    const load = async () => {
      const snap = await getDocs(
        query(collection(db, 'company'), where('automationEnabled', '==', true))
      );
      const rows: CompanyOption[] = snap.docs
        .map(d => ({ id: d.id, name: String(d.data().companyName || d.id) }))
        .sort((a, b) => a.name.localeCompare(b.name, 'he'));
      setCompanies(rows);
    };
    load();
  }, []);

  // שליפת פילטרים קיימים לסוכן
  useEffect(() => {
    if (!selectedAgentId) {
      setFilters({});
      setInputValues({});
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(
          query(collection(db, 'agentPortalFilters'), where('agentId', '==', selectedAgentId))
        );
        const result: Record<string, FilterDoc> = {};
        snap.docs.forEach(d => {
          const data = d.data() as FilterDoc;
          result[data.companyId] = data;
        });
        setFilters(result);
        setInputValues({});
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedAgentId]);

  const handleSave = async (company: CompanyOption) => {
    if (!selectedAgentId) return;

    const raw = String(inputValues[company.id] || '').trim();
    const codes = raw
      .split(/[\n,]+/)
      .map(c => c.trim())
      .filter(Boolean);

    if (!codes.length) {
      showToast('error', 'יש להזין לפחות קוד סוכן אחד');
      return;
    }

    setSaving(company.id);
    try {
      const docId = `${selectedAgentId}_${company.id}`;
      const payload: FilterDoc = {
        agentId: selectedAgentId,
        companyId: company.id,
        companyName: company.name,
        agentCodes: codes,
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'agentPortalFilters', docId), payload);
      setFilters(prev => ({ ...prev, [company.id]: payload }));
      setInputValues(prev => ({ ...prev, [company.id]: '' }));
      showToast('success', `✅ פילטר נשמר עבור ${company.name}`);
    } catch {
      showToast('error', 'שגיאה בשמירת הפילטר');
    } finally {
      setSaving('');
    }
  };

  const handleDelete = async (company: CompanyOption) => {
    if (!selectedAgentId) return;
    setSaving(company.id);
    try {
      const docId = `${selectedAgentId}_${company.id}`;
      await deleteDoc(doc(db, 'agentPortalFilters', docId));
      setFilters(prev => {
        const next = { ...prev };
        delete next[company.id];
        return next;
      });
      showToast('success', `פילטר הוסר עבור ${company.name}`);
    } catch {
      showToast('error', 'שגיאה במחיקת הפילטר');
    } finally {
      setSaving('');
    }
  };

  return (
    <AdminGuard>
      <div className="p-6 max-w-4xl mx-auto text-right font-sans" dir="rtl">

        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl shadow-lg text-white text-sm font-bold ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}>
            {toast.msg}
          </div>
        )}

        <header className="mb-6 border-b pb-4">
          <h1 className="text-2xl font-bold text-gray-800">פילטר מספרי סוכן לפי חברה</h1>
          <p className="text-sm text-gray-500 mt-1">
            הגדר אילו מספרי סוכן ייקלטו אוטומטית עבור כל חברה.
            אם אין פילטר — נקלטים כל המספרים.
          </p>
        </header>

        {/* בחירת סוכן */}
        <div className="mb-6 max-w-sm">
          <label className="block text-xs font-bold text-gray-500 mb-1">סוכן</label>
          <select
            value={selectedAgentId}
            onChange={handleAgentChange}
            className="w-full h-10 border border-gray-300 rounded-lg px-3 text-sm"
          >
            <option value="">-- בחר סוכן --</option>
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {!selectedAgentId ? (
          <div className="text-gray-400 text-sm">יש לבחור סוכן.</div>
        ) : loading ? (
          <div className="text-gray-400 text-sm">טוען...</div>
        ) : (
          <div className="space-y-4">
            {companies.map(company => {
              const existing = filters[company.id];
              const isSaving = saving === company.id;

              return (
                <div
                  key={company.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-800">{company.name}</span>
                      <span className="text-xs text-gray-400">({company.id})</span>
                    </div>
                    {existing && (
                      <span className="text-xs bg-green-50 text-green-700 border border-green-200 rounded-full px-2 py-0.5 font-medium">
                        פעיל
                      </span>
                    )}
                  </div>

                  {/* קודים קיימים */}
                  {existing?.agentCodes?.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {existing.agentCodes.map(code => (
                        <span
                          key={code}
                          className="bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-3 py-0.5 text-xs font-mono"
                        >
                          {code}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Input */}
                  <div className="flex gap-2 items-start">
                    <textarea
                      rows={2}
                      placeholder="הזן מספרי סוכן מופרדים בפסיק או שורה חדשה"
                      value={inputValues[company.id] || ''}
                      onChange={e =>
                        setInputValues(prev => ({ ...prev, [company.id]: e.target.value }))
                      }
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none"
                    />
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => handleSave(company)}
                        disabled={isSaving || !inputValues[company.id]?.trim()}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-blue-700 transition"
                      >
                        {isSaving ? '...' : existing ? 'עדכן' : 'שמור'}
                      </button>
                      {existing && (
                        <button
                          onClick={() => handleDelete(company)}
                          disabled={isSaving}
                          className="bg-red-50 text-red-600 border border-red-200 px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50 hover:bg-red-100 transition"
                        >
                          הסר
                        </button>
                      )}
                    </div>
                  </div>

                  {existing?.updatedAt && (
                    <div className="text-xs text-gray-400 mt-2">
                      עודכן לאחרונה: {
                        existing.updatedAt?.seconds
                          ? new Date(existing.updatedAt.seconds * 1000).toLocaleString('he-IL')
                          : '-'
                      }
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminGuard>
  );
}
