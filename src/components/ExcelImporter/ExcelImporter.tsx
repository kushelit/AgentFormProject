import React, { useState, useEffect,useRef  } from "react";
import * as XLSX from "xlsx";
import { addDoc, collection, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from "@/hooks/useFetchAgentData";
import useFetchMD from "@/hooks/useMD";
import {ToastNotification} from '@/components/ToastNotification';
import { useToast } from "@/hooks/useToast";
import DialogNotification from "@/components/DialogNotification";
import './ExcelImporter.css';
import { Button } from "@/components/Button/Button";


const systemFields = [
  "firstNameCustomer", "lastNameCustomer", "IDCustomer", "company", "product",
  "insPremia", "pensiaPremia", "pensiaZvira", "finansimPremia", "finansimZvira",
  "mounth", "statusPolicy", "minuySochen", "notes"
];

const systemFieldsDisplay = [
  { key: "firstNameCustomer", label: "שם פרטי", required: true },
  { key: "lastNameCustomer", label: "שם משפחה", required: true },
  { key: "IDCustomer", label: "ת״ז", required: true },
  { key: "company", label: "חברה", required: true },
  { key: "product", label: "מוצר", required: true },
  { key: "mounth", label: "חודש", required: true },
  { key: "statusPolicy", label: "סטטוס", required: true },
  { key: "minuySochen", label: "מינוי סוכן", required: false },
  { key: "notes", label: "הערות", required: false },
  { key: "insPremia", label: "פרמיית ביטוח", required: false },
  { key: "pensiaPremia", label: "פרמיית פנסיה", required: false },
  { key: "pensiaZvira", label: "צבירה פנסיה", required: false },
  { key: "finansimPremia", label: "פרמיית פיננסים", required: false },
  { key: "finansimZvira", label: "צבירה פיננסים", required: false },
];




const numericFields = [
  "insPremia", "pensiaPremia", "pensiaZvira", "finansimPremia", "finansimZvira"
];

const ExcelImporter: React.FC = () => {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<number[]>([]);
  const { user, detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange, companies } = useFetchAgentData();
  const { products,statusPolicies } = useFetchMD();

  const companyNames = companies.map(c => c.trim().toLowerCase());
  const productNames = products.map((p) => p.name.trim().toLowerCase());
  const [pendingExcelData, setPendingExcelData] = useState<any[] | null>(null);

  const { toasts, addToast, setToasts } = useToast();
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [validRowsCount, setValidRowsCount] = useState(0);

  const [selectedFileName, setSelectedFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null); // ✅ כאן
  const handleFileButtonClick = () => {
    fileInputRef.current?.click(); // ✅ כאן
  };
  // const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  //   const file = e.target.files?.[0];
  //   if (!file) return;
  
  //   const reader = new FileReader();
  //   reader.onload = (evt) => {
  //     const arrayBuffer = evt.target?.result;
  //     if (!arrayBuffer) return;
  
  //     const wb = XLSX.read(arrayBuffer, { type: "array" });
  //     const wsname = wb.SheetNames[0];
  //     const ws = wb.Sheets[wsname];
  //     const jsonData: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
  
  //     // 🔍 הדפסת כותרות
  //     if (jsonData.length > 0) {
  //       console.log("🔎 Headers from Excel:", Object.keys(jsonData[0]));
  //     }
  
  //     if (jsonData.length > 0) {
  //       setHeaders(Object.keys(jsonData[0]));
  //       setPendingExcelData(jsonData); // שמירה גולמית, בלי המרות
  //       setErrors([]);
  //     }      
  //   };
  
  //   reader.readAsArrayBuffer(file); // ✅ שימוש במתודה מודרנית
  // };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
  
    setSelectedFileName(file.name);
  
    const reader = new FileReader();
    reader.onload = (evt) => {
      const arrayBuffer = evt.target?.result;
      if (!arrayBuffer) return;
  
      const wb = XLSX.read(arrayBuffer, { type: "array" });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const jsonData: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
  
      if (jsonData.length > 0) {
        console.log("🔎 Headers from Excel:", Object.keys(jsonData[0]));
        setHeaders(Object.keys(jsonData[0]));
        setPendingExcelData(jsonData);
        setErrors([]);
      }
    };
  
    reader.readAsArrayBuffer(file);
  };
  

  useEffect(() => {
    if (!pendingExcelData || Object.keys(mapping).length === 0) return;
  
    const mappedFieldNames = Object.values(mapping);
    const excelFieldForMounth = Object.keys(mapping).find(
      (col) => mapping[col] === "mounth"
    );
  
    const parsedData = pendingExcelData.map((row) => {
      const newRow = { ...row };
  
      if (excelFieldForMounth) {
        const rawDate = row[excelFieldForMounth];
        let parsedDate: string | undefined = undefined;
  
        if (rawDate instanceof Date) {
          parsedDate = rawDate.toISOString().split("T")[0];
        } else if (typeof rawDate === "number" && !isNaN(rawDate)) {
          const rawStr = rawDate.toString();
          if (/^\d{8}$/.test(rawStr)) {
            const day = rawStr.slice(0, 2);
            const month = rawStr.slice(2, 4);
            const year = rawStr.slice(4, 8);
            parsedDate = `${year}-${month}-${day}`;
          } else {
            const excelDate = XLSX.SSF.parse_date_code(rawDate);
            if (excelDate) {
              const jsDate = new Date(Date.UTC(excelDate.y, excelDate.m - 1, excelDate.d));
              parsedDate = jsDate.toISOString().split("T")[0];
            }
          }
        } else if (typeof rawDate === "string") {
          const cleaned = rawDate.trim();
          if (/^\d{8}$/.test(cleaned)) {
            const day = cleaned.slice(0, 2);
            const month = cleaned.slice(2, 4);
            const year = cleaned.slice(4, 8);
            parsedDate = `${year}-${month}-${day}`;
          } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleaned)) {
            const [day, month, year] = cleaned.split("/");
            parsedDate = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
            parsedDate = cleaned;
          }
        }
  
        if (parsedDate) {
          newRow[excelFieldForMounth] = parsedDate;
        }
      }
  
          // ברירת מחדל למינוי סוכן אם הוא ריק
    const excelFieldForMinuy = Object.keys(mapping).find(
      (col) => mapping[col] === "minuySochen"
    );
    if (
      excelFieldForMinuy &&
      (newRow[excelFieldForMinuy] === undefined ||
        newRow[excelFieldForMinuy] === null ||
        newRow[excelFieldForMinuy] === "")
    ) {
      newRow[excelFieldForMinuy] = "לא";
    }

      return newRow;
    });
  
    console.log("✅ FINAL PARSED mounths:", parsedData.map((r) => {
      const col = Object.keys(mapping).find((k) => mapping[k] === "mounth") || "";
      return r[col];
    }));
  
    setRows(parsedData);
    setPendingExcelData(null);
  }, [pendingExcelData, mapping]);
  
  useEffect(() => {
    if (rows.length > 0 && Object.keys(mapping).length > 0) {
      checkAllRows(rows, mapping);
    }
  }, [rows, mapping]);
  
  
  const handleMappingChange = (excelHeader: string, mappedField: string) => {
    // הסרה של מיפוי ישן שיכל להיות על אותו שדה מערכת
    const newMapping = Object.fromEntries(
      Object.entries(mapping).filter(([k, v]) => v !== mappedField)
    );
    newMapping[excelHeader] = mappedField;
    setMapping(newMapping);
    checkAllRows(rows, newMapping);
  };
  

  const isValidHebrewName = (value: any) => {
    const str = String(value || "").trim();
    if (!str) return false;
    const hebrewRegex = /^[\u0590-\u05FF ]+$/;
    return hebrewRegex.test(str);
  };
  

  const validateRow = (row: any, map: Record<string, string>) => {
    const reverseMap = Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
    const required = ["firstNameCustomer", "lastNameCustomer", "IDCustomer", "company", "product", "mounth", "statusPolicy"];
  
    const hasRequired = required.every((key) => {
      const source = reverseMap[key];
      if (!source) return true; // אם לא מופה, לא נבדוק עדיין
      return row[source] !== undefined && String(row[source]).trim() !== "";
    });
    
  
    const companyValue = String(row[reverseMap["company"]] || "").toLowerCase().trim();
    const productValue = String(row[reverseMap["product"]] || "").toLowerCase().trim();
    const idValue = String(row[reverseMap["IDCustomer"]] || "").trim();
  
    const validCompany = !reverseMap["company"] || companyNames.includes(companyValue);
    const validProduct = !reverseMap["product"] || productNames.includes(productValue);
    const validID = !reverseMap["IDCustomer"] || (/^\d{5,9}$/.test(idValue));
  
    const validFirstName = !reverseMap["firstNameCustomer"] || isValidHebrewName(row[reverseMap["firstNameCustomer"]]);
    const validLastName = !reverseMap["lastNameCustomer"] || isValidHebrewName(row[reverseMap["lastNameCustomer"]]);
    
    const mounthValue = String(row[reverseMap["mounth"]] || "").trim();
    const validMounth = !reverseMap["mounth"] || /^\d{4}-\d{2}-\d{2}$/.test(mounthValue);
    
    const statusValue = String(row[reverseMap["statusPolicy"]] || "").trim();
    const validStatus = !reverseMap["statusPolicy"] || statusPolicies.includes(statusValue);
  
    const minuyValue = String(row[reverseMap["minuySochen"]] || "").trim();
    const validMinuySochen =
      !reverseMap["minuySochen"] || minuyValue === "" || ["כן", "לא"].includes(minuyValue);    

    return hasRequired && validCompany && validProduct && validID && validFirstName && validLastName && validMounth && validStatus && validMinuySochen;
  };

  const checkAllRows = (data: any[], map: Record<string, string>) => {
    const reverseMap = Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));
  
    const invalids = data.reduce<number[]>((acc, row, idx) => {
      if (!validateRow(row, map)) acc.push(idx);
      return acc;
    }, []);
  
    setErrors(invalids);
  };
  
  
  
  const handleFieldChange = (rowIdx: number, field: string, value: string) => {
    const updatedRows = [...rows];
    updatedRows[rowIdx][field] = value;
    setRows(updatedRows);
    checkAllRows(updatedRows, mapping);
  };

  const handleDeleteRow = (rowIdx: number) => {
    const updatedRows = rows.filter((_, idx) => idx !== rowIdx);
    setRows(updatedRows);
    checkAllRows(updatedRows, mapping);
  };

  // const handleImport = async () => {
  //   const required = [
  //     "firstNameCustomer",
  //     "lastNameCustomer",
  //     "IDCustomer",
  //     "company",
  //     "product",
  //     "mounth",
  //     "statusPolicy"
  //   ];
  //   const reverseMap = Object.fromEntries(Object.entries(mapping).map(([k, v]) => [v, k]));
  //   const allRequiredMapped = required.every((key) => reverseMap[key]);
  
  //   if (!allRequiredMapped) {
  //     addToast("error", "יש שדות חובה שלא מופו – אנא השלימי את המיפוי לפני טעינה.");
  //     // alert("יש שדות חובה שלא מופו – אנא השלימי את המיפוי לפני טעינה.");
  //     return;
  //   }
  
  //   if (errors.length > 0) {
  //     addToast("error", "יש שורות עם שגיאות. תקני או מחקי אותן לפני טעינה");
  //     // alert("יש שורות עם שגיאות. תקני או מחקי אותן לפני טעינה.");
  //     return;
  //   }
  
  //   if (!selectedAgentId || selectedAgentId === "all") {
  //     addToast("warning", "בחר סוכן לפני טעינה");
  //     // alert("בחרי סוכן לפני טעינה");
  //     return;
  //   }
  
  //   // ✅ אישור לפני טעינה
  //   const validRows = rows.filter((_, i) => !errors.includes(i));
  //   const validRowsCount = validRows.length;
    
  //   const confirmMessage = `עומדות להיטען ${validRowsCount} עסקאות למערכת.\nהאם לאשר?`;
  //   const confirmed = window.confirm(confirmMessage);
  //   if (!confirmed) return;

 
  //   // ✅ התחלת טעינה
  //   const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);
  //   const selectedAgentName = selectedAgent?.name || "";
  
  //   let successCount = 0;
  //   const failedRows: { index: number; error: any }[] = [];
  
  //   for (let i = 0; i < rows.length; i++) {
  //     if (errors.includes(i)) continue;
  
  //     const originalRow = rows[i];
  //     const mappedRow: any = {};
  //     for (const [excelCol, systemField] of Object.entries(mapping)) {
  //       mappedRow[systemField] = String(originalRow[excelCol] ?? "").trim();
  //     }
  
  //     try {
  //       const customerQuery = query(
  //         collection(db, 'customer'),
  //         where('IDCustomer', '==', mappedRow.IDCustomer),
  //         where('AgentId', '==', selectedAgentId)
  //       );
  //       const customerSnapshot = await getDocs(customerQuery);
  
  //       let customerDocRef;
  //       if (customerSnapshot.empty) {
  //         customerDocRef = await addDoc(collection(db, "customer"), {
  //           AgentId: selectedAgentId,
  //           firstNameCustomer: mappedRow.firstNameCustomer || "",
  //           lastNameCustomer: mappedRow.lastNameCustomer || "",
  //           IDCustomer: String(mappedRow.IDCustomer || ""),
  //           parentID: "",
  //           sourceApp: "importExcel",
  //         });
  //         await updateDoc(customerDocRef, { parentID: customerDocRef.id });
  //       }
  
  //       await addDoc(collection(db, 'sales'), {
  //         agent: selectedAgentName,
  //         AgentId: selectedAgentId,
  //         workerId: mappedRow.workerId || "",
  //         workerName: mappedRow.workerName || "",
  //         firstNameCustomer: mappedRow.firstNameCustomer || "",
  //         lastNameCustomer: mappedRow.lastNameCustomer || "",
  //         IDCustomer: mappedRow.IDCustomer || "",
  //         company: mappedRow.company || "",
  //         product: mappedRow.product || "",
  //         insPremia: mappedRow.insPremia || 0,
  //         pensiaPremia: mappedRow.pensiaPremia || 0,
  //         pensiaZvira: mappedRow.pensiaZvira || 0,
  //         finansimPremia: mappedRow.finansimPremia || 0,
  //         finansimZvira: mappedRow.finansimZvira || 0,
  //         mounth: mappedRow.mounth || "",
  //         minuySochen: String(mappedRow.minuySochen || "").trim() === "כן",
  //         statusPolicy: mappedRow.statusPolicy || "",
  //         notes: mappedRow.notes || "",
  //         createdAt: serverTimestamp(),
  //         lastUpdateDate: serverTimestamp(),
  //         sourceApp: "importExcel",
  //       });
  
  //       successCount++;
  //     } catch (error) {
  //       console.error(`❌ שגיאה בשורה ${i + 1}:`, error);
  //       failedRows.push({ index: i + 1, error });
  //     }
  //   }
  
  //   // ✅ הודעת סיכום
  //   if (failedRows.length > 0) {
  //     const errorSummary = failedRows
  //       .map((row) => `שורה ${row.index}: ${row.error?.message || "שגיאה לא ידועה"}`)
  //       .join("\n");
    
  //     addToast("warning", `טעינה הסתיימה:\n✅ ${successCount} עסקאות הוזנו\n❌ ${failedRows.length} נכשלו. בדקי בלוג.`);
    
  //     // הצגה בקונסול למפתחת (פירוט שגיאות מלא)
  //     console.group("❌ פירוט שורות שנכשלו");
  //     failedRows.forEach((row) => {
  //       console.error(`שורה ${row.index}:`, row.error);
  //     });
  //     console.groupEnd();
  //   } else {
  //     addToast("success", `✅ כל ${successCount} העסקאות הוזנו בהצלחה!`);
  //   }
    
  // };

  const handleImport = async () => {
    const required = [
      "firstNameCustomer",
      "lastNameCustomer",
      "IDCustomer",
      "company",
      "product",
      "mounth",
      "statusPolicy"
    ];
  
    const reverseMap = Object.fromEntries(Object.entries(mapping).map(([k, v]) => [v, k]));
    const allRequiredMapped = required.every((key) => reverseMap[key]);
  
    if (!allRequiredMapped) {
      addToast("error", "יש שדות חובה שלא מופו – אנא השלימי את המיפוי לפני טעינה.");
      return;
    }
  
    if (errors.length > 0) {
      addToast("error", "יש שורות עם שגיאות. תקני או מחקי אותן לפני טעינה");
      return;
    }
  
    if (!selectedAgentId || selectedAgentId === "all") {
      addToast("warning", "בחר סוכן לפני טעינה");
      return;
    }
  
    const validRows = rows.filter((_, i) => !errors.includes(i));
    setValidRowsCount(validRows.length);
    setImportDialogOpen(true); // זה פותח את הדיאלוג
    return;
  };
  
  const continueImport = async () => {
    setImportDialogOpen(false);
  
    const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);
    const selectedAgentName = selectedAgent?.name || "";
  
    let successCount = 0;
    const failedRows: { index: number; error: any }[] = [];
  
    for (let i = 0; i < rows.length; i++) {
      if (errors.includes(i)) continue;
  
      const originalRow = rows[i];
      const mappedRow: any = {};
      for (const [excelCol, systemField] of Object.entries(mapping)) {
        mappedRow[systemField] = String(originalRow[excelCol] ?? "").trim();
      }
  
      try {
        const customerQuery = query(
          collection(db, 'customer'),
          where('IDCustomer', '==', mappedRow.IDCustomer),
          where('AgentId', '==', selectedAgentId)
        );
        const customerSnapshot = await getDocs(customerQuery);
  
        let customerDocRef;
        if (customerSnapshot.empty) {
          customerDocRef = await addDoc(collection(db, "customer"), {
            AgentId: selectedAgentId,
            firstNameCustomer: mappedRow.firstNameCustomer || "",
            lastNameCustomer: mappedRow.lastNameCustomer || "",
            IDCustomer: String(mappedRow.IDCustomer || ""),
            parentID: "",
            sourceApp: "importExcel",
          });
          await updateDoc(customerDocRef, { parentID: customerDocRef.id });
        }
  
        await addDoc(collection(db, 'sales'), {
          agent: selectedAgentName,
          AgentId: selectedAgentId,
          workerId: mappedRow.workerId || "",
          workerName: mappedRow.workerName || "",
          firstNameCustomer: mappedRow.firstNameCustomer || "",
          lastNameCustomer: mappedRow.lastNameCustomer || "",
          IDCustomer: mappedRow.IDCustomer || "",
          company: mappedRow.company || "",
          product: mappedRow.product || "",
          insPremia: mappedRow.insPremia || 0,
          pensiaPremia: mappedRow.pensiaPremia || 0,
          pensiaZvira: mappedRow.pensiaZvira || 0,
          finansimPremia: mappedRow.finansimPremia || 0,
          finansimZvira: mappedRow.finansimZvira || 0,
          mounth: mappedRow.mounth || "",
          minuySochen: String(mappedRow.minuySochen || "").trim() === "כן",
          statusPolicy: mappedRow.statusPolicy || "",
          notes: mappedRow.notes || "",
          createdAt: serverTimestamp(),
          lastUpdateDate: serverTimestamp(),
          sourceApp: "importExcel",
        });
  
        successCount++;
      } catch (error) {
        console.error(`❌ שגיאה בשורה ${i + 1}:`, error);
        failedRows.push({ index: i + 1, error });
      }
    }
  
    if (failedRows.length > 0) {
      const errorSummary = failedRows
        .map((row) => `שורה ${row.index}: ${row.error?.message || "שגיאה לא ידועה"}`)
        .join("\n");
  
      addToast("warning", `טעינה הסתיימה:\n✅ ${successCount} עסקאות הוזנו\n❌ ${failedRows.length} נכשלו. בדקי בלוג.`);
  
      console.group("❌ פירוט שורות שנכשלו");
      failedRows.forEach((row) => {
        console.error(`שורה ${row.index}:`, row.error);
      });
      console.groupEnd();
    } else {
      addToast("success", `✅ כל ${successCount} העסקאות הוזנו בהצלחה!`);
    }
  };
  
  
  useEffect(() => {
    if (rows.length > 0 && Object.keys(mapping).length > 0) {
      checkAllRows(rows, mapping);
    }
  }, [rows, mapping]);

  const validRows = rows.filter((_, idx) => !errors.includes(idx));

  return (
    <div className="table-header">
      <h2 className="table-title">ייבוא קובץ Excel</h2>

      <div className="flex justify-end gap-4 mb-6 items-start text-right">
      <div className="filter-select-container">
    <select
      onChange={handleAgentChange}
      value={selectedAgentId}
      className="select-input"
    >
      {detail?.role === "admin" && <option value="">בחר סוכן</option>}
      {detail?.role === "admin" && <option value="all">כל הסוכנות</option>}
      {agents.map((agent) => (
        <option key={agent.id} value={agent.id}>
          {agent.name}
        </option>
      ))}
    </select>
  </div>

  {/* בחר קובץ */}
  <div className="flex flex-col items-end">
    <input
      ref={fileInputRef}
      type="file"
      accept=".xlsx,.xls"
      onChange={handleFileUpload}
      className="hidden"
    />
    <Button
      text="בחר קובץ Excel"
      type="primary"
      icon="on"
      state="default"
      onClick={handleFileButtonClick}
    />
    {selectedFileName && (
      <p className="text-sm text-gray-600 mt-1 flex items-center gap-1">
        <span>{selectedFileName}</span> <span>📁</span>
      </p>
    )}
  </div>
</div>
      {headers.length > 0 && (
        <div className="mb-6">
         <h3 className="font-semibold mb-2">מיפוי שדות</h3>
<table border={1} className="w-full text-right">
  <thead>
    <tr>
      <th>שדה במערכת</th>
      <th>חובה</th>
      <th>שדה בקובץ Excel</th>
    </tr>
  </thead>
  <tbody>
    {systemFieldsDisplay.map(({ key, label, required }) => {
      const mappedExcelField = Object.keys(mapping).find((col) => mapping[col] === key) || "";
      return (
        <tr key={key}>
          <td>{label}</td>
          <td style={{ color: required ? 'red' : 'gray' }}>{required ? 'חובה' : 'רשות'}</td>
          <td>
            <select
              value={mappedExcelField}
              onChange={(e) => handleMappingChange(e.target.value, key)}
            >
              <option value="">בחר עמודה</option>
              {headers.map((col) => (
                <option key={col} value={col}>{col}</option>
              ))}
            </select>
          </td>
        </tr>
      );
    })}
  </tbody>
</table>
        </div>
      )}
      {rows.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">כל הנתונים ({rows.length} שורות)</h3>
          <table border={1} className="w-full text-sm text-right">
            <thead>
              <tr>
                {headers.map((h) => <th key={h}>{h}</th>)}
                <th>מחיקה</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const rowIsError = errors.includes(idx);
                return (
                  <tr key={idx} style={{ backgroundColor: rowIsError ? '#ffd6d6' : 'inherit' }}>
                    {headers.map((h) => {
                      const field = mapping[h];
                      const rawValue = row[h];
                      const value = String(rawValue || "").trim().toLowerCase();
                      const isInvalidCompany = field === "company" && !companyNames.includes(value);
                      const isInvalidProduct = field === "product" && !productNames.includes(value);
                      const isInvalidID = field === "IDCustomer" && !/^\d{5,9}$/.test(value);
                      const inputStyle = {
                        width: '100%',
                        backgroundColor: (isInvalidCompany || isInvalidProduct || isInvalidID) ? '#ffe6e6' : undefined,
                      };
                                            return (
                                              <td key={h}>
                                              {(() => {
                                                const rawValue = row[h];
                                                const value = String(rawValue || "").trim().toLowerCase();
                                                const field = mapping[h];
                                            
                                                const isInvalidCompany = field === "company" && !companyNames.includes(value);
                                                const isInvalidProduct = field === "product" && !productNames.includes(value);
                                                const isInvalidID = field === "IDCustomer" && !/^\d{5,9}$/.test(value);
                                                const isInvalidFirstName = field === "firstNameCustomer" && !isValidHebrewName(rawValue);
                                                const isInvalidLastName = field === "lastNameCustomer" && !isValidHebrewName(rawValue);
                                                const isNumericField = numericFields.includes(field);
                                                const isInvalidNumber = isNumericField && isNaN(Number(rawValue));
                                                const isInvalidStatus = field === "statusPolicy" && !statusPolicies.includes(String(rawValue || "").trim());
                                            
                                                const inputStyle = {
                                                  width: '100%',
                                                  backgroundColor: (
                                                    isInvalidCompany ||
                                                    isInvalidProduct ||
                                                    isInvalidID ||
                                                    isInvalidFirstName ||
                                                    isInvalidLastName ||
                                                    isInvalidNumber ||
                                                    isInvalidStatus
                                                  ) ? '#ffe6e6' : undefined,
                                                };
                                            
                                                if (field === "mounth") {
                                                  return (
                                                    <input
                                                      type="date"
                                                      value={row[h]}
                                                      style={inputStyle}
                                                      onChange={(e) => handleFieldChange(idx, h, e.target.value)}
                                                    />
                                                  );
                                                }
                                            
                                                if (isInvalidCompany) {
                                                  return (
                                                    <select value={row[h]} onChange={(e) => handleFieldChange(idx, h, e.target.value)} style={inputStyle}>
                                                      <option value="">בחר חברה</option>
                                                      {companies.map((c) => <option key={c} value={c}>{c}</option>)}
                                                    </select>
                                                  );
                                                }
                                            
                                                if (isInvalidProduct) {
                                                  return (
                                                    <select value={row[h]} onChange={(e) => handleFieldChange(idx, h, e.target.value)} style={inputStyle}>
                                                      <option value="">בחר מוצר</option>
                                                      {products.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                                                    </select>
                                                  );
                                                }
                                            
                                                if (isInvalidStatus) {
                                                  return (
                                                    <select value={row[h]} onChange={(e) => handleFieldChange(idx, h, e.target.value)} style={inputStyle}>
                                                      <option value="">בחר סטטוס</option>
                                                      {statusPolicies.map((s, i) => (
                                                        <option key={i} value={s}>{s}</option>
                                                      ))}
                                                    </select>
                                                  );
                                                }
                                                if (field === "minuySochen") {
                                                  return (
                                                    <select
                                                      value={row[h] || ""}
                                                      onChange={(e) => handleFieldChange(idx, h, e.target.value)}
                                                      style={inputStyle}
                                                    >
                                                      <option value="">---</option>
                                                      <option value="כן">כן</option>
                                                      <option value="לא">לא</option>
                                                    </select>
                                                  );
                                                }
                                                
                                                return (
                                                  <input
                                                    type={isNumericField ? "number" : "text"}
                                                    value={row[h]}
                                                    style={inputStyle}
                                                    onChange={(e) => handleFieldChange(idx, h, e.target.value)}
                                                    maxLength={field === "IDCustomer" ? 9 : undefined}
                                                  />
                                                );
                                              })()}
                                            </td>                                                                                                                                                                                       
                      );
                    })}
                    <td><button onClick={() => handleDeleteRow(idx)}>X</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {Object.keys(mapping).length > 0 && validRows.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold mb-2">תצוגה מקדימה של הנתונים התקינים שייטענו ({validRows.length} שורות)</h3>
              <table border={1} className="w-full text-sm text-right">
                <thead>
                  <tr>
                    {Object.values(mapping).map((mappedField) => (
                      <th key={mappedField}>{mappedField}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {validRows.map((row, idx) => (
                    <tr key={idx}>
                      {Object.entries(mapping).map(([excelHeader, systemField]) => (
                        <td key={systemField}>{row[excelHeader]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {errors.length > 0 && <p className="text-red-600 mt-2">יש שורות עם שגיאות – תקני או מחקי אותן לפני טעינה.</p>}

          <button
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded disabled:bg-gray-400"
            onClick={handleImport}
            disabled={errors.length > 0}
          >
            אשר טעינה
          </button>
          {importDialogOpen && (
  <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
    <DialogNotification
      type="warning"
      title="אישור טעינה"
      message={`עומדות להיטען ${validRowsCount} עסקאות למערכת.\nהאם לאשר?`}
      onConfirm={continueImport}
      onCancel={() => setImportDialogOpen(false)}
      confirmText="אשר טעינה"
      cancelText="ביטול"
    />
  </div>
)}
        </div>
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

export default ExcelImporter;
