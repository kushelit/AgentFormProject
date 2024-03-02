/* eslint-disable react/jsx-no-comment-textnodes */
"use client"
import React, { useState, useEffect, FormEventHandler, ChangeEventHandler, ChangeEvent, useMemo } from 'react';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs, doc, addDoc, deleteDoc, updateDoc, getDoc } from 'firebase/firestore';
import './AgentForm.css';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/firebase/AuthContext';


function AgentForm() {
  const searchParams = useSearchParams();
  const { user, detail } = useAuth();
  const [selectedAgent, setSelectedAgent] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [userAgentId, setUserAgentId] = useState('');
  const [agents, setAgents] = useState<{id: string, name: string}[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedWorker, setSelectedWorker]  = useState('');
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [selectedWorkerName, setSelectedWorkerName] = useState("")
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
  const [products, setProducts] = useState<string[]>([]);
  const [minuySochen, setMinuySochen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [statusPolicies, setStatusPolicies] = useState<string[]>([]);
  const [selectedStatusPolicy, setSelectedStatusPolicy] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  //const { role } = detail || {};





//after admin
useEffect(() => {
  const fetchAgentData = async () => {
    if (user && detail && detail.role === 'admin') {
      // Fetch all users with role 'agent'
      const agentsQuery = query(collection(db, 'users'), where('role', '==', 'agent'));
      const querySnapshot = await getDocs(agentsQuery);
      const agentsList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name, 
      }));
      setAgents(agentsList); 
    } else if
         (detail && detail.agentId) {
      const agentDocRef = doc(db, 'users', detail.agentId);
      const agentDocSnap = await getDoc(agentDocRef);

      if (agentDocSnap.exists()) {
        setAgents([{ id: agentDocSnap.id, name: agentDocSnap.data().name }]);
        const agentName = agentDocSnap.data().name;
        setSelectedAgent(agentName);
        setSelectedAgentId(detail.agentId);
        await fetchWorkersForSelectedAgent(detail.agentId);
      } else {
        console.log("No such Agent!");
      }
    }
  };

  fetchAgentData();
}, [user, detail]);





useEffect(() => {
  if (selectedAgentId) {
    fetchWorkersForSelectedAgent(selectedAgentId);
  } else {
    setWorkers([]); 
  }
}, [selectedAgentId]);


const fetchWorkersForSelectedAgent = async (agentId: string) => {
  const workersQuery = query(collection(db, 'users'), where('agentId', '==', agentId), where('role', 'in', ['worker', 'agent']));
  const querySnapshot = await getDocs(workersQuery);
  const workersList = querySnapshot.docs.map(doc => ({
    id: doc.id,
    name: doc.data().name, 
  }));
  setWorkers(workersList); 
};



const handleAgentChange = (event: ChangeEvent<HTMLSelectElement>) =>  {
  const selectedId = event.target.value;
  const selectedAgentInfo = agents.find(agent => agent.id === selectedId);
  
  if (selectedAgentInfo) {
    setSelectedAgent(selectedAgentInfo.name);
    setSelectedAgentId(selectedAgentInfo.id);
    // If applicable, fetch workers or other data related to the selected agent
    fetchWorkersForSelectedAgent(selectedAgentInfo.id);
  }
};


interface Worker {
  name: string;
  id: string;
}


useEffect(() => {
  const fetchWorkers = async () => {
    if (userAgentId) {
      const workersQuery = query(
        collection(db, 'users'),
        where('role', 'in', ['worker', 'agent']),
        where('agentid', '==', userAgentId)
      );
      const querySnapshot = await getDocs(workersQuery);
      const workersList = querySnapshot.docs.map(doc => ({
        name: doc.data().name as string, 
        id: doc.id  
      }));
      setWorkers(workersList);
    }
  };

  fetchWorkers();
}, [userAgentId]); // 




const handleWorkerChange = (event: ChangeEvent<HTMLSelectElement>) =>  {
  const selectedOption = event.target.options[event.target.selectedIndex];
  setSelectedWorkerId(selectedOption.value);
  setSelectedWorkerName(selectedOption.text);
};



const fetchDataForAgent = async (UserAgentId : string) => {
  const q = query(collection(db, 'sales'), where('AgentId', '==', selectedAgentId ));
  const querySnapshot = await getDocs(q);
  const data = querySnapshot.docs.map(doc => ({
    id: doc.id, 
    ...doc.data() 
  }));
  setAgentData(data);
  
};

//end


  useEffect(() => {
    const fetchCompanies = async () => {
      const querySnapshot = await getDocs(collection(db, 'company'));
      const companiesList = querySnapshot.docs.map(doc => doc.data().companyName); // Assuming the field name is 'companyName'
      setCompanies(companiesList);
    };

    fetchCompanies();
  }, []);

  useEffect(() => {
    const fetchProducts = async () => {
      const querySnapshot = await getDocs(collection(db, 'product'));
      const productsList = querySnapshot.docs.map(doc => doc.data().productName); // Assuming the field name is 'productName'
      setProducts(productsList);
      console.log( selectedAgent,
        selectedWorkerName,
        firstNameCustomer,
        lastNameCustomer,
        IDCustomer,
        selectedCompany,
        selectedProduct,
        mounth)
    };

    fetchProducts();
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
    if (selectedAgent) {
      fetchDataForAgent(selectedAgent);
    }
  }, [selectedAgent]); 



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
         // worker: selectedWorker,
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

 
//new 6

const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
  event.preventDefault();
  try {
    console.log("got here");
      const docRef = await addDoc(collection(db, 'sales'), {
      agent: selectedAgent,
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
     selectedAgent.trim() !== '' &&
     selectedWorkerName.trim() !== '' &&
    firstNameCustomer.trim() !== '' &&
     lastNameCustomer.trim() !== '' &&
     IDCustomer.trim() !== '' &&
     selectedCompany.trim() !== '' &&
     selectedProduct.trim() !== '' &&
    mounth.trim() !== ''
  ), [selectedAgent, selectedWorkerName, firstNameCustomer, lastNameCustomer, IDCustomer, 
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



  console.log({ selectedAgent, selectedWorkerName, firstNameCustomer, lastNameCustomer, IDCustomer, selectedCompany, selectedProduct, mounth });
  return (
    <div className="content-container">
      <div className="form-container">
        <form onSubmit={handleSubmit}>
           <div className="form-group">
          <label htmlFor="agentSelect">המערכת של סוכנות:  </label>
          <select onChange={handleAgentChange} value={selectedAgentId}>
          {detail?.role === 'admin' && <option value="">בחר סוכן</option>}

  {agents.map((agent) => (
    <option key={agent.id} value={agent.id}>{agent.name}</option>
  ))}
</select>
          </div>
          <div className="form-group">
          <label htmlFor="workerSelect">בחר עובד</label>
    <select id="workerSelect" value={selectedWorkerId} onChange={handleWorkerChange}>
      <option value="">בחר עובד</option>
      {workers.map((worker) => (
        <option key={worker.id} value={worker.id}>{worker.name}</option>
      ))}
    </select>
          </div>
          <div className="form-group">
            <label>שם פרטי לקוח: </label>
            <input
              type="text"
              value={firstNameCustomer}
              onChange={handleFirstNameChange} // Fixed the typo here
              title="הזן אותיות בלבד"
            />
          </div>
          <div className="form-group">
            <label>
              שם משפחה לקוח:</label>
            <input type="text"
              value={lastNameCustomer}
              onChange={handleLastNameChange}
              title="הזן אותיות בלבד" />
          </div>
          <div className="form-group">
            <label htmlFor="IDCustomer">
              תז לקוח:</label>
              <input
                type="text"
                inputMode="numeric" // Suggests a numeric keyboard on mobile devices
                maxLength={9} // Limits input length to 9 characters
                value={IDCustomer}
                onChange={handleIDChange}
              />
            
          </div>
          <div className="form-group">
            <label htmlFor="companySelect">חברה:</label>
            <select
              id="companySelect"
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
            >
              <option value="">בחר חברה</option>
              {companies.map((companyName, index) => (
                <option key={index} value={companyName}>{companyName}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="productSelect">מוצר:</label>
            <select id="productSelect"
              value={selectedProduct}
              onChange={(e) => setSelectedProduct(e.target.value)}
            >
              <option value="">בחר מוצר</option>
              {products.map((productName, index) => (
                <option key={index} value={productName}>{productName}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="insPremia"> 
              פרמיה ביטוח:</label>
              <input type="text" value={insPremia} onChange={handleinsPremia} />
           
          </div>
          <div className="form-group">
            <label htmlFor="pensiaPremia"> 
              פרמיה פנסיה: </label>
              <input type="text" value={pensiaPremia} onChange={handlepensiaPremia} />
           
          </div>
          <div className="form-group">
            <label htmlFor="pensiaZvira"> 
              צבירה פנסיה : </label>
              <input type="text" value={pensiaZvira} onChange={handlePensiaZvira} />
           
          </div>
          <div className="form-group">
            <label htmlFor="finansimPremia"> 
              פרמיה פיננסים:</label>
              <input type="text" value={finansimPremia} onChange={handleFinansimPremia} />
            
          </div>
          <div className="form-group">
            <label htmlFor="finansimZvira"> 
              צבירה פיננסים: </label>
              <input type="text" value={finansimZvira} onChange={handleFinansimZviraChange} />
           
          </div>
          <div className="form-group">
            <label  htmlFor="expiryDate"> 
              תאריך תפוקה (MM/YY): </label>
              <input type="text" id="expiryDate" name="expiryDate" placeholder="MM/YY" maxLength={5} 
                value={mounth}
                onChange={handleExpiryDateChange}
                />
            
          </div>
          <div className="form-group">
            <label htmlFor="statusPolicySelect">סטאטוס פוליסה:</label>
            <select
              id="statusPolicySelect"
              value={selectedStatusPolicy}
              onChange={(e) => setSelectedStatusPolicy(e.target.value)}
            >
              <option value="">בחר סטאטוס פוליסה</option>
              {statusPolicies.map((status, index) => (
                <option key={index} value={status}>{status}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="minuySochen" className="checkbox-label">מינוי סוכן:</label>
            <input
              type="checkbox"
              id="minuySochen"
              name="minuySochen"
              checked={minuySochen}
              onChange={(e) => setMinuySochen(e.target.checked)}
            />
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
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
        <h2>טבלת מידע מרוכז לסוכן</h2>
        {agentData.length > 0 ? (
          <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>שם פרטי לקוח</th>
                <th>שם משפחה לקוח</th>
                <th>תז לקוח</th>
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
        ) : (
          <p>No data available for the selected agent.</p>
        )}
      </div>
    </div>
  );
}
export default AgentForm;
