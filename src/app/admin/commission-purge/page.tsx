// MagicSale — Commission Admin Purge Page
// מחיקת נתוני עמלות גורפת לפי סוכן / חברה / חודש / תבנית
// קובץ: app/admin/commission-purge/page.tsx

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/firebase/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  writeBatch,
  doc,
  getDoc,
} from 'firebase/firestore';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { Button } from '@/components/Button/Button';
import DialogNotification from '@/components/DialogNotification';
import AdminGuard from '@/app/admin/_components/AdminGuard';

type DialogKind = 'info' | 'warning' | 'success' | 'error';
type DialogState = {
  type: DialogKind;
  title: string;
  message: React.ReactNode;
};

export default function CommissionPurgeAdminPage() {
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  // Filters
  const [companyId, setCompanyId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [validMonth, setValidMonth] = useState('');

  // Templates
  const [templates, setTemplates] = useState<
    { id: string; companyId: string; companyName: string; Name?: string; type?: string }[]
  >([]);

  // State
  const [scanRunning, setScanRunning] = useState(false);
  const [deleteRunning, setDeleteRunning] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [scan, setScan] = useState<{
    externalCount: number;
    commissionSummariesCount: number;
    policySummariesCount: number;
    monthsFound: string[];
  } | null>(null);

  // Helpers
  const sanitizeMonth = (m?: string) => (m || '').replace(/\//g, '-');

  const uniqueCompanies = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const t of templates) {
      if (t.companyId && !map.has(t.companyId)) {
        map.set(t.companyId, { id: t.companyId, name: t.companyName });
      }
    }
    return Array.from(map.values());
  }, [templates]);

  const filteredTemplates = useMemo(
    () => templates.filter((t) => !companyId || t.companyId === companyId),
    [templates, companyId]
  );

  async function deleteRefsInChunks(refs: any[]) {
    const CHUNK = 450;
    for (let i = 0; i < refs.length; i += CHUNK) {
      const batch = writeBatch(db);
      for (const r of refs.slice(i, i + CHUNK)) batch.delete(r);
      await batch.commit();
    }
  }

  // Load templates (active)
  useEffect(() => {
    (async () => {
      const snap = await getDocs(
        query(collection(db, 'commissionTemplates'), where('isactive', '==', true))
      );
      const list: any[] = [];
      for (const d of snap.docs) {
        const data: any = d.data();
        const cid = data.companyId || '';
        let companyName = '';
        if (cid) {
          const compSnap = await getDoc(doc(db, 'company', cid));
          companyName = compSnap.exists() ? compSnap.data().companyName || '' : '';
        }
        list.push({
          id: d.id,
          companyId: cid,
          companyName,
          Name: data.Name || '',
          type: data.type || '',
        });
      }
      setTemplates(list);
    })();
  }, []);

  // ===== Scan =====
  async function handleScan() {
    if (!selectedAgentId) {
      setDialog({ type: 'warning', title: 'חסר סוכן', message: 'יש לבחור סוכן לפני סריקה.' });
      return;
    }

    setScanRunning(true);
    try {
      const externalFilters: any[] = [where('agentId', '==', selectedAgentId)];
      if (companyId) externalFilters.push(where('companyId', '==', companyId));
      if (templateId) externalFilters.push(where('templateId', '==', templateId));
      if (validMonth) externalFilters.push(where('validMonth', '==', sanitizeMonth(validMonth)));

      const extSnap = await getDocs(query(collection(db, 'externalCommissions'), ...externalFilters));
      const externalCount = extSnap.size;

      const reportMonthsSet = new Set<string>();
      if (validMonth) {
        extSnap.forEach((d) => {
          const rm = sanitizeMonth((d.data() as any)?.reportMonth || '');
          if (rm) reportMonthsSet.add(rm);
        });
      }

      const baseSummaryFilters: any[] = [where('agentId', '==', selectedAgentId)];
      if (companyId) baseSummaryFilters.push(where('companyId', '==', companyId));
      if (templateId) baseSummaryFilters.push(where('templateId', '==', templateId));

      let commissionSummariesCount = 0;
      let policySummariesCount = 0;

      if (reportMonthsSet.size > 0) {
        for (const rm of Array.from(reportMonthsSet)) {
          const q1 = await getDocs(
            query(collection(db, 'commissionSummaries'), ...baseSummaryFilters, where('reportMonth', '==', rm))
          );
          commissionSummariesCount += q1.size;
          const q2 = await getDocs(
            query(collection(db, 'policyCommissionSummaries'), ...baseSummaryFilters, where('reportMonth', '==', rm))
          );
          policySummariesCount += q2.size;
        }
      } else {
        const q1 = await getDocs(query(collection(db, 'commissionSummaries'), ...baseSummaryFilters));
        const q2 = await getDocs(query(collection(db, 'policyCommissionSummaries'), ...baseSummaryFilters));
        commissionSummariesCount = q1.size;
        policySummariesCount = q2.size;
      }

      setScan({
        externalCount,
        commissionSummariesCount,
        policySummariesCount,
        monthsFound: Array.from(reportMonthsSet),
      });
    } catch (e: any) {
      setDialog({ type: 'error', title: 'שגיאת סריקה', message: String(e?.message || e) });
    } finally {
      setScanRunning(false);
    }
  }

  // ===== Delete =====
  async function handleDelete() {
    if (!selectedAgentId) {
      setDialog({ type: 'warning', title: 'חסר סוכן', message: 'יש לבחור סוכן לפני מחיקה.' });
      return;
    }
    if (confirmText !== 'DELETE') {
      setDialog({ type: 'warning', title: 'אישור מחיקה', message: 'נא להקליד DELETE בתיבת האישור.' });
      return;
    }

    setDeleteRunning(true);

    try {
      const externalFilters: any[] = [where('agentId', '==', selectedAgentId)];
      if (companyId) externalFilters.push(where('companyId', '==', companyId));
      if (templateId) externalFilters.push(where('templateId', '==', templateId));
      if (validMonth) externalFilters.push(where('validMonth', '==', sanitizeMonth(validMonth)));

      const extSnap = await getDocs(query(collection(db, 'externalCommissions'), ...externalFilters));
      const reportMonthsSet = new Set<string>();
      if (validMonth) {
        extSnap.forEach((d) => {
          const rm = sanitizeMonth((d.data() as any)?.reportMonth || '');
          if (rm) reportMonthsSet.add(rm);
        });
      }

      const toDeleteRefs: any[] = [];
      extSnap.forEach((d) => toDeleteRefs.push(d.ref));

      const baseSummaryFilters: any[] = [where('agentId', '==', selectedAgentId)];
      if (companyId) baseSummaryFilters.push(where('companyId', '==', companyId));
      if (templateId) baseSummaryFilters.push(where('templateId', '==', templateId));

      if (reportMonthsSet.size > 0) {
        for (const rm of Array.from(reportMonthsSet)) {
          const s1 = await getDocs(
            query(collection(db, 'commissionSummaries'), ...baseSummaryFilters, where('reportMonth', '==', rm))
          );
          s1.forEach((d) => toDeleteRefs.push(d.ref));
          const s2 = await getDocs(
            query(collection(db, 'policyCommissionSummaries'), ...baseSummaryFilters, where('reportMonth', '==', rm))
          );
          s2.forEach((d) => toDeleteRefs.push(d.ref));
        }
      } else {
        const s1 = await getDocs(query(collection(db, 'commissionSummaries'), ...baseSummaryFilters));
        const s2 = await getDocs(query(collection(db, 'policyCommissionSummaries'), ...baseSummaryFilters));
        s1.forEach((d) => toDeleteRefs.push(d.ref));
        s2.forEach((d) => toDeleteRefs.push(d.ref));
      }

      if (toDeleteRefs.length === 0) {
        setDialog({ type: 'info', title: 'לא נמצאו רשומות', message: 'אין מה למחוק לפי המסננים שבחרת.' });
        setDeleteRunning(false);
        return;
      }

      await deleteRefsInChunks(toDeleteRefs);

      setDialog({
        type: 'success',
        title: 'נמחק בהצלחה',
        message: `נמחקו ${toDeleteRefs.length} רשומות משלושת האוספים.`,
      });

      setScan(null);
      setConfirmText('');
    } catch (e: any) {
      setDialog({ type: 'error', title: 'שגיאת מחיקה', message: String(e?.message || e) });
    } finally {
      setDeleteRunning(false);
    }
  }

  // ===== Render =====
  return (
    <AdminGuard>
      <div className="p-6 max-w-4xl mx-auto text-right" dir="rtl">
        <h1 className="text-2xl font-bold mb-2">ניהול מחיקות קבצי עמלות</h1>
        <p className="text-gray-600 mb-6">
          מחיקה גורפת של טעינות עמלות לפי סוכן (חובה) ולפי חברה / חודש תוקף / תבנית (אופציונלי).
          המחיקה תתבצע משלושה אוספים: <code>externalCommissions</code>,{' '}
          <code>commissionSummaries</code>, <code>policyCommissionSummaries</code>.
        </p>

        {/* סוכן */}
        <div className="mb-4">
          <label className="block font-semibold mb-1">בחר סוכן (חובה):</label>
          <select value={selectedAgentId} onChange={handleAgentChange} className="select-input w-full">
            <option value="">בחר סוכן</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* חברה */}
        <div className="mb-4">
          <label className="block font-semibold mb-1">חברה (אופציונלי):</label>
          <select
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setTemplateId('');
            }}
            className="select-input w-full"
          >
            <option value="">כל החברות</option>
            {uniqueCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* תבנית */}
        <div className="mb-4">
          <label className="block font-semibold mb-1">תבנית (אופציונלי):</label>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="select-input w-full"
          >
            <option value="">כל התבניות</option>
            {filteredTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.Name || t.type || t.id}
              </option>
            ))}
          </select>
        </div>

        {/* חודש תוקף */}
        <div className="mb-6">
          <label className="block font-semibold mb-1">חודש תוקף (אופציונלי):</label>
          <input
            type="month"
            value={validMonth}
            onChange={(e) => setValidMonth(e.target.value)}
            className="select-input w-full"
          />
          <div className="text-xs text-gray-500 mt-1">
            אם נבחר חודש תוקף, המחיקה תתבסס על <code>validMonth</code>,  
            ובסיכומים תימחקנה הרשומות רק לחודשי <strong>reportMonth</strong> הנגזרים משם.
          </div>
        </div>

        {/* פעולות */}
        <div className="flex gap-2 items-center">
          <Button
            text={scanRunning ? 'סורק...' : 'סריקה מקדימה'}
            type="secondary"
            onClick={handleScan}
            disabled={!selectedAgentId || scanRunning || deleteRunning}
          />
          <input
            placeholder='הקלד/י "DELETE" לאישור'
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            className="border px-3 py-2 rounded text-sm"
            style={{ direction: 'ltr' }}
          />
          <Button
            text={deleteRunning ? 'מוחק...' : 'מחק כעת'}
            type="danger"
            onClick={handleDelete}
            disabled={!selectedAgentId || deleteRunning || scanRunning || confirmText !== 'DELETE'}
          />
        </div>

        {/* תוצאות סריקה */}
        {scan && (
          <div className="mt-6 border rounded p-4 bg-gray-50">
            <h3 className="font-semibold mb-2">תוצאות סריקה</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div className="p-3 bg-white rounded border">
                <div className="text-gray-500">externalCommissions</div>
                <div className="text-xl font-bold">{scan.externalCount.toLocaleString()}</div>
              </div>
              <div className="p-3 bg-white rounded border">
                <div className="text-gray-500">commissionSummaries</div>
                <div className="text-xl font-bold">{scan.commissionSummariesCount.toLocaleString()}</div>
              </div>
              <div className="p-3 bg-white rounded border">
                <div className="text-gray-500">policyCommissionSummaries</div>
                <div className="text-xl font-bold">{scan.policySummariesCount.toLocaleString()}</div>
              </div>
            </div>
            {scan.monthsFound.length > 0 && (
              <div className="mt-3 text-xs text-gray-600">
                חודשי reportMonth שנמצאו: {scan.monthsFound.join(', ')}
              </div>
            )}
          </div>
        )}

        {/* Dialog */}
        {dialog && (
          <DialogNotification
            type={dialog.type}
            title={dialog.title}
            message={dialog.message ?? ''}
            onConfirm={() => setDialog(null)}
            onCancel={() => setDialog(null)}
            hideCancel
          />
        )}

        <div className="mt-8 text-sm text-gray-500">
          טיפ: להשמדת כלל הנתונים לסוכן — השאר את שדות החברה/תבנית/חודש ריקים,  
          בצע סריקה מקדימה ואשר מחיקה. 🧨
        </div>

        <div className="mt-4 text-sm">
          <Link href="/Help/commission-import" className="underline text-blue-600" target="_blank">
            מדריך טעינות עמלות
          </Link>
        </div>
      </div>
    </AdminGuard>
  );
}
