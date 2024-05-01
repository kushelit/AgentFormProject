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
    handleWorkerChange 
  } = useFetchAgentData();

  const 
  { monthlyTotals,
    overallFinansimTotal, overallPensiaTotal, overallInsuranceTotal, overallNiudPensiaTotal
   } = useSalesData(selectedAgentId, selectedWorkerId);

   const {
    products,
    selectedProduct,
    setSelectedProduct,
    selectedProductGroup
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
  const [companies, setCompanies] = useState<string[]>([]);
  const [minuySochen, setMinuySochen] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [statusPolicies, setStatusPolicies] = useState<string[]>([]);
  const [selectedStatusPolicy, setSelectedStatusPolicy] = useState('');
  const [isEditing, setIsEditing] = useState(false);
 // const [selectedProductGroup, setSelectedProductGroup] = useState('');
 // const [selectedProduct, setSelectedProduct] = useState('');
 // const [products, setProducts] = useState<Product[]>([]);



const fetchDataForAgent = async (UserAgentId : string) => {
  const q = query(collection(db, 'sales'), where('AgentId', '==', selectedAgentId ));
  const querySnapshot = await getDocs(q);
  const data = querySnapshot.docs.map(doc => ({
    id: doc.id, 
    ...doc.data() 
  }));
  setAgentData(data);
  console.log(data)
  
};


  useEffect(() => {
    const fetchCompanies = async () => {
      const querySnapshot = await getDocs(collection(db, 'company'));
      const companiesList = querySnapshot.docs.map(doc => doc.data().companyName); // Assuming the field name is 'companyName'
      setCompanies(companiesList);
    };

    fetchCompanies();
  }, []);


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
    if (selectedAgentId) {
      fetchDataForAgent(selectedAgentId);
    }
  }, [selectedAgentId]); 


  const [hoveredRowId, setHoveredRowId] = useState(null);

    const handleRowClick = (item: any) => {
    setSelectedRow(item); // Store the selected row's data
    setSelectedWorker(item.selectedW ); //new 
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
    const hebrewRegex = /^[\u0590-\u05FF]+$/;

    // If the value is empty or matches the Hebrew regex, update the state
    if (value === '' || hebrewRegex.test(value)) {
      setfirstNameCustomer(value);
    }
    // Otherwise, do not update the state, effectively rejecting the input
  };

  const handleLastNameChange: ChangeEventHandler<HTMLInputElement> = (event) => {
    const value = event.target.value;
    const hebrewRegex = /^[\u0590-\u05FF]+$/;

    // If the value is empty or matches the Hebrew regex, update the state
    if (value === '' || hebrewRegex.test(value)) {
      setlastNameCustomer(value);
    }
    // Otherwise, do not update the state, effectively rejecting the input
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


  useEffect(() => {
    const fetchStatus = async () => {
      const querySnapshot = await getDocs(collection(db, 'statusPolicy'));
      const statusList = querySnapshot.docs.map(doc => doc.data().statusName); // Assuming the field name is 'productName'
      setStatusPolicies(statusList);
    };

    fetchStatus();
  }, []); useEffect(() => {
    const fetchStatusPolicies = async () => {
      const querySnapshot = await getDocs(collection(db, 'statusPolicy'));
      const fetchedStatusPolicies = querySnapshot.docs.map(doc => doc.data().statusName); // Assuming the field name is 'statusName'
      setStatusPolicies(fetchedStatusPolicies);
    };

    fetchStatusPolicies();
  }, []);
  

  const handleFinansimZviraChange: ChangeEventHandler<HTMLInputElement> = (e) => {
   const value = e.target.value
    setFinansimZvira(value);
  };

  const handleFinansimPremia: ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value
    setfinansimPremia(value);
  };

  const handlePensiaZvira: ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value
    setPensiaZvira(value);
  };

  const handlepensiaPremia: ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value;
    setpensiaPremia(value);
};


  const handleinsPremia: ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value; // Use 0 as a fallback if conversion fails
    setinsPremia(value);
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
                        <select id="workerSelect" value={selectedWorkerId} onChange={handleWorkerChange}>
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
                        <input type="text" value={insPremia} onChange={handleinsPremia} disabled={selectedProductGroup === '1' || selectedProductGroup === '4'} />
                    </td>
                </tr>
                <tr>
                    <td>
                        <label htmlFor="pensiaPremia">פרמיה פנסיה</label>
                    </td>
                    <td>
                        <input type="text" value={pensiaPremia} onChange={handlepensiaPremia} disabled={selectedProductGroup === '3' || selectedProductGroup === '4'} />
                    </td>
                </tr>
                <tr>
                    <td>
                        <label htmlFor="pensiaZvira">צבירה פנסיה</label>
                    </td>
                    <td>
                        <input type="text" value={pensiaZvira} onChange={handlePensiaZvira} disabled={selectedProductGroup === '3' || selectedProductGroup === '4'} />
                    </td>
                </tr>
                <tr>
                    <td>
                        <label htmlFor="finansimPremia">פרמיה פיננסים</label>
                    </td>
                    <td>
                        <input type="text" value={finansimPremia} onChange={handleFinansimPremia} disabled={selectedProductGroup === '1' || selectedProductGroup === '3'} />
                    </td>
                </tr>
                <tr>
                    <td>
                        <label htmlFor="finansimZvira">צבירה פיננסים</label>
                    </td>
                    <td>
                        <input type="text" value={finansimZvira} onChange={handleFinansimZviraChange} disabled={selectedProductGroup === '1' || selectedProductGroup === '3'} />
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
        
        {agentData.length > 0 ? (
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
              {agentData.map((item) => (
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
                  <td>{item.insPremia}</td>
                  <td>{item.pensiaPremia}</td>
                  <td>{item.pensiaZvira}</td>
                  <td>{item.finansimPremia}</td>
                  <td>{item.finansimZvira}</td>
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
                ) : <p>No data available for the selected agent.</p>}

           
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
