/* eslint-disable react/jsx-no-comment-textnodes */
"use client"
import React, { useState, useEffect, FormEventHandler, ChangeEventHandler, ChangeEvent, useMemo } from 'react';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs, doc, addDoc, deleteDoc, updateDoc, getDoc } from 'firebase/firestore';
import './AgentForm.css';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/firebase/AuthContext';
//import { useSelectedAgent } from '../context/SelectedAgentContext';
import useFetchAgentData from "@/hooks/useFetchAgentData"; 
import useSalesData from "@/hooks/useSalesData"; 
import useFetchMD from "@/hooks/useMD"; 

//useFetchAgentData

function AgentForm() {
  const { user, detail } = useAuth();
  const { 
    agents, 
    selectedAgentId, 
    handleAgentChange, 
    workers, 
    selectedWorkerId, 
    selectedAgentName,
    selectedWorkerName, 
    handleWorkerChange , 
   // handleCompaniesChange,
    companies,
    setCompanies,
    selectedCompany, 
    setSelectedCompany,
    selectedWorkerIdFilter,
    selectedWorkerNameFilter,
    selectedCompanyFilter,
    setSelectedCompanyFilter
  } = useFetchAgentData();

  const 
  { monthlyTotals,
    overallFinansimTotal, overallPensiaTotal, overallInsuranceTotal, overallNiudPensiaTotal
   } = useSalesData(selectedAgentId, selectedWorkerId);

   const {
    products,
    selectedProduct,
    setSelectedProduct,
    selectedProductGroup, 
    setSelectedStatusPolicy, 
    selectedStatusPolicy, 
    statusPolicies,
    selectedProductFilter,
    setSelectedProductFilter,
    selectedStatusPolicyFilter, 
    setSelectedStatusPolicyFilter
  } = useFetchMD();


  const searchParams = useSearchParams();
  const [selectedAgent, setSelectedAgent] = useState('');
  const [selectedWorker, setSelectedWorker]  = useState('');
  const [firstNameCustomer, setfirstNameCustomer] = useState('');
  const [lastNameCustomer, setlastNameCustomer] = useState('');
  const [IDCustomer, setIDCustomer] = useState('');
  const [insPremia, setinsPremia] = useState('');
  const [pensiaPremia, setpensiaPremia] = useState('');
  const [pensiaZvira, setPensiaZvira] = useState('');
  const [finansimPremia, setfinansimPremia] = useState('');
  const [finansimZvira, setFinansimZvira] = useState('');
  const [mounth, setmounth] = useState('');
  const [agentData, setAgentData] = useState<any[]>([]);
  const [selectedRow, setSelectedRow] = useState<any | null>(null);
  //const [companies, setCompanies] = useState<string[]>([]);
  const [minuySochen, setMinuySochen] = useState(false);
 // const [selectedCompany, setSelectedCompany] = useState('');
 // const [statusPolicies, setStatusPolicies] = useState<string[]>([]);
 // const [selectedStatusPolicy, setSelectedStatusPolicy] = useState('');
  const [isEditing, setIsEditing] = useState(false);
// Define a type for the items in your data array
const [idCustomerFilter, setIdCustomerFilter] = useState('');
const [firstNameCustomerFilter, setfirstNameCustomerFilter] = useState('');
const [lastNameCustomerFilter, setlastNameCustomerFilter] = useState('');
const [minuySochenFilter, setMinuySochenFilter] = useState('');
const [expiryDateFilter, setExpiryDateFilter] = useState('');
const [notes, setNotes] = useState('');

type AgentDataType = {
  id: string;
  firstNameCustomer: string;
  lastNameCustomer: string;
  IDCustomer: string;
  company: string;
  product: string;
  insPremia: number;
  pensiaPremia: number;
  pensiaZvira: number;
  finansimPremia: number;
  finansimZvira: number;
  mounth: string;
  statusPolicy: string;
  minuySochen: boolean;
  workerName: string;
  workerId: string; 
  notes: string; // Assuming you need this based on your existing type definition
  // Add any other fields that your Firestore documents contain and that you need in your app
};


type AgentDataTypeForFetching = {
  
  firstNameCustomer: string;
  lastNameCustomer: string;
  IDCustomer: string;
  company: string;
  product: string;
  insPremia: number;
  pensiaPremia: number;
  pensiaZvira: number;
  finansimPremia: number;
  finansimZvira: number;
  mounth: string;
  statusPolicy: string;
  minuySochen: boolean;
  workerName: string;
  workerId: string; 
  notes: string; // Assuming you need this based on your existing type definition
  // Add any other fields that your Firestore documents contain and that you need in your app
};






// Use the defined type when initializing the state
const [filteredData, setFilteredData] = useState<AgentDataType[]>([]);

const fetchDataForAgent = async (UserAgentId: string) => {
  const q = query(collection(db, 'sales'), where('AgentId', '==', selectedAgentId));
  const querySnapshot = await getDocs(q);
  const data = querySnapshot.docs.map(doc => ({
    id: doc.id, // Assign id first
    ...(doc.data() as AgentDataTypeForFetching) // Then spread the rest of the data
  })).sort((a, b) => {
    const [monthA, yearA] = a.mounth.split('/').map(Number);
    const [monthB, yearB] = b.mounth.split('/').map(Number);
    return (yearB + 2000) - (yearA + 2000) || monthB - monthA; // Adjust sort for descending order
  });
  setAgentData(data);
};


  useEffect(() => {
    setSelectedWorker('');
    setfirstNameCustomer('');
    setlastNameCustomer('');
    setIDCustomer('');
    setSelectedCompany('');
    setSelectedProduct('');
    setinsPremia('');''
    setpensiaPremia('');
    setPensiaZvira('');
    setfinansimPremia('');
    setFinansimZvira('');
    setmounth('');
    setMinuySochen(false);
    setSelectedStatusPolicy('');
    setNotes('');
    if (selectedAgentId) {
      fetchDataForAgent(selectedAgentId);
    }
  }, [selectedAgentId]); 


  const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);

    const handleRowClick = (item: any) => {
    setSelectedRow(item); // Store the selected row's data
    setSelectedWorker(item.workerName); //new 
    setfirstNameCustomer(item.firstNameCustomer);
    setlastNameCustomer(item.lastNameCustomer);
    setIDCustomer(item.IDCustomer);
    setSelectedCompany(item.company);
    setSelectedProduct(item.product);
    setinsPremia(item.insPremia);
    setPensiaZvira(item.pensiaZvira);
    setpensiaPremia(item.pensiaPremia);
    setfinansimPremia(item.finansimPremia);
    setFinansimZvira(item.finansimZvira);
    setmounth(item.mounth);
    setMinuySochen(item.minuySochen);
    setSelectedStatusPolicy(item.statusPolicy);
    // Set other form fields as needed
    setIsEditing(true);
    setNotes(item.notes);
  };

  const handleDelete = async () => {
    if (selectedRow && selectedRow.id) {
      await deleteDoc(doc(db, 'sales', selectedRow.id));
      setSelectedRow(null); // Reset selection
      resetForm();
      setIsEditing(false);
      if (selectedRow.agent) {
        fetchDataForAgent(selectedRow.agent);
      }
    } else {
      console.log("No selected row or row ID is undefined");

      // Fetch data again or remove the item from `agentData` state to update UI
    }
  };
  const handleEdit = async () => {
    if (selectedRow && selectedRow.id) { // Ensure selectedRow has an 'id' property
      try {
        const docRef = doc(db, 'sales', selectedRow.id); // Reference to the Firestore document
        await updateDoc(docRef, {
         // worker: selectedWorkerName,
          workerId: selectedWorkerId,// id new
          workerName:selectedWorkerName,
          firstNameCustomer,
          lastNameCustomer,
          IDCustomer,
          company: selectedCompany,
          product: selectedProduct,
          insPremia,
          pensiaPremia,
          pensiaZvira,
          finansimPremia,
          finansimZvira,
          mounth,
          minuySochen: !!minuySochen,
          statusPolicy: selectedStatusPolicy,
          notes: notes || '',
          // Include any additional fields as needed
        });

        console.log("Document successfully updated");
        setSelectedRow(null); 
        resetForm();         
        if (selectedRow.agent) {
          fetchDataForAgent(selectedRow.agent);
        }
      } catch (error) {
        console.error("Error updating document:", error);     
      }
    } else {
      console.log("No row selected or missing document ID");
    }
  };
  const resetForm = () => {
    setSelectedWorker('');
    setfirstNameCustomer(''); 
    setfirstNameCustomer(''); 
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
    setSelectedRow(null); 
    setMinuySochen(false);
    setSelectedStatusPolicy('');
    setIsEditing(false);
    setNotes('');
  };

 

const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
  event.preventDefault();
  try {
    console.log("got here");
      const docRef = await addDoc(collection(db, 'sales'), {
      agent: selectedAgentName,
      AgentId: selectedAgentId,//new 
      workerId: selectedWorkerId,// id new
      workerName:selectedWorkerName,
      firstNameCustomer,
      lastNameCustomer,
      IDCustomer,
      company: selectedCompany,
      product: selectedProduct,
      insPremia,
      pensiaPremia,
      pensiaZvira,
      finansimPremia,
      finansimZvira,
      mounth,
      minuySochen,
      statusPolicy: selectedStatusPolicy,
      notes,
    });
    
    console.log('Document written with ID:', docRef.id);
    resetForm(); 
    setIsEditing(false);
    if (selectedAgent) {
      fetchDataForAgent(selectedAgent);
    }
  } catch (error) {
    console.error('Error adding document:', error);
  }
};


  const handleFirstNameChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const value = event.target.value;
    // Allow Hebrew letters and spaces, but prevent leading or trailing spaces
    const hebrewRegex = /^[\u0590-\u05FF ]+$/;
    // Trim leading and trailing spaces for the test to prevent validation errors from extra spaces
    if (value === '' || hebrewRegex.test(value.trim())) {
      setfirstNameCustomer(value);
    }
    // Otherwise, do not update the state, effectively rejecting the input
  };

  const handleLastNameChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const value = event.target.value;
    // Allow Hebrew letters and spaces, but prevent leading or trailing spaces
    const hebrewRegex = /^[\u0590-\u05FF ]+$/;
    // Trim leading and trailing spaces for the test to prevent validation errors from extra spaces
    if (value === '' || hebrewRegex.test(value.trim())) {
      setlastNameCustomer(value);
    }
  };

  const handleIDChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value;
    // Allow only numbers
    const onlyNums = value.replace(/[^0-9]/g, '').slice(0, 9);
    setIDCustomer(onlyNums);
  };

  const canSubmit = useMemo(() => (
     selectedAgentId.trim() !== '' &&
     selectedWorkerId.trim() !== '' &&
     firstNameCustomer.trim() !== '' &&
     lastNameCustomer.trim() !== '' &&
     IDCustomer.trim() !== '' &&
     selectedCompany.trim() !== '' &&
     selectedProduct.trim() !== '' &&
    mounth.trim() !== ''
  ), [selectedAgentId, selectedWorkerId, firstNameCustomer, lastNameCustomer, IDCustomer, 
    selectedCompany, selectedProduct, mounth]);


 // useEffect(() => {
//    const fetchStatusPolicies = async () => {
//      const querySnapshot = await getDocs(collection(db, 'statusPolicy'));
//      const statusList = querySnapshot.docs.map(doc => doc.data().statusName); // Assuming the field name is 'productName'
//      setStatusPolicies(statusList);
 //   };
//    fetchStatusPolicies();
 // }, []);

  

  const handleFinansimZviraChange: ChangeEventHandler<HTMLInputElement> = (e) => {
   const value = e.target.value
   const onlyNums = value.replace(/[^0-9]/g, '').slice(0, 9);
    setFinansimZvira(onlyNums);
  };

  const handleFinansimPremia: ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value
    const onlyNums = value.replace(/[^0-9]/g, '').slice(0, 9);
    setfinansimPremia(onlyNums);
  };

  const handlePensiaZvira: ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value
    const onlyNums = value.replace(/[^0-9]/g, '').slice(0, 9);
    setPensiaZvira(onlyNums);
  };

  const handlepensiaPremia: ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value;
    const onlyNums = value.replace(/[^0-9]/g, '').slice(0, 9);
    setpensiaPremia(onlyNums);
};


  const handleinsPremia: ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value; // Use 0 as a fallback if conversion fails
    const onlyNums = value.replace(/[^0-9]/g, '').slice(0, 9);
    setinsPremia(onlyNums);
  };

  const handleExpiryDateChange : ChangeEventHandler<HTMLInputElement> = (e) => {
    const { value } = e.target;
    let formattedValue = value;
  
    // Remove all non-digit characters
    formattedValue = formattedValue.replace(/\D/g, '');
  
    // Add a slash after the month if it's not there yet and the length is 2
    if (formattedValue.length === 2) {
      formattedValue = formattedValue + '/';
    } else if (formattedValue.length > 2) {
      // If more than 2 digits, insert slash between month and year
      formattedValue = formattedValue.substring(0, 2) + '/' + formattedValue.substring(2, 4);
    }
  
    setmounth(formattedValue);
  };


  useEffect(() => {
    // Filter data based on selected filter values
    let data = agentData.filter(item => {
      return (selectedWorkerIdFilter ? item.workerId === selectedWorkerIdFilter : true) &&
             (selectedCompanyFilter ? item.company === selectedCompanyFilter : true) &&
             (selectedProductFilter ? item.product === selectedProductFilter : true) &&
             item.IDCustomer.includes(idCustomerFilter)&&
             item.firstNameCustomer.includes(firstNameCustomerFilter)&&
             item.lastNameCustomer.includes(lastNameCustomerFilter)&&
             (minuySochenFilter === '' || item.minuySochen.toString() === minuySochenFilter) &&
             item.mounth.includes(expiryDateFilter)&&
             (selectedStatusPolicyFilter ? item.statusPolicy === selectedStatusPolicyFilter : true);
    });
    setFilteredData(data);
  }, [selectedWorkerIdFilter, selectedCompanyFilter, selectedProductFilter, selectedStatusPolicyFilter, agentData, idCustomerFilter, firstNameCustomerFilter, lastNameCustomerFilter, minuySochenFilter, expiryDateFilter]);



  console.log({ selectedAgentId, selectedWorkerId, firstNameCustomer, lastNameCustomer, IDCustomer, selectedCompany, selectedProduct, mounth });
  return (
    <div className="content-container">
      <div className="form-container">
        <form onSubmit={handleSubmit}>
      <table>
        <div className="scrollable-tbody">
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
                        <label htmlFor="workerSelect">עובד</label>
                    </td>
                    <td>
                        <select id="workerSelect" value={selectedWorkerId} 
                      onChange={(e) => handleWorkerChange(e, 'insert')}>
                            <option value="">בחר עובד</option>
                            {workers.map(worker => (
                                <option key={worker.id} value={worker.id}>{worker.name}</option>
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
                    <td>
                        <label htmlFor="companySelect">חברה</label>
                    </td>
                    <td>
                        <select id="companySelect" value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}>
                            <option value="">בחר חברה</option>
                            {companies.map((companyName, index) => (
                                <option key={index} value={companyName}>{companyName}</option>
                            ))}
                        </select>
                    </td>
                </tr>
                <tr>
                    <td>
                        <label htmlFor="productSelect">מוצר</label>
                    </td>
                    <td>
                        <select id="productSelect" value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)}>
                            <option value="">בחר מוצר</option>
                            {products.map(product => (
                                <option key={product.id} value={product.name}>{product.name}</option>
                            ))}
                        </select>
                    </td>
                </tr>
                <tr>
                    <td>
                        <label htmlFor="insPremia">פרמיה ביטוח</label>
                    </td>
                    <td>
                        <input type="text" inputMode="numeric" value={insPremia} onChange={handleinsPremia} disabled={selectedProductGroup === '1' || selectedProductGroup === '4'} />
                    </td>
                </tr>
                <tr>
                    <td>
                        <label htmlFor="pensiaPremia">פרמיה פנסיה</label>
                    </td>
                    <td>
                        <input type="text" inputMode="numeric" value={pensiaPremia} onChange={handlepensiaPremia} disabled={selectedProductGroup === '3' || selectedProductGroup === '4'} />
                    </td>
                </tr>
                <tr>
                    <td>
                        <label htmlFor="pensiaZvira">צבירה פנסיה</label>
                    </td>
                    <td>
                        <input type="text" inputMode="numeric" value={pensiaZvira} onChange={handlePensiaZvira} disabled={selectedProductGroup === '3' || selectedProductGroup === '4'} />
                    </td>
                </tr>
                <tr>
                    <td>
                        <label htmlFor="finansimPremia">פרמיה פיננסים</label>
                    </td>
                    <td>
                        <input type="text" inputMode="numeric" value={finansimPremia} onChange={handleFinansimPremia} disabled={selectedProductGroup === '1' || selectedProductGroup === '3'} />
                    </td>
                </tr>
                <tr>
                    <td>
                        <label htmlFor="finansimZvira">צבירה פיננסים</label>
                    </td>
                    <td>
                        <input type="text" inputMode="numeric" value={finansimZvira} onChange={handleFinansimZviraChange} disabled={selectedProductGroup === '1' || selectedProductGroup === '3'} />
                    </td>
                </tr>
                <tr>
                    <td>
                        <label htmlFor="expiryDate">תאריך תפוקה (MM/YY)</label>
                    </td>
                    <td>
                        <input type="text" id="expiryDate" name="expiryDate" placeholder="MM/YY" maxLength={5} value={mounth} onChange={handleExpiryDateChange} />
                    </td>
                </tr>
                <tr>
                    <td>
                        <label htmlFor="statusPolicySelect">סטאטוס פוליסה</label>
                    </td>
                    <td>
                        <select id="statusPolicySelect" value={selectedStatusPolicy} onChange={(e) => setSelectedStatusPolicy(e.target.value)}>
                            <option value="">בחר סטאטוס פוליסה</option>
                            {statusPolicies.map((status, index) => (
                                <option key={index} value={status}>{status}</option>
                            ))}
                        </select>
                    </td>
                </tr>
                <tr>
                    <td>
                        <label htmlFor="minuySochen" className="checkbox-label">מינוי סוכן</label>
                    </td>
                    <td>
                        <input type="checkbox" id="minuySochen" name="minuySochen" checked={minuySochen} onChange={(e) => setMinuySochen(e.target.checked)} />
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



            {/** Multiple rows, each with a label and corresponding input/select **/}
          </tbody>
          </div>
        </table>
           <div className="form-group button-group" style={{ display: 'flex' }}>
            <button type="submit" disabled={!canSubmit || isEditing}>
              הזן
            </button>
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
      

      <select id="company-Select" value={selectedCompanyFilter} onChange={(e) => setSelectedCompanyFilter(e.target.value)}>
        <option value="">בחר חברה</option>
         {companies.map((companyName, index) => (
         <option key={index} value={companyName}>{companyName}</option>
    ))}
     </select>
     <select id="product-Select" value={selectedProductFilter} onChange={(e) => setSelectedProductFilter(e.target.value)}>
               <option value="">בחר מוצר</option>
              {products.map(product => (
             <option key={product.id} value={product.name}>{product.name}</option>
         ))}
        </select>
        <input type="text" 
        id="expiry-Date" 
        name="expiry-Date" 
        placeholder="MM/YY" 
        maxLength={5} 
        value={expiryDateFilter} 
        onChange={(e) => setExpiryDateFilter(e.target.value)} />

        <select
      id="status-PolicySelect"
      value={selectedStatusPolicyFilter}
      onChange={(e) => setSelectedStatusPolicyFilter(e.target.value)}>
     <option value=""> סטאטוס פוליסה</option>
                            {statusPolicies.map((status, index) => (
                                <option key={index} value={status}>{status}</option>
       ))}
       </select>
       <select value={minuySochenFilter} onChange={(e) => setMinuySochenFilter(e.target.value)}>
    <option value="">מינוי סוכן </option>
    <option value="true">כן</option>
    <option value="false">לא</option>
  </select>

       <select id="worker-select" value={selectedWorkerIdFilter} 
       onChange={(e) => handleWorkerChange(e, 'filter')}>
        <option value="">כל העובדים</option>
        {workers.map(worker => (
          <option key={worker.id} value={worker.id}>{worker.name}</option>
        ))}
      </select>
      </div>
       {/* First Frame 
        {agentData.length > 0 ? (*/}
        <div className="table-container" style={{ overflowX: 'auto', maxHeight: '300px' }}>
        <table>
            <thead>
              <tr>
                <th>שם פרטי </th>
                <th>שם משפחה </th>
                <th>תז </th>
                <th>חברה</th>
                <th>מוצר</th>
                <th>פרמיה ביטוח</th>
                <th>פרמיה פנסיה</th>
                <th>צבירה פנסיה</th>
                <th>פרמיה פיננסים</th>
                <th>צבירה פיננסים</th>
                <th>חודש תפוקה</th>
                <th> סטאטוס</th>
                <th>מינוי סוכן</th>
                <th>שם עובד</th>
                {/* Add more titles as necessary */}
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item) => (
                <tr key={item.id}
                  onClick={() => handleRowClick(item)}
                  onMouseEnter={() => setHoveredRowId(item.id)}
                  onMouseLeave={() => setHoveredRowId(null)}
                  className={`${selectedRow && selectedRow.id === item.id ? 'selected-row' : ''} ${hoveredRowId === item.id ? 'hovered-row' : ''}`}>
                  <td>{item.firstNameCustomer}</td>
                  <td>{item.lastNameCustomer}</td>
                  <td>{item.IDCustomer}</td>
                  <td>{item.company}</td>
                  <td>{item.product}</td>
                  <td>{Number(item.insPremia).toLocaleString('en-US')}</td>
                  <td>{Number(item.pensiaPremia).toLocaleString('en-US')}</td>
                  <td>{Number(item.pensiaZvira).toLocaleString('en-US')}</td>
                  <td>{Number(item.finansimPremia).toLocaleString('en-US')}</td>
                  <td>{Number(item.finansimZvira).toLocaleString('en-US')}</td>
                  <td>{item.mounth}</td>
                  <td>{item.statusPolicy}</td>
                  <td>{item.minuySochen ? 'כן' : 'לא'}</td>
                  <td>{item.workerName}</td>
                  {/* Add more data fields as necessary */}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
         {/*        ) : <p>No data available for the selected agent.</p>} */}

           
           <div className="table-container" style={{ overflowX: 'auto', maxHeight: '300px' }}>
          <table>
  <thead>
    <tr>
      <th>חודש תפוקה</th>
      <th>סך פיננסים</th>
      <th>סך פנסיה</th>
      <th>סך ביטוח</th>
      <th>ניוד פנסיה</th>
    </tr>
  </thead>
  <tbody>
    {Object.entries(monthlyTotals)
      .sort((a, b) => {
        console.log("Comparing", a[0], "with", b[0]); // See the raw values
       const [monthA, yearA] = a[0].split('/').map(Number);
        const [monthB, yearB] = b[0].split('/').map(Number);
     
        if (isNaN(monthA) || isNaN(yearA) || isNaN(monthB) || isNaN(yearB)) {
          console.error("Parsing error with data:", a[0], b[0]);
      }

        console.log("Parsed values:", monthA, yearA, monthB, yearB); // Check parsed values
        return (yearA - yearB) || (monthA - monthB); // Adjusted 
      })
      .map(([month, totals]) => (
        <tr key={month}>
          <td>{month}</td>
          <td>{totals.finansimTotal.toLocaleString()}</td>
          <td>{totals.pensiaTotal.toLocaleString()}</td>
          <td>{totals.insuranceTotal.toLocaleString()}</td>
          <td>{totals.niudPensiaTotal.toLocaleString()}</td>
        </tr>
      ))}
    <tr>
      <td><strong>סיכום</strong></td>
      <td><strong>{overallFinansimTotal.toLocaleString()}</strong></td>
      <td><strong>{overallPensiaTotal.toLocaleString()}</strong></td>
      <td><strong>{overallInsuranceTotal.toLocaleString()}</strong></td>
      <td><strong>{overallNiudPensiaTotal.toLocaleString()}</strong></td>
    </tr>
  </tbody>
</table> 
</div>

      </div>
    </div>
  );
        }
export default AgentForm;


