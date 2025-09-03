// ExcelCommissionImporter.tsx - כולל תמיכה ב-ZIP + בחירה, חישובי עמלות מיוחדים, ומניעת קריסות

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
} from 'firebase/firestore';
import { Button } from '@/components/Button/Button';
import DialogNotification from '@/components/DialogNotification';
import './ExcelCommissionImporter.css';
import { writeBatch } from 'firebase/firestore';

// ===============================
// Types
// ===============================
interface CommissionTemplateOption {
  id: string;
  companyName: string;
  type: string;
  companyId: string;
  Name?: string;
  automationClass?: string;
}

interface CommissionSummary {
  agentId: string;
  agentCode: string;
  reportMonth: string;
  templateId: string;
  companyId: string;
  company: string;
  totalCommissionAmount: number;
}

// ===============================
// Component
// ===============================
const ExcelCommissionImporter: React.FC = () => {
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  const [templateId, setTemplateId] = useState('');
  const [templateOptions, setTemplateOptions] = useState<CommissionTemplateOption[]>([]);
  const selectedTemplate = templateOptions.find(opt => opt.id === templateId);

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

  // בחירה מתוך ZIP
  const [zipChooser, setZipChooser] = useState<null | {
    zip: any;
    entryNames: string[];
    outerFileName: string;
  }>(null);
  const [selectedZipEntry, setSelectedZipEntry] = useState<string>('');

  // ===============================
  // Helpers (אחידים פעם אחת)
  // ===============================
  const roundTo2 = (num: number) => Math.round(num * 100) / 100;

  const getExt = (n: string) => n.slice(n.lastIndexOf('.')).toLowerCase();

  const readCsv = (buf: ArrayBuffer | Uint8Array): Record<string, any>[] => {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const text = new TextDecoder('windows-1255').decode(u8);
    const wb = XLSX.read(text, { type: 'string' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
  };

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

  // חישובים מיוחדים לפי תבנית
  const commissionOverrides: Record<string, (row: any) => number> = {
    ayalon_insurance: (row) =>
      toNum(pick(row, ['סך עמלת סוכן'])) + toNum(pick(row, ['סך דמי גביה', 'סך דמי גבייה'])),

    menura_new_nifraim: (row) =>
      toNum(pick(row, ['סוכן-סכום עמלה', 'סוכן - סכום עמלה'])) +
      toNum(pick(row, ['סוכן-דמי גביה', 'סוכן - דמי גביה', 'סוכן-דמי גבייה', 'סוכן - דמי גבייה'])),
  };

  // Policy/customer helpers
  const chunk = <T,>(arr: T[], size: number) =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

  const normalizePolicyKey = (v: any) => String(v ?? '').trim().replace(/\s+/g, '');
  const normalizeCustomerId = (v: any): string => {
    const digits = String(v ?? '').replace(/\D/g, '');
    return digits ? digits.padStart(9, '0') : '';
  };

// ספרות בלבד + ריפוד לשמאל ל-9 + חיתוך ל-9 => בדיוק 9 ספרות
const toPadded9 = (v: any): string => {
  const digits = String(v ?? '').replace(/\D/g, '');
  return digits ? digits.padStart(9, '0').slice(-9) : '';
};


  // ===============================
  // Effects
  // ===============================
  useEffect(() => {
    document.body.style.overflow = isLoading ? 'hidden' : '';
  }, [isLoading]);

  useEffect(() => {
    setShowConfirmDelete(false);
  }, []);

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
        });
      }

      setTemplateOptions(templates);
      if (templates.every(t => t.id !== templateId)) {
        setTemplateId('');
        setMapping({});
      }
    };
    fetchTemplates();
  }, []); // טעינה פעם אחת

  // טעינת mapping של התבנית הנבחרת (רק אם עדיין Active)
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

  // ===============================
  // Derived data
  // ===============================
  const uniqueCompanies = Array.from(
    new Map(templateOptions.map(t => [t.companyId, { id: t.companyId, name: t.companyName }])).values()
  );

  const filteredTemplates = templateOptions.filter(t => t.companyId === selectedCompanyId);

  const selectedCompanyName = React.useMemo(
    () => uniqueCompanies.find(c => c.id === selectedCompanyId)?.name || '',
    [selectedCompanyId, uniqueCompanies]
  );

  // ===============================
  // Parsing helpers
  // ===============================
  const parseHebrewMonth = (value: any, templateId?: string): string => {
    if (!value) return '';

    const monthMap: Record<string, string> = {
      'ינו': '01', 'פבר': '02', 'מרץ': '03', 'אפר': '04', 'מאי': '05', 'יונ': '06',
      'יול': '07', 'אוג': '08', 'ספט': '09', 'אוק': '10', 'נוב': '11', 'דצמ': '12'
    };

    if (typeof value === 'number') {
      const excelDate = XLSX.SSF.parse_date_code(value);
      if (excelDate) {
        const year = excelDate.y;
        const month = excelDate.m.toString().padStart(2, '0');
        return `${year}-${month}`;
      }
    }

    if (value instanceof Date) {
      const year = value.getFullYear();
      const month = (value.getMonth() + 1).toString().padStart(2, '0');
      return `${year}-${month}`;
    }

    const str = value.toString().trim();

    let m = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
    if (m) {
      let [, _day, mm, yy] = m;
      const yyyy = yy.length === 2 ? (parseInt(yy, 10) < 50 ? `20${yy}` : `19${yy}`) : yy;
      return `${yyyy}-${mm.padStart(2, '0')}`;
    }

    if (templateId === 'menura_insurance' && /^\d{5}$/.test(str)) {
      const numeric = parseInt(str, 10);
      const excelDate = XLSX.SSF.parse_date_code(numeric);
      if (excelDate) {
        const year = excelDate.y;
        const month = excelDate.m.toString().padStart(2, '0');
        return `${year}-${month}`;
      }
    }

    let match = str.match(/([\u0590-\u05FF]{3})[- ]?(\d{2})/);
    if (!match) match = str.match(/(\d{2})[- ]?([\u0590-\u05FF]{3})/);
    if (match) {
      const [, a, b] = match;
      const [hebMonth, yearSuffix] = monthMap[a] ? [a, b] : [b, a];
      const month = monthMap[hebMonth];
      const year = '20' + yearSuffix;
      if (month) return `${year}-${month}`;
    }

    const parts: string[] | null = str.match(/\d+/g);
    if (parts && parts.length >= 2) {
      const year = parts.find((p: string) => p.length === 4);
      const month = parts.find((p: string) => p.length === 2 || p.length === 1);
      if (year && month) return `${year}-${month.padStart(2, '0')}`;
    }

    return str.replace(/\//g, '-');
  };

  // ===============================
  // Firestore helpers
  // ===============================
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

  const handleDeleteExisting = async () => {
    setShowConfirmDelete(false);
    setIsLoading(true);
    try {
      const batch = writeBatch(db);
      const summaryIds = new Set<string>();

      for (const docSnap of existingDocs) {
        const data = docSnap.data();
        const agentId: string = data.agentId || '';
        const agentCode: string = (data.agentCode || '').toString();
        const tmplId: string = data.templateId || '';
        const companyId: string = data.companyId || '';
        const sanitizedMonth: string = (data.reportMonth || '').toString().replace(/\//g, '-');
        const summaryDocId = `${agentId}_${agentCode}_${sanitizedMonth}_${tmplId}_${companyId}`;
        summaryIds.add(summaryDocId);
        batch.delete(docSnap.ref);
      }

      for (const id of summaryIds) {
        batch.delete(doc(db, 'commissionSummaries', id));
      }

      await batch.commit();

      setExistingDocs([]);
      setStandardizedRows([]);
      setSelectedFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
      alert('✅ כל הרשומות וגם הסיכומים נמחקו. כעת ניתן לטעון קובץ חדש.');
    } catch (err) {
      console.error(err);
      alert('❌ שגיאה במחיקת הנתונים או הסיכומים.');
    } finally {
      setIsLoading(false);
    }
  };

  // ===============================
  // UI actions
  // ===============================
  const handleClearSelections = () => {
    setSelectedFileName('');
    setStandardizedRows([]);
    setTemplateId('');
    setExistingDocs([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    window.location.reload();
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
          // ZIP: טוענים דינמית כדי לא לנפח bundle
          try {
            const mod = await import('jszip');
            const JSZip: any = (mod as any).default ?? mod;
            const zip = await JSZip.loadAsync(arrayBuffer);
  
            const entries = zip.file(/\.xlsx$|\.xls$|\.csv$/i);
            if (entries.length === 0) throw new Error('ה-ZIP לא מכיל XLSX/XLS/CSV.');
  
            // אם יש כמה – נציג דיאלוג בחירה ונפסיק כאן (העיבוד יבוצע ב-processChosenZipEntry)
            if (entries.length > 1) {
              const names = entries.map((f: any) => f.name);
              setZipChooser({ zip, entryNames: names, outerFileName: file.name });
              setSelectedZipEntry(names[0]);
              setIsLoading(false);
              return;
            }
  
            // ערך יחיד – נמשיך לעבד אותו כאן
            const entry = entries[0];
            if (/\.csv$/i.test(entry.name)) {
              const inner = await entry.async('uint8array');
              jsonData = readCsv(inner);
  
              if (!mapping || Object.keys(mapping).length === 0) { setShowTemplateMismatch(true); setIsLoading(false); return; }
              const expected = Object.keys(mapping);
              const found = Object.keys(jsonData[0] || {});
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
  
              const expectedExcelColumns = Object.keys(mapping);
              const foundHeaders = headersAtRow(ws, headerRowIndex);
              const intersectCount = expectedExcelColumns.filter(h => foundHeaders.includes(h)).length;
              const coverage = expectedExcelColumns.length ? (intersectCount / expectedExcelColumns.length) : 1;
              if (coverage < 0.5) { setShowTemplateMismatch(true); setIsLoading(false); return; }
  
              jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", range: headerRowIndex });
            }
  
          } catch (e: any) {
            setErrorDialog({ title: 'קובץ ZIP לא נקרא', message: <>לא ניתן לפתוח את הקובץ <b>{file.name}</b>: {String(e?.message || '')}</> });
            setIsLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }
  
        } else if (ext === '.csv') {
          // CSV רגיל
          jsonData = readCsv(arrayBuffer);
  
          if (!mapping || Object.keys(mapping).length === 0) { setShowTemplateMismatch(true); setIsLoading(false); return; }
          const expected = Object.keys(mapping);
          const found = Object.keys(jsonData[0] || {});
          const coverage = expected.length ? (expected.filter(h => found.includes(h)).length / expected.length) : 1;
          if (coverage < 0.5) { setShowTemplateMismatch(true); setIsLoading(false); return; }
  
        } else {
          // XLS/XLSX רגיל
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
  
          const expectedExcelColumns = Object.keys(mapping);
          const foundHeaders = headersAtRow(ws, headerRowIndex);
          const intersectCount = expectedExcelColumns.filter(h => foundHeaders.includes(h)).length;
          const coverage = expectedExcelColumns.length ? (intersectCount / expectedExcelColumns.length) : 1;
          if (coverage < 0.5) { setShowTemplateMismatch(true); setIsLoading(false); return; }
  
          jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", range: headerRowIndex });
        }
  
        if (jsonData.length === 0) { setIsLoading(false); alert('⚠️ הקובץ לא מכיל שורות.'); return; }
  
        // --- סטנדרטיזציה ---
        const agentCodeColumn = Object.entries(mapping).find(([, field]) => field === 'agentCode')?.[0];
  
        const standardized = jsonData
          .filter((row) => {
            const agentCodeVal = agentCodeColumn ? (row as any)[agentCodeColumn] : null;
            return agentCodeVal && agentCodeVal.toString().trim() !== '';
          })
          .map((row) => {
            const result: any = {
              agentId: selectedAgentId,
              templateId,
              sourceFileName: file.name,
              uploadDate: serverTimestamp(),
              companyId: selectedCompanyId,
              company: selectedCompanyName,
            };
  
            for (const [excelCol, systemField] of Object.entries(mapping)) {
              const value = (row as any)[excelCol];
  
              if (systemField === 'validMonth' || systemField === 'reportMonth') {
                let parsed = parseHebrewMonth(value, templateId);
                if (!parsed && systemField === 'reportMonth' && fallbackReportMonth) {
                  parsed = fallbackReportMonth;
                }
                result[systemField] = parsed || value;
  
              } else if (systemField === 'commissionAmount') {
                const override = commissionOverrides[templateId];
                result[systemField] = override ? roundTo2(override(row)) : toNum(value);
  
              } else if (systemField === 'customerId' || systemField === 'IDCustomer') {
                const raw = String(value ?? '').trim();
                const padded9 = toPadded9(value);
              
                // שמרי את שניהם:
                result.customerIdRaw = raw;      // כפי שבקובץ
                result.customerId = padded9;     // הקנוני (9 ספרות) -- אם את כבר משתמשת בו במקומות אחרים
                // result.customerIdPadded = padded9; // לשימוש עקבי בלינקים/שאילתות
              } else if (systemField === 'policyNumber') {
                result[systemField] = String(value ?? '').trim();
  
              } else {
                result[systemField] = value;
              }
            }
            return result;
          });
  
        setStandardizedRows(standardized);
  
        const reportMonth = standardized[0]?.reportMonth;
        if (reportMonth) await checkExistingData(selectedAgentId, templateId, reportMonth, selectedCompanyId);
  
      } catch (err: any) {
        console.error('File parse error:', err);
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
  
    // helper מקומי לחיפוש חלופי בשם עם RegExp
    const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
    setIsLoading(true);
    try {
      const { zip } = zipChooser;
  
      // ✅ אם name הוא string: נקבל אובייקט יחיד או null (לא מערך)
      let entry: any = zip.file(selectedZipEntry);
      // אם משום מה חזר מערך (אמור לקרות רק עם RegExp) — קחי את הראשון
      if (Array.isArray(entry)) entry = entry[0];
  
      // 🔎 ניסיון חלופי: מציאת קובץ ע"פ סוף נתיב/שם (אם ה-ZIP מכיל תיקיות)
      if (!entry) {
        const alt = zip.file(new RegExp(`${escapeRegExp(selectedZipEntry)}$`));
        entry = Array.isArray(alt) ? alt[0] : alt; // alt יכול להיות מערך או יחיד
      }
  
      // ❗ אם עדיין אין, או שזה בכלל תיקייה — שגיאה ידידותית
      if (!entry || entry.dir) {
        throw new Error('הקובץ שנבחר לא נמצא (או שהוא תיקייה) בתוך ה-ZIP.');
      }
  
      // fallback לחודש משם הקובץ הפנימי (למור)
      const fallbackReportMonth =
        templateId === 'mor_insurance'
          ? extractReportMonthFromFilename(selectedZipEntry)
          : undefined;
  
      let jsonData: Record<string, any>[] = [];
  
      // קריאה לפי הסיומת של הקובץ הפנימי
      const innerExt = getExt(selectedZipEntry);
  
      if (innerExt === '.csv') {
        const inner = await entry.async('uint8array');
        jsonData = readCsv(inner);
  
        // בדיקות מיפוי בסיסיות
        if (!mapping || Object.keys(mapping).length === 0) { setShowTemplateMismatch(true); return; }
        const expected = Object.keys(mapping);
        const found = Object.keys(jsonData[0] || {});
        const coverage = expected.length ? (expected.filter(h => found.includes(h)).length / expected.length) : 1;
        if (coverage < 0.5) { setShowTemplateMismatch(true); return; }
  
      } else {
        const inner = await entry.async('arraybuffer');
        const wb = XLSX.read(inner, { type: 'array' });
  
        let wsname = wb.SheetNames[0];
        let headerRowIndex = 0;
  
        if (templateId === 'menura_insurance') {
          const foundSheet = wb.SheetNames.find((name: string) => name.includes('דוח עמלות'));
          if (foundSheet) {
            wsname = foundSheet;
            headerRowIndex = 29; // שורה 30
          } else {
            setErrorDialog({ title: 'לשונית לא נמצאה', message: <>לא נמצאה לשונית בשם <b>דוח עמלות</b>.</> });
            return;
          }
        }
  
        const ws = wb.Sheets[wsname];
  
        if (templateId !== 'menura_insurance') {
          const expectedHeaders = Object.keys(mapping);
          headerRowIndex = findHeaderRowIndex(ws, expectedHeaders);
        }
  
        if (!mapping || Object.keys(mapping).length === 0) { setShowTemplateMismatch(true); return; }
  
        const expectedExcelColumns = Object.keys(mapping);
        const foundHeaders = headersAtRow(ws, headerRowIndex);
        const intersectCount = expectedExcelColumns.filter(h => foundHeaders.includes(h)).length;
        const coverage = expectedExcelColumns.length ? (intersectCount / expectedExcelColumns.length) : 1;
        if (coverage < 0.5) { setShowTemplateMismatch(true); return; }
  
        jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "", range: headerRowIndex });
      }
  
      if (!jsonData.length) { alert('⚠️ לא נמצאו שורות נתונים בקובץ.'); return; }
  
      // --- סטנדרטיזציה ---
      const agentCodeColumn = Object.entries(mapping).find(([, field]) => field === 'agentCode')?.[0];
  
      const standardized = jsonData
        .filter((row) => {
          const agentCodeVal = agentCodeColumn ? (row as any)[agentCodeColumn] : null;
          return agentCodeVal && agentCodeVal.toString().trim() !== '';
        })
        .map((row) => {
          const result: any = {
            agentId: selectedAgentId,
            templateId,
            sourceFileName: selectedZipEntry, // שם הקובץ מתוך ה-ZIP
            uploadDate: serverTimestamp(),
            companyId: selectedCompanyId,
            company: selectedCompanyName,
          };
  
          for (const [excelCol, systemField] of Object.entries(mapping)) {
            const value = (row as any)[excelCol];
  
            if (systemField === 'validMonth' || systemField === 'reportMonth') {
              let parsed = parseHebrewMonth(value, templateId);
              if (!parsed && systemField === 'reportMonth' && fallbackReportMonth) {
                parsed = fallbackReportMonth;
              }
              result[systemField] = parsed || value;
  
            } else if (systemField === 'commissionAmount') {
              const override = commissionOverrides[templateId];
              result[systemField] = override ? roundTo2(override(row)) : toNum(value);
  
            } else if (systemField === 'customerId' || systemField === 'IDCustomer') {
              result[systemField] = normalizeCustomerId(value);
  
            } else if (systemField === 'policyNumber') {
              result[systemField] = String(value ?? '').trim();
  
            } else {
              result[systemField] = value;
            }
          }
          return result;
        });
  
      setStandardizedRows(standardized);
  
      const reportMonth = standardized[0]?.reportMonth;
      if (reportMonth) await checkExistingData(selectedAgentId, templateId, reportMonth, selectedCompanyId);
  
    } catch (e: any) {
      console.error(e);
      setErrorDialog({ title: 'שגיאת עיבוד קובץ', message: String(e?.message || 'שגיאה לא ידועה') });
    } finally {
      setZipChooser(null);
      setSelectedZipEntry('');
      setIsLoading(false);
    }
  };
  

  // ===============================
  // Write helpers
  // ===============================
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

  // ===============================
  // Import button
  // ===============================
  const handleImport = async () => {
    if (!selectedAgentId || standardizedRows.length === 0) return;

    standardizedRows.forEach(row => {
      row.reportMonth = parseHebrewMonth(row.reportMonth, row.templateId);
      row.validMonth = parseHebrewMonth(row.validMonth, row.templateId);
    });

    setIsLoading(true);

    if (existingDocs.length > 0) {
      alert('❌ קובץ כבר קיים לחודש זה ולסוכן זה. מחק אותו קודם כדי לטעון מחדש.');
      setIsLoading(false);
      return;
    }

    try {
      const uniqueAgentCodes = new Set<string>();
      for (const row of standardizedRows) {
        if (row.agentCode) uniqueAgentCodes.add(row.agentCode.toString().trim());
      }

      const userRef = doc(db, 'users', selectedAgentId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const existingCodes: string[] = userSnap.data().agentCodes || [];
        const codesToAdd = Array.from(uniqueAgentCodes).filter(code => !existingCodes.includes(code));
        if (codesToAdd.length > 0) await updateDoc(userRef, { agentCodes: arrayUnion(...codesToAdd) });
      }

      const rowsWithLinks = await preResolveLinks(standardizedRows, selectedAgentId, selectedCompanyId);

      await writeExternalRowsInChunks(rowsWithLinks);

      const summariesMap = new Map<string, CommissionSummary>();
      for (const row of rowsWithLinks) {
        const sanitizedMonth = row.reportMonth?.toString().replace(/\//g, '-') || '';
        const key = `${row.agentId}_${row.agentCode}_${sanitizedMonth}_${row.templateId}_${row.companyId}`;
        if (!summariesMap.has(key)) {
          summariesMap.set(key, {
            agentId: row.agentId,
            agentCode: row.agentCode,
            reportMonth: row.reportMonth,
            templateId: row.templateId,
            totalCommissionAmount: 0,
            companyId: row.companyId,
            company: row.company || '',
          });
        }
        const summary = summariesMap.get(key)!;
        const commission = parseFloat(row.commissionAmount || '0');
        summary.totalCommissionAmount += isNaN(commission) ? 0 : commission;
      }

      await writeSummariesInBatch(Array.from(summariesMap.values()));

      const grouped: Record<string, { count: number; uniqueCustomers: Set<string>; totalCommission: number; }> = {};
      for (const row of rowsWithLinks) {
        const code = row.agentCode;
        if (!code) continue;
        if (!grouped[code]) grouped[code] = { count: 0, uniqueCustomers: new Set(), totalCommission: 0 };
        grouped[code].count += 1;
        if (row.customerId) grouped[code].uniqueCustomers.add(row.customerId);
        grouped[code].totalCommission += parseFloat(row.commissionAmount || '0') || 0;
      }

      const summaryArray = Object.entries(grouped).map(([agentCode, data]) => ({
        agentCode,
        count: data.count,
        totalInsured: data.uniqueCustomers.size,
        totalCommission: data.totalCommission,
      }));
      setSummaryByAgentCode(summaryArray);
      setShowSummaryDialog(true);

      setStandardizedRows([]);
      setSelectedFileName('');
      setExistingDocs([]);

    } catch (error) {
      console.error('שגיאה בעת טעינה:', error);
      alert('❌ שגיאה בעת טעינה למסד. בדוק קונסול.');
    } finally {
      setIsLoading(false);
    }
  };

  /**
 * מעשיר שורות לפני כתיבה:
 * - מוסיף policyNumberKey
 * - גוזר customerIdPadded בקנון 9 ספרות
 * - מנסה לקשר linkedSaleId לפי policyNumberKey + customerIdPadded מאינדקס policyLinkIndex
 */
  const preResolveLinks = async (
    rows: any[],
    agentId: string,
    companyId?: string
  ): Promise<any[]> => {
    // 1) מפתחות פוליסה ייחודיים
    const policyKeys = Array.from(
      new Set(
        rows.map(r => normalizePolicyKey(r.policyNumber)).filter(Boolean)
      )
    );
  
    // 2) אין מפתחות → העשרה בסיסית והחזרה
    if (policyKeys.length === 0) {
      return rows.map(r => ({
        ...r,
        policyNumberKey: normalizePolicyKey(r.policyNumber),
        // הבטחת קיום שדה קנוני (אם מסיבה כלשהי לא נוצר בשלב ה-standardize)
        customerId: toPadded9(r.customerId ?? r.customerIdRaw ?? ''),
      }));
    }
  
    // 3) שליפה מהאינדקס בצ'אנקים של 30
    const keyToIndexData = new Map<string, { saleId: string; customerId: string }>();
    const parts = chunk(policyKeys, 30);
  
    for (const part of parts) {
      let q: any = query(
        collection(db, 'policyLinkIndex'),
        where('agentId', '==', agentId),
        where('policyNumberKey', 'in', part)
      );
      if (companyId) {
        q = query(
          collection(db, 'policyLinkIndex'),
          where('agentId', '==', agentId),
          where('companyId', '==', companyId),
          where('policyNumberKey', 'in', part)
        );
      }
  
      const snap = await getDocs(q);
      snap.forEach(docSnap => {
        const d: any = docSnap.data();
        if (d?.saleId && d?.policyNumberKey) {
          // תומך בכל וריאציה שקיימת באינדקס (customerId / customerIdRaw / customerIdPadded)
          const idxCanonical = toPadded9(d.customerId ?? d.customerIdRaw ?? d.customerIdPadded ?? '');
          keyToIndexData.set(String(d.policyNumberKey), {
            saleId: String(d.saleId),
            customerId: idxCanonical,
          });
        }
      });
    }
  
    // 4) העשרה + קישור בטוח לפי ת"ז קנונית
    const updated = rows.map(r => {
      const policyKey = normalizePolicyKey(r.policyNumber);
      const rowCustomerId = toPadded9(r.customerId ?? r.customerIdRaw ?? '');
  
      const enriched = {
        ...r,
        policyNumberKey: policyKey,
        customerId: rowCustomerId, // מבטיחים שהשדה הקנוני קיים על הרשומה
      };
  
      if (!policyKey) return enriched;
  
      const idx = keyToIndexData.get(policyKey);
      if (!idx) return enriched;
  
      // קישור בטוח: התאמה מלאה ב-9 ספרות קנוניות
      if (rowCustomerId && idx.customerId && rowCustomerId === idx.customerId) {
        return {
          ...enriched,
          linkedSaleId: idx.saleId,
          linkSource: 'policyIndex',
          linkConfidence: 1.0,
        };
      }
  
      return enriched;
    });
  
    return updated;
  };
  
  // ===============================
  // Render
  // ===============================
  return (
    <div className="p-6 max-w-4xl mx-auto text-right">
      <h2 className="text-2xl font-bold mb-4">טעינת קובץ עמלות</h2>
      <p className="text-gray-600 mb-6">ייבוא עמלות לפי תבנית קובץ מותאמת – טען את הקובץ, ודא שהשדות תואמים וייבא.</p>

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
                  <strong>סך נפרעים:</strong> {item.totalCommission.toLocaleString()} ₪
                </div>
              ))}
            </div>
          }
          onConfirm={() => setShowSummaryDialog(false)}
          onCancel={() => setShowSummaryDialog(false)}
          hideCancel={true}
        />
      )}

      {/* דיאלוגים כלליים */}
      {showTemplateMismatch && (
        <DialogNotification
          type="warning"
          title="התבנית לא מתאימה לקובץ"
          message="הדוח שנבחר לא מתאים לקובץ הנטען. אנא בחר תבנית תואמת או העלה קובץ מתאים."
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
    </div>
  );
};

export default ExcelCommissionImporter;
