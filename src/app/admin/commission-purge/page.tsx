// MagicSale — Commission Admin Purge Page
// מחיקת נתוני עמלות גורפת לפי סוכן / חברה / חודש / תבנית
// + ניהול ריצות טעינה לפי מספר טעינה / טוען
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
  deleteDoc,
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

interface CommissionImportRun {
  runId: string;
  createdAt?: { seconds: number };
  agentName: string;
  agentId: string;
  createdBy: string;
  company: string;
  templateName: string;
  reportMonth?: string;
  externalCount?: number;
  commissionSummariesCount?: number;
  policySummariesCount?: number;
}

export default function CommissionPurgeAdminPage() {
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  // ===== Filters (חלק עליון – מחיקה גורפת לפי פילטרים) =====
  const [companyId, setCompanyId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [validMonth, setValidMonth] = useState('');

  // Templates
  const [templates, setTemplates] = useState<
    { id: string; companyId: string; companyName: string; Name?: string; type?: string }[]
  >([]);

  // State – מחיקה גורפת
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

  // ===== State – ניהול ריצות טעינת עמלות (חלק תחתון) =====
  const [commissionRuns, setCommissionRuns] = useState<CommissionImportRun[]>([]);
  const [commissionRunsLoading, setCommissionRunsLoading] = useState(true);
  const [runDeleteDialogOpen, setRunDeleteDialogOpen] = useState(false);
  const [selectedRun, setSelectedRun] = useState<CommissionImportRun | null>(null);
  const [runDeleteLoading, setRunDeleteLoading] = useState(false);

  // פילטרים לטבלת ריצות טעינה
  const [searchText, setSearchText] = useState('');
  const [uploaderFilter, setUploaderFilter] = useState('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');

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

  // ===== Load templates (active) =====
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

  // ===== Scan (חלק עליון) =====
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

  // ===== Delete (חלק עליון) =====
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

  // ===== ניהול ריצות טעינת עמלות – Fetch =====
  const fetchCommissionRuns = async () => {
    setCommissionRunsLoading(true);
    const snapshot = await getDocs(collection(db, 'commissionImportRuns'));

    const data: CommissionImportRun[] = snapshot.docs.map((d) => {
      const docData = d.data() as any;

      return {
        runId: docData.runId || d.id,
        createdAt: docData.createdAt,
        agentName: docData.agentName || '-',
        agentId: docData.agentId || '',
        createdBy: docData.createdBy || '',
        company: docData.company || '',
        templateName: docData.templateName || '',
        reportMonth: docData.reportMonth,
        externalCount: docData.externalCount,
        commissionSummariesCount: docData.commissionSummariesCount,
        policySummariesCount: docData.policySummariesCount,
      };
    });

    data.sort((a, b) => {
      const aSec = a.createdAt?.seconds ?? 0;
      const bSec = b.createdAt?.seconds ?? 0;
      return bSec - aSec;
    });

    setCommissionRuns(data);
    setCommissionRunsLoading(false);
  };

  // initial load for runs list
  useEffect(() => {
    fetchCommissionRuns();
  }, []);

  // פילטור בצד לקוח לריצות טעינה
  const filteredCommissionRuns = useMemo(() => {
    return commissionRuns.filter((run) => {
      const text = searchText.trim().toLowerCase();
      const uploader = uploaderFilter.trim().toLowerCase();

      if (text) {
        const haystack = [
          run.runId,
          run.agentName,
          run.company,
          run.templateName,
          run.reportMonth || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(text)) return false;
      }

      if (uploader) {
        if (!run.createdBy.toLowerCase().includes(uploader)) return false;
      }

      if (dateFrom) {
        const fromTs = new Date(dateFrom + 'T00:00:00').getTime();
        const created = run.createdAt ? run.createdAt.seconds * 1000 : 0;
        if (created < fromTs) return false;
      }

      if (dateTo) {
        const toTs = new Date(dateTo + 'T23:59:59').getTime();
        const created = run.createdAt ? run.createdAt.seconds * 1000 : 0;
        if (created > toTs) return false;
      }

      return true;
    });
  }, [commissionRuns, searchText, uploaderFilter, dateFrom, dateTo]);

  // מחיקת ריצה ספציפית לפי runId מכל שלושת האוספים + רשומת הריצה
  const deleteByRunIdInChunks = async (collectionName: string, runId: string) => {
    const qy = query(collection(db, collectionName), where('runId', '==', runId));
    const snap = await getDocs(qy);
    if (snap.empty) return;

    const CHUNK = 450;
    const docs = snap.docs;

    for (let i = 0; i < docs.length; i += CHUNK) {
      const batch = writeBatch(db);
      for (const d of docs.slice(i, i + CHUNK)) {
        batch.delete(d.ref);
      }
      await batch.commit();
    }
  };

  const handleRunDeleteClick = (run: CommissionImportRun) => {
    setSelectedRun(run);
    setRunDeleteDialogOpen(true);
  };

  const handleRunDeleteConfirm = async () => {
    if (!selectedRun) return;
    setRunDeleteLoading(true);
    const { runId } = selectedRun;

    try {
      await deleteByRunIdInChunks('externalCommissions', runId);
      await deleteByRunIdInChunks('commissionSummaries', runId);
      await deleteByRunIdInChunks('policyCommissionSummaries', runId);

      await deleteDoc(doc(db, 'commissionImportRuns', runId));

      await fetchCommissionRuns();
    } catch (err) {
      console.error('Error deleting run by runId', err);
    } finally {
      setRunDeleteLoading(false);
      setRunDeleteDialogOpen(false);
      setSelectedRun(null);
    }
  };

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

        {/* ===== חלק עליון: מחיקה לפי סינון ===== */}

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
                <div className="text-xl font-bold">
                  {scan.commissionSummariesCount.toLocaleString()}
                </div>
              </div>
              <div className="p-3 bg-white rounded border">
                <div className="text-gray-500">policyCommissionSummaries</div>
                <div className="text-xl font-bold">
                  {scan.policySummariesCount.toLocaleString()}
                </div>
              </div>
            </div>
            {scan.monthsFound.length > 0 && (
              <div className="mt-3 text-xs text-gray-600">
                חודשי reportMonth שנמצאו: {scan.monthsFound.join(', ')}
              </div>
            )}
          </div>
        )}

        {/* Dialog כללי */}
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

        {/* ===== חלק תחתון: ניהול ריצות טעינה לפי מספר טעינה / טוען ===== */}
        <div className="mt-10 border-t pt-6">
          <h2 className="text-xl font-bold mb-4">ריצות טעינת עמלות</h2>

          {/* פילטרים */}
          <div className="flex flex-col md:flex-row gap-3 mb-4 text-sm">
            <div className="flex-1">
              <label className="block mb-1">
                חיפוש כללי (מספר טעינה / סוכן / חברה / תבנית / חודש):
              </label>
              <input
                className="border rounded px-2 py-1 w-full"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="הקלד/י טקסט לחיפוש..."
              />
            </div>
            <div className="flex-1 md:max-w-xs">
              <label className="block mb-1">סינון לפי יוזר טוען:</label>
              <input
                className="border rounded px-2 py-1 w-full"
                value={uploaderFilter}
                onChange={(e) => setUploaderFilter(e.target.value)}
                placeholder="הקלד/י אימייל / שם"
              />
            </div>
            <div className="flex-1 md:max-w-xs">
              <label className="block mb-1">מתאריך:</label>
              <input
                type="date"
                className="border rounded px-2 py-1 w-full"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="flex-1 md:max-w-xs">
              <label className="block mb-1">עד תאריך:</label>
              <input
                type="date"
                className="border rounded px-2 py-1 w-full"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          {commissionRunsLoading ? (
            <p>טוען ריצות טעינה...</p>
          ) : filteredCommissionRuns.length === 0 ? (
            <p>לא נמצאו ריצות טעינת עמלות בהתאם לפילטרים.</p>
          ) : (
            <table className="w-full border text-sm text-right">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-2">מספר טעינה</th>
                  <th className="p-2">תאריך</th>
                  <th>סוכן</th>
                  <th>חברה</th>
                  <th>תבנית</th>
                  <th>חודש דיווח</th>
                  <th>יוזר מייבא</th>
                  <th>שורות קובץ</th>
                  <th>סיכומי עמלות</th>
                  <th>סיכומי פוליסות</th>
                  <th>מחיקה</th>
                </tr>
              </thead>
              <tbody>
                {filteredCommissionRuns.map((run) => (
                  <tr key={run.runId} className="border-t hover:bg-gray-50">
                    <td className="p-2 font-mono text-xs">{run.runId}</td>
                    <td className="p-2">
                      {run.createdAt
                        ? new Date(run.createdAt.seconds * 1000).toLocaleString('he-IL')
                        : '-'}
                    </td>
                    <td>{run.agentName}</td>
                    <td>{run.company}</td>
                    <td>{run.templateName}</td>
                    <td>{run.reportMonth || '-'}</td>
                    <td>{run.createdBy}</td>
                    <td>{run.externalCount ?? '-'}</td>
                    <td>{run.commissionSummariesCount ?? '-'}</td>
                    <td>{run.policySummariesCount ?? '-'}</td>
                    <td>
                      <button
                        onClick={() => handleRunDeleteClick(run)}
                        className="text-red-600 hover:underline font-medium"
                      >
                        מחק ריצה
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {runDeleteDialogOpen && selectedRun && (
            <DialogNotification
              type="warning"
              title="אישור מחיקת ריצת טעינת עמלות"
              message={
                <div>
                  <p>האם למחוק את כל הנתונים של ריצה זו?</p>
                  <ul className="list-disc pr-5 mt-2 text-sm">
                    <li>מספר טעינה: {selectedRun.runId}</li>
                    <li>סוכן: {selectedRun.agentName}</li>
                    <li>חברה: {selectedRun.company}</li>
                    <li>תבנית: {selectedRun.templateName}</li>
                    <li>חודש דיווח: {selectedRun.reportMonth || '-'}</li>
                    <li>שורות קובץ: {selectedRun.externalCount ?? 0}</li>
                    <li>סיכומי עמלות: {selectedRun.commissionSummariesCount ?? 0}</li>
                    <li>סיכומי פוליסות: {selectedRun.policySummariesCount ?? 0}</li>
                  </ul>
                  <p className="text-red-600 mt-3 text-sm">
                    פעולה זו תמחק לצמיתות את כל הרשומות שנוצרו בטעינה זו (כולל תקצירי עמלות ופוליסות).
                  </p>
                </div>
              }
              onConfirm={handleRunDeleteConfirm}
              onCancel={() => {
                setRunDeleteDialogOpen(false);
                setSelectedRun(null);
              }}
              confirmText={runDeleteLoading ? 'מוחק...' : 'מחק'}
              cancelText="ביטול"
            />
          )}
        </div>
      </div>
    </AdminGuard>
  );
}
