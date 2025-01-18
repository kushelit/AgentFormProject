/* eslint-disable react/jsx-no-comment-textnodes */

import React, { useState, useEffect, FormEventHandler, ChangeEventHandler, ChangeEvent, useMemo, useCallback } from 'react';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs, doc, addDoc, deleteDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from "@/hooks/useFetchAgentData"; 
import useSalesData from "@/hooks/useSalesData"; 
import useFetchMD from "@/hooks/useMD"; 
import useCalculateSalesData from "@/hooks/useCalculateGoalsSales"; 
import confetti from 'canvas-confetti';
import { useDesignFlag } from  "@/hooks/useDesignFlag";
import MenuWrapper from "@/components/MenuWrapper/MenuWrapper";
import Edit from '@/components/icons/Edit/Edit'; 
import Delete  from '@/components/icons/Delete/Delete'; 
import TableFooter from "@/components/TableFooter/TableFooter";
import Search from "@/components/Search/Search";
import './NewAgentForm.css';
import { Button } from "@/components/Button/Button";
import {ProgressBar} from "@/components/ProgressBar/ProgressBar";

//useFetchAgentData

const NewAgentForm: React.FC = () => {
  const { user, detail } = useAuth();
 
  const isNewDesignEnabled = useDesignFlag();
  const [showOpenNewDeal, setShowOpenNewDeal] = useState(false);

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


const [menuOpen, setMenuOpen] = useState<string | null>(null);
const [editingRow, setEditingRow] = useState<string | null>(null);
const [editData, setEditData] = useState<Partial<AgentDataType>>({}); 
const [filteredData, setFilteredData] = useState<AgentDataType[]>([]);

const [openMenuRow, setOpenMenuRow] = useState(null);

// ניהול העמוד הנוכחי
const [currentPage, setCurrentPage] = useState(1);
const rowsPerPage = 8; // מספר השורות בעמוד

// חישוב הנתונים לעמוד הנוכחי
const indexOfLastRow = currentPage * rowsPerPage;
const indexOfFirstRow = indexOfLastRow - rowsPerPage;
const currentRows = filteredData.slice(indexOfFirstRow, indexOfLastRow);

// שינוי עמוד
const handlePageChange = (pageNumber: number) => {
  setCurrentPage(pageNumber);
};


interface Customer {
  id: string;
  AgentId: string;
  firstNameCustomer: string;
  lastNameCustomer: string;
  IDCustomer: string;
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


const handleEditRow = (id: string) => {
  setEditingRow(id);
  const rowData = filteredData.find((item) => item.id === id);
  if (rowData) {
    setEditData({ ...rowData });
  }
  setMenuOpen(null); // סגירת התפריט
};

const handleDeleteRow = (id: string) => {
  const updatedData = filteredData.filter((item) => item.id !== id);
  setFilteredData(updatedData);
  setMenuOpen(null); // סגירת התפריט
};

const saveChanges = () => {
  const updatedData = filteredData.map((item) =>
    item.id === editingRow ? { ...item, ...editData } : item
  );
  setFilteredData(updatedData);
  setEditingRow(null); // יציאה ממצב עריכה
};

const handleEditChange = (field: keyof AgentDataType, value: string | number | boolean) => {
  setEditData((prev) => ({
    ...prev,
    [field]: value,
  }));
};




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
    id: doc.id 
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

  const canSubmit = useMemo(() => (
     selectedAgentId.trim() !== '' &&
     selectedWorkerId.trim() !== '' &&
     firstNameCustomer.trim() !== '' &&
     lastNameCustomer.trim() !== '' &&
     IDCustomer.trim() !== '' &&
     selectedCompany.trim() !== '' &&
     selectedProduct.trim() !== '' &&
     selectedStatusPolicy.trim() !== '' &&
    mounth.trim() !== ''
  ), [selectedAgentId, selectedWorkerId, firstNameCustomer, lastNameCustomer, IDCustomer, 
    selectedCompany, selectedProduct, mounth]);


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

  const handleExpiryDateChange = (e: React.ChangeEvent<HTMLInputElement>) => setmounth(e.target.value);
  
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
 
const menuItems = (rowId:string) => [
  {
    label: "ערוך",
    onClick: () => handleEditRow(rowId),
    Icon: Edit,
  },
  {
    label: "מחק",
    onClick: () => handleDeleteRow(rowId),
    Icon: Delete,
  },
];
;

const [openModalId, setOpenModalId] = useState<string | number | null>(null);
const [modalContent, setModalContent] = useState<string | null>(null);

const handleShowMore = (fullText: string, id: string | number): void => {
  setModalContent(fullText); // כעת טיפוס תואם
  setOpenModalId(id); // טיפוס תואם
};

const closeModal = (): void => {
  setModalContent(null); // מאפס את התוכן
  setOpenModalId(null); // מאפס את המודאל
};



  return (
<div className="content-container-NewAgentForm">  
<div className={`table-container-AgentForm-new-design`}>
<div className="table-header">
  <div className="table-title">ניהול עסקאות</div>
  <Button
    onClick={() => setShowOpenNewDeal(true)}
    text="הוסף עסקה"
    type="primary"
    icon="on"
    state="default"
  />
</div>
      <div className="filter-inputs-container-new">
             <div className="filter-select-container">
             <select onChange={handleAgentChange} value={selectedAgentId} className="select-input">
              {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
              {detail?.role === 'admin' && <option value="all">כל הסוכנות</option>}
              {agents.map(agent => (
               <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
             </select>
               </div>
               <div className="filter-select-container">
              <select id="worker-select" value={selectedWorkerIdFilter} 
              onChange={(e) => handleWorkerChange(e, 'filter')}  className="select-input">
              <option value="">כל העובדים</option>
             {workers.map(worker => (
                 <option key={worker.id} value={worker.id}>{worker.name}</option>
               ))}
             </select>   
              </div>
              <div className="filter-select-container">
             <select id="company-Select" value={selectedCompanyFilter} onChange={(e) => setSelectedCompanyFilter(e.target.value)} className="select-input">
               <option value="">בחר חברה</option>
               {companies.map((companyName, index) => (
               <option key={index} value={companyName}>{companyName}</option>
               ))}
              </select>
             </div>
             <div className="filter-select-container">
              <select id="product-Select" value={selectedProductFilter} onChange={(e) => setSelectedProductFilter(e.target.value)} className="select-input">
               <option value="">בחר מוצר</option>
              {products.map(product => (
             <option key={product.id} value={product.name}>{product.name}</option>
                ))}
               </select>
             </div>
             <div className="filter-select-container">
        <select
           id="status-PolicySelect"
            value={selectedStatusPolicyFilter}
            onChange={(e) => setSelectedStatusPolicyFilter(e.target.value)} className="select-input">
            <option value="">סטאטוס פוליסה</option>
                            {statusPolicies.map((status, index) => (
                                <option key={index} value={status}>{status}</option>
               ))}
               </select>
              </div>
             <div className="filter-input-container">
              <Search className="filter-input-icon" />
              <input
             type="text"
               placeholder="שם פרטי"
                value={firstNameCustomerFilter}
               onChange={(e) => setfirstNameCustomerFilter(e.target.value)}
               className="filter-input"
                />
              </div>
            <div className="filter-input-container">
            <Search className="filter-input-icon" />
              <input
             type="text"
              placeholder="שם משפחה"
               value={lastNameCustomerFilter}
             onChange={(e) => setlastNameCustomerFilter(e.target.value)}
              className="filter-input"
                />
               </div>
             <div className="filter-input-container">
              <Search className="filter-input-icon" />
              <input
             type="text"
              placeholder="תז לקוח"
              value={idCustomerFilter}
              onChange={(e) => setIdCustomerFilter(e.target.value)}
              className="filter-input"
               />
             </div>
               <div className="filter-datePicker-container">
                <input
              type="date"
              id="expiry-Date"
            name="expiry-Date"
            value={expiryDateFilter}
             onChange={(e) => setExpiryDateFilter(e.target.value)}
            className="datePicker-input"
             />
           </div>
              <div className="filter-checkbox-container">
              <label>
             <input
               type="checkbox"
              checked={minuySochenFilter === "true"}
              onChange={(e) => setMinuySochenFilter(e.target.checked ? "true" : "")}
             className="checkbox-input"
               />
               מינוי סוכן
                </label>
                </div> 
      </div>
      <div  className="table-Deal-container">
        {isLoadingAgent && (
                   <div className="spinner-overlay">
                      <div className="spinner"></div>
                  </div>
                )}
       <div className={`table-Data-AgentForm ${isNewDesignEnabled ? 'is-new-design' : ''}`}>
                <table>
                  <thead>
                    <tr>
                 <th className="medium-column">שם פרטי </th>
                   <th className="medium-column">שם משפחה</th>
                    <th className="wide-column">תז</th>
                  <th className="medium-column">חברה</th>
                    <th className="medium-column">מוצר</th>
                  <th className="medium-column">פרמיה ביטוח</th>
                 <th className="medium-column">פרמיה פנסיה</th>
                  <th className="medium-column">צבירה פנסיה</th>
                 <th className="medium-column">פרמיה פיננסים</th>
                 <th className="medium-column">צבירה פיננסים</th>
                <th className="wide-column">חודש תפוקה</th>
                 <th className="medium-column">סטאטוס</th>
                  <th className="narrow-column">מינוי סוכן</th>
                  <th className="narrow-column">שם עובד</th>
                  <th className="wide-column">הערות</th>
                 <th className="narrow-cell">🔧</th>
               </tr>
            </thead>
                  <tbody>
                {currentRows.map((item) => (
             <tr key={item.id}>
            <td className="narrow-column">
               {editingRow === item.id ? (
                <input
                 type="text"
            value={editData.firstNameCustomer || ""}
            onChange={(e) => handleEditChange("firstNameCustomer", e.target.value)}
                />
              ) : (
             item.firstNameCustomer
           )}
            </td>
            <td className="narrow-column">
               {editingRow === item.id ? (
          <input
            type="text"
            value={editData.lastNameCustomer || ""}
            onChange={(e) => handleEditChange("lastNameCustomer", e.target.value)}
          />
        ) : (
          item.lastNameCustomer
        )}
      </td>
      <td className="narrow-column">
        {editingRow === item.id ? (
          <input
            type="text"
            value={editData.IDCustomer || ""}
            onChange={(e) => handleEditChange("IDCustomer", e.target.value)}
          />
        ) : (
          item.IDCustomer
        )}
      </td>
      <td className="narrow-column">
        {editingRow === item.id ? (
          <select
            value={editData.company || ""}
            onChange={(e) => handleEditChange("company", e.target.value)}
          >
            <option value="">בחר חברה</option>
            {companies.map((company) => (
              <option key={company} value={company}>
                {company}
              </option>
            ))}
          </select>
        ) : (
          item.company
        )}
      </td>
      <td className="narrow-column">
        {editingRow === item.id ? (
          <select
            value={editData.product || ""}
            onChange={(e) => handleEditChange("product", e.target.value)}
          >
            <option value="">בחר מוצר</option>
            {products.map((product) => (
              <option key={product.id} value={product.name}>
                {product.name}
              </option>
            ))}
          </select>
        ) : (
          item.product
        )}
      </td>
      <td className="narrow-column">
        {editingRow === item.id ? (
          <input
            type="number"
            value={editData.insPremia || 0}
            onChange={(e) => handleEditChange("insPremia", Number(e.target.value))}
          />
        ) : (
          item.insPremia
        )}
      </td>
      <td className="narrow-column">
        {editingRow === item.id ? (
          <input
            type="number"
            value={editData.pensiaPremia || 0}
            onChange={(e) => handleEditChange("pensiaPremia", Number(e.target.value))}
          />
        ) : (
          item.pensiaPremia
        )}
      </td>
      <td className="narrow-column">
        {editingRow === item.id ? (
          <input
            type="number"
            value={editData.pensiaZvira || 0}
            onChange={(e) => handleEditChange("pensiaZvira", Number(e.target.value))}
          />
        ) : (
          item.pensiaZvira
        )}
      </td>
      <td className="narrow-column">
        {editingRow === item.id ? (
          <input
            type="number"
            value={editData.finansimPremia || 0}
            onChange={(e) => handleEditChange("finansimPremia", Number(e.target.value))}
          />
        ) : (
          item.finansimPremia
        )}
      </td>
      <td className="narrow-column">
        {editingRow === item.id ? (
          <input
            type="number"
            value={editData.finansimZvira || 0}
            onChange={(e) => handleEditChange("finansimZvira", Number(e.target.value))}
          />
        ) : (
          item.finansimZvira
        )}
      </td>
      <td className="medium-column">
        {editingRow === item.id ? (
          <input
            type="date"
            value={editData.mounth || ""}
            onChange={(e) => handleEditChange("mounth", e.target.value)}
            />
          ) : item.mounth ? (
            formatIsraeliDateOnly(item.mounth)
          ) : (
            ""
          )}
        </td>
      <td className="narrow-column">
        {editingRow === item.id ? (
          <select
            value={editData.statusPolicy || ""}
            onChange={(e) => handleEditChange("statusPolicy", e.target.value)}
          >
            <option value="">בחר סטטוס</option>
            {statusPolicies.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        ) : (
          item.statusPolicy
        )}
      </td>
      <td className="small-column">
        {editingRow === item.id ? (
          <input
            type="checkbox"
            checked={editData.minuySochen || false}
            onChange={(e) => handleEditChange("minuySochen", e.target.checked)}
          />
        ) : (
          item.minuySochen ? "כן" : "לא"
        )}
      </td>
      <td className="narrow-column">
  {editingRow === item.id ? (
    <select
      value={editData.workerName || ""}
      onChange={(e) => handleEditChange("workerName", e.target.value)}
    >
      <option value="">בחר עובד</option>
      {workers.map((worker) => (
        <option key={worker.id} value={worker.name}>
          {worker.name}
        </option>
      ))}
    </select>
  ) : (
    item.workerName
  )}
</td>
<td className="notes-column wide-column">
  <span className="notes-preview">
    {item.notes.length > 5 ? `${item.notes.substring(0, 5)}...` : item.notes}
  </span>
  {item.notes.length > 5 && (
    <button
    className="show-more-btn"
    onClick={() => handleShowMore(item.notes, item.id)}
  >
    הצג עוד
  </button>
  )}
  {editingRow === item.id && (
    <input
      type="text"
      value={editData.notes || ""}
      onChange={(e) => handleEditChange("notes", e.target.value)}
    />
  )}
  {openModalId === item.id && (
    <div className="inline-modal">
      <p>{modalContent}</p>
      <button className="close-btn" onClick={closeModal}>
  סגור
</button>
    </div>
  )}
</td>
<td className="narrow-cell">
<MenuWrapper
  rowId={item.id}
  openMenuRow={openMenuRow}
  setOpenMenuRow={setOpenMenuRow}
  menuItems={menuItems(item.id)} 
/>
</td>
    </tr>
  ))}
</tbody>
<tfoot>
      <tr>
      <td colSpan={16}>
              <TableFooter
                currentPage={currentPage}
                totalPages={Math.ceil(filteredData.length / rowsPerPage)}
                onPageChange={handlePageChange}
              />
               </td>
              </tr>
           </tfoot>
           </table>
         </div>
      </div>
      </div> 
      <div className="data-container-Goals">
  {/* כותרת */}
  <div className="table-header-Goal" style={{ textAlign: 'right' }}>
    <div className="table-Goal-title">עמידה ביעדים</div>
  </div>
  {/* בחירת עובד */}
  <div className="goal-Worker">
    <select
      id="worker-select-goals"
      value={selectedWorkerIdGoals}
      onChange={(e) => handleWorkerChange(e, 'goal')}
      disabled={!!(detail && detail.role === 'worker')}
    >
      <option value="">בחר עובד</option>
      <option value="all-agency">כל הסוכנות</option>
      {workers.map((worker) => (
        <option key={worker.id} value={worker.id}>
          {worker.name}
        </option>
      ))}
    </select>
  </div>
  {/* צ'קבוקס של יעדים פעילים */}
  <div className="goalActive">
    <input
      type="checkbox"
      id="active-goals"
      name="active-goals"
      checked={isActiveGoals}
      onChange={(e) => setIsActiveGoals(e.target.checked)}
    />
    <label htmlFor="active-goals">יעדים פעילים</label>
  </div>
  {/* יעדים */}
  <div className="goals-container">
    {isLoading ? (
      <p>Loading...</p>
    ) : goalData.length > 0 ? (
      goalData.map((item, index) => (
        <div className="goal-card" key={index}>
          {/* כותרת היעד */}
          <h3>{item.promotionName}</h3>
          <p>
  <span className="goal-label">יעד:</span>
  <div>{`${item.amaunt.toLocaleString()} - ${item.goalTypeName}`}</div>
</p>
          {/* ביצועים */}
          <div className="goal-performance">
            <p><span className="goal-label">ביצוע:</span> </p>
            {item.goalTypeName === "כוכבים" ? (
              <div>{item.totalStars ? `${item.totalStars}` : 'N/A'}</div>
            ) : item.totalPremia && Object.keys(item.totalPremia).length > 0 ? (
              Object.entries(item.totalPremia).map(([groupId, total]) => (
                <div key={groupId}>
                  {typeof total === 'number'
                    ? new Intl.NumberFormat('he-IL').format(Math.floor(total))
                    : 'Invalid data'}
                </div>
              ))
            ) : (
              <div>אין מידע</div>
            )}
          </div>
        {/* אחוז עמידה */}
<div className="goal-progress">
<h4>אחוז עמידה</h4>
  {item.achievementRate !== undefined ? (
    <ProgressBar
      state={item.achievementRate >= 100 ? "complete" : item.achievementRate >= 50 ? "progress" : "low"}
      percentage={Math.min(item.achievementRate, 100)}
      className="achievement-bar"
    />
  ) : (
    <div>אין מידע</div>
  )}
</div>
{/* זמן עבר */}
<div className="goal-time">
<h4>זמן עבר</h4>
     {/* state={(item.daysPassed / item.totalDuration) >= 1 ? "high" : "time"}*/}
  {item.daysPassed !== undefined && item.totalDuration !== undefined && item.totalDuration > 0 ? (
    <ProgressBar
      state="time" // תמיד יהיה כחול כהה
      percentage={Math.min((item.daysPassed / item.totalDuration) * 100, 100)}
      className="time-bar"
    />
  ) : (
    <div>אין מידע</div>
  )}
</div>
        </div>
      ))
    ) : (
      <p>אין מידע</p>
    )}
  </div>
</div>
        {showOpenNewDeal && (
<div className="modal-overlay" onClick={() => setShowOpenNewDeal(false)}>
   <div
          className="modal-content"
          onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal
        >
   <div className="form-container-AgentForm">
            <form onSubmit={handleSubmit}>
              <table>
                {/* כל תוכן הטופס */}
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
                        <label htmlFor="workerSelect">עובד <span style={{ color: 'red', marginLeft: '5px' }}>*</span></label>
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
                        <label>שם פרטי <span style={{ color: 'red', marginLeft: '5px' }}>*</span></label>
                    </td>
                    <td>
                        <input type="text" value={firstNameCustomer} onChange={handleFirstNameChange} title="הזן אותיות בלבד" />
                    </td>
                </tr>
                <tr>
                    <td>
                        <label>שם משפחה <span style={{ color: 'red', marginLeft: '5px' }}>*</span></label>
                    </td>
                    <td>
                        <input type="text" value={lastNameCustomer} onChange={handleLastNameChange} title="הזן אותיות בלבד" />
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
                        onChange={handleIDChange} 
                        disabled={isEditing}  />
                    </td>
                </tr>
                <tr>
                    <td>
                        <label htmlFor="companySelect">חברה <span style={{ color: 'red', marginLeft: '5px' }}>*</span></label>
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
                        <label htmlFor="productSelect">מוצר <span style={{ color: 'red', marginLeft: '5px' }}>*</span></label>
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
                        <label htmlFor="expiryDate">תאריך תפוקה <span style={{ color: 'red', marginLeft: '5px' }}>*</span></label>
                    </td>
                    <td>
                        <input type="date" id="expiryDate" name="expiryDate" value={mounth} onChange={handleExpiryDateChange} />
                    </td>
                </tr>
                <tr>
                    <td>
                        <label htmlFor="statusPolicySelect">סטאטוס פוליסה <span style={{ color: 'red', marginLeft: '5px' }}>*</span></label>
                    </td>
                    <td>
                        <select id="statusPolicySelect" value={selectedStatusPolicy} 
                      
                      onChange={(e) => {
                        console.log('Selected Status:', e.target.value); // Debug log
                        setSelectedStatusPolicy(e.target.value);
                      }} >
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
            <button onClick={() => setShowOpenNewDeal(false)}>סגור</button>
            </div>
      </div>
    </div>
    )}
   
    </div>
    
  );
}

export default NewAgentForm;