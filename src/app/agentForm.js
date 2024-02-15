"use client";
import React, { useState, useEffect } from 'react';
//import { agents } from './agentData';
import { db } from '../../firebase'; // Ensure this path is correct
import { collection, query, where, getDocs,doc, addDoc, deleteDoc,updateDoc  } from 'firebase/firestore';
import './AgentForm.css';


  function AgentForm() {
  const [selectedAgent, setSelectedAgent] = useState('');
  const agents = ['אילון', 'אלעד', 'ברק', 'יונתן']; // Your agents list
  const [firstNameCustomer, setfirstNameCustomer] = useState('');
  const [lastNameCustomer, setlastNameCustomer] = useState('');
  const [IDCustomer, setIDCustomer] = useState('');
  const [company, setcompany] = useState('');
  const [product, setproduct] = useState('');
  const [insPremia, setinsPremia] = useState('');
  const [pensiaPremia, setpensiaPremia] = useState('');
  const [ammount, setammount] = useState('');
  const [mounth, setmounth] = useState('');
  const [agentData, setAgentData] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);
 // Function to fetch data based on selected agent
 
 const fetchDataForAgent = async (agentName) => {
  // Create a query against the 'ship' collection where the 'agent' field matches 'agentName'
  const q = query(collection(db, 'ship'), where('agent', '==', agentName));

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

  // useEffect to call fetchDataForAgent when selectedAgent changes
  useEffect(() => {
    // Clear input fields when the selected agent changes
    setfirstNameCustomer('');
    setlastNameCustomer('');
    setIDCustomer('');
    setcompany('');
    setproduct('');
    setinsPremia('');
    setpensiaPremia('');
    setammount('');
    setmounth('');
    // Reset other input fields as needed
  
    // Then, if a new agent is selected, fetch the related data
    if (selectedAgent) {
      fetchDataForAgent(selectedAgent);
    }
  }, [selectedAgent]); // This effect depends on `selectedAgent`

  const handleAgentChange = (event) => {
    setSelectedAgent(event.target.value);
  };
  const handleRowHover = (item) => {
    setSelectedRow(item); // Store the selected row's data
    setfirstNameCustomer(item.firstNameCustomer);
    setlastNameCustomer(item.lastNameCustomer);
    setIDCustomer(item.IDCustomer);
    setcompany(item.company);
    setproduct(item.product);
    setinsPremia(item.insPremia);
    setpensiaPremia(item.pensiaPremia);
    setammount(item.ammount);
    setmounth(item.mounth);
    // Set other form fields as needed
  };
  const handleDelete = async () => {
    if (selectedRow && selectedRow.id) {
      await deleteDoc(doc(db, 'ship', selectedRow.id));
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
        const docRef = doc(db, 'ship', selectedRow.id); // Reference to the Firestore document
        await updateDoc(docRef, {
          firstNameCustomer,
          lastNameCustomer,
          IDCustomer,
          company,
          product,
          insPremia,
          pensiaPremia,
          ammount,
          mounth,
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
    setfirstNameCustomer(''); // Reset to default value
    setlastNameCustomer(''); // Reset to default value
    setIDCustomer(''); // Reset to default value
    setcompany(''); // Reset to default value
    setproduct(''); // Reset to default value
    setinsPremia(''); // Reset to default value
    setpensiaPremia(''); // Reset to default value
    setammount(''); // Reset to default value
    setmounth(''); // Reset to default value
    setSelectedRow(null); // Clear the selected row
  };
  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const docRef = await addDoc(collection(db, 'ship'), {
        agent: selectedAgent,
        firstNameCustomer: firstNameCustomer,
        lastNameCustomer: lastNameCustomer,
        IDCustomer: IDCustomer,
        company: company,
        product: product,
        insPremia: insPremia,
        pensiaPremia: pensiaPremia,
        ammount: ammount,
        mounth: mounth,
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

  return (
    <div className="content-container">
    <div className="form-container">
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="agentSelect">בחר סוכן</label>
        <select id="agentSelect" value={selectedAgent} onChange={handleAgentChange}>
          <option value="">בחר סוכן</option>
          {agents.map(agent => (
            <option key={agent} value={agent}>{agent}</option>
          ))}
        </select>
      </div>
      <div>
        <label>
          שם פרטי לקוח:
          <input type="text" value={firstNameCustomer} onChange={(e) => setfirstNameCustomer(e.target.value)} />
        </label>
      </div>
      <div>
        <label>
          שם משפחה לקוח:
          <input type="text" value={lastNameCustomer} onChange={(e) => setlastNameCustomer(e.target.value)} />
        </label>
      </div>
      <div>
        <label>
          תז לקוח:
          <input type="text" value={IDCustomer} onChange={(e) => setIDCustomer(e.target.value)} />
        </label>
      </div>
      <div>
        <label>
          חברה:
          <input type="text" value={company} onChange={(e) => setcompany(e.target.value)} />
        </label>
      </div>
      <div>
        <label>
          מוצר:
          <input type="text" value={product} onChange={(e) => setproduct(e.target.value)} />
        </label>
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
          צבירה פיננסים:
          <input type="text" value={ammount} onChange={(e) => setammount(e.target.value)} />
        </label>
      </div>
      <div>
        <label>
          חודש תפוקה:
          <input type="text" value={mounth} onChange={(e) => setmounth(e.target.value)} />
        </label>
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <button type="submit">הזן</button>
        <button type="button" disabled={selectedRow === null} onClick={handleDelete} >מחק</button>
       <button type="button" disabled={selectedRow === null} onClick={handleEdit}>ערוך</button>
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
          <th>צבירה פיננסים</th>
          <th>חודש תפוקה</th>
          {/* Add more titles as necessary */}
        </tr>
      </thead>
      <tbody>
        {agentData.map((item) => (
          <tr key={item.id} onMouseEnter={() => handleRowHover(item)}
          className={selectedRow && selectedRow.id === item.id ? 'selected-row' : ''} >
            <td>{item.firstNameCustomer}</td>
            <td>{item.lastNameCustomer}</td>
            <td>{item.IDCustomer}</td>
            <td>{item.company}</td>
            <td>{item.product}</td>
            <td>{item.insPremia}</td>
            <td>{item.pensiaPremia}</td>
            <td>{item.ammount}</td>
            <td>{item.mounth}</td>
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
