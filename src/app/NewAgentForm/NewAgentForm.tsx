/* eslint-disable react/jsx-no-comment-textnodes */

import React, { useState, useEffect,useRef, FormEventHandler, ChangeEventHandler, ChangeEvent, useMemo, useCallback, FormEvent } from 'react';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs, doc, addDoc, deleteDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from "@/hooks/useFetchAgentData"; 
import useSalesData from "@/hooks/useSalesData"; 
import useFetchMD from "@/hooks/useMD"; 
import useCalculateSalesData from "@/hooks/useCalculateGoalsSales"; 
import confetti from 'canvas-confetti';
import MenuWrapper from "@/components/MenuWrapper/MenuWrapper";
import Edit from '@/components/icons/Edit/Edit'; 
import Delete  from '@/components/icons/Delete/Delete'; 
import TableFooter from "@/components/TableFooter/TableFooter";
import Search from "@/components/Search/Search";
import './NewAgentForm.css';
import { Button } from "@/components/Button/Button";
import {ProgressBar} from "@/components/ProgressBar/ProgressBar";
import useEditableTable from "@/hooks/useEditableTable";
import  fetchDataForAgent from '@/services/fetchDataForAgent';
import { Customer, Sale, CombinedData, AgentDataType } from '@/types/Sales';
import  fetchCustomerBelongToAgent from '@/services/fetchCustomerBelongToAgent';
import {useSortableTable}  from "@/hooks/useSortableTable";
import {ToastNotification} from '@/components/ToastNotification';
import { useToast } from "@/hooks/useToast";
import { useValidation } from "@/hooks/useValidation";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { FaFileExcel } from 'react-icons/fa';


const NewAgentForm: React.FC = () => {
  const { user, detail } = useAuth();
 
  const [showOpenNewDeal, setShowOpenNewDeal] = useState(false);

  const { 
    agents, 
    selectedAgentId, 
    handleAgentChange, 
    workers, 
    selectedWorkerId,
    selectedWorkerName, 
    setSelectedWorkerName,
    setSelectedWorkerId, 
    selectedAgentName,
    handleWorkerChange , 
    companies,
    selectedCompany, 
    setSelectedCompany,
    selectedWorkerIdFilter,
    setSelectedWorkerIdFilter,
    selectedWorkerNameFilter,
    selectedCompanyFilter,
    setSelectedCompanyFilter,
    fetchWorkersForSelectedAgent,
    workerNameMap,
    selectedWorkerIdGoals,
    setSelectedWorkerIdGoals,
    isLoadingAgent,
  } = useFetchAgentData();

  // const 
  // { monthlyTotals,
  //   overallFinansimTotal, overallPensiaTotal, overallInsuranceTotal, overallNiudPensiaTotal
  //  } = useSalesData(selectedAgentId, selectedWorkerId);

   const {
    products,
    selectedProduct,
    setSelectedProduct,
    selectedProductGroup, 
    setSelectedProductGroup,
    setSelectedStatusPolicy, 
    selectedStatusPolicy, 
    statusPolicies,
    selectedProductFilter,
    setSelectedProductFilter,
    selectedStatusPolicyFilter, 
    setSelectedStatusPolicyFilter, 
    productGroupMap,
    formatIsraeliDateOnly, productToGroupMap
  } = useFetchMD();


  const {  goalData ,setGoalData, fetchDataGoalsForWorker,calculateDays } = useCalculateSalesData();
  const { errors,setErrors, handleValidatedEditChange } = useValidation();
  const searchParams = useSearchParams();
  const [selectedAgent, setSelectedAgent] = useState('');
  const [firstNameCustomer, setfirstNameCustomer] = useState('');
  const [lastNameCustomer, setlastNameCustomer] = useState('');
  const [IDCustomer, setIDCustomer] = useState('');
  const [insPremia, setinsPremia] = useState('');
  const [pensiaPremia, setpensiaPremia] = useState('');
  const [pensiaZvira, setPensiaZvira] = useState('');
  const [finansimPremia, setfinansimPremia] = useState('');
  const [finansimZvira, setFinansimZvira] = useState('');
  const [mounth, setmounth] = useState('');
  const [agentData, setAgentData] = useState<CombinedData[]>([]);
  const [selectedRow, setSelectedRow] = useState<any | null>(null);
  const [minuySochen, setMinuySochen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
const [idCustomerFilter, setIdCustomerFilter] = useState('');
const [firstNameCustomerFilter, setfirstNameCustomerFilter] = useState('');
const [lastNameCustomerFilter, setlastNameCustomerFilter] = useState('');
const [minuySochenFilter, setMinuySochenFilter] = useState('');
const [expiryDateFilter, setExpiryDateFilter] = useState('');
const [notes, setNotes] = useState('');

const [isLoading, setIsLoading] = useState(false);  // Loading state
const [submitDisabled, setSubmitDisabled] = useState(false);
const[isActiveGoals, setIsActiveGoals] = useState(true);


const [filteredData, setFilteredData] = useState<AgentDataType[]>([]);
const [openMenuRow, setOpenMenuRow] = useState(null);
const { sortedData, sortColumn, sortOrder, handleSort } = useSortableTable<CombinedData>(filteredData);

// ניהול העמוד הנוכחי
const [currentPage, setCurrentPage] = useState(1);

const [rowsPerPage, setRowsPerPage] = useState(10);
const indexOfLastRow = currentPage * rowsPerPage;
const indexOfFirstRow = indexOfLastRow - rowsPerPage;
const currentRows = sortedData.slice(indexOfFirstRow, indexOfLastRow);


// // const rowsPerPage = 8; // מספר השורות בעמוד

// // חישוב הנתונים לעמוד הנוכחי
// const indexOfLastRow = currentPage * rowsPerPage;
// const indexOfFirstRow = indexOfLastRow - rowsPerPage;
// const currentRows = sortedData.slice(indexOfFirstRow, indexOfLastRow);

const { toasts, addToast, setToasts } = useToast();


const exportToExcel = () => {
  if (!filteredData.length) return;

  const translatedData = filteredData.map(item => ({
    "שם פרטי": item.firstNameCustomer,
    "שם משפחה": item.lastNameCustomer,
    "תעודת זהות": item.IDCustomer,
    "חברה": item.company,
    "מוצר": item.product,
    "פרמיה ביטוח": item.insPremia,
    "פרמיה פנסיה": item.pensiaPremia,
    "צבירה פנסיה": item.pensiaZvira,
    "פרמיה פיננסים": item.finansimPremia,
    "צבירה פיננסים": item.finansimZvira,
    "חודש תפוקה": item.mounth,
    "סטאטוס": item.statusPolicy,
    "מינוי סוכן": item.minuySochen ? "כן" : "לא",
"שם עובד": workerNameMap[item.workerId ?? ""] || "",
    "הערות": item.notes ?? ""
  }));

  // יצירת גיליון
  const worksheet = XLSX.utils.json_to_sheet(translatedData);

  // יישור ימין לשמאל
  worksheet["!rtl"] = true;

  // חישוב טווח ידני – מוודא שאקסל מבין את גודל הגיליון
  const range = XLSX.utils.decode_range(worksheet['!ref'] || '');
  worksheet['!ref'] = XLSX.utils.encode_range(range);

  // יצירת חוברת ושמירה
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "עסקאות מסוננות");

  const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
  saveAs(blob, "עסקאות_מסוננות.xlsx");
};



const resetForm = (clearCustomerFields: boolean = false) => {
  console.log("🔄 Reset form, clearCustomerFields:", clearCustomerFields);

  const resetField = (field: keyof CombinedData, value: any) => {
    handleEditChange(field, value);
  };

  if (clearCustomerFields) {
    resetField("workerId", "");
    resetField("firstNameCustomer", "");
    resetField("lastNameCustomer", "");
    resetField("IDCustomer", "");
    resetField("company", "");
    resetField("product", "");
    resetField("insPremia", "");
    resetField("pensiaPremia", "");
    resetField("pensiaZvira", "");
    resetField("finansimPremia", "");
    resetField("finansimZvira", "");
    resetField("mounth", "");
    resetField("minuySochen", false);
    resetField("statusPolicy", "");
    resetField("notes", "");
    resetField("phone", "");
    resetField("mail", "");
    resetField("address", "");
  }
   else
   {
  resetField("company", "");
  resetField("product", "");
  resetField("insPremia", "");
  resetField("pensiaPremia", "");
  resetField("pensiaZvira", "");
  resetField("finansimPremia", "");
  resetField("finansimZvira", "");
  resetField("mounth", "");
  resetField("minuySochen", false);
  resetField("statusPolicy", "");
  resetField("notes", "");
   }
   setInvalidFields([]);
  setErrors({});
   setIsEditing(false);
   };


const {
  data,                  // הנתונים הנוכחיים של הטבלה
  isLoadingHookEdit,     // האם הנתונים עדיין בטעינה
  editingRow,            // מזהה השורה הנערכת
  editData,   
  setEditData, 
  handleEditRow,         // פונקציה להפעלת עריכה
  handleEditChange,      // פונקציה לעדכון שדות בעריכה
  handleDeleteRow,       // פונקציה למחיקת שורה
  saveChanges,           // פונקציה לשמירת השינויים
  reloadData,            // פונקציה לטעינת נתונים מחדש
  cancelEdit,            // פונקציה לביטול עריכה  
} = useEditableTable<CombinedData>({
  dbCollection: 'sales', // שם האוסף ב-Firebase
  agentId: selectedAgentId, // מזהה הסוכן
  fetchData: fetchDataForAgent, // פונקציה לטעינת הנתונים
  onCloseModal: () => setShowOpenNewDeal(false), // ✅ נסגור את המודל
  resetForm, // ✅ שולחים את הפונקציה של resetForm מהדף הספציפי
});


const [validateAllFields, setValidateAllFields] = useState(false);
const [invalidFields, setInvalidFields] = useState<string[]>([]);

const validateAllRequiredFields = (newData?: typeof editData) => {
  const dataToValidate = newData || editData;
  const missingFields: string[] = [];

  if (!dataToValidate.AgentId?.trim()) missingFields.push("AgentId");
  if (!dataToValidate.workerId?.trim()) missingFields.push("workerId");
  if (!dataToValidate.firstNameCustomer?.trim()) missingFields.push("firstNameCustomer");
  if (!dataToValidate.lastNameCustomer?.trim()) missingFields.push("lastNameCustomer");
  if (!dataToValidate.IDCustomer?.trim()) missingFields.push("IDCustomer");
  if (!dataToValidate.company?.trim()) missingFields.push("company");
  if (!dataToValidate.product?.trim()) missingFields.push("product");
  if (!dataToValidate.statusPolicy?.trim()) missingFields.push("statusPolicy");
  if (!dataToValidate.mounth?.trim()) missingFields.push("mounth");

  setInvalidFields(missingFields);
};


const handleDealEditChange = (field: keyof CombinedData, value: CombinedData[keyof CombinedData]) => {
  handleEditChange(field, value);
  if (validateAllFields) {
    validateAllRequiredFields();
  }
};

const [shouldValidate, setShouldValidate] = useState(false);


useEffect(() => {
  if (!shouldValidate) return;
  const requiredTextFields: (keyof CombinedData)[] = ["firstNameCustomer", "lastNameCustomer", "IDCustomer"];
  requiredTextFields.forEach((field) => {
    const fieldValue = editData[field as keyof CombinedData] ?? "";
    handleValidatedEditChange(field as string, fieldValue as string, setEditData, setErrors);
  });
  setShouldValidate(false); // לא לרוץ שוב
}, [shouldValidate]);

// ואז במקום ב־useEffect ההוא:
useEffect(() => {
  if (validateAllFields) {
    validateAllRequiredFields();
    setShouldValidate(true);
  }
}, [validateAllFields]);


// שינוי עמוד
const handlePageChange = (pageNumber: number) => {
  setCurrentPage(pageNumber);
};

useEffect(() => {
  if (!editData.AgentId && selectedAgentId) {
    handleEditChange("AgentId", selectedAgentId);
    console.log("🔄 Setting default AgentId:", selectedAgentId);
  }
}, [selectedAgentId, editData.AgentId]);


useEffect(() => {
  const resetFormAndLoadData = async () => {
    // איפוס הטופס
    setfirstNameCustomer('');
    setlastNameCustomer('');
    setIDCustomer('');
    setSelectedCompany('');
    setSelectedProduct('');
    setinsPremia('');
    setpensiaPremia('');
    setPensiaZvira('');
    setfinansimPremia('');
    setFinansimZvira('');
    setmounth('');
    setMinuySochen(false);
    setSelectedStatusPolicy('');
    setNotes('');
    // טעינת הנתונים לסוכן שנבחר
    if (selectedAgentId) {
      try {
        const data = await fetchDataForAgent(selectedAgentId); // קריאה ל-fetchDataForAgent
        setAgentData(data); // עדכון הסטייט עם הנתונים שהתקבלו
      } catch (error) {
        console.error('Error fetching data for agent:', error);
      }
    } else {
      setAgentData([]); // איפוס הסטייט אם אין סוכן
    }
  };
  resetFormAndLoadData(); // קריאה לפונקציה האסינכרונית
}, [selectedAgentId]); // תלות במזהה הסוכן


  

    // Prepare the audio
    const celebrationSound = new Audio('/assets/sounds/soundEffect.mp3');


  const triggerConfetti = () => {
    confetti({
      particleCount: 300,  // A higher count for more confetti particles
      spread: 180,         // A wider spread
      startVelocity: 60,   // Higher initial velocity
      gravity: 1,        // Adjust gravity to make confetti fall slower
      ticks: 400,          // Longer duration before particles fade out
      origin: { x: 0.5, y: 0 }, // Origin at the top center of the page
      colors: ['#ff7f50', '#87cefa', '#daa520', '#32cd32', '#6a5acd'], // Multiple colors for a festive look
      shapes: ['circle', 'square'],  // Mix shapes for variety
      scalar: 1.8         // Larger pieces of confetti
    });
};

const celebrationSoundRef = useRef<HTMLAudioElement | null>(null);
//audio
useEffect(() => {
  const audio = new Audio('/assets/sounds/soundEffect.mp3');
  celebrationSoundRef.current = audio;
}, []);


const handleSubmit = async (event: FormEvent<HTMLFormElement>, closeAfterSubmit = false) => {
  event.preventDefault();
  if (submitDisabled) return; // מניעת שליחה כפולה של הטופס
  setSubmitDisabled(true); // מניעת שליחות נוספות במהלך העיבוד

  try {
    // בדיקת קיום לקוח
    const customerQuery = query(
      collection(db, 'customer'),
      where('IDCustomer', '==', editData.IDCustomer),
      where('AgentId', '==', selectedAgentId)
    );
    const customerSnapshot = await getDocs(customerQuery);
    let customerDocRef;
    if (customerSnapshot.empty) {
      // יצירת רשומת לקוח חדשה אם הלקוח אינו קיים
      customerDocRef = await addDoc(collection(db, "customer"), {
        AgentId: editData.AgentId || selectedAgentId,
        firstNameCustomer: editData.firstNameCustomer || "",
        lastNameCustomer: editData.lastNameCustomer || "",
        IDCustomer: editData.IDCustomer || "",
        parentID: "", // ייכנס לאחר מכן
      });
      // עדכון `parentID` של הלקוח שנוצר
      await updateDoc(customerDocRef, { parentID: customerDocRef.id });
      addToast("success", "לקוח התווסף בהצלחה");
      await new Promise((resolve) => setTimeout(resolve, 5000));

    } else {
      // טיפול במקרה שבו הלקוח כבר קיים
      customerDocRef = customerSnapshot.docs[0].ref;
    }
    // יצירת מסמך בעסקאות
  const docRef = await addDoc(collection(db, 'sales'), {
  agent:  selectedAgentName,
  AgentId: editData.AgentId || selectedAgentId,
  workerId: editData.workerId || selectedWorkerId,
  workerName: selectedWorkerName,
  firstNameCustomer: editData.firstNameCustomer || "",
  lastNameCustomer: editData.lastNameCustomer || "",
  IDCustomer: editData.IDCustomer || "",
  company: editData.company || selectedCompany,
  product: editData.product || selectedProduct,
  insPremia: editData.insPremia || 0,
  pensiaPremia: editData.pensiaPremia || 0,
  pensiaZvira: editData.pensiaZvira || 0,
  finansimPremia: editData.finansimPremia || 0,
  finansimZvira: editData.finansimZvira || 0,
  mounth: editData.mounth || "",
  minuySochen: editData.minuySochen || false,
  statusPolicy: editData.statusPolicy || selectedStatusPolicy,
  notes: editData.notes || "",
  createdAt: serverTimestamp(),
  lastUpdateDate: serverTimestamp(),
    });
    addToast("success", "יש!!! עוד עסקה נוספה");
    // קריאה לפונקציית `fetchDataForAgent` לעדכון הנתונים
    if (selectedAgentId) {
      const data = await fetchDataForAgent(selectedAgentId); // קריאה לפונקציה
      setAgentData(data); // עדכון הסטייט עם הנתונים החדשים
    }
    // הפעלת קונפטי וקול הצלחה
    triggerConfetti();
    // celebrationSound.play();
    celebrationSoundRef.current?.play().catch((err) => {
      console.warn("שגיאה בהשמעת הצליל", err);
    });
    // איפוס הטופס
    resetForm(closeAfterSubmit); // אם נלחץ "הזן וסיים" – נאפס את הכל כולל פרטי הלקוח
 // 🔹 אם המשתמש לחץ על "הזן וסיים" – סגירת המודל
    if (closeAfterSubmit) {
      setShowOpenNewDeal(false);
    }
    setIsEditing(false);
  } catch (error) {
    console.error('Error adding document:', error);
  } finally {
    setSubmitDisabled(false); // הפעלת כפתור שליחה מחדש
  }
};

  const canSubmit = useMemo(() => {
    const isValid =
    (editData.AgentId || "").trim() !== "" &&
    (editData.workerId || "").trim() !== "" &&
    (editData.firstNameCustomer || "").trim() !== "" &&
    (editData.lastNameCustomer || "").trim() !== "" &&
    (editData.IDCustomer || "").trim() !== "" &&
    (editData.company || "").trim() !== "" &&
    (editData.product || "").trim() !== "" &&
    (editData.statusPolicy || "").trim() !== "" &&
    (editData.mounth || "").trim() !== "";
    return isValid;
  }, [
    editData.AgentId,
    editData.workerId,
    editData.firstNameCustomer,
    editData.lastNameCustomer,
    editData.IDCustomer,
    editData.company,
    editData.product,
    editData.statusPolicy,
    editData.mounth,
  ]);
  
  
  useEffect(() => {
    console.log("🔄 עדכון agentData לאחר טעינה מחדש", data);
    setAgentData(data);
  }, [data]); // ✅ מבטיח שברגע שהנתונים נטענים, הם יכנסו ל-agentData
  
  const formatDateForComparison = (dateString: string) => {
    if (!dateString) return "";
    const [year, month, day] = dateString.split("-");
    return `${day}.${month}.${year}`; // הופך 2025-02-23 ל- 23.02.2025
  };
  
  

useEffect(() => {
  let data = agentData.map((item) => ({
    ...item,
    mounth: item.mounth ?? '', // חובה
    statusPolicy: item.statusPolicy ?? '', // חובה
    firstNameCustomer: item.firstNameCustomer ?? '', // חובה
    lastNameCustomer: item.lastNameCustomer ?? '', // חובה
    IDCustomer: item.IDCustomer ?? '', // חובה
    company: item.company ?? '', // חובה
    product: item.product ?? '', // חובה
  }));

  // שלב ה-filter: סינון לפי הקריטריונים
  data = data.filter((item) => {
    const itemDate = item.mounth ? formatDateForComparison(item.mounth) : ""; // המרת התאריך לפורמט תואם מסך
    return (
      (selectedWorkerIdFilter ? item.workerId === selectedWorkerIdFilter : true) &&
      (selectedCompanyFilter ? item.company === selectedCompanyFilter : true) &&
      (selectedProductFilter ? item.product === selectedProductFilter : true) &&
      item.IDCustomer.includes(idCustomerFilter) &&
      item.firstNameCustomer.includes(firstNameCustomerFilter) &&
      item.lastNameCustomer.includes(lastNameCustomerFilter) &&
      (minuySochenFilter === '' || item.minuySochen?.toString() === minuySochenFilter) &&
      (!expiryDateFilter || itemDate.includes(expiryDateFilter)) && // ✅ חיפוש חלקי בתאריך
      (selectedStatusPolicyFilter ? item.statusPolicy === selectedStatusPolicyFilter : true)
    );
  });

  // שלב ה-sort: מיון התוצאות
  data.sort((a, b) => {
    const dateA = new Date(a.mounth).getTime();
    const dateB = new Date(b.mounth).getTime();

    if (dateA !== dateB) {
      return dateB - dateA;
    } else {
      return a.IDCustomer.localeCompare(b.IDCustomer);
    }
  });

  // עדכון הסטייט
  setFilteredData(data);
}, [
  selectedWorkerIdFilter,
  selectedCompanyFilter,
  selectedProductFilter,
  selectedStatusPolicyFilter,
  agentData,
  idCustomerFilter,
  firstNameCustomerFilter,
  lastNameCustomerFilter,
  minuySochenFilter,
  expiryDateFilter,
]);

  const handleCalculate = useCallback(async () => {
    if (!selectedAgentId || selectedAgentId.trim() === '') {
    //  console.error('No agent selected');
        return;
    }
    if (!user || !user.uid || !detail || !detail.role) {
   //     console.error('User details not available');
        return; // Handle the situation where details are not available
    }
    setIsLoading(true); // Start loading

    const workerIdToFetch = (detail.role === 'worker' && !selectedWorkerIdGoals) ? user.uid : selectedWorkerIdGoals;
   // console.log('workerIdToFetch:', workerIdToFetch);
    if (!workerIdToFetch) {
      //  console.error('No worker selected');
        setIsLoading(false);
        return;
    }
    try {
    await fetchDataGoalsForWorker(selectedAgentId, isActiveGoals ,workerIdToFetch);
//    console.log('Data fetched and table data should be updated now');
  } catch (error) {
    console.error('Error during fetchDataGoalsForWorker:', error);
} finally {
    setIsLoading(false); 
}
  }, [selectedAgentId,isActiveGoals, user, detail, selectedWorkerIdGoals, fetchDataGoalsForWorker]);


useEffect(() => {
  // Ensure all necessary data is available before calling handleCalculate
  if (detail &&  user && (detail.role === 'worker' || detail.role === 'agent') && !selectedWorkerIdGoals) {
    // If the user is a worker and no filter is selected, use their own ID
    setSelectedWorkerIdGoals(user.uid);
  } else {
    handleCalculate();
  }
}, [handleCalculate, detail, user, selectedWorkerIdGoals]);
 
const menuItems = (rowId: string, closeMenu: () => void) => [
  {
    label: "ערוך",
    onClick: () => {
      handleEditRowModal(rowId); // שימוש בפונקציה החדשה לפתיחת המודל
      closeMenu();
    },
    Icon: Edit,
  },
  {
    label: "מחק",
    onClick: () => {
      handleDeleteRow(rowId);
      closeMenu();
    },
    Icon: Delete,
  },
];


const handleEditRowModal = (id: string) => {
  handleEditRow(id); // קריאה לפונקציה הכללית
  setShowOpenNewDeal(true); // פתיחת המודל
};




// const [openModalId, setOpenModalId] = useState<string | number | null>(null);
// const [modalContent, setModalContent] = useState<string | null>(null);

const handleIDBlur = async () => {
  console.log("🔵 handleIDBlur started...");

  if (!editData.IDCustomer) {
    console.warn("❌ No IDCustomer provided, skipping fetch.");
    return;
  }

  console.log("🔍 Checking customer by ID:", editData.IDCustomer, "Agent:", selectedAgentId);

  const customerData: Customer | null = await fetchCustomerBelongToAgent(
    editData.IDCustomer,
    selectedAgentId
  );

  if (customerData) {
    console.log("✅ Customer found:", customerData);
    handleEditChange("firstNameCustomer", customerData.firstNameCustomer || "");
    handleEditChange("lastNameCustomer", customerData.lastNameCustomer || "");
    handleEditChange("phone", customerData.phone || "");
    handleEditChange("mail", customerData.mail || "");
    handleEditChange("address", customerData.address || "");
  } else {
    console.warn("❌ No customer found for this ID.");
  }
};

useEffect(() => {
  if (!editData.product) {
    console.log("⚠️ No product selected.");
    setSelectedProductGroup(""); // אם אין מוצר, ננקה את הקבוצה
    return;
  }

  // חיפוש ה-ID של קבוצת המוצר מתוך `productToGroupMap`
  const selectedGroupId = productToGroupMap[editData.product.trim()] || "";
  console.log("📌 Found Product Group ID:", selectedGroupId);

  setSelectedProductGroup(selectedGroupId);
}, [editData.product, productToGroupMap]); // ירוץ בכל שינוי של המוצר או הנתונים

console.log("🚨 invalidFields:", invalidFields); // ✅ כאן מחוץ ל-HTML

  return (
<div className="content-container-NewAgentForm">  
<div className="data-container-Goals">
  {/* כותרת */}
  <div className="table-header-Goal" style={{ textAlign: 'right' }}>
    <div className="table-Goal-title">עמידה ביעדים</div>
  </div>

  {/* בחירת עובד */}
  <div className="goal-Worker">
    <select
      id="worker-select-goals"
      value={selectedWorkerIdGoals}
      onChange={(e) => handleWorkerChange(e, 'goal')}
      disabled={!!(detail && detail.role === 'worker')}
    >
      <option value="">בחר עובד</option>
      {/* <option value="all-agency">כל הסוכנות</option> */}
      {workers.map((worker) => (
        <option key={worker.id} value={worker.id}>
          {worker.name}
        </option>
      ))}
    </select>
  </div>

  {/* צ'קבוקס של יעדים פעילים */}
  <div className="goalActive">
    <input
      type="checkbox"
      id="active-goals"
      name="active-goals"
      checked={isActiveGoals}
      onChange={(e) => setIsActiveGoals(e.target.checked)}
    />
    <label htmlFor="active-goals">יעדים פעילים</label>
  </div>
  {/* יעדים */}
  <div className="goals-container">
  {isLoading ? (
    <p>Loading...</p>
  ) : goalData.length > 0 ? (
    goalData.map((item, index) => (
      <div className="goal-card" key={index}>
        {/* כותרת היעד */}
        <div className="goal-title">
          {item.promotionName || "אין שם יעד"}
        </div>
        {/* יעד וביצוע */}
        <div className="goal-grid">
          {/* יעד */}
          <div className="goal-field">
            <label className="goal-label">יעד:</label>
            <span className="goal-value">
              {item.amaunt !== undefined && item.goalTypeName ? (
                `${item.amaunt.toLocaleString()} - ${item.goalTypeName}`
              ) : (
                "אין מידע"
              )}
            </span>
          </div>
          {/* ביצוע */}
          <div className="goal-field">
            <label className="goal-label">ביצוע:</label>
            {item.goalTypeName === "כוכבים" ? (
              <span className="goal-value">
                {item.totalStars ? `${item.totalStars}` : "אין מידע"}
              </span>
            ) : item.totalPremia && Object.keys(item.totalPremia).length > 0 ? (
              Object.entries(item.totalPremia).map(([groupId, total]) => (
                <span className="goal-value" key={groupId}>
                  {typeof total === "number"
                    ? new Intl.NumberFormat("he-IL").format(Math.floor(total))
                    : "אין מידע"}
                </span>
              ))
            ) : (
              <span className="goal-value">אין מידע</span>
            )}
          </div>
          {/* אחוז עמידה */}
          <div className="goal-field">
            <label className="goal-label">אחוז עמידה:</label>
            {item.achievementRate !== undefined ? (
              <ProgressBar
                state={
                  item.achievementRate >= 100
                    ? "complete"
                    : item.achievementRate >= 50
                    ? "progress"
                    : "low"
                }
                percentage={Math.min(item.achievementRate, 100)}
                className="achievement-bar"
              />
            ) : (
              <span className="goal-value">אין מידע</span>
            )}
          </div>

          {/* זמן עבר */}
          <div className="goal-field">
            <label className="goal-label">זמן עבר:</label>
            {item.daysPassed !== undefined &&
            item.totalDuration !== undefined &&
            item.totalDuration > 0 ? (
              <ProgressBar
                state="time"
                percentage={Math.min(
                  (item.daysPassed / item.totalDuration) * 100,
                  100
                )}
                className="time-bar"
              />
            ) : (
              <span className="goal-value">אין מידע</span>
            )}
          </div>
        </div>
      </div> // סגירה של goal-card
    ))
  ) : (
    <p>אין מידע</p>
  )}
</div>
</div> 

<div className={`table-container-AgentForm-new-design`}>
<div className="table-header">
  <div className="table-title">ניהול עסקאות</div>
  <div className="button-container">
  <Button
    // onClick={() => setShowOpenNewDeal(true)}
    onClick={() => {
      setEditData((prev) => ({
        ...prev,
        AgentId: selectedAgentId || "", // אם יש סוכן נבחר, נשתמש בו, אחרת ריק
      }));
      setShowOpenNewDeal(true);
    }}
    text="הוסף עסקה"
    type="primary"
    icon="on"
    state="default"
  />
 <button
  onClick={exportToExcel}
  className="excel-icon-button"
  title="ייצוא לאקסל"
>
<img src="/static/img/excel-icon.svg" alt="ייצוא לאקסל" width={24} height={24} />
</button>

  {/* <Button
    onClick={() => saveChanges()}
    text="שמור שינויים"
    type="primary"
    icon="off"
    state={isSaveDisabled ? "disabled" : "default"} // קביעת מצב הכפתור
    />
  <Button
  onClick={() => cancelEdit(true)} // ✅ פונקציה חיצונית שמפעילה את cancelEdit
  text="בטל"
  type="primary"
  icon="off"
  state={isEditing ? "default" : "disabled"} // קביעת מצב הכפתור
/> */}
  </div>
</div>
      <div className="filter-inputs-container-new">
             <div className="filter-select-container">
             <select onChange={handleAgentChange} value={selectedAgentId} className="select-input">
              {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
              {detail?.role === 'admin' && <option value="all">כל הסוכנות</option>}
              {agents.map(agent => (
               <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
             </select>
               </div>
             <div className="filter-select-container">
              <select id="worker-select" value={selectedWorkerIdFilter} 
              onChange={(e) => handleWorkerChange(e, 'filter')}  className="select-input">
              <option value="">כל העובדים</option>
             {workers.map(worker => (
                 <option key={worker.id} value={worker.id}>{worker.name}</option>
               ))}
             </select>   
              </div>
              <div className="filter-select-container">
             <select id="company-Select" value={selectedCompanyFilter} onChange={(e) => setSelectedCompanyFilter(e.target.value)} className="select-input">
               <option value="">בחר חברה</option>
               {companies.map((companyName, index) => (
               <option key={index} value={companyName}>{companyName}</option>
               ))}
              </select>
             </div>
             <div className="filter-select-container">
              <select id="product-Select" value={selectedProductFilter} onChange={(e) => setSelectedProductFilter(e.target.value)} className="select-input">
               <option value="">בחר מוצר</option>
              {products.map(product => (
             <option key={product.id} value={product.name}>{product.name}</option>
                ))}
               </select>
             </div>
             <div className="filter-select-container">
        <select
           id="status-PolicySelect"
            value={selectedStatusPolicyFilter}
            onChange={(e) => setSelectedStatusPolicyFilter(e.target.value)} className="select-input">
            <option value="">סטאטוס פוליסה</option>
                            {statusPolicies.map((status, index) => (
                                <option key={index} value={status}>{status}</option>
               ))}
               </select>
              </div>
             <div className="filter-input-container">
              <Search className="filter-input-icon" />
              <input
             type="text"
               placeholder="שם פרטי"
                value={firstNameCustomerFilter}
               onChange={(e) => setfirstNameCustomerFilter(e.target.value)}
               className="filter-input"
                />
              </div>
            <div className="filter-input-container">
            <Search className="filter-input-icon" />
              <input
             type="text"
              placeholder="שם משפחה"
               value={lastNameCustomerFilter}
             onChange={(e) => setlastNameCustomerFilter(e.target.value)}
              className="filter-input"
                />
               </div>
             <div className="filter-input-container">
              <Search className="filter-input-icon" />
              <input
             type="text"
              placeholder="תז לקוח"
              value={idCustomerFilter}
              onChange={(e) => setIdCustomerFilter(e.target.value)}
              className="filter-input"
               />
             </div>
             <div className="filter-input-container">
             <Search className="filter-input-icon" />
  <input
    type="text"
    id="expiry-Date"
    name="expiry-Date"
    value={expiryDateFilter}
    onChange={(e) => setExpiryDateFilter(e.target.value)}
    placeholder="חפש לפי תאריך"
    className="filter-input"
    />
</div>
          <div className="filter-checkbox-container">
       <select value={minuySochenFilter} onChange={(e) => setMinuySochenFilter(e.target.value)} className="select-input">
    <option value="">מינוי סוכן </option>
    <option value="true">כן</option>
    <option value="false">לא</option>
  </select>
                </div> 
      </div>
      <div  className="table-Deal-container">
        {isLoadingAgent && (
                   <div className="spinner-overlay">
                      <div className="spinner"></div>
                  </div>
                )}
       <div className={`table-Data-AgentForm ${'is-new-design'}`}>
                <table>
                <thead>
  <tr>
    <th className="medium-column" onClick={() => handleSort("firstNameCustomer" as keyof CombinedData)}>
      שם פרטי {sortColumn && sortColumn === "firstNameCustomer" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th className="medium-column" onClick={() => handleSort("lastNameCustomer" as keyof CombinedData)}>
      שם משפחה {sortColumn && sortColumn === "lastNameCustomer" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th className="wide-column" onClick={() => handleSort("IDCustomer" as keyof CombinedData)}>
      תז {sortColumn && sortColumn === "IDCustomer" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th className="medium-column" onClick={() => handleSort("company" as keyof CombinedData)}>
      חברה {sortColumn && sortColumn === "company" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th className="medium-column" onClick={() => handleSort("product" as keyof CombinedData)}>
      מוצר {sortColumn && sortColumn === "product" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th className="medium-column" onClick={() => handleSort("insPremia" as keyof CombinedData)}>
      פרמיה ביטוח {sortColumn && sortColumn === "insPremia" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th className="medium-column" onClick={() => handleSort("pensiaPremia" as keyof CombinedData)}>
      פרמיה פנסיה {sortColumn && sortColumn === "pensiaPremia" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th className="medium-column" onClick={() => handleSort("pensiaZvira" as keyof CombinedData)}>
      צבירה פנסיה {sortColumn && sortColumn === "pensiaZvira" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th className="medium-column" onClick={() => handleSort("finansimPremia" as keyof CombinedData)}>
      פרמיה פיננסים {sortColumn && sortColumn === "finansimPremia" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th className="medium-column" onClick={() => handleSort("finansimZvira" as keyof CombinedData)}>
      צבירה פיננסים {sortColumn && sortColumn === "finansimZvira" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th className="wide-column" onClick={() => handleSort("mounth" as keyof CombinedData)}>
      חודש תפוקה {sortColumn && sortColumn === "mounth" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th className="medium-column" onClick={() => handleSort("statusPolicy" as keyof CombinedData)}>
      סטאטוס {sortColumn && sortColumn === "statusPolicy" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th className="narrow-column" onClick={() => handleSort("minuySochen" as keyof CombinedData)}>
      מינוי סוכן {sortColumn && sortColumn === "minuySochen" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th className="narrow-column" onClick={() => handleSort("workerName" as keyof CombinedData)}>
      שם עובד {sortColumn && sortColumn === "workerName" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th className="wide-column" onClick={() => handleSort("notes" as keyof CombinedData)}>
      הערות {sortColumn && sortColumn === "notes" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th className="narrow-cell">🔧</th>
  </tr>
</thead>
                  <tbody>
                {currentRows.map((item) => (
                <tr key={item.id} className={editingRow === item.id ? "editing-row" : ""}>
    <td className="narrow-column">
               {editingRow === item.id ? (
          <input
            type="text"
            value={editData.firstNameCustomer || ""}
            onChange={(e) => handleEditChange("firstNameCustomer", e.target.value)}
          />
        ) : (
          item.firstNameCustomer
        )}
      </td>
            <td className="narrow-column">
               {editingRow === item.id ? (
          <input
            type="text"
            value={editData.lastNameCustomer || ""}
            onChange={(e) => handleEditChange("lastNameCustomer", e.target.value)}
          />
        ) : (
          item.lastNameCustomer
        )}
      </td>
      <td className="narrow-column">
        {editingRow === item.id ? (
          <input
            type="text"
            value={editData.IDCustomer || ""}
            onChange={(e) => handleEditChange("IDCustomer", e.target.value)}
          />
        ) : (
          item.IDCustomer
        )}
      </td>
      <td className="narrow-column">
        {editingRow === item.id ? (
          <select
            value={editData.company || ""}
            onChange={(e) => handleEditChange("company", e.target.value)}
          >
            <option value="">בחר חברה</option>
            {companies.map((company) => (
              <option key={company} value={company}>
                {company}
              </option>
            ))}
          </select>
        ) : (
          item.company
        )}
      </td>
      <td className="narrow-column">
        {editingRow === item.id ? (
          <select
            value={editData.product || ""}
            onChange={(e) => handleEditChange("product", e.target.value)}
          >
            <option value="">בחר מוצר</option>
            {products.map((product) => (
              <option key={product.id} value={product.name}>
                {product.name}
              </option>
            ))}
          </select>
        ) : (
          item.product
        )}
      </td>
      <td className="narrow-column">
        {editingRow === item.id ? (
          <input
            type="number"
            value={editData.insPremia || 0}
            onChange={(e) => handleEditChange("insPremia", Number(e.target.value))}
          />
        ) : (
          item.insPremia
        )}
      </td>
      <td className="narrow-column">
        {editingRow === item.id ? (
          <input
            type="number"
            value={editData.pensiaPremia || 0}
            onChange={(e) => handleEditChange("pensiaPremia", Number(e.target.value))}
          />
        ) : (
          item.pensiaPremia
        )}
      </td>
      <td className="narrow-column">
        {editingRow === item.id ? (
          <input
            type="number"
            value={editData.pensiaZvira || 0}
            onChange={(e) => handleEditChange("pensiaZvira", Number(e.target.value))}
          />
        ) : (
          item.pensiaZvira
        )}
      </td>
      <td className="narrow-column">
        {editingRow === item.id ? (
          <input
            type="number"
            value={editData.finansimPremia || 0}
            onChange={(e) => handleEditChange("finansimPremia", Number(e.target.value))}
          />
        ) : (
          item.finansimPremia
        )}
      </td>
      <td className="narrow-column">
        {editingRow === item.id ? (
          <input
            type="number"
            value={editData.finansimZvira || 0}
            onChange={(e) => handleEditChange("finansimZvira", Number(e.target.value))}
          />
        ) : (
          item.finansimZvira
        )}
      </td>
      <td className="medium-column">
        {editingRow === item.id ? (
          <input
            type="date"
            value={editData.mounth || ""}
            onChange={(e) => handleEditChange("mounth", e.target.value)}
            />
          ) : item.mounth ? (
            formatIsraeliDateOnly(item.mounth)
          ) : (
            ""
          )}
        </td>
      <td className="narrow-column">
        {editingRow === item.id ? (
          <select
            value={editData.statusPolicy || ""}
            onChange={(e) => handleEditChange("statusPolicy", e.target.value)}
          >
            <option value="">בחר סטטוס</option>
            {statusPolicies.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        ) : (
          item.statusPolicy
        )}
      </td>
      <td className="small-column">
        {editingRow === item.id ? (
          <input
            type="checkbox"
            checked={editData.minuySochen || false}
            onChange={(e) => handleEditChange("minuySochen", e.target.checked)}
          />
        ) : (
          item.minuySochen ? "כן" : "לא"
        )}
      </td>
      <td className="medium-column">
  {editingRow === item.id ? (
    <select
      value={editData.workerId || ""}
      onChange={(e) => handleEditChange("workerName", e.target.value)}
    >
      <option value="">בחר עובד</option>
      {workers.map((worker) => (
        <option key={worker.id} value={worker.id}>
          {worker.name}
        </option>
      ))}
    </select>
  ) : (
    workerNameMap[item.workerId ?? ""] || "לא נמצא"
  )}
</td>
<td className="notes-column wide-column">
  <span className="notes-preview">
      {item.notes}
  </span>
  {/* {item.notes && item.notes.length > 5 && (
    <button
      className="show-more-btn"
      onClick={() => handleShowMore(item.notes || '', item.id)}
    >
      הצג עוד
    </button>
  )} */}
  {editingRow === item.id && (
    <input
      type="text"
      value={editData.notes || ''}
      onChange={(e) => handleEditChange('notes', e.target.value)}
    />
  )}
  {item.notes ? (
    <div className="inline-modal">
      <p>{item.notes}</p>
    </div>
  ) : null}
</td>
<td className="narrow-cell">
<MenuWrapper
  rowId={item.id}
  openMenuRow={openMenuRow} // סטייט לפתיחת התפריט
  setOpenMenuRow={setOpenMenuRow} // פונקציה לעדכון סטייט
  menuItems={menuItems(
    item.id,
    () => setOpenMenuRow(null) // פונקציה לסגירת התפריט
  )}
/>
</td>
    </tr>
  ))}
</tbody>
<tfoot>
      <tr>
      <td colSpan={16}>
      <TableFooter
  currentPage={currentPage}
  totalPages={Math.ceil(filteredData.length / rowsPerPage)}
  onPageChange={handlePageChange}
  rowsPerPage={rowsPerPage}
  onRowsPerPageChange={(value) => {
    setRowsPerPage(value);
    setCurrentPage(1); // חזרה לעמוד ראשון כשמשנים כמות רשומות
  }}
/>
               </td>
              </tr>
           </tfoot>
           </table>
         </div>
      </div>
      </div> 
      {toasts.length > 0  && toasts.map((toast) => (
  <ToastNotification 
    key={toast.id}  
    type={toast.type}
    className={toast.isHiding ? "hide" : ""} 
    message={toast.message}
    onClose={() => setToasts((prevToasts) => prevToasts.filter((t) => t.id !== toast.id))}
  />
))}
    {showOpenNewDeal && (
  <div className="modal-overlay" onClick={() => setShowOpenNewDeal(false)}>
    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
      <button className="close-button" 
      onClick={() => {
        cancelEdit(true);
      }} 
      >✖</button>
      <form className="form-container" onSubmit={(e) => e.preventDefault()}>
        <div className="title">{editingRow ? "עריכת עסקה" : "עסקה חדשה"}</div>

        {/* פרטים אישיים */}
        <section className="form-section">
          <h3 className="section-title">פרטים אישיים</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>סוכנות *</label>
              <select value={editData.AgentId || ""} 
              onChange={(e) => {
              handleEditChange("AgentId", e.target.value)
              console.log( canSubmit +"🔄 AgentId:", e.target.value);
              }}>
              {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>עובד *</label>
              <select value={editData.workerId || ""} 
              onChange={(e) => {
              handleDealEditChange("workerId", e.target.value)
              console.log( canSubmit + "🔄 workerId:", e.target.value);
              }}
              className={invalidFields.includes("workerId") ? "input-error" : ""}
              >
                <option value="">בחר עובד</option>
                {workers.map(worker => (
                  <option key={worker.id} value={worker.id}>{worker.name}</option>
                ))}
              </select>
              {invalidFields.includes("workerId") && (
    <div className="error-message">חובה לבחור עובד</div>
  )}
            </div>
            <div className="form-group">
  <label>תעודת זהות *</label>
  <input
    type="text"
    value={editData.IDCustomer || ""}
    onChange={(e) => handleValidatedEditChange("IDCustomer", e.target.value, setEditData, setErrors)}
    onFocus={() => console.log("🟢 Input focused")}
    onBlur={() => {
      console.log("🔵 Blur manually triggered");
      handleIDBlur();
    }}
    className={errors.IDCustomer ? "input-error" : ""}
  />
  {errors.IDCustomer && <div className="error-message">{errors.IDCustomer}</div>}
</div>
  <div className="form-group">
  <label>שם פרטי *</label>
  <input
    type="text"
    value={editData.firstNameCustomer || ""}
    onChange={(e) => handleValidatedEditChange("firstNameCustomer", e.target.value, setEditData, setErrors)}
    onBlur={(e) => {
      handleValidatedEditChange("firstNameCustomer", e.target.value, setEditData, setErrors);
      if (validateAllFields) {
        validateAllRequiredFields(); // ✅ שיהיה גם כאן
      }
    }}
    className={errors.firstNameCustomer ? "input-error" : ""}

 />
  {errors.firstNameCustomer && <div className="error-message">{errors.firstNameCustomer}</div>}
</div>
<div className="form-group">
  <label>שם משפחה *</label>
  <input
    type="text"
    value={editData.lastNameCustomer || ""}
    onChange={(e) => handleValidatedEditChange("lastNameCustomer", e.target.value, setEditData, setErrors)} 
    onBlur={(e) => {
      handleValidatedEditChange("lastNameCustomer", e.target.value, setEditData, setErrors);
      if (validateAllFields) {
        validateAllRequiredFields(); // ✅ שיהיה גם כאן
      }
    }}
    className={errors.lastNameCustomer ? "input-error" : ""}

 />
  {errors.lastNameCustomer && <div className="error-message">{errors.lastNameCustomer}</div>}
</div>
            <div className="form-group">
              <label>טלפון</label>
              <input type="tel" value={editData.phone || ""} onChange={(e) => handleEditChange("phone", e.target.value)} />
            </div>
            <div className="form-group">
              <label>דואר אלקטרוני</label>
              <input type="email" value={editData.mail || ""} onChange={(e) => handleEditChange("mail", e.target.value)} />
            </div>
            <div className="form-group">
              <label>כתובת</label>
              <input type="text" value={editData.address || ""} onChange={(e) => handleEditChange("address", e.target.value)} />
            </div>
          </div>
        </section>

        {/* פרטי עסקה */}
        <section className="form-section">
          <h3 className="section-title">פרטי עסקה</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>חברה *</label>
              <select value={editData.company || ""} 
              onChange={(e) => {
                handleDealEditChange("company", e.target.value)
              console.log( canSubmit +"🟢 company changed:", e.target.value);
              }}
              className={invalidFields.includes("company") ? "input-error" : ""}
              >
                <option value="">בחר חברה</option>
                {companies.map((companyName, index) => (
                  <option key={index} value={companyName}>{companyName}</option>
                ))}
              </select>
              {invalidFields.includes("company") && (
    <div className="error-message">חובה לבחור חברה</div>
  )}
            </div>
            <div className="form-group">
              <label>מוצר *</label>
              <select value={editData.product || ""} 
              onChange={(e) => {
                console.log( canSubmit +"🔄 Product:", e.target.value);
                handleDealEditChange("product", e.target.value);
              }}
              className={invalidFields.includes("product") ? "input-error" : ""}
              >
                <option value="">בחר מוצר</option>
                {products.map(product => (
                  <option key={product.id} value={product.name}>{product.name}</option>
                ))}
              </select>
              {invalidFields.includes("product") && (
    <div className="error-message">חובה לבחור מוצר</div>
  )}
            </div>
            {/* פרטי פרמיה */}
       {selectedProductGroup && selectedProductGroup !== "1" && selectedProductGroup !== "4" && (
  <div className="form-group">
    <label htmlFor="insPremia">פרמיה ביטוח</label>
    <input
      type="number"
      id="insPremia"
      value={editData.insPremia || ""}
      onChange={(e) => handleEditChange("insPremia", e.target.value)}
    />
  </div>
)}
{selectedProductGroup && selectedProductGroup !== "3" && selectedProductGroup !== "4" && (
  <div className="form-group">
    <label htmlFor="pensiaPremia">פרמיה פנסיה</label>
    <input
      type="number"
      id="pensiaPremia"
      value={editData.pensiaPremia || ""}
      onChange={(e) => handleEditChange("pensiaPremia", e.target.value)}
    />
  </div>
)}

{selectedProductGroup && selectedProductGroup !== "3" && selectedProductGroup !== "4" && (
  <div className="form-group">
    <label htmlFor="pensiaZvira">צבירה פנסיה</label>
    <input
      type="number"
      id="pensiaZvira"
      value={editData.pensiaZvira || ""}
      onChange={(e) => handleEditChange("pensiaZvira", e.target.value)}
    />
  </div>
)}

{selectedProductGroup && selectedProductGroup !== "1" && selectedProductGroup !== "3" && (
  <div className="form-group">
    <label htmlFor="finansimPremia">פרמיה פיננסים</label>
    <input
      type="number"
      id="finansimPremia"
      value={editData.finansimPremia || ""}
      onChange={(e) => handleEditChange("finansimPremia", e.target.value)}
    />
  </div>
)}

{selectedProductGroup && selectedProductGroup !== "1" && selectedProductGroup !== "3" && (
  <div className="form-group">
    <label htmlFor="finansimZvira">צבירה פיננסים</label>
    <input
      type="number"
      id="finansimZvira"
      value={editData.finansimZvira || ""}
      onChange={(e) => handleEditChange("finansimZvira", e.target.value)}
    />
  </div>
)}
            <div className="form-group">
              <label>סטטוס עסקה *</label>
              <select value={editData.statusPolicy || ""} 
              onChange={(e) => {
                handleDealEditChange("statusPolicy", e.target.value)
              console.log( canSubmit +"🔄 statusPolicy:", e.target.value);

      }}
      className={invalidFields.includes("statusPolicy") ? "input-error" : ""}
      >
                <option value="">בחר סטאטוס</option>
                {statusPolicies.map((status, index) => (
                  <option key={index} value={status}>{status}</option>
                ))}
              </select>
              {invalidFields.includes("product") && (
    <div className="error-message">חובה לבחור מוצר</div>
  )}
            </div>
            <div className="form-group">
              <label>תאריך תפוקה *</label>
              <input type="date" 
              value={editData.mounth || ""} 
              onChange={(e) =>{
                handleDealEditChange("mounth", e.target.value)
               console.log( canSubmit +"🔄 mounth:", e.target.value);
      }}
      onBlur={(e) => {
        console.log("📌 יציאה משדה mounth");
        setValidateAllFields(true);
        validateAllRequiredFields(); // ✅ בודק גם את ה-inputים החכמים
      }}
      className={invalidFields.includes("mounth") ? "input-error" : ""}
      />
            </div>
   <div className="form-group checkbox-group">
  <label className="checkbox-label">
    <input 
      type="checkbox" 
      checked={editData.minuySochen || false} 
      onChange={(e) => handleEditChange("minuySochen", e.target.checked)} 
    />
  <span>מינוי סוכן</span>
  </label>
</div>

<div className="form-group full-width">
  <label>הערות</label>
  <textarea value={editData.notes || ""} 
            onChange={(e) => handleEditChange("notes", e.target.value)}
            rows={4}></textarea>
      </div>
          </div>
        </section>

        {/* כפתורי פעולה */}
        <div className="form-actions">
          {editingRow ? (
            <div className="right-buttons">
              <Button
                onClick={saveChanges} 
                text="שמור שינויים"
                type="primary"
                icon="on"
                disabled={!editingRow}
              />
            </div>
          ) : (
            <div className="right-buttons">
              <Button
                onClick={(e) => handleSubmit(e, false)}
                text="הזן"
                type="primary"
                icon="on"
                disabled={!canSubmit || submitDisabled}
                state={!canSubmit ? "disabled" : "default"}
              />
              {/* {!canSubmit && <p style={{ color: "red" }}>⚠️ יש למלא את כל השדות!</p>} */}
              <Button
                onClick={(e) => handleSubmit(e, true)}
                text="הזן וסיים"
                type="primary"
                icon="on"
                disabled={!canSubmit || submitDisabled}
                state={!canSubmit ? "disabled" : "default"}
              />
            </div>
          )}
          <div className="left-buttons">
            <Button
              onClick={() => {
                console.log("🟠 כפתור בטל נלחץ, מפעיל cancelEdit...");
                cancelEdit(true);
              }} 
              text="בטל"
              type="secondary"
              icon="off"
              state="default"
            />
          </div>
        </div>
      </form>
    </div>
  </div>
)}
    </div>
  );
}

export default NewAgentForm;