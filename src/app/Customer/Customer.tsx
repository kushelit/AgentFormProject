import { ChangeEventHandler, FormEventHandler, SetStateAction, useEffect, useMemo, useState } from "react";
import { collection, query, where, getDocs,getDoc, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase"; // Ensure this path matches your project structure
import { useAuth } from '@/lib/firebase/AuthContext';
import Link from "next/link";
import useFetchMD from "@/hooks/useMD"; 
import './Customer.css';
import useFetchAgentData from "@/hooks/useFetchAgentData"; 


const Customer = () => {
   
    const [firstNameCustomer, setfirstNameCustomer] = useState('');
    const [lastNameCustomer, setlastNameCustomer] = useState('');
    const [fullNameCustomer, setFullNameCustomer] = useState('');

    const [IDCustomer, setIDCustomer] = useState('');
    const [parentID, setParentID] = useState('');

    const { user, detail } = useAuth();
    const [notes, setNotes] = useState('');
    const [selectedRow, setSelectedRow] = useState<any | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
    const [idCustomerFilter, setIdCustomerFilter] = useState('');
    const [firstNameCustomerFilter, setfirstNameCustomerFilter] = useState('');
    const [lastNameCustomerFilter, setlastNameCustomerFilter] = useState('');
    const [filteredData, setFilteredData] = useState<CustomerDataType[]>([]);
    const [customerData, setCustomerData] = useState<any[]>([]);
 

 const [showSelect, setShowSelect] = useState(false);
const [selectedCustomers, setSelectedCustomers] = useState(new Set<string>());



const [birthday, setBirthday] = useState('');
const [phone, setPhone] = useState('');
const [mail, setMail] = useState('');
const [address, setAddress] = useState('');

const handleBirthdayChange = (e) => setBirthday(e.target.value);
const handlePhoneChange = (e) => setPhone(e.target.value);
const handleMailChange = (e) => setMail(e.target.value);
const handleAddressChange = (e) => setAddress(e.target.value);

type CustomerDataType = {
  id: string;
  firstNameCustomer: string;
  lastNameCustomer: string;
  fullNameCustomer: string;
  IDCustomer: string;
  parentID: string;
  birthday: string; // Assuming date is stored as a string
  phone: string;
  mail: string;
  address: string;
};

    const { 
      agents, 
      selectedAgentId, 
      handleAgentChange, 
      selectedAgentName,
    } = useFetchAgentData();
  

    type CustomersTypeForFetching = {
      parentID: string;
      firstNameCustomer: string;
      lastNameCustomer: string;
      fullNameCustomer: string;
      IDCustomer: string; 
      notes: string; 
      birthday: string; 
      phone: string;
      mail: string;
      address: string;
    
    };
    
    useEffect(() => {
      if (selectedAgentId) {
        fetchCustomersForAgent(selectedAgentId);
      }
    }, [selectedAgentId]); 
    
    const fetchCustomersForAgent = async (UserAgentId: string) => {
      const q = query(collection(db, 'customer'), where('AgentId', '==', selectedAgentId));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({
        id: doc.id, // Assign id first
        ...(doc.data() as CustomersTypeForFetching) // Then spread the rest of the data
      }));
      setCustomerData(data);
      console.log ('data :' + data)
      console.log ('selectedAgentId :' + selectedAgentId)
    };
    

    useEffect(() => {
      let data = customerData.filter(item => {
        return (
             item.IDCustomer.includes(idCustomerFilter))&&
             (  item.firstNameCustomer.includes(firstNameCustomerFilter))&&
             (  item.lastNameCustomer.includes(lastNameCustomerFilter))
      });
      setFilteredData(data);
    }, [ customerData, idCustomerFilter, firstNameCustomerFilter, lastNameCustomerFilter]);
  

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
  

    const handleRowClick = (item: any) => {
      setSelectedRow(item); // Store the selected row's data
      setfirstNameCustomer(item.firstNameCustomer);
      setlastNameCustomer(item.lastNameCustomer);
      setFullNameCustomer(item.fullNameCustomer);
      setIDCustomer(item.IDCustomer);
      setParentID(item.parentID);
      setIsEditing(true);
      setNotes(item.notes);
      setBirthday(item.birthday);
      setPhone(item.phone);
      setMail(item.mail);
      setPhone(item.phone);
      setAddress(item.address);

    };
  
    const handleDelete = async () => {
      if (selectedRow && selectedRow.id) {
        await deleteDoc(doc(db, 'customer', selectedRow.id));
        setSelectedRow(null); // Reset selection
        resetForm();
        setIsEditing(false);
        if (selectedRow.agent) {
          fetchCustomersForAgent(selectedRow.agent);
        }
      } else {
        console.log("No selected row or row ID is undefined");
  
        // Fetch data again or remove the item from `agentData` state to update UI
      }
    };
    const handleEdit = async () => {
      if (selectedRow && selectedRow.id) {
        try {
          // Ensure partntID has a default value if it's undefined
      //    const effectiveParentID = parentID || IDCustomer;
    
          const docRef = doc(db, 'customer', selectedRow.id); 
          await updateDoc(docRef, {        
            firstNameCustomer,
            lastNameCustomer,
            fullNameCustomer,
            IDCustomer,
         //   parentID: effectiveParentID,
            notes: notes || '',
            birthday,
            phone,
            mail,
            address,
          });
    
          console.log("Document successfully updated");
          setSelectedRow(null); 
          resetForm();         
          if (selectedRow.agent) {
            fetchCustomersForAgent(selectedRow.agent);
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
      setfirstNameCustomer(''); 
      setfirstNameCustomer(''); 
      setlastNameCustomer(''); 
      setFullNameCustomer(''); 
      setIDCustomer(''); 
      setIsEditing(false);
      setParentID('');
      setNotes('');
      setParentFullName('')
      setPhone('');
      setMail('');
      setPhone('');
      setAddress('');
    };
  
   
    const updateFullName = () => {
      setFullNameCustomer(`${firstNameCustomer} ${lastNameCustomer}`);
  };

  useEffect(() => {
    updateFullName();
}, [firstNameCustomer, lastNameCustomer]); 




const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
  event.preventDefault();
  try {
    console.log("Preparing to submit...");
    const docRef = await addDoc(collection(db, 'customer'), {
      agent: selectedAgentName,
      AgentId: selectedAgentId,
      firstNameCustomer,
      lastNameCustomer,
      fullNameCustomer,
      IDCustomer,
      parentID: '', // Initially empty or set to a default value
      notes,
      birthday,
      phone,
      mail,
      address,
      
    });    
    console.log('Document written with ID:', docRef.id);

    // Update the document with its own ID as parentID if needed
    if (!parentID) { // Only set parentID if it's not already provided
      await updateDoc(doc(db, 'customer', docRef.id), { parentID: docRef.id });
      console.log('parentID updated to document ID');
    }

    resetForm(); 
    setIsEditing(false);
    if (selectedAgentId) {
      fetchCustomersForAgent(selectedAgentId);
    }
  } catch (error) {
    console.error('Error adding document:', error);
  }
};

const canSubmit = useMemo(() => (
  selectedAgentId.trim() !== '' &&
  firstNameCustomer.trim() !== '' &&
  lastNameCustomer.trim() !== '' &&
  IDCustomer.trim() !== '' 
  ), [selectedAgentId, firstNameCustomer, lastNameCustomer, IDCustomer, 
]);



const [parentFullName, setParentFullName] = useState('');

// Function to fetch parent customer details
const fetchParentCustomer = async (parentID:string) => {
  if (!parentID) return; // Exit if no parentId provided
  const docRef = doc(db, 'customer', parentID);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    // Assuming 'fullNameCustomer' is the field for the customer's full name
    setParentFullName(docSnap.data().fullNameCustomer);
  } else {
    console.log("No such document!");
    setParentFullName('');
  }
};

// Effect to fetch details whenever parentID changes
useEffect(() => {
  if (selectedRow) {
    fetchParentCustomer(selectedRow.parentID);
    console.log("selectedRow.parentID " + parentFullName);

  }
}, [selectedRow]);

const toggleSelectVisibility = () => {
  if (showSelect) {
    // Clear selected customers only when closing the select view
    setSelectedCustomers(new Set());
  }
  setShowSelect(!showSelect);
};

const handleSelectCustomer = (id: string) => {
  const newSelection = new Set(selectedCustomers);
  if (newSelection.has(id)) {
    newSelection.delete(id);
  } else {
    newSelection.add(id);
  }
  setSelectedCustomers(newSelection);
};

const linkSelectedCustomers = async () => {
  const ids = Array.from(selectedCustomers);
  if (ids.length > 0) {
    const mainCustomerId = ids[0];  // Assuming the first selected customer is the main one.
    for (const customerId of ids) {
      const customerDocRef = doc(db, 'customer', customerId);
      await updateDoc(customerDocRef, {
        parentID: mainCustomerId
      });
    }
    alert('קשר משפחתי הוגדר בהצלחה');
    // Reset the selected customers
    setSelectedCustomers(new Set());
    // Optionally, toggle visibility of the select column
    setShowSelect(false);
  }
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
  <td><label htmlFor="birthday">תאריך לידה</label></td>
  <td><input type="date" id="birthday" name="birthday" value={birthday} onChange={handleBirthdayChange} /></td>
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
                     <td>
                     <label htmlFor="parentID">מבוטח אב</label>
                    </td> 
                    <td>
                       <input
                       type="text"
                       placeholder="מבוטח אב"
                       value={parentFullName || ''}
                       readOnly // making it read-only if you just want to display the name
      />
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
      
      </div>
       {/* First Frame 
        {agentData.length > 0 ? (*/}
        <div className="table-container" style={{ overflowX: 'auto', maxHeight: '300px' }}>
        
        <button onClick={toggleSelectVisibility}> חיבור תא משפחתי</button>
        {showSelect && (
  <button 
    onClick={linkSelectedCustomers} 
    disabled={selectedCustomers.size === 0}
  >
    אשר חיבור
  </button>
)}    <table>
      <thead>
        <tr>
          {showSelect && <th>Select</th>}
          <th>שם פרטי</th>
          <th>שם משפחה</th>
          <th>תז</th>
          <th>תאריך לידה</th>
      <th>טלפון</th>
      <th>מייל</th>
      <th>כתובת</th>
        </tr>
      </thead>
      <tbody>
        {filteredData.map((item) => (
          <tr key={item.id}
              onClick={() => handleRowClick(item)}
              onMouseEnter={() => setHoveredRowId(item.id)}
              onMouseLeave={() => setHoveredRowId(null)}
              className={`${selectedCustomers.has(item.id) ? 'selected-row' : ''} ${hoveredRowId === item.id ? 'hovered-row' : ''}`}>
            {showSelect && (
              <td>
                <input
                  type="checkbox"
                  checked={selectedCustomers.has(item.id)}
                  onChange={() => handleSelectCustomer(item.id)}
                />
              </td>
            )}
            <td>{item.firstNameCustomer}</td>
            <td>{item.lastNameCustomer}</td>
            <td>{item.IDCustomer}</td>
            <td>{item.birthday}</td>
        <td>{item.phone}</td>
        <td>{item.mail}</td>
        <td>{item.address}</td>
          </tr>
        ))}
      </tbody>
    </table>

          </div>
  <div className="table-container" style={{ overflowX: 'auto', maxHeight: '300px' }}>
          <table>
  <thead>
    <tr>
      <th>עמודה</th>
      <th>עמודה</th>
      <th>עמודה</th>
      <th>עמודה</th>
    </tr>
  </thead>
  <tbody>
        <tr >
          <td>1</td>
          <td>2</td>
          <td>3</td>
          <td>4</td>
        </tr>
    <tr>
      <td>11</td>
      <td>22</td>
      <td>33</td>
      <td>44</td>
    </tr>
  </tbody>
</table> 
</div>

      </div>
    </div>
  );
        }
  
  export default Customer;