import { ChangeEventHandler, FormEventHandler, SetStateAction, useEffect, useMemo, useState } from "react";
import { collection, query, setDoc, where, getDocs, getDoc, addDoc, deleteDoc, doc, updateDoc, DocumentSnapshot, DocumentData, serverTimestamp } from "firebase/firestore";
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

  

  const handleLastContactDate = (e: React.ChangeEvent<HTMLInputElement>) => setLastContactDate(e.target.value);
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value);
  const handleMailChange = (e: React.ChangeEvent<HTMLInputElement>) => setMail(e.target.value);
  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => setAddress(e.target.value);

 
  const [sourceValue, setSourceValue] = useState<string | null>('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const [sourceLeadList, setSourceLeadList] = useState<any[]>([]);
  const handleReturnDate = (e: React.ChangeEvent<HTMLInputElement>) => setReturnDate(e.target.value);

  


  interface Suggestion {
    id: string;
    source: string; // or any other properties you need
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

  } = useFetchAgentData();


  useEffect(() => {
    if (selectedAgentId) {
        fetchLeadsForAgent(selectedAgentId);
      resetForm();
    }
  }, [selectedAgentId]);

  const { 
    statusLeadMap
  } = useFetchMD(selectedAgentId);


  const fetchLeadsForAgent = async (UserAgentId: string) => {
    const q = query(collection(db, 'leads'), where('AgentId', '==', UserAgentId));
    const querySnapshot = await getDocs(q);
    const data = await Promise.all(querySnapshot.docs.map(async (docSnapshot) => {
      const LeadsData = docSnapshot.data() as LeadsType; 
           return {
        ...LeadsData,
        id: docSnapshot.id,
      };
    }));
    setLeadsData(data); 
  };


  useEffect(() => {
    let data = leadsData.filter(item => {
      return (
        item.IDCustomer.includes(idCustomerFilter)) &&
        (item.firstNameCustomer.includes(firstNameCustomerFilter)) &&
        (item.lastNameCustomer.includes(lastNameCustomerFilter)) 

    });
    setFilteredData(data);
  }, [leadsData, idCustomerFilter, firstNameCustomerFilter, lastNameCustomerFilter]);



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
          workerId: selectedWorkerId,// id new
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
          sourceValue,
          createdAt: serverTimestamp(),
          lastUpdateDate: serverTimestamp(), 
          selectedStatusLead,
          workerId: selectedWorkerId,
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


  useEffect(() => {
    const fetchSourceLeadForAgent = async () => {
      if (!selectedAgentId) return; 
      const q = query(
        collection(db, 'sourceLead'),
        where('AgentId', '==', selectedAgentId),
        where('statusLead', '==', true)
      );
      try {
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setSourceLeadList(data); 
      } catch (error) {
        console.error('Error fetching source leads:', error);
      }
    };
    fetchSourceLeadForAgent();
  }, [selectedAgentId]); 

  const handleSelectChange = (event: { target: { value: SetStateAction<string | null>; }; }) => {
    setSourceValue(event.target.value);
  };

  return (
    <div className="content-container">
      <div className="form-container">
        <form onSubmit={handleSubmit}>
          <table>
            <tbody>
              <tr>
                <td>
                  <label htmlFor="agentSelect">סוכנות</label>
                </td>
                <td>
                  <select onChange={handleAgentChange} value={selectedAgentId}>
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
                  <input type="text" value={firstNameCustomer} onChange={handleFirstNameChange} title="הזן אותיות בלבד" />
                </td>
              </tr>
              <tr>
                <td>
                  <label>שם משפחה</label>
                </td>
                <td>
                  <input type="text" value={lastNameCustomer} onChange={handleLastNameChange} title="הזן אותיות בלבד" />
                </td>
              </tr>
              <tr>
                <td>
                  <label htmlFor="IDCustomer">תז</label>
                </td>
                <td>
                  <input type="text" inputMode="numeric" maxLength={9} value={IDCustomer} onChange={handleIDChange} />
                </td>
              </tr>
              <tr>
                <td><label htmlFor="phone">טלפון</label></td>
                <td><input type="tel" id="phone" name="phone" value={phone} onChange={handlePhoneChange} /></td>
              </tr>
              <tr>
                <td><label htmlFor="mail">דואר אלקטרוני</label></td>
                <td><input type="email" id="mail" name="mail" value={mail} onChange={handleMailChange} /></td>
              </tr>
              <tr>
                <td><label htmlFor="address">כתובת</label></td>
                <td><input type="text" id="address" name="address" value={address} onChange={handleAddressChange} /></td>
              </tr>
              <tr>
                <td><label htmlFor="returnDate" >תאריך חזרה</label></td>
                <td><input type="date" id="returnDate" name="returnDate" value={returnDate} onChange={handleReturnDate} /></td>
              </tr>
              <tr>
                <td><label htmlFor="lastContactDate">תאריך פניה אחרונה</label></td>
                <td><input type="date" id="lastContactDate" name="lastContactDate" value={lastContactDate} onChange={handleLastContactDate} /></td>
              </tr>
             
              <tr>
                <td>
                  <label htmlFor="sourceLeadSelect">מקור ליד</label>
                </td>
                <td>
                  <select id="sourceLeadSelect" value={sourceValue || ''} onChange={handleSelectChange}>
                    <option value="">בחר מקור ליד</option>
                    {sourceLeadList.map((item, index) => (
                      <option key={index} value={item.sourceLead}>{item.sourceLead}</option>
                    ))}
                  </select>
                </td>
              </tr>
              <tr>
                <td><label htmlFor="statusLeadSelect">סטטוס ליד</label></td>
                <td>
                  <select
                    id="statusLeadSelect"
                    value={selectedStatusLead}
                    onChange={(e) => setSelectedStatusLead(e.target.value)}
                  >
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
                  <input type="text" id="notes" name="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
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
        <div className="select-container" >
          <input
            type="text"
            placeholder="שם פרטי"
            value={firstNameCustomerFilter}
            onChange={(e) => setfirstNameCustomerFilter(e.target.value)}
          />
          <input
            type="text"
            placeholder="שם משפחה"
            value={lastNameCustomerFilter}
            onChange={(e) => setlastNameCustomerFilter(e.target.value)}
          />
          <input
            type="text"
            placeholder="תז לקוח"
            value={idCustomerFilter}
            onChange={(e) => setIdCustomerFilter(e.target.value)}
          />
        </div>
        {/* First Frame 
        {agentData.length > 0 ? (*/}
        <div className="table-container flex" style={{ overflowX: 'auto', maxHeight: '300px' }}>
          <table className="flex-grow">
            <thead>
              <tr>
                {showSelect && <th>Select</th>}
                <th>שם פרטי</th>
                <th>שם משפחה</th>
                <th>תז</th>
                <th>תאריך חזרה</th>
                <th>תאריך פניה אחרונה</th>
                <th>טלפון</th>
                <th>מייל</th>
                <th>כתובת</th>
                <th>מקור ליד</th>
                <th>סטטוס ליד</th>
                <th>שם נציג</th>
              </tr>
            </thead>
            <tbody>
            {filteredData.map((item) => {
  const statusLeadName = statusLeadMap.find(status => status.id === item.selectedStatusLead)?.statusLeadName || 'לא נבחר';
               return (
                <tr key={item.id}
                  onClick={() => handleRowClick(item)}
                  onMouseEnter={() => setHoveredRowId(item.id)}
                  onMouseLeave={() => setHoveredRowId(null)}
                  className={`${selectedCustomers.has(item.id) ? 'selected-row' : ''} ${hoveredRowId === item.id ? 'hovered-row' : ''}`}>
                  <td>{item.firstNameCustomer}</td>
                  <td>{item.lastNameCustomer}</td>
                  <td>{item.IDCustomer}</td>
                  <td>{item.returnDate}</td>
                  <td>{item.lastContactDate}</td>
                  <td>{item.phone}</td>
                  <td>{item.mail}</td>
                  <td>{item.address}</td>
                  <td>{item.sourceValue}</td>
                  <td>{statusLeadName}</td>
                  <td>{(workerNameMap[item.workerId] || 'Unknown Worker')}</td>
                  </tr>
              );
            })}
            </tbody>
          </table>
        </div>
        <div className="table-container flex flex-col" style={{ overflowX: 'auto', maxHeight: '300px' }}>
          <div className="buttons-container">
          
          </div>
          <div className="flex">
           
          </div>
        </div>

      </div>
    </div>
  );
}
export default Leads