import { ChangeEventHandler, FormEventHandler, SetStateAction, useEffect, useMemo, useState } from "react";
import { collection, query,setDoc, where, getDocs,getDoc, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase"; // Ensure this path matches your project structure
import { useAuth } from '@/lib/firebase/AuthContext';
import Link from "next/link";
import useFetchMD from "@/hooks/useMD"; 
import './Customer.css';
import useFetchAgentData from "@/hooks/useFetchAgentData"; 
import React from 'react';



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

    const [contracts, setContracts] = useState<Contract[]>([]);
    const [productMap, setProductMap] = useState<Record<string, string>>({});

const [birthday, setBirthday] = useState('');
const [phone, setPhone] = useState('');
const [mail, setMail] = useState('');
const [address, setAddress] = useState('');

const handleBirthdayChange = (e: React.ChangeEvent<HTMLInputElement>) => setBirthday(e.target.value);
const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>)=>  setPhone(e.target.value);
const handleMailChange =(e: React.ChangeEvent<HTMLInputElement>)=> setMail(e.target.value);
const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>)=> setAddress(e.target.value);

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

    const { 
      agents, 
      selectedAgentId, 
      handleAgentChange, 
      selectedAgentName,
    } = useFetchAgentData();
  
 
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
      setfirstNameCustomer(item.firstNameCustomer || '');
      setlastNameCustomer(item.lastNameCustomer || '');
      setFullNameCustomer(item.fullNameCustomer || '');
      setIDCustomer(item.IDCustomer || '');
      setParentID(item.parentID || '');
      setIsEditing(true);
      setNotes(item.notes || '');
      setBirthday(item.birthday || '');
      setPhone(item.phone || '');
      setMail(item.mail || '');
      setAddress(item.address || '');
    };
    
  
    const handleDelete = async () => {
      if (selectedRow && selectedRow.id) {
        await deleteDoc(doc(db, 'customer', selectedRow.id));
        setSelectedRow(null); // Reset selection
        resetForm();
        setIsEditing(false);
        if (selectedAgentId) {
          fetchCustomersForAgent(selectedAgentId);
        }
      } else {
        console.log("No selected row or row ID is undefined");
      }
    };
    const handleEdit = async () => {
      if (selectedRow && selectedRow.id) {
        try {
          const docRef = doc(db, 'customer', selectedRow.id); 
          await updateDoc(docRef, {        
            firstNameCustomer,
            lastNameCustomer,
            fullNameCustomer,
            IDCustomer,
            notes: notes || '',
            birthday,
            phone,
            mail,
            address,
          });
          console.log("Document successfully updated");
          setSelectedRow(null); 
          resetForm();         
          if (selectedAgentId) {
            fetchCustomersForAgent(selectedAgentId);
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

    // Check for existing customer with the same IDCustomer and AgentId
    const customerQuery = query(collection(db, 'customer'), 
                                where('IDCustomer', '==', IDCustomer),
                                where('AgentId', '==', selectedAgentId));
    const customerSnapshot = await getDocs(customerQuery);

    if (customerSnapshot.empty) {
      // No existing customer found, proceed with creation
      const customerRef = doc(collection(db, 'customer'));

      // Create new customer document with self-referencing parentID
      await setDoc(customerRef, {
        agent: selectedAgentName,
        AgentId: selectedAgentId,
        firstNameCustomer,
        lastNameCustomer,
        fullNameCustomer,
        IDCustomer,
        parentID: customerRef.id,  // Self-reference the document's ID
        notes,
        birthday,
        phone,
        mail,
        address,
      });

      console.log('Customer added with ID:', customerRef.id);
      alert('לקוח חדש התווסף בהצלחה');

    } else {
      // Existing customer found, notify user
      console.log('Customer already exists with ID:', customerSnapshot.docs[0].id);
      alert('לא ניתן להוסיף - לקוח קיים במערכת');
    }
    resetForm(); 
    setIsEditing(false);  
    if (selectedAgentId) {
      fetchCustomersForAgent(selectedAgentId);
    }
  } catch (error) {
    console.error('Error adding document:', error);  // Log any errors during the process
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

  const fetchParentCustomer = async (parentID:string) => {
  if (!parentID) return; // Exit if no parentId provided
  const docRef = doc(db, 'customer', parentID);
  const docSnap = await getDoc(docRef);
  if (docSnap.exists()) {
    // Assuming 'fullNameCustomer' is the field for the customer's full name
    setParentFullName(docSnap.data().firstNameCustomer);
  } else {
    console.log("No such document!");
    setParentFullName('');
  }
};


useEffect(() => {
  if (selectedRow) {
    fetchParentCustomer(selectedRow.parentID);
    console.log("selectedRow.parentID " + parentFullName);
  }
}, [selectedRow]);

const toggleSelectVisibility = () => {
  if (showSelect) {
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
    const mainCustomerId = ids[0];
    let familyConflict = false; // To track if there's any family conflict
    let conflictingCustomerName = ""; // To store the name of the conflicting customer

    // First, check if any selected customer is already linked to a different family
    for (const customerId of ids) {
      const customerDocRef = doc(db, 'customer', customerId);
      const customerDoc = await getDoc(customerDocRef);

      if (customerDoc.exists()) {
        const customerData = customerDoc.data();
        if (customerData.parentID && customerData.parentID !== customerId && customerData.parentID !== mainCustomerId) {
          // If any customer is already linked, capture the name and note a conflict
          familyConflict = true;
          conflictingCustomerName = customerData.firstNameCustomer; // Assuming 'firstNameCustomer' is the field name
          break; // No need to check further, one conflict is enough to prompt user
        }
      }
    }

    // If a conflict was found, ask for user confirmation
    if (familyConflict) {
      const confirmTransfer = confirm(`הלקוח ${conflictingCustomerName} כבר מקושר למשפחה אחרת. האם ברצונך להעביר את כולם למשפחה חדשה?`);
      if (!confirmTransfer) {
        console.log("Operation canceled by the user.");
        return; // User chose not to proceed, exit the function
      }
    }

    // If user confirms, or no conflicts were found, update all selected customers
    for (const customerId of ids) {
      const customerDocRef = doc(db, 'customer', customerId);
      await updateDoc(customerDocRef, {
        parentID: mainCustomerId
      });
    }
    alert('קשר משפחתי הוגדר בהצלחה');

    // Reset the selected customers and update UI as needed
    setSelectedCustomers(new Set());
    setShowSelect(false);
    if (selectedAgentId) {
      fetchCustomersForAgent(selectedAgentId);
    }
  }
};

interface Contract {
  id: string;
  company: string;
  product: string;
  productsGroup: string;
  agentId: string;
  commissionNifraim: number;
  commissionHekef: number;
  commissionNiud: number;
}

interface Product {
  productName: string;
  productGroup: string;
  // Add other fields as necessary
}


useEffect(() => {
  const fetchContracts = async () => {
    const snapshot = await getDocs(collection(db, 'contracts'));
    const fetchedContracts: Contract[] = snapshot.docs.map(doc => ({
      id: doc.id,
      company: doc.data().company,
      product: doc.data().product,
      productsGroup: doc.data().productsGroup,
      agentId: doc.data().AgentId,
      commissionNifraim: doc.data().commissionNifraim,
      commissionHekef: doc.data().commissionHekef,
      commissionNiud: doc.data().commissionNiud
    }));
    setContracts(fetchedContracts);
  };

  fetchContracts();
}, []);


useEffect(() => {
  const fetchProducts = async () => {
    const querySnapshot = await getDocs(collection(db, 'product'));
    const productMapping: Record<string, string> = {}; // More specific type than {}
    querySnapshot.forEach((doc) => {
      const productData = doc.data() as Product; 
      productMapping[productData.productName] = productData.productGroup;
    });
    setProductMap(productMapping);
  };

  fetchProducts();
}, []);


interface Sale {
  firstNameCustomer: string;
  lastNameCustomer: string;
  IDCustomer: string;
  product: string;
  company: string;
  month: string;
  status: string;
  insPremia: string;      
  pensiaPremia: string;
  pensiaZvira: string;
  finansimPremia: string;
  finansimZvira: string;
  commissionHekef?: number;  
  commissionNifraim?: number;
}

const [salesData, setSalesData] = useState<Sale[]>([]);

function calculateCommissions(sale: Sale, contractMatch: any) {
  let commissionHekef = 0;
  let commissionNifraim = 0;

  if (contractMatch) {
    commissionHekef = (
      ((parseInt(sale.insPremia) || 0) * contractMatch.commissionHekef / 100 * 12) +
      ((parseInt(sale.pensiaPremia) || 0) * contractMatch.commissionHekef / 100 * 12) +
      ((parseInt(sale.pensiaZvira) || 0) * contractMatch.commissionNiud / 100) +
      ((parseInt(sale.finansimPremia) || 0) * contractMatch.commissionHekef / 100 * 12) +
      ((parseInt(sale.finansimZvira) || 0) * contractMatch.commissionNiud / 100)
    );

    commissionNifraim = (
      ((parseInt(sale.insPremia) || 0) * contractMatch.commissionNifraim / 100) +
      ((parseInt(sale.pensiaPremia) || 0) * contractMatch.commissionNifraim / 100) +
      ((parseInt(sale.finansimZvira) || 0) * contractMatch.commissionNifraim / 100 / 12)
    );
  } else {
    const productGroup = productMap[sale.product];
    const groupMatch = contracts.find(contract =>
      contract.productsGroup === productGroup &&
      contract.agentId === selectedAgentId
    );
    if (groupMatch) {
      commissionHekef = (
        ((parseInt(sale.insPremia) || 0) * groupMatch.commissionHekef / 100 * 12) +
        ((parseInt(sale.pensiaPremia) || 0) * groupMatch.commissionHekef / 100 * 12) +
        ((parseInt(sale.pensiaZvira) || 0) * groupMatch.commissionNiud / 100) +
        ((parseInt(sale.finansimPremia) || 0) * groupMatch.commissionHekef / 100 * 12) +
        ((parseInt(sale.finansimZvira) || 0) * groupMatch.commissionNiud / 100)
      );

      commissionNifraim = (
        ((parseInt(sale.insPremia) || 0) * groupMatch.commissionNifraim / 100) +
        ((parseInt(sale.pensiaPremia) || 0) * groupMatch.commissionNifraim / 100) +
        ((parseInt(sale.finansimZvira) || 0) * groupMatch.commissionNifraim / 100 / 12)
      );
    } else {
      commissionNifraim = 0;
      commissionHekef = 0;
    }
  }
  return {
    commissionHekef: Math.round(commissionHekef),
    commissionNifraim: Math.round(commissionNifraim)
  };
}


const fetchPrivateSales = async () => {
  if (!selectedRow) {
    console.log("No selected row available");
    return;
  }
  const salesRef = collection(db, "sales");
  const q = query(salesRef, where('IDCustomer', "==", selectedRow.IDCustomer), where('AgentId', "==", selectedAgentId), where('minuySochen', '==', false), where('statusPolicy', 'in', ['פעילה', 'הצעה']));
  try {
    const querySnapshot = await getDocs(q);
    const salesWithCommissions = querySnapshot.docs.map(doc => {
      const data: Sale = {
        firstNameCustomer: doc.data().firstNameCustomer,
        lastNameCustomer: doc.data().lastNameCustomer,
        IDCustomer: doc.data().IDCustomer,
        product: doc.data().product,
        company: doc.data().company,
        month: doc.data().month,
        status: doc.data().status,
        insPremia: doc.data().insPremia,
        pensiaPremia: doc.data().pensiaPremia,
        pensiaZvira: doc.data().pensiaZvira,
        finansimPremia: doc.data().finansimPremia,
        finansimZvira: doc.data().finansimZvira,
      };

      const contractMatch = contracts.find(contract => contract.agentId === selectedAgentId && contract.product === data.product && contract.company === data.company);
      const commissions = calculateCommissions(data, contractMatch);
      return { ...data, ...commissions };  // Combine the sale data with the calculated commissions
    });
    setSalesData(salesWithCommissions);
  } catch (error) {
    console.error("Error fetching private sales data:", error);
  }
};

const fetchFamilySales = async () => {
  if (!selectedRow || !selectedRow.parentID) {
    console.log("No selected row or parent ID available");
    return;
  }

  const customerRef = collection(db, "customer");
  const customerQuery = query(customerRef, where("parentID", "==", selectedRow.parentID));
  const customerSnapshot = await getDocs(customerQuery);
  const customerIDs = customerSnapshot.docs.map(doc => doc.data().IDCustomer);

  const salesRef = collection(db, "sales");
  const salesQuery = query(salesRef, where("IDCustomer", "in", customerIDs), where('minuySochen', '==', false), where('statusPolicy', 'in', ['פעילה', 'הצעה']));
  try {
    const salesSnapshot = await getDocs(salesQuery);
    const salesWithCommissions = salesSnapshot.docs.map(doc => {
      const data: Sale = {
        firstNameCustomer: doc.data().firstNameCustomer,
        lastNameCustomer: doc.data().lastNameCustomer,
        IDCustomer: doc.data().IDCustomer,
        product: doc.data().product,
        company: doc.data().company,
        month: doc.data().month,
        status: doc.data().status,
        insPremia: doc.data().insPremia,
        pensiaPremia: doc.data().pensiaPremia,
        pensiaZvira: doc.data().pensiaZvira,
        finansimPremia: doc.data().finansimPremia,
        finansimZvira: doc.data().finansimZvira,
      };
      const contractMatch = contracts.find(contract => contract.agentId === selectedAgentId && contract.product === data.product && contract.company === data.company);
      const commissions = calculateCommissions(data, contractMatch);
      return { ...data, ...commissions };  // Combine the data with calculated commissions
    });
    setSalesData(salesWithCommissions);
  } catch (error) {
    console.error("Error fetching family sales data:", error);
  }
};

//*** no del **one time running- function to add customer from sales ** no del **
const [isProcessing, setIsProcessing] = useState(false);

  const handleCreateCustomers = async () => {
        if (isProcessing) return;  // Prevent running while already processing
        setIsProcessing(true);
        try {
            await createCustomersFromSales(); // Function that processes the sales data
           alert('Customers created successfully from sales data!');
        } catch (error) {
            console.error('Error creating customers:', error);
            alert('Failed to create customers from sales data.');
        }
        setIsProcessing(false);
    };

    const createCustomersFromSales = async () => {
      const salesRef = collection(db, "sales");
      const salesSnapshot = await getDocs(salesRef);
    
      for (const doc of salesSnapshot.docs) {
        const saleData = doc.data();
        if (!saleData.AgentId) {
          console.error('Missing AgentId for sale:', doc.id);
          continue; // Skip this iteration if AgentId is undefined
        }
    
        const customerQuery = query(collection(db, 'customer'), where('IDCustomer', '==', saleData.IDCustomer),
        where('AgentId', '==', saleData.AgentId));
        const customerSnapshot = await getDocs(customerQuery);
    
        if (customerSnapshot.empty) {
          try {
            const customerDocRef = await addDoc(collection(db, 'customer'), {
              AgentId: saleData.AgentId,
              firstNameCustomer: saleData.firstNameCustomer,
             lastNameCustomer: saleData.lastNameCustomer,
              IDCustomer: saleData.IDCustomer,
              parentID: ''
            });
            console.log('Customer added with ID:', customerDocRef.id);
    
            await updateDoc(customerDocRef, { parentID: customerDocRef.id });
            console.log('parentID updated to the new document ID');
          } catch (error) {
            console.error('Error adding customer:', error);
         }
        }
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
            <button type="button" onClick={toggleSelectVisibility}> חיבור תא משפחתי</button>
            
         {/*     <button onClick={handleCreateCustomers} disabled={isProcessing}>
                    {isProcessing ? 'Processing...' : 'Create Customers From Sales'}
                </button>  */}
       
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
       
        {showSelect && (
        <button type="button"  onClick={linkSelectedCustomers} disabled={selectedCustomers.size === 0}>אשר חיבור</button>   
        )}    
        <button onClick={fetchPrivateSales} disabled={!selectedRow}> הפק דוח אישי</button>
        <button onClick={fetchFamilySales} disabled={!selectedRow}> הפק דוח משפחתי</button>

       
<table>
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
      <th>שם פרטי</th>
      <th>שם משפחה</th>
      <th>תז</th>
      <th>מוצר</th>
      <th>חברה</th>
      <th>חודש תוקף</th>
      {detail!.role !== 'worker' && <th>נפרעים</th>}
      {detail!.role !== 'worker' && <th>צבירה</th>}
    </tr>
  </thead>
  <tbody>
    {salesData.map((sale, index) => (
      <tr key={index}>
        <td>{sale.firstNameCustomer}</td>
        <td>{sale.lastNameCustomer}</td>
        <td>{sale.IDCustomer}</td>
        <td>{sale.product}</td>
        <td>{sale.company}</td>
        <td>{sale.month}</td>
        {detail?.role !== 'worker' && <td>{sale.commissionHekef}</td>}
      {detail?.role !== 'worker' && <td>{sale.commissionNifraim}</td>}
      </tr>
    ))}
  </tbody>
</table>
</div>

      </div>
    </div>
);}
export default Customer