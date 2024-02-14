"use client";
import React, { useState, useEffect } from 'react';
//import { agents } from './agentData';
//console.log(agents);
import { db } from '../../firebase'; // Ensure this path is correct
//import { collection, addDoc } from 'firebase/firestore';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
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
    const q = query(collection(db, 'ship'), where('agent', '==', agentName));
    const querySnapshot = await getDocs(q);
    const data = querySnapshot.docs.map(doc => doc.data());
    console.log(data); // For debugging
    setAgentData(data); // Set fetched data to state
  };

  // useEffect to call fetchDataForAgent when selectedAgent changes
  useEffect(() => {
    if (selectedAgent) {
      fetchDataForAgent(selectedAgent);
    }
  }, [selectedAgent]);


  const handleAgentChange = (event) => {
    setSelectedAgent(event.target.value);
  };
  const handleRowHover = (rowData) => {
    setSelectedRow(rowData); // Store the selected row's data
    setfirstNameCustomer(rowData.firstNameCustomer);
    setlastNameCustomer(rowData.lastNameCustomer);
    setIDCustomer(rowData.setIDCustomer);
    setcompany(rowData.setcompany);
    setproduct(rowData.setproduct);
    setinsPremia(rowData.setinsPremia);
    setpensiaPremia(rowData.setpensiaPremia);
    setammount(rowData.setammount);
    setmounth(rowData.setmounth);
    // Set other form fields as needed
  };
  const handleDelete = async () => {
    if (selectedRow) {
      // Assuming selectedRow contains an 'id' field that's unique
      await deleteDoc(doc(db, 'ship', selectedRow.id));
      setSelectedRow(null); // Reset selection
      resetForm();
      // Fetch data again or remove the item from `agentData` state to update UI
    }
  };
  const handleEdit = async () => {
    if (selectedRow) {
      const docRef = doc(db, 'ship', selectedRow.id); // Get a reference to the document
      await updateDoc(docRef, {
        firstNameCustomer: firstNameCustomer,
        lastNameCustomer: lastNameCustomer,
        // Update other fields as needed
       
      });
      setSelectedRow(null); // Reset selection
      // Fetch data again or update the item in `agentData` state to update UI
      resetForm();
    }
  };
  const resetForm = () => {
    setFirstNameCustomer(''); // Reset to default value
    setLastNameCustomer(''); // Reset to default value
    setIDCustomer(''); // Reset to default value
    setCompany(''); // Reset to default value
    setProduct(''); // Reset to default value
    setInsPremia(''); // Reset to default value
    setPensiaPremia(''); // Reset to default value
    setAmmount(''); // Reset to default value
    setMounth(''); // Reset to default value
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
    } catch (error) {
      console.error('Error adding document:', error);
    }
  };

  return (
    <div className="content-container">
    <div className="form-container">
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="agentSelect">Select an Agent:</label>
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
      <div>
        <button type="submit">Submit</button>
        <button type="submit">Submit</button>
<button type="button" disabled={selectedRow === null} onClick={handleDelete}>Delete</button>
<button type="button" disabled={selectedRow === null} onClick={handleEdit}>Edit</button>
      </div>
    </form>
    </div>

    <div className="data-container">
    <h2>Agent Data</h2>
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
        {agentData.map((item, index) => (
          <tr key={index} onMouseEnter={() => handleRowHover(item)}>
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
