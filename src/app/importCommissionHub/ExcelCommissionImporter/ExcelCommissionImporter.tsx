// ExcelCommissionImporter.tsx – premium + totalPremiumAmount + product intake/normalize
'use client';

import React, { useState, useEffect, useRef } from "react";
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
  
  const sanitizeMonth = (m?: any) => String(m || '').replace(/\//g, '-').trim();
  const [fallbackProduct, setFallbackProduct] = useState<string>('');
const [loadingStage, setLoadingStage] = useState<string>("");

const { canAccess: canAutoDownload, isChecking: isCheckingAutoDownload } =
  usePermission(user ? "access_portal_auto_download" : null);

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

  const VAT_DEFAULT = 0.18;



  //automaionUpload

const [autoRunId, setAutoRunId] = useState<string>("");
const [isStartingAuto, setIsStartingAuto] = useState(false);
const [isAutoRunActive, setIsAutoRunActive] = useState(false);

const automationClass = String(selectedTemplate?.automationClass || "").trim();
// const canStartAuto = Boolean(
//   selectedAgentId && selectedCompanyId && templateId && automationClass
// );

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
const INSTALLER_URL = "https://firebasestorage.googleapis.com/v0/b/agentsale-693e8.firebasestorage.app/o/installers%2FMagicSaleSetup.exe?alt=media&token=0f53f279-d2bd-468f-bb3f-a84c2e7110d3"; // הלינק מה-Storage

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
        companyAutomationClass: t.companyAutoClass || ""
      });
    }
    return acc;
  }, new Map()).values()
) as any[];



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



const autoButtonDisabled =
  !canStartAuto ||
  isStartingAuto ||
  isCheckingAutoDownload ||
  isCheckingFlag ||
  !isAutoEnabledByFlag;

const handleStartAuto = async () => {
  if (!selectedAgentId || !selectedCompanyId) return;

  setIsStartingAuto(true);
  setIsAutoRunActive(true);

  try {
    // לוקח את ה-Class מהחברה (או מהתבנית אם אין לחברה)
    const finalAutomationClass = effectiveAutomationClass;
    
    // אם ה-Class הגיע מהחברה (מכיל _all), נשלח Bundle. אחרת נשלח את ה-templateId הרגיל.
    const finalTemplateId = finalAutomationClass.includes('_all') 
      ? `bundle_${selectedCompanyId}_all` 
      : templateId;

    const { runId } = await startAutoPortalRun({
      db,
      agentId: selectedAgentId,
      companyId: selectedCompanyId,
      templateId: finalTemplateId,
      automationClass: finalAutomationClass,
      monthLabel: "previous_month",
      source: "portalRunner",
      triggeredFrom: "ui",
    });

    setAutoRunId(runId);
  } catch (e: any) {
    addToast("error", `שגיאה: ${e.message}`);
    setIsAutoRunActive(false);
  } finally {
    setIsStartingAuto(false);
  }
};



  const roundTo2 = (num: number) => Math.round(num * 100) / 100;
  const getExt = (n: string) => n.slice(n.lastIndexOf('.')).toLowerCase();

  // דגל דיבאגר
  const DEBUG_IMPORT = true;

  // --- normalize header: מסיר RTL-marks, BOM, NBSP, שורות חדשות, מכווץ רווחים ---
  const normalizeHeader = (s: any) =>
    String(s ?? '')
      .replace(/\u200f|\u200e|\ufeff/g, '') // RTL + BOM
      .replace(/\u00a0/g, ' ')              // NBSP → space רגיל
      .replace(/\r?\n+/g, ' ')              // ירידות שורה
      .replace(/\s+/g, ' ')                 // כיווץ רווחים מרובים
      .trim();

  // --- גטר בטוח לתאים לפי כותרת (תומך בכותרת מנורמלת) ---
  const getCell = (row: any, header: string) =>
    row[header] ?? row[normalizeHeader(header)];

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

        if (companyId) {
         if (!companyCache[companyId]) {
          const companySnap = await getDoc(doc(db, 'company', companyId));
          companyCache[companyId] = companySnap.exists() ? companySnap.data() : {};
        }
       const companyInfo = companyCache[companyId];
        companyName = companyInfo.companyName || '';
        automationEnabled = !!companyInfo.automationEnabled;
        companyAutomationClass = companyInfo.automationClass || '';      
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
          commissionIncludesVAT: !!data.commissionIncludesVAT,
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

  // טעינת mapping של התבנית הנבחרת
  useEffect(() => {
    const fetchTemplateMapping = async () => {
      if (!templateId) { setMapping({}); setFallbackProduct(''); return; }
      const existsInActive = templateOptions.some(t => t.id === templateId);
      if (!existsInActive) { setMapping({}); return; }

      const ref = doc(db, 'commissionTemplates', templateId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        setMapping(data.fields || {});
        setFallbackProduct(String(data.fallbackProduct || '').trim());
      } 
      else { setMapping({}); setFallbackProduct(''); 
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
        if ((templateId === 'migdal_life' || templateId === 'migdal_gemel') && d.m === 1 && d.d >= 1 && d.d <= 12) {
          return `${d.y}-${String(d.d).padStart(2, '0')}`;
        }
        return `${d.y}-${String(d.m).padStart(2,'0')}`;
      }
    }
    

    // if (value instanceof Date) {
    //   return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}`;
    // }
    if (value instanceof Date) {
      const y = value.getFullYear();
      const m = value.getMonth() + 1;
      const d = value.getDate();
    
      if ((templateId === 'migdal_life' || templateId === 'migdal_gemel') && m === 1 && d >= 1 && d <= 12) {
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
    fallbackReportMonth?: string
  ) => {
    const result: any = { ...base };

    // 1) מיפוי בסיסי מכל העמודות שהוגדרו בתבנית
    for (const [excelCol, systemField] of Object.entries(mapping)) {
      const value = getCell(row, excelCol);

      if (systemField === 'validMonth' || systemField === 'reportMonth') {
        let parsed = parseHebrewMonth(value, base.templateId);
        if (!parsed && systemField === 'reportMonth' && fallbackReportMonth) parsed = fallbackReportMonth;
        result[systemField] = parsed || value;

      } else if (systemField === 'commissionAmount') {
        const override = commissionOverrides[base.templateId];
        let commission = override ? override(row) : toNum(value);

        if (selectedTemplate?.commissionIncludesVAT) {
          commission = commission / (1 + VAT_DEFAULT);
        }

        result[systemField] = roundTo2(commission);

      } else if (systemField === 'premium') {
        if (base.templateId === 'fenix_insurance') {
          const sector = String(pick(row, ['ענף']) ?? '').trim();
          const accRaw  = pick(row, ['צבירה', 'סכום צבירה']);
          const premRaw = pick(row, ['פרמיה', 'סכום פרמיה']);
          result.premium = toNum(
            sector === 'פיננסים וזמן פרישה'
              ? (accRaw ?? premRaw)
              : premRaw
          );
        } else {
          result.premium = toNum(value);
        }

      } else if (systemField === 'product') {
        const p = normalizeProduct(value);
        if (p !== undefined) result.product = p;

      } else if (systemField === 'customerId' || systemField === 'IDCustomer') {
        const raw = String(value ?? '').trim();
        const padded9 = toPadded9(value);
        result.customerIdRaw = raw;
        result.customerId = padded9;

      } else if (systemField === 'policyNumber') {
        result[systemField] = String(value ?? '').trim();

      } else {
        result[systemField] = value;
      }
    }

    // 2) השלמה/נרמול שם מלא לפי תבנית (שדות מדויקים בלבד)
    if (base.templateId === 'mor_insurance') {
      if (result.fullName) {
        result.fullName = normalizeFullName(result.fullName, '');
      } else {
        const first = row['שם פרטי'];
        const last  = row['שם משפחה'];
        const full  = normalizeFullName(first, last);
        if (full) result.fullName = full;
      }
    } else if (base.templateId === 'clal_pensia') {
      if (result.fullName) {
        result.fullName = normalizeFullName(result.fullName, '');
      } else {
        const first = row['שם פרטי עמית'];
        const last  = row['שם משפחה עמית'];
        const full  = normalizeFullName(first, last);
        if (full) result.fullName = full;
      }
    }
    if (base.templateId === 'clal_pensia' && !result.policyNumber && result.customerId) {
      result.policyNumber = String(result.customerId).trim();
    }

    // ---- override for Altshuler: reportMonth = YEAR + MONTH(from "חודש") ----
    if (base.templateId === 'altshuler_insurance') {
      const rawMonth = getCell(row, 'חודש');
      const rawYear  = getCell(row, 'שנה');

      const mm = monthNameToMM(rawMonth);
      let yyyy = String(rawYear ?? '').trim();

      // תמיכה גם ב־"25" → "2025"
      if (/^\d{2}$/.test(yyyy)) {
        const yy = parseInt(yyyy, 10);
        yyyy = (yy < 50 ? `20${yy}` : `19${yy}`);
      }

      if (mm && /^\d{4}$/.test(yyyy)) {
        result.reportMonth = `${yyyy}-${mm}`;
      }
    }

    // ✅ fallback product from template (for templates like clal_briut without product column)
if (!result.product || !String(result.product).trim()) {
  if (fallbackProduct) {
    result.product = normalizeProduct(fallbackProduct);
  }
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

      // // לוג לכל ריצה
      // console.log('[RUN]', {
      //   docId: d.id,
      //   runId,
      //   reportMonth: data.reportMonth,
      //   reportMonths: data.reportMonths,
      //   runMonthsComputed: runMonths,
      //   intersectWithFile: intersect,
      //   agentId: data.agentId,
      //   companyId: data.companyId,
      //   templateId: data.templateId,
      // });

      return {
        docId: d.id,
        runId,
        runMonths,
        intersect,
      };
    })
    .filter((r) => r.intersect.length > 0);

  const runIds = Array.from(new Set(conflictingRuns.map((r) => r.runId).filter(Boolean)));

  // console.log('[checkExistingByRuns] conflictingRuns:', conflictingRuns);
  // console.log('[checkExistingByRuns] runIds:', runIds);

  setExistingRunIds(runIds);
}


const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file || !templateId || !selectedAgentId || !selectedCompanyId) return;

  const ext = getExt(file.name);
  const allowed = new Set(['.xlsx', '.xls', '.csv', '.zip']);
  if (!allowed.has(ext)) {
    setErrorDialog({
      title: 'סוג קובץ לא נתמך',
      message: <>הקובץ <b>{file.name}</b> הוא {ext}. נא להעלות רק קבצי ZIP/XLSX/XLS/CSV.</>,
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
    return;
  }

  setSelectedFileName(file.name);
  setIsLoading(true);
  setLoadingStage("קורא קובץ מהמחשב..."); // שלב 1

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const arrayBuffer = evt.target?.result as ArrayBuffer;
      const fallbackReportMonth = templateId === 'mor_insurance' ? extractReportMonthFromFilename(file.name) : undefined;

      // --- טיפול ב-ZIP ---
      if (ext === '.zip') {
        setLoadingStage("פותח ארכיון ZIP...");
        const mod = await import('jszip');
        const JSZip: any = (mod as any).default ?? mod;
        const zip = await JSZip.loadAsync(arrayBuffer);

        const entries = zip.file(/\.xlsx$|\.xls$|\.csv$/i);
        if (entries.length === 0) throw new Error('ה-ZIP לא מכיל XLSX/XLS/CSV.');

        // אם יש יותר מקובץ אחד, פותחים את הבוחר ומפסיקים
        if (entries.length > 1) {
          const names = entries.map((f: any) => f.name);
          setZipChooser({ zip, entryNames: names, outerFileName: file.name });
          setSelectedZipEntry(names[0]);
          setIsLoading(false);
          setLoadingStage("");
          return;
        }

        // אם יש קובץ אחד בלבד ב-ZIP, מחלצים אותו וממשיכים לעיבוד
        const entry = entries[0];
        setLoadingStage(`מחלץ את ${entry.name}...`);
        const innerData = /\.csv$/i.test(entry.name) 
          ? await entry.async('uint8array') 
          : await entry.async('arraybuffer');
        
        await parseAndStandardize(innerData, entry.name, fallbackReportMonth);

      } else {
        // --- טיפול בקובץ רגיל (XLSX/CSV) ---
        await parseAndStandardize(arrayBuffer, file.name, fallbackReportMonth);
      }
    } catch (err: any) {
      setErrorDialog({
        title: 'שגיאת עיבוד קובץ',
        message: <>אירעה שגיאה בעת עיבוד הקובץ <b>{file.name}</b>.</>,
      });
    } finally {
      setIsLoading(false);
      setLoadingStage("");
    }
  };
  reader.readAsArrayBuffer(file);
};

// const parseAndStandardize = async (data: any, fileName: string, fallbackMonth?: string) => {
//   let jsonData: any[] = [];
//   const innerExt = getExt(fileName);

//   // 1. שלב ה-Parsing
//   setLoadingStage(`מפענח נתונים מתוך ${fileName}...`);
//   await new Promise(r => setTimeout(r, 100));

//   if (innerExt === '.csv') {
//     jsonData = readCsv(data);
//   } else {
//     let wb: XLSX.WorkBook;
//     try {
//       wb = XLSX.read(data, { type: 'array', cellDates: true });
//     } catch (err) {
//       setIsLoading(false); // כיבוי הלואדר במקרה של שגיאה קריטית
//       throw new Error('קובץ אקסל לא תקין.');
//     }

//     let wsname = wb.SheetNames[0];
//     let headerRowIndex = 0;

//     if (templateId === 'menura_insurance') {
//       const foundSheet = wb.SheetNames.find(name => name.includes('דוח עמלות'));
//       if (foundSheet) { wsname = foundSheet; headerRowIndex = 29; }
//     }

//     const ws = wb.Sheets[wsname];
//     if (templateId !== 'menura_insurance') {
//       headerRowIndex = findHeaderRowIndex(ws, Object.keys(mapping));
//     }

//     jsonData = XLSX.utils.sheet_to_json(ws, { defval: "", range: headerRowIndex, raw: true });
//   }

//   // 2. בדיקת שלמות בסיסית
//   if (!jsonData || jsonData.length === 0) {
//     setIsLoading(false);
//     addToast("error", "הקובץ ריק או שלא זוהו בו שורות נתונים.");
//     return;
//   }

//   // 3. 🛡️ בדיקת התאמת עמודות (כאן קרתה הרגרסיה)
//   const expectedHeadersRaw = Object.keys(mapping);
//   const foundHeadersRaw = Object.keys(jsonData[0] || {});

//   // פונקציית העזר שלך שמפעילה את setShowTemplateMismatch
//   const ok = checkCoverageOrShowMismatch(
//     expectedHeadersRaw,
//     foundHeadersRaw,
//     () => { 
//       // חשוב: קודם מכבים את מצב הטעינה כדי שהמודאל של השגיאה יוכל לעלות מעליו
//       setIsLoading(false);
//       setLoadingStage("");
//       setTimeout(() => {
//         setShowTemplateMismatch(true);
//       }, 100);
//     },
//     'Validation'
//   );

//   if (!ok) return; // עצירה מוחלטת אם הקובץ לא מתאים

//   // 4. שלב הנירמול (רק אם הקובץ תקין)
//   setLoadingStage(`מנרמל וממפה ${jsonData.length.toLocaleString()} שורות...`);
//   await new Promise(r => setTimeout(r, 100));

//   const standardized = jsonData
//     .filter((row) => {
//       const agentCodeColumn = Object.entries(mapping).find(([, field]) => field === 'agentCode')?.[0];
//       const agentCodeVal = agentCodeColumn ? getCell(row, agentCodeColumn) : null;
//       return agentCodeVal && agentCodeVal.toString().trim() !== '';
//     })
//     .map(row => standardizeRowWithMapping(row, mapping, {
//       agentId: selectedAgentId,
//       templateId,
//       sourceFileName: fileName,
//       uploadDate: serverTimestamp(),
//       companyId: selectedCompanyId,
//       company: selectedCompanyName,
//     }, fallbackMonth));

//   if (standardized.length === 0) {
//     setIsLoading(false);
//     setErrorDialog({ title: "שגיאת נתונים", message: "לא נמצאו שורות עם מספר סוכן תקין בעיבוד הקובץ." });
//     return;
//   }

//   setStandardizedRows(standardized);

//   // 5. בדיקת כפילויות
//   setLoadingStage("בודק טעינות קיימות בבסיס הנתונים...");
//   const fileMonths = Array.from(new Set(standardized.map(r => sanitizeMonth(r.reportMonth)).filter(Boolean))).sort();
//   setMonthsInFile(fileMonths);

//   await checkExistingByRuns({
//     agentId: selectedAgentId,
//     companyId: selectedCompanyId,
//     templateId,
//     monthsInFile: fileMonths,
//   });

//   setLoadingStage("הושלם!");
//   // שהיה קצרה וכיבוי הלואדר
//   setTimeout(() => {
//     setIsLoading(false);
//     setLoadingStage("");
//   }, 500);
// };

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
        message: "בחרת תבנית נפרעים, אך הקובץ הוא דוח צבירה (ZVIRA). אנא בחרי קובץ NIFRAIM."
      });
      return;
    }

    // מקרה ב': תבנית צבירה + קובץ נפרעים
    if (isZviraTemplate && isNifraimFile) {
      setIsLoading(false);
      setLoadingStage("");
      setErrorDialog({
        title: "קובץ לא מתאים (מנורה)",
        message: "בחרת תבנית צבירה, אך הקובץ הוא דוח נפרעים (NIFRAIM). אנא בחרי קובץ ZVIRA."
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
    }, fallbackMonth));

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

    standardizedRows.forEach((row) => {
      row.reportMonth = parseHebrewMonth(row.reportMonth, row.templateId);
      row.validMonth  = parseHebrewMonth(row.validMonth,  row.templateId);
    });

    setIsLoading(true);

    if (existingDocs.length > 0) {
      addToast("error", "קובץ כבר קיים לחודש זה ולסוכן זה");
      setIsLoading(false);
      return;
    }

    try {
       // יוצרים ריצה חדשה (ID ריצה אחד לכל הטעינה הזו)
    const runRef = doc(collection(db, 'commissionImportRuns'));
    const runId = runRef.id;
      const uniqueAgentCodes = new Set<string>();
      for (const row of standardizedRows) {
        if (row.agentCode) uniqueAgentCodes.add(String(row.agentCode).trim());
      }
      const userRef  = doc(db, 'users', selectedAgentId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const existingCodes: string[] = userSnap.data().agentCodes || [];
        const codesToAdd = Array.from(uniqueAgentCodes).filter((c) => !existingCodes.includes(c));
        if (codesToAdd.length > 0) await updateDoc(userRef, { agentCodes: arrayUnion(...codesToAdd) });
      }

      const rowsPrepared = standardizedRows.map((r) => ({
        ...r,
        policyNumberKey: String(r.policyNumber ?? '').trim().replace(/\s+/g, ''),
        customerId: toPadded9(r.customerId ?? r.customerIdRaw ?? ''),
        runId,
      }));

      await writeExternalRowsInChunks(rowsPrepared);

      const summariesMap = new Map<string, CommissionSummary>();
      for (const row of rowsPrepared) {
        const sanitizedMonth = String(row.reportMonth ?? '').replace(/\//g, '-') || '';
        const key = `${row.agentId}_${row.agentCode}_${sanitizedMonth}_${row.templateId}_${row.companyId}`;
        if (!summariesMap.has(key)) {
          summariesMap.set(key, {
            agentId: row.agentId,
            agentCode: row.agentCode,
            reportMonth: row.reportMonth,
            templateId: row.templateId,
            companyId: row.companyId,
            company: row.company || '',
            totalCommissionAmount: 0,
            totalPremiumAmount: 0,
            runId,
          });
        }
        const s = summariesMap.get(key)!;
        const commission = Number(row.commissionAmount ?? 0);
        const premium    = Number(row.premium ?? 0);
        s.totalCommissionAmount += isNaN(commission) ? 0 : commission;
        s.totalPremiumAmount    += isNaN(premium)    ? 0 : premium;
      }
      await writeSummariesInBatch(Array.from(summariesMap.values()));

      const policyMap = new Map<string, {
        agentId: string;
        agentCode: string;
        reportMonth: string;
        companyId: string;
        company: string;
        policyNumberKey: string;
        customerId: string;
        templateId: string;
        totalCommissionAmount: number;
        totalPremiumAmount: number;
        commissionRate: number;
        rowsCount: number;
        product?: string;
        fullName?: string;
        runId?: string;
        validMonth?: string;
      }>();

      for (const row of rowsPrepared) {
        const sanitizedMonth  = String(row.reportMonth ?? '').replace(/\//g, '-');
        const validMonth      = String(row.validMonth ?? '').replace(/\//g, '-');
        const agentId         = row.agentId;
        const agentCode       = String(row.agentCode ?? '').trim();
        const companyId       = row.companyId;
        const company         = row.company || '';
        const templId         = row.templateId || '';
        const policyNumberKey = row.policyNumberKey || String(row.policyNumber ?? '').trim().replace(/\s+/g, '');
        const customerId      = toPadded9(row.customerId ?? row.customerIdRaw ?? '');
        const product         = String(row.product ?? '').trim();
        const fullName        = String(row.fullName ?? '').trim();

        if (!agentId || !agentCode || !sanitizedMonth || !companyId || !policyNumberKey || !customerId) continue;

        const key = `${agentId}_${agentCode}_${sanitizedMonth}_${companyId}_${policyNumberKey}_${customerId}_${templId}`;
        if (!policyMap.has(key)) {
          policyMap.set(key, {
            agentId,
            agentCode,
            reportMonth: sanitizedMonth,
            validMonth,
            companyId,
            company,
            policyNumberKey,
            customerId,
            templateId: templId,
            totalCommissionAmount: 0,
            totalPremiumAmount: 0,
            commissionRate: 0,
            rowsCount: 0,
            runId,
          });
        }
        const s = policyMap.get(key)!;
        const commission = Number(row.commissionAmount ?? 0);
        const premium    = Number(row.premium ?? 0);
        s.totalCommissionAmount += isNaN(commission) ? 0 : commission;
        s.totalPremiumAmount    += isNaN(premium)    ? 0 : premium;
        s.rowsCount += 1;
        if (!s.product  && product)  s.product  = product;
        if (!s.fullName && fullName) s.fullName = fullName;
      }

      // ✅ חישוב commissionRate לכל פוליסה (אחוז מהקובץ)
// חשוב: זה אחוז משוקלל ברמת פוליסה = totalCommission / totalPremium
for (const s of policyMap.values()) {
  const prem = Number(s.totalPremiumAmount ?? 0);
  const comm = Number(s.totalCommissionAmount ?? 0);

  (s as any).commissionRate = prem > 0 ? roundTo2((comm / prem) * 100) : 0;
}

      await writePolicySummariesInBatch(Array.from(policyMap.values()) as any);


  // ---- יצירת דוקומנט ריצה לניהול טעינות ----
const totalRows = rowsPrepared.length;
const commissionSummariesCount = summariesMap.size;
const policySummariesCount = policyMap.size;

const reportMonths = Array.from(new Set(
  rowsPrepared
    .map(r => sanitizeMonth(r.reportMonth))
    .filter(Boolean)
)).sort();

const minReportMonth = reportMonths[0] || '';
const maxReportMonth = reportMonths.at(-1) || '';

await setDoc(runRef, {
  runId,
  createdAt: serverTimestamp(),
  agentId: selectedAgentId,
  agentName: agents.find(a => a.id === selectedAgentId)?.name || '',
  createdBy: detail?.email || detail?.name || '',
  createdByUserId: user?.uid || '',
  companyId: selectedCompanyId,
  company: selectedCompanyName,
  templateId,
  templateName: selectedTemplate?.Name || selectedTemplate?.type || '',

  reportMonths,
  minReportMonth,
  maxReportMonth,
  reportMonthsCount: reportMonths.length,

  // תאימות אחורה
  reportMonth: minReportMonth,

  externalCount: totalRows,
  commissionSummariesCount,
  policySummariesCount,
});
  addToast("success", "✅ הטעינה הושלמה בהצלחה");

      const grouped: Record<string, {
        count: number; uniqueCustomers: Set<string>; totalCommission: number; totalPremium: number;
      }> = {};
      for (const row of rowsPrepared) {
        const code = row.agentCode;
        if (!code) continue;
        if (!grouped[code]) grouped[code] = { count: 0, uniqueCustomers: new Set(), totalCommission: 0, totalPremium: 0 };
        grouped[code].count += 1;
        if (row.customerId) grouped[code].uniqueCustomers.add(row.customerId);
        grouped[code].totalCommission += Number(row.commissionAmount ?? 0) || 0;
        grouped[code].totalPremium   += Number(row.premium ?? 0) || 0;
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

      setStandardizedRows([]);
      setSelectedFileName('');
      setExistingDocs([]);
    } catch (error) {
      // console.error('שגיאה בעת טעינה:', error);
      addToast("error", "שגיאה בעת טעינה למסד. בדוק קונסול.");
    } finally {
      setIsLoading(false);
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
  const fetchLatestVersion = async () => {
    const snap = await getDoc(doc(db, "portalRunnerConfig", "global"));
    if (snap.exists()) setLatestRunnerVersion(snap.data().latestVersion);
  };
  fetchLatestVersion();
}, []);

// 2. זיהוי הגרסה הנוכחית של הסוכן (לפי הריצה האחרונה שלו)

// 2. זיהוי הגרסה הנוכחית - שאילתה חכמה
useEffect(() => {
  if (!selectedAgentId) return;
  const fetchAgentRunnerVersion = async () => {
    // אנחנו מביאים את 5 הריצות האחרונות כדי לוודא שנדלג על רשומות queued ללא גרסה
    const q = query(
      collection(db, "portalImportRuns"),
      where("agentId", "==", selectedAgentId),
      orderBy("createdAt", "desc"),
      limit(5) 
    );
    
    const snap = await getDocs(q);
    if (!snap.empty) {
      // מחפשים את המסמך הראשון (הכי חדש) שיש בו באמת מספר גרסה
      const lastRunWithVersion = snap.docs.find(doc => doc.data().runner?.version);
      
      if (lastRunWithVersion) {
        setCurrentRunnerVersion(lastRunWithVersion.data().runner.version);
      } else {
        // אם אין אף ריצה עם גרסה (סוכן חדש באמת)
        setCurrentRunnerVersion(""); 
      }
    }
  };
  fetchAgentRunnerVersion();
}, [selectedAgentId, autoRunId]);


// 3. פונקציית שליחת פקודת העדכון (OTA)
const handleTriggerUpdate = async () => {
  if (!selectedAgentId) return;
  setIsStartingAuto(true);
  try {
    const runRef = doc(collection(db, "portalImportRuns"));
    await setDoc(runRef, {
      agentId: selectedAgentId,
      status: "queued",
      automationClass: "self_update", // המפתח שמפעיל את הקוד ב-Runner
      createdAt: serverTimestamp(),
      triggeredFrom: "ui_update_button"
    });
    setAutoRunId(runRef.id);
    addToast("success", "פקודת עדכון נשלחה לבוט!");
  } catch (e) {
    addToast("error", "נכשל בשליחת עדכון");
  } finally {
    setIsStartingAuto(false);
  }
};

const isUpdateAvailable = latestRunnerVersion && currentRunnerVersion && latestRunnerVersion !== currentRunnerVersion;







  /* ==============================
     Render
  ============================== */
 return (
  <div className="p-6 max-w-5xl mx-auto text-right font-sans min-h-screen bg-white">
    {/* כותרת עדינה */}
    <header className="mb-8 flex justify-between items-center border-b pb-4">
      <div>
        <h2 className="text-2xl font-bold text-gray-800">מרכז טעינת עמלות</h2>
        <p className="text-sm text-gray-500">ניהול דוחות נפרעים</p>
      </div>
      <Link href="/Help/commission-reports#top" target="_blank" className="text-blue-600 text-sm font-bold flex items-center gap-1 hover:underline">
       מדריך דוחות עמלות – איך להפיק ולייצא מכל חברה ❓
      </Link>
    </header>
    {/* שלב 1: בחירת סוכן וחברה */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-inner">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-bold text-gray-500 mr-1">1. בחר סוכן</label>
        <select value={selectedAgentId} onChange={handleAgentChange} className="select-input w-full h-10 border-gray-300 rounded-lg">
          {detail?.role === "admin" && <option value="">-- בחר סוכן --</option>}
          {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-bold text-gray-500 mr-1">2. בחר חברה</label>
        <select
          value={selectedCompanyId}
          onChange={(e) => { setSelectedCompanyId(e.target.value); setTemplateId(''); }}
          className="select-input w-full h-10 border-gray-300 rounded-lg"
        >
          <option value="">-- בחרי חברה --</option>
          {uniqueCompanies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
      </div>
    </div>
    {selectedCompanyId ? (
      <div className="space-y-4 animate-in fade-in duration-500">
{/* 🚀 פס אוטומציה חכם - מבוסס הרשאות, סטטוס חברה (image_17fba5) ודגלי מערכת (image_e598ee) */}
{canAutoDownload && selectedCompany?.automationEnabled && (
  <div className={`rounded-xl p-4 text-white shadow-lg flex items-center justify-between transition-all duration-500 
    ${!isAutoEnabledByFlag ? 'bg-gray-500' : isUpdateAvailable ? 'bg-orange-600' : !!autoRunId ? 'bg-indigo-700' : 'bg-blue-600'}`}>
    
    <div className="flex items-center gap-3">
      {/* אייקון משתנה: מנעול אם חסום, חץ למעלה אם יש עדכון, ברק אם תקין */}
      <span className={`text-2xl ${!!autoRunId && isAutoEnabledByFlag ? 'animate-pulse' : ''}`}>
        {!isAutoEnabledByFlag ? '🔒' : isUpdateAvailable ? '🆙' : '⚡'}
      </span>
      
      <div>
        <div className="font-bold text-sm">
          {isUpdateAvailable ? 'יש עדכון גרסה זמין לבוט!' : `משיכה אוטומטית מ${selectedCompanyName}`}
        </div>
        <div className="text-xs text-blue-100 opacity-90">
          {/* לוגיקת הודעות: עדיפות ראשונה לחסימת מערכת (image_e598ee), אח"כ עדכון, ואז סטטוס רגיל */}
          {!isAutoEnabledByFlag 
            ? autoDisabledReason 
            : isUpdateAvailable 
              ? `הגרסה שלך (${currentRunnerVersion}) ישנה. הגרסה החדשה היא ${latestRunnerVersion}.`
              : !currentRunnerVersion 
                ? "הבוט לא מותקן? לחצי על 'הורד התקנה' כדי להתחיל."
                : "המערכת מוכנה למשיכת נתונים בלחיצת כפתור."}
        </div>
      </div>
    </div>

    <div className="flex items-center gap-2">
      {/* כפתור הורדה: מופיע רק אם אין גרסה מזוהה בכלל */}
      {!currentRunnerVersion && (
        <a href={INSTALLER_URL} className="bg-white text-blue-600 px-4 py-2 text-sm font-bold rounded-lg hover:bg-blue-50 shadow-md">
          הורד התקנה ראשונה
        </a>
      )}

      {/* כפתור עדכון OTA: מופיע רק אם יש גרסה חדשה ואין חסימת מערכת */}
      {isUpdateAvailable && isAutoEnabledByFlag && (
        <Button
          text="עדכן עכשיו"
          className="bg-white text-orange-600 hover:bg-orange-50 px-4 py-2 text-sm font-bold rounded-lg shadow-md"
          onClick={handleTriggerUpdate}
          disabled={isStartingAuto}
        />
      )}

      {/* הכפתור הרגיל: מנוטרל אם יש חסימת מערכת (autoDownloadEnabled: false ב-Firestore) */}
      {canStartAuto && !isUpdateAvailable && (
        <Button
          text={isStartingAuto ? "מתחיל..." : isAutoRunActive ? "משיכה בביצוע..." : "הפעל משיכה אוטומטית"}
          className={`px-4 py-2 text-sm font-bold rounded-lg transition-all ${
            isStartingAuto || isAutoRunActive || !isAutoEnabledByFlag
              ? "bg-white/20 text-white/50 cursor-not-allowed" 
              : "bg-white text-blue-600 hover:bg-blue-50 shadow-md"
          }`}
          onClick={handleStartAuto}
          disabled={Boolean(isStartingAuto || isAutoRunActive || !isAutoEnabledByFlag || autoButtonDisabled)}
        />
      )}
    </div>
  </div>
)}
        {/* 📂 אזור טעינה ידנית */}
        <div className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-opacity ${!!autoRunId ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
          <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-bold text-gray-700 flex items-center gap-2 text-sm">
              <span>📂</span> טעינה ידנית (נפרעים)
            </h3>
          </div>

          <div className="p-6 space-y-4">
            <div className="max-w-md">
              <label className="block text-xs font-bold text-gray-400 mb-1 uppercase tracking-wider">3. בחרי תבנית דוח</label>
              <select
                value={templateId}
                onChange={e => setTemplateId(e.target.value)}
                className="select-input w-full h-10 border-gray-200 rounded-lg"
              >
                <option value="">-- בחרי דוח ספציפי --</option>
                {filteredTemplates.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.Name || opt.type}</option>
                ))}
              </select>
            </div>
       {/* Dropzone משופר עם תמיכה בגרירה */}
<div 
  className={`border-2 border-dashed rounded-2xl transition-all flex flex-col items-center justify-center gap-2 ${
    templateId ? 'border-blue-300 bg-blue-50/20 hover:border-blue-400 hover:bg-blue-50 cursor-pointer' : 'border-gray-100 opacity-40 cursor-not-allowed'
  } ${selectedFileName ? 'p-4' : 'p-8'}`} 
  
  onClick={() => templateId && !existingRunIds.length && fileInputRef.current?.click()}

  // --- תוספת עבור הגרירה (Drag & Drop) ---
  onDragOver={(e) => {
    e.preventDefault(); // מונע מהדפדפן לפתוח את הקובץ
    e.stopPropagation();
  }}
  onDragEnter={(e) => {
    e.preventDefault();
    e.stopPropagation();
  }}
  onDrop={(e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // בודקים שיש תבנית נבחרת ושיש קבצים בגרירה
    if (templateId && e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFiles = e.dataTransfer.files;
      // שליחה לפונקציית הטיפול בקובץ הקיימת שלך
      handleFileUpload({ target: { files: droppedFiles } } as any);
    }
  }}
  // ---------------------------------------
>
  {!selectedFileName ? (
    <>
      <div className="text-3xl opacity-50">📄</div>
      <div className="text-sm font-bold text-gray-600">לחצי לבחירת קובץ או גררי לכאן</div>
    </>
  ) : (
    <div className="flex items-center gap-4 bg-white p-3 px-6 rounded-xl shadow-sm border border-blue-100 animate-in zoom-in-95">
      <div className="text-xl text-green-500">✅</div>
      <div className="text-right">
        <div className="text-blue-700 font-bold text-sm leading-tight">{selectedFileName}</div>
        <div className="text-[10px] text-blue-400 font-medium">הקובץ מוכן לטעינה</div>
      </div>
    </div>
  )}
</div>
  <div className="flex gap-3 justify-start items-center">
              <Button
                text={isLoading ? "מעבד..." : "אשר טעינה"}
                type="primary"
                className="px-8 h-10 text-sm font-bold rounded-lg"
                onClick={handleImport}
                disabled={Boolean(!standardizedRows.length || isLoading || existingRunIds.length > 0)}
              />
              <Button text="נקה" type="secondary" className="px-4 h-10 text-sm rounded-lg" onClick={handleClearSelections} />
            </div>
            {existingRunIds.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-red-800 text-xs flex items-center justify-between animate-shake">
                <div className="flex items-center gap-2">
                  <span>⚠️</span>
                  <span>נמצאה טעינה קיימת לחודש זה.</span>
                </div>
                <button onClick={() => setShowConfirmDelete(true)} className="text-red-700 underline font-black">מחק טעינה קודמת</button>
              </div>
            )}
          </div>
        </div>
     {/* תצוגה מקדימה לאחר מיפוי - עיצוב מותאם לשפת המערכת */}
{standardizedRows.length > 0 && (
  <div className="mt-8 bg-white rounded-2xl border border-blue-100 shadow-xl overflow-hidden animate-in slide-in-from-bottom-6 duration-500">
    {/* כותרת הטבלה בכחול מותאם */}
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
            {Object.entries(mapping).map(([he]) => (
              <th key={he} className="px-4 py-3 font-black uppercase tracking-tight border-l border-blue-100/50 last:border-l-0">
                {he}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {standardizedRows.slice(0, 10).map((row, i) => (
            <tr key={i} className="hover:bg-blue-50/30 transition-colors group">
              {Object.entries(mapping).map(([, en]) => (
                <td key={en} className="px-4 py-2.5 text-gray-700 font-medium group-hover:text-blue-800">
                  {String(row[en] ?? '')}
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
        {/* תצוגת סטטוס ריצה אוטומטית */}
  {autoRunId && (
  <div className="mt-4 animate-in slide-in-from-bottom-4 duration-500">
    <div className="bg-white border border-blue-100 rounded-xl p-4 shadow-sm relative">
      
      {/* כפתור X קטן בפינה (אופציונלי) לניקוי הסטטוס ידנית */}
      {!isAutoRunActive && (
        <button 
          onClick={() => setAutoRunId("")}
          className="absolute top-2 left-2 text-gray-300 hover:text-gray-500 text-xs font-bold transition-colors"
          title="נקה סטטוס"
        >
          ✖
        </button>
      )}

 <PortalRunStatus 
  db={db} 
  runId={autoRunId} 
  onFinished={(status) => {
    // 🛡️ Guard: אם הריצה כבר לא מסומנת כפעילה, סימן שכבר שלחנו Toast ושיחררנו את הכפתור
    if (!isAutoRunActive) return; 
    // 🔓 משחררים את הכפתור בבאנר (זה יהפוך את isAutoRunActive ל-false)
    setIsAutoRunActive(false);
    // כעת נשלח את ה-Toast המתאים פעם אחת בלבד
    if (status === 'skipped') {
      addToast("error", "⏭️ המשיכה דולגה (כבר קיים במערכת)");
    } else if (status === 'done') {
      addToast("success", "✅ המשיכה האוטומטית הושלמה בהצלחה!");
    } else if (status === 'failed') {
      addToast("error", "ℹ️ הריצה בוטלה והחסימה שוחררה.");
    }
  }} 
/>
    </div>
  </div>
)}
      </div>
    ) : (
      <div className="text-center p-20 bg-gray-50 rounded-3xl border-2 border-dashed border-gray-100 flex flex-col items-center gap-4">
        <div className="text-5xl opacity-20">🏢</div>
        <p className="text-gray-400 font-bold italic text-lg">אנא בחרי חברה כדי להציג את אפשרויות הטעינה</p>
      </div>
    )}

    {/* מודלים של מערכת */}
    <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.zip" onChange={handleFileUpload} className="hidden" />
    {/* ✅ חשוב: מודאל OTP שחייב להיות נוכח */}
    {autoRunId && <PortalRunOtpModal runId={autoRunId} />}
    {showConfirmDelete && (
      <DialogNotification
        type="warning"
        title="מחיקת טעינה קיימת"
        message="האם למחוק את כל נתוני הטעינה הקודמת עבור סוכן/חברה/תבנית?"
        onConfirm={handleDeleteExisting}
        onCancel={() => setShowConfirmDelete(false)}
      />
    )}
    {/* --- מודאל התראה על חוסר התאמה בתבנית --- */}
{showTemplateMismatch && (
  <DialogNotification
    type="warning"
    title="התבנית לא מתאימה לקובץ"
    message={
      <>
        <p>העמודות שמצאנו בקובץ לא תואמות להגדרות התבנית שבחרת.</p>
        <p className="mt-2 text-sm text-gray-500">ודאי שבחרת את התבנית הנכונה או שהקובץ הופק בפורמט הנכון.</p>
      </>
    }
    onConfirm={() => setShowTemplateMismatch(false)}
    onCancel={() => setShowTemplateMismatch(false)}
    confirmText="הבנתי"
    hideCancel={true}
  />
)}
{/* מודאל שגיאה כללי (משמש להודעת ה-ZVIRA של מנורה) */}
{errorDialog && (
  <DialogNotification
    type="warning"
    title={errorDialog.title}
    // התיקון כאן: הוספת Fallback כדי לרצות את TypeScript
    message={errorDialog.message ?? ""} 
    onConfirm={() => setErrorDialog(null)}
    onCancel={() => setErrorDialog(null)}
    hideCancel
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
 {isLoading && (
  <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-[9999] flex items-center justify-center">
    <div className="text-center p-8 bg-white rounded-2xl shadow-2xl border border-blue-50 w-80">
      <div className="relative mb-6">
        {/* ספינר */}
        <div className="w-20 h-20 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mx-auto"></div>
        {/* מספר האחוזים במרכז הספינר */}
        <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-blue-700">
          {importProgress}%
        </div>
      </div>

      <h3 className="text-xl font-bold text-gray-800 mb-2">מעבד נתונים...</h3>
      
      {/* פס התקדמות ויזואלי */}
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
          onClose={() => setToasts(prev => prev.filter(x => x.id !== t.id))} 
        />
      ))}
    </div>
    {zipChooser && (
      <DialogNotification
        type="info"
        title="נמצאו מספר קבצים ב-ZIP"
        message={
          <div className="text-right">
            <p className="mb-3 text-sm">בחרי את הקובץ שברצונך לטעון:</p>
            <select
              className="w-full p-2 border rounded-lg text-sm font-sans"
              value={selectedZipEntry}
              onChange={(e) => setSelectedZipEntry(e.target.value)}
            >
              {zipChooser.entryNames.map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        }
        onConfirm={() => processChosenZipEntry()}
        onCancel={() => { 
            setZipChooser(null); 
            setSelectedZipEntry(''); 
            setSelectedFileName('');
            if (fileInputRef.current) fileInputRef.current.value = ''; 
        }}
        confirmText="המשך לטעינה"
        cancelText="ביטול"
      />
    )}

    {/* מודאל OTP של האוטומציה */}
    {autoRunId && <PortalRunOtpModal runId={autoRunId} />}
    {/* מודאל אישור מחיקה */}
    {showConfirmDelete && (
      <DialogNotification
        type="warning"
        title="מחיקת טעינה קיימת"
        message="האם למחוק את כל נתוני הטעינה הקודמת עבור סוכן/חברה/תבנית?"
        onConfirm={handleDeleteExisting}
        onCancel={() => setShowConfirmDelete(false)}
      />
    )}
  </div>
);
};

export default ExcelCommissionImporter;