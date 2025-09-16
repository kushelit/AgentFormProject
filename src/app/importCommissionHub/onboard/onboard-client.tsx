// app/importCommissionHub/onboard/page.tsx  (או היכן ש-OnboardClient נמצא)
'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase/firebase';
import { collection, getDoc, doc, getDocs, query, where } from 'firebase/firestore';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { useAuth } from '@/lib/firebase/AuthContext';
import {
  fetchProposalsFromSummaries,
  fetchExistingCustomerIds,
  createCustomerAndSalesFromProposal,
  type NameOrder,
} from '@/services/onboardFromReports';

type CommissionTemplateOption = {
  id: string;
  companyName: string;
  companyId: string;
  type: string;
  Name?: string;
  automationClass?: string;
};

type Props = { searchParams: Record<string, string> };

export default function OnboardClient({ searchParams }: Props) {
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  const [reportMonth, setReportMonth] = useState(searchParams.reportMonth || searchParams.repYm || '');
  const [templateOptions, setTemplateOptions] = useState<CommissionTemplateOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(searchParams.companyId || '');
  const [templateId, setTemplateId] = useState(searchParams.templateId || '');

  // ✅ חדש: סינון לפי ת"ז
  const [customerId, setCustomerId] = useState(searchParams.customerId || '');

  const [nameOrder, setNameOrder] = useState<NameOrder>('firstNameFirst');
  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState<any[]>([]);
  const [missing, setMissing] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const qy = query(collection(db, 'commissionTemplates'), where('isactive', '==', true));
      const snapshot = await getDocs(qy);

      const templates: CommissionTemplateOption[] = [];
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const companyId = data.companyId;
        let companyName = '';
        if (companyId) {
          const companySnap = await getDoc(doc(db, 'company', companyId));
          companyName = companySnap.exists() ? companySnap.data().companyName || '' : '';
        }
        templates.push({
          id: docSnap.id,
          companyId,
          companyName,
          type: data.type || '',
          Name: data.Name || '',
          automationClass: data.automationClass || '',
        });
      }
      setTemplateOptions(templates);
      if (templates.every(t => t.id !== templateId)) setTemplateId('');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uniqueCompanies = useMemo(
    () =>
      Array.from(
        new Map(templateOptions.map(t => [t.companyId, { id: t.companyId, name: t.companyName }])).values()
      ),
    [templateOptions]
  );
  const filteredTemplates = useMemo(
    () => templateOptions.filter(t => t.companyId === selectedCompanyId),
    [templateOptions, selectedCompanyId]
  );

  useEffect(() => {
    if (searchParams.agentId && selectedAgentId !== searchParams.agentId) {
      handleAgentChange({ target: { value: searchParams.agentId } } as any);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.agentId]);

  async function scan() {
    if (!selectedAgentId || !reportMonth) {
      alert('יש לבחור סוכן וחודש דיווח');
      return;
    }
    setLoading(true);
    try {
      const all = await fetchProposalsFromSummaries({
        agentId: selectedAgentId,
        reportMonth,
        companyId: selectedCompanyId || undefined,
        templateId: templateId || undefined,
        customerId: customerId ? customerId : undefined, // ✅
      });
      setProposals(all);

      const existing = await fetchExistingCustomerIds(selectedAgentId, all.map(p => p.customerId));
      const miss = all.filter(p => !existing.has(p.customerId));
      setMissing(miss);

      if (all.length && miss.length === 0) {
        alert('לא נמצאו לקוחות חסרים עבור הסינון שבחרת.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function createOne(p: any) {
    setLoading(true);
    try {
      await createCustomerAndSalesFromProposal({ agentId: selectedAgentId!, nameOrder, proposal: p });
      setMissing(prev => prev.filter(x => x.customerId !== p.customerId));
    } finally {
      setLoading(false);
    }
  }

  async function createAll() {
    if (!missing.length) return;
    setLoading(true);
    try {
      for (const p of missing) {
        await createCustomerAndSalesFromProposal({ agentId: selectedAgentId!, nameOrder, proposal: p });
      }
      setMissing([]);
    } finally {
      setLoading(false);
    }
  }

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (selectedAgentId) p.set('agentId', selectedAgentId);
    if (reportMonth) p.set('reportMonth', reportMonth);
    if (selectedCompanyId) p.set('companyId', selectedCompanyId);
    if (templateId) p.set('templateId', templateId);
    if (customerId) p.set('customerId', customerId); // ✅
    return p.toString();
  }, [selectedAgentId, reportMonth, selectedCompanyId, templateId, customerId]);

  return (
    <div dir="rtl" className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">הקמת לקוחות ועסקאות מטעינות</h1>

      <div className="mb-4 bg-white border rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* סוכן */}
        <label className="flex flex-col">
          <span className="text-xs text-gray-500 mb-1">בחר סוכן</span>
          <select value={selectedAgentId || ''} onChange={handleAgentChange} className="border rounded px-2 h-10">
            {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
            {agents.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </label>

        {/* חודש דיווח */}
        <label className="flex flex-col">
          <span className="text-xs text-gray-500 mb-1">חודש דיווח</span>
          <input type="month" className="border rounded px-2 h-10" value={reportMonth} onChange={e => setReportMonth(e.target.value)} />
        </label>

        {/* חברה */}
        <label className="flex flex-col">
          <span className="text-xs text-gray-500 mb-1">חברה (אופציונלי)</span>
          <select
            value={selectedCompanyId}
            onChange={e => { setSelectedCompanyId(e.target.value); setTemplateId(''); }}
            className="border rounded px-2 h-10"
          >
            <option value="">כל החברות</option>
            {uniqueCompanies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        {/* תבנית */}
        <label className="flex flex-col">
          <span className="text-xs text-gray-500 mb-1">תבנית (אופציונלי)</span>
          <select value={templateId} onChange={e => setTemplateId(e.target.value)} className="border rounded px-2 h-10">
            <option value="">כל התבניות</option>
            {filteredTemplates.map(t => (
              <option key={t.id} value={t.id}>{t.Name || t.type}</option>
            ))}
          </select>
        </label>

        {/* ✅ ת"ז לקוח (אופציונלי) */}
        <label className="flex flex-col md:col-span-2">
          <span className="text-xs text-gray-500 mb-1">ת״ז לקוח (אופציונלי)</span>
          <input
            inputMode="numeric"
            className="border rounded px-2 h-10"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value.replace(/\D/g, ''))}
            placeholder="לדוגמה: 065667891"
            maxLength={9}
          />
        </label>

        {/* סריקה + סדר שם מלא */}
        <div className="flex items-end gap-3">
          <button className="h-10 px-3 border rounded bg-blue-600 text-white" onClick={scan} disabled={loading}>
            {loading ? 'סורק…' : 'סריקה'}
          </button>
          <label className="text-sm flex items-center gap-2">
            סדר שם מלא:
            <select className="border rounded h-10 px-2" value={nameOrder} onChange={e => setNameOrder(e.target.value as NameOrder)}>
              <option value="firstNameFirst">שם פרטי תחילה</option>
              <option value="lastNameFirst">שם משפחה תחילה</option>
            </select>
          </label>
          <div className="text-xs text-gray-500">
            קישור ישיר: <a className="underline" href={`/onboard?${qs}`}>/onboard?{qs}</a>
          </div>
        </div>
      </div>

      {missing.length > 0 && (
        <div className="mb-3 flex items-center justify-between">
          <div>נמצאו <b>{missing.length}</b> לקוחות חסרים</div>
          <button className="h-9 px-3 border rounded bg-emerald-600 text-white" onClick={createAll} disabled={loading}>
            הקם את כולם
          </button>
        </div>
      )}

      <div className="bg-white border rounded-xl p-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="p-2 text-right">לקוח</th>
              <th className="p-2 text-right">שם מלא</th>
              <th className="p-2 text-right"># פוליסות</th>
              <th className="p-2 text-right">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {missing.map(p => (
              <tr key={p.customerId} className="border-t">
                <td className="p-2">{p.customerId}</td>
                <td className="p-2">{p.fullName || '—'}</td>
                <td className="p-2">{p.policies.length}</td>
                <td className="p-2">
                  <button className="h-8 px-3 border rounded" onClick={() => createOne(p)} disabled={loading}>
                    הקם לקוח + {p.policies.length} עסקאות
                  </button>
                </td>
              </tr>
            ))}
            {missing.length === 0 && (
              <tr>
                <td className="p-4 text-gray-500" colSpan={4}>אין לקוחות חסרים להצגה.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
