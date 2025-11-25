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
} from 'firebase/firestore';
import { Button } from '@/components/Button/Button';
import DialogNotification from '@/components/DialogNotification';
import './ExcelCommissionImporter.css';
import { writeBatch } from 'firebase/firestore';
import Link from 'next/link';
import { useToast } from "@/hooks/useToast";
import { add } from "date-fns";
import {ToastNotification} from '@/components/ToastNotification'

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
  commissionIncludesVAT?: boolean; // האם "עמלה" בקובץ כוללת מע"מ
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

  const VAT_DEFAULT = 0.17;

  /* ==============================
     Helpers
  ============================== */
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

    // console.groupCollapsed(`[IMPORT DEBUG] ${ctx}`);
    // console.log('Expected (raw):', expectedRaw);
    // console.log('Found    (raw):', foundRaw);
    // console.log('Expected (norm):', expected);
    // console.log('Found    (norm):', found);
    // console.log('Matched:', matched);
    // console.log('Missing:', missing);
    // console.log('Coverage:', Math.round(coverage * 100) + '%');
    // console.groupEnd();
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
          companyName,
          companyId,
          type: data.type || '',
          Name: data.Name || '',
          automationClass: data.automationClass || '',
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
      if (!templateId) { setMapping({}); return; }
      const existsInActive = templateOptions.some(t => t.id === templateId);
      if (!existsInActive) { setMapping({}); return; }

      const ref = doc(db, 'commissionTemplates', templateId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        setMapping(data.fields || {});
      } else {
        setMapping({});
      }
    };
    fetchTemplateMapping();
  }, [templateId, templateOptions]);

  /* ==============================
     Derived data
  ============================== */
  const uniqueCompanies = Array.from(
    new Map(templateOptions.map(t => [t.companyId, { id: t.companyId, name: t.companyName }])).values()
  );
  const filteredTemplates = templateOptions.filter(t => t.companyId === selectedCompanyId);
  const selectedCompanyName = React.useMemo(
    () => uniqueCompanies.find(c => c.id === selectedCompanyId)?.name || '',
    [selectedCompanyId, uniqueCompanies]
  );

  /* ==============================
     Parsing helpers
  ============================== */
  const parseHebrewMonth = (value: any, templateId?: string): string => {
    if (!value) return '';

    const monthMap: Record<string, string> = {
      'ינו': '01','פבר': '02','מרץ': '03','אפר': '04','מאי': '05','יונ': '06',
      'יול': '07','אוג': '08','ספט': '09','אוק': '10','נוב': '11','דצמ': '12'
    };

    if (typeof value === 'number') {
      const d = XLSX.SSF.parse_date_code(value);
      if (d) return `${d.y}-${String(d.m).padStart(2,'0')}`;
    }

    if (value instanceof Date) {
      return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}`;
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
    const qy = query(
      collection(db, 'externalCommissions'),
      where('agentId', '==', agentId),
      where('templateId', '==', templateId),
      where('reportMonth', '==', reportMonth),
      where('companyId', '==', companyId)
    );
    const snapshot = await getDocs(qy);
    setExistingDocs(snapshot.docs);
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

  const handleDeleteExisting = async () => {
    setShowConfirmDelete(false);

    const agentId   = selectedAgentId!;
    const tmplId    = templateId!;
    const companyId = selectedCompanyId!;

    const monthFromRows =
      standardizedRows?.[0]?.reportMonth
        ? String(standardizedRows[0].reportMonth)
        : '';
    const monthFromExisting =
      existingDocs?.[0] && typeof existingDocs[0].data === 'function'
        ? String(existingDocs[0].data().reportMonth || '')
        : '';
    const reportMonth = (monthFromRows || monthFromExisting || '').replace(/\//g, '-');

    if (!agentId || !tmplId || !companyId || !reportMonth) {
      addToast("error", "חסר מידע למחיקה");
      return;
    }

    setIsLoading(true);
    try {
      const filters = [
        where('agentId', '==', agentId),
        where('templateId', '==', tmplId),
        where('reportMonth', '==', reportMonth),
        where('companyId', '==', companyId),
      ] as const;

      const [sumSnap, polSnap, extSnap] = await Promise.all([
        getDocs(query(collection(db, 'commissionSummaries'),       ...filters)),
        getDocs(query(collection(db, 'policyCommissionSummaries'), ...filters)),
        getDocs(query(collection(db, 'externalCommissions'),       ...filters)),
      ]);

      const toDeleteRefs = [
        ...sumSnap.docs.map(d => d.ref),
        ...polSnap.docs.map(d => d.ref),
        ...extSnap.docs.map(d => d.ref),
      ];

      if (toDeleteRefs.length === 0) {
        addToast("error", "לא נמצאו רשומות למחיקה");
        return;
      }

      await deleteRefsInChunks(toDeleteRefs);

      setExistingDocs([]);
      setStandardizedRows([]);
      setSelectedFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';

      addToast("success", "נמחקו רשומות בהצלחה");
    } catch (err) {
      // console.error(err);
      addToast("error", "שגיאה במחיקת הרשומות");
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

    return result;
  };

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

    const reader = new FileReader();
    reader.onload = async (evt) => {
      let jsonData: Record<string, any>[] = [];
      try {
        const arrayBuffer = evt.target?.result as ArrayBuffer;
        const fallbackReportMonth =
          templateId === 'mor_insurance' ? extractReportMonthFromFilename(file.name) : undefined;

        if (ext === '.zip') {
          try {
            const mod = await import('jszip');
            const JSZip: any = (mod as any).default ?? mod;
            const zip = await JSZip.loadAsync(arrayBuffer);

            const entries = zip.file(/\.xlsx$|\.xls$|\.csv$/i);
            if (entries.length === 0) throw new Error('ה-ZIP לא מכיל XLSX/XLS/CSV.');

            if (entries.length > 1) {
              const names = entries.map((f: any) => f.name);
              setZipChooser({ zip, entryNames: names, outerFileName: file.name });
              setSelectedZipEntry(names[0]);
              setIsLoading(false);
              return;
            }

            const entry = entries[0];
            if (/\.csv$/i.test(entry.name)) {
              const inner = await entry.async('uint8array');
              jsonData = readCsv(inner);

              if (!mapping || Object.keys(mapping).length === 0) { setShowTemplateMismatch(true); setIsLoading(false); return; }
              const expectedRaw = Object.keys(mapping);
              const foundRaw = Object.keys(jsonData[0] || {});
              logHeadersDebug('CSV headers', expectedRaw, foundRaw);
              const expected = expectedRaw.map(normalizeHeader);
              const found    = foundRaw.map(normalizeHeader);
              const coverage = expected.length ? (expected.filter(h => found.includes(h)).length / expected.length) : 1;
              if (coverage < 0.5) { setShowTemplateMismatch(true); setIsLoading(false); return; }

            } else {
              const inner = await entry.async('arraybuffer');
              let wb: XLSX.WorkBook;
              try { wb = XLSX.read(inner, { type: 'array' }); }
              catch (err: any) {
                const msg = String(err?.message || err || '');
                throw new Error(/zip/i.test(msg) ? 'ZIP בתוך ZIP. חלצי ידנית.' : 'קובץ אקסל לא נקרא.');
              }

              let wsname = wb.SheetNames[0];
              let headerRowIndex = 0;

              if (templateId === 'menura_insurance') {
                const foundSheet = wb.SheetNames.find(name => name.includes('דוח עמלות'));
                if (foundSheet) { wsname = foundSheet; headerRowIndex = 29; }
                else { setErrorDialog({ title: 'לשונית לא נמצאה', message: <>לא נמצאה לשונית בשם <b>דוח עמלות</b>.</> }); setIsLoading(false); return; }
              }
              const ws = wb.Sheets[wsname];

              if (templateId !== 'menura_insurance') {
                const expectedHeaders = Object.keys(mapping);
                headerRowIndex = findHeaderRowIndex(ws, expectedHeaders);
              }

              if (!mapping || Object.keys(mapping).length === 0) { setShowTemplateMismatch(true); setIsLoading(false); return; }

              const expectedExcelColumnsRaw = Object.keys(mapping);
              const foundHeadersRaw = headersAtRow(ws, headerRowIndex);

              const ok = checkCoverageOrShowMismatch(
                expectedExcelColumnsRaw,
                foundHeadersRaw,
                () => { setShowTemplateMismatch(true); setIsLoading(false); },
                'XLSX headers'
              );
              if (!ok) return;

              jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
                defval: "",
                range: headerRowIndex,
              });
              
              // ⚙️ נרמול שמות עמודות – כמו ב-CSV
              if (jsonData.length) {
                jsonData = jsonData.map((row) => {
                  const fixed: any = {};
                  for (const [k, v] of Object.entries(row)) {
                    fixed[normalizeHeader(k)] = v;
                  }
                  return fixed;
                });
              }
                          }

          } catch (e: any) {
            setErrorDialog({ title: 'קובץ ZIP לא נקרא', message: <>לא ניתן לפתוח את הקובץ <b>{file.name}</b>: {String(e?.message || '')}</> });
            setIsLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }

        } else if (ext === '.csv') {
          jsonData = readCsv(arrayBuffer);

          if (!mapping || Object.keys(mapping).length === 0) {
            setShowTemplateMismatch(true); setIsLoading(false); return;
          }

          const expectedRaw = Object.keys(mapping);
          const foundRaw    = Object.keys(jsonData[0] || {});
          logHeadersDebug('CSV headers', expectedRaw, foundRaw);

          const expected = expectedRaw.map(normalizeHeader);
          const found    = foundRaw.map(normalizeHeader);
          const coverage = expected.length ? (expected.filter(h => found.includes(h)).length / expected.length) : 1;

          if (coverage < 0.5) {
            setShowTemplateMismatch(true); setIsLoading(false); return;
          }

        } else {
          let wb: XLSX.WorkBook;
          try { wb = XLSX.read(arrayBuffer, { type: "array" }); }
          catch (err: any) {
            const msg = String(err?.message || err || '');
            setErrorDialog({
              title: 'שגיאה בקריאת קובץ',
              message: <>לא ניתן לקרוא את הקובץ <b>{file.name}</b>.<br />{ /zip/i.test(msg) ? 'נראה שזה ZIP. חלצי ממנו קובץ XLSX/CSV.' : 'ודאי שהקובץ XLSX/CSV תקין.' }</>,
            });
            setIsLoading(false);
            setSelectedFileName('');
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }

          let wsname = wb.SheetNames[0];
          let headerRowIndex = 0;

          if (templateId === 'menura_insurance') {
            const foundSheet = wb.SheetNames.find(name => name.includes('דוח עמלות'));
            if (foundSheet) { wsname = foundSheet; headerRowIndex = 29; }
            else { setErrorDialog({ title: 'לשונית לא נמצאה', message: <>לא נמצאה לשונית בשם <b>דוח עמלות</b>.</> }); setIsLoading(false); return; }
          }
          const ws = wb.Sheets[wsname];

          if (templateId !== 'menura_insurance') {
            const expectedHeaders = Object.keys(mapping);
            headerRowIndex = findHeaderRowIndex(ws, expectedHeaders);
          }

          if (!mapping || Object.keys(mapping).length === 0) { setShowTemplateMismatch(true); setIsLoading(false); return; }

          const expectedExcelColumnsRaw = Object.keys(mapping);
          const foundHeadersRaw = headersAtRow(ws, headerRowIndex);

          const ok = checkCoverageOrShowMismatch(
            expectedExcelColumnsRaw,
            foundHeadersRaw,
            () => { setShowTemplateMismatch(true); setIsLoading(false); },
            'XLSX headers'
          );
          if (!ok) return;

          jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
            defval: "",
            range: headerRowIndex,
          });
          
          // ⚙️ נרמול שמות עמודות – כמו ב-CSV
          if (jsonData.length) {
            jsonData = jsonData.map((row) => {
              const fixed: any = {};
              for (const [k, v] of Object.entries(row)) {
                fixed[normalizeHeader(k)] = v;
              }
              return fixed;
            });
          }
                  }

        if (jsonData.length === 0) { setIsLoading(false); alert('⚠️ הקובץ לא מכיל שורות.'); return; }

        // --- סטנדרטיזציה ---
        const agentCodeColumn = Object.entries(mapping).find(([, field]) => field === 'agentCode')?.[0];

        const standardized = jsonData
          .filter((row) => {
            const agentCodeVal = agentCodeColumn ? getCell(row, agentCodeColumn) : null;
            return agentCodeVal && agentCodeVal.toString().trim() !== '';
          })
          .map((row) => standardizeRowWithMapping(row, mapping, {
              agentId: selectedAgentId,
              templateId,
              sourceFileName: file.name,
              uploadDate: serverTimestamp(),
              companyId: selectedCompanyId,
              company: selectedCompanyName,
            }, fallbackReportMonth)
          );

        setStandardizedRows(standardized);

        const reportMonth = standardized[0]?.reportMonth;
        if (reportMonth) await checkExistingData(selectedAgentId, templateId, reportMonth, selectedCompanyId);

      } catch (err: any) {
        // console.error('File parse error:', err);
        setErrorDialog({
          title: 'שגיאת עיבוד קובץ',
          message: <>אירעה שגיאה בעת עיבוד הקובץ <b>{file.name}</b>.</>,
        });
      } finally {
        setIsLoading(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const processChosenZipEntry = async () => {
    if (!zipChooser || !selectedZipEntry) { setZipChooser(null); return; }

    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    setIsLoading(true);
    try {
      const { zip } = zipChooser;
      let entry: any = zip.file(selectedZipEntry);
      if (Array.isArray(entry)) entry = entry[0];

      if (!entry) {
        const alt = zip.file(new RegExp(`${escapeRegExp(selectedZipEntry)}$`));
        entry = Array.isArray(alt) ? alt[0] : alt;
      }
      if (!entry || entry.dir) throw new Error('הקובץ שנבחר לא נמצא (או שהוא תיקייה) בתוך ה-ZIP.');

      const fallbackReportMonth =
        templateId === 'mor_insurance' ? extractReportMonthFromFilename(selectedZipEntry) : undefined;

      let jsonData: Record<string, any>[] = [];

      const innerExt = getExt(selectedZipEntry);
      if (innerExt === '.csv') {
        const inner = await entry.async('uint8array');
        jsonData = readCsv(inner);

        if (!mapping || Object.keys(mapping).length === 0) { setShowTemplateMismatch(true); return; }
        const expectedRaw = Object.keys(mapping);
        const foundRaw = Object.keys(jsonData[0] || {});
        logHeadersDebug('CSV headers (ZIP inner)', expectedRaw, foundRaw);
        const expected = expectedRaw.map(normalizeHeader);
        const found    = foundRaw.map(normalizeHeader);
        const coverage = expected.length ? (expected.filter(h => found.includes(h)).length / expected.length) : 1;
        if (coverage < 0.5) { setShowTemplateMismatch(true); return; }

      } else {
        const inner = await entry.async('arraybuffer');
        const wb = XLSX.read(inner, { type: 'array' });

        let wsname = wb.SheetNames[0];
        let headerRowIndex = 0;

        if (templateId === 'menura_insurance') {
          const foundSheet = wb.SheetNames.find((name: string) => name.includes('דוח עמלות'));
          if (foundSheet) { wsname = foundSheet; headerRowIndex = 29; }
          else { setErrorDialog({ title: 'לשונית לא נמצאה', message: <>לא נמצאה לשונית בשם <b>דוח עמלות</b>.</> }); return; }
        }

        const ws = wb.Sheets[wsname];

        if (templateId !== 'menura_insurance') {
          const expectedHeaders = Object.keys(mapping);
          headerRowIndex = findHeaderRowIndex(ws, expectedHeaders);
        }

        if (!mapping || Object.keys(mapping).length === 0) { setShowTemplateMismatch(true); return; }

        const expectedExcelColumnsRaw = Object.keys(mapping);
        const foundHeadersRaw = headersAtRow(ws, headerRowIndex);

        const ok = checkCoverageOrShowMismatch(
          expectedExcelColumnsRaw,
          foundHeadersRaw,
          () => setShowTemplateMismatch(true),
          'XLSX headers (ZIP inner)'
        );
        if (!ok) return;

        jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
          defval: "",
          range: headerRowIndex,
        });
        
        // ⚙️ נרמול שמות עמודות – כמו ב-CSV
        if (jsonData.length) {
          jsonData = jsonData.map((row) => {
            const fixed: any = {};
            for (const [k, v] of Object.entries(row)) {
              fixed[normalizeHeader(k)] = v;
            }
            return fixed;
          });
        }
              }

      if (!jsonData.length) { alert('⚠️ לא נמצאו שורות נתונים בקובץ.'); return; }

      const agentCodeColumn = Object.entries(mapping).find(([, field]) => field === 'agentCode')?.[0];

      const standardized = jsonData
        .filter((row) => {
          const agentCodeVal = agentCodeColumn ? getCell(row, agentCodeColumn) : null;
          return agentCodeVal && agentCodeVal.toString().trim() !== '';
        })
        .map((row) => standardizeRowWithMapping(row, mapping, {
            agentId: selectedAgentId,
            templateId,
            sourceFileName: selectedZipEntry,
            uploadDate: serverTimestamp(),
            companyId: selectedCompanyId,
            company: selectedCompanyName,
          }, fallbackReportMonth)
        );

      setStandardizedRows(standardized);

      const reportMonth = standardized[0]?.reportMonth;
      if (reportMonth) await checkExistingData(selectedAgentId, templateId, reportMonth, selectedCompanyId);

    } catch (e: any) {
      // console.error(e);
      setErrorDialog({ title: 'שגיאת עיבוד קובץ', message: String(e?.message || 'שגיאה לא ידועה') });
    } finally {
      setZipChooser(null);
      setSelectedZipEntry('');
      setIsLoading(false);
    }
  };

  /* ==============================
     Write helpers
  ============================== */
  async function writeExternalRowsInChunks(rows: any[]) {
    const CHUNK = 450;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const r of slice) {
        const ref = doc(collection(db, 'externalCommissions'));
        batch.set(ref, r);
      }
      await batch.commit();
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
    }
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
      await writePolicySummariesInBatch(Array.from(policyMap.values()) as any);


  // ---- יצירת דוקומנט ריצה לניהול טעינות ----
  const firstRow = rowsPrepared[0];
  const totalRows = rowsPrepared.length;
  const commissionSummariesCount = summariesMap.size;
  const policySummariesCount = policyMap.size;

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
    reportMonth: firstRow?.reportMonth || '',
    externalCount: totalRows,
    commissionSummariesCount,
    policySummariesCount,
  });

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
      const mojibakePenalty = (t.match(/ן»¿|�/g) || []).length * 50;
      const weirdQuotes = (t.match(/[׳״´`]/g) || []).length * 2;
      return heb - mojibakePenalty - weirdQuotes;
    };

    return score(utf8) >= score(win) ? utf8 : win;
  }

  /* ==============================
     Render
  ============================== */
  return (
    <div className="p-6 max-w-4xl mx-auto text-right">
      <h2 className="text-2xl font-bold mb-4">טעינת קובץ עמלות</h2>
      <p className="text-gray-600 mb-6">ייבוא עמלות ותנועות פוליסה לפי תבנית – כולל פרמיה ומוצר.</p>

      {/* בחירת סוכן */}
      <div className="mb-4">
        {isLoading && (
          <div className="fixed inset-0 bg-white bg-opacity-70 z-50 flex items-center justify-center">
            <div className="text-center">
              <div className="loader mb-4"></div>
              <p className="text-lg font-semibold text-gray-700">⏳ טוען נתונים... אנא המתן</p>
            </div>
          </div>
        )}

        <label className="block font-semibold mb-1">בחר סוכן:</label>
        <select value={selectedAgentId} onChange={handleAgentChange} className="select-input w-full">
          {detail?.role === "admin" && <option value="">בחר סוכן</option>}
          {agents.map(agent => (
            <option key={agent.id} value={agent.id}>{agent.name}</option>
          ))}
        </select>
      </div>

      {/* בחירת חברה */}
      <div className="mb-4">
        <label className="block font-semibold mb-1">בחר חברה:</label>
        <select
          value={selectedCompanyId}
          onChange={(e) => { setSelectedCompanyId(e.target.value); setTemplateId(''); }}
          className="select-input w-full"
        >
          <option value="">בחר חברה</option>
          {uniqueCompanies.map(company => (
            <option key={company.id} value={company.id}>{company.name}</option>
          ))}
        </select>
      </div>

      {/* בחירת תבנית */}
      {selectedCompanyId && (
        <div className="mb-4">
          <label className="block font-semibold mb-1">בחר תבנית:</label>
          <select
            value={templateId}
            onChange={e => setTemplateId(e.target.value)}
            className="select-input w-full"
          >
            <option value="">בחר תבנית</option>
            {filteredTemplates.map(opt => (
              <option key={opt.id} value={opt.id}>{opt.Name || opt.type}</option>
            ))}
          </select>
        </div>
      )}

      <div className="mb-2 text-sm">
        <Link
          href="/Help/commission-reports#top"
          target="_blank"
          className="underline hover:no-underline text-blue-600"
        >
          ❓ מדריך דוחות עמלות – איך להפיק ולייצא מכל חברה
        </Link>
      </div>

      {/* בחירת קובץ */}
      <div className="mb-4">
        <label className="block font-semibold mb-1">בחר קובץ:</label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv,.zip"
          onChange={handleFileUpload}
          className="hidden"
        />
        <div className="flex gap-2">
          <Button
            text="בחר קובץ"
            type="primary"
            onClick={() => { if (canChooseFile) fileInputRef.current?.click(); }}
            disabled={!canChooseFile}
          />
          <Button text="נקה בחירה" type="secondary" onClick={handleClearSelections} />
        </div>
        {selectedFileName && <p className="mt-2 text-sm text-gray-600">📁 {selectedFileName}</p>}
      </div>

      {!canChooseFile && (
        <p className="mt-2 text-sm text-gray-500">
          ⚠️ לפני בחירת קובץ יש לבחור סוכן, חברה ותבנית.
        </p>
      )}

      {/* הודעה אם הקובץ כבר קיים */}
      {existingDocs.length > 0 && (
        <div className="bg-red-100 border border-red-300 text-red-800 p-3 rounded mb-4">
          קובץ כבר נטען לסוכן ולחודש זה. יש למחוק אותו לפני טעינה נוספת.
          <Button
            text="🗑 מחק טעינה קיימת"
            type="danger"
            onClick={() => setShowConfirmDelete(true)}
            className="mt-2"
          />
        </div>
      )}

      {/* דיאלוג אישור מחיקה */}
      {showConfirmDelete && (
        <DialogNotification
          type="warning"
          title="מחיקת טעינה קיימת"
          message="האם את בטוחה שברצונך למחוק את כל הרשומות הקיימות עבור סוכן זה לחודש זה?"
          onConfirm={handleDeleteExisting}
          onCancel={() => setShowConfirmDelete(false)}
        />
      )}

      {/* תצוגה מקדימה */}
      {standardizedRows.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">תצוגה לאחר מיפוי ({standardizedRows.length} שורות)</h3>
          <div className="overflow-x-auto border">
            <table className="table-auto w-full border-collapse text-sm text-right">
              <thead>
                <tr className="bg-gray-100">
                  {Object.entries(mapping).map(([he, en]) => (
                    <th key={en} className="border px-2 py-1">{he}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {standardizedRows.slice(0, 10).map((row, i) => (
                  <tr key={i}>
                    {Object.entries(mapping).map(([he, en]) => (
                      <td key={en} className="border px-2 py-1">{row[en]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-xs text-gray-500 p-2">הצגה של 10 שורות ראשונות בלבד</div>
          </div>

          <Button
            text={isLoading ? "טוען..." : "אשר טעינה למסד הנתונים"}
            type="primary"
            onClick={handleImport}
            disabled={isLoading || existingDocs.length > 0}
            className="mt-4"
          />
        </div>
      )}

      {/* דיאלוג סיכום */}
      {showSummaryDialog && (
        <DialogNotification
          type="info"
          title="סיכום טעינה לפי מספרי סוכן"
          message={
            <div>
              {summaryByAgentCode.map((item) => (
                <div key={item.agentCode} className="mb-2">
                  <strong>מספר סוכן:</strong> {item.agentCode}<br />
                  <strong>כמות פוליסות:</strong> {item.count}<br />
                  <strong>כמות מבוטחים:</strong> {item.totalInsured}<br />
                  <strong>סך עמלות:</strong> {Number(item.totalCommission || 0).toLocaleString()} ₪<br />
                  <strong>סך פרמיות:</strong> {Number(item.totalPremium || 0).toLocaleString()} ₪
                </div>
              ))}
            </div>
          }
          onConfirm={() => setShowSummaryDialog(false)}
          onCancel={() => setShowSummaryDialog(false)}
          hideCancel={true}
        />
      )}

      {showTemplateMismatch && (
        <DialogNotification
          type="warning"
          title="התבנית לא מתאימה לקובץ"
          message={
            <>
              הדוח שנבחר לא מתאים לקובץ הנטען. נסי לבחור תבנית אחרת
              או להפיק מחדש לפי ההנחיות במדריך.
              <div className="mt-2">
                <Link
                  href="/Help/commission-reports#top"
                  target="_blank"
                  className="underline hover:no-underline text-blue-600"
                >
                  לפתיחת מדריך דוחות העמלות
                </Link>
              </div>
            </>
          }
          onConfirm={() => setShowTemplateMismatch(false)}
          onCancel={() => setShowTemplateMismatch(false)}
          hideCancel={true}
        />
      )}

      {errorDialog && (
        <DialogNotification
          type="warning"
          title={errorDialog.title}
          message={errorDialog.message ?? ''}
          onConfirm={() => setErrorDialog(null)}
          onCancel={() => setErrorDialog(null)}
          hideCancel
        />
      )}

      {/* בחירה מתוך ZIP */}
      {zipChooser && (
        <DialogNotification
          type="info"
          title="בחרי קובץ מתוך ה-ZIP"
          message={
            <>
              נמצאו כמה קבצים רלוונטיים בתוך ה-ZIP. בחרי אחד:
              <div className="mt-3">
                <select
                  className="select-input w-full"
                  value={selectedZipEntry}
                  onChange={(e) => setSelectedZipEntry(e.target.value)}
                >
                  {zipChooser.entryNames.map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
            </>
          }
          onConfirm={() => processChosenZipEntry()}
          onCancel={() => { setZipChooser(null); setSelectedZipEntry(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
          hideCancel={false}
          confirmText="המשך"
          cancelText="ביטול"
        />
      )}

      {toasts.length > 0  && toasts.map((toast) => (
        <ToastNotification
          key={toast.id}
          type={toast.type}
          className={toast.isHiding ? "hide" : ""}
          message={toast.message}
          onClose={() => setToasts((prevToasts) => prevToasts.filter((t) => t.id !== toast.id))}
        />
      ))}
    </div>
  );
};

export default ExcelCommissionImporter;
