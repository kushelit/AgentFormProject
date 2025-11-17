import React, { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { addDoc, collection, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from "@/hooks/useFetchAgentData";
import useFetchMD from "@/hooks/useMD";
import { ToastNotification } from '@/components/ToastNotification';
import { useToast } from "@/hooks/useToast";
import DialogNotification from "@/components/DialogNotification";
import './ExcelImporter.css';
import { Button } from "@/components/Button/Button";
import { doc } from "firebase/firestore";
import { fetchSourceLeadsForAgent } from '@/services/sourceLeadService';


const systemFields = [
  "firstNameCustomer", "lastNameCustomer", "IDCustomer", "company", "product",
  "insPremia", "pensiaPremia", "pensiaZvira", "finansimPremia", "finansimZvira",
  "mounth", "statusPolicy", "minuySochen", "notes", "workerName", "sourceLeadName", "cancellationDate"
];

const systemFieldsDisplay = [
  { key: "firstNameCustomer", label: "שם פרטי", required: true },
  { key: "lastNameCustomer", label: "שם משפחה", required: true },
  { key: "fullName", label: "שם מלא", required: false },
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
  { key: "workerName", label: "עובד", required: false },
  { key: "sourceLeadName", label: "מקור ליד", required: false }, 
  { key: "cancellationDate", label: "תאריך ביטול", required: false }, 

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
  const { agents, selectedAgentId, handleAgentChange, companies, workers, workerNameMap } = useFetchAgentData();
  const { products, statusPolicies } = useFetchMD();

  const companyNames = companies.map(c => c.trim().toLowerCase());
  const productNames = products.map((p) => p.name.trim().toLowerCase());
  const workerNames = workers.map(w => w.name.trim().toLowerCase());
  const [pendingExcelData, setPendingExcelData] = useState<any[] | null>(null);

  const { toasts, addToast, setToasts } = useToast();
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [validRowsCount, setValidRowsCount] = useState(0);

  const [selectedFileName, setSelectedFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleFileButtonClick = () => {
    fileInputRef.current?.click();
  };

  const [fullNameStructure, setFullNameStructure] = useState<"firstNameFirst" | "lastNameFirst">("firstNameFirst");

  const [importSummary, setImportSummary] = useState<{
    count: number;
    uniqueCustomers: number;
    dateRange: [Date, Date];
    companies: string[];
    products: string[];
    workers: string[];
    agentName: string;
  } | null>(null);


  const [sourceLeads, setSourceLeads] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);

useEffect(() => {
  const fetchLeads = async () => {
    if (!selectedAgentId) return;
    const data = await fetchSourceLeadsForAgent(selectedAgentId);
    setSourceLeads(data.map(item => String(item.sourceLead || "").toLowerCase().trim()));
  };
  fetchLeads();
}, [selectedAgentId]);


  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true); // ← התחלת טעינה
    setSelectedFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const arrayBuffer = evt.target?.result;
      if (!arrayBuffer) {
        setIsParsing(false); // ← סיום גם במקרה שגיאה
        return;
      }
      const wb = XLSX.read(arrayBuffer, { type: "array" });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const jsonData: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (jsonData.length > 0) {
        // console.log("🔎 Headers from Excel:", Object.keys(jsonData[0]));
        setHeaders(Object.keys(jsonData[0]));
        setPendingExcelData(jsonData);
        setErrors([]);
      }
      setIsParsing(false); // ← סיום הטעינה

    };

    reader.readAsArrayBuffer(file);
  };

  const clearFile = () => {
    setSelectedFileName("");
    setPendingExcelData(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setErrors([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };



  // type ParsedDateResult = {
  //   value?: string;
  //   error?: string;
  // };

  // const parseMounthField = (value: any): ParsedDateResult => {
  //   if (value instanceof Date) {
  //     return { value: value.toISOString().split("T")[0] };
  //   }

  //   if (typeof value === "number" && !isNaN(value)) {
  //     const rawStr = value.toString();
  //     if (/^\d{8}$/.test(rawStr)) {
  //       const day = rawStr.slice(0, 2);
  //       const month = rawStr.slice(2, 4);
  //       const year = rawStr.slice(4, 8);
  //       return { value: `${year}-${month}-${day}` };
  //     }
  //     const excelDate = XLSX.SSF.parse_date_code(value);
  //     if (excelDate) {
  //       const jsDate = new Date(Date.UTC(excelDate.y, excelDate.m - 1, excelDate.d));
  //       return { value: jsDate.toISOString().split("T")[0] };
  //     }
  //   }

  //   if (typeof value === "string") {
  //     const cleaned = value.trim();
  //     if (/^\d{8}$/.test(cleaned)) {
  //       const day = cleaned.slice(0, 2);
  //       const month = cleaned.slice(2, 4);
  //       const year = cleaned.slice(4, 8);
  //       return { value: `${year}-${month}-${day}` };
  //     }
  //     if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleaned)) {
  //       const [day, month, year] = cleaned.split("/");
  //       return { value: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` };
  //     }
  //     if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
  //       return { value: cleaned };
  //     }
  //     return { error: `תאריך לא תקין: ${value}` };
  //   }

  //   return { error: `תאריך לא מזוהה: ${String(value)}` };
  // };


  type ParsedDateResult = { value?: string; error?: string };

  const parseDateField = (value: any): ParsedDateResult => {
    // ✅ ריק / null / undefined → מותר, בלי שגיאה
    if (
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim() === "")
    ) {
      return { value: "" };
    }
  
    if (value instanceof Date) {
      return { value: value.toISOString().split("T")[0] }; // YYYY-MM-DD
    }
  
    if (typeof value === "number" && !isNaN(value)) {
      const rawStr = value.toString();
  
      if (/^\d{8}$/.test(rawStr)) {
        const day = rawStr.slice(0, 2);
        const month = rawStr.slice(2, 4);
        const year = rawStr.slice(4, 8);
        return { value: `${year}-${month}-${day}` };
      }
  
      const excelDate = XLSX.SSF.parse_date_code(value);
      if (excelDate) {
        const jsDate = new Date(Date.UTC(excelDate.y, excelDate.m - 1, excelDate.d));
        return { value: jsDate.toISOString().split("T")[0] };
      }
    }
  
    if (typeof value === "string") {
      const cleaned = value.trim();
  
      if (/^\d{8}$/.test(cleaned)) {
        const day = cleaned.slice(0, 2);
        const month = cleaned.slice(2, 4);
        const year = cleaned.slice(4, 8);
        return { value: `${year}-${month}-${day}` };
      }
  
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(cleaned)) {
        const [day, month, year] = cleaned.split("/");
        return { value: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` };
      }
  
      if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
        return { value: cleaned };
      }
  
      return { error: `תאריך לא תקין: ${value}` };
    }
  
    return { error: `תאריך לא מזוהה: ${String(value)}` };
  };
  

// לשימור תאימות אחורה (אם פונקציות אחרות משתמשות בשם הישן):
const parseMounthField = parseDateField;


  const splitFullName = (
    fullNameRaw: string,
    structure: "firstNameFirst" | "lastNameFirst"
  ) => {
    const parts = fullNameRaw.trim().split(" ").filter(Boolean);
    let firstName = "";
    let lastName = "";
  
    if (parts.length === 1) {
      firstName = parts[0];
      lastName = "";
    } else if (parts.length === 2) {
      if (structure === "firstNameFirst") {
        firstName = parts[0];
        lastName = parts[1];
      } else {
        firstName = parts[1];
        lastName = parts[0];
      }
    } else if (parts.length === 3) {
      if (structure === "firstNameFirst") {
        firstName = parts[0];
        lastName = parts.slice(1).join(" ");
      } else {
        firstName = parts.slice(2).join(" ");
        lastName = parts.slice(0, 2).join(" ");
      }
    } else {
      // 4 מילים ומעלה
      if (structure === "firstNameFirst") {
        firstName = parts[0];
        lastName = parts.slice(1).join(" ");
      } else {
        firstName = parts.slice(-1).join(" ");
        lastName = parts.slice(0, -1).join(" ");
      }
    }
    // console.log(`💡 Full name "${fullNameRaw}" split as → First: ${firstName}, Last: ${lastName}`);

    return { firstName, lastName };
  };
  
  useEffect(() => {
    if (!rows.length || !Object.values(mapping).includes("fullName")) return;
  
    const updatedRows = rows.map((row) => {
      const fullNameField = Object.keys(mapping).find((col) => mapping[col] === "fullName");
      if (!fullNameField) return row;
  
      const fullNameRaw = row[fullNameField]?.trim() || "";
      const { firstName, lastName } = splitFullName(fullNameRaw, fullNameStructure);
  
      return {
        ...row,
        firstNameCustomer: firstName,
        lastNameCustomer: lastName,
      };
    });
  
    setRows(updatedRows);
  }, [fullNameStructure]);
  


  useEffect(() => {
  //   console.log("📌 useEffect triggered", { pendingExcelData, areAllRequiredFieldsMapped });
  //   console.log("📌 required fields missing?", {
  //     requiredFields,
  //     mapping,
  //     fullNameMapped,
  //     areAllRequiredFieldsMapped
  //   }
  // );

    if (!pendingExcelData || !areAllRequiredFieldsMapped) return;

    const parsedData = pendingExcelData.map((row) => {
      const newRow = { ...row };

      // Trim all string fields
  Object.keys(newRow).forEach((key) => {
    if (typeof newRow[key] === "string") {
      newRow[key] = newRow[key].trim();
    }
  });
      const fullNameField = Object.keys(mapping).find((col) => mapping[col] === "fullName");
      if (fullNameField) {
        const fullNameRaw = row[fullNameField]?.trim() || "";
        const { firstName, lastName } = splitFullName(fullNameRaw, fullNameStructure);
        newRow["firstNameCustomer"] = firstName;
        newRow["lastNameCustomer"] = lastName;
      }
      // עיבוד שדה תאריך
      const excelFieldForMounth = Object.keys(mapping).find(
        (col) => mapping[col] === "mounth"
      );

      if (excelFieldForMounth) {
        const rawDate = row[excelFieldForMounth];
        const parsedDate = parseMounthField(rawDate);
        newRow[excelFieldForMounth] = parsedDate.value || rawDate
        newRow["mounth"] = parsedDate.value || rawDate; 
        if (parsedDate.error) {
          newRow["_mounthError"] = parsedDate.error;
        }
      }
// ... בתוך ה-map של parsedData
// עיבוד שדה תאריך "cancellationDate"
const excelFieldForCancellation = Object.keys(mapping).find(
  (col) => mapping[col] === "cancellationDate"
);
if (excelFieldForCancellation) {
  const rawCancelDate = row[excelFieldForCancellation];
  const parsedCancel = parseDateField(rawCancelDate);
  newRow[excelFieldForCancellation] = parsedCancel.value ?? rawCancelDate;
  newRow["cancellationDate"] = parsedCancel.value ?? rawCancelDate; // לשמירה תקנית
  if (parsedCancel.error) {
    newRow["_cancellationDateError"] = parsedCancel.error;
  }
}
      // עיבוד שדה עובד
      const workerField = Object.keys(mapping).find((col) => mapping[col] === "workerName");
      if (workerField) {
        const workerName = String(row[workerField] || "").trim();
        newRow[workerField] = workerName;
        const worker = workers.find(w => w.name.toLowerCase() === workerName.toLowerCase());
        if (worker) {
          newRow["workerId"] = worker.id;
          newRow["workerName"] = worker.name;
        } else {
          newRow["_workerError"] = `עובד לא מזוהה: ${workerName}`;
        }
      }
      // עיבוד שדה מקור ליד
const sourceLeadField = Object.keys(mapping).find(col => mapping[col] === "sourceLeadName");
if (sourceLeadField) {
  const leadName = String(row[sourceLeadField] || "").trim();
  newRow[sourceLeadField] = leadName;
  if (!sourceLeads.includes(leadName.toLowerCase())) {
    newRow["_sourceLeadError"] = `מקור ליד לא מזוהה: ${leadName}`;
  }
}

      applyDefaultMinuySochen(newRow, mapping);
      return newRow;
    });
    // console.log("🔍 fullNameStructure at parse time:", fullNameStructure);
    setRows(parsedData);
    checkAllRows(parsedData, mapping);
    // console.log("🔍 parsedData example (first row):", parsedData[0]);
    // console.log("✅ parsedData:", parsedData);
    // setPendingExcelData(null);
  }, [pendingExcelData, mapping, fullNameStructure, workers]);

  const applyDefaultMinuySochen = (row: any, mapping: Record<string, string>): void => {
    const minuyField = Object.keys(mapping).find(col => mapping[col] === "minuySochen");
    if (
      minuyField &&
      (row[minuyField] === undefined ||
        row[minuyField] === null ||
        row[minuyField] === "")
    ) {
      row[minuyField] = "לא";
    }
  };

  const requiredFields = systemFieldsDisplay
    .filter((field) => field.required)
    .map((field) => field.key);

  const fullNameMapped = Object.values(mapping).includes("fullName");

  const areAllRequiredFieldsMapped = requiredFields.every((fieldKey) => {
    if (["firstNameCustomer", "lastNameCustomer"].includes(fieldKey) && fullNameMapped) {
      return true;
    }
    return Object.values(mapping).includes(fieldKey);
  });

  useEffect(() => {
    if (rows.length > 0 && Object.keys(mapping).length > 0) {
      checkAllRows(rows, mapping);
    }
  }, [rows, mapping]);

  const handleMappingChange = (excelHeader: string, mappedField: string) => {
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
  const validateRow = (
    row: any,
    map: Record<string, string>,
    reverseMap: Record<string, string>
  ) => {
    // console.log("🔎 Validating row:", row);
  
    const required = ["firstNameCustomer", "lastNameCustomer", "IDCustomer", "company", "product", "mounth", "statusPolicy"];
  
    const hasRequired = required.every((key) => {
      const source = reverseMap[key];
      if (!source) return true;
      return row[source] !== undefined && String(row[source]).trim() !== "";
    });
  
    const companyValue = String(row[reverseMap["company"]] || "").toLowerCase().trim();
    const productValue = String(row[reverseMap["product"]] || "").toLowerCase().trim();
    const idValue = String(row[reverseMap["IDCustomer"]] || "").trim();
    const workerValue = reverseMap["workerName"] ? String(row[reverseMap["workerName"]] || "").trim().toLowerCase() : "";
    const sourceLeadValue = reverseMap["sourceLeadName"] ? String(row[reverseMap["sourceLeadName"]] || "").trim().toLowerCase() : "";
    const statusValue = String(row[reverseMap["statusPolicy"]] || "").trim();
    const firstNameValue = String(row[reverseMap["firstNameCustomer"]] || "").trim();
    const lastNameValue = String(row[reverseMap["lastNameCustomer"]] || "").trim();
    const minuyValue = reverseMap["minuySochen"] ? String(row[reverseMap["minuySochen"]] || "").trim() : "";
  
    const validCompany = !reverseMap["company"] || companyNames.includes(companyValue);
    const validProduct = !reverseMap["product"] || productNames.includes(productValue);
    const validID = !reverseMap["IDCustomer"] || /^\d{5,9}$/.test(idValue);
    const validWorker = !reverseMap["workerName"] || workerNames.includes(workerValue);
    const validSourceLead = !reverseMap["sourceLeadName"] || sourceLeadValue === "" || sourceLeads.includes(sourceLeadValue);
    const validFirstName = !reverseMap["firstNameCustomer"] || isValidHebrewName(firstNameValue);
    const validLastName = !reverseMap["lastNameCustomer"] || isValidHebrewName(lastNameValue);
    const validMounth = /^\d{4}-\d{2}-\d{2}$/.test(String(row["mounth"] || "").trim());
    const validStatus = !reverseMap["statusPolicy"] || statusPolicies.includes(statusValue);
    const validMinuySochen = !reverseMap["minuySochen"] || minuyValue === "" || ["כן", "לא"].includes(minuyValue);
    const cancellationValue = String(row["cancellationDate"] || "").trim();

const validCancellationDate =
  !reverseMap["cancellationDate"] ||      // אין מיפוי → לא בודקים
  cancellationValue === "" ||            // ריק → תקין
  /^\d{4}-\d{2}-\d{2}$/.test(cancellationValue); // אחרת חייב YYYY-MM-DD



  
    let isValid = hasRequired &&
      validCompany &&
      validProduct &&
      validID &&
      validFirstName &&
      validLastName &&
      validMounth &&
      validStatus;
  
    if (reverseMap["minuySochen"]) {
      isValid = isValid && validMinuySochen;
    }
  
    if (reverseMap["workerName"]) {
      isValid = isValid && validWorker;
    }
  
    if (reverseMap["sourceLeadName"]) {
      isValid = isValid && validSourceLead;
    }

    if (reverseMap["cancellationDate"]) {
      isValid = isValid && validCancellationDate;
    }
    if (!isValid) {
      // console.warn("❌ שורה לא תקינה – הגורמים האפשריים:", {
      //   firstNameValue,
      //   lastNameValue,
      //   idValue,
      //   companyValue,
      //   productValue,
      //   statusValue,
      //   minuyValue,
      //   workerValue,
      //   sourceLeadValue,
      //   cancellationDate: row["cancellationDate"],
      //   mounth: row["mounth"],
      // });
    }
    
    return isValid;
  };
  
  const checkAllRows = (data: any[], map: Record<string, string>) => {
    const reverseMap = Object.fromEntries(Object.entries(map).map(([k, v]) => [v, k]));

    const invalids = data.reduce<number[]>((acc, row, idx) => {
      if (!validateRow(row, map, reverseMap)) acc.push(idx);
      
      return acc;
    }, []);

    setErrors(invalids);
  };

  useEffect(() => {
    // console.log("שורות תקינות:", validRows);
  }, [errors, rows]);

  useEffect(() => {
    // console.log("🔍 שורות עם שגיאות (errors):", errors);
  }, [errors]);

  const handleFieldChange = (rowIdx: number, field: string, value: string) => {
    const updatedRows = [...rows];
    const originalRow = updatedRows[rowIdx];
    const updatedRow = { ...originalRow };
  
    // עדכון גם לשם השדה במערכת וגם לעמודה המקורית מהאקסל
    const excelField = Object.entries(mapping).find(([, v]) => v === field)?.[0];
    if (excelField) {
      updatedRow[excelField] = value;
    }
    updatedRow[field] = value;
  
    // mounth – תאריך
    if (field === "mounth") {
      const parsed = parseMounthField(value);
      updatedRow["mounth"] = parsed.value || value;
      if (parsed.error) {
        updatedRow["_mounthError"] = parsed.error;
      } else {
        delete updatedRow["_mounthError"];
      }
    }
    if (field === "cancellationDate") {
      const parsed = parseDateField(value);
      updatedRow["cancellationDate"] = parsed.value || value;
      if (excelField) {
        updatedRow[excelField] = parsed.value || value;
      }
      if (parsed.error) {
        updatedRow["_cancellationDateError"] = parsed.error;
      } else {
        delete updatedRow["_cancellationDateError"];
      }
    }
    
    // עובד
    if (field === "workerName") {
      const worker = workers.find(w => w.name.toLowerCase() === value.trim().toLowerCase());
      if (worker) {
        updatedRow["workerId"] = worker.id;
        updatedRow["workerName"] = worker.name;
    
        if (excelField) {
          updatedRow[excelField] = worker.name; // זה המפתח!
        }
    
        delete updatedRow["_workerError"];
      } else {
        updatedRow["_workerError"] = `עובד לא מזוהה: ${value}`;
      }
    }
    
    // מקור ליד
if (field === "sourceLeadName") {
  const name = value.trim();
  updatedRow["sourceLeadName"] = name;

  if (excelField) {
    updatedRow[excelField] = name;
  }

  if (name === "" || sourceLeads.includes(name.toLowerCase())) {
    delete updatedRow["_sourceLeadError"];
  } else {
    updatedRow["_sourceLeadError"] = `מקור ליד לא מזוהה: ${name}`;
  }
}


    updatedRows[rowIdx] = updatedRow;
    setRows(updatedRows);
    checkAllRows(updatedRows, mapping);
  };
  

  const handleDeleteRow = (rowIdx: number) => {
    const updatedRows = rows.filter((_, idx) => idx !== rowIdx);
    setRows(updatedRows);
    checkAllRows(updatedRows, mapping);
  };

  const handleImport = async () => {
    const required = [
      "firstNameCustomer",
      "lastNameCustomer",
      "IDCustomer",
      "company",
      "product",
      "mounth",
      "statusPolicy",
      // "workerName"
    ];

    const reverseMap = Object.fromEntries(Object.entries(mapping).map(([k, v]) => [v, k]));
    const allRequiredMapped = required.every((key) => {
      if (["firstNameCustomer", "lastNameCustomer"].includes(key)) {
        return reverseMap[key] || reverseMap["fullName"];
      }
      return reverseMap[key];
    });

    if (!allRequiredMapped) {
      addToast("error", "יש שדות חובה שלא מופו – אנא השלימי את המיפוי לפני טעינה.");
      return;
    }

    if (errors.length > 0) {
      addToast("error", "יש שורות עם שגיאות. תקני או מחקי אותן לפני טעינה");
      return;
    }

    if (!selectedAgentId) {
      addToast("warning", "בחר סוכן לפני טעינה");
      return;
    }

    const validRows = rows.filter((_, i) => !errors.includes(i));
    setValidRowsCount(validRows.length);

    const idField = mappingKeyFor("IDCustomer");
    const dateField = mappingKeyFor("mounth");
    const companyField = mappingKeyFor("company");
    const productField = mappingKeyFor("product");
    const workerField = mappingKeyFor("workerName");

    const uniqueIDs = new Set(validRows.map((row) => row[idField]));
    const mounthDates = validRows.map((row) => new Date(row[dateField]));
    const minDate = new Date(Math.min(...mounthDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...mounthDates.map(d => d.getTime())));
    const uniqueCompanies = [...new Set(validRows.map((row) => row[companyField]))];
    const uniqueProducts = [...new Set(validRows.map((row) => row[productField]))];
    const uniqueWorkers = [...new Set(validRows.map((row) => row[workerField]))];
    const agentName = agents.find((a) => a.id === selectedAgentId)?.name || "";

    setImportSummary({
      count: validRows.length,
      uniqueCustomers: uniqueIDs.size,
      dateRange: [minDate, maxDate],
      companies: uniqueCompanies,
      products: uniqueProducts,
      workers: uniqueWorkers,
      agentName,
    });

    setImportDialogOpen(true);
  };

  const continueImport = async () => {
    setImportDialogOpen(false);

    const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);
    const selectedAgentName = selectedAgent?.name || "";

    let successCount = 0;
    let newCustomerCount = 0;
    const failedRows: { index: number; error: any }[] = [];
    const runId = doc(collection(db, "importRuns")).id;

    for (let i = 0; i < rows.length; i++) {
      if (errors.includes(i)) continue;

      const originalRow = rows[i];
      const mappedRow: any = {};
      for (const [excelCol, systemField] of Object.entries(mapping)) {
        if (systemField === "mounth") {
          mappedRow[systemField] = String(originalRow["mounth"] ?? "").trim();
        } else if (systemField === "cancellationDate") {
          mappedRow[systemField] = String(originalRow["cancellationDate"] ?? "").trim(); // ← חדש
        } else {          mappedRow[systemField] = String(originalRow[excelCol] ?? "").trim();
        }
      }

      mappedRow["firstNameCustomer"] ??= originalRow["firstNameCustomer"];
      mappedRow["lastNameCustomer"] ??= originalRow["lastNameCustomer"];
      mappedRow["workerId"] ??= originalRow["workerId"];
      mappedRow["workerName"] ??= originalRow["workerName"];

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
            runId,
            firstNameCustomer: mappedRow.firstNameCustomer || "",
            lastNameCustomer: mappedRow.lastNameCustomer || "",
            IDCustomer: String(mappedRow.IDCustomer || ""),
            parentID: "",
            sourceLeadName: mappedRow.sourceLeadName || "", // ← חדש
            sourceApp: "importExcel",
          });
          await updateDoc(customerDocRef, { parentID: customerDocRef.id });
          newCustomerCount++;
        }

        await addDoc(collection(db, 'sales'), {
          agent: selectedAgentName,
          runId,
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
          cancellationDate: mappedRow.cancellationDate || "",  // ← חדש
          statusPolicy: mappedRow.statusPolicy || "",
          notes: mappedRow.notes || "",
          createdAt: serverTimestamp(),
          lastUpdateDate: serverTimestamp(),
          sourceApp: "importExcel",
        });

        successCount++;
      } catch (error) {
        // console.error(`❌ שגיאה בשורה ${i + 1}:`, error);
        failedRows.push({ index: i + 1, error });
      }
    }

    await setDoc(doc(db, "importRuns", runId), {
      runId,
      createdAt: serverTimestamp(),
      agentId: selectedAgentId,
      agentName: selectedAgentName,
      createdBy: user?.email || user?.uid,
      customersCount: newCustomerCount,
      salesCount: successCount,
    });

    if (failedRows.length > 0) {
      const errorSummary = failedRows
        .map((row) => `שורה ${row.index}: ${row.error?.message || "שגיאה לא ידועה"}`)
        .join("\n");

      addToast("warning", `טעינה הסתיימה:\n✅ ${successCount} עסקאות הוזנו\n❌ ${failedRows.length} נכשלו. בדקי בלוג.`);

      // console.group("❌ פירוט שורות שנכשלו");
      failedRows.forEach((row) => {
        // console.error(`שורה ${row.index}:`, row.error);
      });
      // console.groupEnd();
    } else {
      addToast("success", `✅ כל ${successCount} העסקאות הוזנו בהצלחה!`);
    }

    setSelectedFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setErrors([]);
    setPendingExcelData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const mappingKeyFor = (field: string): string =>
    Object.entries(mapping).find(([, v]) => v === field)?.[0] || "";

  const formatHebrewDate = (date: Date) =>
    date.toLocaleDateString("he-IL", {
      year: "numeric",
      month: "long"
    });

  const validRows = rows.filter((_, idx) => !errors.includes(idx));

  return (
    <div className="table-header">
      <h2 className="table-title">ייבוא קובץ Excel</h2>
      {isParsing && (
  <div className="mt-4 p-3 bg-yellow-100 text-yellow-800 rounded text-center font-semibold text-sm">
    ⏳ טוען קובץ... אנא המתן, העיבוד עשוי להימשך מספר שניות.
  </div>
)}
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
            <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
              <span className="truncate max-w-[200px]">📁 {selectedFileName}</span>
              <button
                onClick={clearFile}
                className="text-red-500 hover:text-red-700 text-xs font-bold"
                title="נקה קובץ"
              >
                ✖
              </button>
            </div>
          )}
        </div>
      </div>

      {headers.length > 0 && (
        <div className="mb-6">
<h3 className="font-semibold mb-2">מיפוי שדות מערכת מתוך קובץ Excel</h3>
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
          {(() => {
  const mappedFields = Object.values(mapping);
  const hasFullName = mappedFields.includes("fullName");
  const hasFirstAndLast = mappedFields.includes("firstNameCustomer") && mappedFields.includes("lastNameCustomer");

  if (!hasFullName && !hasFirstAndLast) {
    return (
      <div className="mt-4 p-3 border border-red-400 bg-red-50 text-red-800 rounded text-sm">
        ⚠️ חובה למפות שדות של שם לקוח. יש למפות או:
        <ul className="list-disc pr-5 mt-2">
          <li><b>שם פרטי</b> ו־<b>שם משפחה</b> – כל אחד לעמודה נפרדת</li>
          <li>או עמודת <b>שם מלא</b> אחת</li>
        </ul>
      </div>
    );
  }

  if (hasFullName) {
    return (
      <div className="mt-4 p-3 border border-yellow-400 bg-yellow-50 text-yellow-800 rounded text-sm">
        ⚠️ מופה שדה <b>שם מלא</b>. אנא צייני מה הסדר בתוך השדה (שם פרטי קודם או שם משפחה קודם) כדי שנפצל נכון.
      </div>
    );
  }

  return null;
})()}

          {Object.values(mapping).includes("fullName") && (
            <div className="mt-4 text-right border border-gray-300 rounded p-3 bg-gray-50">
              <label className="block font-semibold mb-1">מה מופיע ראשון בשם המלא?</label>
              <div className="flex flex-col gap-2 text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded p-3">
                <label>
                  <input
                    type="radio"
                    name="fullNameStructure"
                    value="firstNameFirst"
                    checked={fullNameStructure === "firstNameFirst"}
                    onChange={() => setFullNameStructure("firstNameFirst")}
                  />
                  {" "}
                  שם פרטי ראשון (למשל: <b>מלכה כהן</b>) → <b>שם פרטי:</b> מלכה, <b>שם משפחה:</b> כהן
                </label>
                <label>
                  <input
                    type="radio"
                    name="fullNameStructure"
                    value="lastNameFirst"
                    checked={fullNameStructure === "lastNameFirst"}
                    onChange={() => setFullNameStructure("lastNameFirst")}
                  />
                  {" "}
                  שם משפחה ראשון (למשל: <b>כהן מלכה</b>) → <b>שם משפחה:</b> כהן, <b>שם פרטי:</b> מלכה
                </label>
              </div>
              {/* {(() => {
                const fullNameColEntry = Object.entries(mapping).find(([, v]) => v === "fullName");
                const fullNameCol = fullNameColEntry?.[0];

                if (!fullNameCol || !rows?.[0]) return null;

                const fullNameValue = rows[0][fullNameCol] || "";
                const parts = fullNameValue.split(" ");

                const firstSplit = {
                  firstName: parts[0] || "",
                  lastName: parts.slice(1).join(" "),
                };

                const lastSplit = {
                  firstName: parts.slice(0, -1).join(" "),
                  lastName: parts.slice(-1).join(" "),
                };

                return (
                  fullNameValue && (
                    <div className="mt-3 text-sm text-gray-700 bg-white border border-gray-200 rounded p-2">
                      <div>🔍 דוגמה מתוך הקובץ: <b>{fullNameValue}</b></div>
                      <div className="mt-1">
                        📌 רווח ראשון → שם פרטי: <b>{firstSplit.firstName}</b>, שם משפחה: <b>{firstSplit.lastName}</b><br />
                        📌 רווח אחרון → שם פרטי: <b>{lastSplit.firstName}</b>, שם משפחה: <b>{lastSplit.lastName}</b>
                      </div>
                    </div>
                  )
                );
              })()}
               */}
            </div>
          )}
        </div>
      )}

      {headers.length > 0 && !areAllRequiredFieldsMapped && (
        <p className="text-red-600 mt-4 font-semibold">
          יש למפות את כל שדות החובה כדי להציג את הטבלה.
        </p>
      )}

      {rows.length > 0 && areAllRequiredFieldsMapped && (
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
                      return (
                        <td key={h}>
                          {(() => {
                            const rawValue = row[h];
                            const value = String(rawValue || '').trim().toLowerCase();
                            const field = mapping[h];

                            const isInvalidCompany = field === 'company' && !companyNames.includes(value);
                            const isInvalidProduct = field === 'product' && !productNames.includes(value);
                            const isInvalidID = field === 'IDCustomer' && !/^\d{5,9}$/.test(value);
                            const isInvalidFirstName = field === 'firstNameCustomer' && !isValidHebrewName(rawValue);
                            const isInvalidLastName = field === 'lastNameCustomer' && !isValidHebrewName(rawValue);
                            const isNumericField = numericFields.includes(field);
                            const isInvalidNumber = isNumericField && isNaN(Number(rawValue));
                            const isInvalidStatus = field === 'statusPolicy' && !statusPolicies.includes(String(rawValue || '').trim());
                            const isInvalidWorker = field === 'workerName' &&
                            !!value &&
                            !workers.find(w => w.name.toLowerCase().trim() === value.toLowerCase().trim());
                            const isInvalidSourceLead = field === 'sourceLeadName' &&
                            !!value &&
                            !sourceLeads.some((s) => s.toLowerCase().trim() === value.toLowerCase().trim());                          
                            // console.log("🧪 DEBUG sourceLead", {
                            //   field,
                            //   value,
                            //   trimmedValue: value.trim(),
                            //   sourceLeads,
                            //   includes: sourceLeads.includes(value.trim()),
                            //   includesIgnoreCase: sourceLeads.some(name => name.toLowerCase() === value.trim().toLowerCase())
                            // });
                            
                            const inputStyle = {
                              width: '100%',
                              backgroundColor:
                                isInvalidCompany || isInvalidProduct || isInvalidID ||
                                isInvalidFirstName || isInvalidLastName || isInvalidNumber ||
                                isInvalidStatus || isInvalidWorker || isInvalidSourceLead
                                  ? '#ffe6e6'
                                  : undefined,
                            };

                            const renderError = (message: string) => (
                              <div style={{ color: 'red', fontSize: '0.75rem' }}>{message}</div>
                            );

                            if (field === 'mounth') {
                              const error = row['_mounthError'];
                              const value = row['mounth'] || '';

                              return (
                                <div>
                                  <input
                                    type="date"
                                    value={value}
                                    style={{
                                      ...inputStyle,
                                      backgroundColor: error ? '#ffe6e6' : inputStyle.backgroundColor,
                                    }}
                                    onChange={(e) => handleFieldChange(idx, 'mounth', e.target.value)}
                                  />
                                  {error && renderError(error)}
                                </div>
                              );
                            }
                            if (field === 'cancellationDate') {
                              const error = row['_cancellationDateError'];
                              const value = row['cancellationDate'] || '';
                            
                              const isInvalidFormat =
                                value && !/^\d{4}-\d{2}-\d{2}$/.test(String(value).trim());
                            
                              return (
                                <div>
                                  <input
                                    type="date"
                                    value={value}
                                    style={{
                                      ...inputStyle,
                                      backgroundColor: error || isInvalidFormat ? '#ffe6e6' : inputStyle.backgroundColor,
                                    }}
                                    onChange={(e) => handleFieldChange(idx, 'cancellationDate', e.target.value)}
                                  />
                                  {error && <div style={{ color: 'red', fontSize: '0.75rem' }}>{error}</div>}
                                  {isInvalidFormat && !error && (
                                    <div style={{ color: 'red', fontSize: '0.75rem' }}>
                                      פורמט תאריך לא תקין (ציפינו YYYY-MM-DD)
                                    </div>
                                  )}
                                </div>
                              );
                            }                            
                            
                            if (field === 'workerName') {
                              const error = row['_workerError'];
                            //   console.log("🧩 workerName render debug", {
                            //     rowIdx: idx,
                            //     field,
                            //     excelHeader: h,
                            //     valueInRowH: row[h],
                            //     workerNameInRow: row["workerName"],
                            //     matchingWorker: workers.find(w => w.name === row[h]),
                            //     allWorkers: workers.map(w => w.name),
                            //   }
                            // );
                              
                              return (
                                <div>
                                  <select
                                    value={row[h] || ''}
                                    onChange={(e) => handleFieldChange(idx, 'workerName', e.target.value)}
                                    style={{
                                      ...inputStyle,
                                      backgroundColor: error ? '#ffe6e6' : inputStyle.backgroundColor,
                                    }}
                                  >
                                    <option value="">בחר עובד</option>
                                    {workers.map((worker) => (
                                      <option key={worker.id} value={worker.name}>
                                        {worker.name}
                                      </option>
                                    ))}
                                  </select>
                                  {error && renderError(error)}
                                </div>
                              );
                            }
                            if (field === 'sourceLeadName') {
                              const error = row['_sourceLeadError'];
                              const currentValue = row[h] || '';
                            
                              // const validValue = sourceLeads.includes(currentValue);
                              const validValue = !!currentValue && sourceLeads.includes(currentValue.toLowerCase().trim());

                              return (
                                <div>
                                  <select
                                    value={validValue ? currentValue : ''} // משאיר את הערך המקורי אם הוא תקין
                                    onChange={(e) => handleFieldChange(idx, 'sourceLeadName', e.target.value)}
                                    style={{
                                      ...inputStyle,
                                      backgroundColor: error ? '#ffe6e6' : inputStyle.backgroundColor,
                                    }}
                                  >
                                    <option value="">בחר מקור ליד</option>
                                    {sourceLeads.map((name, i) => (
                                      <option key={i} value={name}>{name}</option>
                                    ))}
                                  </select>
                                  {error && <div style={{ color: 'red', fontSize: '0.75rem' }}>{error}</div>}
                                </div>
                              );
                            }                                    
                            
                            if (isInvalidCompany) {
                              return (
                                <div>
                                  <select value={row[h]} onChange={(e) => handleFieldChange(idx, h, e.target.value)} style={inputStyle}>
                                    <option value="">בחר חברה</option>
                                    {companies.map((c) => (
                                      <option key={c} value={c}>{c}</option>
                                    ))}
                                  </select>
                                  {renderError(`חברה לא מזוהה: ${row[h]}`)}
                                </div>
                              );
                            }

                            if (isInvalidProduct) {
                              return (
                                <div>
                                  <select value={row[h]} onChange={(e) => handleFieldChange(idx, h, e.target.value)} style={inputStyle}>
                                    <option value="">בחר מוצר</option>
                                    {products.map((p) => (
                                      <option key={p.name} value={p.name}>{p.name}</option>
                                    ))}
                                  </select>
                                  {renderError(`מוצר לא מזוהה: ${row[h]}`)}
                                </div>
                              );
                            }

                            if (isInvalidStatus) {
                              return (
                                <div>
                                  <select value={row[h]} onChange={(e) => handleFieldChange(idx, h, e.target.value)} style={inputStyle}>
                                    <option value="">בחר סטטוס</option>
                                    {statusPolicies.map((s, i) => (
                                      <option key={i} value={s}>{s}</option>
                                    ))}
                                  </select>
                                  {renderError(`סטטוס לא תקין: ${row[h]}`)}
                                </div>
                              );
                            }

                            if (field === 'minuySochen') {
                              return (
                                <select
                                  value={row[h] || ''}
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
                              <div>
                                <input
                                  type={isNumericField ? 'number' : 'text'}
                                  value={row[h]}
                                  style={inputStyle}
                                  onChange={(e) => handleFieldChange(idx, h, e.target.value)}
                                  maxLength={field === 'IDCustomer' ? 9 : undefined}
                                />
                                {isInvalidID && renderError(`ת"ז לא תקינה: ${row[h]}`)}
                                {isInvalidFirstName && renderError(`שם פרטי לא תקין: ${row[h]}`)}
                                {isInvalidLastName && renderError(`שם משפחה לא תקין: ${row[h]}`)}
                                {isInvalidNumber && renderError(`ערך לא מספרי: ${row[h]}`)}
                              </div>
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
          {rows.length > 0 && areAllRequiredFieldsMapped ? (
            (() => {
              const mappedColumns = Object.entries(mapping);
              const extraFields = fullNameMapped
                ? ["firstNameCustomer", "lastNameCustomer"]
                : [];

              const previewFields = [
                ...mappedColumns.map(([excelCol, systemField]) => systemField),
                ...extraFields,
              ].sort((a, b) => {
                const order = systemFieldsDisplay.map((f) => f.key);
                return order.indexOf(a) - order.indexOf(b);
              });

              return (
                <table border={1} className="w-full text-sm text-right">
                  <thead>
                    <tr>
                      {previewFields.map((fieldKey) => {
                        const label =
                          systemFieldsDisplay.find((f) => f.key === fieldKey)?.label ||
                          fieldKey;
                        return <th key={fieldKey}>{label}</th>;
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.map((row, idx) => (
                      <tr key={idx}>
                        {previewFields.map((fieldKey) => {
                          const excelCol = Object.entries(mapping).find(
                            ([, systemField]) => systemField === fieldKey
                          )?.[0];

                          let value;
                          if (fieldKey === "mounth") {
                            value = row["mounth"];
                          } else if (fieldKey === "cancellationDate") {
                            value = row["cancellationDate"]; // ← חדש
                          } else if (excelCol) {
                            value = row[excelCol];
                          } else {
                            value = row[fieldKey];
                          }

                          return <td key={fieldKey}>{value}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              );
            })()
          ) : (
            <p className="text-gray-600 mt-4">לא נמצאו נתונים תקינים לטעינה.</p>
          )}

          {errors.length > 0 && <p className="text-red-600 mt-2">יש שורות עם שגיאות – תקני או מחקי אותן לפני טעינה.</p>}

          <Button
  text="אשר טעינה"
  type="primary"
  icon="upload" // או כל אייקון שתרצי
  state={isParsing || errors.length > 0 ? "disabled" : "default"}
  onClick={handleImport}
  disabled={isParsing}
/>
          {importDialogOpen && importSummary && (
            <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
              <DialogNotification
                type="warning"
                title="אישור טעינה"
                message={
                  `⚠️ פעולה משמעותית לפניך!\n\n` +
                  `אתה עומד להעלות ${importSummary.count} עסקאות חדשות לסוכן: "${importSummary.agentName}"\n\n` +
                  `📅 טווח חודשים: ${formatHebrewDate(importSummary.dateRange[0])} – ${formatHebrewDate(importSummary.dateRange[1])}\n` +
                  `👥 לקוחות שונים: ${importSummary.uniqueCustomers}\n` +
                  `🏢 חברות: ${importSummary.companies.join(", ")}\n` +
                  `📦 מוצרים: ${importSummary.products.join(", ")}\n` +
                  `👷 עובדים: ${importSummary.workers.join(", ")}\n\n` +
                  `🔒 ודא כי הנתונים נכונים ומסוננים לפני ביצוע הפעולה.\n` +
                  `❗️ לאחר טעינה – לא ניתן לבטל.\n\n` +
                  `האם להמשיך?`
                }
                onConfirm={continueImport}
                onCancel={() => setImportDialogOpen(false)}
                confirmText="אשר טעינה"
                cancelText="ביטול"
              />
            </div>
          )}
        </div>
      )}
      {toasts.length > 0 && toasts.map((toast) => (
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