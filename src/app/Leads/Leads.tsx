import { ChangeEventHandler, FormEventHandler, SetStateAction, useEffect, useMemo, useState } from "react";
import { collection, query, setDoc, where, getDocs, getDoc, addDoc, deleteDoc, doc, updateDoc, DocumentSnapshot, DocumentData, serverTimestamp, Timestamp, Query } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase"; // Ensure this path matches your project structure
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchMD from "@/hooks/useMD";
import './Leads.css';
import useFetchAgentData from "@/hooks/useFetchAgentData";
import React from 'react';



const Leads = () => {

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
  const [leadsData, setLeadsData] = useState<LeadsType[]>([]);
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


  interface Suggestion {
    id: string;
    source: string; 
  }


  type LeadsType = {
    id: string;
    firstNameCustomer: string;
    lastNameCustomer: string;
    IDCustomer: string;
    returnDate: string;
    lastContactDate: string;
    phone: string;
    mail: string;
    address: string;
    sourceValue: string;
    selectedStatusLead: string;
    workerId: string;
    notes: string;
    workerName: string;
    birthday: string;
    availableFunds: string;
    retirementFunds: string;
    consentForInformationRequest: boolean;
    createDate: Timestamp;
    campaign: string;
    AgentId: string;
    agentName?: string;
  };



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
  
      setLeadsData(data);
      console.log("fetchLeadsForAgentData", data);
    } catch (error) {
      console.error("Error fetching leads:", error);
    }
  };
   
  
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

  const handleRowClick = (item: any) => {
   // setSalesData([]);
    setSelectedRow(item); // Store the selected row's data
    setfirstNameCustomer(item.firstNameCustomer || '');
    setlastNameCustomer(item.lastNameCustomer || '');
    setIDCustomer(item.IDCustomer || '');
    setIsEditing(true);
    setNotes(item.notes || '');
    setReturnDate(item.returnDate || '');
    setLastContactDate(item.lastContactDate || '');
    setPhone(item.phone || '');
    setMail(item.mail || '');
    setAddress(item.address || '');
    setSourceValue(item.sourceValue || '');
    setSelectedStatusLead(item.selectedStatusLead || '');
    setAvailableFunds(item.availableFunds || '');
    setRetirementFunds(item.retirementFunds || '');
    setConsentForInformationRequest(item.consentForInformationRequest || false);
    setBirthday(item.birthday || '');
    setCampaign(item.campaign || '');
    setSelectedAgentIdInRow(item.AgentId || '');
    const workerName = workerNameMap[item.workerId];
    if (workerName) {
        setSelectedWorkerId(item.workerId);
        setSelectedWorkerName(workerName);
    } else {
        // Handle case where the worker is not found - maybe clear or set default values
        setSelectedWorkerId('');
        setSelectedWorkerName('Unknown Worker');
    }
    
  };


  // delete function ***
  const handleDelete = async () => {
    if (selectedRow && selectedRow.id) {
      await deleteDoc(doc(db, 'leads', selectedRow.id));
      setSelectedRow(null); // Reset selection
      resetForm();
      setIsEditing(false);
      if (selectedAgentId) {
        fetchLeadsForAgent(selectedAgentId);
      }
      setFilteredData([]);

    } else {
      console.log("No selected row or row ID is undefined");
    }
  };
  const handleEdit = async () => {
    if (selectedRow && selectedRow.id) {
      try {
        const docRef = doc(db, 'leads', selectedRow.id);
        await updateDoc(docRef, {
          firstNameCustomer,
          lastNameCustomer,
          IDCustomer,
          notes: notes || '',
          returnDate,
          lastContactDate,
          phone,
          mail,
          address,
          sourceValue,
          lastUpdateDate: serverTimestamp(),
          selectedStatusLead,
          availableFunds,
          retirementFunds,
          consentForInformationRequest,
          birthday,
          workerId: selectedWorkerId,// id new
          campaign,
          AgentId: selectedAgentIdInRow || '', // עדכון AgentId
        });
        console.log("Document successfully updated");
        setSelectedRow(null);
        resetForm();
        setFilteredData([]);
        if (selectedAgentId) {
          fetchLeadsForAgent(selectedAgentId);
        }
      } catch (error) {
        console.error("Error updating document:", error);
      }
    } else {
      console.log("No row selected or missing document ID");
    }
  };

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
        lastUpdateDate: serverTimestamp(), // Optional: Update timestamp
      });
  
      // Update the local state or refetch data to reflect changes
      setLeadsData((prev) =>
        prev.map((lead) =>
          lead.id === rowId
            ? { ...lead, selectedStatusLead: newValue }
            : lead
        )
      );
  
   //   alert('סטטוס עודכן בהצלחה');
      setEditingRowId(null); // Exit editing mode
    } catch (error) {
      console.error('Error updating statusLead:', error);
    }
  };
  
  const handleWorkerChangeInRow = async (rowId: string, newWorkerId: string) => {
    try {
      const docRef = doc(db, 'leads', rowId);
      await updateDoc(docRef, {
        workerId: newWorkerId,
        lastUpdateDate: serverTimestamp(), // Optional: Update the timestamp
      });
  
      // Update the local state or refetch the data to reflect changes
      setLeadsData((prev) =>
        prev.map((lead) =>
          lead.id === rowId
            ? { ...lead, workerId: newWorkerId }
            : lead
        )
      );
  
  //    alert('נציג עודכן בהצלחה');
    } catch (error) {
      console.error('Error updating worker:', error);
    }
  };
  

  const handleSourceValueChange = async (rowId: string, newSourceValue: string) => {
    try {
      const docRef = doc(db, 'leads', rowId);
      await updateDoc(docRef, {
        sourceValue: newSourceValue,
        lastUpdateDate: serverTimestamp(), // Optional: Update the timestamp
      });
  
      // Update the local state or refetch the data to reflect changes
      setLeadsData((prev) =>
        prev.map((lead) =>
          lead.id === rowId
            ? { ...lead, sourceValue: newSourceValue }
            : lead
        )
      );
  
  //    alert('מקור עודכן בהצלחה');
    } catch (error) {
      console.error('Error updating sourceValue:', error);
    }
  };
  
  const handleReturnDateChange = async (id: string, newReturnDate: string) => {
    try {
      // Update the local state
      setLeadsData((prevLeads) =>
        prevLeads.map((lead) =>
          lead.id === id ? { ...lead, returnDate: newReturnDate } : lead
        )
      );
  
      // Update the database
      const docRef = doc(db, "leads", id);
      await updateDoc(docRef, {
        returnDate: newReturnDate,
        lastUpdateDate: serverTimestamp(), // Optionally update the last modified timestamp
      });
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
  
  return (
    <div className="content-container">
      <div className="form-container">
        <form onSubmit={handleSubmit}>
          <table>
            <tbody>
              <tr>
                <td>
                  <label htmlFor="editAgentSelect">סוכנות</label>
                </td>
                <td>
                  <select onChange={(e) => setSelectedAgentIdInRow(e.target.value)} value={selectedAgentIdInRow || ''}>
                    {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
                    {agents.map(agent => (
                      <option key={agent.id} value={agent.id}>{agent.name}</option>
                    ))}
                  </select>
                </td>
              </tr>
              <tr>
                <td>
                  <label>שם פרטי</label>
                </td>
                <td>
                  <input type="text" value={firstNameCustomer} onChange={handleFirstNameChange} title="הזן אותיות בלבד"/>
                </td>
              </tr>
              <tr>
                <td>
                  <label>שם משפחה</label>
                </td>
                <td>
                <input type="text" value={lastNameCustomer} onChange={handleLastNameChange} title="הזן אותיות בלבד"/>
                </td>
              </tr>
              <tr>
                <td>
                  <label htmlFor="IDCustomer">תז</label>
                </td>
                <td>
                  <input type="text" inputMode="numeric" maxLength={9} value={IDCustomer} onChange={handleIDChange}/>
                </td>
              </tr>
              <tr>
                <td><label htmlFor="birthday">תאריך לידה</label></td>
                <td><input type="date" id="birthday" name="birthday" value={birthday} onChange={handleBirthdayChange} /></td>
              </tr>
              <tr>
             <td>
    <label htmlFor="phone">
      טלפון<span style={{ color: 'red', marginLeft: '5px' }}>*</span>
    </label>
  </td>
  <td>
    <input
      type="tel"
      id="phone"
      name="phone"
      value={phone}
      onChange={handlePhoneChange}/>
  </td>
</tr>
     <tr>
          <td><label htmlFor="mail">דואר אלקטרוני</label></td>
                <td><input type="email" id="mail" name="mail" value={mail} onChange={handleMailChange}/></td>
              </tr>
              <tr>
                <td><label htmlFor="address">כתובת</label></td>
                <td><input type="text" id="address" name="address" value={address} onChange={handleAddressChange}/></td>
              </tr>
              <tr>
  <td><label htmlFor="returnDate">תאריך ושעה</label></td>
  <td>
    <input
      type="datetime-local"
      id="returnDate"
      name="returnDate"
      value={returnDate.replace(" ", "T")} // Convert "2024-12-04 14:30" to "2024-12-04T14:30" for input compatibility
      onChange={handleReturnDate}/>
  </td>
</tr>
    <tr>
         <td><label htmlFor="lastContactDate">תאריך פניה אחרונה</label></td>
           <td><input type="date" id="lastContactDate" name="lastContactDate" value={lastContactDate} onChange={handleLastContactDate}/></td>
              </tr>            
              <tr>
                <td>
                  <label htmlFor="sourceLeadSelect">מקור ליד</label>
                </td>
                <td>
                <select id="sourceLeadSelect" value={sourceValue || ''} onChange={handleSelectChange}>
              <option value="">בחר מקור ליד</option>
             {sourceLeadList.map((item) => (
            <option key={item.id} value={item.id}>{item.sourceLead}</option>
             ))}
            </select>
                </td>
              </tr>
              <tr>
                <td>
                  <label htmlFor="campaign">קמפיין</label>
                </td>
                <td>
                <input type="text" id="campaign" name="campaign"  value={campaign} onChange={(e) => setCampaign(e.target.value)}/>
                </td>
              </tr>
              <tr>
                <td><label htmlFor="statusLeadSelect">סטטוס ליד</label></td>
                <td>
                  <select
                    id="statusLeadSelect"
                    value={selectedStatusLead}
                    onChange={(e) => setSelectedStatusLead(e.target.value)}>
                    <option value="">בחר סטטוס</option>
                    {statusLeadMap.map((status) => (
                      <option key={status.id} value={status.id}>
                        {status.statusLeadName}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
              <tr>
                <td>
                  <label htmlFor="availableFunds">סכום זמין להשקעה</label>
                </td>
                <td>
                <input type="text" id="availableFunds" name="availableFunds"  value={availableFunds} onChange={(e) => setAvailableFunds(e.target.value)}/>
                </td>
              </tr>
              <tr>
                <td>
                  <label htmlFor="retirementFunds">גמל והשתלמות</label>
                </td>
                <td>
                <input type="text" id="retirementFunds" name="retirementFunds"  value={retirementFunds} onChange={(e) => setRetirementFunds(e.target.value)}/>
                </td>
              </tr>
              <tr>
                    <td>
                        <label htmlFor="consentForInformationRequest" className="checkbox-label">אישור הזמנת מסלקה</label>
                    </td>
                    <td>
                        <input type="checkbox" id="consentForInformationRequest" name="consentForInformationRequest" checked={consentForInformationRequest} onChange={(e) => setConsentForInformationRequest(e.target.checked)} />
                    </td>
                </tr>
              <tr>
                 <td>
                   <label htmlFor="workerSelect">נציג</label>
                    </td>
                    <td>
                        <select id="workerSelect" value={selectedWorkerId} 
                      onChange={(e) => handleWorkerChange(e, 'insert')}>
                            <option value="">בחר נציג</option>
                            {workers.map(worker => (
                                <option key={worker.id} value={worker.id}>{worker.name}</option>
                            ))}
                        </select>
                    </td>
                </tr>
                <tr>
                <td>
                  <label htmlFor="notes">הערות</label>
                </td>
                <td>
                  <textarea
                   id="notes" name="notes" 
                  value={notes} onChange={(e) => setNotes(e.target.value)} 
                  style={{
                    height: '100px', // Adjust height
                    resize: 'vertical', // Allow resizing vertically
                   padding: '10px', // Internal padding for better spacing
                  fontSize: '12px', // Increase font size for readability
                   overflowY: 'auto', // Enable vertical scrolling for long text
                   textAlign: 'start', // Ensure text starts at the top-left
                  }}/>
                </td>
              </tr>
            </tbody>
          </table>
          <div className="form-group button-group" style={{ display: 'flex' }}>
            <button type="submit" disabled={!canSubmit || isEditing}> הזן</button>
            <button type="button" disabled={selectedRow === null} onClick={handleDelete} >מחק</button>
            <button type="button" disabled={selectedRow === null} onClick={handleEdit}>עדכן</button>
            <button type="button" onClick={resetForm}>נקה</button>
          </div>
        </form>
      </div>
      <div className="data-container">
        <div className="select-container">
        <select onChange={handleAgentChange} value={selectedAgentId}>
                    {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
                    {detail?.role === 'admin' && <option value="all">כל הסוכנות</option>}
                    {agents.map(agent => (
                      <option key={agent.id} value={agent.id}>{agent.name}</option>
                    ))}
          </select>
        <input
        type="text"
        placeholder="שם"
       value={`${firstNameCustomerFilter} ${lastNameCustomerFilter}`.trim()}
       onChange={(e) => {
     const fullName = e.target.value.trim();
    const [firstName, ...lastNameParts] = fullName.split(' ');
    setfirstNameCustomerFilter(firstName || ''); 
    setlastNameCustomerFilter(lastNameParts.join(' ') || ''); 
  }}/>
       <input
            type="text"
            placeholder="תז לקוח"
            value={idCustomerFilter}
            onChange={(e) => setIdCustomerFilter(e.target.value)}/>
   <select id="worker-select" value={selectedWorkerIdFilter} 
       onChange={(e) => handleWorkerChange(e, 'filter')}>
        <option value="">כל העובדים</option>
        {workers.map(worker => (
          <option key={worker.id} value={worker.id}>{worker.name}</option>
        ))}
      </select>
      <select
      id="statusLead-Select"
      value={selectedStatusLeadFilter}
      onChange={(e) => setSelectedStatusLeadFilter(e.target.value)}>
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
  onChange={(e) => setSelectedSourceLeadFilter(e.target.value)}>
  <option value="">בחר מקור ליד</option>
  {sourceLeadList.map((item) => (
    <option key={item.id} value={item.id}>
      {item.sourceLead}
    </option>
  ))}
</select>
        </div>
        <div className="table-container flex" style={{ overflowX: 'auto', maxHeight: '800px'
          ,minWidth: '900px',fontSize: '16px'}}>
          <table className="flex-grow"
          style={{
            minWidth: '100%',
            fontSize: '16px' 
          }}>
            <thead>
              <tr>
                {showSelect && <th>Select</th>}
                <th>סוכן</th>
                <th>שם</th>
                <th>תאריך חזרה</th>
                <th>טלפון</th>
                <th>סטטוס ליד</th>
                <th>שם נציג</th>
                <th>מקור ליד</th>
                <th>שם קמפיין</th>
                <th>תאריך פניה אחרונה</th>
                <th>תאריך יצירה</th>
              </tr>
            </thead>
            <tbody>
            {filteredData
  .sort((a, b) => {
    // 1. Handle rows with "לא מעוניין" first
    const statusA = statusLeadMap.find(status => status.id === a.selectedStatusLead)?.statusLeadName || '';
    const statusB = statusLeadMap.find(status => status.id === b.selectedStatusLead)?.statusLeadName || '';
    if (statusA === 'לא מעוניין' && statusB !== 'לא מעוניין') {
      return 1; // Move "לא מעוניין" to the bottom
    }
    if (statusA !== 'לא מעוניין' && statusB === 'לא מעוניין') {
      return -1; // Keep other rows above "לא מעוניין"
    }
    // 2. Sort remaining rows by `returnDate` in descending order
    const dateA = a.returnDate ? new Date(a.returnDate).getTime() : -Infinity; // Treat missing dates as far past
    const dateB = b.returnDate ? new Date(b.returnDate).getTime() : -Infinity;
    return dateA - dateB; // Sort by ascending date
  })
  .map((item) => {
    const statusLeadName = statusLeadMap.find(status => status.id === item.selectedStatusLead)?.statusLeadName || 'לא נבחר';
      // בדיקות צבעים
      const isNotAssigned = !sourceLeadMap[item.sourceValue]; // לא משויך לסוכן
      const isNotExistAtAll = !seourceAllLeadMap[item.sourceValue]; // לא קיים בכלל
    return (
      <tr
  key={item.id}
  className={`${selectedCustomers.has(item.id) ? "selected-row" : ""} 
              ${hoveredRowId === item.id ? "hovered-row" : ""}`}
  onClick={() => handleRowClick(item)}
  //onMouseEnter={() => setHoveredRowId(item.id)}
  //onMouseLeave={() => setHoveredRowId(null)}
>
<td className="medium-column">{item.agentName}</td>      
<td className="medium-column">{`${item.firstNameCustomer || ''} ${item.lastNameCustomer || ''}`.trim()}</td>
        <td className="medium-column" style={{ fontWeight: 'bold' }}>
  {editingRowIdTime === item.id ? (
    <input
      type="datetime-local"
      value={item.returnDate ? item.returnDate.replace(" ", "T") : ""}
      onChange={(e) =>
        handleReturnDateChange(item.id, e.target.value.replace("T", " "))}
      onBlur={() => setEditingRowIdTime(null)} // Exit edit mode on blur
    />
  ) : (
    <span
      onClick={() => setEditingRowIdTime(item.id)} // Enter edit mode
      style={{
        fontWeight: "bold",
        color:
          item.returnDate && new Date(item.returnDate) < new Date()
            ? "red"
            : "black",
      }}>
      {formatIsraeliDate(item.returnDate)}
    </span>
  )}
</td>
<td className="medium-column" style={{ fontWeight: 'bold' }}>
  {formatPhoneNumber(item.phone)}
</td>
   <td  className="narrow-column"
   >
          <select 
            value={item.selectedStatusLead}
            onChange={(e) => handleStatusChange(item.id, e.target.value)}
            style={{
              appearance: 'none',
              cursor: 'pointer',
              background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='currentColor' class='bi bi-chevron-down' viewBox='0 0 16 16'%3E%3Cpath fill-rule='evenodd' d='M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z'/%3E%3C/svg%3E") no-repeat right center`,
              paddingRight: '20px',
              border: 'none',
              borderRadius: '4px',
            }}>
            <option value="">בחר סטטוס</option>
            {statusLeadMap.map((status) => (
              <option key={status.id} value={status.id}>
                {status.statusLeadName}
              </option>
            ))}
          </select>
        </td>
        <td  className="narrow-column"
        >
          <select
            value={item.workerId || ''}
            onChange={(e) => handleWorkerChangeInRow(item.id, e.target.value)}
            style={{
              appearance: 'none',
              cursor: 'pointer',
              background: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='currentColor' class='bi bi-chevron-down' viewBox='0 0 16 16'%3E%3Cpath fill-rule='evenodd' d='M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z'/%3E%3C/svg%3E") no-repeat right center`,
              paddingRight: '20px',
              border: 'none',
              borderRadius: '4px',
            }}>
            <option value="">בחר נציג</option>
            {workers.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.name}
              </option>
            ))}
          </select>
        </td>
        <td
  className="medium-column"
  style={{
    fontWeight: "bold",
    backgroundColor: 
      sourceLeadMap[item.sourceValue] // משויך לסוכן
        ? "#ffffff" // לבן - מבטל כל רקע קודם
        : seourceAllLeadMap[item.sourceValue] // קיים אבל לא משויך
        ? "#fff3cd" // צהוב
        : "#f8d7da", // אדום - לא קיים כלל
  }}
>
  {sourceLeadMap[item.sourceValue]
    ? sourceLeadMap[item.sourceValue]
    : seourceAllLeadMap[item.sourceValue] || (
        <span style={{ color: "red" }}>מקור לא קיים</span>
      )}
</td>
        <td>{item.campaign}</td>
        <td className="medium-column">
  {item.lastContactDate ? formatIsraeliDateOnly(item.lastContactDate) : ""}
  </td>
  <td>
  {item.createDate
    ? item.createDate.toDate().toLocaleString() // Adjust locale as needed
    : 'N/A'}
</td>
</tr>
    );
  })}
   </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
export default Leads