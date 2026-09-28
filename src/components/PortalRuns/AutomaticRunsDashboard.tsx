'use client';



import React, { useMemo, useState, useEffect } from 'react';

import type { Firestore } from 'firebase/firestore';

import { firebaseApp } from '@/lib/firebase/firebase';

import {
  getDownloadURL,
  getStorage,
  ref as storageRef,
} from 'firebase/storage';

import AutoCompanyCard from './AutoCompanyCard';

import {

  useAutomationDashboardStatus,

  type AutomaticCompany,

  type AutoCompanyUiStatus,

  type DashboardCompanyState,

} from '@/hooks/useAutomationDashboardStatus';

import {

  doc,

  deleteDoc,

  collection,

  query,

  where,

  getDocs,

  writeBatch,

  getDoc,

} from 'firebase/firestore';



type Props = {

  db: Firestore;

  selectedAgentId?: string;

  companies: AutomaticCompany[];

  isAutoEnabledByFlag: boolean;

  autoDisabledReason: string;

  refreshKey?: number;

  activeCompanyId?: string;

  isRunActive?: boolean;

  batchCompanyStatuses?: Record<string, 'queued' | 'running' | 'done' | 'error'>;

  isBatchActive?: boolean;

  isRunnerOnline?: boolean | null;

  isUpdateAvailable?: boolean;

  onStartBatch: (companies: AutomaticCompany[]) => Promise<void>;

};



type DownloadFileRef = {
  storagePath: string;
  bucket: string;
};

function cleanBucket(value: unknown): string {
  return String(value ?? '').trim().replace(/^gs:\/\//, '');
}

function normalizeFirebaseBucket(bucket: string): string {
  const clean = cleanBucket(bucket);

  if (clean.endsWith('.appspot.com')) {
    return clean.replace('.appspot.com', '.firebasestorage.app');
  }

  return clean;
}

function bucketCandidates(raw: string): string[] {
  const savedBucket = cleanBucket(raw);
  const environmentBucket = cleanBucket(firebaseApp.options.storageBucket);

  const normalizedSavedBucket = normalizeFirebaseBucket(savedBucket);
  const normalizedEnvironmentBucket = normalizeFirebaseBucket(environmentBucket);

  return Array.from(
    new Set(
      [
        normalizedSavedBucket,
        normalizedEnvironmentBucket,
        savedBucket,
        environmentBucket,
      ].filter(Boolean)
    )
  );
}

async function resolveDownloadUrl(fileRef: DownloadFileRef): Promise<string> {
  for (const bucket of bucketCandidates(fileRef.bucket)) {
    try {
      return await getDownloadURL(
        storageRef(
          getStorage(firebaseApp, `gs://${bucket}`),
          fileRef.storagePath
        )
      );
    } catch {
      // נסיון הבא - תומך גם במסמכים ישנים ששמרו appspot.com.
    }
  }

  return '';
}

function triggerDownload(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

type DownloadBlobFile = {
  name: string;
  bytes: Uint8Array;
};

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];

    for (let bit = 0; bit < 8; bit++) {
      crc =
        (crc >>> 1) ^
        (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function pushUint16(
  target: number[],
  value: number
) {
  target.push(
    value & 0xff,
    (value >>> 8) & 0xff
  );
}

function pushUint32(
  target: number[],
  value: number
) {
  target.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff
  );
}


function uint8ArrayToArrayBuffer(
  bytes: Uint8Array
): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function buildZipBlob(
  files: DownloadBlobFile[]
): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];

  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const crc = crc32(file.bytes);

    const localHeader: number[] = [];

    // Local file header signature.
    pushUint32(localHeader, 0x04034b50);
    pushUint16(localHeader, 20);
    pushUint16(localHeader, 0);
    pushUint16(localHeader, 0); // STORE - ללא דחיסה
    pushUint16(localHeader, 0);
    pushUint16(localHeader, 0);
    pushUint32(localHeader, crc);
    pushUint32(localHeader, file.bytes.length);
    pushUint32(localHeader, file.bytes.length);
    pushUint16(localHeader, nameBytes.length);
    pushUint16(localHeader, 0);

    const localHeaderBytes =
      new Uint8Array(localHeader);

    localParts.push(
      localHeaderBytes,
      nameBytes,
      file.bytes
    );

    const centralHeader: number[] = [];

    // Central directory file header signature.
    pushUint32(centralHeader, 0x02014b50);
    pushUint16(centralHeader, 20);
    pushUint16(centralHeader, 20);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint32(centralHeader, crc);
    pushUint32(centralHeader, file.bytes.length);
    pushUint32(centralHeader, file.bytes.length);
    pushUint16(centralHeader, nameBytes.length);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint32(centralHeader, 0);
    pushUint32(centralHeader, offset);

    const centralHeaderBytes =
      new Uint8Array(centralHeader);

    centralParts.push(
      centralHeaderBytes,
      nameBytes
    );

    offset +=
      localHeaderBytes.length +
      nameBytes.length +
      file.bytes.length;
  }

  const centralDirectorySize =
    centralParts.reduce(
      (sum, part) => sum + part.length,
      0
    );

  const centralDirectoryOffset = offset;

  const endRecord: number[] = [];

  pushUint32(endRecord, 0x06054b50);
  pushUint16(endRecord, 0);
  pushUint16(endRecord, 0);
  pushUint16(endRecord, files.length);
  pushUint16(endRecord, files.length);
  pushUint32(
    endRecord,
    centralDirectorySize
  );
  pushUint32(
    endRecord,
    centralDirectoryOffset
  );
  pushUint16(endRecord, 0);

  const zipParts: BlobPart[] = [
    ...localParts,
    ...centralParts,
    new Uint8Array(endRecord),
  ].map((part) =>
    uint8ArrayToArrayBuffer(part)
  );

  return new Blob(
    zipParts,
    {
      type: 'application/zip',
    }
  );
}

function safeFileName(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim();
}

async function fetchDownloadFile(
  fileRef: DownloadFileRef
): Promise<DownloadBlobFile | null> {
  const url =
    await resolveDownloadUrl(fileRef);

  if (!url) {
    return null;
  }

  const response = await fetch(url);

  if (!response.ok) {
    return null;
  }

  const blob = await response.blob();

  const bytes = new Uint8Array(
    await blob.arrayBuffer()
  );

  return {
    name:
      safeFileName(
        fileRef.storagePath
          .split('/')
          .pop() || 'report'
      ) || 'report',
    bytes,
  };
}


const AutomaticRunsDashboard: React.FC<Props> = ({

  db,

  selectedAgentId,

  companies,

  isAutoEnabledByFlag,

  autoDisabledReason,

  refreshKey = 0,

  activeCompanyId,

  isRunActive = false,

  batchCompanyStatuses = {},

  isBatchActive = false,

  isRunnerOnline = null,

  isUpdateAvailable = false,

  onStartBatch,

}) => {

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [isSubmittingBatch, setIsSubmittingBatch] = useState(false);

  const [downloadingCompanyId, setDownloadingCompanyId] = useState<string | null>(null);



  // 🔧 בחירת חודש דיווח per company (early download)

  const [reportMonthChoices, setReportMonthChoices] = useState<Record<string, string>>({});



  // 🔧 קונפיג גלובלי — האם הורדה מוקדמת פתוחה כרגע

  const [earlyDownloadOpen, setEarlyDownloadOpen] = useState(false);



  useEffect(() => {

    const fetchConfig = async () => {

      try {

        const snap = await getDoc(doc(db, 'portalRunnerConfig', 'global'));

        if (snap.exists()) {

          setEarlyDownloadOpen(snap.data()?.earlyDownloadOpen === true);

        }

      } catch {

        setEarlyDownloadOpen(false);

      }

    };

    fetchConfig();

  }, [db]);



  const { items, loading, refresh } = useAutomationDashboardStatus({

    db,

    selectedAgentId,

    companies,

    isAutoEnabledByFlag,

    refreshKey,

  });



  const automaticCompanies = useMemo(

    () => companies.filter((c) => c.automationEnabled),

    [companies]

  );



  const byCompanyId = useMemo(

    () => Object.fromEntries(automaticCompanies.map((c) => [c.id, c])),

    [automaticCompanies]

  );



  const [deletingCompanyId, setDeletingCompanyId] = useState<string | null>(null);

  const [deleteConfirmCompanyId, setDeleteConfirmCompanyId] = useState<string | null>(null);



  const handleDeleteRun = async (item: DashboardCompanyState) => {

    setDeletingCompanyId(item.companyId);

    try {

      const { lockId, runId } = item;



      let jobIds: string[] = [];

      if (runId) {

        const runSnap = await getDoc(doc(db, 'portalImportRuns', runId));

        if (runSnap.exists()) {

          jobIds = runSnap.data()?.queue?.jobIds || [];

        }

      }



      for (const jobId of jobIds) {

        for (const col of [

          'commissionImportRuns',

          'externalCommissions',

          'commissionSummaries',

          'policyCommissionSummaries',

          'ymCommissionSummaries',

        ]) {

          const snap = await getDocs(

            query(collection(db, col), where('runId', '==', jobId))

          );

          if (!snap.empty) {

            const CHUNK = 450;

            for (let i = 0; i < snap.docs.length; i += CHUNK) {

              const batch = writeBatch(db);

              snap.docs.slice(i, i + CHUNK).forEach((d) => batch.delete(d.ref));

              await batch.commit();

            }

          }

        }

        await deleteDoc(doc(db, 'commissionImportQueue', jobId)).catch(() => {});

      }



      if (lockId) await deleteDoc(doc(db, 'portalImportLocks', lockId)).catch(() => {});

      if (runId) await deleteDoc(doc(db, 'portalImportRuns', runId)).catch(() => {});



      // 🔧 איפוס בחירת חודש אם נמחקה ריצה

      setReportMonthChoices((prev) => {

        const next = { ...prev };

        delete next[item.companyId];

        return next;

      });



      await refresh();

    } catch (e: any) {

      console.error('[Delete] Error:', e.message);

    } finally {

      setDeletingCompanyId(null);

      setDeleteConfirmCompanyId(null);

    }

  };



  const handleDownloadRunFiles = async (
    item: DashboardCompanyState
  ) => {
    if (!item.runId) {
      alert(
        'לא נמצאה ריצה שממנה ניתן להוריד קבצים.'
      );
      return;
    }

    setDownloadingCompanyId(item.companyId);

    try {
      const runSnap = await getDoc(
        doc(
          db,
          'portalImportRuns',
          item.runId
        )
      );

      if (!runSnap.exists()) {
        alert('מסמך הריצה לא נמצא.');
        return;
      }

      const runData: any = runSnap.data();

      const queueJobIds: string[] =
        Array.isArray(
          runData?.queue?.jobIds
        )
          ? runData.queue.jobIds
          : [];

      const jobIds = new Set<string>(
        queueJobIds
      );

      // חשוב:
      // לא בכל החברות כל ה-jobs נשמרים בהכרח
      // בתוך queue.jobIds. לכן מאתרים גם את כל
      // מסמכי commissionImportQueue של אותה
      // ריצת פורטל.
      const jobsByPortalRunSnap =
        await getDocs(
          query(
            collection(
              db,
              'commissionImportQueue'
            ),
            where(
              'portalRunId',
              '==',
              item.runId
            )
          )
        );

      jobsByPortalRunSnap.docs.forEach(
        (jobDoc) => {
          jobIds.add(jobDoc.id);
        }
      );

      const files: DownloadFileRef[] = [];
      const seen = new Set<string>();
      const templateIds =
        new Set<string>();

      let fallbackBucket = '';

      const addFile = (
        storagePathRaw: unknown,
        bucketRaw: unknown
      ) => {
        const storagePath =
          String(
            storagePathRaw || ''
          ).trim();

        const bucket =
          cleanBucket(bucketRaw) ||
          fallbackBucket;

        if (
          !storagePath ||
          seen.has(storagePath)
        ) {
          return;
        }

        seen.add(storagePath);

        files.push({
          storagePath,
          bucket,
        });
      };

      // 1. אוספים את כל הקבצים מכל ה-jobs
      // ששייכים לריצה.
      for (const jobId of jobIds) {
        const jobSnap = await getDoc(
          doc(
            db,
            'commissionImportQueue',
            jobId
          )
        );

        if (!jobSnap.exists()) {
          continue;
        }

        const job: any =
          jobSnap.data();

        const templateId =
          String(
            job?.templateId || ''
          ).trim();

        if (templateId) {
          templateIds.add(
            templateId
          );
        }

        const jobBucket =
          cleanBucket(
            job?.file?.bucket
          );

        if (
          jobBucket &&
          !fallbackBucket
        ) {
          fallbackBucket =
            jobBucket;
        }

        addFile(
          job?.file?.storagePath,
          job?.file?.bucket
        );

        const jobFiles: any[] =
          Array.isArray(job?.files)
            ? job.files
            : [];

        for (
          const jobFile of jobFiles
        ) {
          addFile(
            jobFile?.storagePath,
            jobFile?.bucket ||
              job?.file?.bucket
          );
        }
      }

      // 2. אוספים גם downloads של הריצה.
      // בחברות כמו כלל/הפניקס יכולה להיות
      // יותר מהורדה אחת לאותו CARD.
      const rawDownloads =
        runData?.downloads;

      const downloads: any[] =
        Array.isArray(rawDownloads)
          ? rawDownloads
          : rawDownloads &&
            typeof rawDownloads ===
              'object'
          ? Object.values(
              rawDownloads
            ).flatMap(
              (value: any) =>
                Array.isArray(value)
                  ? value
                  : [value]
            )
          : [];

      for (
        const download of downloads
      ) {
        const downloadTemplateId =
          String(
            download?.templateId ||
              ''
          ).trim();

        if (
          downloadTemplateId &&
          templateIds.size > 0 &&
          !templateIds.has(
            downloadTemplateId
          )
        ) {
          continue;
        }

        addFile(
          download?.storagePath,
          download?.bucket
        );
      }

      console.log(
        '[Download reports] files found:',
        files
      );

      if (!files.length) {
        alert(
          'לא נמצאו קבצי מקור לריצה זו.'
        );
        return;
      }

      const downloadedFiles:
        DownloadBlobFile[] = [];

      let failedCount = 0;

      for (
        const fileRef of files
      ) {
        try {
          const downloaded =
            await fetchDownloadFile(
              fileRef
            );

          if (!downloaded) {
            failedCount++;
            continue;
          }

          downloadedFiles.push(
            downloaded
          );
        } catch (error) {
          console.error(
            '[Download reports] File failed:',
            fileRef,
            error
          );

          failedCount++;
        }
      }

      if (
        downloadedFiles.length === 0
      ) {
        alert(
          'לא ניתן היה להוריד את קבצי המקור.'
        );
        return;
      }

      // קובץ אחד - מורידים אותו ישירות.
      if (
        downloadedFiles.length === 1
      ) {
        const onlyFile =
          downloadedFiles[0];

        const blob = new Blob(
          [
            uint8ArrayToArrayBuffer(
              onlyFile.bytes
            ),
          ]
        );

        const objectUrl =
          URL.createObjectURL(blob);

        triggerDownload(
          objectUrl,
          onlyFile.name
        );

        setTimeout(
          () =>
            URL.revokeObjectURL(
              objectUrl
            ),
          3000
        );
      } else {
        // יותר מקובץ אחד:
        // מורידים ZIP אחד כדי שהדפדפן
        // לא יחסום "Multiple downloads".
        const zipBlob =
          buildZipBlob(
            downloadedFiles
          );

        const objectUrl =
          URL.createObjectURL(
            zipBlob
          );

        const zipName =
          safeFileName(
            `${item.companyName || item.companyId}_${item.monthLabel || 'reports'}`
          ) + '.zip';

        triggerDownload(
          objectUrl,
          zipName
        );

        setTimeout(
          () =>
            URL.revokeObjectURL(
              objectUrl
            ),
          5000
        );
      }

      if (failedCount > 0) {
        alert(
          `נמצאו ${downloadedFiles.length + failedCount} קבצים. ${downloadedFiles.length} הורדו ו-${failedCount} נכשלו.`
        );
      }
    } catch (e: any) {
      console.error(
        '[Download reports] Error:',
        e
      );

      alert(
        e?.message ||
          'שגיאה בהורדת דוחות המקור.'
      );
    } finally {
      setDownloadingCompanyId(
        null
      );
    }
  };

  const stats = useMemo(() => {

    let done = 0, running = 0, error = 0, ready = 0;

    for (const item of items) {

      const batchStatus = batchCompanyStatuses[item.companyId];

      let effectiveStatus = item.uiStatus;

      if (isBatchActive && batchStatus) {

        if (batchStatus === 'running') effectiveStatus = 'running';

        else if (batchStatus === 'done') effectiveStatus = 'done';

        else if (batchStatus === 'error') effectiveStatus = 'error';

        else if (batchStatus === 'queued') effectiveStatus = 'queued' as any;

      } else if (isRunActive && activeCompanyId === item.companyId) {

        effectiveStatus = 'running';

      }

      if (effectiveStatus === 'done') done++;

      else if (effectiveStatus === 'running') running++;

      else if (effectiveStatus === 'error') error++;

      else if (effectiveStatus === 'ready' || effectiveStatus === 'queued') ready++;

    }

    return { done, running, error, ready, total: items.length };

  }, [items, batchCompanyStatuses, isBatchActive, isRunActive, activeCompanyId]);



  const selectedCompanies = useMemo(

    () =>

      selectedIds.map((id) => byCompanyId[id]).filter(Boolean) as AutomaticCompany[],

    [selectedIds, byCompanyId]

  );



  function canSelectForBatch(uiStatus: AutoCompanyUiStatus, company?: AutomaticCompany) {

    if (!company) return false;

    if (!isAutoEnabledByFlag) return false;

    if (company.companyAutoDownloadEnabled === false) return false;

    return uiStatus === 'ready' || uiStatus === 'error';

  }



  function toggleCompany(companyId: string) {

    setSelectedIds((prev) =>

      prev.includes(companyId)

        ? prev.filter((id) => id !== companyId)

        : [...prev, companyId]

    );

  }



  // 🔧 בחירת חודש דיווח per company

  const handleSelectReportMonth = (companyId: string, reportMonth: string) => {

    setReportMonthChoices((prev) => ({ ...prev, [companyId]: reportMonth }));

    // אם החברה עוד לא נבחרה לתור — מוסיפים אותה אוטומטית

    if (!selectedIds.includes(companyId)) {

      setSelectedIds((prev) => [...prev, companyId]);

    }

  };



  const handleStartBatch = async () => {

    if (!selectedCompanies.length) return;

    if (isRunnerOnline === false) {

      alert('הבוט אינו פעיל. יש להפעיל את MagicSale Runner לפני שליחת ריצות.');

      return;

    }

    if (isUpdateAvailable) {

      alert('יש עדכון גרסה זמין. יש לעדכן את הבוט לפני שליחת ריצות.');

      return;

    }

    if (isBatchActive) {

      alert('יש ריצה פעילה כרגע. יש להמתין לסיומה לפני שליחת ריצות נוספות.');

      return;

    }



    // 🔧 הוסף requestedReportMonth לכל חברה שנבחרה לה בחירה

    const companiesWithChoice = selectedCompanies.map((c) => ({

      ...c,

      requestedReportMonth: reportMonthChoices[c.id] || undefined,

    }));



    try {

      setIsSubmittingBatch(true);

      await onStartBatch(companiesWithChoice);

      setSelectedIds([]);

      setReportMonthChoices({});

      await refresh();

    } finally {

      setIsSubmittingBatch(false);

    }

  };



  if (!selectedAgentId || automaticCompanies.length === 0) return null;



  return (

    <section className="space-y-4">

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">

          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-center">

            <div className="text-sm font-bold text-blue-700">מוכנות להפעלה</div>

            <div className="mt-1 text-4xl font-black text-blue-700">{stats.ready}</div>

          </div>

          <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-center">

            <div className="text-sm font-bold text-red-700">שגיאות</div>

            <div className="mt-1 text-4xl font-black text-red-700">{stats.error}</div>

          </div>

          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-center">

            <div className="text-sm font-bold text-indigo-700">בריצה</div>

            <div className="mt-1 text-4xl font-black text-indigo-700">{stats.running}</div>

          </div>

          <div className="rounded-2xl border border-green-100 bg-green-50 p-4 text-center">

            <div className="text-sm font-bold text-green-700">הושלמו</div>

            <div className="mt-1 text-4xl font-black text-green-700">{stats.done}</div>

          </div>

        </div>

      </div>



      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">

        בחר את החברות שייכנסו לתור. אפשר לבחור חברה אחת או כמה חברות, והמערכת תריץ אותן אחת אחרי השנייה.

        {isAutoEnabledByFlag && (

          <div className="text-sm text-blue-700 mt-1">

            {(() => {

              const now = new Date();

              const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);

              const label = twoMonthsAgo.toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });

              return `בתי השקעות ומוצרי הגמל בחברות הביטוח זמינים בגין חודש ${label}`;

            })()}

          </div>

        )}

        {/* 🔧 הודעה כשהורדה מוקדמת זמינה */}

        {earlyDownloadOpen && (

          <div className="text-sm text-indigo-700 mt-1 font-semibold">

            ⚡ הורדה מוקדמת זמינה — ניתן לבחור חודש דיווח לחברות מסומנות

          </div>

        )}

      </div>



      {!isAutoEnabledByFlag && (

        <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">

          {autoDisabledReason}

        </div>

      )}



      {loading ? (

        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500">

          טוען סטטוסים...

        </div>

      ) : (

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

          {items.map((item) => {

            const company = byCompanyId[item.companyId];



            let effectiveStatus: AutoCompanyUiStatus = item.uiStatus;

            const batchStatus = batchCompanyStatuses[item.companyId];

            const itemAutoDisabledReason =

              batchStatus === 'queued'

                ? 'ממתין בתור לריצה'

                : !isAutoEnabledByFlag

                ? autoDisabledReason

                : company?.companyAutoDownloadMessage || 'לא זמין';



            if (isBatchActive && batchStatus) {

              if (batchStatus === 'running') effectiveStatus = 'running';

              else if (batchStatus === 'done') effectiveStatus = 'done';

              else if (batchStatus === 'error') effectiveStatus = 'error';

              else if (batchStatus === 'queued') effectiveStatus = 'queued';

            } else if (isRunActive && activeCompanyId === item.companyId) {

              effectiveStatus = 'running';

            }



            const selectableInBatch = canSelectForBatch(effectiveStatus, company);

            const selected = selectedIds.includes(item.companyId);



            // 🔧 האם לחברה זו יש אפשרות הורדה מוקדמת

            const companyAllowsEarly = !!(company as any)?.allowEarlyDownload;



            return (

              <div

                key={item.companyId}

                className={`relative rounded-2xl transition ${

                  selectableInBatch ? 'cursor-pointer' : ''

                } ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}

                onClick={() => {

                    console.log('companyAllowsEarly:', companyAllowsEarly, 'earlyDownloadOpen:', earlyDownloadOpen, 'company:', company); // 🔧 זמני

                  if (!selectableInBatch || isSubmittingBatch) return;

                  // 🔧 אם יש אפשרות הורדה מוקדמת — לא מוסיפים לתור ישירות,

                  // המשתמש צריך לבחור חודש דיווח דרך הכרטיס עצמו

                  if (companyAllowsEarly && earlyDownloadOpen) return;

                  toggleCompany(item.companyId);

                }}

              >

                <AutoCompanyCard

                  companyId={item.companyId}

                  companyName={item.companyName}

                  monthLabel={item.monthLabel}

                  uiStatus={effectiveStatus}

                  autoDisabledReason={itemAutoDisabledReason}

                  lastRunAt={item.lastRunAt}

                  busy={isSubmittingBatch}

                  globallyBlocked={false}

                  globallyBlockedReason="יש ריצה פעילה כרגע"

                  missingReports={item.missingReports}

                  errorMessage={item.errorMessage}

                  allowEarlyDownload={companyAllowsEarly}

                  earlyDownloadOpen={earlyDownloadOpen}

                  selectedReportMonth={reportMonthChoices[item.companyId]}

                  onSelectReportMonth={handleSelectReportMonth}

                  hasDownload={effectiveStatus === 'done' && !!item.runId}

                  downloading={downloadingCompanyId === item.companyId}

                  onDownload={
                    effectiveStatus === 'done' && item.runId
                      ? () => handleDownloadRunFiles(item)
                      : undefined
                  }

                  onDelete={

                    effectiveStatus === 'done'

                      ? () => setDeleteConfirmCompanyId(item.companyId)

                      : undefined

                  }

                />

              </div>

            );

          })}

        </div>

      )}



      <div className="sticky bottom-4 z-10">

        <div className="mx-auto flex max-w-md flex-col gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-lg">

          {(isRunnerOnline === false || isUpdateAvailable || isBatchActive) && (

            <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">

              <span>🔴</span>

              <span>

                {isRunnerOnline === false

                  ? 'הבוט אינו פעיל — יש להפעיל את MagicSale Runner לפני שליחת ריצות'

                  : isBatchActive

                  ? 'יש ריצה פעילה — יש להמתין לסיומה לפני שליחת ריצות נוספות'

                  : 'יש עדכון גרסה זמין — יש לעדכן את הבוט לפני שליחת ריצות'}

              </span>

            </div>

          )}

          <div className="flex items-center justify-between">

            <div className="text-sm text-gray-600">

              נבחרו <span className="font-bold text-gray-900">{selectedCompanies.length}</span> חברות

            </div>

            <button

              type="button"

              onClick={handleStartBatch}

              disabled={

                !selectedCompanies.length ||

                isSubmittingBatch ||

                isRunnerOnline === false ||

                !!isUpdateAvailable ||

                isBatchActive

              }

              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"

            >

              {isSubmittingBatch

                ? 'שולח...'

                : selectedCompanies.length <= 1

                ? 'התחל ריצה'

                : `התחל ריצה ל-${selectedCompanies.length} חברות`}

            </button>

          </div>

        </div>

      </div>



      {deleteConfirmCompanyId &&

        (() => {

          const item = items.find((i) => i.companyId === deleteConfirmCompanyId);

          if (!item) return null;

          return (

            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">

              <div

                className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl text-right"

                dir="rtl"

              >

                <div className="text-lg font-bold mb-2">מחיקת ריצה</div>

                <div className="text-sm text-gray-700 mb-4">

                  האם למחוק את כל נתוני הריצה של <b>{item.companyName}</b> לחודש{' '}

                  <b>{item.monthLabel}</b>?

                  <br />

                  <span className="text-xs text-gray-500">

                    הנתונים יימחקו ותוכל לשלוח ריצה מחדש.

                  </span>

                </div>

                <div className="flex gap-2 justify-end">

                  <button

                    onClick={() => setDeleteConfirmCompanyId(null)}

                    className="px-4 py-2 rounded-xl border text-sm"

                  >

                    ביטול

                  </button>

                  <button

                    onClick={() => handleDeleteRun(item)}

                    disabled={deletingCompanyId === item.companyId}

                    className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm disabled:opacity-50"

                  >

                    {deletingCompanyId === item.companyId ? 'מוחק...' : 'מחק ונסה שוב'}

                  </button>

                </div>

              </div>

            </div>

          );

        })()}

    </section>

  );

};



export default AutomaticRunsDashboard;
