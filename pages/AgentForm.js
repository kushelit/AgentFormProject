"use client"
import React, { useState, useEffect } from 'react';
import { db } from '../firebase'; // Ensure this path is correct
import { collection, query, where, getDocs,doc, addDoc, deleteDoc,updateDoc  } from 'firebase/firestore';
import './AgentForm.css';
import Link from 'next/link';
import { useRouter } from 'next/router';


  function AgentForm() {
  const router = useRouter();
  const [selectedAgent, setSelectedAgent] = useState('');
  //const agents = ['אילון', 'אלעד', 'ברק', 'יונתן']; // Your agents list
  const [agents, setAgents] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [selectedWorker, setSelectedWorker] = useState('');
  const [firstNameCustomer, setfirstNameCustomer] = useState('');
  const [lastNameCustomer, setlastNameCustomer] = useState('');
  const [IDCustomer, setIDCustomer] = useState('');
 // const [company, setcompany] = useState('');
//const [product, setproduct] = useState('');
  const [insPremia, setinsPremia] = useState('');
  const [pensiaPremia, setpensiaPremia] = useState('');
  const [pensiaZvira, setPensiaZvira] = useState('');
  const [finansimPremia, setfinansimPremia] = useState('');
  const [finansimZvira, setFinansimZvira] = useState('');
  const [mounth, setmounth] = useState('');
  const [agentData, setAgentData] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [products, setProducts] = useState([]);
  const [minuySochen, setMinuySochen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [statusPolicies, setStatusPolicies] = useState([]);
  const [selectedStatusPolicy, setSelectedStatusPolicy] = useState('');

  useEffect(() => {
    const fetchAgentsAndSetSelected = async () => {
      // Fetch agents from your database
      const querySnapshot = await getDocs(collection(db, 'agents'));
      const agentsList = querySnapshot.docs.map(doc => doc.data().agentName);
      setAgents(agentsList);
  
      // After fetching agents, set the selected agent from the URL query
      if (router.query.selectedAgent) {
        setSelectedAgent(router.query.selectedAgent);
      }
    };
  
    // Ensure that this effect runs only once or whenever router is ready and the query parameter changes
    if (router.isReady) {
      fetchAgentsAndSetSelected();
    }
  }, [router.isReady, router.query.selectedAgent]);


const fetchDataForAgent = async (agentName) => {
  // Create a query against the 'sales' collection where the 'agent' field matches 'agentName'
  const q = query(collection(db, 'sales'), where('agent', '==', agentName));

  // Execute the query and get the snapshot of the resulting documents
  const querySnapshot = await getDocs(q);

  // Map over each document in the snapshot
  const data = querySnapshot.docs.map(doc => ({
    id: doc.id, // Include the Firestore document ID
    ...doc.data() // Spread the rest of the document data
  }));
  // Log the data for debugging purposes
  console.log(data);
  // Update the state with the fetched data, including each document's ID
  setAgentData(data);
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
  const fetchProducts = async () => {
    const querySnapshot = await getDocs(collection(db, 'product'));
    const productsList = querySnapshot.docs.map(doc => doc.data().productName); // Assuming the field name is 'productName'
    setProducts(productsList);
  };

  fetchProducts();
}, []);

  useEffect(() => {
    // Clear input fields when the selected agent changes
    setSelectedWorker('');
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
    setMinuySochen('');
    setSelectedStatusPolicy('');
    // Reset other input fields as needed
    // Then, if a new agent is selected, fetch the related data
    if (selectedAgent) {
      fetchDataForAgent(selectedAgent);
    }
  }, [selectedAgent]); // This effect depends on `selectedAgent`

  const handleAgentChange = async (event) => {
    const selectedAgentName = event.target.value; // Correctly define the selected agent name here
    setSelectedAgent(selectedAgentName);
    setWorkers([]);
  
    // Query for the selected agent document
    const agentsQuery = query(collection(db, 'agents'), where('agentName', '==', selectedAgentName));
    const querySnapshot = await getDocs(agentsQuery);
  
    // Assuming there's only one document per agent
    if (!querySnapshot.empty) {
      const agentDoc = querySnapshot.docs[0];
      const agentData = agentDoc.data();
  
      // Check if the 'workers' field exists and is an array
      if (Array.isArray(agentData.workers)) {
        setWorkers(agentData.workers);
      }
    } else {
      console.log("No matching agent found or workers field is missing");
    }
  };

const [hoveredRowId, setHoveredRowId] = useState(null);

  const handleRowClick  = (item) => {
    setSelectedRow(item); // Store the selected row's data
    setSelectedWorker(item.worker);
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
  };
  const handleDelete = async () => {
    if (selectedRow && selectedRow.id) {
      await deleteDoc(doc(db, 'sales', selectedRow.id));
      setSelectedRow(null); // Reset selection
      resetForm();
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
          worker: selectedWorker,
          firstNameCustomer,
          lastNameCustomer,
          IDCustomer,
          company:selectedCompany,
          product:selectedProduct,
          insPremia,
          pensiaPremia,
          pensiaZvira,
          finansimPremia,
          finansimZvira,
          mounth,
          minuySochen,
          statusPolicy: selectedStatusPolicy,
          // Include any additional fields as needed
        });
  
        console.log("Document successfully updated");
        setSelectedRow(null); // Reset selection
        resetForm(); // Clear the form fields
        // Optionally, refetch data to update the UI
        if (selectedRow.agent) {
          fetchDataForAgent(selectedRow.agent);
        }
      } catch (error) {
        console.error("Error updating document:", error);
        // Handle the error, e.g., show an error message to the user
      }
    } else {
      console.log("No row selected or missing document ID");
      // Handle the case where no row is selected or the selectedRow object doesn't contain an ID
    }
  };
  const resetForm = () => {
    setSelectedWorker('');
    setfirstNameCustomer(''); // Reset to default value
    setlastNameCustomer(''); // Reset to default value
    setIDCustomer(''); // Reset to default value
    setSelectedCompany(''); // Reset to default value
    setSelectedProduct(''); // Reset to default value
    setinsPremia(''); // Reset to default value
    setpensiaPremia(''); // Reset to default value
    setPensiaZvira('');
    setfinansimPremia(''); // Reset to default value
    setFinansimZvira('');
    setmounth(''); // Reset to default value
    setSelectedRow(null); // Clear the selected row
    setMinuySochen(false);
    setSelectedStatusPolicy('');
  };
  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const docRef = await addDoc(collection(db, 'sales'), {
        agent: selectedAgent,
        worker: selectedWorker,
        firstNameCustomer: firstNameCustomer,
        lastNameCustomer: lastNameCustomer,
        IDCustomer: IDCustomer,
        company: selectedCompany,
        product: selectedProduct,
        insPremia: insPremia,
        pensiaPremia: pensiaPremia,
        pensiaZvira:pensiaZvira,
        finansimPremia: finansimPremia,
        finansimZvira:finansimZvira,
        mounth: mounth,
        minuySochen:minuySochen,
        statusPolicy: selectedStatusPolicy,
      });
      console.log('Document written with ID:', docRef.id);
  
      // Use selectedAgent to refresh the table data, assuming selectedAgent holds the agent name
      if (selectedAgent) {
        fetchDataForAgent(selectedAgent);
      }
  
      // Optionally, reset form fields and any other relevant state here
    } catch (error) {
      console.error('Error adding document:', error);
    }
  };

  const handleFirstNameChange = (event) => {
    const value = event.target.value;
    const hebrewRegex = /^[\u0590-\u05FF]+$/;
  
    // If the value is empty or matches the Hebrew regex, update the state
    if (value === '' || hebrewRegex.test(value)) {
      setfirstNameCustomer(value);
    }
    // Otherwise, do not update the state, effectively rejecting the input
  };
  
  const handleLastNameChange = (event) => {
    const value = event.target.value;
    const hebrewRegex = /^[\u0590-\u05FF]+$/;
  
    // If the value is empty or matches the Hebrew regex, update the state
    if (value === '' || hebrewRegex.test(value)) {
      setlastNameCustomer(value);
    }
    // Otherwise, do not update the state, effectively rejecting the input
  };
  const handleIDChange = (e) => {
    const value = e.target.value;
    // Allow only numbers
    const onlyNums = value.replace(/[^0-9]/g, '').slice(0, 9);
    setIDCustomer(onlyNums);
  };
  
  function canSubmit() {
    return (
      selectedAgent.trim() !== '' &&
      selectedWorker.trim() !== '' &&
      firstNameCustomer.trim() !== '' &&
      lastNameCustomer.trim() !== '' &&
      IDCustomer.trim() !== '' &&
      selectedCompany.trim() !== '' &&
      selectedProduct.trim() !== ''
    );
  }
  useEffect(() => {
    const fetchStatus = async () => {
      const querySnapshot = await getDocs(collection(db, 'statusPolicy'));
      const statusList = querySnapshot.docs.map(doc => doc.data().statusName); // Assuming the field name is 'productName'
      setStatusPolicy(statusList);
    };
  
    fetchStatus();
  }, []);useEffect(() => {
    const fetchStatusPolicies = async () => {
      const querySnapshot = await getDocs(collection(db, 'statusPolicy'));
      const fetchedStatusPolicies = querySnapshot.docs.map(doc => doc.data().statusName); // Assuming the field name is 'statusName'
      setStatusPolicies(fetchedStatusPolicies);
    };
  
    fetchStatusPolicies();
  }, []);
  const handleExpiryDateChange = (e) => {
    let input = e.target.value.replace(/[^\d]/g, ''); // Remove non-digits
    let formattedInput = "";
  
    // Only process further if the input is not empty
    if (input.length > 0) {
      // If the first digit is greater than 1, prefix it with '0' and add a '/'
      if (input.length === 1 && parseInt(input, 10) > 1) {
        formattedInput = `0${input}/`;
      } else {
        // For other cases, format as MM/YY with '/' inserted appropriately
        formattedInput = input.substring(0, 2);
        if (input.length >= 2) {
          formattedInput += '/';
        }
        formattedInput += input.substring(2, 4);
      }
    }
  
    // Prevent exceeding the MM/YY format length
    if (formattedInput.length > 5) {
      formattedInput = formattedInput.substring(0, 5);
    }
  
    // Update the input field with the formatted value
    e.target.value = formattedInput;
  };

  

  return (
    <div className="content-container">
    <div className="form-container">
    <form onSubmit={handleSubmit}>
    <div>
    <Link href={`/summaryTable?agentName=${selectedAgent}`}>
    <a>דף מרכז</a>
   </Link>
   </div>
      <div>
      <label htmlFor="agentSelect">בחר סוכן</label>
      <select id="agentSelect" value={selectedAgent} 
      onChange={handleAgentChange}>
     <option value="">בחר סוכן</option>
     {agents.map((agentName, index) => (
    <option key={index} value={agentName}>{agentName}</option>
  ))}
        </select>
      </div>
      <div>
      <label>בחר עובד </label>
  <select value={selectedWorker} 
  onChange={(e) => setSelectedWorker(e.target.value)}>
  <option value="">בחר עובד</option>
  {workers.map((worker, index) => (
    <option key={index} value={worker}>{worker}</option> // Assuming 'worker' is a string. If it's an object, you might need to use worker.id or worker.name
  ))}
</select>
</div>
<div>
  <label>שם פרטי לקוח: </label>
  <input
    type="text"
    value={firstNameCustomer}
    onChange={handleFirstNameChange} // Fixed the typo here
    title="הזן אותיות בלבד"
  />
</div>
      <div>
        <label>
          שם משפחה לקוח:</label>
          <input type="text" 
          value={lastNameCustomer} 
          onChange={handleLastNameChange}
          title="הזן אותיות בלבד" />   
      </div>
      <div>
      <label>
        תז לקוח:
       <input
      type="text"
      inputMode="numeric" // Suggests a numeric keyboard on mobile devices
      maxLength="9" // Limits input length to 9 characters
      value={IDCustomer}
      onChange={handleIDChange}
     />
</label>
      </div>
      <div>
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
      <div>
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
      <div>
        <label>
          פרמיה ביטוח:
          <input type="text" value={insPremia} onChange={(e) => setinsPremia(e.target.value)} />
        </label>
      </div>
      <div>
        <label>
          פרמיה פנסיה:
          <input type="text" value={pensiaPremia} onChange={(e) => setpensiaPremia(e.target.value)} />
        </label>
      </div>
      <div>
        <label>
          צבירה פנסיה :
          <input type="text" value={pensiaZvira} onChange={(e) => setPensiaZvira(e.target.value)} />
        </label>
      </div>
      <div>
        <label>
          פרמיה פיננסים:
          <input type="text" value={finansimPremia} onChange={(e) => setfinansimPremia(e.target.value)} />
        </label>
      </div>
      <div>
        <label>
          צבירה פיננסים:
          <input type="text" value={finansimZvira} onChange={(e) => setFinansimZvira(e.target.value)} />
        </label>
      </div>
      <div>
      <label>
        תאריך תפוקה (MM/YY):
        <input type="text" id="expiryDate" name="expiryDate" placeholder="MM/YY" maxlength="5" 
        />

     </label>
      </div>
      <div>
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
      <div>
  <label htmlFor="minuySochen">מינוי סוכן:</label>
  <input
    type="checkbox"
    id="minuySochen"
    name="minuySochen"
    checked={minuySochen}
    onChange={(e) => setMinuySochen(e.target.checked)}
  />
</div>
      <div style={{ display: 'flex', gap: '10px' }}>
      <button type="submit" disabled={!canSubmit()}>
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
          onMouseEnter={() => setHoveredRowId(item.id)}minuySochen
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
            <td>{item.worker}</td>
            {/* Add more data fields as necessary */}
          </tr>
        ))}
      </tbody>
    </table>
  ) : (
    <p>No data available for the selected agent.</p>
        )}
      </div>
      </div> 
  );
}
export default AgentForm;
