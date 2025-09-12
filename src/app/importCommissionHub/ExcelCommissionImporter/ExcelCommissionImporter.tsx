// ExcelCommissionImporter.tsx – טעינת דוחות עמלות (מהיר), תמיכה ב-ZIP/CSV/XLSX,
// סיכומי סוכן/פוליסה, פרמיה/שיעור עמלה, וללא קישור מוקדם לטבלאות שיוך (Importer קריאה/כתיבה בלבד).

'use client';

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  startTransition,
} from 'react';
import * as XLSX from 'xlsx';
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
  writeBatch,
} from 'firebase/firestore';
import { Button } from '@/components/Button/Button';
import DialogNotification from '@/components/DialogNotification';
import './ExcelCommissionImporter.css';
import Link from 'next/link';

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
  totalPremiumAmount: number; // ✅
  commissionRate: number; // ✅
}

interface PolicyCommissionSummary {
  agentId: string;
  agentCode: string;
  reportMonth: string; // YYYY-MM
  companyId: string;
  company: string;
  policyNumberKey: string; // מנורמל ללא רווחים
  customerId: string; // 9 ספרות מרופד
  fullName?: string;
  templateId: string;
  totalCommissionAmount: number;
  totalPremiumAmount: number; // ✅
  commissionRate: number; // ✅
  rowsCount: number;
  product?: string; // ✅ מידע (לא חלק מהמפתח)
}

// ===============================
// Component
// ===============================
const ExcelCommissionImporter: React.FC = () => {
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  // בחירות
  const [templateId, setTemplateId] = useState('');
  const [templateOptions, setTemplateOptions] = useState<CommissionTemplateOption[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const selectedTemplate = templateOptions.find((opt) => opt.id === templateId);
  const canChooseFile = Boolean(selectedAgentId && selectedCompanyId && templateId);

  // מיפוי
  const [mapping, setMapping] = useState<Record<string, string>>({});

  // תצוגה / מצבים
  const [selectedFileName, setSelectedFileName] = useState('');
  const [existingDocs, setExistingDocs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showTemplateMismatch, setShowTemplateMismatch] = useState(false);
  const [errorDialog, setErrorDialog] = useState<{ title: string; message: React.ReactNode } | null>(null);

  // פריוויו + נתונים מלאים (שיפור ביצועים: נתונים מלאים ב-ref, פריוויו ב-state)
  const rowsRef = useRef<any[]>([]);
  const [previewRows, setPreviewRows] = useState<any[]>([]);

  // דיאלוג סיכום
  const [summaryByAgentCode, setSummaryByAgentCode] = useState<any[]>([]);
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);

  // קלט קובץ
  const fileInputRef = useRef<HTMLInputElement>(null);

  // בחירה מתוך ZIP
  const [zipChooser, setZipChooser] = useState<null | {
    zip: any;
    entryNames: string[];
    outerFileName: string;
  }>(null);
  const [selectedZipEntry, setSelectedZipEntry] = useState<string>('');

  // ===============================
  // Helpers
  // ===============================
  const roundTo2 = (num: number) => Math.round(num * 100) / 100;
  const getExt = (n: string) => n.slice(n.lastIndexOf('.')).toLowerCase();
  const defer = (fn: () => void) => {
    // @ts-ignore
    if (typeof window.requestIdleCallback === 'function') {
      // @ts-ignore
      window.requestIdleCallback(fn);
    } else {
      setTimeout(fn, 0);
    }
  };

  const extractReportMonthFromFilename = (filename: string): string | undefined => {
    const nameWithoutExtension = filename.replace(/\.[^/.]+$/, '');
    const m = nameWithoutExtension.match(/(?:^|[^0-9])(\d{2})[_\-](\d{4})(?:[^0-9]|$)/);
    if (m) {
      const [, mm, yyyy] = m;
      return `${yyyy}-${mm}`;
    }
    return undefined;
  };

  // מציאת שורת כותרת מהירה (XLSX) – סריקה של עד 60 שורות עם header:1
  const fastFindHeaderRowIndex = (ws: XLSX.WorkSheet, expectedHeaders: string[]): number => {
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, {
      header: 1,
      raw: true,
      defval: '',        // ✅ ממלא תאים ריקים
      blankrows: false,
    }) as any[][];
    const limit = Math.min(rows.length, 60);
    for (let r = 0; r < limit; r++) {
      const rowVals = (rows[r] || []).map((v) => String(v ?? '').trim());
      const matches = expectedHeaders.filter((h) => rowVals.includes(h));
      if (matches.length >= expectedHeaders.length * 0.5) return r;
    }
    return 0;
  };

  const toNum = (v: any): number => {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return v;
    let s = v.toString().trim();
    let neg = false;
    if (/^\(.*\)$/.test(s)) {
      neg = true;
      s = s.slice(1, -1);
    }
    s = s.replace(/[,\s]/g, '');
    const n = parseFloat(s);
    return (neg ? -1 : 1) * (isNaN(n) ? 0 : n);
  };

  const pick = (row: any, keys: string[]) => {
    for (const k of keys) if (k in row) return row[k];
    return undefined;
  };

  // חישובי עמלה לפי תבנית
  const commissionOverrides: Record<string, (row: any) => number> = {
    ayalon_insurance: (row) =>
      toNum(pick(row, ['סך עמלת סוכן'])) + toNum(pick(row, ['סך דמי גביה', 'סך דמי גבייה'])),
    menura_new_nifraim: (row) =>
      toNum(pick(row, ['סוכן-סכום עמלה', 'סוכן - סכום עמלה'])) +
      toNum(pick(row, ['סוכן-דמי גביה', 'סוכן - דמי גביה', 'סוכן-דמי גבייה', 'סוכן - דמי גבייה'])),
  };

  // עזרי לקוח/פוליסה
  const chunk = <T,>(arr: T[], size: number) =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i, i + size));

  const normalizePolicyKey = (v: any) => String(v ?? '').trim().replace(/\s+/g, '');
  const toPadded9 = (v: any): string => {
    const digits = String(v ?? '').replace(/\D/g, '');
    return digits ? digits.padStart(9, '0').slice(-9) : '';
  };

  const parseHebrewMonth = (value: any, templateId?: string): string => {
    if (!value) return '';
    const monthMap: Record<string, string> = {
      'ינו': '01',
      'פבר': '02',
      'מרץ': '03',
      'אפר': '04',
      'מאי': '05',
      'יונ': '06',
      'יול': '07',
      'אוג': '08',
      'ספט': '09',
      'אוק': '10',
      'נוב': '11',
      'דצמ': '12',
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
      const ex = XLSX.SSF.parse_date_code(numeric);
      if (ex) return `${ex.y}-${String(ex.m).padStart(2, '0')}`;
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
  // Effects
  // ===============================
  useEffect(() => {
    document.body.style.overflow = isLoading ? 'hidden' : '';
  }, [isLoading]);

  useEffect(() => {
    setShowConfirmDelete(false);
  }, []);

  // Preload דינמי למודולים כבדים כדי לחסוך "במכה הראשונה"
  useEffect(() => {
    import('jszip').catch(() => {});
    import('papaparse').catch(() => {});
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
      if (templates.every((t) => t.id !== templateId)) {
        setTemplateId('');
        setMapping({});
      }
    };
    fetchTemplates();
  }, []); // טעינה פעם אחת

  // טעינת mapping של התבנית הנבחרת (רק אם עדיין Active)
  useEffect(() => {
    const fetchTemplateMapping = async () => {
      if (!templateId) {
        setMapping({});
        return;
      }
      const existsInActive = templateOptions.some((t) => t.id === templateId);
      if (!existsInActive) {
        setMapping({});
        return;
      }

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
    new Map(templateOptions.map((t) => [t.companyId, { id: t.companyId, name: t.companyName }])).values()
  );
  const filteredTemplates = templateOptions.filter((t) => t.companyId === selectedCompanyId);
  const selectedCompanyName = useMemo(
    () => uniqueCompanies.find((c) => c.id === selectedCompanyId)?.name || '',
    [selectedCompanyId, uniqueCompanies]
  );

  // ===============================
  // Firestore helpers
  // ===============================
  // בדיקת קיום – עכשיו ב-commissionSummaries בלבד (קל ומהיר)
  const checkExistingData = async (agentId: string, templateId: string, reportMonth: string, companyId: string) => {
    if (!agentId || !templateId || !reportMonth || !companyId) {
      setExistingDocs([]);
      return;
    }
    const qy = query(
      collection(db, 'commissionSummaries'),
      where('agentId', '==', agentId),
      where('templateId', '==', templateId),
      where('reportMonth', '==', reportMonth),
      where('companyId', '==', companyId)
    );
    const snapshot = await getDocs(qy);
    setExistingDocs(snapshot.docs); // state מהיר ודל (רק דוקי סיכומים)
  };

  // מחיקת רפרנסים בצ'אנקים
  async function deleteRefsInChunks(refs: any[]) {
    const CHUNK = 450;
    for (const part of chunk(refs, CHUNK)) {
      const batch = writeBatch(db);
      part.forEach((ref) => batch.delete(ref));
      await batch.commit();
    }
  }

  // מחיקה משלושת האוספים לפי פילטרים (לא תלוי במבנה existingDocs)
  const handleDeleteExisting = async () => {
    setShowConfirmDelete(false);
    setIsLoading(true);
    try {
      const agentId = selectedAgentId!;
      const tmplId = templateId!;
      const companyId = selectedCompanyId!;
      const reportMonth = (rowsRef.current[0]?.reportMonth || '').toString().replace(/\//g, '-');

      if (!agentId || !tmplId || !reportMonth || !companyId) {
        alert('חסר מידע למחיקה (סוכן/חברה/תבנית/חודש).');
        setIsLoading(false);
        return;
      }

      const filters = [
        where('agentId', '==', agentId),
        where('templateId', '==', tmplId),
        where('reportMonth', '==', reportMonth),
        where('companyId', '==', companyId),
      ] as const;

      const [sumSnap, polSnap, extSnap] = await Promise.all([
        getDocs(query(collection(db, 'commissionSummaries'), ...filters)),
        getDocs(query(collection(db, 'policyCommissionSummaries'), ...filters)),
        getDocs(query(collection(db, 'externalCommissions'), ...filters)),
      ]);

      const toDeleteRefs = [
        ...sumSnap.docs.map((d) => d.ref),
        ...polSnap.docs.map((d) => d.ref),
        ...extSnap.docs.map((d) => d.ref),
      ];

      await deleteRefsInChunks(toDeleteRefs);

      // ניקוי UI
      setExistingDocs([]);
      rowsRef.current = [];
      setPreviewRows([]);
      setSelectedFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';

      alert('✅ נמחקו הרשומות משלושת האוספים עבור הסוכן/חודש/תבנית/חברה.');
    } catch (err) {
      console.error(err);
      alert('❌ שגיאה במחיקה.');
    } finally {
      setIsLoading(false);
    }
  };

  // ===============================
  // UI actions
  // ===============================
  const handleClearSelections = () => {
    setSelectedFileName('');
    rowsRef.current = [];
    setPreviewRows([]);
    setTemplateId('');
    setExistingDocs([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    window.location.reload();
  };

  // ---- קריאת CSV (מהיר, worker) ----
  const parseCsvToJson = async (arrayBuffer: ArrayBuffer) => {
    const Papa = (await import('papaparse')).default as any;
    const text = new TextDecoder('windows-1255').decode(new Uint8Array(arrayBuffer));
    const jsonData: Record<string, any>[] = await new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: true,
        worker: true,
        skipEmptyLines: true,
        complete: (res: any) => resolve(res.data as any[]),
        error: reject,
      });
    });
    return jsonData;
  };

  // ---- סטנדרטיזציה (מהירה יותר: ללא serverTimestamp, ולא נכנסת ל-state מלא) ----
  const standardizeRows = (
    jsonData: Record<string, any>[],
    {
      agentId,
      templateId,
      companyId,
      companyName,
      sourceFileName,
      fallbackReportMonth,
    }: {
      agentId: string;
      templateId: string;
      companyId: string;
      companyName: string;
      sourceFileName: string;
      fallbackReportMonth?: string;
    }
  ) => {
    const agentCodeColumn = Object.entries(mapping).find(([, field]) => field === 'agentCode')?.[0];

    const standardized = jsonData
      .filter((row) => {
        const agentCodeVal = agentCodeColumn ? (row as any)[agentCodeColumn] : null;
        return agentCodeVal && agentCodeVal.toString().trim() !== '';
      })
      .map((row) => {
        const result: any = {
          agentId,
          templateId,
          sourceFileName,
          companyId,
          company: companyName,
        };

        for (const [excelCol, systemField] of Object.entries(mapping)) {
          const value = (row as any)[excelCol];

          if (systemField === 'validMonth' || systemField === 'reportMonth') {
            let parsed = parseHebrewMonth(value, templateId);
            if (!parsed && systemField === 'reportMonth' && fallbackReportMonth) parsed = fallbackReportMonth;
            result[systemField] = parsed || value;
          } else if (systemField === 'commissionAmount') {
            const override = commissionOverrides[templateId];
            result[systemField] = override ? roundTo2(override(row)) : toNum(value);
          } else if (systemField === 'premium') {
            result[systemField] = toNum(value);
          } else if (systemField === 'customerId' || systemField === 'IDCustomer') {
            const raw = String(value ?? '').trim();
            const padded9 = toPadded9(value);
            result.customerIdRaw = raw;
            result.customerId = padded9;
          } else if (systemField === 'policyNumber') {
            result[systemField] = String(value ?? '').trim();
          } else if (systemField === 'product') {
            result[systemField] = String(value ?? '').trim();
          } else {
            result[systemField] = value;
          }
        }
        return result;
      });

    return standardized;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !templateId || !selectedAgentId || !selectedCompanyId) return;

    const ext = getExt(file.name);
    const allowed = new Set(['.xlsx', '.xls', '.csv', '.zip']);
    if (!allowed.has(ext)) {
      setErrorDialog({
        title: 'סוג קובץ לא נתמך',
        message: (
          <>
            הקובץ <b>{file.name}</b> הוא {ext}. נא להעלות רק קבצי ZIP/XLSX/XLS/CSV.
          </>
        ),
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setSelectedFileName(file.name);
    setIsLoading(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const arrayBuffer = evt.target?.result as ArrayBuffer;
        const fallbackReportMonth = templateId === 'mor_insurance' ? extractReportMonthFromFilename(file.name) : undefined;

        let jsonData: Record<string, any>[] = [];

        if (ext === '.zip') {
          // ZIP: טוענים דינמית
          const mod = await import('jszip');
          const JSZip: any = (mod as any).default ?? mod;
          const zip = await JSZip.loadAsync(arrayBuffer);

          const entries = zip.file(/\.xlsx$|\.xls$|\.csv$/i);
          if (entries.length === 0) throw new Error('ה-ZIP לא מכיל XLSX/XLS/CSV.');

          // בחירה אם יש כמה
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
            jsonData = await parseCsvToJson(inner.buffer);
          } else {
            const inner = await entry.async('arraybuffer');
            let wb: XLSX.WorkBook;
            try {
              wb = XLSX.read(inner, { type: 'array', dense: true }); // ✅ dense
            } catch (err: any) {
              const msg = String(err?.message || err || '');
              throw new Error(/zip/i.test(msg) ? 'ZIP בתוך ZIP. חלצי ידנית.' : 'קובץ אקסל לא נקרא.');
            }

            let wsname = wb.SheetNames[0];
            let headerRowIndex = 0;

            if (templateId === 'menura_insurance') {
              const foundSheet = wb.SheetNames.find((name) => name.includes('דוח עמלות'));
              if (foundSheet) {
                wsname = foundSheet;
                headerRowIndex = 29;
              } else {
                setErrorDialog({ title: 'לשונית לא נמצאה', message: <>לא נמצאה לשונית בשם <b>דוח עמלות</b>.</> });
                setIsLoading(false);
                return;
              }
            }
            const ws = wb.Sheets[wsname];

            if (templateId !== 'menura_insurance') {
              const expectedHeaders = Object.keys(mapping);
              headerRowIndex = fastFindHeaderRowIndex(ws, expectedHeaders);
            }

            if (!mapping || Object.keys(mapping).length === 0) {
              setShowTemplateMismatch(true);
              setIsLoading(false);
              return;
            }

            const foundHeaders = XLSX.utils
              .sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: '', blankrows: false })[headerRowIndex] // ✅ defval
              ?.map((v: any) => String(v ?? '').trim()) || [];
            const expectedExcelColumns = Object.keys(mapping);
            const intersectCount = expectedExcelColumns.filter((h) => foundHeaders.includes(h)).length;
            const coverage = expectedExcelColumns.length ? intersectCount / expectedExcelColumns.length : 1;
            if (coverage < 0.5) {
              setShowTemplateMismatch(true);
              setIsLoading(false);
              return;
            }

            jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
              defval: '',
              raw: true,
              range: headerRowIndex,
            });
          }
        } else if (ext === '.csv') {
          // CSV רגיל – Papa worker
          jsonData = await parseCsvToJson(arrayBuffer);
        } else {
          // XLS/XLSX רגיל
          let wb: XLSX.WorkBook;
          try {
            wb = XLSX.read(arrayBuffer, { type: 'array', dense: true }); // ✅ dense
          } catch (err: any) {
            const msg = String(err?.message || err || '');
            setErrorDialog({
              title: 'שגיאה בקריאת קובץ',
              message: (
                <>
                  לא ניתן לקרוא את הקובץ <b>{file.name}</b>.<br />
                  {/zip/i.test(msg) ? 'נראה שזה ZIP. חלצי ממנו קובץ XLSX/CSV.' : 'ודאי שהקובץ XLSX/CSV תקין.'}
                </>
              ),
            });
            setIsLoading(false);
            setSelectedFileName('');
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }

          let wsname = wb.SheetNames[0];
          let headerRowIndex = 0;

          if (templateId === 'menura_insurance') {
            const foundSheet = wb.SheetNames.find((name) => name.includes('דוח עמלות'));
            if (foundSheet) {
              wsname = foundSheet;
              headerRowIndex = 29;
            } else {
              setErrorDialog({ title: 'לשונית לא נמצאה', message: <>לא נמצאה לשונית בשם <b>דוח עמלות</b>.</> });
              setIsLoading(false);
              return;
            }
          }
          const ws = wb.Sheets[wsname];

          if (templateId !== 'menura_insurance') {
            const expectedHeaders = Object.keys(mapping);
            headerRowIndex = fastFindHeaderRowIndex(ws, expectedHeaders);
          }

          if (!mapping || Object.keys(mapping).length === 0) {
            setShowTemplateMismatch(true);
            setIsLoading(false);
            return;
          }

          const foundHeaders = XLSX.utils
            .sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: '', blankrows: false })[headerRowIndex] // ✅ defval
            ?.map((v: any) => String(v ?? '').trim()) || [];
          const expectedExcelColumns = Object.keys(mapping);
          const intersectCount = expectedExcelColumns.filter((h) => foundHeaders.includes(h)).length;
          const coverage = expectedExcelColumns.length ? intersectCount / expectedExcelColumns.length : 1;
          if (coverage < 0.5) {
            setShowTemplateMismatch(true);
            setIsLoading(false);
            return;
          }

          jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
            defval: '',
            raw: true,
            range: headerRowIndex,
          });
        }

        if (jsonData.length === 0) {
          setIsLoading(false);
          alert('⚠️ הקובץ לא מכיל שורות.');
          return;
        }

        // --- סטנדרטיזציה (ללא serverTimestamp) ---
        const standardized = standardizeRows(jsonData, {
          agentId: selectedAgentId!,
          templateId,
          companyId: selectedCompanyId!,
          companyName: selectedCompanyName,
          sourceFileName: file.name,
          fallbackReportMonth,
        });

        // שמירה ב-ref בלבד + פריוויו קליל
        rowsRef.current = standardized;
        startTransition(() => {
          setPreviewRows(standardized.slice(0, 10));
        });

        // בדיקת קיום – נדחה כדי לא לחסום UI
        const reportMonth = standardized[0]?.reportMonth;
        if (reportMonth) {
          defer(() => checkExistingData(selectedAgentId!, templateId, reportMonth, selectedCompanyId!));
        }
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

  // ===============================
  // Write helpers
  // ===============================
  const processChosenZipEntry = async () => {
    if (!zipChooser || !selectedZipEntry) {
      setZipChooser(null);
      return;
    }
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

      const fallbackReportMonth = templateId === 'mor_insurance'
        ? extractReportMonthFromFilename(selectedZipEntry)
        : undefined;

      let jsonData: Record<string, any>[] = [];
      const innerExt = getExt(selectedZipEntry);

      if (innerExt === '.csv') {
        const inner = await entry.async('uint8array');
        jsonData = await parseCsvToJson(inner.buffer);
      } else {
        const inner = await entry.async('arraybuffer');
        const wb = XLSX.read(inner, { type: 'array', dense: true }); // ✅ dense

        let wsname = wb.SheetNames[0];
        let headerRowIndex = 0;

        if (templateId === 'menura_insurance') {
          const foundSheet = wb.SheetNames.find((name: string) => name.includes('דוח עמלות'));
          if (foundSheet) {
            wsname = foundSheet;
            headerRowIndex = 29;
          } else {
            setErrorDialog({ title: 'לשונית לא נמצאה', message: <>לא נמצאה לשונית בשם <b>דוח עמלות</b>.</> });
            return;
          }
        }

        const ws = wb.Sheets[wsname];

        if (templateId !== 'menura_insurance') {
          const expectedHeaders = Object.keys(mapping);
          headerRowIndex = fastFindHeaderRowIndex(ws, expectedHeaders);
        }

        if (!mapping || Object.keys(mapping).length === 0) {
          setShowTemplateMismatch(true);
          return;
        }

        const foundHeaders = XLSX.utils
          .sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: '', blankrows: false })[headerRowIndex] // ✅ defval
          ?.map((v: any) => String(v ?? '').trim()) || [];
        const expectedExcelColumns = Object.keys(mapping);
        const intersectCount = expectedExcelColumns.filter((h) => foundHeaders.includes(h)).length;
        const coverage = expectedExcelColumns.length ? intersectCount / expectedExcelColumns.length : 1;
        if (coverage < 0.5) {
          setShowTemplateMismatch(true);
          return;
        }

        jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(ws, {
          defval: '',
          raw: true,
          range: headerRowIndex,
        });
      }

      if (!jsonData.length) {
        alert('⚠️ לא נמצאו שורות נתונים בקובץ.');
        return;
      }

      // סטנדרטיזציה (ללא serverTimestamp)
      const standardized = standardizeRows(jsonData, {
        agentId: selectedAgentId!,
        templateId,
        companyId: selectedCompanyId!,
        companyName: selectedCompanyName,
        sourceFileName: selectedZipEntry,
        fallbackReportMonth,
      });

      rowsRef.current = standardized;
      startTransition(() => {
        setPreviewRows(standardized.slice(0, 10));
      });

      const reportMonth = standardized[0]?.reportMonth;
      if (reportMonth) defer(() => checkExistingData(selectedAgentId!, templateId, reportMonth, selectedCompanyId!));
    } catch (e: any) {
      console.error(e);
      setErrorDialog({ title: 'שגיאת עיבוד קובץ', message: String(e?.message || 'שגיאה לא ידועה') });
    } finally {
      setZipChooser(null);
      setSelectedZipEntry('');
      setIsLoading(false);
    }
  };

  function decorateRowsForWrite(rows: any[]) {
    return rows.map(r => ({
      ...r,
      policyNumberKey: String(r.policyNumber ?? '').trim().replace(/\s+/g, ''),
      customerId: toPadded9(r.customerId ?? r.customerIdRaw ?? ''),
    }));
  }

  async function writeExternalRowsInChunks(rows: any[]) {
    const CHUNK = 450;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const batch = writeBatch(db);
      for (const r of slice) {
        const ref = doc(collection(db, 'externalCommissions'));
        batch.set(ref, { ...r, uploadDate: serverTimestamp() }); // ✅ הוספה פה בלבד
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
        const sanitized = (s.reportMonth ?? '').toString().replace(/\//g, '-');
        const id = `${s.agentId}_${s.agentCode}_${sanitized}_${s.companyId}_${s.policyNumberKey}_${s.customerId}_${s.templateId}`;
        batch.set(doc(db, 'policyCommissionSummaries', id), { ...s, updatedAt: serverTimestamp() });
      }
      await batch.commit();
    }
  }

  // ===============================
  // Import
  // ===============================
  const handleImport = async () => {
    if (!selectedAgentId || rowsRef.current.length === 0) return;

    // תקנון חודשים (אחרי פרסינג)
    rowsRef.current.forEach((row) => {
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
      // עדכון agentCodes למשתמש
      const uniqueAgentCodes = new Set<string>();
      for (const row of rowsRef.current) {
        if (row.agentCode) uniqueAgentCodes.add(row.agentCode.toString().trim());
      }
      const userRef = doc(db, 'users', selectedAgentId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const existingCodes: string[] = userSnap.data().agentCodes || [];
        const codesToAdd = Array.from(uniqueAgentCodes).filter((code) => !existingCodes.includes(code));
        if (codesToAdd.length > 0) await updateDoc(userRef, { agentCodes: arrayUnion(...codesToAdd) });
      }

      // ✨ ללא קישור מוקדם: רק דקורציה לפני כתיבה
      const rowsPrepared = decorateRowsForWrite(rowsRef.current);
      await writeExternalRowsInChunks(rowsPrepared);

      // ===== סיכומי סוכן-חודש =====
      const summariesMap = new Map<string, CommissionSummary>();
      for (const row of rowsPrepared) {
        const sanitizedMonth = row.reportMonth?.toString().replace(/\//g, '-') || '';
        const key = `${row.agentId}_${row.agentCode}_${sanitizedMonth}_${row.templateId}_${row.companyId}`;
        if (!summariesMap.has(key)) {
          summariesMap.set(key, {
            agentId: row.agentId,
            agentCode: row.agentCode,
            reportMonth: row.reportMonth,
            templateId: row.templateId,
            totalCommissionAmount: 0,
            totalPremiumAmount: 0,
            commissionRate: 0,
            companyId: row.companyId,
            company: row.company || '',
          });
        }
        const summary = summariesMap.get(key)!;
        const commission = toNum(row.commissionAmount);
        const premium = toNum(row.premium);
        summary.totalCommissionAmount += isNaN(commission) ? 0 : commission;
        summary.totalPremiumAmount += isNaN(premium) ? 0 : premium;
      }
      for (const s of summariesMap.values()) {
        s.commissionRate = s.totalPremiumAmount > 0 ? roundTo2((s.totalCommissionAmount / s.totalPremiumAmount) * 100) : 0;
      }
      await writeSummariesInBatch(Array.from(summariesMap.values()));

      // ===== סיכומי פוליסה =====
      const policyMap = new Map<string, PolicyCommissionSummary>();
      for (const row of rowsPrepared) {
        const sanitizedMonth = (row.reportMonth ?? '').toString().replace(/\//g, '-');
        const agentId = row.agentId;
        const agentCode = (row.agentCode ?? '').toString().trim();
        const companyId = row.companyId;
        const company = row.company || '';
        const templId = row.templateId || '';
        const policyNumberKey = row.policyNumberKey || normalizePolicyKey(row.policyNumber);
        const customerId = toPadded9(row.customerId ?? row.customerIdRaw ?? '');
        const product = String(row.product ?? '').trim();
        const fullName = String(row.fullName ?? '').trim();
        if (!agentId || !agentCode || !sanitizedMonth || !companyId || !policyNumberKey || !customerId) continue;

        const key = `${agentId}_${agentCode}_${sanitizedMonth}_${companyId}_${policyNumberKey}_${customerId}_${templId}`;
        if (!policyMap.has(key)) {
          policyMap.set(key, {
            agentId,
            agentCode,
            reportMonth: sanitizedMonth,
            companyId,
            company,
            policyNumberKey,
            customerId,
            templateId: templId,
            totalCommissionAmount: 0,
            totalPremiumAmount: 0,
            commissionRate: 0,
            rowsCount: 0,
            product: product || undefined,
            fullName: fullName || undefined,
          });
        }
        const s = policyMap.get(key)!;
        s.totalCommissionAmount += toNum(row.commissionAmount);
        s.totalPremiumAmount += toNum(row.premium);
        s.rowsCount += 1;
        if (!s.product && product) s.product = product;
        if (!s.fullName && fullName) s.fullName = fullName;
      }
      for (const s of policyMap.values()) {
        s.commissionRate = s.totalPremiumAmount > 0 ? roundTo2((s.totalCommissionAmount / s.totalPremiumAmount) * 100) : 0;
      }
      await writePolicySummariesInBatch(Array.from(policyMap.values()));

      // דיאלוג סיכום קצר לפי מספרי סוכן
      const grouped: Record<
        string,
        { count: number; uniqueCustomers: Set<string>; totalCommission: number; totalPremium: number }
      > = {};
      for (const row of rowsPrepared) {
        const code = row.agentCode;
        if (!code) continue;
        if (!grouped[code]) grouped[code] = { count: 0, uniqueCustomers: new Set(), totalCommission: 0, totalPremium: 0 };
        grouped[code].count += 1;
        if (row.customerId) grouped[code].uniqueCustomers.add(row.customerId);
        grouped[code].totalCommission += toNum(row.commissionAmount) || 0;
        grouped[code].totalPremium += toNum(row.premium) || 0;
      }

      const summaryArray = Object.entries(grouped).map(([agentCode, data]) => ({
        agentCode,
        count: data.count,
        totalInsured: data.uniqueCustomers.size,
        totalCommission: data.totalCommission,
        totalPremium: data.totalPremium,
        commissionRate: data.totalPremium > 0 ? roundTo2((data.totalCommission / data.totalPremium) * 100) : 0,
      }));
      setSummaryByAgentCode(summaryArray);
      setShowSummaryDialog(true);

      // ניקוי
      rowsRef.current = [];
      setPreviewRows([]);
      setSelectedFileName('');
      setExistingDocs([]);
    } catch (error) {
      console.error('שגיאה בעת טעינה:', error);
      alert('❌ שגיאה בעת טעינה למסד. בדוק קונסול.');
    } finally {
      setIsLoading(false);
    }
  };

  // ===============================
  // Render
  // ===============================
  return (
    <div className="p-6 max-w-4xl mx-auto text-right">
      <h2 className="text-2xl font-bold mb-4">טעינת קובץ עמלות</h2>
      <p className="text-gray-600 mb-6">ייבוא עמלות לפי תבנית קובץ מותאמת – טעני קובץ, ודאי התאמה וייבאי.</p>

      {/* Loader overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-white bg-opacity-70 z-50 flex items-center justify-center">
          <div className="text-center">
            <div className="loader mb-4"></div>
            <p className="text-lg font-semibold text-gray-700">⏳ טוען נתונים...</p>
          </div>
        </div>
      )}

      {/* בחירת סוכן */}
      <div className="mb-4">
        <label className="block font-semibold mb-1">בחר סוכן:</label>
        <select value={selectedAgentId} onChange={handleAgentChange} className="select-input w-full">
          {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </div>

      {/* בחירת חברה */}
      <div className="mb-4">
        <label className="block font-semibold mb-1">בחר חברה:</label>
        <select
          value={selectedCompanyId}
          onChange={(e) => {
            setSelectedCompanyId(e.target.value);
            setTemplateId('');
          }}
          className="select-input w-full"
        >
          <option value="">בחר חברה</option>
          {uniqueCompanies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
      </div>

      {/* בחירת תבנית */}
      {selectedCompanyId && (
        <div className="mb-4">
          <label className="block font-semibold mb-1">בחר תבנית:</label>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="select-input w-full">
            <option value="">בחר תבנית</option>
            {filteredTemplates.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.Name || opt.type}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="mb-2 text-sm">
        <Link href="/Help/commission-reports#top" target="_blank" className="underline hover:no-underline text-blue-600">
          ❓ מדריך דוחות עמלות – איך להפיק ולייצא מכל חברה
        </Link>
      </div>

      {/* בחירת קובץ */}
      <div className="mb-4">
        <label className="block font-semibold mb-1">בחר קובץ:</label>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.zip" onChange={handleFileUpload} className="hidden" />
        <div className="flex gap-2">
          <Button text="בחר קובץ" type="primary" onClick={() => canChooseFile && fileInputRef.current?.click()} disabled={!canChooseFile} />
          <Button text="נקה בחירה" type="secondary" onClick={handleClearSelections} />
        </div>
        {selectedFileName && <p className="mt-2 text-sm text-gray-600">📁 {selectedFileName}</p>}
      </div>

      {!canChooseFile && <p className="mt-2 text-sm text-gray-500">⚠️ לפני בחירת קובץ יש לבחור סוכן, חברה ותבנית.</p>}

      {/* הודעה אם כבר קיים */}
      {existingDocs.length > 0 && (
        <div className="bg-red-100 border border-red-300 text-red-800 p-3 rounded mb-4">
          קובץ כבר נטען לסוכן ולחודש זה. יש למחוק אותו לפני טעינה נוספת.
          <Button text="🗑 מחק טעינה קיימת" type="danger" onClick={() => setShowConfirmDelete(true)} className="mt-2" />
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
      {previewRows.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold mb-2">
            תצוגה לאחר מיפוי ({rowsRef.current.length.toLocaleString()} שורות)
          </h3>
          <div className="overflow-x-auto border">
            <table className="table-auto w-full border-collapse text-sm text-right">
              <thead>
                <tr className="bg-gray-100">
                  {Object.entries(mapping).map(([he, en]) => (
                    <th key={en} className="border px-2 py-1">
                      {he}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i}>
                    {Object.entries(mapping).map(([, en]) => (
                      <td key={en} className="border px-2 py-1">
                        {row[en]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-xs text-gray-500 p-2">הצגה של 10 שורות ראשונות בלבד</div>
          </div>

          <Button
            text={isLoading ? 'טוען...' : 'אשר טעינה למסד הנתונים'}
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
              {summaryByAgentCode.map((item: any) => (
                <div key={item.agentCode} className="mb-3">
                  <strong>מספר סוכן:</strong> {item.agentCode}
                  <br />
                  <strong>כמות שורות:</strong> {item.count}
                  <br />
                  <strong>כמות מבוטחים:</strong> {item.totalInsured}
                  <br />
                  <strong>סך עמלות:</strong> {item.totalCommission.toLocaleString()} ₪
                  <br />
                  <strong>סך פרמיות:</strong> {item.totalPremium.toLocaleString()} ₪
                  <br />
                  <strong>שיעור עמלה:</strong> {item.commissionRate.toLocaleString()}%
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
              הדוח שנבחר לא מתאים לקובץ הנטען. נסי לבחור תבנית אחרת או להפיק מחדש לפי ההנחיות במדריך.
              <div className="mt-2">
                <Link href="/Help/commission-reports#top" target="_blank" className="underline hover:no-underline text-blue-600">
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
                <select className="select-input w-full" value={selectedZipEntry} onChange={(e) => setSelectedZipEntry(e.target.value)}>
                  {zipChooser.entryNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
            </>
          }
          onConfirm={() => processChosenZipEntry()}
          onCancel={() => {
            setZipChooser(null);
            setSelectedZipEntry('');
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
          hideCancel={false}
          confirmText="המשך"
          cancelText="ביטול"
        />
      )}
    </div>
  );
};

export default ExcelCommissionImporter;
