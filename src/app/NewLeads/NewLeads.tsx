import { ChangeEventHandler, FormEventHandler, SetStateAction, useEffect, useMemo, useState } from "react";
import { collection, query, setDoc, where, getDocs, getDoc, addDoc, deleteDoc, doc, updateDoc, DocumentSnapshot, DocumentData, serverTimestamp, Timestamp, Query } from "firebase/firestore";
import { db, firebaseApp } from "@/lib/firebase/firebase";
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchMD from "@/hooks/useMD";
import './NewLeads.css';
import useFetchAgentData from "@/hooks/useFetchAgentData";
import React from 'react';
import { Button } from "@/components/Button/Button";
import MenuWrapper from "@/components/MenuWrapper/MenuWrapper";
import Edit from '@/components/icons/Edit/Edit'; 
import Delete  from '@/components/icons/Delete/Delete'; 
import useEditableTable from "@/hooks/useEditableTable";
import { LeadsType } from '@/types/LeadsType ';
import {useSortableTable}  from "@/hooks/useSortableTable";
import {ToastNotification} from '@/components/ToastNotification';
import { useToast } from "@/hooks/useToast";
import { useValidation } from "@/hooks/useValidation";
import { getDownloadURL, getStorage, ref } from "firebase/storage";
import { useRouter } from 'next/navigation';
import { usePermission } from "@/hooks/usePermission";
import DocumentsModal from "@/components/DocumentsModal/DocumentsModal";

const NewLeads = () => {

  const [firstNameCustomer, setfirstNameCustomer] = useState('');
  const [lastNameCustomer, setlastNameCustomer] = useState('');
  const [IDCustomer, setIDCustomer] = useState('');
  const { user, detail } = useAuth();
  const [notes, setNotes] = useState('');
  const [selectedRow, setSelectedRow] = useState<any | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
  const [idCustomerFilter, setIdCustomerFilter] = useState('');
  const [firstNameCustomerFilter, setfirstNameCustomerFilter] = useState('');
  const [lastNameCustomerFilter, setlastNameCustomerFilter] = useState('');
  const [filteredData, setFilteredData] = useState<LeadsType[]>([]);
  // const [leadsData, setLeadsData] = useState<LeadsType[]>([]);
  const [selectedStatusLead, setSelectedStatusLead] = useState<string>('');

  const [showSelect, setShowSelect] = useState(false);
  const [selectedCustomers, setSelectedCustomers] = useState(new Set<string>());

  const [returnDate, setReturnDate] = useState('');
  const [lastContactDate, setLastContactDate] = useState('');

  const [phone, setPhone] = useState('');
  const [mail, setMail] = useState('');
  const [address, setAddress] = useState('');

  
  const [birthday, setBirthday] = useState('');
  const [availableFunds, setAvailableFunds] = useState('');
  const [retirementFunds, setRetirementFunds] = useState('');
  const [consentForInformationRequest, setConsentForInformationRequest] = useState(false);

  const [campaign, setCampaign] = useState('');

  const [selectedAgentIdInRow, setSelectedAgentIdInRow] = useState<string | null>(null);
  const [submitDisabled, setSubmitDisabled] = useState(false);


  const handleLastContactDate = (e: React.ChangeEvent<HTMLInputElement>) => setLastContactDate(e.target.value);
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value);
  const handleMailChange = (e: React.ChangeEvent<HTMLInputElement>) => setMail(e.target.value);
  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => setAddress(e.target.value);
  const handleBirthdayChange = (e: React.ChangeEvent<HTMLInputElement>) => setBirthday(e.target.value);

  const [sourceValue, setSourceValue] = useState<string | null>('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  //const [sourceLeadList, setSourceLeadList] = useState<any[]>([]);
  const handleReturnDate = (event: { target: { value: string; }; }) => {
    const newDateTime = event.target.value.replace("T", " "); // Replace "T" with a space
    setReturnDate(newDateTime); // Update state in the desired format
  };
const [editingRowId, setEditingRowId] = useState<string | null>(null);
const [newStatusLead, setNewStatusLead] = useState<string>('');
const [selectedStatusLeadFilter, setSelectedStatusLeadFilter] = useState('');
const [selectedSourceLeadFilter, setSelectedSourceLeadFilter] = useState('');

const [editingRowIdTime, setEditingRowIdTime] = useState<string | null>(null);
const { toasts, addToast, setToasts } = useToast();

const { errors,setErrors, handleValidatedEditChange } = useValidation();

const { canAccess: canAccessCrm } = usePermission('access_crm_module');

const router = useRouter();


  interface Suggestion {
    id: string;
    source: string; 
  }

type LeadDocumentRow = {
  id: string;
  leadId: string;
  fileName: string;
  mimeType?: string;
  size?: number;
  storagePath: string;
  bucket?: string;
  url?: string;
};

const [leadDocuments, setLeadDocuments] = useState<LeadDocumentRow[]>([]);
const [documentsModalOpen, setDocumentsModalOpen] = useState(false);
const [documentsLeadName, setDocumentsLeadName] = useState("");
const [documentsLoading, setDocumentsLoading] = useState(false);
const [documentsLeadId, setDocumentsLeadId] = useState<string | null>(null);
  
  const {
    agents,
    selectedAgentId,
    handleAgentChange,
    selectedAgentName,
    workers, 
    handleWorkerChange,
    selectedWorkerId,
    selectedWorkerName, 
    setSelectedWorkerName,
    workerNameMap,
    setSelectedWorkerId, 
    selectedWorkerIdFilter,
  } = useFetchAgentData();

  const fetchLeadsForAgent = async (UserAgentId: string | null) => {
    // console.log("fetchLeadsForAgent", UserAgentId);
    let salesQuery: Query<DocumentData> = collection(db, "leads"); // בסיס השאילתה
  
    // הוספת תנאי סינון אם AgentId מסופק ואינו 'all'
    if (UserAgentId && UserAgentId !== "all") {
      salesQuery = query(salesQuery, where("AgentId", "==", UserAgentId));
    }
    try {
      const querySnapshot = await getDocs(salesQuery);
      const data = await Promise.all(
        querySnapshot.docs.map(async (docSnapshot) => {
          const LeadsData = docSnapshot.data() as LeadsType;
          let agentName = "סוכן לא נמצא";
  
          // בדיקה אם AgentId קיים עבור הליד
          if (LeadsData.AgentId) {
            const agentDocRef = doc(db, "users", LeadsData.AgentId);
            const agentDocSnap = await getDoc(agentDocRef);
  
            if (agentDocSnap.exists()) {
              const agentData = agentDocSnap.data();
              agentName = agentData?.name || "ללא שם";
            }
          }
  
          return {
            ...LeadsData,
            id: docSnapshot.id,
            agentName, // הוספת שם הסוכן
          };
        })
      );
  
      // console.log("fetchLeadsForAgentData", data);
      return data; // מחזירים את הנתונים במקום setLeadsData
    } catch (error) {
      // console.error("Error fetching leads:", error);
      return []; // במקרה של שגיאה נחזיר מערך ריק
    }
  };
  

  const [openMenuRow, setOpenMenuRow] = useState(null);
  
  const {
    data: leadsData,
    editingRow: editingLeadRow,
    editData,
    setEditData,
    handleEditRow: handleEditLeadRow,
    handleEditChange: handleEditLeadChange,
    handleDeleteRow: handleDeleteLeadRow,
    saveChanges: saveLeadChanges,
    reloadData: reloadLeadsData,
    cancelEdit: cancelEditLead,
  } = useEditableTable({
    dbCollection: "leads",
    agentId: selectedAgentId,
    fetchData: fetchLeadsForAgent,
    onCloseModal: () => {
      // console.log("🔴 סוגר מודל לידים!");
      setShowOpenNewLead(false);
    }, 
  });
  
  useEffect(() => {
    // console.log("🧐 תוכן editLeadData בתוך המודל:", editData);
  }, [editData]);
  




  useEffect(() => {
    if (selectedAgentId) {
        fetchLeadsForAgent(selectedAgentId);
      resetForm();
    }
  }, [selectedAgentId]);

  const { 
    statusLeadMap,
    sourceLeadList,
    formatIsraeliDateOnly,
    sourceLeadMap
  } = useFetchMD(selectedAgentId);
  
  useEffect(() => {
    // Apply filters to the leads data
    const data = leadsData.filter(item => {
      const matchesIdCustomer = idCustomerFilter ? item.IDCustomer?.includes(idCustomerFilter) : true;  
      const fullName = `${item.firstNameCustomer || ''} ${item.lastNameCustomer || ''}`.trim();
      const filterFullName = `${firstNameCustomerFilter} ${lastNameCustomerFilter}`.trim();
      const matchesName = firstNameCustomerFilter || lastNameCustomerFilter
        ? fullName.includes(filterFullName)
        : true;  
      const matchesWorkerId = selectedWorkerIdFilter ? item.workerId?.includes(selectedWorkerIdFilter) : true;
      const matchesStatusLead = selectedStatusLeadFilter ? item.selectedStatusLead === selectedStatusLeadFilter : true;
      const matchesSourceLead = selectedSourceLeadFilter ? item.sourceValue === selectedSourceLeadFilter : true;
        return matchesIdCustomer && matchesName && matchesStatusLead && matchesWorkerId && matchesSourceLead;
    });
      setFilteredData(data);
    // console.log("Filtered Data:", data);
  }, [
    leadsData,
    idCustomerFilter,
    firstNameCustomerFilter,
    lastNameCustomerFilter,
    selectedWorkerIdFilter,
    selectedStatusLeadFilter,
    selectedSourceLeadFilter
  ]);
  


  const resetForm = () => {
    setfirstNameCustomer('');
    setlastNameCustomer('');
    setIDCustomer('');
    setReturnDate('');
    setLastContactDate('');
    setIsEditing(false);
    setNotes('');
    setPhone('');
    setMail('');
    setPhone('');
    setAddress('');
    setSourceValue('');
    setSuggestions([]);
    setSelectedStatusLead('');
    setSelectedWorkerId('');
    setSelectedWorkerName('');
    setAvailableFunds('');
    setRetirementFunds('');
    setConsentForInformationRequest(false);
    setBirthday('');
    setCampaign('');
    setSelectedAgentIdInRow(null);
  };



  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    try {
      const docRef = await addDoc(collection(db, 'leads'), {
        ...editData, // כל הערכים החדשים בטופס נמצאים כאן!!
        AgentId: selectedAgentId,
        lastUpdateDate: serverTimestamp(),
        createDate: serverTimestamp(),
      });
  
      addToast("success", "ליד חדש התווסף בהצלחה");
      resetForm();
      setIsEditing(false);
      setShowOpenNewLead(false);
      reloadLeadsData(selectedAgentId);
    } catch (error) {
      // console.error('Error adding document:', error);
    }
  };
  


  const canSubmit = useMemo(() => {
    const isPhoneValid = (editData.phone || "").trim() !== "";
    const isAgentValid = (editData.AgentId || "").trim() !== "";
    
    // אם המשתמש הוא אדמין, עליו לבחור סוכן
    if (detail?.role === "admin") {
      return isAgentValid && isPhoneValid;
    }
  
    // אם המשתמש הוא סוכן, מספיק טלפון תקין
    return isPhoneValid;
  }, [editData.AgentId, editData.phone, detail?.role]);
  
  

  const handleSelectChange = (event: { target: { value: SetStateAction<string | null>; }; }) => {
    setSourceValue(event.target.value);
  };
  const handleStatusChange = async (rowId: string, newValue: string) => {
    try {
      const docRef = doc(db, 'leads', rowId);
      await updateDoc(docRef, {
        selectedStatusLead: newValue,
        lastUpdateDate: serverTimestamp(),
      });
  
      // רענון הנתונים במקום שינוי סטייט ידני
      reloadLeadsData(selectedAgentId);
    } catch (error) {
      // console.error('Error updating statusLead:', error);
    }
  };
  
  const handleWorkerChangeInRow = async (rowId: string, newWorkerId: string) => {
    try {
      const docRef = doc(db, 'leads', rowId);
      await updateDoc(docRef, {
        workerId: newWorkerId,
        lastUpdateDate: serverTimestamp(),
      });
  
      // רענון הנתונים במקום שינוי סטייט ידני
      reloadLeadsData(selectedAgentId);
    } catch (error) {
      // console.error('Error updating worker:', error);
    }
  };
  
  const handleReturnDateChange = async (id: string, newReturnDate: string) => {
    try {
      const docRef = doc(db, "leads", id);
      await updateDoc(docRef, {
        returnDate: newReturnDate,
        lastUpdateDate: serverTimestamp(),
      });
      // רענון הנתונים במקום שינוי סטייט ידני
      reloadLeadsData(selectedAgentId);
    } catch (error) {
      // console.error("Error updating returnDate:", error);
    }
  };
  
  const formatPhoneNumber = (phone: string): string => {
    // Format phone numbers with one dash, e.g., "0527795177" -> "052-7795177"
    return phone.replace(/(\d{3})(\d+)/, "$1-$2");
  };
  
  const formatIsraeliDate = (dateString: string): string => {
    if (!dateString) return ''; // Handle empty or undefined dates
    const date = new Date(dateString.replace(" ", "T")); // Convert to Date object
    const options: Intl.DateTimeFormatOptions = {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    };
    return new Intl.DateTimeFormat('he-IL', options).format(date); // Format to Israeli locale
  };
  
  const [seourceAllLeadMap, setSourceAllLeadMap] = useState<{ [key: string]: string }>({});

  
  // שליפת כל מקורות הליד ליצירת מפה
  const fetchAllSourceLeads = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, "sourceLead"));
      const sourceMap = querySnapshot.docs.reduce((map, doc) => {
        map[doc.id] = doc.data().sourceLead || "מקור לא ידוע";
        return map;
      }, {} as { [key: string]: string });
      setSourceAllLeadMap(sourceMap);
      // console.log("Fetched all source leads:", sourceMap);
    } catch (error) {
      // console.error("Error fetching source leads:", error);
    }
  };

  useEffect(() => {
    fetchAllSourceLeads();
  }, []);

  const [showOpenNewLead, setShowOpenNewLead] = useState(false);

  const handleEditRowModal = (id: string) => {
    // console.log("🖊️ מנסה לערוך שורה:", id);
  
    setIsEditing(true); // מצב עריכה
    handleEditLeadRow(id); // ⬅️ זה אמור לעדכן את `editLeadData`
  
    // מחכים מעט כדי לוודא שהנתונים נטענו
    setTimeout(() => {
      // console.log("🧐 נתוני עריכה לאחר handleEditLeadRow:", editData);
      setShowOpenNewLead(true); // נפתח רק אם יש מידע
    }, 200);
  };
  

  
  const handleNewLead = () => {
    setIsEditing(false); // ליד חדש
    cancelEditLead();
    setShowOpenNewLead(true);
  };
  
  useEffect(() => {
    if (showOpenNewLead && isEditing) {
      // console.log("📢 מודל בעריכה נטען עם הנתונים:", editData);
    }
  }, [editData, showOpenNewLead]);

  

 const menuItems = (rowId: string, closeMenu: () => void) => {
  const lead = leadsData.find(l => l.id === rowId); // ← זה פותר את השגיאה

  return [
    {
      label: "ערוך",
      onClick: () => { handleEditRowModal(rowId); closeMenu(); },
      Icon: Edit,
    },
    {
      label: "מחק",
      onClick: () => { handleDeleteLeadRow(rowId); closeMenu(); },
      Icon: Delete,
    },
    {
      label: "המר ללקוח",
      onClick: () => {
        if (lead && window.confirm(`להמיר את ${lead.firstNameCustomer} ${lead.lastNameCustomer} ללקוח?`)) {
          handleConvertToCustomer(lead);
        }
        closeMenu();
      },
      Icon: Edit,
    },
    {
  label: "מסמכים",
  onClick: () => {
    if (lead) {
      openLeadDocuments(lead);
    }
    closeMenu();
  },
  Icon: Edit,
},
  ];
};

  useEffect(() => {
    if (editingLeadRow) {
      setShowOpenNewLead(true);
    }
  }, [editingLeadRow]);
  
 

  const { sortedData, sortColumn, sortOrder, handleSort, setSortedData } = useSortableTable(filteredData);

const mapGenderToHebrew = (g: string): string => {
  if (g === 'male') return 'זכר';
  if (g === 'female') return 'נקבה';
  return '';
};


const handleConvertToCustomer = async (lead: LeadsType) => {
     if (!lead.AgentId) {
    addToast("error", "ליד חסר סוכן – לא ניתן להמיר");
    return;
  }
  if (!lead.IDCustomer || !lead.firstNameCustomer || !lead.lastNameCustomer) {
    addToast("error", "להמרה ללקוח נדרשים: שם פרטי, שם משפחה ותעודת זהות");
    return;
  }

  // בדיקת קיום לקוח
  const customerQuery = query(
    collection(db, 'customer'),
    where('IDCustomer', '==', lead.IDCustomer),
    where('AgentId', '==', lead.AgentId)
  );
  const customerSnapshot = await getDocs(customerQuery);

  if (!customerSnapshot.empty) {
    addToast("error", "לקוח עם תז זה כבר קיים במערכת");
    return;
  }

  try {
    // יצירת רשומת customer
    const customerRef = doc(collection(db, 'customer'));
    await setDoc(customerRef, {
      AgentId: lead.AgentId,
      firstNameCustomer: lead.firstNameCustomer || '',
      lastNameCustomer: lead.lastNameCustomer || '',
      fullNameCustomer: `${lead.firstNameCustomer || ''} ${lead.lastNameCustomer || ''}`.trim(),
      IDCustomer: lead.IDCustomer,
      parentID: customerRef.id,
      phone: lead.phone || '',
      mail: lead.mail || '',
      address: lead.address || '',
      birthday: lead.birthday || '',
      issueDay: lead.idCardIssueDate || '',
      gender: mapGenderToHebrew(lead.gender || ''),
      notes: lead.notes || '',
      sourceValue: lead.sourceValue || '',
      sourceLead: lead.sourceValue || '',
      convertedFromLeadId: lead.id,
      createdAt: serverTimestamp(),
      lastUpdateDate: serverTimestamp(),
    });

// ── Migration הערות ──
const notesSnap = await getDocs(query(
  collection(db, 'customerNotes'),
  where('customerId', '==', lead.id),
));
for (const n of notesSnap.docs) {
  await updateDoc(n.ref, { customerId: customerRef.id });
}

// ── Migration משימות ──
const tasksSnap = await getDocs(query(
  collection(db, 'customerTasks'),
  where('customerId', '==', lead.id),
));
for (const t of tasksSnap.docs) {
  await updateDoc(t.ref, { customerId: customerRef.id });
}

// ── Migration מסמכים ──
const docsSnap = await getDocs(query(
  collection(db, 'leadDocuments'),
  where('leadId', '==', lead.id),
));
for (const d of docsSnap.docs) {
  // מוסיפים רשומה חדשה ב-customerDocuments עם אותם נתוני קובץ
  await addDoc(collection(db, 'customerDocuments'), {
    ...d.data(),
    customerId: customerRef.id,
    convertedFromLeadDocId: d.id,
    createdAt: serverTimestamp(),
  });
}
    // עדכון סטטוס הליד
    const convertedStatus = statusLeadMap.find(
      s => s.statusLeadName === 'הפך ללקוח'
    )?.id ?? '';

    await updateDoc(doc(db, 'leads', lead.id), {
      selectedStatusLead: convertedStatus,
      lastUpdateDate: serverTimestamp(),
    });

    reloadLeadsData(selectedAgentId);
    addToast("success", `${lead.firstNameCustomer} ${lead.lastNameCustomer} הומר ללקוח בהצלחה`);
  } catch (error) {
    addToast("error", "שגיאה ביצירת הלקוח");
  }
};

const openLeadDocuments = async (lead: LeadsType) => {
  if (!lead.id) {
    addToast("error", "ליד חסר מזהה");
    return;
  }

  setDocumentsModalOpen(true);
  setDocumentsLeadId(lead.id);
  setDocumentsLeadName(
    `${lead.firstNameCustomer || ""} ${lead.lastNameCustomer || ""}`.trim()
  );
  setDocumentsLoading(true);
  setLeadDocuments([]);

  try {
    const qDocs = query(
      collection(db, "leadDocuments"),
      where("leadId", "==", lead.id)
    );

    const snap = await getDocs(qDocs);

    const rows = [];
for (const d of snap.docs) {
    const data: any = d.data();
    let url = "";

    try {
      const bucketName = String(data.bucket || '').trim();
      const storagePath = String(data.storagePath || '').trim();

      if (bucketName && storagePath) {
        // ✅ מציינים את ה-app וה-bucket הספציפי במפורש
        const { firebaseApp } = await import('@/lib/firebase/firebase');
        const storage = getStorage(firebaseApp, `gs://${bucketName}`);
const storageRef = ref(storage, storagePath);
url = await getDownloadURL(storageRef);
      }
    } catch (e) {
      console.error("Failed to create download URL", {
        bucket: data.bucket,
        storagePath: data.storagePath,
        error: e,
      });
    }
      rows.push({
        id: d.id,
        leadId: data.leadId,
        fileName: data.fileName || "מסמך",
        mimeType: data.mimeType || "",
        size: data.size || 0,
        storagePath: data.storagePath || "",
        bucket: data.bucket || "",
        url,
      });
    }

    setLeadDocuments(rows);
  } catch (error) {
    console.error("Failed loading lead documents", error);
    addToast("error", "שגיאה בטעינת מסמכי הליד");
  } finally {
    setDocumentsLoading(false);
  }
};



const handleRenameLeadDocument = async (docId: string, newName: string) => {
  await updateDoc(doc(db, 'leadDocuments', docId), { fileName: newName });
  setLeadDocuments(prev => prev.map(d => d.id === docId ? { ...d, fileName: newName } : d));
};


const handleUploadLeadDocument = async (file: File) => {
  if (!documentsLeadId) return;

  try {
    const formData = new FormData();
    formData.append('leadId', documentsLeadId);
    formData.append('file', file);

    const res = await fetch('/api/leadDocuments/upload', {
      method: 'POST',
      body: formData,
    });

    const result = await res.json();

    if (!result.ok) {
      addToast('error', result.error || 'שגיאה בהעלאת המסמך');
      return;
    }

    if (result.skipped) {
      addToast('warning', 'קובץ זהה כבר קיים ולא הועלה שוב');
      return;
    }

    // שליפת URL להורדה מיידית לתצוגה
    const { firebaseApp } = await import('@/lib/firebase/firebase');
    let url = '';
    try {
      const storage = getStorage(firebaseApp, `gs://${result.bucket}`);
      const storageRef = ref(storage, result.storagePath);
      url = await getDownloadURL(storageRef);
    } catch {}

    setLeadDocuments(prev => [...prev, {
      id: result.documentId,
      leadId: documentsLeadId,
      fileName: result.fileName,
      mimeType: file.type,
      size: file.size,
      storagePath: result.storagePath,
      bucket: result.bucket,
      url,
    }]);

    addToast('success', 'המסמך הועלה בהצלחה');
  } catch (error) {
    console.error('Failed to upload lead document', error);
    addToast('error', 'שגיאה בהעלאת המסמך');
  }
};

const handleDeleteLeadDocument = async (docId: string) => {
  try {
    const res = await fetch('/api/leadDocuments/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: docId }),
    });
    const result = await res.json();
    if (!result.ok) {
      addToast('error', result.error || 'שגיאה במחיקת המסמך');
      return;
    }
    setLeadDocuments(prev => prev.filter(d => d.id !== docId));
    addToast('success', 'המסמך נמחק');
  } catch (error) {
    console.error('Failed to delete lead document', error);
    addToast('error', 'שגיאה במחיקת המסמך');
  }
};


  return (
    <div className="content-container">
    <div className="table-title">ניהול לידים</div>
    <div className="data-container">
    <div className="header-actions">
    <div className="filter-select-container">
        <select onChange={handleAgentChange} value={selectedAgentId} className="select-input">
                    {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
                    {detail?.role === 'admin' && <option value="all">כל הסוכנות</option>}
                    {agents.map(agent => (
                      <option key={agent.id} value={agent.id}>{agent.name}</option>
                    ))}
          </select>
        <input className="filter-input"
        type="text"
        placeholder="שם"
       value={`${firstNameCustomerFilter} ${lastNameCustomerFilter}`.trim()}
       onChange={(e) => {
     const fullName = e.target.value.trim();
    const [firstName, ...lastNameParts] = fullName.split(' ');
    setfirstNameCustomerFilter(firstName || ''); 
    setlastNameCustomerFilter(lastNameParts.join(' ') || ''); 
  }}/>
       <input  className="filter-input"
            type="text"
            placeholder="תז לקוח"
            value={idCustomerFilter}
            onChange={(e) => setIdCustomerFilter(e.target.value)}/>
   <select id="worker-select" value={selectedWorkerIdFilter} 
       onChange={(e) => handleWorkerChange(e, 'filter')} className="select-input">
        <option value="">כל העובדים</option>
        {workers.map(worker => (
          <option key={worker.id} value={worker.id}>{worker.name}</option>
        ))}
      </select>
      <select
      id="statusLead-Select"
      value={selectedStatusLeadFilter}
      onChange={(e) => setSelectedStatusLeadFilter(e.target.value)} className="select-input">
     <option value="">בחר סטטוס</option>
    {statusLeadMap.map((status) => (
      <option key={status.id} value={status.id}>
        {status.statusLeadName}
      </option>
       ))}
       </select>
       <select
  id="sourceLeadSelect"
  value={selectedSourceLeadFilter}
  onChange={(e) => setSelectedSourceLeadFilter(e.target.value)} className="select-input">
  <option value="">בחר מקור ליד</option>
  {sourceLeadList.map((item) => (
    <option key={item.id} value={item.id}>
      {item.sourceLead}
    </option>
  ))}
</select>
        </div>
        <div className="newLeadButton">
        <Button
  onClick={handleNewLead}
  text="הוספת ליד חדש"
  type="primary"
  icon="on"
  state="default"
  className="align-left"
/>
    </div>
        </div>
    {showOpenNewLead && (
  <div className="modal-overlay" onClick={() => setShowOpenNewLead(false)}>
    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
      <button className="close-button" onClick={() => setShowOpenNewLead(false)}>✖</button>
      <form className="form-container" 
      onSubmit={(e) => {
        e.preventDefault();
        if (isEditing) {
          saveLeadChanges();
        } else {
          handleSubmit(e);
        }
      }}>
        <div className="title">{isEditing ? "עריכת ליד" : "הזמנת ליד חדש"}</div>

        {/* פרטים אישיים */}
        <section className="form-section">
          <h3 className="section-title">פרטים אישיים</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>סוכנות *</label>
              <select value={editData?.AgentId || ""} onChange={(e) => handleEditLeadChange("AgentId", e.target.value)}>
                {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
  <label>שם פרטי</label>
  <input
    type="text"
    value={editData?.firstNameCustomer || ""}
    onChange={(e) => handleValidatedEditChange("firstNameCustomer", e.target.value, setEditData, setErrors)}
    className={errors.firstNameCustomer ? "input-error" : ""}
  />
  {errors.firstNameCustomer && <div className="error-message">{errors.firstNameCustomer}</div>}
</div>
<div className="form-group">
  <label>שם משפחה</label>
  <input
    type="text"
    value={editData?.lastNameCustomer || ""}
    onChange={(e) => handleValidatedEditChange("lastNameCustomer", e.target.value, setEditData, setErrors)}
    className={errors.lastNameCustomer ? "input-error" : ""}
  />
  {errors.lastNameCustomer && <div className="error-message">{errors.lastNameCustomer}</div>}
</div>

<div className="form-group">
  <label>תעודת זהות</label>
  <input
    type="text"
    value={editData?.IDCustomer || ""}
    onChange={(e) => handleValidatedEditChange("IDCustomer", e.target.value, setEditData, setErrors)}
    className={errors.IDCustomer ? "input-error" : ""}
  />
  {errors.IDCustomer && <div className="error-message">{errors.IDCustomer}</div>}
</div>
<div className="form-group">
  <label>תאריך הנפקת תז</label>
  <input
    type="date"
    value={editData?.idCardIssueDate || ""}
    onChange={(e) => handleEditLeadChange("idCardIssueDate", e.target.value)}
  />
</div>
<div className="form-group">
  <label>מגדר</label>
  <select 
    value={editData?.gender || ""} 
    onChange={(e) => handleEditLeadChange("gender", e.target.value)}
  >
    <option value="">בחר מגדר</option>
    <option value="male">זכר</option>
    <option value="female">נקבה</option>
  </select>
</div>
            <div className="form-group">
              <label>תאריך לידה</label>
              <input type="date" value={editData?.birthday || ""} onChange={(e) => handleEditLeadChange("birthday", e.target.value)} />
            </div>
            <div className="form-group">
              <label>טלפון *</label>
              <input type="tel" value={editData?.phone || ""} onChange={(e) => handleEditLeadChange("phone", e.target.value)} />
            </div>
            <div className="form-group">
              <label>דואר אלקטרוני</label>
              <input type="email" value={editData?.mail || ""} onChange={(e) => handleEditLeadChange("mail", e.target.value)} />
            </div>
            <div className="form-group">
              <label>כתובת</label>
              <input type="text" value={editData?.address || ""} onChange={(e) => handleEditLeadChange("address", e.target.value)} />
            </div>
          </div>
        </section>

        {/* פרטי ליד */}
        <section className="form-section">
          <h3 className="section-title">פרטי ליד</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>תאריך ושעה</label>
              <input type="datetime-local" value={editData?.returnDate?.replace(" ", "T") || ""} onChange={(e) => handleEditLeadChange("returnDate", e.target.value.replace("T", " "))} />
            </div>
            <div className="form-group">
              <label>תאריך פניה אחרונה</label>
              <input type="date" value={editData?.lastContactDate || ""} onChange={(e) => handleEditLeadChange("lastContactDate", e.target.value)} />
            </div>
            <div className="form-group">
              <label>מקור ליד</label>
              <select value={editData?.sourceValue || ""} onChange={(e) => handleEditLeadChange("sourceValue", e.target.value)}>
                <option value="">בחר מקור ליד</option>
                {sourceLeadList.map((item) => (
                  <option key={item.id} value={item.id}>{item.sourceLead}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>סטטוס ליד</label>
              <select value={editData?.selectedStatusLead || ""} onChange={(e) => handleEditLeadChange("selectedStatusLead", e.target.value)}>
                <option value="">בחר סטטוס</option>
                {statusLeadMap.map((status) => (
                  <option key={status.id} value={status.id}>{status.statusLeadName}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>קמפיין</label>
              <input type="text" value={editData?.campaign || ""} onChange={(e) => handleEditLeadChange("campaign", e.target.value)} />
            </div>
            <div className="form-group">
              <label>סכום זמין להשקעה</label>
              <input type="text" value={editData?.availableFunds || ""} onChange={(e) => handleEditLeadChange("availableFunds", e.target.value)} />
            </div>
            <div className="form-group">
              <label>גמל והשתלמות</label>
              <input type="text" value={editData?.retirementFunds || ""} onChange={(e) => handleEditLeadChange("retirementFunds", e.target.value)} />
            </div>
            <div className="form-group">
              <label>אישור הזמנת מסלקה</label>
              <input type="checkbox" checked={editData?.consentForInformationRequest || false} onChange={(e) => handleEditLeadChange("consentForInformationRequest", e.target.checked)} />
            </div>
            <div className="form-group">
              <label>נציג</label>
              <select value={editData?.workerId || ""} onChange={(e) => handleEditLeadChange("workerId", e.target.value)}>
                <option value="">בחר נציג</option>
                {workers.map(worker => (
                  <option key={worker.id} value={worker.id}>{worker.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>הערות</label>
              <textarea value={editData?.notes || ""} onChange={(e) => handleEditLeadChange("notes", e.target.value)} rows={4}></textarea>
            </div>
          </div>
        </section>
            {/* כפתורי פעולה */}
            <div className="form-actions">
         {isEditing ? (
    <>
      <Button
        onClick={saveLeadChanges}
        text="שמור שינויים"
        type="primary"
        icon="on"
        disabled={!editingLeadRow}
      />
    <Button
  onClick={async () => {
    const leadFromDb = leadsData.find(l => l.id === editingLeadRow);
    const lead = leadFromDb ? { ...leadFromDb, ...editData } : null;
    
    if (!lead) return;
    
    if (window.confirm(`להמיר את ${lead.firstNameCustomer} ${lead.lastNameCustomer} ללקוח?`)) {
      // ✅ 1. שומר את השינויים לליד קודם
      await saveLeadChanges();
      // ✅ 2. ואז ממיר ללקוח עם הנתונים המעודכנים
      await handleConvertToCustomer(lead as LeadsType);
      setShowOpenNewLead(false);
    }
  }}
  text="המר ללקוח"
  type="primary"
  icon="off"
  state="default"
/>
    </>
  ) : (
   <Button
  onClick={(e) => handleSubmit(e)}
  text="הזן"
  type="primary"
  icon="on"
  disabled={!canSubmit || submitDisabled}
  state={!canSubmit ? "disabled" : "default"}
/>

            )}
              <Button
                onClick={() => setShowOpenNewLead(false)}
                text="בטל"
                type="secondary"
                icon="off"
                state="default"
              />
            </div>
          </form>
        </div>
      </div>
    )}       
<DocumentsModal
  open={documentsModalOpen}
  title={documentsLeadName}
  documents={leadDocuments}
  loading={documentsLoading}
  onClose={() => setDocumentsModalOpen(false)}
  onRename={handleRenameLeadDocument}
  onUpload={handleUploadLeadDocument}
  onDelete={handleDeleteLeadDocument}
/>
      <div className="table-container flex" >
    <table className="leads-table">
              <thead>
              <tr>
    <th onClick={() => handleSort("agentName")}>סוכן {sortColumn === "agentName" ? (sortOrder === "asc" ? "▲" : "▼") : ""}</th>
    <th onClick={() => handleSort("firstNameCustomer")}>שם {sortColumn === "firstNameCustomer" ? (sortOrder === "asc" ? "▲" : "▼") : ""}</th>
    <th onClick={() => handleSort("returnDate")}>תאריך חזרה {sortColumn === "returnDate" ? (sortOrder === "asc" ? "▲" : "▼") : ""}</th>
    <th onClick={() => handleSort("phone")}>טלפון {sortColumn === "phone" ? (sortOrder === "asc" ? "▲" : "▼") : ""}</th>
    <th onClick={() => handleSort("selectedStatusLead")}>סטטוס ליד {sortColumn === "selectedStatusLead" ? (sortOrder === "asc" ? "▲" : "▼") : ""}</th>
    <th onClick={() => handleSort("workerId")}>שם נציג {sortColumn === "workerId" ? (sortOrder === "asc" ? "▲" : "▼") : ""}</th>
    <th onClick={() => handleSort("sourceValue")}>מקור ליד {sortColumn === "sourceValue" ? (sortOrder === "asc" ? "▲" : "▼") : ""}</th>
    <th onClick={() => handleSort("campaign")}>שם קמפיין {sortColumn === "campaign" ? (sortOrder === "asc" ? "▲" : "▼") : ""}</th>
    <th onClick={() => handleSort("lastContactDate")}>תאריך פניה אחרונה {sortColumn === "lastContactDate" ? (sortOrder === "asc" ? "▲" : "▼") : ""}</th>
    <th onClick={() => handleSort("createDate")}>תאריך יצירה {sortColumn === "createDate" ? (sortOrder === "asc" ? "▲" : "▼") : ""}</th>
    <th>🔧</th>
  </tr>
              </thead>
              <tbody>
                {sortedData.map((item) => (
                <tr
  key={item.id}
  onClick={(e) => {
    const target = e.target as HTMLElement;
    if (target.closest('select') || target.closest('input') || target.closest('button')) return;
    if (!canAccessCrm) return;
    router.push(`/NewLeads/${item.id}`);
  }}
  style={{ cursor: 'pointer' }}
>
                    <td>{item.agentName}</td>
                    <td>{`${item.firstNameCustomer || ''} ${item.lastNameCustomer || ''}`.trim()}</td>
                    
                    {/* עריכה ישירה של תאריך חזרה */}
                    <td>
                      {editingRowIdTime === item.id ? (
                        <input
                          type="datetime-local"
                          value={item.returnDate ? item.returnDate.replace(" ", "T") : ""}
                          onChange={(e) => handleReturnDateChange(item.id, e.target.value.replace("T", " "))}
                          onBlur={() => setEditingRowIdTime(null)}
                        />
                      ) : (
                        <span onClick={() => setEditingRowIdTime(item.id)}>
                          {formatIsraeliDate(item.returnDate)}
                        </span>
                      )}
                    </td>
                    
                    <td>{formatPhoneNumber(item.phone)}</td>
                    
                    {/* עריכה ישירה של סטטוס ליד */}
                    <td>
                      <select value={item.selectedStatusLead} onChange={(e) => handleStatusChange(item.id, e.target.value)}>
                        <option value="">בחר סטטוס</option>
                        {statusLeadMap.map((status) => (
                          <option key={status.id} value={status.id}>{status.statusLeadName}</option>
                        ))}
                      </select>
                    </td>
                    
                    {/* עריכה ישירה של שם נציג */}
                    <td>
                      <select value={item.workerId || ''} onChange={(e) => handleWorkerChangeInRow(item.id, e.target.value)}>
                        <option value="">בחר נציג</option>
                        {workers.map((worker) => (
                          <option key={worker.id} value={worker.id}>{worker.name}</option>
                        ))}
                      </select>
                    </td>
                    
                    <td>{sourceLeadMap[item.sourceValue] || 'מקור לא קיים'}</td>
                    <td>{item.campaign}</td>
                    <td>{item.lastContactDate ? formatIsraeliDateOnly(item.lastContactDate) : ""}</td>
                    <td>{item.createDate ? item.createDate.toDate().toLocaleString() : 'N/A'}</td>
                    
                    {/* תפריט בורגר לעריכה ומחיקה */}
                    <td onClick={e => e.stopPropagation()}>
                      <MenuWrapper
                        rowId={item.id}
                        openMenuRow={openMenuRow}
                        setOpenMenuRow={setOpenMenuRow}
                        menuItems={menuItems(
                          item.id,
                          () => setOpenMenuRow(null)
                        )}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
      </div>
      </div>
  );
}
export default NewLeads