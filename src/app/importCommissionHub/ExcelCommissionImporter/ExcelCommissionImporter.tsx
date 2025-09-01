// ExcelCommissionImporter.tsx - כולל תיקון לבדיקה מחודשת גם אחרי 'נקה בחירה'

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
  addDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  updateDoc,
  arrayUnion,
  setDoc
} from 'firebase/firestore';
import { Button } from '@/components/Button/Button';
import DialogNotification from '@/components/DialogNotification';
import './ExcelCommissionImporter.css';


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
  companyId: string;      // ✅ חדש
  company: string;        // ✅ חדש (שם החברה)
  totalCommissionAmount: number;
}


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

  const headersAtRow = (sheet: XLSX.WorkSheet, headerRowIndex: number): string[] => {
    const range = XLSX.utils.decode_range(sheet['!ref']!);
    const headers: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: headerRowIndex, c })];
      headers.push(cell?.v?.toString().trim() || '');
    }
    return headers;
  };
  

  const automationApiByTemplate = (template: {
    companyId: string;
    type: string;
    name: string;
  }) => {
    if (template.companyId === '2' && template.name === 'משולמים לסוכן') {
      return '/api/commissionImport/migdal/payments';
    }
  
    // future: כלל, הראל, וכו'
    return null;
  };
  
  const uniqueCompanies = Array.from(
    new Map(
      templateOptions.map(t => [t.companyId, { id: t.companyId, name: t.companyName }])
    ).values()
  );
  

  const filteredTemplates = templateOptions.filter(
    t => t.companyId === selectedCompanyId
  );
  
  const roundTo2 = (num: number) => Math.round(num * 100) / 100;

  const findHeaderRowIndex = (sheet: XLSX.WorkSheet, expectedHeaders: string[]): number => {
    const range = XLSX.utils.decode_range(sheet['!ref']!);
    for (let row = range.s.r; row <= range.e.r; row++) {
      const rowValues: string[] = [];
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
        rowValues.push(cell?.v?.toString().trim() || '');
      }
      const matches = expectedHeaders.filter(header => rowValues.includes(header));
      if (matches.length >= expectedHeaders.length * 0.5) {
        return row;
      }
    }
    return 0; // ברירת מחדל - אם לא מצאנו התאמה
  };
  

  useEffect(() => {
    if (isLoading) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [isLoading]);
  

  useEffect(() => {
    setShowConfirmDelete(false);
  }, []);

  useEffect(() => {
    const fetchTemplates = async () => {
      const snapshot = await getDocs(collection(db, 'commissionTemplates'));
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
          automationClass: data.automationClass || ''
        });
      }

      setTemplateOptions(templates);
    };
    fetchTemplates();
  }, []);

  useEffect(() => {
    const fetchTemplateMapping = async () => {
      if (!templateId) return;
      const ref = doc(db, 'commissionTemplates', templateId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        setMapping(data.fields || {});
      }
    };
    fetchTemplateMapping();
  }, [templateId]);

  const selectedCompanyName = React.useMemo(
    () => uniqueCompanies.find(c => c.id === selectedCompanyId)?.name || '',
    [selectedCompanyId, uniqueCompanies]
  );
  
// שומר תמיד כמחרוזת 9 ספרות (מוסיף אפסים מובילים אם צריך)
const normalizeCustomerId = (v: any): string => {
  const digits = String(v ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.padStart(9, '0'); // אם זה לא ת״ז – אפשר להשאיר בלי pad
};

const normalizePolicyNumber = (v: any): string =>
  String(v ?? '').trim();

const normCompany = (v: any): string =>
  String(v ?? '').trim().replace(/\s+/g, ' ');


  const parseHebrewMonth = (value: any, templateId?: string): string => {
    if (!value) return '';
  
    const monthMap: Record<string, string> = {
      'ינו': '01', 'פבר': '02', 'מרץ': '03', 'אפר': '04', 'מאי': '05', 'יונ': '06',
      'יול': '07', 'אוג': '08', 'ספט': '09', 'אוק': '10', 'נוב': '11', 'דצמ': '12'
    };
  
    // 🟡 Excel מספרי
    if (typeof value === 'number') {
      const excelDate = XLSX.SSF.parse_date_code(value);
      if (excelDate) {
        const year = excelDate.y;
        const month = excelDate.m.toString().padStart(2, '0');
        return `${year}-${month}`;
      }
    }
  
    // 🟡 Date רגיל
    if (value instanceof Date) {
      const year = value.getFullYear();
      const month = (value.getMonth() + 1).toString().padStart(2, '0');
      return `${year}-${month}`;
    }
  
    const str = value.toString().trim();
  

    // 🔹 קודם כל: DD/MM/YYYY או D/M/YYYY (כולל נקודות ומקפים)
let m = str.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
if (m) {
  let [, _day, mm, yy] = m;
  const yyyy = yy.length === 2
    ? (parseInt(yy, 10) < 50 ? `20${yy}` : `19${yy}`)
    : yy;
  return `${yyyy}-${mm.padStart(2, '0')}`;
}

    // 🟡 תבנית מנורה – תאריך ממספר עמודה
    if (templateId === 'menura_insurance' && /^\d{5}$/.test(str)) {
      const numeric = parseInt(str, 10);
      const excelDate = XLSX.SSF.parse_date_code(numeric);
      if (excelDate) {
        const year = excelDate.y;
        const month = excelDate.m.toString().padStart(2, '0');
        return `${year}-${month}`;
      }
    }
  
    // 🟡 פורמטים עם חודש בעברית + שנה
    let match = str.match(/([\u0590-\u05FF]{3})[- ]?(\d{2})/);
    if (!match) match = str.match(/(\d{2})[- ]?([\u0590-\u05FF]{3})/);
    if (match) {
      const [, a, b] = match;
      const [hebMonth, yearSuffix] = monthMap[a] ? [a, b] : [b, a];
      const month = monthMap[hebMonth];
      const year = '20' + yearSuffix;
      if (month) return `${year}-${month}`;
    }
  
    // 🟡 תאריכים בפורמט כללי עם ספרות בלבד (כמו "06-2025" או "2025/06")
    const parts: string[] | null = str.match(/\d+/g);
    if (parts && parts.length >= 2) {
      const year = parts.find((p: string) => p.length === 4);
      const month = parts.find((p: string) => p.length === 2 || p.length === 1);
      if (year && month) {
        return `${year}-${month.padStart(2, '0')}`;
      }
    }
  
    // 🔚 אם שום דבר לא עבד – ננסה למצוא חודש ושנה בצורה חופשית ולנרמל
    return str.replace(/\//g, '-');
  };
  

  const checkExistingData = async (agentId: string, templateId: string,
    reportMonth: string,
    companyId: string
  ) => {
    const q = query(
      collection(db, 'externalCommissions'),
      where('agentId', '==', agentId),
      where('templateId', '==', templateId),
      where('reportMonth', '==', reportMonth),
      where('companyId', '==', companyId)
    );
    const snapshot = await getDocs(q);
    setExistingDocs(snapshot.docs);
  };

  const handleDeleteExisting = async () => {
    setShowConfirmDelete(false);
    setIsLoading(true);
  
    try {
      // שלב 1: חילוץ מזהים ייחודיים לשורות סיכום
      const summaryKeys = new Set<string>();
      for (const docSnap of existingDocs) {
        const data = docSnap.data();
        const key = `${data.agentId}_${data.agentCode}_${data.reportMonth}_${data.templateId}`;
        summaryKeys.add(key);
      }
  
      // שלב 2: מחיקת כל שורות הקובץ
      for (const docSnap of existingDocs) {
        await deleteDoc(docSnap.ref);
      }
  
      // שלב 3: מחיקת שורות סיכום תואמות
      for (const key of summaryKeys) {
        await deleteDoc(doc(db, "commissionSummaries", key));
      }
  
      setExistingDocs([]);
      setStandardizedRows([]); // ✅ ריקון שורות הטבלה
      setSelectedFileName(''); // אופציונלי: לרוקן את שם הקובץ שהוצג
     
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
  
     
      alert('✅ כל הרשומות וגם הסיכומים נמחקו. כעת ניתן לטעון קובץ חדש.');
    } catch (err) {
      console.error(err);
      alert('❌ שגיאה במחיקת הנתונים או הסיכומים.');
    } finally {
      setIsLoading(false);
    }
  };
  const handleClearSelections = () => {
    setSelectedFileName('');
    setStandardizedRows([]);
    setTemplateId('');
    setExistingDocs([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  
    // 💥 רענון מלא של הדף
    window.location.reload();
  };
  

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !templateId || !selectedAgentId || !selectedCompanyId) return;
    setSelectedFileName(file.name);
    setIsLoading(true);
  
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const arrayBuffer = evt.target?.result as ArrayBuffer;
      let jsonData: Record<string, any>[] = [];
    
      const extractReportMonthFromFilename = (filename: string): string | undefined => {
        // שלב 1: ניקוי סיומת (למשל .xlsx)
        const nameWithoutExtension = filename.replace(/\.[^/.]+$/, '');
      
        // שלב 2: חיפוש תבנית תאריך גמישה — גם עם רווחים וסוגריים
        const match = nameWithoutExtension.match(/(?:^|[^0-9])(\d{2})[_\-](\d{4})(?:[^0-9]|$)/);
      
        if (match) {
          const [, month, year] = match;
          return `${year}-${month}`;
        }
      
        return undefined;
      };
      
      let fallbackReportMonth: string | undefined;
      if (templateId === 'mor_insurance') {
        fallbackReportMonth = extractReportMonthFromFilename(file.name);

console.log('🧪 שם קובץ מקורי:', file.name);
console.log('📅 reportMonth שחולץ:', fallbackReportMonth);      }
    
      if (file.name.endsWith('.csv')) {
        const decoder = new TextDecoder('windows-1255');
        const text = decoder.decode(arrayBuffer);
        const workbook = XLSX.read(text, { type: 'string' });
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
      } else {
        const wb = XLSX.read(arrayBuffer, { type: "array" });
        let wsname = wb.SheetNames[0];
        let headerRowIndex = 0;
    
        if (templateId === 'menura_insurance') {
          const foundSheet = wb.SheetNames.find(name => name.includes('דוח עמלות'));
          if (foundSheet) {
            wsname = foundSheet;
            headerRowIndex = 29; // שורה 30
            console.log('📄 לשונית שנבחרה:', wsname);
          } else {
            alert('❌ לא נמצאה לשונית בשם דוח עמלות');
            setIsLoading(false);
            return;
          }
        }
    
        const ws = wb.Sheets[wsname];
    
        if (templateId !== 'menura_insurance') {
          const expectedHeaders = Object.keys(mapping);
          headerRowIndex = findHeaderRowIndex(ws, expectedHeaders);
        }
    
// אם אין מיפוי/שגוי — הודעה כללית ועצירה
if (!mapping || Object.keys(mapping).length === 0) {
  setIsLoading(false);
  setShowTemplateMismatch(true);
  return;
}

// בדיקת התאמה בסיסית בין הכותרות בקובץ לבין הכותרות שמוגדרות בתבנית (מה-DB)
const expectedExcelColumns = Object.keys(mapping);
const foundHeaders = headersAtRow(ws, headerRowIndex);

// חישוב שיעור התאמה (כמה מהכותרות שהוגדרו בתבנית נמצאות בפועל)
const intersectCount = expectedExcelColumns.filter(h => foundHeaders.includes(h)).length;
const coverage = expectedExcelColumns.length ? (intersectCount / expectedExcelColumns.length) : 1;

// סף פשוט: אם פחות מ-50% מהכותרות נמצאו — נניח שהתבנית לא מתאימה לקובץ
if (coverage < 0.5) {
  setIsLoading(false);
  setShowTemplateMismatch(true);
  return;
}

        jsonData = XLSX.utils.sheet_to_json(ws, {
          defval: "",
          range: headerRowIndex
        });
      }
      if (jsonData.length === 0) {
        alert('⚠️ הקובץ לא מכיל שורות נתונים. ודאי שהעלית קובץ עם תוכן.');
        setIsLoading(false);
        return;
      }
      
      if (jsonData.length > 0) {
        const agentCodeColumn = Object.entries(mapping).find(([, field]) => field === 'agentCode')?.[0];
    
        const standardized = jsonData
          .filter((row) => {
            const agentCodeVal = agentCodeColumn ? row[agentCodeColumn] : null;
            return agentCodeVal && agentCodeVal.toString().trim() !== '';
          })
          .map((row) => {
 const result: any = {
              agentId: selectedAgentId,
              templateId,
              sourceFileName: file.name,
              uploadDate: serverTimestamp()
            };
// ✅ תמיד מחתימים מהבחירה במסך
result.companyId = selectedCompanyId;
result.company   = selectedCompanyName;


            for (const [excelCol, systemField] of Object.entries(mapping)) {
              const value = row[excelCol];
              if (systemField === 'validMonth' || systemField === 'reportMonth') {
                let parsed = parseHebrewMonth(value, templateId);
    
                // 📦 במור – נחלץ משם הקובץ אם חסר
                if (!parsed && systemField === 'reportMonth' && fallbackReportMonth) {
                  parsed = fallbackReportMonth;
                }
    
                result[systemField] = parsed || value;
              } else if (systemField === 'commissionAmount') {
 // ✅ כאן נטפל במקרה של תבנית Ayalon:
 if (templateId === 'ayalon_insurance') {
  const val1 = row['סך עמלת סוכן'];
  const val2 = row['סך דמי גביה'];
  const sum = (parseFloat(val1?.toString().replace(/,/g, '')) || 0) +
              (parseFloat(val2?.toString().replace(/,/g, '')) || 0);
              result[systemField] = roundTo2(val1 + val2);
            } else {
  result[systemField] = value ? parseFloat(value.toString().replace(/,/g, '')) || 0 : 0;
              }     
           } 
             // ✅ שדה מזהה לקוח – לשמור תמיד כמחרוזת
  else if (systemField === 'customerId' || systemField === 'IDCustomer') {
    result[systemField] = normalizeCustomerId(value);
  }
            // אופציונלי: גם מספר פוליסה תמיד כמחרוזת
  else if (systemField === 'policyNumber') {
    result[systemField] = String(value ?? '').trim();
  }
           else {
                result[systemField] = value;
              }
            }
    
            return result;
          });
    
        setStandardizedRows(standardized);
    
        const reportMonth = standardized[0]?.reportMonth;
        if (reportMonth) {
          await checkExistingData(selectedAgentId, templateId, reportMonth, selectedCompanyId);
        }
      }
    
      setIsLoading(false);
    };    
    
    reader.readAsArrayBuffer(file);
  };
  

  
  // const handleImport = async () => {
  //   if (!selectedAgentId || standardizedRows.length === 0) return;
  //   // תיקון פורמט reportMonth ו־validMonth עם תמיכה בעברית ובפורמטים שונים
  //   standardizedRows.forEach(row => {
  //     row.reportMonth = parseHebrewMonth(row.reportMonth, row.templateId);
  //     row.validMonth = parseHebrewMonth(row.validMonth, row.templateId);
  //   });
    
  //   setIsLoading(true);
  
  //   const reportMonth = standardizedRows[0]?.reportMonth;
  //   if (existingDocs.length > 0) {
  //     alert('❌ קובץ כבר קיים לחודש זה ולסוכן זה. מחק אותו קודם כדי לטעון מחדש.');
  //     setIsLoading(false);
  //     return;
  //   }
  
  //   try {
  //     // שלב 1: איסוף כל הקודים מהקובץ
  //     const uniqueAgentCodes = new Set<string>();
  //     for (const row of standardizedRows) {
  //       if (row.agentCode) {
  //         uniqueAgentCodes.add(row.agentCode.toString().trim());
  //       }
  //     }
  
  //     // שלב 2: עדכון שדה agentCodes ביוזר (אם חסר – ניצור אותו)
  //     const userRef = doc(db, 'users', selectedAgentId);
  //     const userSnap = await getDoc(userRef);
  //     if (userSnap.exists()) {
  //       const userData = userSnap.data();
  //       const existingCodes: string[] = userData.agentCodes || [];
  
  //       const codesToAdd = Array.from(uniqueAgentCodes).filter(
  //         code => !existingCodes.includes(code)
  //       );
  
  //       if (codesToAdd.length > 0) {
  //         await updateDoc(userRef, {
  //           agentCodes: arrayUnion(...codesToAdd)
  //         });
  //       }
  //     }
  
  //     // שלב 3: טעינת הנתונים לטבלת externalCommissions
  //     for (const row of standardizedRows) {
  //       await addDoc(collection(db, 'externalCommissions'), row);
  //     }
  //     const summariesMap = new Map<string, CommissionSummary>();

      
  //     for (const row of standardizedRows) {
  //       // const key = `${row.agentId}_${row.agentCode}_${row.reportMonth}_${row.templateId}`;
  //       const sanitizedMonth = row.reportMonth?.toString().replace(/\//g, '-') || '';
  //       const key = `${row.agentId}_${row.agentCode}_${sanitizedMonth}_${row.templateId}_${row.companyId}`; // ✅
  //       if (!summariesMap.has(key)) {
  //         summariesMap.set(key, {
  //           agentId: row.agentId,
  //           agentCode: row.agentCode,
  //           reportMonth: row.reportMonth,
  //           templateId: row.templateId,
  //           totalCommissionAmount: 0,
  //           companyId: row.companyId,           
  //           company: row.company || '', 
  //         });
  //       }
  //       const summary = summariesMap.get(key)!;
  //       const commission = parseFloat(row.commissionAmount || '0');
  //       summary.totalCommissionAmount += isNaN(commission) ? 0 : commission;
  //     }
      
  //     // שמירה לטבלה החדשה
  //     for (const summary of summariesMap.values()) {
  //       // const docId = `${summary.agentId}_${summary.agentCode}_${summary.reportMonth}_${summary.templateId}`;
  //       const sanitizedMonth = summary.reportMonth?.toString().replace(/\//g, '-') || '';
  //       const docId = `${summary.agentId}_${summary.agentCode}_${sanitizedMonth}_${summary.templateId}_${summary.companyId}`;
        
  //       await setDoc(doc(db, "commissionSummaries", docId), {
  //         ...summary,
  //         updatedAt: serverTimestamp(), // מוסיף תאריך עדכון
  //       });
  //       // חישוב סיכומים להצגה
  //       const grouped: Record<string, {
  //         count: number;
  //         uniqueCustomers: Set<string>;
  //         totalCommission: number;
  //       }> = {};
        
  //       for (const row of standardizedRows) {
  //         const code = row.agentCode;
  //         if (!code) continue;
        
  //         if (!grouped[code]) {
  //           grouped[code] = {
  //             count: 0,
  //             uniqueCustomers: new Set(),
  //             totalCommission: 0,
  //           };
  //         }
        
  //         grouped[code].count += 1;
        
  //         if (row.customerId) {
  //           grouped[code].uniqueCustomers.add(row.customerId);
  //         }
        
  //         grouped[code].totalCommission += parseFloat(row.commissionAmount || '0') || 0;
  //       }
        
  //       // יצירת מערך לסיכום
  //       const summaryArray = Object.entries(grouped).map(([agentCode, data]) => ({
  //         agentCode,
  //         count: data.count,
  //         totalInsured: data.uniqueCustomers.size,
  //         totalCommission: data.totalCommission,
  //       }));
        
  //       setSummaryByAgentCode(summaryArray);
  //       setShowSummaryDialog(true);        
  // }
  //     // alert('✅ כל השורות נטענו למסד הנתונים!');
  //     setStandardizedRows([]);
  //     setSelectedFileName('');
  //     setExistingDocs([]);
  //   } catch (error) {
  //     console.error('שגיאה בעת טעינה:', error);
  //     alert('❌ שגיאה בעת טעינה למסד. בדוק קונסול.');
  //   } finally {
  //     setIsLoading(false);
  //   }
  // };

  const handleImport = async () => {
    if (!selectedAgentId || standardizedRows.length === 0) return;
  
    // 🔹 תיקון פורמט reportMonth ו־validMonth עם תמיכה בעברית ובפורמטים שונים
    standardizedRows.forEach(row => {
      row.reportMonth = parseHebrewMonth(row.reportMonth, row.templateId);
      row.validMonth = parseHebrewMonth(row.validMonth, row.templateId);
    });
  
    setIsLoading(true);
  
    const reportMonth = standardizedRows[0]?.reportMonth;
  
    // 🔹 בדיקה אם כבר יש קובץ קיים לחודש+סוכן+חברה+תבנית
    if (existingDocs.length > 0) {
      alert('❌ קובץ כבר קיים לחודש זה ולסוכן זה. מחק אותו קודם כדי לטעון מחדש.');
      setIsLoading(false);
      return;
    }
  
    try {
      // --- שלב 1: איסוף agentCodes מהקובץ ---
      const uniqueAgentCodes = new Set<string>();
      for (const row of standardizedRows) {
        if (row.agentCode) {
          uniqueAgentCodes.add(row.agentCode.toString().trim());
        }
      }
  
      // --- שלב 2: עדכון שדה agentCodes ביוזר (אם חסר – נוסיף) ---
      const userRef = doc(db, 'users', selectedAgentId);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const userData = userSnap.data();
        const existingCodes: string[] = userData.agentCodes || [];
  
        const codesToAdd = Array.from(uniqueAgentCodes).filter(
          code => !existingCodes.includes(code)
        );
  
        if (codesToAdd.length > 0) {
          await updateDoc(userRef, {
            agentCodes: arrayUnion(...codesToAdd)
          });
        }
      }
  
      // --- שלב 3: לפני כתיבה למסד → pre-link ---
      // כאן אנחנו בודקים policyLinkIndex ואם נמצא saleId מתאים
      // נעדכן לכל שורה את linkedSaleId כדי שתגיע למסד כבר "משויכת"
      const rowsWithLinks = await preResolveLinks(standardizedRows, selectedAgentId);
  
      // --- שלב 4: כתיבת הנתונים לטבלת externalCommissions ---
      for (const row of rowsWithLinks) {
        await addDoc(collection(db, 'externalCommissions'), row);
      }
  
      // --- שלב 5: חישוב סיכומים לפי agentCode ---
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
  
      // --- שלב 6: שמירת הסיכומים לטבלת commissionSummaries ---
      for (const summary of summariesMap.values()) {
        const sanitizedMonth = summary.reportMonth?.toString().replace(/\//g, '-') || '';
        const docId = `${summary.agentId}_${summary.agentCode}_${sanitizedMonth}_${summary.templateId}_${summary.companyId}`;
  
        await setDoc(doc(db, "commissionSummaries", docId), {
          ...summary,
          updatedAt: serverTimestamp(),
        });
      }
  
      // --- שלב 7: חישוב נתוני סיכום להצגה במסך ---
      const grouped: Record<string, {
        count: number;
        uniqueCustomers: Set<string>;
        totalCommission: number;
      }> = {};
  
      for (const row of rowsWithLinks) {
        const code = row.agentCode;
        if (!code) continue;
  
        if (!grouped[code]) {
          grouped[code] = {
            count: 0,
            uniqueCustomers: new Set(),
            totalCommission: 0,
          };
        }
  
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
  
      // --- שלב 8: ניקוי state אחרי טעינה ---
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
  




  const handleAutoRunByTemplate = async () => {
    if (!selectedTemplate?.id || !selectedAgentId) {
      alert('יש לבחור תבנית וסוכן לפני הפעלת אוטומציה');
      return;
    }
  
    try {
      setIsLoading(true);
  
      // // שלב בסיסי לאיסוף נתונים — אפשר לשנות לטופס בעתיד
      // const idNumber = prompt('📱 הכנס ת״ז של הסוכן:');
      // const password = prompt('🔒 הכנס סיסמה של הסוכן:');
  
      // if (!idNumber || !password) {
      //   alert('❌ חובה להזין ת״ז וסיסמה כדי להתחיל את האוטומציה');
      //   return;
      // }
      // console.log('🚀 שולחת:', {
      //   templateId: selectedTemplate.id,
      //   options: {
      //     idNumber,
      //     password,
      //     agentId: selectedAgentId
      //   }
      // });
      
      const res = await fetch('/api/automation/run-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          options: {
            // idNumber,
            // password,
            agentId: selectedAgentId,
            templateId: selectedTemplate.id,
          }
        }),
      });
  
      const data = await res.json();
  
      if (!res.ok) {
        throw new Error(data.error || 'שגיאה כללית בהרצת האוטומציה');
      }
  
      alert('✅ האוטומציה הופעלה בהצלחה! המתן להשלמת הפעולה');
    } catch (err) {
      console.error('❌ שגיאה באוטומציה:', err);
      alert('❌ שגיאה בהפעלת האוטומציה');
    } finally {
      setIsLoading(false);
    }
  };
  
/** לפני שמוסיפים למסד: משייכים אוטומטית ע"פ policyLinkIndex + אימות לקוח */
const preResolveLinks = async (rows: any[], agentId: string) => {
  // בונים key עבור כל שורה שיש לה policyNumber + company
  const keys = Array.from(
    new Set(
      rows
        .map(r => {
          const policyNumber = normalizePolicyNumber(r.policyNumber);
          const company = normCompany(r.company);
          return policyNumber && company ? `${agentId}::${company}::${policyNumber}` : '';
        })
        .filter(Boolean)
    )
  );

  if (keys.length === 0) return rows;

  // שליפת policyLinkIndex ב‑batch
  const idxDocs = await Promise.all(
    keys.map(k => getDoc(doc(db, 'policyLinkIndex', k)))
  );

  // saleIds שנמצאו באינדקס
  const keyToSaleId = new Map<string, string>();
  const saleIds = new Set<string>();
  idxDocs.forEach((snap, i) => {
    if (!snap.exists()) return;
    const saleId = (snap.data() as any)?.saleId;
    if (saleId) {
      keyToSaleId.set(keys[i], saleId);
      saleIds.add(saleId);
    }
  });

  if (saleIds.size === 0) return rows;

  // שליפת ה‑sales הדרושים לאימות customerId
  const saleSnaps = await Promise.all(
    Array.from(saleIds).map(sid => getDoc(doc(db, 'sales', sid)))
  );
  const saleMap = new Map<string, any>();
  saleSnaps.forEach(s => {
    if (s.exists()) saleMap.set(s.id, s.data());
  });

  // החלת הקישור רק אם גם הלקוח תואם (agentId + company + customerId + policyNumber)
  const updated = rows.map(r => {
    const policyNumber = normalizePolicyNumber(r.policyNumber);
    const company = normCompany(r.company);
    const key = policyNumber && company ? `${agentId}::${company}::${policyNumber}` : '';

    const saleId = key ? keyToSaleId.get(key) : undefined;
    if (!saleId) return r;

    const sale = saleMap.get(saleId);
    if (!sale) return r;

    // אימות customerId (מאוד חשוב)
    const rowCustomerId = normalizeCustomerId(r.customerId);
    const saleCustomerId = sale?.IDCustomer ? String(sale.IDCustomer).padStart(9, '0') : '';

    if (rowCustomerId && saleCustomerId && rowCustomerId === saleCustomerId) {
      return { ...r, linkedSaleId: saleId }; // ✅ משייכים ברמת ה‑row
    }
    // לא תואם לקוח → לא משייכים
    return r;
  });

  return updated;
};


  
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
        <select
          value={selectedAgentId}
          onChange={handleAgentChange}
          className="select-input w-full"
        >
          {detail?.role === "admin" && <option value="">בחר סוכן</option>}
          {agents.map(agent => (
            <option key={agent.id} value={agent.id}>{agent.name}</option>
          ))}
        </select>
      </div>
  
      {/* בחירת תבנית
      <div className="mb-4">
        <label className="block font-semibold mb-1">בחר תבנית:</label>
        <select
          value={templateId}
          onChange={e => setTemplateId(e.target.value)}
          className="select-input w-full"
        >
          <option value="">בחר תבנית</option>
          {templateOptions.map(opt => (
            <option key={opt.id} value={opt.id}>{opt.companyName} – {opt.type}</option>
          ))}
        </select>
      </div> */}

{/* בחירת חברה */}
<div className="mb-4">
  <label className="block font-semibold mb-1">בחר חברה:</label>
  <select
    value={selectedCompanyId}
    onChange={(e) => {
      setSelectedCompanyId(e.target.value);
      setTemplateId(''); // איפוס תבנית אם שינו חברה
    }}
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
        <option key={opt.id} value={opt.id}>
          {opt.Name || opt.type}
        </option>
      ))}
    </select>
  </div>
)}
      <Button
  text="הפעל אוטומציה לפי תבנית"
  type="secondary"
  onClick={handleAutoRunByTemplate}
  disabled={isLoading || !selectedTemplate}
/>
      {/* בחירת קובץ */}
      <div className="mb-4">
        <label className="block font-semibold mb-1">בחר קובץ:</label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
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
  
      {/* תצוגה מקדימה של שורות */}
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
  
      {/* ✅ דיאלוג סיכום – תמידי */}
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
    </div>
  );  
};

export default ExcelCommissionImporter;
