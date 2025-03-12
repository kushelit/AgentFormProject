import { ChangeEventHandler, FormEventHandler, SetStateAction, useEffect, useMemo, useState } from "react";
import { collection, query, setDoc, where, getDocs, getDoc, addDoc, deleteDoc, doc, updateDoc, DocumentSnapshot, DocumentData, serverTimestamp, Timestamp, Query } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase"; // Ensure this path matches your project structure
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
import { useSortableTable } from "@/hooks/useSortableTable";


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
const { sortedData, sortColumn, sortOrder, handleSort } = useSortableTable(filteredData);



  interface Suggestion {
    id: string;
    source: string; 
  }


  // type LeadsType = {
  //   id: string;
  //   firstNameCustomer: string;
  //   lastNameCustomer: string;
  //   IDCustomer: string;
  //   returnDate: string;
  //   lastContactDate: string;
  //   phone: string;
  //   mail: string;
  //   address: string;
  //   sourceValue: string;
  //   selectedStatusLead: string;
  //   workerId: string;
  //   notes: string;
  //   workerName: string;
  //   birthday: string;
  //   availableFunds: string;
  //   retirementFunds: string;
  //   consentForInformationRequest: boolean;
  //   createDate: Timestamp;
  //   campaign: string;
  //   AgentId: string;
  //   agentName?: string;
  // };



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
    console.log("fetchLeadsForAgent", UserAgentId);
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
  
      console.log("fetchLeadsForAgentData", data);
      return data; // מחזירים את הנתונים במקום setLeadsData
    } catch (error) {
      console.error("Error fetching leads:", error);
      return []; // במקרה של שגיאה נחזיר מערך ריק
    }
  };
  

  const [openMenuRow, setOpenMenuRow] = useState(null);
  
  const {
    data: leadsData,
    editingRow: editingLeadRow,
    editData: editLeadData,
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
      console.log("🔴 סוגר מודל לידים!");
      setShowOpenNewLead(false);
    }, 
  });
  
  useEffect(() => {
    console.log("🧐 תוכן editLeadData בתוך המודל:", editLeadData);
  }, [editLeadData]);
  




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
    console.log("Filtered Data:", data);
  }, [
    leadsData,
    idCustomerFilter,
    firstNameCustomerFilter,
    lastNameCustomerFilter,
    selectedWorkerIdFilter,
    selectedStatusLeadFilter,
    selectedSourceLeadFilter
  ]);
  
  const handleFirstNameChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const value = event.target.value;
    const hebrewRegex = /^[\u0590-\u05FF ]+$/;
    if (value === '' || hebrewRegex.test(value.trim())) {
      setfirstNameCustomer(value);
    }
  };

  const handleLastNameChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const value = event.target.value;
    const hebrewRegex = /^[\u0590-\u05FF ]+$/;
    if (value === '' || hebrewRegex.test(value.trim())) {
      setlastNameCustomer(value);
    }
  };

  const handleIDChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value;
    const onlyNums = value.replace(/[^0-9]/g, '').slice(0, 9);
    setIDCustomer(onlyNums);
  };

  // const handleRowClick = (item: any) => {
  //  // setSalesData([]);
  //   setSelectedRow(item); // Store the selected row's data
  //   setfirstNameCustomer(item.firstNameCustomer || '');
  //   setlastNameCustomer(item.lastNameCustomer || '');
  //   setIDCustomer(item.IDCustomer || '');
  //   setIsEditing(true);
  //   setNotes(item.notes || '');
  //   setReturnDate(item.returnDate || '');
  //   setLastContactDate(item.lastContactDate || '');
  //   setPhone(item.phone || '');
  //   setMail(item.mail || '');
  //   setAddress(item.address || '');
  //   setSourceValue(item.sourceValue || '');
  //   setSelectedStatusLead(item.selectedStatusLead || '');
  //   setAvailableFunds(item.availableFunds || '');
  //   setRetirementFunds(item.retirementFunds || '');
  //   setConsentForInformationRequest(item.consentForInformationRequest || false);
  //   setBirthday(item.birthday || '');
  //   setCampaign(item.campaign || '');
  //   setSelectedAgentIdInRow(item.AgentId || '');
  //   const workerName = workerNameMap[item.workerId];
  //   if (workerName) {
  //       setSelectedWorkerId(item.workerId);
  //       setSelectedWorkerName(workerName);
  //   } else {
  //       // Handle case where the worker is not found - maybe clear or set default values
  //       setSelectedWorkerId('');
  //       setSelectedWorkerName('Unknown Worker');
  //   }
    
  // };


  // // delete function ***
  // const handleDelete = async () => {
  //   if (selectedRow && selectedRow.id) {
  //     await deleteDoc(doc(db, 'leads', selectedRow.id));
  //     setSelectedRow(null); // Reset selection
  //     resetForm();
  //     setIsEditing(false);
  //     if (selectedAgentId) {
  //       fetchLeadsForAgent(selectedAgentId);
  //     }
  //     setFilteredData([]);

  //   } else {
  //     console.log("No selected row or row ID is undefined");
  //   }
  // };
  // const handleEdit = async () => {
  //   if (selectedRow && selectedRow.id) {
  //     try {
  //       const docRef = doc(db, 'leads', selectedRow.id);
  //       await updateDoc(docRef, {
  //         firstNameCustomer,
  //         lastNameCustomer,
  //         IDCustomer,
  //         notes: notes || '',
  //         returnDate,
  //         lastContactDate,
  //         phone,
  //         mail,
  //         address,
  //         sourceValue,
  //         lastUpdateDate: serverTimestamp(),
  //         selectedStatusLead,
  //         availableFunds,
  //         retirementFunds,
  //         consentForInformationRequest,
  //         birthday,
  //         workerId: selectedWorkerId,// id new
  //         campaign,
  //         AgentId: selectedAgentIdInRow || '', // עדכון AgentId
  //       });
  //       console.log("Document successfully updated");
  //       setSelectedRow(null);
  //       resetForm();
  //       setFilteredData([]);
  //       if (selectedAgentId) {
  //         fetchLeadsForAgent(selectedAgentId);
  //       }
  //     } catch (error) {
  //       console.error("Error updating document:", error);
  //     }
  //   } else {
  //     console.log("No row selected or missing document ID");
  //   }
  // };

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
          AgentId: selectedAgentId,
          firstNameCustomer,
          lastNameCustomer,
          IDCustomer,
          phone,
          mail,
          address,
          notes,
          returnDate,
          lastContactDate,       
          sourceLeadId: sourceValue,
          lastUpdateDate: serverTimestamp(), 
          selectedStatusLead,
          workerId: selectedWorkerId,
          birthday,
          availableFunds,
          retirementFunds,
          consentForInformationRequest,
          createDate: serverTimestamp(),
          campaign,
        });
        alert('ליד חדש התווסף בהצלחה');
      resetForm();
      setIsEditing(false);
      if (selectedAgentId) {
        fetchLeadsForAgent(selectedAgentId);
      }
    } catch (error) {
      console.error('Error adding document:', error);  // Log any errors during the process
    }
  };


  const canSubmit = useMemo(() => (
  selectedAgentId.trim() !== '' &&
  phone.trim() !== '' 
  ), [selectedAgentId, phone
  ]);


  // useEffect(() => {
  //   const fetchSourceLeadForAgent = async () => {
  //     if (!selectedAgentId) return; 
  //     const q = query(
  //       collection(db, 'sourceLead'),
  //       where('AgentId', '==', selectedAgentId),
  //       where('statusLead', '==', true)
  //     );
  //     try {
  //       const querySnapshot = await getDocs(q);
  //       const data = querySnapshot.docs.map(doc => ({
  //         id: doc.id,
  //         ...doc.data()
  //       }));
  //       setSourceLeadList(data); 
  //     } catch (error) {
  //       console.error('Error fetching source leads:', error);
  //     }
  //   };
  //   fetchSourceLeadForAgent();
  // }, [selectedAgentId]); 

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
      console.error('Error updating statusLead:', error);
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
      console.error('Error updating worker:', error);
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
      console.error("Error updating returnDate:", error);
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
      console.log("Fetched all source leads:", sourceMap);
    } catch (error) {
      console.error("Error fetching source leads:", error);
    }
  };

  useEffect(() => {
    fetchAllSourceLeads();
  }, []);

  const [showOpenNewLead, setShowOpenNewLead] = useState(false);

  const handleEditRowModal = (id: string) => {
    console.log("🖊️ מנסה לערוך שורה:", id);
  
    setIsEditing(true); // מצב עריכה
    handleEditLeadRow(id); // ⬅️ זה אמור לעדכן את `editLeadData`
  
    // מחכים מעט כדי לוודא שהנתונים נטענו
    setTimeout(() => {
      console.log("🧐 נתוני עריכה לאחר handleEditLeadRow:", editLeadData);
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
      console.log("📢 מודל בעריכה נטען עם הנתונים:", editLeadData);
    }
  }, [editLeadData, showOpenNewLead]);

  

  const menuItems = (rowId: string, closeMenu: () => void) => [
    {
      label: "ערוך",
      onClick: () => {
        handleEditRowModal(rowId);
        closeMenu();
      },
      Icon: Edit,
    },
    {
      label: "מחק",
      onClick: () => {
        handleDeleteLeadRow(rowId);
        closeMenu();
      },
      Icon: Delete,
    },
  ];

  useEffect(() => {
    if (editingLeadRow) {
      setShowOpenNewLead(true);
    }
  }, [editingLeadRow]);
  
 

  // const [sortColumn, setSortColumn] = useState<string | null>(null);
  // const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  

  // const handleSort = (column: keyof LeadsType) => {
  //   const newSortOrder = sortColumn === column && sortOrder === "asc" ? "desc" : "asc";
  //   setSortColumn(column);
  //   setSortOrder(newSortOrder);
  
  //   const sorted = [...filteredData].sort((a, b) => {
  //     let valueA: string | boolean | Timestamp | undefined = a[column];
  //     let valueB: string | boolean | Timestamp | undefined = b[column];
  
  //     // ✅ אם הערכים `undefined` או `null`, נשתמש במחרוזת ריקה למניעת שגיאות
  //     if (valueA == null) valueA = "";
  //     if (valueB == null) valueB = "";
  
  //     // ✅ אם הערכים הם `boolean`, נמיר אותם למחרוזת לצורך השוואה
  //     if (typeof valueA === "boolean") valueA = valueA ? "1" : "0";
  //     if (typeof valueB === "boolean") valueB = valueB ? "1" : "0";
  
  //     // ✅ אם הערכים הם Firebase `Timestamp`, נמיר אותם ל- `Date` רק כאשר נדרש
  //     if (valueA instanceof Timestamp) valueA = valueA.toDate().toISOString();
  //     if (valueB instanceof Timestamp) valueB = valueB.toDate().toISOString();
  
  //     // ✅ אם הערכים הם מחרוזות של תאריכים, נמיר למספר כדי שניתן יהיה למיין לפי זמן
  //     if (typeof valueA === "string" && column.toLowerCase().includes("date")) {
  //       const parsedA = Date.parse(valueA);
  //       if (!isNaN(parsedA)) valueA = String(parsedA);
  //     }
  //     if (typeof valueB === "string" && column.toLowerCase().includes("date")) {
  //       const parsedB = Date.parse(valueB);
  //       if (!isNaN(parsedB)) valueB = String(parsedB);
  //     }
  
  //     // ✅ מיון טקסטים
  //     return newSortOrder === "asc"
  //       ? String(valueA).localeCompare(String(valueB), "he")
  //       : String(valueB).localeCompare(String(valueA), "he");
  //   });
  
  //   console.log("✅ נתונים אחרי מיון:", sorted);
  //   setFilteredData(sorted);
  // };
  


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
  text="הזמנת ליד חדש"
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
      <form className="form-container" onSubmit={isEditing ? saveLeadChanges : handleSubmit}>
        <div className="title">{isEditing ? "עריכת ליד" : "הזמנת ליד חדש"}</div>

        {/* פרטים אישיים */}
        <section className="form-section">
          <h3 className="section-title">פרטים אישיים</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>סוכנות *</label>
              <select value={editLeadData?.AgentId || ""} onChange={(e) => handleEditLeadChange("AgentId", e.target.value)}>
                {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
                {agents.map(agent => (
                  <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>שם פרטי *</label>
              <input type="text" value={editLeadData?.firstNameCustomer || ""} onChange={(e) => handleEditLeadChange("firstNameCustomer", e.target.value)} />
            </div>
            <div className="form-group">
              <label>שם משפחה *</label>
              <input type="text" value={editLeadData?.lastNameCustomer || ""} onChange={(e) => handleEditLeadChange("lastNameCustomer", e.target.value)} />
            </div>
            <div className="form-group">
              <label>תעודת זהות *</label>
              <input type="text" value={editLeadData?.IDCustomer || ""} onChange={(e) => handleEditLeadChange("IDCustomer", e.target.value)} />
            </div>
            <div className="form-group">
              <label>תאריך לידה</label>
              <input type="date" value={editLeadData?.birthday || ""} onChange={(e) => handleEditLeadChange("birthday", e.target.value)} />
            </div>
            <div className="form-group">
              <label>טלפון *</label>
              <input type="tel" value={editLeadData?.phone || ""} onChange={(e) => handleEditLeadChange("phone", e.target.value)} />
            </div>
            <div className="form-group">
              <label>דואר אלקטרוני</label>
              <input type="email" value={editLeadData?.mail || ""} onChange={(e) => handleEditLeadChange("mail", e.target.value)} />
            </div>
            <div className="form-group">
              <label>כתובת</label>
              <input type="text" value={editLeadData?.address || ""} onChange={(e) => handleEditLeadChange("address", e.target.value)} />
            </div>
          </div>
        </section>

        {/* פרטי ליד */}
        <section className="form-section">
          <h3 className="section-title">פרטי ליד</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>תאריך ושעה</label>
              <input type="datetime-local" value={editLeadData?.returnDate?.replace(" ", "T") || ""} onChange={(e) => handleEditLeadChange("returnDate", e.target.value.replace("T", " "))} />
            </div>
            <div className="form-group">
              <label>תאריך פניה אחרונה</label>
              <input type="date" value={editLeadData?.lastContactDate || ""} onChange={(e) => handleEditLeadChange("lastContactDate", e.target.value)} />
            </div>
            <div className="form-group">
              <label>מקור ליד</label>
              <select value={editLeadData?.sourceValue || ""} onChange={(e) => handleEditLeadChange("sourceValue", e.target.value)}>
                <option value="">בחר מקור ליד</option>
                {sourceLeadList.map((item) => (
                  <option key={item.id} value={item.id}>{item.sourceLead}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>סטטוס ליד</label>
              <select value={editLeadData?.selectedStatusLead || ""} onChange={(e) => handleEditLeadChange("selectedStatusLead", e.target.value)}>
                <option value="">בחר סטטוס</option>
                {statusLeadMap.map((status) => (
                  <option key={status.id} value={status.id}>{status.statusLeadName}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>קמפיין</label>
              <input type="text" value={editLeadData?.campaign || ""} onChange={(e) => handleEditLeadChange("campaign", e.target.value)} />
            </div>
            <div className="form-group">
              <label>סכום זמין להשקעה</label>
              <input type="text" value={editLeadData?.availableFunds || ""} onChange={(e) => handleEditLeadChange("availableFunds", e.target.value)} />
            </div>
            <div className="form-group">
              <label>גמל והשתלמות</label>
              <input type="text" value={editLeadData?.retirementFunds || ""} onChange={(e) => handleEditLeadChange("retirementFunds", e.target.value)} />
            </div>
            <div className="form-group">
              <label>אישור הזמנת מסלקה</label>
              <input type="checkbox" checked={editLeadData?.consentForInformationRequest || false} onChange={(e) => handleEditLeadChange("consentForInformationRequest", e.target.checked)} />
            </div>
            <div className="form-group">
              <label>נציג</label>
              <select value={editLeadData?.workerId || ""} onChange={(e) => handleEditLeadChange("workerId", e.target.value)}>
                <option value="">בחר נציג</option>
                {workers.map(worker => (
                  <option key={worker.id} value={worker.id}>{worker.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>הערות</label>
              <textarea value={editLeadData?.notes || ""} onChange={(e) => handleEditLeadChange("notes", e.target.value)} rows={4}></textarea>
            </div>
          </div>
        </section>
            {/* כפתורי פעולה */}
            <div className="form-actions">
            {isEditing ? (
    <Button onClick={saveLeadChanges} text="שמור שינויים" type="primary" icon="on" disabled={!editingLeadRow} />
  ) : (
              <Button
                onClick={handleSubmit}
                text="הזן"
                type="primary"
                icon="on"
                disabled={!canSubmit || isEditing}
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
                {filteredData.map((item) => (
                  <tr key={item.id}>
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
                    <td>
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
      </div>
      </div>
  );
}
export default NewLeads