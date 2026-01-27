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
  agentName?: string;
  agentId: string;
  createdBy: string;
  company: string;
  templateName: string;
  reportMonth?: string;
  externalCount?: number;
  commissionSummariesCount?: number;
  policySummariesCount?: number;
  reportMonths?: string[];
  minReportMonth?: string;
  maxReportMonth?: string;
  reportMonthsCount?: number;

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
    const runsRaw = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  
    // 1️⃣ אוספים agentIds ייחודיים
    const agentIds = Array.from(
      new Set(runsRaw.map(r => r.agentId).filter(Boolean))
    );
  
    // 2️⃣ שולפים שמות סוכנים מ־users
    const agentNameMap = new Map<string, string>();
  
    await Promise.all(
      agentIds.map(async (uid) => {
        const uSnap = await getDoc(doc(db, 'users', uid));
        if (uSnap.exists()) {
          const u = uSnap.data() as any;
          agentNameMap.set(
            uid,
            u.fullName || u.displayName || u.name || ''
          );
        }
      })
    );
  
    // 3️⃣ בונים את הנתונים לטבלה
    const data: CommissionImportRun[] = runsRaw.map((docData: any) => ({
      runId: docData.runId || docData.id,
      createdAt: docData.createdAt,
      agentId: docData.agentId || '',
      agentName: agentNameMap.get(docData.agentId) || '-',
      createdBy: docData.createdBy || '',
      company: docData.company || '',
      templateName: docData.templateName || '',
      reportMonth: docData.reportMonth,
      reportMonths: docData.reportMonths,
      minReportMonth: docData.minReportMonth,
      maxReportMonth: docData.maxReportMonth,
      reportMonthsCount: docData.reportMonthsCount,
      externalCount: docData.externalCount,
      commissionSummariesCount: docData.commissionSummariesCount,
      policySummariesCount: docData.policySummariesCount,
    }));
  
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
      // console.error('Error deleting run by runId', err);
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
        {/* ===== חלק תחתון: ניהול ריצות טעינה לפי מספר טעינה / טוען ===== */}
        <div className="mt-10 border-t pt-6">
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
                  <th className="p-2" style={{ minWidth: 220 }}>חודש דיווח</th>
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
                    <td style={{ minWidth: 220 }}>
  {run.minReportMonth && run.maxReportMonth ? (
    <span>
      {run.minReportMonth} עד {run.maxReportMonth}
      {typeof run.reportMonthsCount === 'number' ? ` (${run.reportMonthsCount} חודשים)` : ''}
    </span>
  ) : (
    run.reportMonth || '-'
  )}
</td>
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
                  {(() => {
          const total =
            (selectedRun.externalCount ?? 0) +
            (selectedRun.commissionSummariesCount ?? 0) +
            (selectedRun.policySummariesCount ?? 0);

          return (
            <div className="mt-3 text-sm">
              <div>
                <strong>צפוי להימחק:</strong> {total.toLocaleString()} רשומות
              </div>
              <div className="text-gray-600">
                מחיקה גדולה יכולה לקחת זמן.
              </div>
            </div>
          );
        })()}
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
