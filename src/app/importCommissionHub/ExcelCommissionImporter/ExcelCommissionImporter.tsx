// ExcelCommissionImporter.tsx – premium + totalPremiumAmount + product intake/normalize
'use client';

import React, { useState, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { db } from '@/lib/firebase/firebase';
import {
  collection,
  getDoc,
  doc,
  getDocs,
  serverTimestamp,
  query,
  where,
  updateDoc,
  arrayUnion,
  setDoc,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { Button } from '@/components/Button/Button';
import DialogNotification from '@/components/DialogNotification';
import './ExcelCommissionImporter.css';
import { writeBatch } from 'firebase/firestore';
import Link from 'next/link';
import { useToast } from "@/hooks/useToast";
import { add } from "date-fns";
import {ToastNotification} from '@/components/ToastNotification'
import { deleteDoc } from 'firebase/firestore';
import { startAutoPortalRun } from "@/lib/portalRuns/startAutoPortalRun";
import PortalRunOtpModal from "@/components/PortalRunOtpModal";
// import { triggerPortalRun } from "@/lib/portalRuns/triggerPortalRun";
import PortalRunStatus from "@/components/PortalRuns/PortalRunStatus";
// import { isCloudMode } from "@/lib/portalRuns/runnerMode";
import { usePermission } from "@/hooks/usePermission";

import { recomputeSummariesFromExternalManual } from "@/utils/manualCommissionRecompute";
import AutomaticRunsDashboard from '@/components/PortalRuns/AutomaticRunsDashboard';

import type { MultiSheetImportProfile } from "@/types/MultiSheetImportProfile";
import { getMultiSheetProfiles } from "@/lib/multiSheetProfiles/getMultiSheetProfiles";
import { parseMultiSheetWorkbook } from "@/lib/multiSheetProfiles/parseMultiSheetWorkbook";
import BatchProgressCard from '@/components/PortalRuns/BatchProgressCard';
import { applyMonthOffset } from "@/lib/multiSheetProfiles/applyMonthOffset";
/* ==============================
   Types
============================== */
interface CommissionTemplateOption {
  id: string;
  companyName: string;
  type: string;
  companyId: string;
  Name?: string;
  automationClass?: string;
  commissionIncludesVAT?: boolean; 
  automationEnabled?: boolean;
  companyAutoClass?: string;
  companyAutoDownloadEnabled?: boolean;
companyAutoDownloadMessage?: string;
portalId?: string;
allowEarlyDownload?: boolean;
}

interface CommissionSummary {
  agentId: string;
  agentCode: string;
  reportMonth: string;
  templateId: string;
  companyId: string;
  company: string;
  totalCommissionAmount: number;
  totalPremiumAmount: number;
  runId?: string;
}

interface PolicyCommissionSummary {
  agentId: string;
  agentCode: string;
  reportMonth: string;        // YYYY-MM
  companyId: string;
  company: string;
  policyNumberKey: string;    // מנורמל ללא רווחים
  customerId: string;         // 9 ספרות מרופד
  fullName?: string;
  templateId: string;
  totalCommissionAmount: number;
  totalPremiumAmount: number;
  commissionRate: number;     // totalCommissionAmount / totalPremiumAmount * 100
  rowsCount: number;          // כמה שורות מקור אוחדו
  product?: string;
  runId?: string; 
  validMonth?: string;
 }
 
/* ==============================
   Component
============================== */
const ExcelCommissionImporter: React.FC = () => {
  const { detail, user } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  const [templateId, setTemplateId] = useState('');
  const [templateOptions, setTemplateOptions] = useState<CommissionTemplateOption[]>([]);

  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [selectedFileName, setSelectedFileName] = useState("");
  const [standardizedRows, setStandardizedRows] = useState<any[]>([]);
  const [existingDocs, setExistingDocs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [summaryByAgentCode, setSummaryByAgentCode] = useState<any[]>([]);
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);

  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const canChooseFile = Boolean(selectedAgentId && selectedCompanyId && templateId);

  const [showTemplateMismatch, setShowTemplateMismatch] = useState(false);
  const [errorDialog, setErrorDialog] = useState<{ title: string; message: React.ReactNode } | null>(null);

  const { toasts, addToast, setToasts } = useToast();

  const [existingRunIds, setExistingRunIds] = useState<string[]>([]);
  const [monthsInFile, setMonthsInFile] = useState<string[]>([]);
  const [conflictingRunIds, setConflictingRunIds] = useState<string[]>([]);
  
  const [isRunnerOnline, setIsRunnerOnline] = useState<boolean | null>(null);
  // const sanitizeMonth = (m?: any) => String(m || '').replace(/\//g, '-').trim();

  const sanitizeMonth = (m?: any) => {
  const s = String(m || '').replace(/\//g, '-').trim();
  return s.replace(/^(\d{4})-(\d)$/, '$1-0$2');
};

  const [fallbackProduct, setFallbackProduct] = useState<string>('');
const [loadingStage, setLoadingStage] = useState<string>("");

const { canAccess: canAutoDownload, isChecking: isCheckingAutoDownload } =
  usePermission(user ? "access_portal_auto_download" : null);

const [autoDashboardRefreshKey, setAutoDashboardRefreshKey] = useState(0);
const [activeAutoCompanyId, setActiveAutoCompanyId] = useState<string>("");

const [selectedReportYear, setSelectedReportYear] = useState("");
const [selectedReportMonth, setSelectedReportMonth] = useState("");

// בחירה מתוך ZIP
  const [zipChooser, setZipChooser] = useState<null | {
    zip: any;
    entryNames: string[];
    outerFileName: string;
  }>(null);
  const [selectedZipEntry, setSelectedZipEntry] = useState<string>('');

  const selectedTemplate = React.useMemo(
    () => templateOptions.find(t => t.id === templateId),
    [templateId, templateOptions]
  );

const [importProgress, setImportProgress] = useState(0);

const [batchCompanyStatuses, setBatchCompanyStatuses] = useState<
  Record<string, "queued" | "running" | "done" | "error">
>({});

  const VAT_DEFAULT = 0.18;

  //automaionUpload

const [autoRunId, setAutoRunId] = useState<string>("");
const [autoRunKind, setAutoRunKind] = useState<"portal" | "self_update" | "">("");

const [isStartingAuto, setIsStartingAuto] = useState(false);
const [isAutoRunActive, setIsAutoRunActive] = useState(false);
const handledFinishedRunRef = useRef<string>('');
const automationClass = String(selectedTemplate?.automationClass || "").trim();
// const canStartAuto = Boolean(
//   selectedAgentId && selectedCompanyId && templateId && automationClass
// );

const [activeBatchId, setActiveBatchId] = useState<string>("");
const [batchRunIds, setBatchRunIds] = useState<string[]>([]);
const [batchProgress, setBatchProgress] = useState<{
  total: number;
  done: number;
  error: number;
  running: number;
  queued: number;
  currentRunId: string;
  currentCompanyId: string;
  currentCompanyName: string;
  currentStep: string;
} | null>(null);


type AutomaticCompany = {
  id: string;
  name: string;
  automationEnabled?: boolean;
  companyAutomationClass?: string;
  portalId?: string;
  companyAutoDownloadEnabled?: boolean;
companyAutoDownloadMessage?: string;
allowEarlyDownload?: boolean;
};

const handleStartAutoForCompany = async (company: AutomaticCompany) => {
  if (!selectedAgentId) return;

  const finalAutomationClass = String(company.companyAutomationClass || '').trim();
  if (!finalAutomationClass) {
    addToast('error', 'לא הוגדר automationClass לחברה זו');
    return;
  }

  const portalId = String(company.portalId || company.id);
  const finalTemplateId = `bundle_${portalId}_commissions`;

  setIsStartingAuto(true);
  setIsAutoRunActive(true);
  setActiveAutoCompanyId(company.id);
handledFinishedRunRef.current = '';
  try {
    const { runId } = await startAutoPortalRun({
      db,
      agentId: selectedAgentId,
      companyId: company.id,
      templateId: finalTemplateId,
      automationClass: finalAutomationClass,
      monthLabel: 'previous_month',
      source: 'portalRunner',
      triggeredFrom: 'ui',
    });

    setAutoRunId(runId);
    setAutoRunKind('portal');
  } catch (e: any) {
    addToast('error', `שגיאה: ${e.message}`);
    setIsAutoRunActive(false);
  } finally {
    setIsStartingAuto(false);
  }
};

const handlePortalRunFinished = useCallback((status: string) => {
  if (!autoRunId) return;

  const isFinalPortalStatus =
  autoRunKind === "self_update"
    ? status === "done" || status === "error"
    : status === "success" || status === "error" || 
      status === "failed" || status === "skipped";

  if (!isFinalPortalStatus) return;
  if (activeBatchId) return;
  if (handledFinishedRunRef.current === autoRunId) return;

  handledFinishedRunRef.current = autoRunId;
  setIsAutoRunActive(false);
  setActiveAutoCompanyId('');
setTimeout(() => setAutoDashboardRefreshKey((v) => v + 1), 3000);

  setTimeout(() => {
setTimeout(() => setAutoDashboardRefreshKey((v) => v + 1), 3000);
  }, 1500);

  if (autoRunKind === "self_update") {
    if (status === "done") addToast("success", "✅ קובץ העדכון ירד וההתקנה הופעלה.");
    else if (status === "error") addToast("error", "❌ עדכון הגרסה נכשל.");
    return;
  }

  if (status === "skipped") addToast("error", "⏭️ המשיכה דולגה (כבר קיים במערכת)");
  else if (status === "success" || status === "done") addToast("success", "✅ המשיכה האוטומטית הושלמה בהצלחה!");
  else if (status === "failed" || status === "error") addToast("error", "ℹ️ הריצה הסתיימה עם שגיאה.");

}, [autoRunId, autoRunKind, activeBatchId]);

  /* ==============================
     Helpers
  ============================== */

const [autoDownloadFlag, setAutoDownloadFlag] = useState<{ enabled: boolean; message?: string } | null>(null);
const [isCheckingFlag, setIsCheckingFlag] = useState(false);

useEffect(() => {
  const loadFlag = async () => {
    if (canAutoDownload !== true) {
      setAutoDownloadFlag(null);
      return;
    }

    setIsCheckingFlag(true);
    try {
      const snap = await getDoc(doc(db, "systemFlags", "automation"));
      const data: any = snap.exists() ? snap.data() : {};
      setAutoDownloadFlag({
        enabled: data.autoDownloadEnabled !== false, // default true
        message: String(data.autoDownloadMessage || "").trim(),
      });
    } finally {
      setIsCheckingFlag(false);
    }
  };

  loadFlag();
}, [canAutoDownload]);

// --- לוגיקת ניהול ה-Runner (OTA & Download) ---
const [latestRunnerVersion, setLatestRunnerVersion] = useState<string>("");
const [currentRunnerVersion, setCurrentRunnerVersion] = useState<string>("");
const [installerUrl, setInstallerUrl] = useState<string>("");
const needsManualUpgrade =
  currentRunnerVersion === "2.0.0" ||
  currentRunnerVersion === "2.0.1";
  
  // const INSTALLER_URL = "https://firebasestorage.googleapis.com/v0/b/magicsale-test.firebasestorage.app/o/installers%2FMagicSaleSetup.exe?alt=media&token=7fea4a99-c42b-4814-8b26-452e11a7d91e"; // הלינק מה-Storage

const isAutoEnabledByFlag = autoDownloadFlag?.enabled !== false;
const autoDisabledReason =
  autoDownloadFlag?.message || "הדוחות עדיין לא זמינים להורדה החודש.";

  /* ==============================
     Derived data
  ============================== */
// יצירת רשימת חברות ייחודית הכוללת את שדה ה-Automation
const uniqueCompanies = Array.from(
  templateOptions.reduce((acc, t) => {
    const existing = acc.get(t.companyId);
    
    // לוגיקה: אם החברה עוד לא קיימת, או אם הקיימת ריקה והנוכחית מכילה Class
    if (!existing || (!existing.companyAutomationClass && t.companyAutoClass)) {
      acc.set(t.companyId, {
        id: t.companyId,
        name: t.companyName,
        automationEnabled: t.automationEnabled,
        companyAutomationClass: t.companyAutoClass || "",
        companyAutoDownloadEnabled: t.companyAutoDownloadEnabled !== false,
        companyAutoDownloadMessage: t.companyAutoDownloadMessage || "",
        portalId: t.portalId || t.companyId,
        allowEarlyDownload: t.allowEarlyDownload === true,
      });
    }
    return acc;
  }, new Map()).values()
) as any[];



//filter company 

const [preferredCompanyIds, setPreferredCompanyIds] = useState<string[]>([]);

useEffect(() => {
  if (!selectedAgentId) return;
  getDoc(doc(db, 'users', selectedAgentId)).then(snap => {
    setPreferredCompanyIds(snap.data()?.preferredCompanyIds || []);
  });
}, [selectedAgentId]);



const automaticCompanies = uniqueCompanies
  .filter((c) => c.automationEnabled)
  .filter((c) => preferredCompanyIds.length === 0 || preferredCompanyIds.includes(c.id))
  .map((c) => ({
    id: c.id,
    name: c.name,
    automationEnabled: c.automationEnabled,
    companyAutomationClass: c.companyAutomationClass,
    companyAutoDownloadEnabled: c.companyAutoDownloadEnabled,
    companyAutoDownloadMessage: c.companyAutoDownloadMessage,
    portalId: c.portalId || c.id,
    allowEarlyDownload: c.allowEarlyDownload,
  }));


const filteredTemplates = templateOptions.filter(t => t.companyId === selectedCompanyId);

// 1. אובייקט החברה המלא (בשביל ה-Automation)
const selectedCompany = React.useMemo(
  () => uniqueCompanies.find(c => c.id === selectedCompanyId),
  [selectedCompanyId, uniqueCompanies]
);

// 2. שם החברה (בשביל לשמור על תאימות לקוד הקיים שלך)
const selectedCompanyName = React.useMemo(
  () => selectedCompany?.name || '',
  [selectedCompany]
);


const effectiveAutomationClass = (selectedCompany?.companyAutomationClass && selectedCompany.companyAutomationClass !== "")
  ? selectedCompany.companyAutomationClass 
  : String(selectedTemplate?.automationClass || "").trim();

const canStartAuto = Boolean(selectedAgentId && selectedCompanyId && effectiveAutomationClass !== "");


const FINAL_RUN_STATUSES = new Set(["success", "done", "error", "failed", "skipped"]);

const IN_PROGRESS_RUN_STATUSES = new Set([
 "otp_required",
  "running",
  "logged_in",
  "file_uploaded",
]);

const QUEUED_RUN_STATUSES = new Set(["queued"]);
useEffect(() => {
  if (!activeBatchId) return;

  const qy = query(
    collection(db, "portalImportRuns"),
    where("batchId", "==", activeBatchId)
  );

  const unsub = onSnapshot(qy, (snap) => {
    const runs = snap.docs
      .map((d) => {
        const data: any = d.data() || {};
        return {
          id: d.id,
          companyId: String(data.companyId || "").trim(),
          companyName: String(data.companyName || "").trim(),
          batchOrder: Number(data.batchOrder || 0),
          status: String(data.status || "").trim(),
          step: String(data.step || "").trim(),
          updatedAt: data.updatedAt?.toMillis?.() || 0,
        };
      })
      .sort((a, b) => a.batchOrder - b.batchOrder);

    if (!runs.length) return;

    const done = runs.filter(
      (r) => r.status === "success" || r.status === "done"
    ).length;

    const error = runs.filter(
      (r) => r.status === "error" || r.status === "failed"
    ).length;

    const statusPriority: Record<string, number> = {
      otp_required: 1,
      running: 2,
      logged_in: 3,
      file_uploaded: 4,
    };

    const inProgressItems = runs
      .filter((r) => IN_PROGRESS_RUN_STATUSES.has(r.status))
      .sort((a, b) => {
        const pa = statusPriority[a.status] ?? 999;
        const pb = statusPriority[b.status] ?? 999;

        if (pa !== pb) return pa - pb;

        return a.batchOrder - b.batchOrder;
      });

    const queuedItems = runs
      .filter((r) => QUEUED_RUN_STATUSES.has(r.status))
      .sort((a, b) => a.batchOrder - b.batchOrder);

    const current = inProgressItems[0] || queuedItems[0] || null;

    let runningCount = inProgressItems.length;

    if (isAutoRunActive && current) {
      runningCount = Math.max(runningCount, 1);
    }

    const queued = Math.max(
      runs.filter((r) => r.status === "queued").length -
        (current?.status === "queued" ? 1 : 0),
      0
    );

    setBatchRunIds(runs.map((r) => r.id));

    setBatchProgress({
      total: runs.length,
      done,
      error,
      running: runningCount,
      queued,
      currentRunId: current?.id || "",
      currentCompanyId: current?.companyId || "",
      currentCompanyName: current?.companyName || "",
      currentStep: current?.step || "",
    });
// עדכון סטטוס לכל חברה
const newStatuses: Record<string, "queued" | "running" | "done" | "error"> = {};
for (const r of runs) {
  if (r.status === "success" || r.status === "done") {
    newStatuses[r.companyId] = "done";
  } else if (r.status === "error" || r.status === "failed") {
    newStatuses[r.companyId] = "error";
  } else if (IN_PROGRESS_RUN_STATUSES.has(r.status)) {
    newStatuses[r.companyId] = "running";
  } else if (r.status === "queued") {
    newStatuses[r.companyId] = "queued";
  }
}
setBatchCompanyStatuses(newStatuses);

    if (current) {
      setAutoRunId(current.id);
      setAutoRunKind("portal");
      setActiveAutoCompanyId(current.companyId);
      setIsAutoRunActive(true);
      return;
    }

    const allFinished = runs.every((r) => FINAL_RUN_STATUSES.has(r.status));

  if (allFinished) {
      setIsAutoRunActive(false);
      setActiveAutoCompanyId("");
      setTimeout(() => setAutoDashboardRefreshKey((v) => v + 1), 3000);

      // עדכון סטטוס ה-Batch ב-Firestore
      (async () => {
        try {
          const finalStatus = error > 0 && done === 0 ? "error" : error > 0 ? "partial" : "success";
          await setDoc(doc(db, "portalRunBatches", activeBatchId), {
            status: finalStatus,
            finishedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            doneCount: done,
            errorCount: error,
          }, { merge: true });
        } catch (e) {
          // ignore
        }
      })();

      if (error > 0 && done > 0) {
        addToast("success", `✅ Batch הסתיים: ${done} הושלמו, ${error} עם שגיאה`);
      } else if (error > 0 && done === 0) {
        addToast("error", `❌ Batch הסתיים עם שגיאות (${error})`);
      } else {
        addToast("success", `✅ Batch הושלם בהצלחה (${done}/${runs.length})`);
      }

      setTimeout(() => {
        setActiveBatchId("");
        setBatchRunIds([]);
        setBatchProgress(null);
      }, 1200);
    }
  });

  return () => unsub();
}, [activeBatchId, isAutoRunActive]);

// const handleStartAuto = async () => {
//   if (!selectedAgentId || !selectedCompanyId) return;

//   setIsStartingAuto(true);
//   setIsAutoRunActive(true);

//   try {
//     // לוקח את ה-Class מהחברה (או מהתבנית אם אין לחברה)
//     const finalAutomationClass = effectiveAutomationClass;

//     const portalId = selectedCompany?.portalId || selectedCompanyId;
    
//     const finalTemplateId = `bundle_${portalId}_commissions`;
  

//     const { runId } = await startAutoPortalRun({
//       db,
//       agentId: selectedAgentId,
//       companyId: selectedCompanyId,
//       templateId: finalTemplateId,
//       automationClass: finalAutomationClass,
//       monthLabel: "previous_month",
//       source: "portalRunner",
//       triggeredFrom: "ui",
//     });

//     setAutoRunId(runId);
//     setAutoRunKind("portal");
//   } catch (e: any) {
//     addToast("error", `שגיאה: ${e.message}`);
//     setIsAutoRunActive(false);
//   } finally {
//     setIsStartingAuto(false);
//   }
// };




  const roundTo2 = (num: number) => Math.round(num * 100) / 100;
const getExt = (n?: string) => {
  // console.log("[getExt] input =", n);
  if (!n || typeof n !== "string") return "";
  const idx = n.lastIndexOf(".");
  return idx >= 0 ? n.slice(idx).toLowerCase() : "";
};
  // דגל דיבאגר
  const DEBUG_IMPORT = true;

  // --- normalize header: מסיר RTL-marks, BOM, NBSP, שורות חדשות, מכווץ רווחים ---
function normalizeHeader(h: string) {
  return String(h || "")
    .replace(/\u200E|\u200F|\u202A|\u202B|\u202C/g, "") // RTL/LTR marks
    .replace(/\u00A0/g, " ") // NBSP
    .replace(/\s+/g, " ") // רווחים כפולים
    .trim()
    .toLowerCase();
}

const normalizeRowKeys = (row: Record<string, any>) => {
  const normalized: Record<string, any> = {};

  for (const [key, value] of Object.entries(row || {})) {
    normalized[normalizeHeader(key)] = value;
  }

  return normalized;
};

  //     const dumpHeaderChars = (s: string) =>
  // Array.from(String(s || "")).map((ch) => ({
  //   ch,
  //   code: ch.charCodeAt(0),
  // }));

  // --- גטר בטוח לתאים לפי כותרת (תומך בכותרת מנורמלת) ---
  // const getCell = (row: any, header: string) =>
  //   row[header] ?? row[normalizeHeader(header)];

const getCell = (row: any, header: string) =>
  row[header] ??
  row[String(header).trim()] ??
  row[normalizeHeader(header)];


const getValueBySystemField = (
  row: Record<string, any>,
  mapping: Record<string, string>,
  systemField: string
) => {
  const normalizedRow: Record<string, any> = normalizeRowKeys(row);

  const candidateColumns = Object.entries(mapping)
    .filter(([, field]) => field === systemField)
    .map(([excelCol]) => normalizeHeader(excelCol));

  for (const col of candidateColumns) {
    const value = normalizedRow[col];

    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }

  return undefined;
};



  // --- דיבאג: מציג expected/found גם RAW וגם normalized ---
  function logHeadersDebug(ctx: string, expectedRaw: string[], foundRaw: string[]) {
    if (!DEBUG_IMPORT) return;
    const expected = expectedRaw.map(normalizeHeader);
    const found    = foundRaw.map(normalizeHeader);
    const matched  = expected.filter(h => found.includes(h));
    const missing  = expected.filter(h => !found.includes(h));
    const coverage = expected.length ? (matched.length / expected.length) : 1;

  }

  // --- בדיקת כיסוי אחידה ל-XLSX/ZIP: מחזיר true/false ומדפיס דיבאג ---
  const checkCoverageOrShowMismatch = (
    expectedHeadersRaw: string[],
    foundHeadersRaw: string[],
    onMismatch: () => void,
    ctx: string = 'XLSX headers'
  ) => {
    logHeadersDebug(ctx, expectedHeadersRaw, foundHeadersRaw);
    const expected = expectedHeadersRaw.map(normalizeHeader);
    const found    = foundHeadersRaw.map(normalizeHeader);
    const intersectCount = expected.filter(h => found.includes(h)).length;
    const coverage = expected.length ? (intersectCount / expected.length) : 1;

    if (coverage < 0.5) {
      onMismatch();
      return false;
    }
    return true;
  };

  const readCsv = (buf: ArrayBuffer | Uint8Array): Record<string, any>[] => {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const text = pickBestDecoding(u8);

    const wb = XLSX.read(text, { type: 'string' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });

    if (!rows.length) return rows;

    // נרמול שמות עמודות בכל השורות
    return rows.map((row) => {
      const fixed: any = {};
      for (const [k, v] of Object.entries(row)) {
        fixed[normalizeHeader(k)] = v;
      }
      return fixed;
    });
  };

  const stripUndefined = <T extends Record<string, any>>(obj: T): T =>
    Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;

  const extractReportMonthFromFilename = (filename: string): string | undefined => {
    const nameWithoutExtension = filename.replace(/\.[^/.]+$/, '');
    const m = nameWithoutExtension.match(/(?:^|[^0-9])(\d{2})[_\-](\d{4})(?:[^0-9]|$)/);
    if (m) { const [, mm, yyyy] = m; return `${yyyy}-${mm}`; }
    return undefined;
  };

  const headersAtRow = (sheet: XLSX.WorkSheet, headerRowIndex: number): string[] => {
    const range = XLSX.utils.decode_range(sheet['!ref']!);
    const headers: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: headerRowIndex, c })];
      headers.push(cell?.v?.toString().trim() || '');
    }
    return headers;
  };

  const findHeaderRowIndex = (sheet: XLSX.WorkSheet, expectedHeaders: string[]): number => {
    const range = XLSX.utils.decode_range(sheet['!ref']!);
    for (let row = range.s.r; row <= range.e.r; row++) {
      const rowValues: string[] = [];
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
        rowValues.push(cell?.v?.toString().trim() || '');
      }
      const matches = expectedHeaders.filter(header => rowValues.includes(header));
      if (matches.length >= expectedHeaders.length * 0.5) return row;
    }
    return 0;
  };

  const toNum = (v: any): number => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    let s = v.toString().trim();
    let neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/[,\s]/g, '');
    const n = parseFloat(s);
    return (neg ? -1 : 1) * (isNaN(n) ? 0 : n);
  };

  const pick = (row: any, keys: string[]) => {
    for (const k of keys) if (k in row) return row[k];
    return undefined;
  };

  const commissionOverrides: Record<string, (row: any) => number> = {
    ayalon_insurance: (row) =>
      toNum(pick(row, ['סך עמלת סוכן'])) + toNum(pick(row, ['סך דמי גביה', 'סך דמי גבייה'])),

    menura_new_nifraim: (row) =>
      toNum(pick(row, ['סוכן-סכום עמלה', 'סוכן - סכום עמלה'])) +
      toNum(pick(row, ['סוכן-דמי גביה', 'סוכן - דמי גביה', 'סוכן-דמי גבייה', 'סוכן - דמי גבייה'])),
  };

  const chunk = <T,>(arr: T[], size: number) =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i + size));

  const normalizePolicyKey = (v: any) => String(v ?? '').trim().replace(/\s+/g, '');
  const toPadded9 = (v: any): string => {
    const digits = String(v ?? '').replace(/\D/g, '');
    return digits ? digits.padStart(9, '0').slice(-9) : '';
  };

  const normalizeProduct = (v: any): string => {
    const s = String(v ?? '').trim();
    return s.replace(/\s+/g, ' ').replace(/\u200f|\u200e/g, '');
  };

  const normalizeFullName = (first?: any, last?: any) =>
    [String(first ?? '').trim(), String(last ?? '').trim()]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .replace(/\u200f|\u200e/g, '');

  const parseVatRate = (v: any): number => {
    let n = toNum(v);
    if (n > 1) n = n / 100;
    if (!isFinite(n) || n < 0) n = 0;
    if (n > 1) n = 1;
    return n;
  };

  // ---- helpers: hebrew month → "01".."12" + safe cell getter ----
  const HEB_MONTHS: Record<string, string> = {
    // מלא
    'ינואר':'01','פברואר':'02','מרץ':'03','אפריל':'04','מאי':'05','יוני':'06',
    'יולי':'07','אוגוסט':'08','ספטמבר':'09','אוקטובר':'10','נובמבר':'11','דצמבר':'12',
    // קיצורים נפוצים
    'ינו':'01','פבר':'02','אפר':'04','יונ':'06','יול':'07','אוג':'08','ספט':'09','אוק':'10','נוב':'11','דצמ':'12'
  };

  const monthNameToMM = (name: any): string | '' => {
    const s = String(name ?? '').trim();
    if (!s) return '';
    const key = normalizeHeader(s);
    if (HEB_MONTHS[s]) return HEB_MONTHS[s];
    if (HEB_MONTHS[key]) return HEB_MONTHS[key];
    return '';
  };



  

const getRowsMissingCustomerId = (rows: any[]) => {
  return rows.filter((row) => {
    if (!row.lookupCustomerIdByPolicy) return false;
    return String(row.customerId || row.customerIdRaw || "").trim() === "";
  });
};

const buildMissingCustomerSummary = (rows: any[]) => {
  return rows.map((r) => ({
    sheet: r.sourceSheetName,
    policy: r.policyNumber,
    name: r.fullName,
    company: r.company,
  }));
};

  /* ==============================
     Effects
  ============================== */
  useEffect(() => { document.body.style.overflow = isLoading ? 'hidden' : ''; }, [isLoading]);
  useEffect(() => { setShowConfirmDelete(false); }, []);

  // שליפת תבניות פעילות בלבד
  useEffect(() => {
    const fetchTemplates = async () => {
      const qy = query(collection(db, 'commissionTemplates'), where('isactive', '==', true));
      const snapshot = await getDocs(qy);

      const templates: CommissionTemplateOption[] = [];
      const companyCache: Record<string, any> = {};
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const companyId = data.companyId;
        let companyName = '';
        let automationEnabled = false;
        let companyAutomationClass = '';
        let companyAutoDownloadEnabled = true;
        let companyAutoDownloadMessage = '';
        let allowEarlyDownload = false;

        if (companyId) {
         if (!companyCache[companyId]) {
          const companySnap = await getDoc(doc(db, 'company', companyId));
          companyCache[companyId] = companySnap.exists() ? companySnap.data() : {};
        }
       const companyInfo = companyCache[companyId];
        companyName = companyInfo.companyName || '';
        automationEnabled = !!companyInfo.automationEnabled;
        companyAutomationClass = companyInfo.automationClass || '';   
        companyAutoDownloadEnabled = companyInfo.autoDownloadEnabled !== false;
        companyAutoDownloadMessage = String(companyInfo.autoDownloadMessage || '').trim();   
        allowEarlyDownload = companyInfo.allowEarlyDownload === true;
        }
        templates.push({
          id: docSnap.id,
          companyName,
          companyId,
          automationEnabled,
          type: data.type || '',
          Name: data.Name || '',
          automationClass: data.automationClass || '',
          companyAutoClass: companyAutomationClass,
          companyAutoDownloadEnabled,
          companyAutoDownloadMessage,
          commissionIncludesVAT: !!data.commissionIncludesVAT,
           allowEarlyDownload,
        });
      }

      setTemplateOptions(templates);
      if (templates.every(t => t.id !== templateId)) {
        setTemplateId('');
        setMapping({});
      }
    };
    fetchTemplates();
  }, []);


const decodeFirestoreFieldKey = (s: string) =>
  String(s).replaceAll("__SLASH__", "/");

useEffect(() => {
  const fetchTemplateMapping = async () => {
    if (!templateId) {
      setMapping({});
      setFallbackProduct('');
      return;
    }

    const existsInActive = templateOptions.some(t => t.id === templateId);
    if (!existsInActive) {
      setMapping({});
      setFallbackProduct('');
      return;
    }

    const ref = doc(db, 'commissionTemplates', templateId);
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data();
      const rawFields = data.fields || {};

      const finalFields =
        templateId === 'meitav_insurance'
          ? Object.fromEntries(
              Object.entries(rawFields).map(([excelCol, systemField]) => [
                decodeFirestoreFieldKey(excelCol),
                systemField,
              ])
            )
          : rawFields;

      setMapping(finalFields);
      setFallbackProduct(String(data.fallbackProduct || '').trim());
    } else {
      setMapping({});
      setFallbackProduct('');
    }
  };

  fetchTemplateMapping();
}, [templateId, templateOptions]);


  /* ==============================
     Parsing helpers
  ============================== */
  const parseHebrewMonth = (value: any, templateId?: string): string => {
    if (!value) return '';

    const monthMap: Record<string, string> = {
      'ינו': '01','פבר': '02','מרץ': '03','אפר': '04','מאי': '05','יונ': '06',
      'יול': '07','אוג': '08','ספט': '09','אוק': '10','נוב': '11','דצמ': '12'
    };

    // if (typeof value === 'number') {
    //   const d = XLSX.SSF.parse_date_code(value);
    //   if (d) return `${d.y}-${String(d.m).padStart(2,'0')}`;
    // }
    if (typeof value === 'number') {
      const d = XLSX.SSF.parse_date_code(value);
      if (d) {
        // ✅ Migdal bugfix: 1/2/25,1/3/25... נשמר כ-Jan 2/3/4 ולכן החודש "יושב" ביום
        if ((templateId === 'migdal_life' || templateId === 'migdal_gemel' || templateId === 'fenix_insurance') && d.m === 1 && d.d >= 1 && d.d <= 12) {
          return `${d.y}-${String(d.d).padStart(2, '0')}`;
        }
        return `${d.y}-${String(d.m).padStart(2,'0')}`;
      }
    }
    
// console.log("DEBUG MONTH:", { templateId, value, type: typeof value, isDate: value instanceof Date });
   
const tempDate = new Date(value);
tempDate.setHours(tempDate.getHours() + 12);

    if (value instanceof Date) {
      const y = tempDate.getFullYear();
      const m = tempDate.getMonth() + 1;
      const d = tempDate.getDate();
    
      if ((templateId === 'migdal_life' || templateId === 'migdal_gemel' || templateId === 'fenix_insurance') && m === 1 && d >= 1 && d <= 12) {
        return `${y}-${String(d).padStart(2,'0')}`;
      }
      return `${y}-${String(m).padStart(2,'0')}`;
    }
    
    const str = value.toString().trim();

    {
      const m = str.match(
        /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/
      );
      if (m) {
        let [, dd, mm, yy] = m;
        const yyyy = yy.length === 2 ? (parseInt(yy,10) < 50 ? `20${yy}` : `19${yy}`) : yy;
        const monthNum = parseInt(mm, 10);
        if (monthNum >= 1 && monthNum <= 12) {
          return `${yyyy}-${mm.padStart(2,'0')}`;
        }
      }
    }

    if (templateId === 'menura_insurance' && /^\d{5}$/.test(str)) {
      const d = XLSX.SSF.parse_date_code(parseInt(str,10));
      if (d) return `${d.y}-${String(d.m).padStart(2,'0')}`;
    }

    {
      let match = str.match(/([\u0590-\u05FF]{3})[- ]?(\d{2})/);
      if (!match) match = str.match(/(\d{2})[- ]?([\u0590-\u05FF]{3})/);
      if (match) {
        const [, a, b] = match;
        const [hebMonth, yearSuffix] = monthMap[a] ? [a, b] : [b, a];
        const month = monthMap[hebMonth];
        const year  = `20${yearSuffix}`;
        if (month) return `${year}-${month}`;
      }
    }

    {
      const nums: string[] = str.match(/\d+/g) || [];
      const year = nums.find((n: string) => n.length === 4);
      if (year) {
        const monthCandidate = nums
          .filter((n: string) => n.length <= 2)
          .map((n: string) => parseInt(n, 10))
          .find((n: number) => n >= 1 && n <= 12);
        if (monthCandidate) {
          return `${year}-${String(monthCandidate).padStart(2, '0')}`;
        }
      }
    }

    return str.replace(/\//g, '-'); // fallback ישן
  };

  /* ==============================
     Firestore helpers
  ============================== */
  const checkExistingData = async (
    agentId: string,
    templateId: string,
    reportMonth: string,
    companyId: string
  ) => {
    const sanitized = String(reportMonth || '').replace(/\//g, '-');
  
    const qy = query(
      collection(db, 'externalCommissions'),
      where('agentId', '==', agentId),
      where('templateId', '==', templateId),
      where('reportMonth', '==', sanitized),
      where('companyId', '==', companyId)
    );
  
    const snapshot = await getDocs(qy);
  
    setExistingDocs(snapshot.docs);
  
    // ✅ חדש: חילוץ runId(ים) מהמסמכים שנמצאו
    const runIds = Array.from(
      new Set(
        snapshot.docs
          .map(d => String((d.data() as any)?.runId || '').trim())
          .filter(Boolean)
      )
    );
  
    setExistingRunIds(runIds);
  };
  
  // עזר: מחיקה בצ'אנקים (להימנע מ־500 בפעימה)
  async function deleteRefsInChunks(refs: any[]) {
    const CHUNK = 450;
    for (let i = 0; i < refs.length; i += CHUNK) {
      const batch = writeBatch(db);
      for (const ref of refs.slice(i, i + CHUNK)) batch.delete(ref);
      await batch.commit();
    }
  }


  const deleteByRunIdInChunks = async (collectionName: string, runId: string) => {
    const qy = query(collection(db, collectionName), where('runId', '==', runId));
    const snap = await getDocs(qy);
    if (snap.empty) return;
  
    const CHUNK = 450;
    for (let i = 0; i < snap.docs.length; i += CHUNK) {
      const batch = writeBatch(db);
      for (const d of snap.docs.slice(i, i + CHUNK)) batch.delete(d.ref);
      await batch.commit();
    }
  };
  


  const handleDeleteExisting = async () => {
    setShowConfirmDelete(false);
  
    if (!existingRunIds.length) {
      addToast("error", "לא נמצאה טעינה קודמת למחיקה");
      return;
    }
  
    setIsLoading(true);
    const runsToDelete = [...existingRunIds]; // שומרים לפני שננקה state
  
    try {
      for (const runId of runsToDelete) {
        await deleteByRunIdInChunks('externalCommissions', runId);
        await deleteByRunIdInChunks('commissionSummaries', runId);
        await deleteByRunIdInChunks('policyCommissionSummaries', runId);
  
        // מחיקת רשומת הריצה
        await deleteDoc(doc(db, 'commissionImportRuns', runId));
      }
  
      // ניקוי מצב UI
      setExistingRunIds([]);
      setMonthsInFile([]); // אם הוספת
      setStandardizedRows([]);
      setSelectedFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
  
      addToast("success", "נמחקה טעינה קודמת בהצלחה");
    } catch (err) {
      addToast("error", "שגיאה במחיקת הטעינה");
    } finally {
      setIsLoading(false);
    }
  };
   
  /* ==============================
     UI actions
  ============================== */
  const handleClearSelections = () => {
    setSelectedFileName('');
    setStandardizedRows([]);
    setTemplateId('');
    setExistingDocs([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    window.location.reload();
  };



const standardizeRowWithMapping = (
  row: any,
  mapping: Record<string, string>,
  base: any,
  fallbackReportMonth?: string,
  options?: { isMultiSheet?: boolean }
) => {
  const result: any = { ...base };

  const systemFields = Array.from(
    new Set(Object.values(mapping).map((x) => String(x).trim()).filter(Boolean))
  );

  for (const systemField of systemFields) {
    const value = getValueBySystemField(row, mapping, systemField);

    if (systemField === "validMonth" || systemField === "reportMonth") {
      let parsed = parseHebrewMonth(value, base.templateId);
      if (!parsed && systemField === "reportMonth" && fallbackReportMonth) {
        parsed = fallbackReportMonth;
      }
      result[systemField] = parsed || value;

    } else if (systemField === "commissionAmount") {
      let commission = 0;

      if (options?.isMultiSheet) {
        commission = toNum(value);
      } else {
        const override = commissionOverrides[base.templateId];
        commission = override ? override(row) : toNum(value);
      }

      if (selectedTemplate?.commissionIncludesVAT) {
        commission = commission / (1 + VAT_DEFAULT);
      }

      result[systemField] = roundTo2(commission);

    } else if (systemField === "premium") {
      if (base.templateId === "fenix_insurance") {
        const sector = String(getValueBySystemField(row, mapping, "product") ?? "").trim();
        const accRaw = getValueBySystemField(row, mapping, "premium");
        const premRaw = getValueBySystemField(row, mapping, "premium");

        result.premium = toNum(
          sector === "פיננסים וזמן פרישה"
            ? (accRaw ?? premRaw)
            : premRaw
        );
      } else {
        result.premium = toNum(value);
      }

    } else if (systemField === "product") {
      const p = normalizeProduct(value);
      if (p !== undefined) result.product = p;

    } else if (systemField === "customerId" || systemField === "IDCustomer") {
      const raw = String(value ?? "").trim();
      const padded9 = toPadded9(value);
      result.customerIdRaw = raw;
      result.customerId = padded9;

    } else if (systemField === "policyNumber") {
      result[systemField] = String(value ?? "").trim();

    } else {
      result[systemField] = value;
    }
  }

  if (base.templateId === "mor_insurance") {
    if (result.fullName) {
      result.fullName = normalizeFullName(result.fullName, "");
    } else {
      const first = row["שם פרטי"];
      const last = row["שם משפחה"];
      const full = normalizeFullName(first, last);
      if (full) result.fullName = full;
    }
  } else if (base.templateId === "clal_pensia") {
    if (result.fullName) {
      result.fullName = normalizeFullName(result.fullName, "");
    } else {
      const first = row["שם פרטי עמית"];
      const last = row["שם משפחה עמית"];
      const full = normalizeFullName(first, last);
      if (full) result.fullName = full;
    }
  }

  if (base.templateId === "clal_pensia" && !result.policyNumber && result.customerId) {
    result.policyNumber = String(result.customerId).trim();
  }

  if (base.templateId === "altshuler_insurance") {
    const rawMonth = getCell(row, "חודש");
    const rawYear = getCell(row, "שנה");

    const mm = monthNameToMM(rawMonth);
    let yyyy = String(rawYear ?? "").trim();

    if (/^\d{2}$/.test(yyyy)) {
      const yy = parseInt(yyyy, 10);
      yyyy = yy < 50 ? `20${yy}` : `19${yy}`;
    }

    if (mm && /^\d{4}$/.test(yyyy)) {
      result.reportMonth = `${yyyy}-${mm}`;
    }
  }

  if ("agentCode" in result && result.agentCode === undefined) {
}

  return result;
};

  async function checkExistingByRuns(params: {
  agentId: string;
  companyId: string;
  templateId: string;
  monthsInFile: string[];
}) {
  const { agentId, companyId, templateId, monthsInFile } = params;

  // לוג פתיחה
  // console.log('[checkExistingByRuns] params:', { agentId, companyId, templateId, monthsInFile });

  // אם אין בכלל חודשים בקובץ – לא מחפשים קונפליקטים
  const fileMonthsClean = monthsInFile.map(sanitizeMonth).filter(Boolean);
  const fileSet = new Set(fileMonthsClean);

  if (fileSet.size === 0) {
    // console.log('[checkExistingByRuns] no months in file -> no conflict');
    setExistingRunIds([]);
    return;
  }

  const runsSnap = await getDocs(
    query(
      collection(db, 'commissionImportRuns'),
      where('agentId', '==', agentId),
      where('companyId', '==', companyId),
      where('templateId', '==', templateId),
    )
  );

  // console.log('[checkExistingByRuns] runsSnap.size:', runsSnap.size);

  const conflictingRuns = runsSnap.docs
    .map((d) => {
      const data: any = d.data();

      // ✅ מקור אמת ל־runId: תמיד נעדיף data.runId ואם אין אז docId
      const runId = String(data.runId || d.id);

      // ✅ חודשים של הריצה: קודם reportMonths, אחרת reportMonth
      const runMonths: string[] = Array.isArray(data.reportMonths) && data.reportMonths.length
        ? data.reportMonths.map(sanitizeMonth).filter(Boolean)
        : data.reportMonth
          ? [sanitizeMonth(data.reportMonth)].filter(Boolean)
          : [];

      // Intersection מול חודשי הקובץ
      const intersect = runMonths.filter((m) => fileSet.has(m));



      return {
        docId: d.id,
        runId,
        runMonths,
        intersect,
      };
    })
    .filter((r) => r.intersect.length > 0);

  const runIds = Array.from(new Set(conflictingRuns.map((r) => r.runId).filter(Boolean)));



  setExistingRunIds(runIds);
}



const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];

  if (!file || !selectedAgentId) return;

  if (importMode === "single" && !selectedCompanyId) return;
  if (importMode === "single" && !templateId) return;

  if (importMode === "multi_sheet" && !selectedMultiSheetProfile) {
    setErrorDialog({
      title: "חסר פרופיל",
      message: "יש לבחור פרופיל טעינה מרובה לשוניות לפני העלאת הקובץ.",
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
    return;
  }

  if (
    importMode === "multi_sheet" &&
    selectedMultiSheetProfile?.enableReportMonthFilter &&
    !selectedTargetReportMonth
  ) {
    setErrorDialog({
      title: "חסר חודש דיווח",
      message: "יש לבחור שנה וחודש לפני העלאת קובץ עבור פרופיל זה.",
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
    return;
  }

  const ext = getExt(file.name);
  const allowed = new Set([".xlsx", ".xls", ".csv", ".zip"]);

  if (!allowed.has(ext)) {
    setErrorDialog({
      title: "סוג קובץ לא נתמך",
      message: (
        <>
          הקובץ <b>{file.name}</b> הוא {ext}. נא להעלות רק קבצי ZIP/XLSX/XLS/CSV.
        </>
      ),
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
    return;
  }

  if (importMode === "multi_sheet" && ![".xlsx", ".xls"].includes(ext)) {
    setErrorDialog({
      title: "סוג קובץ לא נתמך",
      message: "טעינת קובץ מרובה לשוניות נתמכת רק עבור Excel (.xlsx / .xls).",
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
    return;
  }

  setSelectedFileName(file.name);
  setStandardizedRows([]);
  setMultiSheetPreview(null);
  setExistingRunIds([]);
  setMonthsInFile([]);
  setConflictingRunIds([]);

  setIsLoading(true);
  setLoadingStage("קורא קובץ מהמחשב...");

  const reader = new FileReader();

  reader.onload = async (evt) => {
    try {
      const arrayBuffer = evt.target?.result as ArrayBuffer;

      // =========================
      // MULTI SHEET MODE
      // =========================
      if (importMode === "multi_sheet") {
        setLoadingStage("פותח חוברת עבודה מרובת לשוניות...");

        const wb = XLSX.read(arrayBuffer, { type: "array", cellDates: true });

        const result = await parseMultiSheetWorkbook({
          db,
          workbook: wb,
          profile: selectedMultiSheetProfile!,
          selectedAgentId,
          selectedCompanyId,
          selectedCompanyName,
          standardizeSheetRows,
          selectedTargetReportMonth,
        });

      const doneSheets = result.matchedSheets.filter((x) => x.status === "done");

if (doneSheets.length === 0 || result.rows.length === 0) {
  setStandardizedRows([]);
  setMultiSheetPreview({
    matchedSheets: result.matchedSheets,
    unmatchedSheets: result.unmatchedSheets,
    ignoredSheets: result.ignoredSheets,
  });
  setErrorDialog({
    title: "לא זוהו לשוניות לטעינה",
    message: (
      <div className="text-right">
        <p>לא נמצאה אף לשונית עם התאמה תקינה לפרופיל שנבחר.</p>
        {result.unmatchedSheets.length > 0 && (
          <p className="mt-2 text-sm text-gray-500">
            לשוניות ללא התאמה: {result.unmatchedSheets.join(", ")}
          </p>
        )}
      </div>
    ),
  });
  return;
}

console.log("[filter meitav] selectedTargetReportMonth:", selectedTargetReportMonth);
console.log("[filter meitav] unique reportMonths in rows:", 
  [...new Set(result.rows
    .filter(r => r.sourceSheetName?.includes("מיטב"))
    .map(r => JSON.stringify({
      reportMonth: r.reportMonth,
      reportMonthOriginal: r.reportMonthOriginal,
      offset: r._sheetReportMonthOffset
    }))
  )].slice(0, 5)
);
const filteredRows =
  selectedMultiSheetProfile?.enableReportMonthFilter && selectedTargetReportMonth
    ? result.rows.filter((row) => {
        const offset = row._sheetReportMonthOffset ?? 0;
        const expectedOriginal = applyMonthOffset(selectedTargetReportMonth, offset);
        return sanitizeMonth(row.reportMonthOriginal ?? row.reportMonth) === sanitizeMonth(expectedOriginal);
      })
    : result.rows;

// חישוב כמה שורות נשארו אחרי הסינון לכל לשונית
const filteredCountBySheet = new Map<string, number>();

for (const row of filteredRows) {
  const sheetName = String(row.sourceSheetName || "").trim();
  if (!sheetName) continue;

  filteredCountBySheet.set(
    sheetName,
    (filteredCountBySheet.get(sheetName) || 0) + 1
  );
}

const matchedSheetsWithFilteredCount = result.matchedSheets.map((sheet) => ({
  ...sheet,
  filteredRowsCount:
    sheet.status === "done"
      ? filteredCountBySheet.get(String(sheet.sheetName || "").trim()) || 0
      : 0,
}));

setMultiSheetPreview({
  matchedSheets: matchedSheetsWithFilteredCount,
  unmatchedSheets: result.unmatchedSheets,
  ignoredSheets: result.ignoredSheets,
});

if (filteredRows.length === 0) {
  setStandardizedRows([]);
  setErrorDialog({
    title: "לא נמצאו נתונים לחודש המבוקש",
    message: (
      <div className="text-right">
        <p>
          הקובץ נקלט, אך לא נמצאו שורות עבור חודש הדיווח{" "}
          {selectedTargetReportMonth}.
        </p>
      </div>
    ),
  });
  return;
}

setStandardizedRows(filteredRows);
console.log("[filter meitav debug]", JSON.stringify({
  expectedOriginal: applyMonthOffset(selectedTargetReportMonth, -1),
  firstRowOriginal: result.rows.find(r => r.sourceSheetName?.includes("מיטב"))?.reportMonthOriginal,
  firstRowMonth: result.rows.find(r => r.sourceSheetName?.includes("מיטב"))?.reportMonth,
  sanitizedExpected: sanitizeMonth(applyMonthOffset(selectedTargetReportMonth, -1)),
  sanitizedActual: sanitizeMonth(result.rows.find(r => r.sourceSheetName?.includes("מיטב"))?.reportMonthOriginal),
}));

const fileMonths = Array.from(
  new Set(filteredRows.map((r) => sanitizeMonth(r.reportMonth)).filter(Boolean))
).sort();

setMonthsInFile(fileMonths);

await checkExistingByRunsMultiTemplate({
  agentId: selectedAgentId,
  profileId: selectedMultiSheetProfileId,
  selectedReportMonth: selectedTargetReportMonth,
  rows: filteredRows,
});

setLoadingStage("הושלם!");
return;      }

      // =========================
      // SINGLE TEMPLATE MODE
      // =========================
      const fallbackReportMonth =
        templateId === "mor_insurance"
          ? extractReportMonthFromFilename(file.name)
          : undefined;

      if (ext === ".zip") {
        setLoadingStage("פותח ארכיון ZIP...");
        const mod = await import("jszip");
        const JSZip: any = (mod as any).default ?? mod;
        const zip = await JSZip.loadAsync(arrayBuffer);

        const entries = zip.file(/\.xlsx$|\.xls$|\.csv$/i);
        if (entries.length === 0) throw new Error("ה-ZIP לא מכיל XLSX/XLS/CSV.");

        if (entries.length > 1) {
          const names = entries.map((f: any) => f.name);
          setZipChooser({ zip, entryNames: names, outerFileName: file.name });
          setSelectedZipEntry(names[0]);
          setIsLoading(false);
          setLoadingStage("");
          return;
        }

        const entry = entries[0];
        setLoadingStage(`מחלץ את ${entry.name}...`);
        const innerData = /\.csv$/i.test(entry.name)
          ? await entry.async("uint8array")
          : await entry.async("arraybuffer");

        await parseAndStandardize(innerData, entry.name, fallbackReportMonth);
      } else {
        await parseAndStandardize(arrayBuffer, file.name, fallbackReportMonth);
      }
    } catch (err: any) {
      // console.error("handleFileUpload error:", err);
      setErrorDialog({
        title: "שגיאת עיבוד קובץ",
        message: (
          <div className="text-right">
            <div>
              אירעה שגיאה בעת עיבוד הקובץ <b>{file.name}</b>.
            </div>
            <div className="mt-2 text-xs text-red-600">
              {String(err?.message || err || "Unknown error")}
            </div>
          </div>
        ),
      });
    } finally {
      setIsLoading(false);
      setLoadingStage("");
    }
  };

  reader.readAsArrayBuffer(file);
};



const parseAndStandardize = async (data: any, fileName: string, fallbackMonth?: string) => {
  let jsonData: any[] = [];
  const innerExt = getExt(fileName);
  const upperName = fileName.toUpperCase();

  // 1. שלב ה-Parsing
  setLoadingStage(`מפענח נתונים מתוך ${fileName}...`);
  await new Promise(r => setTimeout(r, 100));

  if (innerExt === '.csv') {
    jsonData = readCsv(data);
  } else {
    let wb: XLSX.WorkBook;
    try {
      wb = XLSX.read(data, { type: 'array', cellDates: true });
    } catch (err) {
      setIsLoading(false);
      throw new Error('קובץ אקסל לא תקין.');
    }

    let wsname = wb.SheetNames[0];
    let headerRowIndex = 0;

    // --- לוגיקה ישנה (לא נוגעים לפי בקשתך) ---
    if (templateId === 'menura_insurance') {
      const foundSheet = wb.SheetNames.find(name => name.includes('דוח עמלות'));
      if (foundSheet) { wsname = foundSheet; headerRowIndex = 29; }
    }
    // ---------------------------------------

    const ws = wb.Sheets[wsname];
    
    // חיפוש כותרות אוטומטי (רק אם זו לא התבנית הישנה של מנורה)
    if (templateId !== 'menura_insurance') {
      headerRowIndex = findHeaderRowIndex(ws, Object.keys(mapping));
    }

    jsonData = XLSX.utils.sheet_to_json(ws, { defval: "", range: headerRowIndex, raw: true });
  }
  // 2. בדיקת שלמות בסיסית
  if (!jsonData || jsonData.length === 0) {
    setIsLoading(false);
    addToast("error", "הקובץ ריק או שלא זוהו בו שורות נתונים.");
    return;
  }

// ==========================================
  // 🛡️ שלב 2.5: "הגנת מנורה" דו-צדדית (מבוסס ID 3)
  // ==========================================
  const isMenora = String(selectedCompanyId) === '3';
  
  if (isMenora) {
    const isZviraFile = upperName.includes('ZVIRA');
    const isNifraimFile = upperName.includes('NIFRAIM');
    
    // בדיקה מה שם התבנית שלך (נפרעים או צבירה)
    // הערה: ודאי שה-ID של תבניות הצבירה שלך מכיל את המילה 'zvira' או 'acc'
    const isNifraimTemplate = templateId.includes('nifraim');
    const isZviraTemplate = templateId.includes('zvira') || templateId.includes('acc');

    // מקרה א': תבנית נפרעים + קובץ צבירה
    if (isNifraimTemplate && isZviraFile) {
      setIsLoading(false);
      setLoadingStage("");
      setErrorDialog({
        title: "קובץ לא מתאים (מנורה)",
        message: "בחרת תבנית נפרעים, אך הקובץ הוא דוח צבירה (ZVIRA). אנא בחר קובץ NIFRAIM."
      });
      return;
    }

    // מקרה ב': תבנית צבירה + קובץ נפרעים
    if (isZviraTemplate && isNifraimFile) {
      setIsLoading(false);
      setLoadingStage("");
      setErrorDialog({
        title: "קובץ לא מתאים (מנורה)",
        message: "בחרת תבנית צבירה, אך הקובץ הוא דוח נפרעים (NIFRAIM). אנא בחר קובץ ZVIRA."
      });
      return;
    }
  }
  // ==========================================
  // ==========================================

  // 3. בדיקת התאמת עמודות (Coverage)
  const expectedHeadersRaw = Object.keys(mapping);
  const foundHeadersRaw = Object.keys(jsonData[0] || {});

  const ok = checkCoverageOrShowMismatch(
    expectedHeadersRaw,
    foundHeadersRaw,
    () => { 
      setIsLoading(false);
      setLoadingStage("");
      setTimeout(() => setShowTemplateMismatch(true), 100);
    },
    'Validation'
  );

  if (!ok) return;

  // 4. שלב הנירמול
  setLoadingStage(`מנרמל וממפה ${jsonData.length.toLocaleString()} שורות...`);
  await new Promise(r => setTimeout(r, 100));

  const standardized = jsonData
    .filter((row) => {
      const agentCodeColumn = Object.entries(mapping).find(([, field]) => field === 'agentCode')?.[0];
      const agentCodeVal = agentCodeColumn ? getCell(row, agentCodeColumn) : null;
      return agentCodeVal && agentCodeVal.toString().trim() !== '';
    })
    .map(row => standardizeRowWithMapping(row, mapping, {
      agentId: selectedAgentId,
      templateId,
      sourceFileName: fileName,
      uploadDate: serverTimestamp(),
      companyId: selectedCompanyId,
      company: selectedCompanyName, // ודאי שה-useMemo למטה מוגדר!
    },
  fallbackMonth,
  { isMultiSheet: false }
));

  if (standardized.length === 0) {
    setIsLoading(false);
    setErrorDialog({ title: "שגיאת נתונים", message: "לא נמצאו שורות תקינות לעיבוד." });
    return;
  }

  setStandardizedRows(standardized);

  // 5. בדיקת כפילויות
  setLoadingStage("בודק טעינות קיימות...");
  const fileMonths = Array.from(new Set(standardized.map(r => sanitizeMonth(r.reportMonth)).filter(Boolean))).sort();
  setMonthsInFile(fileMonths);

  await checkExistingByRuns({
    agentId: selectedAgentId,
    companyId: selectedCompanyId,
    templateId,
    monthsInFile: fileMonths,
  });

  setLoadingStage("הושלם!");
  setTimeout(() => {
    setIsLoading(false);
    setLoadingStage("");
  }, 500);
};

const processChosenZipEntry = async () => {
    if (!zipChooser || !selectedZipEntry) {
      setZipChooser(null);
      return;
    }

    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    setIsLoading(true);
    setLoadingStage("מחלץ קובץ נבחר מה-ZIP...");

    try {
      const { zip } = zipChooser;
      
      // איתור הקובץ בתוך הארכיון
      let entry: any = zip.file(selectedZipEntry);
      if (Array.isArray(entry)) entry = entry[0];

      if (!entry) {
        const alt = zip.file(new RegExp(`${escapeRegExp(selectedZipEntry)}$`));
        entry = Array.isArray(alt) ? alt[0] : alt;
      }

      if (!entry || entry.dir) {
        throw new Error('הקובץ שנבחר לא נמצא (או שהוא תיקייה) בתוך ה-ZIP.');
      }

      // חילוץ הנתונים (Buffer)
      const innerExt = getExt(selectedZipEntry);
      const data = innerExt === '.csv' 
        ? await entry.async('uint8array') 
        : await entry.async('arraybuffer');

      // חישוב חודש Fallback במידה ומדובר במור
      const fallbackReportMonth = 
        templateId === 'mor_insurance' ? extractReportMonthFromFilename(selectedZipEntry) : undefined;

      // שליחה לפונקציית העיבוד המאוחדת שמבצעת: 
      // Parsing -> Validation -> Standardization -> Conflict Check
      await parseAndStandardize(data, selectedZipEntry, fallbackReportMonth);

    } catch (e: any) {
      setErrorDialog({ 
        title: 'שגיאת עיבוד קובץ', 
        message: String(e?.message || 'אירעה שגיאה בעת פתיחת הקובץ מתוך ה-ZIP') 
      });
    } finally {
      // ניקוי מצב הבחירה וסגירת המודאל
      setZipChooser(null);
      setSelectedZipEntry('');
      setIsLoading(false);
      setLoadingStage("");
    }
  };
  
  /* ==============================
     Write helpers
  ============================== */
  async function writeExternalRowsInChunks(rows: any[]) {
    const CHUNK = 450;
    const total = rows.length;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const r of slice) {
        const ref = doc(collection(db, 'externalCommissions'));
        batch.set(ref, r);
      }
      await batch.commit();
      const percent = Math.floor((i / total) * 70); 
    setImportProgress(percent);
    setLoadingStage(`שומר נתונים... ${percent}%`);
    }
  }

  async function writeSummariesInBatch(summaries: CommissionSummary[]) {
    const CHUNK = 450;
    for (let i = 0; i < summaries.length; i += CHUNK) {
      const slice = summaries.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const s of slice) {
        const sanitized = (s.reportMonth ?? '').toString().replace(/\//g, '-');
        const id = `${s.agentId}_${s.agentCode}_${sanitized}_${s.templateId}_${s.companyId}`;
        batch.set(doc(db, 'commissionSummaries', id), { ...s, updatedAt: serverTimestamp() });
      }
      await batch.commit();
    }
  }

  async function writePolicySummariesInBatch(summaries: PolicyCommissionSummary[]) {
    const CHUNK = 450;
    const total = summaries.length;
    for (let i = 0; i < summaries.length; i += CHUNK) {
      const slice = summaries.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const s of slice) {
        const sanitized = String(s.reportMonth ?? '').replace(/\//g, '-');
        const id = `${s.agentId}_${s.agentCode}_${sanitized}_${s.companyId}_${s.policyNumberKey}_${s.customerId}_${s.templateId}`;
        batch.set(
          doc(db, 'policyCommissionSummaries', id),
          stripUndefined({ ...s, updatedAt: serverTimestamp() })
        );
      }
      await batch.commit();
      const currentPercent = Math.floor(70 + (i / total) * 30);
    setImportProgress(currentPercent);
    setLoadingStage(`יוצר סיכומי פוליסות... ${currentPercent}%`);
    }
    setImportProgress(100);
  }

  /* ==============================
     Import button
  ============================== */


const handleImport = async () => {
  if (!selectedAgentId || standardizedRows.length === 0) return;

  if (importMode === "single" && !selectedCompanyId) return;
  if (importMode === "multi_sheet" && !selectedMultiSheetProfileId) return;

  if (
    importMode === "multi_sheet" &&
    selectedMultiSheetProfile?.enableReportMonthFilter &&
    !selectedTargetReportMonth
  ) {
    setErrorDialog({
      title: "חסר חודש דיווח",
      message: "יש לבחור שנה וחודש לפני אישור הטעינה עבור פרופיל זה.",
    });
    return;
  }

  standardizedRows.forEach((row) => {
    row.reportMonth = parseHebrewMonth(row.reportMonth, row.templateId);
    row.validMonth = parseHebrewMonth(row.validMonth, row.templateId);
  });

  setIsLoading(true);
  setImportProgress(0);
  setLoadingStage("מתחיל טעינה...");

  if (existingRunIds.length > 0) {
    addToast("success", "נמצאה טעינה קודמת לחודשים אלו. הטעינה החדשה תתווסף ותחושב מחדש.");
  }

  try {
    const runRef = doc(collection(db, "commissionImportRuns"));
    const runId = runRef.id;

    const uniqueAgentCodes = new Set<string>();
    for (const row of standardizedRows) {
      if (row.agentCode) uniqueAgentCodes.add(String(row.agentCode).trim());
    }

    const userRef = doc(db, "users", selectedAgentId);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      const existingCodes: string[] = userSnap.data().agentCodes || [];
      const codesToAdd = Array.from(uniqueAgentCodes).filter(
        (c) => !existingCodes.includes(c)
      );
      if (codesToAdd.length > 0) {
        await updateDoc(userRef, { agentCodes: arrayUnion(...codesToAdd) });
      }
    }

    const rowsWithPolicyKey = standardizedRows.map((r) => ({
      ...r,
      policyNumberKey: String(r.policyNumber ?? "").trim().replace(/\s+/g, ""),
    }));

// סינון לפי agentPortalFilters (רק במצב single)
let rowsAfterFilter = rowsWithPolicyKey;

if (importMode === "single" && selectedCompanyId) {
  const filterSnap = await getDoc(doc(db, "agentPortalFilters", `${selectedAgentId}_${selectedCompanyId}`));
  if (filterSnap.exists()) {
    const allowedCodes: string[] = (filterSnap.data()?.agentCodes || [])
      .map((c: any) => String(c).trim())
      .filter(Boolean);
    if (allowedCodes.length > 0) {
      rowsAfterFilter = rowsWithPolicyKey.filter((r) =>
        allowedCodes.includes(String(r.agentCode ?? "").trim())
      );
    }
  }
}

 const enrichedRows =
      importMode === "multi_sheet"
        ? await enrichMissingCustomerIdsForMarkedSheets({
            rows: rowsAfterFilter,
            agentId: selectedAgentId,
          })
        : rowsAfterFilter;

const rowsMissingCustomerId = getRowsMissingCustomerId(enrichedRows);

if (rowsMissingCustomerId.length > 0) {
  const summary = buildMissingCustomerSummary(rowsMissingCustomerId);

  const confirmContinue = window.confirm(
    `יש ${rowsMissingCustomerId.length} שורות ללא ת"ז.\n\n` +
    `לדוגמה:\n` +
    summary
      .slice(0, 5)
      .map((r) => `${r.sheet} | ${r.policy} | ${r.name}`)
      .join("\n") +
    `\n\nהאם להמשיך בטעינה ללא שורות אלו?`
  );

  if (!confirmContinue) {
    setIsLoading(false);
    setLoadingStage("");
    return;
  }
}

    const finalRowsForImport =
      importMode === "multi_sheet"
        ? enrichedRows.filter((row) => {
            if (!row.lookupCustomerIdByPolicy) return true;
            return String(row.customerId || row.customerIdRaw || "").trim() !== "";
          })
        : enrichedRows;

    if (!finalRowsForImport.length) {
      setErrorDialog({
        title: "לא נותרו שורות לטעינה",
        message: "לא נותרו שורות תקינות לטעינה לאחר השלמת תעודות זהות וסינון.",
      });
      return;
    }

const rowsPrepared = finalRowsForImport.map((r) =>
  stripUndefined({
    ...r,
    customerId: toPadded9(r.customerId ?? r.customerIdRaw ?? ""),
    runId,
  })
);

    setLoadingStage("שומר שורות מקור...");
    await writeExternalRowsInChunks(rowsPrepared);

    setImportProgress(75);
    setLoadingStage("מחשב סיכומים מחדש...");

    const { commissionSummariesCount, policySummariesCount } =
      await recomputeSummariesFromExternalManual({
        db,
        rowsPrepared,
        runId,
      });

    const totalRows = rowsPrepared.length;

    const reportMonths = Array.from(
      new Set(rowsPrepared.map((r) => sanitizeMonth(r.reportMonth)).filter(Boolean))
    ).sort();

    const minReportMonth = reportMonths[0] || "";
    const maxReportMonth =
      reportMonths.length > 0 ? reportMonths[reportMonths.length - 1] : "";

    setImportProgress(95);
    setLoadingStage("שומר רשומת טעינה...");

    await setDoc(runRef, {
      runId,
      createdAt: serverTimestamp(),
      agentId: selectedAgentId,
      agentName: agents.find((a) => a.id === selectedAgentId)?.name || "",
      createdBy: detail?.email || detail?.name || "",
      createdByUserId: user?.uid || "",

      companyId:
        importMode === "multi_sheet"
          ? "__multi_sheet_bundle__"
          : selectedCompanyId,

      company:
        importMode === "multi_sheet"
          ? "Multi Sheet Bundle"
          : selectedCompanyName,

      templateId:
        importMode === "multi_sheet"
          ? "__multi_sheet_bundle__"
          : templateId,

      templateName:
        importMode === "multi_sheet"
          ? selectedMultiSheetProfile?.name || "Multi Sheet Bundle"
          : selectedTemplate?.Name || selectedTemplate?.type || "",

      sourceType:
        importMode === "multi_sheet"
          ? "multi_sheet_bundle"
          : "single_template",

      multiSheetProfileId:
        importMode === "multi_sheet"
          ? selectedMultiSheetProfile?.id || ""
          : "",

      multiSheetProfileName:
        importMode === "multi_sheet"
          ? selectedMultiSheetProfile?.name || ""
          : "",

      matchedSheets:
        importMode === "multi_sheet"
          ? multiSheetPreview?.matchedSheets || []
          : [],

      unmatchedSheets:
        importMode === "multi_sheet"
          ? multiSheetPreview?.unmatchedSheets || []
          : [],

      ignoredSheets:
        importMode === "multi_sheet"
          ? multiSheetPreview?.ignoredSheets || []
          : [],

      usedReportMonthFilter:
        importMode === "multi_sheet"
          ? !!selectedMultiSheetProfile?.enableReportMonthFilter
          : false,

      selectedReportMonth:
        importMode === "multi_sheet" && selectedMultiSheetProfile?.enableReportMonthFilter
          ? selectedTargetReportMonth
          : "",

      reportMonths,
      minReportMonth,
      maxReportMonth,
      reportMonthsCount: reportMonths.length,
      reportMonth: minReportMonth,

      externalCount: totalRows,
      commissionSummariesCount,
      policySummariesCount,
    });

    addToast("success", "✅ הטעינה הושלמה בהצלחה");

    const grouped: Record<
      string,
      {
        count: number;
        uniqueCustomers: Set<string>;
        totalCommission: number;
        totalPremium: number;
      }
    > = {};

    for (const row of rowsPrepared) {
      const code = String(row.agentCode ?? "").trim();
      if (!code) continue;

      if (!grouped[code]) {
        grouped[code] = {
          count: 0,
          uniqueCustomers: new Set(),
          totalCommission: 0,
          totalPremium: 0,
        };
      }

      grouped[code].count += 1;
      if (row.customerId) grouped[code].uniqueCustomers.add(row.customerId);
      grouped[code].totalCommission += Number(row.commissionAmount ?? 0) || 0;
      grouped[code].totalPremium += Number(row.premium ?? 0) || 0;
    }

    const summaryArray = Object.entries(grouped).map(([agentCode, data]) => ({
      agentCode,
      count: data.count,
      totalInsured: data.uniqueCustomers.size,
      totalCommission: data.totalCommission,
      totalPremium: data.totalPremium,
    }));

    setSummaryByAgentCode(summaryArray);
    setShowSummaryDialog(true);

    setImportProgress(100);
    setLoadingStage("הושלם!");

    setStandardizedRows([]);
    setSelectedFileName("");
    setExistingDocs([]);
    setExistingRunIds([]);
    setMonthsInFile([]);
    setConflictingRunIds([]);
    setMultiSheetPreview(null);

    if (importMode === "multi_sheet") {
      setSelectedReportYear("");
      setSelectedReportMonth("");
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  } catch (error) {
    // console.error("handleImport error:", error);
    addToast("error", "שגיאה בעת טעינה למסד. בדוק קונסול.");
  } finally {
    setIsLoading(false);
    setLoadingStage("");
    setImportProgress(0);
  }
};

function pickBestDecoding(u8: Uint8Array) {
    const utf8 = new TextDecoder('utf-8').decode(u8);
    const win  = new TextDecoder('windows-1255').decode(u8);

    const score = (t: string) => {
      const heb = (t.match(/[\u0590-\u05FF]/g) || []).length;
      const mojibakePenalty = (t.match(/ן»¿| /g) || []).length * 50;
      const weirdQuotes = (t.match(/[׳״´`]/g) || []).length * 2;
      return heb - mojibakePenalty - weirdQuotes;
    };

    return score(utf8) >= score(win) ? utf8 : win;
  }


// 1. טעינת הגרסה הכי חדשה מהשרת
useEffect(() => {
  const fetchRunnerConfig = async () => {
    const snap = await getDoc(doc(db, "portalRunnerConfig", "global"));
    if (!snap.exists()) return;

    const data: any = snap.data() || {};
    setLatestRunnerVersion(String(data.latestVersion || "").trim());
    setInstallerUrl(String(data.installerUrl || "").trim());
  };

  fetchRunnerConfig();
}, []);


// 2. זיהוי הגרסה הנוכחית של הסוכן (לפי הריצה האחרונה שלו)

// 2. זיהוי הגרסה הנוכחית - שאילתה חכמה
useEffect(() => {
  if (!selectedAgentId) {
    setCurrentRunnerVersion("");
    return;
  }

  let prevVersion = "";

//   const unsub = onSnapshot(
//     doc(db, "portalRunnerStatus", selectedAgentId),
//     (snap) => {
//       if (snap.exists()) {
//         const newVersion = String(snap.data()?.runnerVersion || "").trim();
        
//         // אם הגרסה השתנה ויש גרסה קודמת → עדכון הסתיים
//         if (prevVersion && newVersion && prevVersion !== newVersion) {
//           addToast("success", `✅ הבוט עודכן בהצלחה לגרסה ${newVersion}`);
//           setTimeout(() => window.location.reload(), 2000);
//         }

//         prevVersion = newVersion;
//         setCurrentRunnerVersion(newVersion);
//       } else {
//         setCurrentRunnerVersion("");
//       }
//     },
//     () => setCurrentRunnerVersion("")
//   );
//   return () => unsub();
// }, [selectedAgentId]);


const unsub = onSnapshot(
    doc(db, "portalRunnerStatus", selectedAgentId),
    (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const newVersion = String(data?.runnerVersion || "").trim();
        
        // בדיקת online לפי lastSeenAt
        const lastSeenAt = data?.lastSeenAt?.toDate?.() ?? null;
        const online = lastSeenAt ? (Date.now() - lastSeenAt.getTime()) < 30_000 : false;
        setIsRunnerOnline(online);

        // אם הגרסה השתנה ויש גרסה קודמת → עדכון הסתיים
        if (prevVersion && newVersion && prevVersion !== newVersion) {
          addToast("success", `✅ הבוט עודכן בהצלחה לגרסה ${newVersion}`);
          setTimeout(() => window.location.reload(), 2000);
        }

        prevVersion = newVersion;
        setCurrentRunnerVersion(newVersion);
      } else {
        setCurrentRunnerVersion("");
        setIsRunnerOnline(false);
      }
    },
    () => {
      setCurrentRunnerVersion("");
      setIsRunnerOnline(false);
    }
  );
  return () => unsub();
}, [selectedAgentId]);



// 3. פונקציית שליחת פקודת העדכון (OTA)
const handleTriggerUpdate = async () => {
  if (!selectedAgentId) return;
  if (!installerUrl) {
    addToast("error", "חסר installerUrl בהגדרות המערכת");
    return;
  }

  setIsStartingAuto(true);
  try {
    const runRef = doc(collection(db, "portalImportRuns"));
    await setDoc(runRef, {
      agentId: selectedAgentId,
      status: "queued",
      automationClass: "self_update",
      installerUrl,
      createdAt: serverTimestamp(),
      triggeredFrom: "ui_update_button",
    });

    setAutoRunId(runRef.id);
    setAutoRunKind("self_update");
    addToast("success", "פקודת עדכון נשלחה לבוט!");
  } catch (e) {
    addToast("error", "נכשל בשליחת עדכון");
  } finally {
    setIsStartingAuto(false);
  }
};

const PROTOCOL_MIN_VERSION = "3.0.3"; // הגרסה הראשונה שתומכת בפרוטוקול

function isVersionAtLeast(version: string, min: string): boolean {
  const toParts = (v: string) => v.split(".").map((n) => parseInt(n, 10) || 0);
  const vParts = toParts(version);
  const mParts = toParts(min);
  for (let i = 0; i < Math.max(vParts.length, mParts.length); i++) {
    const v = vParts[i] || 0;
    const m = mParts[i] || 0;
    if (v > m) return true;
    if (v < m) return false;
  }
  return true;
}

const supportsRemoteStart =
  !!currentRunnerVersion && isVersionAtLeast(currentRunnerVersion, PROTOCOL_MIN_VERSION);

const isUpdateAvailable = latestRunnerVersion && currentRunnerVersion && latestRunnerVersion !== currentRunnerVersion;

const isCompanyAutoEnabled = selectedCompany?.companyAutoDownloadEnabled !== false;

const companyAutoDisabledReason =
  selectedCompany?.companyAutoDownloadMessage || "דוחות החברה עדיין לא זמינים להורדה.";

const isAutoEnabledEffective = isAutoEnabledByFlag && isCompanyAutoEnabled;

const effectiveAutoDisabledReason = !isAutoEnabledByFlag
  ? autoDisabledReason
  : !isCompanyAutoEnabled
    ? companyAutoDisabledReason
    : "";



const autoButtonDisabled =
  !canStartAuto ||
  isStartingAuto ||
  isCheckingAutoDownload ||
  isCheckingFlag ||
  !isAutoEnabledEffective;



// בדיקה מקדימה של ריצות קיימות לפי templateId + חודשי הדוח בקובץ 

const [importMode, setImportMode] = useState<"single" | "multi_sheet">("single");
const [multiSheetProfiles, setMultiSheetProfiles] = useState<MultiSheetImportProfile[]>([]);
const [selectedMultiSheetProfileId, setSelectedMultiSheetProfileId] = useState("");
const [multiSheetPreview, setMultiSheetPreview] = useState<{
  matchedSheets: Array<{
    sheetName: string;
    templateId: string;
    rowsCount: number;
    filteredRowsCount?: number;
    status: "done" | "skipped_empty";
  }>;
  unmatchedSheets: string[];
  ignoredSheets: string[];
} | null>(null);


async function checkExistingByRunsMultiTemplate(params: {
  agentId: string;
  profileId: string;
  selectedReportMonth?: string;
  rows: any[];
}) {
  const { agentId, profileId, selectedReportMonth, rows } = params;

  const fileMonths = Array.from(
    new Set(rows.map((r) => sanitizeMonth(r.reportMonth)).filter(Boolean))
  );

  const runsSnap = await getDocs(
    query(
      collection(db, "commissionImportRuns"),
      where("agentId", "==", agentId),
      where("sourceType", "==", "multi_sheet_bundle"),
      where("multiSheetProfileId", "==", profileId)
    )
  );

  const conflictingRunIds = new Set<string>();

  runsSnap.docs.forEach((d) => {
    const data: any = d.data();
    const runId = String(data.runId || d.id);

    const runSelectedReportMonth = sanitizeMonth(data.selectedReportMonth);
    const runMonths: string[] =
      Array.isArray(data.reportMonths) && data.reportMonths.length
        ? data.reportMonths.map(sanitizeMonth).filter(Boolean)
        : data.reportMonth
          ? [sanitizeMonth(data.reportMonth)].filter(Boolean)
          : [];

    // אם במולטי בחרו חודש ספציפי - נשווה ישירות לחודש שנבחר
    if (selectedReportMonth) {
      if (runSelectedReportMonth === sanitizeMonth(selectedReportMonth)) {
        conflictingRunIds.add(runId);
      }
      return;
    }

    // אם אין חודש ספציפי - בודקים חיתוך בין חודשי הקובץ לחודשי הריצה
    const fileSet = new Set(fileMonths);
    const hasIntersect = runMonths.some((m) => fileSet.has(m));

    if (hasIntersect) {
      conflictingRunIds.add(runId);
    }
  });

  setExistingRunIds(Array.from(conflictingRunIds));
}


const selectedMultiSheetProfile = React.useMemo(
  () => multiSheetProfiles.find((p) => p.id === selectedMultiSheetProfileId) || null,
  [multiSheetProfiles, selectedMultiSheetProfileId]
);


useEffect(() => {
  const loadProfiles = async () => {
    if (!selectedAgentId) {
      setMultiSheetProfiles([]);
      setSelectedMultiSheetProfileId("");
      return;
    }

    const profiles = await getMultiSheetProfiles(db, {
      agentId: selectedAgentId,
      agencyId: detail?.agencyId || "",
    });

    setMultiSheetProfiles(profiles);
  };

  loadProfiles();
}, [selectedAgentId, detail?.agencyId]);



const standardizeSheetRows = React.useCallback((params: {
  jsonData: any[];
  mapping: Record<string, string>;
  templateId: string;
  sourceFileName: string;
  selectedAgentId: string;
  selectedCompanyId?: string;
  selectedCompanyName?: string;
  fallbackProduct?: string;
  sheetName: string;
  lookupCustomerIdByPolicy?: boolean;
}) => {
  const {
    jsonData,
    mapping,
    templateId,
    sourceFileName,
    selectedAgentId,
    selectedCompanyId,
    selectedCompanyName,
    fallbackProduct,
    sheetName,
    lookupCustomerIdByPolicy,
  } = params;



  const standardized = jsonData
    .filter((row, index) => {
      const agentCodeVal = getValueBySystemField(row, mapping, "agentCode");

      if (index === 0) {
        // console.log("[standardizeSheetRows] first row agentCodeVal =", agentCodeVal);
      }

      return agentCodeVal !== null && agentCodeVal !== undefined;
    })
    .map((row) =>
      standardizeRowWithMapping(
        row,
        mapping,
        {
          agentId: selectedAgentId,
          templateId,
          sourceFileName,
          uploadDate: serverTimestamp(),
          companyId: selectedCompanyId || "",
          company: selectedCompanyName || "",
          sourceSheetName: sheetName,
          lookupCustomerIdByPolicy: !!lookupCustomerIdByPolicy,
        },
        undefined,
        { isMultiSheet: true }
      )
    )
    .map((row) => {
      if ((!row.product || !String(row.product).trim()) && fallbackProduct) {
        row.product = normalizeProduct(fallbackProduct);
      }
      return row;
    });

  return standardized;
}, []);





const multiPreviewColumns = [
  { key: "reportMonth", label: "חודש עמלה" },
  { key: "commissionAmount", label: "עמלה" },
  { key: "agentCode", label: "קוד סוכן" },
  { key: "customerId", label: 'ת.ז.' },
  { key: "premium", label: "יתרה" },
  { key: "policyNumber", label: "מספר פוליסה" },
  { key: "fullName", label: "שם לקוח" },
  { key: "product", label: "מוצר" },
  { key: "validMonth", label: "תאריך תחילה" },
  { key: "company", label: "חברה" },
  { key: "sourceSheetName", label: "לשונית מקור" },
];



const shouldShowMultiMonthPicker = Boolean(
  importMode === "multi_sheet" &&
  selectedMultiSheetProfile?.enableReportMonthFilter
);

const selectedTargetReportMonth =
  selectedReportYear && selectedReportMonth
    ? `${selectedReportYear}-${selectedReportMonth}`
    : "";
    

async function enrichMissingCustomerIdsForMarkedSheets(params: {
  rows: any[];
  agentId: string;
}) {
  const { rows, agentId } = params;

  const normalizePolicy = (v: any) =>
    String(v || "").trim().replace(/\s+/g, "");

  const normalizeCustomerId = (v: any) =>
    String(v || "").trim();

  // -----------------------------------
  // 1) קודם בונים מאגר מתוך הטעינה הנוכחית
  // -----------------------------------
  const currentImportMap = new Map<string, string>();
  // key = companyId__policyKey -> customerId

  for (const row of rows) {
    const companyId = String(row.companyId || "").trim();
    const policyKey = normalizePolicy(row.policyNumberKey || row.policyNumber);
    const customerId = normalizeCustomerId(row.customerId || row.customerIdRaw);

    if (!companyId || !policyKey || !customerId) continue;

    const key = `${companyId}__${policyKey}`;

    if (!currentImportMap.has(key)) {
      currentImportMap.set(key, customerId);
    }
  }

  // -----------------------------------
  // 2) ממלאים קודם מתוך הטעינה הנוכחית
  // -----------------------------------
  const rowsAfterCurrentImportLookup = rows.map((row) => {
    const shouldLookup = !!row.lookupCustomerIdByPolicy;
    const hasCustomerId = normalizeCustomerId(row.customerId || row.customerIdRaw) !== "";

    if (!shouldLookup || hasCustomerId) return row;

    const companyId = String(row.companyId || "").trim();
    const policyKey = normalizePolicy(row.policyNumberKey || row.policyNumber);

    if (!companyId || !policyKey) return row;

    const foundCustomerId = currentImportMap.get(`${companyId}__${policyKey}`);
    if (!foundCustomerId) return row;

    return {
      ...row,
      customerId: foundCustomerId,
      customerIdRaw: foundCustomerId,
    };
  });

  // -----------------------------------
  // 3) רק מה שעדיין חסר - מחפשים ב-DB
  // -----------------------------------
  const rowsToLookupInDb = rowsAfterCurrentImportLookup.filter((row) => {
    const shouldLookup = !!row.lookupCustomerIdByPolicy;
    const hasCustomerId = normalizeCustomerId(row.customerId || row.customerIdRaw) !== "";
    const policyKey = normalizePolicy(row.policyNumberKey || row.policyNumber);
    const companyId = String(row.companyId || "").trim();

    return shouldLookup && !hasCustomerId && !!policyKey && !!companyId;
  });

  if (!rowsToLookupInDb.length) {
    return rowsAfterCurrentImportLookup;
  }

  const lookupGroups = new Map<string, string[]>();
  // key = companyId, value = policy keys

  for (const row of rowsToLookupInDb) {
    const companyId = String(row.companyId || "").trim();
    const policyKey = normalizePolicy(row.policyNumberKey || row.policyNumber);

    if (!lookupGroups.has(companyId)) lookupGroups.set(companyId, []);
    lookupGroups.get(companyId)!.push(policyKey);
  }

  const dbFoundMap = new Map<string, string>();
  // key = companyId__policyKey -> customerId

  for (const [companyId, policyKeysRaw] of lookupGroups.entries()) {
    const uniquePolicyKeys = Array.from(new Set(policyKeysRaw.filter(Boolean)));

    for (let i = 0; i < uniquePolicyKeys.length; i += 10) {
      const chunk = uniquePolicyKeys.slice(i, i + 10);

      const snap = await getDocs(
        query(
          collection(db, "externalCommissions"),
          where("agentId", "==", agentId),
          where("companyId", "==", companyId),
          where("policyNumberKey", "in", chunk)
        )
      );

      snap.docs.forEach((docSnap) => {
        const data: any = docSnap.data();
        const policyKey = normalizePolicy(data.policyNumberKey);
        const customerId = normalizeCustomerId(data.customerId);
        const rowCompanyId = String(data.companyId || "").trim();

        if (!policyKey || !customerId || !rowCompanyId) return;

        const key = `${rowCompanyId}__${policyKey}`;
        if (!dbFoundMap.has(key)) {
          dbFoundMap.set(key, customerId);
        }
      });
    }
  }

  // -----------------------------------
  // 4) משלימים את מה שנשאר מה-DB
  // -----------------------------------
  return rowsAfterCurrentImportLookup.map((row) => {
    const shouldLookup = !!row.lookupCustomerIdByPolicy;
    const hasCustomerId = normalizeCustomerId(row.customerId || row.customerIdRaw) !== "";

    if (!shouldLookup || hasCustomerId) return row;

    const companyId = String(row.companyId || "").trim();
    const policyKey = normalizePolicy(row.policyNumberKey || row.policyNumber);

    if (!companyId || !policyKey) return row;

    const foundCustomerId = dbFoundMap.get(`${companyId}__${policyKey}`);
    if (!foundCustomerId) return row;

    return {
      ...row,
      customerId: foundCustomerId,
      customerIdRaw: foundCustomerId,
    };
  });
}





  /* ==============================
     Render
  ============================== */
 return (
  <div className="p-6 max-w-6xl mx-auto text-right font-sans min-h-screen bg-white">
    <header className="mb-8 flex justify-between items-center border-b pb-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-800">מרכז טעינת עמלות</h2>
        <p className="text-sm text-gray-500">ניהול דוחות נפרעים</p>
      </div>
    </header>

    {/* 1. בחירת סוכן */}
    <div className="mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-inner">
      <div className="max-w-md flex flex-col gap-1">
        <label className="text-xs font-bold text-gray-500 mr-1">1. בחר סוכן</label>
        <select
          value={selectedAgentId}
          onChange={handleAgentChange}
          className="select-input w-full h-10 border-gray-300 rounded-lg"
        >
          {detail?.role === "admin" && <option value="">-- בחר סוכן --</option>}
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </div>
    </div>
    {/* 2. אזור אוטומציה + עדכוני גרסה */}
    {selectedAgentId && (
      <div className="space-y-4 mb-8">
        <div
          className={`rounded-2xl p-5 text-white shadow-lg flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 transition-all duration-500
            ${
              !isAutoEnabledByFlag
                ? "bg-gray-500"
                : isUpdateAvailable
                  ? "bg-orange-600"
                  : autoRunId && autoRunKind === "portal"
                    ? "bg-indigo-700"
                    : "bg-blue-600"
            }`}
        >
          <div className="flex items-start gap-3">
            <span className={`text-2xl ${autoRunId && isAutoEnabledByFlag ? "animate-pulse" : ""}`}>
              {!isAutoEnabledByFlag ? "🔒" : isUpdateAvailable ? "🆙" : "⚡"}
            </span>

            <div>
              <div className="font-bold text-lg">
                {isUpdateAvailable
                  ? "יש עדכון גרסה זמין לבוט"
                  : "טעינה אוטומטית של דוחות עמלות"}
              </div>
              <div className="text-sm text-blue-100 opacity-90 mt-1">
                {!isAutoEnabledByFlag
                  ? autoDisabledReason
                  : isUpdateAvailable
                    ? `הגרסה שלך (${currentRunnerVersion}) ישנה. הגרסה החדשה היא ${latestRunnerVersion}.`
                    : !currentRunnerVersion
                      ? "הבוט עדיין לא מותקן. ניתן להוריד התקנה ראשונה ולהתחיל לעבוד."
                      : "מעקב אחר הדוחות שפורסמו החודש ולחיצה מהירה להפעלה לפי חברה."}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!currentRunnerVersion && installerUrl && (
              <a
                href={installerUrl}
                className="bg-white text-blue-600 px-4 py-2 text-sm font-bold rounded-lg hover:bg-blue-50 shadow-md"
              >
                הורד התקנה ראשונה
              </a>
            )}

            {needsManualUpgrade && installerUrl && (
              <a
                href={installerUrl}
                className="bg-white text-red-600 hover:bg-red-50 px-4 py-2 text-sm font-bold rounded-lg shadow-md"
              >
                נדרש עדכון ידני
              </a>
            )}
{isUpdateAvailable && isAutoEnabledByFlag && !needsManualUpgrade && (
  <>
    <Button
      text={autoRunKind === "self_update" && autoRunId ? "מעדכן..." : "עדכן עכשיו"}
      className="bg-white text-orange-600 hover:bg-orange-50 px-4 py-2 text-sm font-bold rounded-lg shadow-md disabled:opacity-50"
      onClick={handleTriggerUpdate}
      disabled={isStartingAuto || (autoRunKind === "self_update" && !!autoRunId) || isRunnerOnline === false}
    />
   {isRunnerOnline === false && (
      <span className="text-white text-xs opacity-80">
        יש להפעיל את הבוט לפני העדכון
      </span>
    )}
  </>
)}
          </div>
        </div>

        {selectedAgentId && currentRunnerVersion && isRunnerOnline === false && (
          supportsRemoteStart ? (
            <div className="rounded-xl bg-red-50 border border-red-200 p-4 flex items-center justify-between gap-3">
           <div className="text-sm text-red-700">
                <span className="font-bold">⚠️ הבוט לא פעיל כרגע במחשב הסוכן.</span>
                <span className="block text-xs text-red-500 mt-0.5">
                  לחצי כדי לנסות להפעיל אותו מרחוק
                </span>
              </div>
              <a
                href="magicsale-runner://start"
                className="bg-red-600 text-white px-4 py-2 text-sm font-bold rounded-lg hover:bg-red-700 shadow-md whitespace-nowrap"
              >
                הפעל את הבוט
              </a>
            </div>
          ) : (
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-700">
              הבוט לא פעיל, וגרסתו ({currentRunnerVersion}) ישנה מכדי לתמוך בהפעלה מרחוק.
              {installerUrl && (
                <a href={installerUrl} className="block mt-2 underline font-bold">
                  הורדת גרסה מעודכנת (התקנה חד-פעמית)
                </a>
              )}
            </div>
          )
        )}   
    {/* 3. קוביות החברות */}
{automaticCompanies.length > 0 ? (
 <AutomaticRunsDashboard
  db={db}
  selectedAgentId={selectedAgentId}
  companies={automaticCompanies}
  isAutoEnabledByFlag={isAutoEnabledByFlag}
  autoDisabledReason={effectiveAutoDisabledReason}
  refreshKey={autoDashboardRefreshKey}
  activeCompanyId={activeAutoCompanyId}
  isRunActive={isAutoRunActive}
  batchCompanyStatuses={batchCompanyStatuses}
  isBatchActive={!!activeBatchId}
  isRunnerOnline={isRunnerOnline}
  isUpdateAvailable={!!isUpdateAvailable}
  onStartBatch={async (companies) => {
    const { createPortalRunBatch } = await import('@/lib/portalRunBatches');

   const { batchId, runIds } = await createPortalRunBatch({
  db,
  agentId: selectedAgentId,
  companies,
});

const firstCompany = companies[0];

setActiveBatchId(batchId);
setBatchRunIds(runIds);
setBatchCompanyStatuses({});

setAutoRunId(runIds[0] || "");
setAutoRunKind("portal");
setActiveAutoCompanyId(firstCompany?.id || "");
setIsAutoRunActive(true);

addToast(
  'success',
  companies.length === 1
    ? '✅ הריצה נשלחה לתור'
    : `✅ נשלח Batch עם ${companies.length} חברות`
);
    // console.log('Created batch:', batchId, runIds);
  }}
/>
) : (
  <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8 text-center text-gray-500">
    אין כרגע חברות עם אוטומציה זמינה לסוכן זה.
  </div>
)}
        {/* סטטוס ריצה אוטומטית / עדכון */}
        {autoRunId && (
          <div className="animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white border border-blue-100 rounded-xl p-4 shadow-sm relative">
              {!isAutoRunActive && (
                <button
                  onClick={() => {
                    setAutoRunId("");
                    setAutoRunKind("");
                  }}
                  className="absolute top-2 left-2 text-gray-300 hover:text-gray-500 text-xs font-bold transition-colors"
                  title="נקה סטטוס"
                >
                  ✖
                </button>
              )}
            {batchProgress && activeBatchId && (
  <BatchProgressCard
    total={batchProgress.total}
    done={batchProgress.done}
    error={batchProgress.error}
    running={batchProgress.running}
    queued={batchProgress.queued}
    currentCompanyName={batchProgress.currentCompanyName}
    currentStep={batchProgress.currentStep}
  />
)}
              <PortalRunStatus
              key={autoRunId}
                db={db}
                runId={autoRunId}
                runKind={autoRunKind}
   onFinished={handlePortalRunFinished}
       />
            </div>
          </div>
        )}
      </div>
    )}

  {/* 4. כותרת טעינה ידנית */}
<div className="mb-4">
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
    
    {/* HEADER */}
    <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
      <h3 className="font-bold text-gray-700 flex items-center gap-2 text-sm">
        <span>📂</span> טעינה ידנית של דוחות עמלות
      </h3>
      <Link
        href="/Help/commission-reports#top"
        target="_blank"
        className="text-blue-600 text-sm font-bold flex items-center gap-1 hover:underline"
      >
        מדריך דוחות עמלות – איך להפיק ולייצא מכל חברה ❓
      </Link>
    </div>

    {/* MODE */}
    <div className="p-4">
      <label className="block text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">
        2. סוג טעינה
      </label>

      <div className="flex gap-6 items-center">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={importMode === "single"}
            onChange={() => setImportMode("single")}
          />
          קובץ רגיל
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={importMode === "multi_sheet"}
            onChange={() => setImportMode("multi_sheet")}
          />
          קובץ מרובה לשוניות
        </label>
      </div>
    </div>

    <div className="p-6 space-y-5">

      {/* ================= SINGLE ================= */}
      {importMode === "single" && (
        <>
          {/* חברה */}
          <div className="max-w-md">
            <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">
              3. בחר חברה
            </label>
            <select
              value={selectedCompanyId}
              onChange={(e) => {
                setSelectedCompanyId(e.target.value);
                setTemplateId("");
              }}
              className="select-input w-full h-10 border-gray-300 rounded-lg"
            >
              <option value="">-- בחר חברה --</option>
              {uniqueCompanies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          {/* תבנית */}
          {selectedCompanyId && (
            <div className="max-w-md">
              <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">
                4. בחר תבנית דוח
              </label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="select-input w-full h-10 border-gray-200 rounded-lg"
              >
                <option value="">-- בחר דוח ספציפי --</option>
                {filteredTemplates.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.Name || opt.type}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}

      {/* ================= MULTI ================= */}
  {importMode === "multi_sheet" && (
  <div className="max-w-md space-y-4">
    <div>
      <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">
        3. פרופיל טעינה
      </label>
      <select
        value={selectedMultiSheetProfileId}
        onChange={(e) => {
          setSelectedMultiSheetProfileId(e.target.value);

          setSelectedReportYear("");
          setSelectedReportMonth("");

          setStandardizedRows([]);
          setMultiSheetPreview(null);
          setSelectedFileName("");
          setExistingRunIds([]);
          setMonthsInFile([]);
          setConflictingRunIds([]);

          if (fileInputRef.current) {
            fileInputRef.current.value = "";
          }
        }}
        className="select-input w-full h-10 border-gray-300 rounded-lg"
      >
        <option value="">-- בחר פרופיל --</option>
        {multiSheetProfiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>

    {shouldShowMultiMonthPicker && (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">
            4. שנה
          </label>
          <select
            value={selectedReportYear}
            onChange={(e) => {
              setSelectedReportYear(e.target.value);
              setSelectedReportMonth("");
              setStandardizedRows([]);
              setMultiSheetPreview(null);
              setSelectedFileName("");
              setExistingRunIds([]);
              setMonthsInFile([]);
              setConflictingRunIds([]);

              if (fileInputRef.current) {
                fileInputRef.current.value = "";
              }
            }}
            className="select-input w-full h-10 border-gray-300 rounded-lg"
          >
            <option value="">-- בחר שנה --</option>
            {["2024", "2025", "2026", "2027"].map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">
            5. חודש
          </label>
          <select
            value={selectedReportMonth}
            onChange={(e) => {
              setSelectedReportMonth(e.target.value);
              setStandardizedRows([]);
              setMultiSheetPreview(null);
              setSelectedFileName("");
              setExistingRunIds([]);
              setMonthsInFile([]);
              setConflictingRunIds([]);

              if (fileInputRef.current) {
                fileInputRef.current.value = "";
              }
            }}
            disabled={!selectedReportYear}
            className="select-input w-full h-10 border-gray-300 rounded-lg disabled:bg-gray-100 disabled:text-gray-400"
          >
            <option value="">-- בחר חודש --</option>
            <option value="01">ינואר</option>
            <option value="02">פברואר</option>
            <option value="03">מרץ</option>
            <option value="04">אפריל</option>
            <option value="05">מאי</option>
            <option value="06">יוני</option>
            <option value="07">יולי</option>
            <option value="08">אוגוסט</option>
            <option value="09">ספטמבר</option>
            <option value="10">אוקטובר</option>
            <option value="11">נובמבר</option>
            <option value="12">דצמבר</option>
          </select>
        </div>
      </div>
    )}

    {shouldShowMultiMonthPicker && selectedTargetReportMonth && (
      <div className="text-xs text-blue-600 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
        חודש הדיווח שייטען: <strong>{selectedTargetReportMonth}</strong>
      </div>
    )}
  </div>
)}
      {/* ================= UPLOAD + BUTTONS ================= */}
      {(
        (importMode === "single" && selectedCompanyId && templateId) ||
(
  (importMode === "single" && selectedCompanyId && templateId) ||
  (
    importMode === "multi_sheet" &&
    selectedMultiSheetProfileId &&
    (
      !selectedMultiSheetProfile?.enableReportMonthFilter ||
      !!selectedTargetReportMonth
    )
  )
)      ) && (
        <>
          {/* UPLOAD */}
          <div
            className={`border-2 border-dashed rounded-2xl transition-all flex flex-col items-center justify-center gap-2 ${
              "border-blue-300 bg-blue-50/20 hover:border-blue-400 hover:bg-blue-50 cursor-pointer"
            } ${selectedFileName ? "p-4" : "p-8"}`}
            onClick={() =>
              !existingRunIds.length && fileInputRef.current?.click()
            }
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();

              if (e.dataTransfer.files?.[0]) {
                handleFileUpload({ target: { files: e.dataTransfer.files } } as any);
              }
            }}
          >
            {!selectedFileName ? (
              <>
                <div className="text-3xl opacity-50">📄</div>
                <div className="text-sm font-bold text-gray-600">
                  לחצי לבחירת קובץ או גררי לכאן
                </div>
              </>
            ) : (
              <div className="flex items-center gap-4 bg-white p-3 px-6 rounded-xl shadow-sm border border-blue-100">
                <div className="text-xl text-green-500">✅</div>
                <div className="text-right">
                  <div className="text-blue-700 font-bold text-sm">
                    {selectedFileName}
                  </div>
                  <div className="text-[10px] text-blue-400">
                    הקובץ מוכן לטעינה
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* PREVIEW MULTI */}
          {importMode === "multi_sheet" && multiSheetPreview && (
            <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
              <h4 className="font-bold text-sm mb-3">סיכום זיהוי לשוניות</h4>

              <div className="space-y-2 text-xs">
                {multiSheetPreview.matchedSheets.map((s) => (
                  <div
                    key={`${s.sheetName}_${s.templateId}`}
                    className="flex justify-between border-b pb-2"
                  >
                    <span>{s.sheetName}</span>
                   <span>
  {s.templateId} | {s.rowsCount} שורות
  {typeof s.filteredRowsCount === "number" && (
    <> | לאחר סינון: {s.filteredRowsCount}</>
  )}
  {" | "}
  {s.status}
</span>
                  </div>
                ))}

                {multiSheetPreview.unmatchedSheets.length > 0 && (
                  <div className="text-red-600">
                    לשוניות ללא התאמה: {multiSheetPreview.unmatchedSheets.join(", ")}
                  </div>
                )}

                {multiSheetPreview.ignoredSheets.length > 0 && (
                  <div className="text-gray-500">
                    לשוניות שהתעלמנו מהן: {multiSheetPreview.ignoredSheets.join(", ")}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BUTTONS */}
          <div className="flex gap-3 justify-start items-center">
            <Button
              text={isLoading ? "מעבד..." : "אשר טעינה"}
              type="primary"
              className="px-8 h-10 text-sm font-bold rounded-lg"
              onClick={handleImport}
              disabled={Boolean(!standardizedRows.length || isLoading)}
            />
            <Button
              text="נקה"
              type="secondary"
              className="px-4 h-10 text-sm rounded-lg"
              onClick={handleClearSelections}
            />
          </div>

          {existingRunIds.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-red-800 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>⚠️</span>
                <span>נמצאה טעינה קיימת לחודש זה.</span>
              </div>
              <button
                onClick={() => setShowConfirmDelete(true)}
                className="text-red-700 underline font-black"
              >
                מחק טעינה קודמת
              </button>
            </div>
          )}
        </>
      )}

    </div>
  </div>
</div>

    {/* 8. תצוגה מקדימה */}
 {standardizedRows.length > 0 && (
  <div className="mt-8 bg-white rounded-2xl border border-blue-100 shadow-xl overflow-hidden animate-in slide-in-from-bottom-6 duration-500">
    <div className="bg-[#1e3a8a] p-4 text-white flex justify-between items-center border-b border-blue-800">
      <div className="flex items-center gap-3">
        <div className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded text-[10px] font-bold border border-green-500/30">
          LIVE
        </div>
        <h3 className="font-bold text-base text-white">תצוגה מקדימה של הנתונים</h3>
      </div>
      <div className="text-xs font-medium text-blue-100">
        מציג 10 שורות מתוך <b>{standardizedRows.length}</b> שזוהו בקובץ
      </div>
    </div>

    <div className="overflow-x-auto">
      <table className="table-auto w-full text-right text-xs border-collapse">
        <thead className="bg-blue-50/50 text-blue-900 border-b border-blue-100">
          <tr>
            {(importMode === "multi_sheet"
              ? multiPreviewColumns.filter((col) =>
                  standardizedRows.some((row) => row[col.key] !== undefined)
                )
              : Object.entries(mapping).map(([he, en]) => ({ key: en, label: he }))
            ).map((col: any) => (
              <th
                key={col.key}
                className="px-4 py-3 font-black tracking-tight border-l border-blue-100/50 last:border-l-0"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-100">
          {standardizedRows.slice(0, 10).map((row, i) => (
            <tr key={i} className="hover:bg-blue-50/30 transition-colors group">
              {(importMode === "multi_sheet"
                ? multiPreviewColumns.filter((col) =>
                    standardizedRows.some((r) => r[col.key] !== undefined)
                  )
                : Object.entries(mapping).map(([he, en]) => ({ key: en, label: he }))
              ).map((col: any) => (
                <td
                  key={col.key}
                  className="px-4 py-2.5 text-gray-700 font-medium group-hover:text-blue-800"
                >
                  {String(row[col.key] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <div className="p-3 bg-blue-50/30 border-t border-blue-50 flex justify-center italic text-[10px] text-blue-400 font-medium">
      * ודאי כי העמודות והנתונים ממופים נכון לפני הלחיצה על &quot;אשר טעינה&quot;
    </div>
  </div>
)}
    {/* מודלים של מערכת */}
    <input
      ref={fileInputRef}
      type="file"
      accept=".xlsx,.xls,.csv,.zip"
      onChange={handleFileUpload}
      className="hidden"
    />

    {autoRunId && <PortalRunOtpModal key={autoRunId} runId={autoRunId} />}

    {showConfirmDelete && (
      <DialogNotification
        type="warning"
        title="מחיקת טעינה קיימת"
        message="האם למחוק את כל נתוני הטעינה הקודמת עבור סוכן/חברה/תבנית?"
        onConfirm={handleDeleteExisting}
        onCancel={() => setShowConfirmDelete(false)}
      />
    )}

    {showTemplateMismatch && (
      <DialogNotification
        type="warning"
        title="התבנית לא מתאימה לקובץ"
        message={
          <div className="text-right">
            <p>העמודות שמצאנו בקובץ לא תואמות להגדרות התבנית שבחרת.</p>
            <p className="mt-2 text-sm text-gray-500 italic">
              ודאי שבחרת את התבנית הנכונה (נפרעים/צבירה) או שהקובץ הופק בפורמט הנכון.
            </p>
          </div>
        }
        onConfirm={() => setShowTemplateMismatch(false)}
        hideCancel
      />
    )}

    {errorDialog && (
      <DialogNotification
        type="warning"
        title={errorDialog.title}
        message={errorDialog.message ?? ""}
        onConfirm={() => setErrorDialog(null)}
        onCancel={() => setErrorDialog(null)}
        hideCancel
      />
    )}

    {isLoading && (
      <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-[9999] flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-2xl shadow-2xl border border-blue-50 w-80">
          <div className="relative mb-6">
            <div className="w-20 h-20 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
            <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-blue-700">
              {importProgress}%
            </div>
          </div>

          <h3 className="text-xl font-bold text-gray-800 mb-2">מעבד נתונים...</h3>

          <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden mb-4 border border-gray-50">
            <div
              className="bg-blue-600 h-full transition-all duration-300 ease-out"
              style={{ width: `${importProgress}%` }}
            />
          </div>

          <p className="text-blue-600 font-medium animate-pulse text-sm">
            {loadingStage || "אנא המתן..."}
          </p>
        </div>
      </div>
    )}

    {/* Toasts */}
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <ToastNotification
          key={t.id}
          type={t.type}
          message={t.message}
          onClose={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
        />
      ))}
    </div>

    {zipChooser && (
      <DialogNotification
        type="info"
        title="נמצאו מספר קבצים ב-ZIP"
        message={
          <div className="text-right">
            <p className="mb-3 text-sm">בחר את הקובץ שברצונך לטעון:</p>
            <select
              className="w-full p-2 border rounded-lg text-sm font-sans"
              value={selectedZipEntry}
              onChange={(e) => setSelectedZipEntry(e.target.value)}
            >
              {zipChooser.entryNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        }
        onConfirm={() => processChosenZipEntry()}
        onCancel={() => {
          setZipChooser(null);
          setSelectedZipEntry("");
          setSelectedFileName("");
          if (fileInputRef.current) fileInputRef.current.value = "";
        }}
        confirmText="המשך לטעינה"
        cancelText="ביטול"
      />
    )}
  </div>
);
};

export default ExcelCommissionImporter;