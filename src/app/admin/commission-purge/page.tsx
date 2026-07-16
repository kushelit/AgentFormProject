// MagicSale — Commission Admin Purge Page
// מחיקת נתוני עמלות גורפת לפי סוכן / חברה / חודש / תבנית
// + ניהול ריצות טעינה לפי מספר טעינה / טוען
// קובץ: app/admin/commission-purge/page.tsx

//token to facebook to keep
//EAAVvIohuDZCwBRlXYu7OyNN1S8ZBcNENrT3HOSdVtJOUdr0bxso0DBBiqfQZA70yhAIOSZBgZBwXbDzElV5Xp4Ubkoub44qJThuyGxdhuglanFQqt8ZApbej701W7U6PjTll4LzHe3fJx8t7ZCfOntLyeFXxM8rpZCo8p48fODz2KZCjGW42V52e0SiZCtWRn7BgZDZD
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/firebase/firebase';
import {
  collection,
  query,
  where,
  documentId,
  getDocs,
  writeBatch,
  doc,
  getDoc,
  deleteDoc,
  serverTimestamp,
  addDoc,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { Button } from '@/components/Button/Button';
import DialogNotification from '@/components/DialogNotification';
import AdminGuard from '@/app/admin/_components/AdminGuard';
import BackfillYmButton from '@/components/admin/BackfillYmButton';


type DialogKind = 'info' | 'warning' | 'success' | 'error';
type DialogState = {
  type: DialogKind;
  title: string;
  message: NonNullable<React.ReactNode>;
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
  companyId?: string;
}

// ═══════════════════════════════════════════════════════════════════
// מעקב ריצות אוטומטיות (Portal Runner) — מקור האמת הוא portalImportLocks,
// כי זו הנעילה שבפועל חוסמת ריצה חדשה. אם יש נעילה — היא תוצג, גם אם
// אין (או שיש) מסמך portalImportRuns תואם. השדות מוצגים גולמיים, בדיוק
// כמו שהם נראים ב-Firestore console, כדי שיהיה מיפוי ישיר בין המסך ל-DB.
// ═══════════════════════════════════════════════════════════════════
const IN_PROGRESS_STATUSES = ['queued', 'running', 'otp_required', 'logged_in', 'file_uploaded'] as const;

const STATUS_LABELS: Record<string, string> = {
  queued: 'ממתין בתור',
  running: 'בריצה',
  otp_required: 'ממתין ל-OTP',
  logged_in: 'מחובר לפורטל',
  file_uploaded: 'קובץ הועלה',
  success: 'הושלם בהצלחה',
  done: 'הושלם',
  error: 'שגיאה',
  failed: 'שגיאה',
  skipped: 'דולג',
};

function statusLabel(status: string): string {
  if (!status) return '-';
  return STATUS_LABELS[status] || status;
}

function isInProgressStatus(status: string): boolean {
  return (IN_PROGRESS_STATUSES as readonly string[]).includes(status);
}

interface QueueJobInfo {
  id: string;           // commissionImportQueue doc id (= jobId)
  status: string;       // commissionImportQueue.status הגולמי
  templateId?: string;
  portalRunId?: string; // commissionImportQueue.portalRunId — לצורך אימות מול DB
  agentId?: string;      // commissionImportQueue.agentId — נשלף ישירות מהמסמך עצמו
  companyId?: string;    // commissionImportQueue.companyId — נשלף ישירות מהמסמך עצמו
}

interface StuckRun {
  id: string; // = lockId, כדי שה-key בטבלה יהיה ייחודי גם בלי runId
  lockId: string;         // portalImportLocks/{lockId} — המזהה המדויק כפי שמופיע ב-DB
  lockState: string;      // portalImportLocks.state — הערך הגולמי
  runId?: string;         // portalImportLocks.runId
  runFound: boolean;      // האם נמצא בפועל מסמך portalImportRuns/{runId}
  agentId: string;
  companyId: string;
  companyName: string;
  templateId: string;
  ym: string;
  status: string;         // portalImportRuns.status (ריק אם לא נמצא ריצה)
  step?: string;          // portalImportRuns.step
  source?: string;
  updatedAt: Date | null; // portalImportRuns.updatedAt/createdAt
  jobIds: string[];
  queueJobs: QueueJobInfo[]; // מצב בפועל של כל job ב-commissionImportQueue, נשלף מראש
}

// ═══════════════════════════════════════════════════════════════════
// מעקב באצ'ים (portalRunBatches) — לכל באצ' מוצגים כל ה-portalImportRuns
// שקשורים אליו (batchId), ולכל ריצה כזו — הנעילה (portalImportLocks) וה-
// job-ים (commissionImportQueue) שלה, אותו עיקרון בדיוק כמו הנעילות הבודדות.
// ═══════════════════════════════════════════════════════════════════
const RUN_FINISHED_STATUSES = ['success', 'done', 'error', 'failed', 'skipped'] as const;
const BATCH_FINISHED_STATUSES = ['success', 'partial', 'error', 'done', 'failed', 'cancelled'] as const;

function isRunFinishedStatus(status: string): boolean {
  return (RUN_FINISHED_STATUSES as readonly string[]).includes(status);
}

function isBatchFinishedStatus(status: string): boolean {
  return (BATCH_FINISHED_STATUSES as readonly string[]).includes(status);
}

interface BatchRunInfo {
  id: string;              // portalImportRuns doc id (= runId)
  companyId: string;
  companyName: string;
  templateId: string;
  batchOrder: number;
  status: string;
  step?: string;
  ym?: string;
  lockId?: string;
  lockFound: boolean;
  lockState?: string;
  jobIds: string[];
  queueJobs: QueueJobInfo[];
  updatedAt: Date | null;
}

interface BatchInfo {
  id: string;               // portalRunBatches doc id (= batchId)
  status: string;
  mode?: string;
  monthLabel?: string;
  totalCount?: number;
  doneCount?: number;
  errorCount?: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  runs: BatchRunInfo[];
}

function toDateSafe(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value?.toDate === 'function') return value.toDate();
  return null;
}

function minutesAgo(date: Date | null): number | null {
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

export default function CommissionPurgeAdminPage() {
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  // ===== Filters (חלק עליון – מחיקה גורפת לפי פילטרים) =====
  const [companyId, setCompanyId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [validMonth, setValidMonth] = useState(''); // YYYY-MM

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

  const [bridgeRun, setBridgeRun] = useState<CommissionImportRun | null>(null);
  const [bridgeYm, setBridgeYm] = useState('');
  const [bridgeLoading, setBridgeLoading] = useState(false);

  // ===== State – מעקב ריצות אוטומטיות (Portal Runner) =====
  const [stuckRuns, setStuckRuns] = useState<StuckRun[]>([]);
  const [stuckLoading, setStuckLoading] = useState(false);
  const [releaseConfirmRun, setReleaseConfirmRun] = useState<StuckRun | null>(null);
  const [releasingRunId, setReleasingRunId] = useState<string | null>(null);
  const [runsStatusFilter, setRunsStatusFilter] = useState<'all' | 'in_progress' | 'error'>('all');
  const [runsYmFilter, setRunsYmFilter] = useState('');
  const [runsAgentId, setRunsAgentId] = useState('');
  const [runsCompanyId, setRunsCompanyId] = useState('');
  const [hasSearchedRuns, setHasSearchedRuns] = useState(false);

  // ===== State – ניהול לשוניות =====
  const [activeMainTab, setActiveMainTab] = useState<'runs' | 'batches' | 'imports' | 'tools'>('runs');

  // ===== State – מעקב באצ'ים (portalRunBatches) =====
  const [batches, setBatches] = useState<BatchInfo[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchesStatusFilter, setBatchesStatusFilter] = useState<'active' | 'all'>('active');
  const [batchStopConfirm, setBatchStopConfirm] = useState<BatchInfo | null>(null);
  const [stoppingBatchId, setStoppingBatchId] = useState<string | null>(null);

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
          companyName = compSnap.exists() ? (compSnap.data() as any).companyName || '' : '';
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
            query(
              collection(db, 'commissionSummaries'),
              ...baseSummaryFilters,
              where('reportMonth', '==', rm)
            )
          );
          commissionSummariesCount += q1.size;

          const q2 = await getDocs(
            query(
              collection(db, 'policyCommissionSummaries'),
              ...baseSummaryFilters,
              where('reportMonth', '==', rm)
            )
          );
          policySummariesCount += q2.size;
        }
      } else {
        const q1 = await getDocs(query(collection(db, 'commissionSummaries'), ...baseSummaryFilters));
        const q2 = await getDocs(
          query(collection(db, 'policyCommissionSummaries'), ...baseSummaryFilters)
        );
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
            query(
              collection(db, 'commissionSummaries'),
              ...baseSummaryFilters,
              where('reportMonth', '==', rm)
            )
          );
          s1.forEach((d) => toDeleteRefs.push(d.ref));

          const s2 = await getDocs(
            query(
              collection(db, 'policyCommissionSummaries'),
              ...baseSummaryFilters,
              where('reportMonth', '==', rm)
            )
          );
          s2.forEach((d) => toDeleteRefs.push(d.ref));
        }
      } else {
        const s1 = await getDocs(query(collection(db, 'commissionSummaries'), ...baseSummaryFilters));
        const s2 = await getDocs(
          query(collection(db, 'policyCommissionSummaries'), ...baseSummaryFilters)
        );
        s1.forEach((d) => toDeleteRefs.push(d.ref));
        s2.forEach((d) => toDeleteRefs.push(d.ref));
      }

      if (toDeleteRefs.length === 0) {
        setDialog({ type: 'info', title: 'לא נמצאו רשומות', message: 'אין מה למחוק לפי המסננים שבחרת.' });
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
    const runsRaw = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

    const agentIds = Array.from(new Set(runsRaw.map((r) => r.agentId).filter(Boolean)));
    const agentNameMap = new Map<string, string>();

    await Promise.all(
      agentIds.map(async (uid) => {
        const uSnap = await getDoc(doc(db, 'users', uid));
        if (uSnap.exists()) {
          const u = uSnap.data() as any;
          agentNameMap.set(uid, u.fullName || u.displayName || u.name || '');
        }
      })
    );

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
      companyId: docData.companyId || '',
    }));

    data.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));

    setCommissionRuns(data);
    setCommissionRunsLoading(false);
  };

  useEffect(() => {
    fetchCommissionRuns();
  }, []);

  const filteredCommissionRuns = useMemo(() => {
    return commissionRuns.filter((run) => {
      const text = searchText.trim().toLowerCase();
      const uploader = uploaderFilter.trim().toLowerCase();

      if (text) {
        const haystack = [run.runId, run.agentName, run.company, run.templateName, run.reportMonth || '']
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

  const deleteByRunIdInChunks = async (collectionName: string, runId: string) => {
    const qy = query(collection(db, collectionName), where('runId', '==', runId));
    const snap = await getDocs(qy);
    if (snap.empty) return;

    const CHUNK = 450;
    const docs = snap.docs;

    for (let i = 0; i < docs.length; i += CHUNK) {
      const batch = writeBatch(db);
      for (const d of docs.slice(i, i + CHUNK)) batch.delete(d.ref);
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
    const { runId, agentId } = selectedRun;

    try {
      // שלוף jobIds מ-portalImportRuns לפי portalRunId
      const portalRunsSnap = await getDocs(
        query(collection(db, 'portalImportRuns'), where('runId', '==', runId))
      );

      const jobIds: string[] = [];
      let portalRunDocId = '';

      for (const d of portalRunsSnap.docs) {
        portalRunDocId = d.id;
        const ids: string[] = d.data()?.queue?.jobIds || [];
        jobIds.push(...ids);
      }

      // מחק לפי כל jobId
      for (const jobId of jobIds) {
        for (const col of ['commissionImportRuns', 'externalCommissions', 'commissionSummaries', 'policyCommissionSummaries', 'ymCommissionSummaries']) {
          await deleteByRunIdInChunks(col, jobId);
        }
        await deleteDoc(doc(db, 'commissionImportQueue', jobId)).catch(() => {});
      }

      // fallback — אם אין portalImportRuns, מחק לפי runId ישירות
      if (jobIds.length === 0) {
        await deleteByRunIdInChunks('externalCommissions', runId);
        await deleteByRunIdInChunks('commissionSummaries', runId);
        await deleteByRunIdInChunks('policyCommissionSummaries', runId);
        await deleteByRunIdInChunks('ymCommissionSummaries', runId);
        await deleteDoc(doc(db, 'commissionImportRuns', runId)).catch(() => {});
      }

      // מחק portalImportRuns
      if (portalRunDocId) {
        await deleteDoc(doc(db, 'portalImportRuns', portalRunDocId)).catch(() => {});
      }
// מחק מסמכי מגשר שמצביעים על runId זה
const bridgeSnap = await getDocs(
  query(
    collection(db, 'portalImportRuns'),
    where('source', '==', 'manual_bridge'),
    where('queue.jobIds', 'array-contains', runId)
  )
);
for (const d of bridgeSnap.docs) {
  await deleteDoc(d.ref).catch(() => {});
}

      await fetchCommissionRuns();
    } catch (e: any) {
      setDialog({ type: 'error', title: 'שגיאת מחיקה', message: String(e?.message || e) });
    } finally {
      setRunDeleteLoading(false);
      setRunDeleteDialogOpen(false);
      setSelectedRun(null);
    }
  };
 
  // ═══════════════════════════════════════════════════════════════════
  // מעקב ריצות אוטומטיות — שליפה לפי סוכן (חובה) + חברה (אופציונלי).
  // מקור האמת: portalImportLocks. מזהה הנעילה בנוי כ-
  // "{agentId}_{templateId}_{ym}", ולכן אפשר לשלוף את כל הנעילות של
  // סוכן מסוים לפי range query על documentId() (prefix match).
  // לכל נעילה מנסים גם לצרף את מסמך portalImportRuns התואם (דרך
  // lockData.runId), אבל הנעילה עצמה מוצגת גם אם אין ריצה תואמת —
  // כי היא זו שבפועל חוסמת ריצה חדשה של הסוכן.
  // לא נטען אוטומטית בכניסה לדף — רק לפי בקשה.
  // ═══════════════════════════════════════════════════════════════════
  const fetchStuckRuns = async () => {
    if (!runsAgentId) {
      setDialog({ type: 'warning', title: 'חסר סוכן', message: 'יש לבחור סוכן לפני חיפוש.' });
      return;
    }

    setStuckLoading(true);
    setHasSearchedRuns(true);
    setRunsYmFilter('');
    try {
      const lockSnap = await getDocs(
        query(
          collection(db, 'portalImportLocks'),
          where(documentId(), '>=', `${runsAgentId}_`),
          where(documentId(), '<', `${runsAgentId}_\uf8ff`)
        )
      );

      const companyCache = new Map<string, string>();

      const rows: StuckRun[] = await Promise.all(
        lockSnap.docs.map(async (lockDoc) => {
          const lockData: any = lockDoc.data();
          const lockState = String(lockData.state || '');
          const runId = String(lockData.runId || '').trim();
          const ymFromLock = String(lockData.ym || '');

          let runFound = false;
          let runStatus = '';
          let runStep = '';
          let companyId = '';
          let companyName = '';
          let templateId = '';
          let source = '';
          let updatedAt: Date | null = null;
          let jobIds: string[] = [];
          let ym = ymFromLock;

          if (runId) {
            const runSnap = await getDoc(doc(db, 'portalImportRuns', runId));
            if (runSnap.exists()) {
              runFound = true;
              const r: any = runSnap.data();
              runStatus = String(r.status || '');
              runStep = r.step ? String(r.step) : '';
              companyId = String(r.companyId || '');
              templateId = String(r.templateId || '');
              source = r.source ? String(r.source) : '';
              updatedAt = toDateSafe(r.updatedAt) || toDateSafe(r.createdAt) || null;
              jobIds = Array.isArray(r?.queue?.jobIds) ? r.queue.jobIds : [];
              if (!ym) ym = String(r?.resolvedWindow?.ym || '');

              companyName = String(r.companyName || '') || companyCache.get(companyId) || '';
              if (!companyName && companyId) {
                const cSnap = await getDoc(doc(db, 'company', companyId));
                companyName = cSnap.exists() ? String((cSnap.data() as any)?.companyName || companyId) : companyId;
                companyCache.set(companyId, companyName);
              }
            }
          }

          // שליפת מצב בפועל של כל job ב-commissionImportQueue, מראש —
          // כך שרואים את זה על המסך גם לפני שלוחצים "שחרר נעילה"
          const queueJobs: QueueJobInfo[] = await Promise.all(
            jobIds.map(async (jobId) => {
              const qSnap = await getDoc(doc(db, 'commissionImportQueue', jobId));
              if (!qSnap.exists()) {
                return { id: jobId, status: '(לא נמצא)' };
              }
              const q: any = qSnap.data();
              return {
                id: jobId,
                status: String(q.status || ''),
                templateId: q.templateId ? String(q.templateId) : undefined,
                portalRunId: q.portalRunId ? String(q.portalRunId) : undefined,
              };
            })
          );

          return {
            id: lockDoc.id,
            lockId: lockDoc.id,
            lockState,
            runId: runId || undefined,
            runFound,
            agentId: runsAgentId,
            companyId,
            companyName: companyName || (runFound ? '-' : 'לא ידוע — אין מסמך ריצה תואם'),
            templateId,
            ym: ym || 'לא ידוע',
            status: runStatus,
            step: runStep || undefined,
            source: source || undefined,
            updatedAt,
            jobIds,
            queueJobs,
          };
        })
      );

      // סינון לפי חברה — רק אם הצלחנו לזהות companyId מהריצה המשוייכת.
      // נעילות בלי ריצה תואמת (runFound=false) תמיד יוצגו, כדי לא "להסתיר"
      // בטעות בדיוק את המקרה שאת מחפשת.
      const rowsFiltered = runsCompanyId
        ? rows.filter((r) => !r.runFound || r.companyId === runsCompanyId)
        : rows;

      setStuckRuns(rowsFiltered);
      await fetchBatches(runsAgentId);
    } catch (e: any) {
      setDialog({ type: 'error', title: 'שגיאת שליפת נעילות', message: String(e?.message || e) });
    } finally {
      setStuckLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════
  // שליפת באצ'ים (portalRunBatches) לסוכן, כולל כל ה-portalImportRuns
  // וה-portalImportLocks המקוננים תחת כל באצ'.
  // ═══════════════════════════════════════════════════════════════════
  const fetchBatches = async (agentId: string) => {
    setBatchesLoading(true);
    try {
      const batchesSnap = await getDocs(
        query(collection(db, 'portalRunBatches'), where('agentId', '==', agentId))
      );

      const companyCache = new Map<string, string>();

      const batchList: BatchInfo[] = await Promise.all(
        batchesSnap.docs.map(async (batchDoc) => {
          const b: any = batchDoc.data();

          const runsSnap = await getDocs(
            query(collection(db, 'portalImportRuns'), where('batchId', '==', batchDoc.id))
          );

          const runs: BatchRunInfo[] = await Promise.all(
            runsSnap.docs.map(async (runDoc) => {
              const r: any = runDoc.data();
              const companyId = String(r.companyId || '');
              const templateId = String(r.templateId || '');
              const ym = String(r?.resolvedWindow?.ym || '') || undefined;
              const jobIds: string[] = Array.isArray(r?.queue?.jobIds) ? r.queue.jobIds : [];

              let companyName = String(r.companyName || '') || companyCache.get(companyId) || '';
              if (!companyName && companyId) {
                const cSnap = await getDoc(doc(db, 'company', companyId));
                companyName = cSnap.exists() ? String((cSnap.data() as any)?.companyName || companyId) : companyId;
                companyCache.set(companyId, companyName);
              }

              let lockFound = false;
              let lockState: string | undefined;
              let lockId: string | undefined;
              if (agentId && templateId && ym) {
                lockId = `${agentId}_${templateId}_${ym}`;
                const lockSnap = await getDoc(doc(db, 'portalImportLocks', lockId));
                if (lockSnap.exists()) {
                  lockFound = true;
                  lockState = String((lockSnap.data() as any)?.state || '');
                }
              }

              const queueJobs: QueueJobInfo[] = await Promise.all(
                jobIds.map(async (jobId) => {
                  const qSnap = await getDoc(doc(db, 'commissionImportQueue', jobId));
                  if (!qSnap.exists()) return { id: jobId, status: '(לא נמצא)' };
                  const q: any = qSnap.data();
                  return {
                    id: jobId,
                    status: String(q.status || ''),
                    templateId: q.templateId ? String(q.templateId) : undefined,
                    portalRunId: q.portalRunId ? String(q.portalRunId) : undefined,
                  };
                })
              );

              return {
                id: runDoc.id,
                companyId,
                companyName: companyName || '-',
                templateId,
                batchOrder: Number(r.batchOrder || 0),
                status: String(r.status || ''),
                step: r.step ? String(r.step) : undefined,
                ym,
                lockId,
                lockFound,
                lockState,
                jobIds,
                queueJobs,
                updatedAt: toDateSafe(r.updatedAt) || toDateSafe(r.createdAt) || null,
              };
            })
          );

          runs.sort((a, b) => a.batchOrder - b.batchOrder);

          return {
            id: batchDoc.id,
            status: String(b.status || ''),
            mode: b.mode ? String(b.mode) : undefined,
            monthLabel: b.monthLabel ? String(b.monthLabel) : undefined,
            totalCount: typeof b.totalCount === 'number' ? b.totalCount : undefined,
            doneCount: typeof b.doneCount === 'number' ? b.doneCount : undefined,
            errorCount: typeof b.errorCount === 'number' ? b.errorCount : undefined,
            createdAt: toDateSafe(b.createdAt),
            updatedAt: toDateSafe(b.updatedAt),
            runs,
          };
        })
      );

      batchList.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
      setBatches(batchList);
    } catch (e: any) {
      setDialog({ type: 'error', title: 'שגיאת שליפת באצ\'ים', message: String(e?.message || e) });
    } finally {
      setBatchesLoading(false);
    }
  };

  const filteredBatches = useMemo(() => {
    if (batchesStatusFilter === 'all') return batches;
    return batches.filter((b) => !isBatchFinishedStatus(b.status));
  }, [batches, batchesStatusFilter]);

  // ═══════════════════════════════════════════════════════════════════
  // עצירת באצ' — סוגר לשגיאה את כל הריצות שעדיין לא הסתיימו (ולא נתפסות
  // כ"סופיות"), כולל שחרור הנעילות והשתקת job-ים תקועים בתור. לבסוף
  // מסמן את הבאצ' עצמו כ-'error' כדי שהוא לא יוצג יותר כ"פעיל".
  // ═══════════════════════════════════════════════════════════════════
  async function handleStopBatch(batch: BatchInfo) {
    setStoppingBatchId(batch.id);
    try {
      let releasedRuns = 0;
      let releasedLocks = 0;
      let releasedJobs = 0;

      for (const run of batch.runs) {
        if (isRunFinishedStatus(run.status)) continue;

        if (run.lockFound && run.lockId) {
          await deleteDoc(doc(db, 'portalImportLocks', run.lockId)).catch(() => {});
          releasedLocks++;
        }

        await setDoc(
          doc(db, 'portalImportRuns', run.id),
          {
            status: 'error',
            step: 'import_error',
            error: { message: 'הבאצ\' נעצר ידנית ע"י אדמין' },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        releasedRuns++;

        for (const jobId of run.jobIds) {
          const qRef = doc(db, 'commissionImportQueue', jobId);
          const qSnap = await getDoc(qRef);
          if (qSnap.exists()) {
            const st = String((qSnap.data() as any)?.status || '');
            if (st === 'queued' || st === 'processing') {
              await setDoc(
                qRef,
                {
                  status: 'error',
                  error: { step: 'manual_batch_stop', message: 'הבאצ\' נעצר ידנית ע"י אדמין' },
                  finishedAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                },
                { merge: true }
              ).catch(() => {});
              releasedJobs++;
            }
          }
        }
      }

      await setDoc(
        doc(db, 'portalRunBatches', batch.id),
        {
          status: 'error',
          error: { message: 'נעצר ידנית ע"י אדמין' },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setDialog({
        type: 'success',
        title: 'הבאצ\' נעצר',
        message: (
          <div className="text-sm space-y-1">
            <div>
              <b>portalRunBatches:</b>{' '}
              <span className="text-blue-600">עודכן {batch.id} → status = error</span>
            </div>
            <div>
              <b>portalImportRuns:</b>{' '}
              {releasedRuns > 0 ? (
                <span className="text-blue-600">עודכנו {releasedRuns} ריצות → status = error</span>
              ) : (
                <span className="text-gray-500">לא נמצאו ריצות לא-סופיות</span>
              )}
            </div>
            <div>
              <b>portalImportLocks:</b>{' '}
              {releasedLocks > 0 ? (
                <span className="text-red-600">נמחקו {releasedLocks} נעילות</span>
              ) : (
                <span className="text-gray-500">לא נמצאו נעילות למחיקה</span>
              )}
            </div>
            <div>
              <b>commissionImportQueue:</b>{' '}
              {releasedJobs > 0 ? (
                <span className="text-blue-600">עודכנו {releasedJobs} job-ים → status = error</span>
              ) : (
                <span className="text-gray-500">לא נמצאו job-ים פעילים לעדכון</span>
              )}
            </div>
          </div>
        ),
      });

      await fetchBatches(runsAgentId);
      await fetchStuckRuns();
    } catch (e: any) {
      setDialog({ type: 'error', title: 'שגיאת עצירת באצ\'', message: String(e?.message || e) });
    } finally {
      setStoppingBatchId(null);
      setBatchStopConfirm(null);
    }
  }

  // רשימת חודשי הפרסום הקיימים בתוצאות הנוכחיות — לבניית אפשרויות הסינון
  const availableYms = useMemo(() => {
    const set = new Set<string>();
    for (const r of stuckRuns) {
      if (r.ym) set.add(r.ym);
    }
    return Array.from(set).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  }, [stuckRuns]);

  const filteredStuckRuns = useMemo(() => {
    let rows = stuckRuns;
    if (runsStatusFilter === 'in_progress') {
      // "בתהליך" מבוסס על lockState — כי זו הנעילה עצמה, לא תלוי אם נמצא runId
      rows = rows.filter((r) => r.lockState === 'running' || isInProgressStatus(r.status));
    } else if (runsStatusFilter === 'error') {
      rows = rows.filter((r) => r.lockState === 'error' || r.status === 'error' || r.status === 'failed');
    }
    if (runsYmFilter) {
      rows = rows.filter((r) => r.ym === runsYmFilter);
    }
    return rows;
  }, [stuckRuns, runsStatusFilter, runsYmFilter]);

  // קיבוץ לפי חודש פרסום (ym) — מהחדש לישן, ובתוך כל חודש לפי עדכון אחרון
  const runsGroupedByYm = useMemo(() => {
    const groups = new Map<string, StuckRun[]>();
    for (const r of filteredStuckRuns) {
      const key = r.ym || 'לא ידוע';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    for (const arr of groups.values()) {
      arr.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
    }
    return Array.from(groups.entries()).sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0));
  }, [filteredStuckRuns]);

  // ═══════════════════════════════════════════════════════════════════
  // שחרור ריצה תקועה:
  // 1) מוחק את portalImportLocks כדי שהסוכן יוכל להתחיל ריצה חדשה.
  // 2) מסמן את portalImportRuns כ-error, כך שה-Card בדשבורד (דרך
  //    mapRunToUiStatus) יראה "שגיאה — נסה שוב" במקום להישאר תקוע.
  // 3) מסמן job-ים תקועים ב-commissionImportQueue כ-error, כדי שה-worker
  //    לא ינסה "לסיים" אותם ברקע אחרי השחרור וייצור מירוץ/דריסה.
  // ═══════════════════════════════════════════════════════════════════
  async function handleReleaseStuckRun(item: StuckRun) {
    setReleasingRunId(item.id);
    try {
      // 1) מחיקת הנעילה עצמה — זה מה שאת עושה ידנית היום
      await deleteDoc(doc(db, 'portalImportLocks', item.lockId)).catch(() => {});

      // 2) אם נמצא מסמך ריצה תואם — מסמנים אותו כ-error, כדי שה-Card יזהה
      //    שהריצה הסתיימה (בשגיאה) ולא יישאר תקוע בתצוגת הסוכן
      if (item.runFound && item.runId) {
        await setDoc(
          doc(db, 'portalImportRuns', item.runId),
          {
            status: 'error',
            step: 'import_error',
            error: { message: 'שוחרר ידנית ע"י אדמין — נעילה תקועה' },
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }

      // 3) job-ים תקועים בתור, אם יש
      let updatedJobsCount = 0;
      for (const jobId of item.jobIds) {
        const qRef = doc(db, 'commissionImportQueue', jobId);
        const qSnap = await getDoc(qRef);
        if (qSnap.exists()) {
          const st = String((qSnap.data() as any)?.status || '');
          if (st === 'queued' || st === 'processing') {
            await setDoc(
              qRef,
              {
                status: 'error',
                error: { step: 'manual_release', message: 'שוחרר ידנית ע"י אדמין' },
                finishedAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
              { merge: true }
            ).catch(() => {});
            updatedJobsCount++;
          }
        }
      }

      // 4) דיאלוג מפורט שמראה בדיוק מה נמחק ומה עודכן
      setDialog({
        type: 'success',
        title: 'שוחרר בהצלחה',
        message: (
          <div className="text-sm space-y-1">
            <div>{item.companyName} | {item.ym}</div>
            <div className="mt-2 border-t pt-2">
              <div>
                <b>portalImportLocks:</b>{' '}
                <span className="text-red-600">נמחקה שורה — {item.lockId}</span>
              </div>
              <div>
                <b>portalImportRuns:</b>{' '}
                {item.runFound ? (
                  <span className="text-blue-600">עודכנה שורה {item.runId} → status = error</span>
                ) : (
                  <span className="text-gray-500">לא נמצא מסמך ריצה תואם — לא עודכן דבר</span>
                )}
              </div>
              <div>
                <b>commissionImportQueue:</b>{' '}
                {updatedJobsCount > 0 ? (
                  <span className="text-blue-600">עודכנו {updatedJobsCount} job-ים → status = error</span>
                ) : (
                  <span className="text-gray-500">לא נמצאו job-ים פעילים לעדכון</span>
                )}
              </div>
            </div>
          </div>
        ),
      });

      // 5) רענון הטבלה — השורה תיעלם (כי הנעילה נמחקה)
      await fetchStuckRuns();
    } catch (e: any) {
      setDialog({ type: 'error', title: 'שגיאת שחרור', message: String(e?.message || e) });
    } finally {
      setReleasingRunId(null);
      setReleaseConfirmRun(null);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // יצירת מגשר — כותבת גם ישירות ל-ymCommissionSummaries.
  // הדפים מה-drilldown (by-template, by-template-agent, drilldown) כבר
  // שואבים בזמן ריצה מתוך externalCommissions דרך portalImportRuns.queue.jobIds,
  // כך שהם עובדים ללא שינוי. השורה הראשית בטבלה המסכמת ("לפי חודש פרסום")
  // נשלפת ישירות מתוך ymCommissionSummaries, ולכן צריך לכתוב אליה כאן במפורש.
  // ═══════════════════════════════════════════════════════════════════
  async function handleCreateBridge() {
    if (!bridgeRun || !bridgeYm) return;
    setBridgeLoading(true);
    try {
      const cId = bridgeRun.companyId || '';
      const bundleTemplateId = `bundle_${cId}_commissions`;
      const [y, m] = bridgeYm.split('-');
      const label = `${m}/${y}`;

      // 1) יצירת מסמך המגשר — כרגיל, ללא שינוי
      await addDoc(collection(db, 'portalImportRuns'), {
        agentId: bridgeRun.agentId,
        companyId: cId,
        companyName: bridgeRun.company,
        templateId: bundleTemplateId,
        status: 'success',
        step: 'import_done',
        source: 'manual_bridge',
        resolvedWindow: { kind: 'month', ym: bridgeYm, label },
        queue: { jobIds: [bridgeRun.runId] },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 2) שליפת externalCommissions לפי ה-runId האמיתי של הטעינה הידנית המקורית
      const extSnap = await getDocs(
        query(
          collection(db, 'externalCommissions'),
          where('runId', '==', bridgeRun.runId),
          where('agentId', '==', bridgeRun.agentId),
          where('companyId', '==', cId)
        )
      );

      // 3) אותו סינון hekef שקיים בכל endpoint וב-backfill
      const templatesSnap = await getDocs(
        query(collection(db, 'commissionTemplates'), where('isactive', '==', true))
      );
      const hekefIds = new Set(
        templatesSnap.docs.filter((d) => !!d.data().hekefType).map((d) => d.id)
      );

      // 4) קיבוץ לפי agentCode+templateId+companyId+reportMonth, עם trim
      type Acc = {
        agentId: string;
        agentCode: string;
        ym: string;
        templateId: string;
        companyId: string;
        company: string;
        reportMonth: string;
        totalCommissionAmount: number;
        totalPremiumAmount: number;
        runId: string;
      };

      const acc = new Map<string, Acc>();

      extSnap.docs.forEach((d) => {
        const r: any = d.data();
        const tid = String(r.templateId || '').trim();
        if (hekefIds.has(tid)) return;

        const agentCode = String(r.agentCode || '').trim();
        const reportMonth = String(r.reportMonth || '').replace(/\//g, '-').trim();
        const companyId = String(r.companyId || '').trim();
        const company = String(r.company || '').trim();

        if (!agentCode || !reportMonth || !tid || !companyId) return;

        const id = `${bridgeRun.agentId}_${agentCode}_${bridgeYm}_${tid}_${companyId}_${reportMonth}`;

        if (!acc.has(id)) {
          acc.set(id, {
            agentId: bridgeRun.agentId,
            agentCode,
            ym: bridgeYm,
            templateId: tid,
            companyId,
            company,
            reportMonth,
            totalCommissionAmount: 0,
            totalPremiumAmount: 0,
            runId: bridgeRun.runId,
          });
        }

        const a = acc.get(id)!;
        a.totalCommissionAmount += Number(r.commissionAmount || 0);
        a.totalPremiumAmount += Number(r.premium || 0);
      });

      if (!acc.size) {
        setDialog({
          type: 'warning',
          title: 'לא נמצאו נתונים',
          message: 'מסמך המגשר נוצר, אך לא נמצאו רשומות externalCommissions תואמות ל-runId זה. ייתכן שהריצה נמחקה או שה-agentId/companyId לא תואמים.',
        });
        setBridgeRun(null);
        setBridgeYm('');
        return;
      }

      // 5) כתיבה ל-ymCommissionSummaries — set מלא (לא merge)
      const batch = writeBatch(db);
      for (const [id, data] of acc.entries()) {
        batch.set(doc(db, 'ymCommissionSummaries', id), {
          ...data,
          totalCommissionAmount: Math.round(data.totalCommissionAmount * 100) / 100,
          totalPremiumAmount: Math.round(data.totalPremiumAmount * 100) / 100,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();

      setDialog({
        type: 'success',
        title: 'נוצר בהצלחה',
        message: `מסמך מגשר נוצר + ${acc.size} רשומות סיכום בטבלת ymCommissionSummaries עבור חודש פרסום ${bridgeYm}.`,
      });
      setBridgeRun(null);
      setBridgeYm('');
    } catch (e: any) {
      setDialog({ type: 'error', title: 'שגיאה', message: String(e?.message || e) });
    } finally {
      setBridgeLoading(false);
    }
  }
 
  return (
    <AdminGuard>
      <div className="p-6 max-w-4xl mx-auto text-right" dir="rtl">
        <h1 className="text-2xl font-bold mb-2">ניהול מחיקות קבצי עמלות</h1>

        {/* ===== סרגל לשוניות ===== */}
        <div className="flex gap-1 border-b mb-4 overflow-x-auto">
          {[
            { key: 'runs', label: 'נעילות וריצות' },
            { key: 'batches', label: "באצ'ים" },
            { key: 'imports', label: 'מחיקת טעינות' },
            { key: 'tools', label: 'כלים נוספים' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveMainTab(tab.key as any)}
              className={`px-4 py-2 text-sm font-bold whitespace-nowrap border-b-2 transition-colors ${
                activeMainTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeMainTab === 'runs' && (
        <>
        {/* ===== מעקב ריצות אוטומטיות (Portal Runner) ===== */}
        <div className="mt-4 border rounded p-4 bg-white">
          <h2 className="font-bold mb-2">מעקב ריצות אוטומטיות (Portal Runner)</h2>
          <p className="text-sm text-gray-600 mb-3">
            בחרי סוכן (וחברה אופציונלי) כדי לראות את כל הנעילות הפעילות שלו (portalImportLocks) —
            השדות מוצגים גולמיים בדיוק כמו ב-Firestore console, לצד מסמך הריצה התואם אם נמצא כזה.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-sm mb-3">
            <div>
              <label className="block mb-1">סוכן:</label>
              <select
                className="border rounded px-2 py-1 w-full"
                value={runsAgentId}
                onChange={(e) => {
                  setRunsAgentId(e.target.value);
                  setRunsCompanyId('');
                }}
              >
                <option value="">בחר/י סוכן</option>
                {agents?.map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.fullName || a.displayName || a.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1">חברה (אופציונלי):</label>
              <select
                className="border rounded px-2 py-1 w-full"
                value={runsCompanyId}
                onChange={(e) => setRunsCompanyId(e.target.value)}
                disabled={!runsAgentId}
              >
                <option value="">כל החברות</option>
                {uniqueCompanies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1">חודש פרסום:</label>
              <select
                className="border rounded px-2 py-1 w-full"
                value={runsYmFilter}
                onChange={(e) => setRunsYmFilter(e.target.value)}
                disabled={!hasSearchedRuns || availableYms.length === 0}
              >
                <option value="">כל החודשים</option>
                {availableYms.map((ym) => (
                  <option key={ym} value={ym}>
                    {ym}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1">סינון סטטוס:</label>
              <select
                className="border rounded px-2 py-1 w-full"
                value={runsStatusFilter}
                onChange={(e) => setRunsStatusFilter(e.target.value as any)}
              >
                <option value="all">הצג הכל</option>
                <option value="in_progress">רק בתהליך</option>
                <option value="error">רק שגיאות</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={fetchStuckRuns}
                disabled={stuckLoading || !runsAgentId}
                text={stuckLoading ? 'מחפש...' : 'חפש'}
              />
            </div>
          </div>

          {!hasSearchedRuns ? (
            <p className="text-sm text-gray-500">בחרי סוכן ולחצי &quot;חפש&quot; כדי לראות את הריצות שלו.</p>
          ) : stuckLoading ? (
            <p className="text-sm text-gray-500">טוען...</p>
          ) : filteredStuckRuns.length === 0 ? (
            <p className="text-sm text-gray-500">
              לא נמצאו נעילות (portalImportLocks) פעילות לסוכן זה לפי הסינון הנוכחי.
            </p>
          ) : (
            <div className="space-y-4">
              {runsGroupedByYm.map(([ym, rows]) => (
                <div key={ym} className="border rounded overflow-hidden">
                  <div className="bg-gray-100 px-3 py-2 font-bold text-sm">
                    חודש פרסום: {ym}
                  </div>
                  <div className="p-3 space-y-3">
                    {rows.map((item) => {
                      const mins = minutesAgo(item.updatedAt);
                      return (
                        <div key={`${ym}_${item.id}`} className="border rounded-lg overflow-hidden">
                          <div className="flex items-center justify-between bg-gray-50 px-3 py-2">
                            <div className="font-bold text-sm">{item.companyName}</div>
                            <button
                              onClick={() => setReleaseConfirmRun(item)}
                              disabled={releasingRunId === item.id}
                              className="text-red-600 hover:underline text-sm font-medium disabled:opacity-50"
                            >
                              {releasingRunId === item.id ? 'משחרר...' : 'שחרר נעילה'}
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3">
                            {/* טבלה 1: portalImportLocks */}
                            <div
                              className={`rounded-lg border p-3 ${
                                item.lockState === 'running'
                                  ? 'bg-blue-50 border-blue-200'
                                  : item.lockState === 'error'
                                  ? 'bg-red-50 border-red-200'
                                  : 'bg-gray-50 border-gray-200'
                              }`}
                            >
                              <div className="text-xs text-gray-500">שם טבלה</div>
                              <div className="font-mono font-bold text-sm mb-2">portalImportLocks</div>
                              <div className="text-xs text-gray-500">סטטוס</div>
                              <div className="font-bold text-base">{item.lockState || '(ריק)'}</div>
                              <div className="text-[11px] text-gray-500 mt-2 font-mono break-all">
                                <b>runId:</b> {item.runId || '(אין)'}
                              </div>
                              <div className="text-[11px] text-gray-400 mt-1 font-mono break-all">
                                docId: {item.lockId}
                              </div>
                            </div>

                            {/* טבלה 2: portalImportRuns */}
                            <div
                              className={`rounded-lg border p-3 ${
                                !item.runFound
                                  ? 'bg-gray-50 border-gray-200'
                                  : isInProgressStatus(item.status)
                                  ? 'bg-blue-50 border-blue-200'
                                  : item.status === 'error' || item.status === 'failed'
                                  ? 'bg-red-50 border-red-200'
                                  : 'bg-green-50 border-green-200'
                              }`}
                            >
                              <div className="text-xs text-gray-500">שם טבלה</div>
                              <div className="font-mono font-bold text-sm mb-2">portalImportRuns</div>
                              <div className="text-xs text-gray-500">סטטוס</div>
                              <div className="font-bold text-base">
                                {item.runFound ? statusLabel(item.status) : 'אין מסמך תואם'}
                                {item.step ? (
                                  <span className="text-xs text-gray-400 font-normal"> ({item.step})</span>
                                ) : null}
                              </div>
                              <div className="text-[11px] text-gray-500 mt-2 font-mono break-all">
                                <b>runId:</b> {item.runId || '(אין)'}
                              </div>
                              <div className="text-[11px] text-gray-400 mt-1 font-mono break-all">
                                docId: {item.runId || '(אין)'} <span className="text-gray-300">(= runId, זהה)</span>
                              </div>
                              {item.updatedAt && (
                                <div className="text-[11px] text-gray-400 mt-1">
                                  עודכן: {item.updatedAt.toLocaleString('he-IL')}
                                  {mins !== null ? ` (לפני ${mins} דק')` : ''}
                                </div>
                              )}
                            </div>

                            {/* טבלה 3: commissionImportQueue */}
                            <div
                              className={`rounded-lg border p-3 ${
                                item.queueJobs.length === 0
                                  ? 'bg-gray-50 border-gray-200'
                                  : item.queueJobs.some((j) => j.status === 'queued' || j.status === 'processing')
                                  ? 'bg-blue-50 border-blue-200'
                                  : item.queueJobs.some((j) => j.status === 'error')
                                  ? 'bg-red-50 border-red-200'
                                  : 'bg-green-50 border-green-200'
                              }`}
                            >
                              <div className="text-xs text-gray-500">שם טבלה</div>
                              <div className="font-mono font-bold text-sm mb-2">commissionImportQueue</div>
                              {item.queueJobs.length === 0 ? (
                                <>
                                  <div className="text-xs text-gray-500">סטטוס</div>
                                  <div className="font-bold text-base text-gray-400">אין job-ים משויכים</div>
                                  <div className="text-[11px] text-gray-400 mt-2 italic">
                                    (של הריצה ההורה — {item.runId || 'אין'})
                                  </div>
                                </>
                              ) : (
                                <div className="space-y-2">
                                  {item.queueJobs.map((j, jIdx) => (
                                    <div key={`${item.id}_${j.id}_${jIdx}`} className="border-t first:border-t-0 pt-1.5 first:pt-0">
                                      <div className="text-[11px] text-gray-500 font-mono break-all">
                                        <b>jobId:</b> {j.id}
                                      </div>
                                      <div className="text-xs text-gray-500 mt-1.5">סטטוס</div>
                                      <div className="font-bold text-base">{statusLabel(j.status)}</div>
                                      <div className="text-[11px] text-gray-500 mt-1 font-mono break-all">
                                        <b>portalRunId:</b> {j.portalRunId || '(לא רשום על המסמך)'}
                                      </div>
                                      {j.templateId && (
                                        <div className="text-[11px] text-gray-400 mt-0.5 font-mono break-all">
                                          templateId: {j.templateId}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        </>
        )}

        {activeMainTab === 'batches' && (
        <>
        {/* ===== מעקב באצ'ים (portalRunBatches) ===== */}
        <div className="mt-4 border rounded p-4 bg-white">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <h2 className="font-bold">מעקב באצ&apos;ים (portalRunBatches)</h2>
            <select
              className="border rounded px-2 py-1 text-sm"
              value={batchesStatusFilter}
              onChange={(e) => setBatchesStatusFilter(e.target.value as any)}
            >
              <option value="active">רק פעילים</option>
              <option value="all">הצג הכל</option>
            </select>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            לכל באצ&apos; מוצגות כל הריצות (portalImportRuns) שקשורות אליו, ולכל ריצה — הנעילה
            (portalImportLocks) הקשורה אליה. &quot;עצור באצ&apos;&quot; יסגור לשגיאה כל מה שעדיין לא הסתיים,
            כדי שהריצה תפסיק להתקדם.
          </p>

          {!hasSearchedRuns ? (
            <p className="text-sm text-gray-500">בחרי סוכן למעלה ולחצי &quot;חפש&quot; כדי לראות באצ&apos;ים.</p>
          ) : batchesLoading ? (
            <p className="text-sm text-gray-500">טוען...</p>
          ) : filteredBatches.length === 0 ? (
            <p className="text-sm text-gray-500">לא נמצאו באצ&apos;ים לפי הסינון הנוכחי.</p>
          ) : (
            <div className="space-y-4">
              {filteredBatches.map((batch) => {
                const active = !isBatchFinishedStatus(batch.status);
                return (
                  <div key={batch.id} className="border rounded-lg overflow-hidden">
                    <div
                      className={`flex items-center justify-between px-3 py-2 ${
                        active ? 'bg-blue-50' : 'bg-gray-50'
                      }`}
                    >
                      <div className="text-sm">
                        <span className="font-bold">{statusLabel(batch.status)}</span>
                        {batch.monthLabel ? <span className="text-gray-500"> | {batch.monthLabel}</span> : null}
                        <span className="text-gray-500">
                          {' '}
                          | {batch.doneCount ?? 0}/{batch.totalCount ?? batch.runs.length} הושלמו
                          {batch.errorCount ? `, ${batch.errorCount} שגיאות` : ''}
                        </span>
                        <div className="text-[11px] text-gray-400 font-mono mt-0.5">batchId: {batch.id}</div>
                      </div>
                      {active && (
                        <button
                          onClick={() => setBatchStopConfirm(batch)}
                          disabled={stoppingBatchId === batch.id}
                          className="text-red-600 hover:underline text-sm font-medium disabled:opacity-50"
                        >
                          {stoppingBatchId === batch.id ? 'עוצר...' : "עצור באצ'"}
                        </button>
                      )}
                    </div>

                    <div className="p-3 space-y-2">
                      {batch.runs.map((run) => {
                        const runMins = minutesAgo(run.updatedAt);
                        return (
                          <div key={`${batch.id}_${run.id}`} className="border rounded-lg overflow-hidden">
                            <div className="bg-gray-50 px-3 py-1.5 text-xs font-bold flex items-center justify-between">
                              <span>#{run.batchOrder} — {run.companyName}</span>
                              {run.ym && <span className="text-gray-400 font-normal">{run.ym}</span>}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-2">
                              {/* ריצה: portalImportRuns */}
                              <div
                                className={`rounded-lg border p-2 text-xs ${
                                  isInProgressStatus(run.status)
                                    ? 'bg-blue-50 border-blue-200'
                                    : run.status === 'error' || run.status === 'failed'
                                    ? 'bg-red-50 border-red-200'
                                    : 'bg-green-50 border-green-200'
                                }`}
                              >
                                <div className="text-gray-500">portalImportRuns</div>
                                <div className="font-bold">
                                  {statusLabel(run.status)}
                                  {run.step ? <span className="text-gray-400 font-normal"> ({run.step})</span> : null}
                                </div>
                                <div className="text-gray-400 font-mono break-all mt-1">runId: {run.id}</div>
                                {run.updatedAt && (
                                  <div className="text-gray-400 mt-0.5">
                                    {run.updatedAt.toLocaleString('he-IL')}
                                    {runMins !== null ? ` (לפני ${runMins} דק')` : ''}
                                  </div>
                                )}
                              </div>

                              {/* נעילה: portalImportLocks */}
                              <div
                                className={`rounded-lg border p-2 text-xs ${
                                  !run.lockFound
                                    ? 'bg-gray-50 border-gray-200'
                                    : run.lockState === 'running'
                                    ? 'bg-blue-50 border-blue-200'
                                    : run.lockState === 'error'
                                    ? 'bg-red-50 border-red-200'
                                    : 'bg-green-50 border-green-200'
                                }`}
                              >
                                <div className="text-gray-500">portalImportLocks</div>
                                <div className="font-bold">
                                  {run.lockFound ? (run.lockState || '(ריק)') : 'אין נעילה'}
                                </div>
                                <div className="text-gray-400 font-mono break-all mt-1">
                                  {run.lockId || '(אין templateId/ym לחישוב)'}
                                </div>
                              </div>

                              {/* job-ים: commissionImportQueue */}
                              <div
                                className={`rounded-lg border p-2 text-xs ${
                                  run.queueJobs.length === 0
                                    ? 'bg-gray-50 border-gray-200'
                                    : run.queueJobs.some((j) => j.status === 'queued' || j.status === 'processing')
                                    ? 'bg-blue-50 border-blue-200'
                                    : run.queueJobs.some((j) => j.status === 'error')
                                    ? 'bg-red-50 border-red-200'
                                    : 'bg-green-50 border-green-200'
                                }`}
                              >
                                <div className="text-gray-500">commissionImportQueue</div>
                                {run.queueJobs.length === 0 ? (
                                  <div className="font-bold text-gray-400">אין job-ים</div>
                                ) : (
                                  run.queueJobs.map((j, qIdx) => (
                                    <div key={`${run.id}_${j.id}_${qIdx}`} className="mt-0.5">
                                      <span className="font-bold">{statusLabel(j.status)}</span>
                                      <div className="text-gray-400 font-mono break-all">jobId: {j.id}</div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </>
        )}

        {activeMainTab === 'tools' && (
        <>
        <div>
<BackfillYmButton />
</div>
        </>
        )}

        {activeMainTab === 'imports' && (
        <>
        {/* ===== חלק תחתון: ניהול ריצות טעינה לפי מספר טעינה / טוען ===== */}
        <div className="mt-10 border-t pt-6">
          <div className="flex flex-col md:flex-row gap-3 mb-4 text-sm">
            <div className="flex-1">
              <label className="block mb-1">חיפוש כללי (מספר טעינה / סוכן / חברה / תבנית / חודש):</label>
              <input className="border rounded px-2 py-1 w-full" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="הקלד/י טקסט לחיפוש..." />
            </div>
            <div className="flex-1 md:max-w-xs">
              <label className="block mb-1">סינון לפי יוזר טוען:</label>
              <input className="border rounded px-2 py-1 w-full" value={uploaderFilter} onChange={(e) => setUploaderFilter(e.target.value)} placeholder="הקלד/י אימייל / שם" />
            </div>
            <div className="flex-1 md:max-w-xs">
              <label className="block mb-1">מתאריך:</label>
              <input type="date" className="border rounded px-2 py-1 w-full" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="flex-1 md:max-w-xs">
              <label className="block mb-1">עד תאריך:</label>
              <input type="date" className="border rounded px-2 py-1 w-full" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
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
                      {run.createdAt ? new Date(run.createdAt.seconds * 1000).toLocaleString('he-IL') : '-'}
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
                      <button onClick={() => handleRunDeleteClick(run)} className="text-red-600 hover:underline font-medium">
                        מחק
                      </button>
                      <button
  onClick={() => { setBridgeRun(run); setBridgeYm(''); }}
  className="text-blue-600 hover:underline font-medium mr-2"
>
  צור מגשר
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
        </>
        )}

{bridgeRun && (
  <DialogNotification
    type="info"
    title="צור מסמך מגשר לחודש פרסום"
    message={
      <div className="text-sm space-y-2">
        <div><b>ריצה:</b> {bridgeRun.runId}</div>
        <div><b>חברה:</b> {bridgeRun.company}</div>
        <div><b>חודש דיווח:</b> {bridgeRun.minReportMonth || bridgeRun.reportMonth || '-'}</div>
        <div className="mt-3">
          <label className="block mb-1 font-bold">חודש פרסום (חובה):</label>
          <input
            type="month"
            className="border rounded px-2 py-1 w-full"
            value={bridgeYm}
            onChange={e => setBridgeYm(e.target.value)}
          />
        </div>
      </div>
    }
    onConfirm={handleCreateBridge}
    onCancel={() => { setBridgeRun(null); setBridgeYm(''); }}
    confirmText={bridgeLoading ? 'יוצר...' : 'צור מגשר'}
    cancelText="ביטול"
  />
)}
        {releaseConfirmRun && (
          <DialogNotification
            type="warning"
            title="אישור שחרור נעילה"
            message={
              <div className="text-sm space-y-1">
                <p>האם למחוק את הנעילה הזו?</p>
                <div className="mt-2 font-mono text-xs bg-gray-50 border rounded p-2 space-y-1">
                  <div><b>portalImportLocks.docId:</b> {releaseConfirmRun.lockId}</div>
                  <div><b>portalImportLocks.state:</b> {releaseConfirmRun.lockState || '(ריק)'}</div>
                  <div><b>portalImportLocks.runId:</b> {releaseConfirmRun.runId || '(אין)'}</div>
                </div>
                <div className="mt-2">
                  <div><b>חברה:</b> {releaseConfirmRun.companyName}</div>
                  <div><b>חודש פרסום:</b> {releaseConfirmRun.ym}</div>
                  <div>
                    <b>מסמך ריצה תואם:</b>{' '}
                    {releaseConfirmRun.runFound
                      ? `נמצא (status: ${releaseConfirmRun.status || '-'})`
                      : 'לא נמצא'}
                  </div>
                  <div>
                    <b>job-ים ב-commissionImportQueue:</b>{' '}
                    {releaseConfirmRun.queueJobs.length === 0
                      ? 'אין'
                      : releaseConfirmRun.queueJobs
                          .map((j) => `${j.id} (${statusLabel(j.status)})`)
                          .join(', ')}
                  </div>
                </div>
                <p className="text-amber-700 mt-3">
                  הפעולה תמחק את הנעילה, ואם נמצא מסמך ריצה תואם — תסמן אותו כשגיאה, כך שהסוכן יוכל לנסות שוב.
                  job-ים ב-commissionImportQueue שנמצאים ב-queued/processing יסומנו גם הם כ-error.
                  אם הריצה בעצם עדיין פעילה באמת (לא תקועה), עדיף להמתין במקום לשחרר.
                </p>
              </div>
            }
            onConfirm={() => handleReleaseStuckRun(releaseConfirmRun)}
            onCancel={() => setReleaseConfirmRun(null)}
            confirmText={releasingRunId === releaseConfirmRun.id ? 'משחרר...' : 'שחרר'}
            cancelText="ביטול"
          />
        )}

        {batchStopConfirm && (
          <DialogNotification
            type="warning"
            title="אישור עצירת באצ'"
            message={
              <div className="text-sm space-y-1">
                <p>האם לעצור את הבאצ&apos; הזה?</p>
                <div className="mt-2 font-mono text-xs bg-gray-50 border rounded p-2 space-y-1">
                  <div><b>batchId:</b> {batchStopConfirm.id}</div>
                  <div><b>status נוכחי:</b> {statusLabel(batchStopConfirm.status)}</div>
                  <div>
                    <b>ריצות לא-סופיות שייסגרו:</b>{' '}
                    {batchStopConfirm.runs.filter((r) => !isRunFinishedStatus(r.status)).length} מתוך{' '}
                    {batchStopConfirm.runs.length}
                  </div>
                </div>
                <p className="text-amber-700 mt-3">
                  הפעולה תסגור לשגיאה את כל הריצות שעדיין לא הסתיימו בבאצ&apos; הזה, תמחק את הנעילות
                  שלהן, ותסמן job-ים תקועים בתור כשגיאה — כדי שהריצה תפסיק להתקדם. אם הבאצ&apos; בעצם
                  עדיין פעיל באמת (לא תקוע), עדיף להמתין במקום לעצור.
                </p>
              </div>
            }
            onConfirm={() => handleStopBatch(batchStopConfirm)}
            onCancel={() => setBatchStopConfirm(null)}
            confirmText={stoppingBatchId === batchStopConfirm.id ? 'עוצר...' : "עצור באצ'"}
            cancelText="ביטול"
          />
        )}

        {/* Dialog popup כללי */}
        {dialog ? (
          <DialogNotification
            type={dialog.type}
            title={dialog.title}
            message={dialog.message}
            onConfirm={() => setDialog(null)}
            confirmText="סגור"
            hideCancel
          />
        ) : null}
      </div>
    </AdminGuard>
  );
}
