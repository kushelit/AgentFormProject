import { ChangeEventHandler, FormEventHandler, SetStateAction, useEffect, useMemo, useState } from "react";
import { collection, query,setDoc, where, getDocs,getDoc, addDoc, deleteDoc, doc, updateDoc,DocumentSnapshot, DocumentData } from "firebase/firestore";
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
    const [parentFullNameFilter, setParentFullNameFilter] = useState("");
    const [customerData, setCustomerData] = useState<any[]>([]);

    const [totalCommissions, setTotalCommissions] = useState({ totalCommissionHekef: 0, totalCommissionNifraim: 0 });
 
    const [showSelect, setShowSelect] = useState(false);
    const [selectedCustomers, setSelectedCustomers] = useState(new Set<string>());

    const [contracts, setContracts] = useState<Contract[]>([]);
    const [productMap, setProductMap] = useState<Record<string, string>>({});

const [birthday, setBirthday] = useState('');
const [phone, setPhone] = useState('');
const [mail, setMail] = useState('');
const [address, setAddress] = useState('');
const [parentFullName, setParentFullName] = useState('');

const [isMainCustomerSelected, setIsMainCustomerSelected] = useState(false);
const [mainCustomerId, setMainCustomerId] = useState<string | null>(null);

const handleBirthdayChange = (e: React.ChangeEvent<HTMLInputElement>) => setBirthday(e.target.value);
const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>)=>  setPhone(e.target.value);
const handleMailChange =(e: React.ChangeEvent<HTMLInputElement>)=> setMail(e.target.value);
const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>)=> setAddress(e.target.value);

const [mode, setMode] = useState('');  // '' (default), 'linking', 'disconnecting'
const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
const [isProcessing, setIsProcessing] = useState(false);

const [sourceValue, setSourceValue] = useState<string | null>('');
const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

const [sourceLeadList, setSourceLeadList] = useState<any[]>([]);
//const [sourceLead, setSourceLead] = useState<string | null>(null);


interface Suggestion {
  id: string;
  source: string; // or any other properties you need
}


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
  parentFullName: string;
  sourceValue:string;
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
  sourceValue:string;

};


interface Customer {
  firstNameCustomer: string;
  lastNameCustomer: string;
}

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
    
    

    // fetch customer function **
      const fetchCustomersForAgent = async (UserAgentId: string) => {
      const q = query(collection(db, 'customer'), where('AgentId', '==', UserAgentId));
      const querySnapshot = await getDocs(q);   
      // Use Promise.all to wait for all parent names to be fetched asynchronously
      const data = await Promise.all(querySnapshot.docs.map(async (docSnapshot) => {
        const customerData = docSnapshot.data() as CustomersTypeForFetching;  // Assuming CustomersTypeForFetching is your type for the data
        let parentFullName = ''; // Default to an empty string if no parent or not found   
        if (customerData.parentID) {
          if (customerData.parentID === docSnapshot.id) {
            // If the parentID is the same as the customer's own ID, use their own name as parentFullName
            parentFullName = `${customerData.firstNameCustomer || ''} ${customerData.lastNameCustomer || ''}`.trim();
          } else {
            // Fetch the parent's name if the parentID is different from the customer's ID
            const parentRef = doc(db, 'customer', customerData.parentID);
            const parentDoc = await getDoc(parentRef);
            if (parentDoc.exists()) {
              // Assume the parent's full name is stored in a field named 'firstNameCustomer'
              const parentData = parentDoc.data(); // Correct usage of .data()
              parentFullName = `${parentData.firstNameCustomer || ''} ${parentData.lastNameCustomer || ''}`.trim(); // Safely concatenate the names
            }
          }
        }  
        // Return the customer data with the parent's full name included
        return {
          ...customerData,
          id: docSnapshot.id,
          parentFullName  // Include the parent's full name in the returned object
        };
      }));    
      setCustomerData(data);  // Assuming you have a useState to hold this data
      console.log('data:', data);
    };



// filters function **
    useEffect(() => {
      let data = customerData.filter(item => {
        return (
             item.IDCustomer.includes(idCustomerFilter))&&
             (  item.firstNameCustomer.includes(firstNameCustomerFilter))&&
             (  item.lastNameCustomer.includes(lastNameCustomerFilter)) &&
             item.parentFullName.toLowerCase().includes(parentFullNameFilter.toLowerCase()); // Assuming the data includes a parentFullName field

      });
      setFilteredData(data);
    }, [customerData, idCustomerFilter, firstNameCustomerFilter, lastNameCustomerFilter, parentFullNameFilter]);
  


    //handle  fields function **
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
  
    //handle  fields function **
    const handleLastNameChange: ChangeEventHandler<HTMLInputElement> = (event) => {
      const value = event.target.value;
      // Allow Hebrew letters and spaces, but prevent leading or trailing spaces
      const hebrewRegex = /^[\u0590-\u05FF ]+$/;
      // Trim leading and trailing spaces for the test to prevent validation errors from extra spaces
      if (value === '' || hebrewRegex.test(value.trim())) {
        setlastNameCustomer(value);
      }
    };
  
    //handle  fields function **
    const handleIDChange: ChangeEventHandler<HTMLInputElement> = (e) => {
      const value = e.target.value;
      // Allow only numbers
      const onlyNums = value.replace(/[^0-9]/g, '').slice(0, 9);
      setIDCustomer(onlyNums);
    };
  
    //handle row selected function **
    const handleRowClick = (item: any) => {
      setSalesData([]);
      setTotalCommissions({ totalCommissionHekef: 0, totalCommissionNifraim: 0 }); // Resetting totalCommissions
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
      setSourceValue(item.sourceValue || '');
      console.log('SourceValue set' + sourceValue)
   //   if (item.parentID) {
  //     fetchFamilySales();
  //      }
    };
    
    useEffect(() => {
      if (selectedRow && selectedRow.parentID) {
          fetchFamilySales();
      }
  }, [selectedRow]); // React to changes in selectedRow


  // delete function ***
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
            sourceValue,
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

//reset function **
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
      setSourceValue('');
      setSuggestions([]);
    };
 const updateFullName = () => {
      setFullNameCustomer(`${firstNameCustomer} ${lastNameCustomer}`);
  };

  useEffect(() => {
    updateFullName();
}, [firstNameCustomer, lastNameCustomer]); 

// submit **
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
        sourceValue,
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


// can submit function **
const canSubmit = useMemo(() => (
  selectedAgentId.trim() !== '' &&
  firstNameCustomer.trim() !== '' &&
  lastNameCustomer.trim() !== '' &&
  IDCustomer.trim() !== '' 
  ), [selectedAgentId, firstNameCustomer, lastNameCustomer, IDCustomer, 
]);



  //const fetchParentCustomer = async (parentID:string) => {
  //if (!parentID) return; // Exit if no parentId provided
//  const docRef = doc(db, 'customer', parentID);
//  const docSnap = await getDoc(docRef);
//  if (docSnap.exists()) {
    // Assuming 'fullNameCustomer' is the field for the customer's full name
//    setParentFullName(docSnap.data().firstNameCustomer);
 // } else {
 //   console.log("No such document!");
 //   setParentFullName('');
//  }
//};


//useEffect(() => {
 // if (selectedRow) {
 //   fetchParentCustomer(selectedRow.parentID);
 //   console.log("selectedRow.parentID " + parentFullName);
 // }
//}, [selectedRow]);



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
  sumPremia?: number;
  sumTzvira?: number;
  totalCommissionHekef?: number;
  totalCommissionNifraim ?: number;
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


function calculatePremiaAndTzvira(sale: Sale) {
  let premia = 0;
  let tzvira = 0;

    premia = (
      ((parseInt(sale.insPremia) || 0) ) +
      ((parseInt(sale.pensiaPremia) || 0) ) +    
      ((parseInt(sale.finansimPremia) || 0) ) 
    );
    tzvira = (
      ((parseInt(sale.pensiaZvira) || 0) ) +
      ((parseInt(sale.finansimZvira) || 0) )
    );
  return {
    sumPremia: premia,
    sumTzvira:tzvira
  };
}




const fetchPrivateSales = async () => {
  if (!selectedRow) {
    console.log("No selected row available");
    return;
  }
  const salesRef = collection(db, "sales");
  const salesQuery = query(salesRef, where('IDCustomer', "==", selectedRow.IDCustomer), where('AgentId', "==", selectedAgentId), where('minuySochen', '==', false), where('statusPolicy', 'in', ['פעילה', 'הצעה']));
  try {
    const salesSnapshot = await getDocs(salesQuery);
    let totalCommissionHekef = 0;
    let totalCommissionNifraim = 0;
    const salesWithNames = await Promise.all(salesSnapshot.docs.map(async (salesDoc) => {
      const salesData = salesDoc.data();
     // const customerRef = doc(db, 'customer', salesData.IDCustomer);
     const customerQuery = query(collection(db, 'customer'), where('IDCustomer', '==', salesData.IDCustomer));
     const customerSnapshot = await getDocs(customerQuery);
     const customerData = customerSnapshot.docs[0]?.data();
      const data: Sale = {
        ...salesData,
        firstNameCustomer: customerData ? customerData.firstNameCustomer : "Unknown",
        lastNameCustomer: customerData ? customerData.lastNameCustomer : "Unknown",
        // Ensure all other required Sale properties are maintained
        IDCustomer: salesData.IDCustomer,
        product: salesData.product,
        company: salesData.company,
        month: salesData.mounth,
        status: salesData.status,
        insPremia: salesData.insPremia,
        pensiaPremia: salesData.pensiaPremia,
        pensiaZvira: salesData.pensiaZvira,
        finansimPremia: salesData.finansimPremia,
        finansimZvira: salesData.finansimZvira
      };
      const contractMatch = contracts.find(contract => contract.agentId === selectedAgentId && contract.product === data.product && contract.company === data.company);
      const commissions = calculateCommissions(data, contractMatch);
      totalCommissionHekef += commissions.commissionHekef;
      totalCommissionNifraim += commissions.commissionNifraim;
      const calcPrem = calculatePremiaAndTzvira(data);
      return { ...data, ...commissions, ...calcPrem };
    }));
    if (salesWithNames.length === 0) {
      alert("ללקוח זה אין מכירות");
    } else {
      setSalesData(salesWithNames);
      setTotalCommissions({ totalCommissionHekef, totalCommissionNifraim });
      console.log('totalCommissionHekef '+ totalCommissionHekef)
      console.log('totalCommissionNifraim '+ totalCommissionNifraim)


    }
  } catch (error) {
    console.error("Error fetching private sales data:", error);
    alert("Failed to fetch private sales data.");
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
    let totalCommissionHekef = 0;
    let totalCommissionNifraim = 0;
    const salesWithNames = await Promise.all(salesSnapshot.docs.map(async (salesDoc) => {
      const salesData = salesDoc.data();

      // Query the customer document for each sale to get the actual customer names
    
      const customerQuery = query(collection(db, 'customer'), where('IDCustomer', '==', salesData.IDCustomer));
      const customerSnapshot = await getDocs(customerQuery);
      const customerData = customerSnapshot.docs[0]?.data();

      const data: Sale = {
        ...salesData,
        firstNameCustomer: customerData ? customerData.firstNameCustomer : "Unknown",
        lastNameCustomer: customerData ? customerData.lastNameCustomer : "Unknown",
        IDCustomer: salesData.IDCustomer,
        product: salesData.product,
        company: salesData.company,
        month: salesData.mounth,
        status: salesData.status,
        insPremia: salesData.insPremia,
        pensiaPremia: salesData.pensiaPremia,
        pensiaZvira: salesData.pensiaZvira,
        finansimPremia: salesData.finansimPremia,
        finansimZvira: salesData.finansimZvira
      };

      const contractMatch = contracts.find(contract => contract.agentId === selectedAgentId && contract.product === data.product && contract.company === data.company);
      const commissions = calculateCommissions(data, contractMatch);
      totalCommissionHekef += commissions.commissionHekef;
      totalCommissionNifraim += commissions.commissionNifraim;
      const calcPrem = calculatePremiaAndTzvira(data);
      return { ...data, ...commissions, ...calcPrem };
    }));

    if (salesWithNames.length === 0) {
      alert("לללקוח זה אין מכירות");
    } else {
      setSalesData(salesWithNames);
      setTotalCommissions({ totalCommissionHekef, totalCommissionNifraim });
    }
  } catch (error) {
    console.error("Error fetching family sales data:", error);
    alert("Failed to fetch family sales data.");
  }
};



// one time update db customer from sales function **
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


// one time update db customer from sales function **
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


//starting function to handle family connection **
const cancelProcess = () => {
  setSelectedCustomers(new Set());  // Clear the selection
  setShowSelect(false);             // Hide the selection UI
  setIsMainCustomerSelected(false); // Reset this if you're tracking the main customer status
  setMode('normal');                // Reset to normal mode, assuming 'mode' is used to track the current UI state
};

const startLinkingProcess = () => {
  setMode('linking');
  setShowSelect(true);
  alert("בחר מבוטח ראשי");
};

const startDisconnectionProcess = () => {
  setMode('disconnecting');
  setShowSelect(true);
  alert("בחר מבוטח לניתוק קשר");
};

// confirm disconnect function **
    const confirmDisconnection = (customerId: string): void => {
      const confirmAction = window.confirm("האם לבטל קשר משפחתי ?");
      if (confirmAction) {
        disconnectCustomer(customerId);
      }
    }

   //disconnect function **
const disconnectCustomer = async (customerId: string): Promise<void> => {
  try {
    const customerDocRef = doc(db, 'customer', customerId);
    await updateDoc(customerDocRef, {
      parentID: customerId  // Resetting their parentID to their own ID effectively disconnects them.
    });
    alert("קשר משפחתי  נותק בהצלחה");
  } catch (error) {
    console.error("Failed to disconnect customer:", error);
    alert("כשלון בניתוק קשר משפחתי");
  } finally {
    setSelectedCustomers(new Set());  // Clear any selected customer ID
    fetchCustomersForAgent(selectedAgentId);  // Refresh the customer list
    setShowSelect(false);  // Optionally hide the selection UI
    // Reset any additional states or flags related to the process if necessary
    setMode('normal');  // Assuming you might have a mode state that needs to be reset
  }
}
    //handle function **
    const handleSelectCustomer = (id: string) => {
      const newSelection = new Set(selectedCustomers);
      if (mode === 'disconnecting') {
        setSelectedCustomers(new Set([id]));  // Directly select only one for disconnection
        confirmDisconnection(id);  // Optionally ask for confirmation right after selection
      } else if (mode === 'linking') {
    
      // If the main customer is not yet selected, or the selected ID is the current main customer
      if (!isMainCustomerSelected || id === mainCustomerId) {
          if (isMainCustomerSelected && id === mainCustomerId) {
              // If the main customer is clicked again, offer to deselect or switch main customer
              const confirmDeselect = confirm('זהו לקוח ראשי, האם אתה רוצה לבטל את הבחירה?');
              if (confirmDeselect) {
                  newSelection.clear(); // Clear all selections
                  setIsMainCustomerSelected(false); // No main customer is selected now
                  setMainCustomerId(null); // Clear the main customer ID
                  setSelectedCustomers(newSelection); // Update the state
                  return; // Exit the function after resetting
              }
          } else {
              // Set the clicked customer as the main customer
              newSelection.clear(); // Clear previous selections which might include old secondary selections
              newSelection.add(id); // Add this as the main customer
              setMainCustomerId(id); // Set the main customer ID
              setIsMainCustomerSelected(true); // A main customer is now selected
              alert('מבוטח ראשי הוגדר, כעת בחר מבוטחים משניים');
          }
      } else {
          // Handling secondary customers
          if (newSelection.has(id)) {
              newSelection.delete(id); // Deselect if already selected
          } else {
              newSelection.add(id); // Select if not already selected
          }
      }
      setSelectedCustomers(newSelection); // Update the selected customers state
    };
  }
  
    //// link function ***
    const linkSelectedCustomers = async () => {
      const ids = Array.from(selectedCustomers);
      if (ids.length > 0) {
        const mainCustomerId = ids[0];
        let familyConflict = false;
        let conflictingCustomerName = "";    
        const mainCustomerDocRef = doc(db, 'customer', mainCustomerId);
        const mainCustomerDoc = await getDoc(mainCustomerDocRef);
    
        if (mainCustomerDoc.exists()) {
          const mainCustomerData = mainCustomerDoc.data();   
          // Check if the main customer is already part of another family link
          if (mainCustomerData.parentID !== mainCustomerId) {
            alert(`הלקוח ${mainCustomerData.firstNameCustomer} כבר חלק מחיבור משפחתי אחר. יש לנתק את החיבור הקיים לפני הפיכתו ללקוח ראשי בחיבור חדש.`);
            console.log("Operation canceled due to existing parental connection.");
            return;  // Exit the function if the main customer is already linked
          }}
    
        // Check each secondary customer to ensure they are not already a main parent to other customers
        for (const customerId of ids.slice(1)) {  // Exclude the main customer
          const customerDocRef = doc(db, 'customer', customerId);
          const customerDoc = await getDoc(customerDocRef);   
          if (customerDoc.exists()) {
            const customerData = customerDoc.data();     
            const childCheckQuery = query(
              collection(db, 'customer'),
              where('AgentId', '==', customerData.AgentId),
              where('parentID', '==', customerId)  // Check if they are listed as a parent to other customers
            );
            const childCheckSnapshot = await getDocs(childCheckQuery);
            childCheckSnapshot.forEach((doc) => {
              if (doc.id !== customerId) {  // Ensure the document isn't the customer being their own parent
                familyConflict = true;
                conflictingCustomerName = customerData.firstNameCustomer;
                alert(`לא ניתן לחבר את הלקוח ${conflictingCustomerName} כלקוח משני מאחר שהוא כבר משמש כהורה בחיבור אחר.`);
                console.log("Operation canceled due to existing parental connection.");
                return;  // Exit from forEach and skip further processing
              }
            });
            if (familyConflict) {
              return;  // Exit the function if a conflict was found
            }
          }
        }
        for (const customerId of ids.slice(1)) { // Check secondary customers
          const customerDocRef = doc(db, 'customer', customerId);
          const customerDoc = await getDoc(customerDocRef);
    
          if (customerDoc.exists()) {
            const customerData = customerDoc.data();
            if (customerData.parentID && customerData.parentID !== customerId && customerData.parentID !== mainCustomerId) {
              familyConflict = true;
              conflictingCustomerName = customerData.firstNameCustomer;
              break;
            }
          }
        } 
        if (familyConflict) {
          const confirmTransfer = confirm(`הלקוח ${conflictingCustomerName} כבר מקושר למשפחה אחרת. האם ברצונך להעביר את כולם למשפחה חדשה?`);
          if (!confirmTransfer) {
            console.log("Operation canceled by the user.");
            return;
          }
        }
        for (const customerId of ids) {
          const customerDocRef = doc(db, 'customer', customerId);
          await updateDoc(customerDocRef, {
            parentID: mainCustomerId
          });
        }
        alert('קשר משפחתי הוגדר בהצלחה');
        setSelectedCustomers(new Set());
        setShowSelect(false);
        setIsMainCustomerSelected(false); // Reset the main customer selection flag
        setMainCustomerId(null); // Reset the main customer ID
        if (selectedAgentId) {
          fetchCustomersForAgent(selectedAgentId);
        }
      }
    };
    
 //   const fetchSuggestions = async (currentInputValue: unknown) => {
      // Assert that currentInputValue is a string
   //   const inputValue = currentInputValue as string;
    
   //   if (inputValue.length > 2) {
   //     const q = query(
   //       collection(db, 'customer'),
    //      where('AgentId', '==', selectedAgentId),
    //      where("sourceValue", ">=", inputValue),
    //      where("sourceValue", "<=", inputValue + '\uf8ff')
    //    );
    //    const querySnapshot = await getDocs(q);
    //    const suggestionList = querySnapshot.docs.map(doc => ({
     //     id: doc.id,
     //     source: doc.data().sourceValue  
    //    }));
    //    setSuggestions(suggestionList);
    //    console.log('suggestions ' +suggestions)
   //   } else {
    //    setSuggestions([]);
    //  }
   // };


  //  const handleInputSourceChange = (event: React.ChangeEvent<HTMLInputElement>) => {
   //   const newValue = event.target.value;
   //   setSourceValue(newValue);  
 //     fetchSuggestions(newValue);  
 //   };

    useEffect(() => {
      const fetchSourceLeadForAgent = async () => {
        if (!selectedAgentId) return; // Prevent running if selectedAgentId is not set
    
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
          setSourceLeadList(data); // Ensure this is the correct setter function name
          console.log('sourceLeadList:', data);
        } catch (error) {
          console.error('Error fetching source leads:', error);
        }
      };
    
      fetchSourceLeadForAgent();
    }, [selectedAgentId]); // Ensures the effect runs when selectedAgentId changes

    const handleSelectChange = (event: { target: { value: SetStateAction<string | null>; }; }) => {
      console.log("Selected value:", event.target.value);
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
      {/*         <tr>
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
               </tr>*/}
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
       <input
      type="text"
       placeholder="מבוטח אב"
       value={parentFullNameFilter}
       onChange={(e) => setParentFullNameFilter(e.target.value)}
/>
      </div>
       {/* First Frame 
        {agentData.length > 0 ? (*/}
        <div className="table-container" style={{ overflowX: 'auto', maxHeight: '300px' }}>      
      
<table>
      <thead>
        <tr>
          {showSelect && <th>Select</th>}
          <th>שם פרטי</th>
          <th>שם משפחה</th>
          <th>תז</th>
          <th>מבוטח אב</th>
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
            {showSelect  && (
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
            <td>{item.parentFullName || ''}</td> 
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
    <div className= "buttons-container" >  
    <div className="right-buttons">    
    <button type="button" onClick={() => showSelect ? cancelProcess() : startLinkingProcess()}>
  {showSelect ? "בטל קשר משפחתי" : "הוסף קשר משפחתי"}
</button>
<button type="button" onClick={() => showSelect ? cancelProcess() : startDisconnectionProcess()}>
  {showSelect ? "בטל ניתוק קשר משפחתי" : "נתק קשר משפחתי"}
</button>
{showSelect && (
  <>
    <button type="button" onClick={linkSelectedCustomers} disabled={selectedCustomers.size === 0}>אשר חיבור</button>   
  </>
)}
</div>
<div className="left-buttons">
        <button onClick={fetchPrivateSales} disabled={!selectedRow}> הפק דוח אישי</button>
        <button onClick={fetchFamilySales} disabled={!selectedRow}> הפק דוח משפחתי</button>    
        </div>
</div>
  <table>
  <thead>
    <tr>
      <th>שם פרטי</th>
      <th>שם משפחה</th>
      <th>תז</th>
      <th>מוצר</th>
      <th>חברה</th>
      <th>חודש תוקף</th>
      {detail!.role !== 'worker' && <th>פרמיה</th>}
      {detail!.role !== 'worker' && <th>צבירה</th>}
      {detail!.role !== 'worker' && <th>היקף</th>}
      {detail!.role !== 'worker' && <th>נפרעים</th>}
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
        {detail?.role !== 'worker' && <td>{sale.sumPremia}</td>}
      {detail?.role !== 'worker' && <td>{sale.sumTzvira}</td>}
        {detail?.role !== 'worker' && <td>{sale.commissionHekef}</td>}
      {detail?.role !== 'worker' && <td>{sale.commissionNifraim}</td>}
      </tr>
    ))}
      {detail?.role !== 'worker' && (
     <tr>
        <td colSpan={8} style={{ fontWeight: 'bold', textAlign: 'left' }} >סיכום עמלות</td>
        <td style={{ fontWeight: 'bold' }}>{totalCommissions.totalCommissionHekef.toLocaleString()} </td>
        <td style={{ fontWeight: 'bold' }}>{totalCommissions.totalCommissionNifraim.toLocaleString()}</td>
      </tr>
        )}
  </tbody>
</table>
</div>

      </div>
    </div>
);}
export default Customer