/* eslint-disable react/jsx-no-comment-textnodes */
"use client"
import React, { useState, useEffect, FormEventHandler, ChangeEventHandler, ChangeEvent, useMemo, useCallback } from 'react';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs, doc, addDoc, deleteDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import './AgentForm.css';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from "@/hooks/useFetchAgentData"; 
import useSalesData from "@/hooks/useSalesData"; 
import useFetchMD from "@/hooks/useMD"; 
import useCalculateSalesData from "@/hooks/useCalculateGoalsSales"; 
import confetti from 'canvas-confetti';




//useFetchAgentData

function AgentForm() {
  const { user, detail } = useAuth();
  const { 
    agents, 
    selectedAgentId, 
    handleAgentChange, 
    workers, 
    selectedWorkerId,
    selectedWorkerName, 
    setSelectedWorkerName,
    setSelectedWorkerId, 
    selectedAgentName,
    handleWorkerChange , 
    companies,
    setCompanies,
    selectedCompany, 
    setSelectedCompany,
    selectedWorkerIdFilter,
    setSelectedWorkerIdFilter,
    selectedWorkerNameFilter,
    selectedCompanyFilter,
    setSelectedCompanyFilter,
    fetchWorkersForSelectedAgent,
    workerNameMap,
    selectedWorkerIdGoals,
    setSelectedWorkerIdGoals,
    selectedWorkerNameGoal, 
    setSelectedWorkerNameGoal,
    isLoadingAgent,
    setIsLoadingAgent
  } = useFetchAgentData();



  // const 
  // { monthlyTotals,
  //   overallFinansimTotal, overallPensiaTotal, overallInsuranceTotal, overallNiudPensiaTotal
  //  } = useSalesData(selectedAgentId, selectedWorkerId);

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
    setSelectedStatusPolicyFilter, 
    productGroupMap,
    formatIsraeliDateOnly
  } = useFetchMD();


  

  const {  goalData ,setGoalData, fetchDataGoalsForWorker,calculateDays } = useCalculateSalesData();


  const searchParams = useSearchParams();
  const [selectedAgent, setSelectedAgent] = useState('');
 // const [selectedWorker, setSelectedWorker]  = useState('');
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
  const [minuySochen, setMinuySochen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
const [idCustomerFilter, setIdCustomerFilter] = useState('');
const [firstNameCustomerFilter, setfirstNameCustomerFilter] = useState('');
const [lastNameCustomerFilter, setlastNameCustomerFilter] = useState('');
const [minuySochenFilter, setMinuySochenFilter] = useState('');
const [expiryDateFilter, setExpiryDateFilter] = useState('');
const [notes, setNotes] = useState('');

const [isLoading, setIsLoading] = useState(false);  // Loading state
const [submitDisabled, setSubmitDisabled] = useState(false);
const[isActiveGoals, setIsActiveGoals] = useState(true);

interface Customer {
  id: string;
  AgentId: string;
  firstNameCustomer: string;
  lastNameCustomer: string;
  IDCustomer: string;
  phone?: string;
  mail?: string;
  address?: string;
  // Add other customer fields as necessary
}

interface Sale {
  id: string;
  AgentId: string;
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
  notes: string;
  // Add other sale fields as necessary
}

interface CombinedData extends Sale {
  firstNameCustomer: string;
  lastNameCustomer: string;
  phone?: string;
  mail?: string;
  address?: string;
}

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
  notes: string; 
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
  notes: string; 
 
};

const [filteredData, setFilteredData] = useState<AgentDataType[]>([]);



const fetchDataForAgent = async (UserAgentId: string) => {
  if (!UserAgentId) {
    console.log('No agent selected for admin, skipping data fetch.');
    setAgentData([]); // Clear the table data when no agent is selected
    return;
  }
  const customerQuery = query(collection(db, 'customer'), where('AgentId', '==', UserAgentId));
  const customerSnapshot = await getDocs(customerQuery);
  const customers: Customer[] = customerSnapshot.docs.map(doc => ({
    ...doc.data() as Customer, 
    id: doc.id ,
    address: doc.data().address || "",  // הוספת `address` עם ערך ברירת מחדל
  }));

  const salesQuery = query(collection(db, 'sales'), where('AgentId', '==', UserAgentId));
  const salesSnapshot = await getDocs(salesQuery);
  const sales: Sale[] = salesSnapshot.docs.map(doc => ({
    ...doc.data() as Sale, 
    id: doc.id 
  }));

  const combinedData: CombinedData[] = sales.map(sale => {
    const customer = customers.find(customer => customer.IDCustomer === sale.IDCustomer);
    return {
      ...sale, 
      firstNameCustomer: customer ? customer.firstNameCustomer : 'Unknown',
      lastNameCustomer: customer ? customer.lastNameCustomer : 'Unknown',
      phone: customer ? customer.phone : '',  // הוספת טלפון
      mail: customer ? customer.mail : '',    // הוספת אימייל
      address: customer ? customer.address : '' // הוספת כתובת
    };
  });

  setAgentData(combinedData.sort((a, b) => {
    const [monthA, yearA] = a.mounth.split('/').map(Number);
    const [monthB, yearB] = b.mounth.split('/').map(Number);
    return (yearB + 2000) - (yearA + 2000) || monthB - monthA; // Adjust sort for descending order
  }));
};


  useEffect(() => {
   // setSelectedWorkerId('');
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
   // setSelectedWorkerId(item.workerId);
    //setSelectedWorkerName(item.workerName);
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
    setIsEditing(true);
    setNotes(item.notes);
    
    const workerName = workerNameMap[item.workerId];
    if (workerName) {
        setSelectedWorkerId(item.workerId);
        setSelectedWorkerName(workerName);
    } else {
        // Handle case where the worker is not found - maybe clear or set default values
        setSelectedWorkerId('');
        setSelectedWorkerName('Unknown Worker');
    }
    
  //  fetchWorkersForSelectedAgent(item.agentId).then(() => {
   //   const worker = workers.find(w => w.id === item.workerId);
   //   if (worker) {
   //     setSelectedWorkerId(worker.id);
   //     setSelectedWorkerName(worker.name);
  //    }
 //   }  );
  };

  const handleDelete = async () => {
    if (selectedRow && selectedRow.id) {
      await deleteDoc(doc(db, 'sales', selectedRow.id));
      setSelectedRow(null); // Reset selection
      resetForm();
      setIsEditing(false);
      if (selectedAgentId) {
        fetchDataForAgent(selectedAgentId);
      }
    } else {
      console.log("No selected row or row ID is undefined");

    }
  };
  const handleEdit = async () => {
    if (selectedRow && selectedRow.id) { 
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
          lastUpdateDate: serverTimestamp()
        
        });


        const customerQuery = query(collection(db, 'customer'), where('IDCustomer', '==', IDCustomer));
        const customerSnapshot = await getDocs(customerQuery);
        if (!customerSnapshot.empty) {
            const customerDocRef = customerSnapshot.docs[0].ref;
            await updateDoc(customerDocRef, {
                firstNameCustomer,
                lastNameCustomer,
            });
        }
      //  console.log("Sales and customer documents successfully updated");
        setSelectedRow(null); 
        resetForm();         
     //   if (selectedAgentId) {
          fetchDataForAgent(selectedAgentId);
    //    }
      } catch (error) {
        console.error("Error updating document:", error);     
      }
    } else {
      console.log("No row selected or missing document ID");
    }
  };

  
  const resetForm = () => {
    setSelectedWorkerId('');
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



    // Prepare the audio
    const celebrationSound = new Audio('/assets/sounds/soundEffect.mp3');


  const triggerConfetti = () => {
    confetti({
      particleCount: 300,  // A higher count for more confetti particles
      spread: 180,         // A wider spread
      startVelocity: 60,   // Higher initial velocity
      gravity: 1,        // Adjust gravity to make confetti fall slower
      ticks: 400,          // Longer duration before particles fade out
      origin: { x: 0.5, y: 0 }, // Origin at the top center of the page
      colors: ['#ff7f50', '#87cefa', '#daa520', '#32cd32', '#6a5acd'], // Multiple colors for a festive look
      shapes: ['circle', 'square'],  // Mix shapes for variety
      scalar: 1.8         // Larger pieces of confetti
    });
};
 

const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
  event.preventDefault();

  if (submitDisabled) return; // Prevent form submission if already processing

  setSubmitDisabled(true); // Disable the button to prevent multiple submissions

  try {
   // First, check if the customer exists in the customer collection
   const customerQuery = query(collection(db, 'customer'), where('IDCustomer', '==', IDCustomer),
   where('AgentId', '==', selectedAgentId)
  ) ;
   const customerSnapshot = await getDocs(customerQuery);

   let customerDocRef;
    if (customerSnapshot.empty) {
      // If customer doesn't exist, create a new customer record
      customerDocRef = await addDoc(collection(db, 'customer'), {
        AgentId: selectedAgentId,
        firstNameCustomer,
        lastNameCustomer,
        IDCustomer,
        parentID: '',  // Initially empty, to be updated below
        // Add other necessary customer fields here
      });
    //  console.log('Customer added with ID:', customerDocRef.id);
      // Update the parentID to the new customer ID, making the customer their own parent initially
      await updateDoc(customerDocRef, { parentID: customerDocRef.id });
   //   console.log('parentID updated to the new document ID');
    } else {
      // Optionally handle the case where customer already exists
      customerDocRef = customerSnapshot.docs[0].ref;
   //   console.log('Customer already exists:', customerDocRef.id);
    }
   //   console.log("got here");
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
      createdAt: serverTimestamp(), // Adds server timestamp
      lastUpdateDate: serverTimestamp() // Also set at creation
    });
    alert('יש!!! עוד עסקה נוספה');
//    console.log('Document written with ID:', docRef.id);
    resetForm(); 
    setIsEditing(false);
    if (selectedAgentId) {
      fetchDataForAgent(selectedAgentId);
    }
 // Trigger confetti on successful submission
    triggerConfetti();
  // Play the audio
    celebrationSound.play();

  } catch (error) {
    console.error('Error adding document:', error);
  } finally {
    setSubmitDisabled(false); // Re-enable the button after the process completes
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

  const [errors, setErrors] = useState({
    selectedAgentId: false,
    selectedWorkerId: false,
    firstNameCustomer: false,
    lastNameCustomer: false,
    IDCustomer: false,
    selectedCompany: false,
    selectedProduct: false,
    selectedStatusPolicy: false,
    mounth: false,
  });

  const validateFields = () => {
    setErrors({
      selectedAgentId: selectedAgentId.trim() === '',
      selectedWorkerId: selectedWorkerId.trim() === '',
      firstNameCustomer: firstNameCustomer.trim() === '',
      lastNameCustomer: lastNameCustomer.trim() === '',
      IDCustomer: IDCustomer.trim() === '',
      selectedCompany: selectedCompany.trim() === '',
      selectedProduct: selectedProduct.trim() === '',
      selectedStatusPolicy: selectedStatusPolicy.trim() === '',
      mounth: mounth.trim() === '',
    });
  };
  
  const canSubmit = useMemo(() => (
    selectedAgentId.trim() !== '' &&
    selectedWorkerId.trim() !== '' &&
    firstNameCustomer.trim() !== '' &&
    lastNameCustomer.trim() !== '' &&
    IDCustomer.trim() !== '' &&
    selectedCompany !== '' &&
    selectedProduct !== '' &&
    selectedStatusPolicy !== '' &&
    mounth.trim() !== ''
  ), [selectedAgentId, selectedWorkerId, firstNameCustomer, lastNameCustomer, IDCustomer, selectedCompany, selectedProduct, selectedStatusPolicy, mounth]);
  

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

  const handleExpiryDateChangeOld : ChangeEventHandler<HTMLInputElement> = (e) => {
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

  const handleExpiryDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.trim() !== '') {;
      setmounth(value);
    } else {
      setmounth('');
    }
  };

  const handleCompanyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedCompany(value);
  
    // בדיקה מחודשת של canSubmit אחרי שינוי הערך
    if (value !== '') {
      validateFields();
    }
  };
  

  const handleProductChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedProduct(value);
  
    // בדיקה מחודשת של canSubmit אחרי שינוי הערך
    if (value !== '') {
      validateFields();
    }
  };
  

  useEffect(() => {
    resetForm(); 
    if (selectedAgentId) {
      fetchDataForAgent(selectedAgentId);
    } else {
      setAgentData([]);  
    }
  }, [selectedAgentId]);
  
  useEffect(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
    const startOfMonth = `${currentYear}-${currentMonth}-01`;
    const endOfMonth = new Date(currentYear, now.getMonth() + 1, 0).toISOString().slice(0, 10);
    
    let expiryStart: string | undefined;
    let expiryEnd: string | undefined;

    if (expiryDateFilter) {
        const [filterMonth, filterYear] = expiryDateFilter.split('/');
        if (filterMonth && filterYear) {
            const fullYear = `20${filterYear}`; // Convert 'YY' to 'YYYY'
            expiryStart = `${fullYear}-${filterMonth}-01`;
            expiryEnd = new Date(Number(fullYear), Number(filterMonth), 0).toISOString().slice(0, 10); // Last day of the selected month
        }
    }

    let data = agentData.filter(item => {
      const itemMonth = item.mounth.slice(0, 7); // Extract "YYYY-MM" from "YYYY-MM-DD"


      return (
        (selectedWorkerIdFilter ? item.workerId === selectedWorkerIdFilter : true) &&
        (selectedCompanyFilter ? item.company === selectedCompanyFilter : true) &&
        (selectedProductFilter ? item.product === selectedProductFilter : true) &&
        item.IDCustomer.includes(idCustomerFilter) &&
        item.firstNameCustomer.includes(firstNameCustomerFilter) &&
        item.lastNameCustomer.includes(lastNameCustomerFilter) &&
        (minuySochenFilter === '' || item.minuySochen.toString() === minuySochenFilter) &&
        (!expiryDateFilter || 
          (expiryStart && expiryEnd && item.mounth >= expiryStart && item.mounth <= expiryEnd)) &&
        (selectedStatusPolicyFilter ? item.statusPolicy === selectedStatusPolicyFilter : true)
      );
    });
    data.sort((a, b) => {
      const dateA = new Date(a.mounth).getTime();  
      const dateB = new Date(b.mounth).getTime();  
      
      if (dateA !== dateB) {
        return dateB - dateA;
      } else {
        return a.IDCustomer.localeCompare(b.IDCustomer);
      }
    });   
    setFilteredData(data);
  }, [selectedWorkerIdFilter, selectedCompanyFilter, selectedProductFilter, selectedStatusPolicyFilter, agentData, idCustomerFilter, firstNameCustomerFilter, lastNameCustomerFilter, minuySochenFilter, expiryDateFilter]);



//   useEffect(() => {
//     const now = new Date();
//   const currentYear = now.getFullYear();
//   const currentMonth = (now.getMonth() + 1).toString().padStart(2, '0');
//   const startOfMonth = `${currentYear}-${currentMonth}-01`;
//   const endOfMonth = new Date(currentYear, now.getMonth() + 1, 0).toISOString().slice(0, 10);

//   // Parse expiryDateFilter if provided in MM/YY or MM format
//   let expiryStart: string | undefined = undefined;
//   let expiryEnd: string | undefined = undefined;
//   let filterMonth: string | undefined = undefined;
//   let filterYear: string | undefined = undefined;

//   if (expiryDateFilter) {
//       const parts = expiryDateFilter.split('/');
      
//       // If user entered MM/YY
//       if (parts.length === 2) {
//           filterMonth = parts[0].padStart(2, '0'); // Ensure MM format
//           filterYear = `20${parts[1]}`; // Assuming YY format like "24"
//           expiryStart = `${filterYear}-${filterMonth}-01`;
//           expiryEnd = new Date(Number(filterYear), Number(filterMonth), 0).toISOString().slice(0, 10);
//       } 
//       // If user entered only MM
//       else if (parts.length === 1) {
//           filterMonth = parts[0].padStart(2, '0');
//       }
//   }
//   let data = agentData.filter(item => {

//     const itemMonth = item.mounth.slice(0, 7); // Extract "YYYY-MM" from "YYYY-MM-DD"
//     // Default to current month if no expiryDateFilter is provided
//     const matchesDateFilter = expiryStart && expiryEnd 
//     ? item.mounth >= expiryStart && item.mounth <= expiryEnd // Filter by expiryStart and expiryEnd if both are defined
//     : filterMonth 
//         ? item.mounth.slice(5, 7) === filterMonth  // Match only the month, ignoring the year
//         : item.mounth >= startOfMonth && item.mounth <= endOfMonth; // Default to current month 
 
//     return (
//       (selectedWorkerIdFilter ? item.workerId === selectedWorkerIdFilter : true) &&
//       (selectedCompanyFilter ? item.company === selectedCompanyFilter : true) &&
//       (selectedProductFilter ? item.product === selectedProductFilter : true) &&
//       item.IDCustomer.includes(idCustomerFilter) &&
//       item.firstNameCustomer.includes(firstNameCustomerFilter) &&
//       item.lastNameCustomer.includes(lastNameCustomerFilter) &&
//       (minuySochenFilter === '' || item.minuySochen.toString() === minuySochenFilter) &&
//       matchesDateFilter &&
//       (selectedStatusPolicyFilter ? item.statusPolicy === selectedStatusPolicyFilter : true)
//     );
//   });
//   data.sort((a, b) => {
//     const dateA = new Date(a.mounth).getTime();  
//     const dateB = new Date(b.mounth).getTime();  
    
//     if (dateA !== dateB) {
//       return dateB - dateA;
//     } else {
//       return a.IDCustomer.localeCompare(b.IDCustomer);
//     }
//   });   
//   setFilteredData(data);
// }, [selectedWorkerIdFilter, selectedCompanyFilter, selectedProductFilter, selectedStatusPolicyFilter, agentData, idCustomerFilter, firstNameCustomerFilter, lastNameCustomerFilter, minuySochenFilter, expiryDateFilter]);




  const handleCalculate = useCallback(async () => {
    if (!selectedAgentId || selectedAgentId.trim() === '') {
    //  console.error('No agent selected');
        return;
    }
    if (!user || !user.uid || !detail || !detail.role) {
   //     console.error('User details not available');
        return; // Handle the situation where details are not available
    }
    setIsLoading(true); // Start loading

    const workerIdToFetch = (detail.role === 'worker' && !selectedWorkerIdGoals) ? user.uid : selectedWorkerIdGoals;
   // console.log('workerIdToFetch:', workerIdToFetch);
    if (!workerIdToFetch) {
      //  console.error('No worker selected');
        setIsLoading(false);
        return;
    }
    try {
    await fetchDataGoalsForWorker(selectedAgentId, isActiveGoals ,workerIdToFetch);
//    console.log('Data fetched and table data should be updated now');
  } catch (error) {
    console.error('Error during fetchDataGoalsForWorker:', error);
} finally {
    setIsLoading(false); 
}
  }, [selectedAgentId,isActiveGoals, user, detail, selectedWorkerIdGoals, fetchDataGoalsForWorker]);


useEffect(() => {
  // Ensure all necessary data is available before calling handleCalculate
  if (detail &&  user && (detail.role === 'worker' || detail.role === 'agent') && !selectedWorkerIdGoals) {
    // If the user is a worker and no filter is selected, use their own ID
    setSelectedWorkerIdGoals(user.uid);
  } else {
    handleCalculate();
  }
}, [handleCalculate, detail, user, selectedWorkerIdGoals]);
 

  return (
    <div className="content-container-AgentForm">

      <div className="form-container-AgentForm">
        <form onSubmit={handleSubmit}>
        <table>
          <thead>
            <tr>
            <th colSpan={2}>
                <div className="scrollable-tbody">
                  <h3></h3>
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
               <label htmlFor="agentSelect">סוכנות <span style={{ color: 'red', marginLeft: '5px' }}>*</span></label>
             </td>
             <td>
              <select 
             onChange={(e) => {
              handleAgentChange(e);
              validateFields();
            }}
              value={selectedAgentId} 
              onBlur={validateFields}
              className={errors.selectedAgentId ? 'input-error' : ''}
              >
                            {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
                            {agents.map(agent => (
                              <option key={agent.id} value={agent.id}>{agent.name}</option>
                            ))}
                        </select>              
                    </td>
                </tr>
                <tr>
                    <td>
                        <label htmlFor="workerSelect">עובד <span style={{ color: 'red', marginLeft: '5px' }}>*</span></label>
                    </td>
                    <td>
                     <select id="workerSelect" value={selectedWorkerId} 
                      onChange={(e) => {
                      handleWorkerChange(e, 'insert') ;
                      validateFields();
                    }}
                      onBlur={validateFields}
                      className={errors.selectedWorkerId ? 'input-error' : ''}
>
                            <option value="">בחר עובד</option>
                            {workers.map(worker => (
                                <option key={worker.id} value={worker.id}>{worker.name}</option>
                            ))}
                        </select>
                    </td>
                </tr>
                <tr>
                    <td>
                        <label>שם פרטי <span style={{ color: 'red', marginLeft: '5px' }}>*</span></label>
                    </td>
                    <td>
                        <input type="text" 
                        value={firstNameCustomer} 
                        onChange={(e) => {
                          handleFirstNameChange(e);
                          validateFields();
                        }}
                        onBlur={validateFields}
                        title="הזן אותיות בלבד"  
                        className={errors.firstNameCustomer ? 'input-error' : ''}
                        />
                    </td>
                </tr>
                <tr>
                    <td>
                        <label>שם משפחה <span style={{ color: 'red', marginLeft: '5px' }}>*</span></label>
                    </td>
                    <td>
                        <input type="text" 
                        value={lastNameCustomer} 
                        onChange={(e) => {
                          handleLastNameChange(e);
                          validateFields();
                        }}
                        onBlur={validateFields}
                        title="הזן אותיות בלבד"   
                        className={errors.lastNameCustomer ? 'input-error' : ''}
                        />
                    </td>
                </tr>
                <tr>
                    <td>
                        <label htmlFor="IDCustomer">תז <span style={{ color: 'red', marginLeft: '5px' }}>*</span></label>
                    </td>
                    <td>
                        <input type="text" 
                        inputMode="numeric" maxLength={9} 
                        value={IDCustomer} 
                        onChange={(e) => {
                          handleIDChange(e);
                          validateFields();
                        }}
                        onBlur={validateFields}
                        disabled={isEditing} 
                        className={errors.IDCustomer ? 'input-error' : ''}
                        />
                    </td>
                </tr>
                <tr>
                    <td>
                        <label htmlFor="companySelect">חברה <span style={{ color: 'red', marginLeft: '5px' }}>*</span></label>
                    </td>
                    <td>
                       <select
  id="companySelect"
  value={selectedCompany}
  onChange={handleCompanyChange}
  className={errors.selectedCompany ? 'input-error' : ''}>
  <option value="">בחר חברה</option>
  {companies.map((companyName, index) => (
    <option key={index} value={companyName}>
      {companyName}
    </option>
  ))}
</select>
                    </td>
                </tr>
                <tr>
                    <td>
                        <label htmlFor="productSelect">מוצר <span style={{ color: 'red', marginLeft: '5px' }}>*</span></label>
                    </td>
                    <td>
                    <select
  id="productSelect"
  value={selectedProduct}
  onChange={handleProductChange}
  className={errors.selectedProduct ? 'input-error' : ''}>
  <option value="">בחר מוצר</option>
  {products.map((product) => (
    <option key={product.id} value={product.name}>
      {product.name}
    </option>
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
                        <label htmlFor="expiryDate">תאריך תפוקה <span style={{ color: 'red', marginLeft: '5px' }}>*</span></label>
                    </td>
                    <td>
                        <input type="date" id="expiryDate" name="expiryDate"
                         value={mounth} 
                         onChange={(e) => {
                          handleExpiryDateChange(e);
                          validateFields();
                        }}
                        onBlur={validateFields}
                        className={errors.mounth ? 'input-error' : ''}
                      />
                    </td>
                </tr>
                <tr>
                    <td>
                        <label htmlFor="statusPolicySelect">סטאטוס פוליסה <span style={{ color: 'red', marginLeft: '5px' }}>*</span></label>
                    </td>
                    <td>
                        <select id="statusPolicySelect" value={selectedStatusPolicy}              
                      onChange={(e) => {
                        setSelectedStatusPolicy(e.target.value);
                        validateFields();
                      }}
                      onBlur={validateFields}
                      className={errors.selectedStatusPolicy ? 'input-error' : ''}>
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


                <tr>
              <td colSpan={2}>
                <div className="form-group button-group" style={{ display: 'flex' }}>
                  <button
                    type="submit"
                    disabled={!canSubmit || isEditing || submitDisabled}
                  >
                    הזן
                  </button>
                  <button
                    type="button"
                    disabled={selectedRow === null}
                    onClick={handleDelete}
                  >
                    מחק
                  </button>
                  <button
                    type="button"
                    disabled={selectedRow === null}
                    onClick={handleEdit}
                  >
                    עדכן
                  </button>
                  <button type="button" onClick={resetForm}>
                    נקה
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </form>
    </div>
  
      <div className="data-container-AgentForm">
      <h2>עמידה ביעדים</h2>
    <div className = "goalActive" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <select id="worker-select-goals" value={selectedWorkerIdGoals} 
       onChange={(e) => handleWorkerChange(e, 'goal')} disabled={!!(detail && detail.role === 'worker')}>
        <option value="">בחר עובד</option>
        <option value="all-agency">כל הסוכנות</option>
        {workers.map(worker => (
          <option key={worker.id} value={worker.id}>{worker.name}</option>
        ))}
      </select>
      <input type="checkbox" id="active-goals" name="active-goals"  
      checked={isActiveGoals} onChange={(e) => setIsActiveGoals(e.target.checked)} />
      <label htmlFor="active-goals">יעדים פעילים</label>
         </div>   
      <div className="select-container-AgentForm" >
            <table>
    <thead>
        <tr>
            <th>מבצע</th>
            <th>יעד</th>
            <th>ביצוע</th>
            <th>אחוז עמידה</th> 
           {/**  <th>זמן נותר</th>**/}
            <th>זמן עבר</th>
        </tr>
    </thead>
    <tbody>
        {isLoading ? (
            <tr>
                <td  colSpan={5}>Loading...</td>
            </tr>
        ) : goalData.length > 0 ? (
            goalData.map((item, index) => (
              
                <tr key={index}>
                    <td>{item.promotionName}</td>
                    <td>{`${item.amaunt.toLocaleString()} - ${item.goalTypeName}`}</td>
                    <td>
                      
                        {item.goalTypeName === "כוכבים" ?
                            <div>{item.totalStars ? `${item.totalStars}` : 'N/A'}
                            
                            </div> :
                            (item.totalPremia && Object.keys(item.totalPremia).length > 0 ?
                                Object.entries(item.totalPremia).map(([groupId, total]) => 
                                    <div key={groupId} >
                                  {typeof total === 'number' ? 
                        new Intl.NumberFormat('he-IL').format(Math.floor(total)) :
                                   'Invalid data'}
                                   </div>
                                ) : <div>No Data</div>
                            )
                        }
                    </td>
                    <td>
                        {item.achievementRate !== undefined ? (
                            <div style={{ width: '100%', backgroundColor: '#ddd' }}>
                                <div style={{
                                    height: '20px',
                                    width: `${Math.min(item.achievementRate, 100)}%`, // Cap the width at 100%
                                    backgroundColor: item.achievementRate >= 100 ? 'green' : 'orange',
                                    textAlign: 'center',
                                    lineHeight: '20px',
                                    color: 'white'
                                }}>
                                    {item.achievementRate.toFixed(2)}%
                                </div>
                            </div>
                        ) : 'N/A'}
                    </td>
                  {/**  <td>{item.daysLeft ?? 'No Data'}</td>*/}
                    <td>
    {/* Ensure calculateDays returns totalDuration and it's properly handled */}
    {item.daysPassed !== undefined &&  (item.totalDuration ?? 0) > 0 ? (
        <div style={{ width: '100%', backgroundColor: '#eee' }}
             title={`תאריך התחלה: ${item.startDate?.toLocaleDateString()} - תאריך סיום: ${item.endDate?.toLocaleDateString()}`}>
            <div style={{
                height: '20px',
                width: `${Math.min((item.daysPassed / (item.totalDuration ?? 0)) * 100, 100)}%`, // Cap at 100% width
                backgroundColor: item.daysPassed / (item.totalDuration ?? 0) >= 1 ? 'orange' : 'green', // Green if time passed exceeds or equals 100%, orange otherwise
                textAlign: 'center',
                lineHeight: '20px',
                color: 'white'
            }}>
                {Math.min((item.daysPassed /  (item.totalDuration ?? 0)) * 100, 100).toFixed(2)}% 
            </div>
        </div>
    ) : 'No Data'}
</td>
       </tr>
            ))
        ) : (
            <tr>
                <td colSpan={5}>No Data</td>
            </tr>
        )}
    </tbody>
</table> 
       
      </div>
       {/* First Frame 
        {agentData.length > 0 ? (*/}
          <div className="table-header" style={{ textAlign: 'right' }}>
       <h2>עסקאות</h2>
       </div>
         {/*        ) : <p>No data available for the selected agent.</p>} */}
           <div className="table-container-AgentForm" style={{ overflowX: 'auto', maxHeight: '300px' }}>
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
<div style={{ overflowX: 'auto', maxHeight: '300px' }}>
{isLoadingAgent && (
  <div className="spinner-overlay">
    <div className="spinner"></div>
  </div>
)}
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
                <th className="narrow-column">חודש תפוקה</th>
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
                  <td className="narrow-column">{item.mounth ? formatIsraeliDateOnly(item.mounth) : ""}</td>
                  <td>{item.statusPolicy}</td>
                  <td>{item.minuySochen ? 'כן' : 'לא'}</td>
                  <td>{item.workerName}</td>
                  {/* Add more data fields as necessary */}
                </tr>
              ))}
            </tbody>
          </table>
        
        </div>
       
      </div>
    </div>
    );
        }
export default AgentForm;

