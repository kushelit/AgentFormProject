import { ChangeEventHandler, FormEventHandler, SetStateAction, useEffect, useMemo, useState } from "react";
import { collection, query, setDoc, where, getDocs, getDoc, addDoc, deleteDoc, doc, updateDoc, DocumentSnapshot, DocumentData, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase"; // Ensure this path matches your project structure
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchMD from "@/hooks/useMD";
import './NewCustomer.css';
import useFetchAgentData from "@/hooks/useFetchAgentData";
import React from 'react';
import { useDesignFlag } from  "@/hooks/useDesignFlag";
import { Button } from "@/components/Button/Button";
import MenuWrapper from "@/components/MenuWrapper/MenuWrapper";
import Edit from '@/components/icons/Edit/Edit'; 
import Delete  from '@/components/icons/Delete/Delete'; 
import useEditableTable from "@/hooks/useEditableTable";
import { CustomersTypeForFetching } from '@/types/Customer';
import TableFooter from "@/components/TableFooter/TableFooter";
import { FamilyLinkDialog, startLinkingProcess,handleConfirmFamilyLink,disconnectCustomers} from "./FamilyLinkDialog"; // עדכני את הנתיב בהתאם למיקום הקובץ
import {fetchCustomersForAgent} from '@/services/fetchCustomerDetails'; // פונקציות
import {useSortableTable}  from "@/hooks/useSortableTable";
import {ToastNotification} from '@/components/ToastNotification';
import { useToast } from "@/hooks/useToast";
import { useValidation, validationRules } from "@/hooks/useValidation";
import { usePermission } from "@/hooks/usePermission";


const NewCustomer = () => {

  const isNewDesignEnabled = useDesignFlag();

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
  const [filteredData, setFilteredData] = useState<CustomersTypeForFetching[]>([]);
  const [parentFullNameFilter, setParentFullNameFilter] = useState("");
 // const [customerData, setCustomerData] = useState<any[]>([]);

  const [totalCommissions, setTotalCommissions] = useState({ totalCommissionHekef: 0, totalCommissionNifraim: 0 });

  const [showSelect, setShowSelect] = useState(false);

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
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value);
  const handleMailChange = (e: React.ChangeEvent<HTMLInputElement>) => setMail(e.target.value);
  const handleAddressChange = (e: React.ChangeEvent<HTMLInputElement>) => setAddress(e.target.value);

  const [mode, setMode] = useState('');  // '' (default), 'linking', 'disconnecting'
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [sourceValue, setSourceValue] = useState<string | null>('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const [sourceLeadList, setSourceLeadList] = useState<any[]>([]);
  //const [sourceLead, setSourceLead] = useState<string | null>(null);
  const [issueDay, setIssueDay] = useState('');
  const handleIssueDay = (e: React.ChangeEvent<HTMLInputElement>) => setIssueDay(e.target.value);

  const [showToast, setShowToast] = useState(false);
  const [toastType, setToastType] = useState('');
  const [toastMessage, setToastMessage] = useState('');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState('');
  //  const [dialogContent, setDialogContent] = useState('');

  const [dialogMessage, setDialogMessage] = useState<string>(""); // למחרוזות הודעה
  const [dialogCustomers, setDialogCustomers] = useState<CustomersTypeForFetching[]>([]); // למערך לקוחות
  
  const [selectedCustomers, setSelectedCustomers] = useState<CustomersTypeForFetching[]>([]);
  const [customers, setCustomers] = useState<CustomersTypeForFetching[]>([]);

  const { sortedData, sortColumn, sortOrder, handleSort, setSortedData } = useSortableTable(filteredData);

// ניהול העמוד הנוכחי
const [currentPage, setCurrentPage] = useState(1);
const rowsPerPage = 8; // מספר השורות בעמוד

// חישוב הנתונים לעמוד הנוכחי
const indexOfLastRow = currentPage * rowsPerPage;
const indexOfFirstRow = indexOfLastRow - rowsPerPage;
const currentRows = sortedData.slice(indexOfFirstRow, indexOfLastRow);

const { toasts, addToast, setToasts } = useToast();

const { errors, setErrors, handleValidatedEditChange } = useValidation();
const { canAccess: canViewCommissions } = usePermission("view_commissions_field");


// שינוי עמוד
const handlePageChange = (pageNumber: number) => {
  setCurrentPage(pageNumber);
};

useEffect(() => {
  setCurrentPage(1); // איפוס לעמוד הראשון כאשר הסינון משתנה
}, [filteredData]);




  interface Suggestion {
    id: string;
    source: string; // or any other properties you need
  }


  // type CustomerDataType = {
  //   id: string;
  //   firstNameCustomer: string;
  //   lastNameCustomer: string;
  //   fullNameCustomer: string;
  //   IDCustomer: string;
  //   parentID: string;
  //   birthday: string;
  //   issueDay: string;
  //   phone: string;
  //   mail: string;
  //   address: string;
  //   parentFullName: string;
  //   sourceValue: string;
  // };

  // type CustomersTypeForFetching = {
  //   parentID: string;
  //   firstNameCustomer: string;
  //   lastNameCustomer: string;
  //   fullNameCustomer: string;
  //   IDCustomer: string;
  //   notes: string;
  //   issueDay: string;
  //   birthday: string;
  //   phone: string;
  //   mail: string;
  //   address: string;
  //   sourceValue: string;

  // };

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

  const {
    formatIsraeliDateOnly,
    sourceLeadMap,
    fetchSourceLeadMap
  } = useFetchMD();
  


  useEffect(() => {
    if (selectedAgentId) {
      fetchCustomersForAgent(selectedAgentId);
      setSalesData(null);
      setTotalCommissions({ totalCommissionHekef: 0, totalCommissionNifraim: 0 });
      resetForm();
      fetchSourceLeadMap(selectedAgentId);
    }
  }, [selectedAgentId]);





//  const fetchCustomersForAgent = async (UserAgentId: string): Promise<CustomersTypeForFetching[]> => {
//   const q = query(collection(db, 'customer'), where('AgentId', '==', UserAgentId));
//   const querySnapshot = await getDocs(q);

//   const data = await Promise.all(
//     querySnapshot.docs.map(async (docSnapshot) => {
//       const customerData = docSnapshot.data() as CustomersTypeForFetching;

//       let parentFullName = '';
//       if (customerData.parentID) {
//         if (customerData.parentID === docSnapshot.id) {
//           parentFullName = `${customerData.firstNameCustomer || ''} ${customerData.lastNameCustomer || ''}`.trim();
//         } else {
//           const parentRef = doc(db, 'customer', customerData.parentID);
//           const parentDoc = await getDoc(parentRef);
//           if (parentDoc.exists()) {
//             const parentData = parentDoc.data() as CustomersTypeForFetching;
//             parentFullName = `${parentData.firstNameCustomer || ''} ${parentData.lastNameCustomer || ''}`.trim();
//           }
//         }
//       }

//       return {
//         ...customerData,
//         id: docSnapshot.id,
//         parentFullName,
//       };
//     })
//   );
//   return data; // הפונקציה מחזירה את המידע שה-hook משתמש בו
// };

  

const {
  data: customerData,
  editingRow: editingRowCustomer,
  editData: editCustomerData,
  setEditData,
  handleEditRow: handleEditCustomerRow,
  handleEditChange: handleEditCustomerChange,
  handleDeleteRow: handleDeleteCustomerRow,
  saveChanges: saveCustomerChanges,
  reloadData: reloadCustomerData,
  cancelEdit: cancelEditCustomer,
} = useEditableTable<CustomersTypeForFetching>({
  dbCollection: "customer",
  agentId: selectedAgentId,
  fetchData: fetchCustomersForAgent,
});

const removeCustomerFromList = (id: string) => {
  setSelectedCustomers((prevSelected) => {
    const updatedList = prevSelected.filter((customer) => customer.IDCustomer !== id);
    console.log("🗑️ לקוח הוסר מהסטייט", updatedList);
    return updatedList;
  });
};

const handleRemoveCustomer = (customerId: string) => {
  setSelectedCustomers((prev) => prev.filter((c) => c.id !== customerId));
};






useEffect(() => {
  if (!customerData) return; // בדיקה שהנתונים קיימים
  const data = customerData.filter((item) => {
    const idCustomerMatches = item.IDCustomer?.includes(idCustomerFilter.trim());
    const firstNameMatches = item.firstNameCustomer?.includes(firstNameCustomerFilter.trim());
    const lastNameMatches = item.lastNameCustomer?.includes(lastNameCustomerFilter.trim());
    const parentFullNameMatches = item.parentFullName?.toLowerCase().includes(parentFullNameFilter.trim().toLowerCase());

    return idCustomerMatches && firstNameMatches && lastNameMatches && parentFullNameMatches;
  });

  // עדכון הנתונים המסוננים
  setFilteredData(data);
}, [customerData, idCustomerFilter, firstNameCustomerFilter, lastNameCustomerFilter, parentFullNameFilter]);


useEffect(() => {
  setFilteredData(customers); // עדכון `filteredData` אחרי כל שינוי ב-`customers`
}, [customers]);



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
    setIssueDay(item.issueDay || '');
    setBirthday(item.birthday || '');
    setPhone(item.phone || '');
    setMail(item.mail || '');
    setAddress(item.address || '');
    setSourceValue(item.sourceValue || '');
    //console.log('SourceValue set' + sourceValue)
    //   if (item.parentID) {
    //     fetchFamilySales();
    //      }
  };

  useEffect(() => {
    if (selectedRow && selectedRow.parentID) {
      fetchFamilySales();
    }
  }, [selectedRow]); // React to changes in selectedRow


  // // delete function ***
  // const handleDelete = async () => {
  //   if (selectedRow && selectedRow.id) {
  //     await deleteDoc(doc(db, 'customer', selectedRow.id));
  //     setSelectedRow(null); // Reset selection
  //     resetForm();
  //     setIsEditing(false);
  //     if (selectedAgentId) {
  //       fetchCustomersForAgent(selectedAgentId);
  //     }
  //   } else {
  //     console.log("No selected row or row ID is undefined");
  //   }
  // };
  // const handleEdit = async () => {
  //   if (selectedRow && selectedRow.id) {
  //     try {
  //       const docRef = doc(db, 'customer', selectedRow.id);
  //       await updateDoc(docRef, {
  //         firstNameCustomer,
  //         lastNameCustomer,
  //         fullNameCustomer,
  //         IDCustomer,
  //         notes: notes || '',
  //         issueDay,
  //         birthday,
  //         phone,
  //         mail,
  //         address,
  //         sourceValue,
  //         lastUpdateDate: serverTimestamp()
  //       });
  //       console.log("Document successfully updated");
  //       setSelectedRow(null);
  //       resetForm();
  //       if (selectedAgentId) {
  //         fetchCustomersForAgent(selectedAgentId);
  //       }
  //     } catch (error) {
  //       console.error("Error updating document:", error);
  //     }
  //   } else {
  //     console.log("No row selected or missing document ID");
  //   }
  // };

  const resetForm = () => {
    setfirstNameCustomer('');
    setlastNameCustomer('');
    setFullNameCustomer('');
    setIDCustomer('');
    setIssueDay('');
    setBirthday('');
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
          issueDay,
          birthday,
          phone,
          mail,
          address,
          sourceLead: sourceValue,
          createdAt: serverTimestamp(),
          lastUpdateDate: serverTimestamp() // Also set at creation

        });
      //  console.log('Customer added with ID:', customerRef.id);
      addToast("success", "לקוח התווסף בהצלחה");

      } else {
        addToast("error", "לא ניתן להוסיף - לקוח קיים במערכת");

        // Existing customer found, notify user
          // setToastType('error');
          // setToastMessage('לא ניתן להוסיף - לקוח קיים במערכת');
          // setShowToast(true);
       //   console.log('Customer already exists with ID:', customerSnapshot.docs[0].id);
    
    }
      resetForm();
      setIsEditing(false);
      setIsModalOpen (false);
      reloadCustomerData(selectedAgentId);
    } catch (error) {
      console.error('Error adding document:', error);  // Log any errors during the process
    }
  };

  // useEffect(() => {
  //   if (showToast) {
  //     const timer = setTimeout(() => setShowToast(false), 3000); // נסגר אחרי 3 שניות
  //     return () => clearTimeout(timer); // מנקה את הטיימר
  //   }
  // }, [showToast]);


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
    minuySochen: boolean;

  }

  interface Product {
    productName: string;
    productGroup: string;
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
        commissionNiud: doc.data().commissionNiud,
        minuySochen: doc.data().minuySochen,
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
    totalCommissionNifraim?: number;
    minuySochen?: boolean;

  }

  const [salesData, setSalesData] = useState<Sale[] | null>(null);

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
        contract.agentId === selectedAgentId && (contract.minuySochen === sale.minuySochen || (contract.minuySochen === undefined && !sale.minuySochen))
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
      ((parseInt(sale.insPremia) || 0)) +
      ((parseInt(sale.pensiaPremia) || 0)) +
      ((parseInt(sale.finansimPremia) || 0))
    );
    tzvira = (
      ((parseInt(sale.pensiaZvira) || 0)) +
      ((parseInt(sale.finansimZvira) || 0))
    );
    return {
      sumPremia: premia,
      sumTzvira: tzvira
    };
  }

  const fetchPrivateSales = async () => {
    if (!selectedCustomers?.length) {
      addToast("error", "לא נבחר לקוח, נא לבחור לקוח לפני הפקת דוח");
      return;
    }
    const salesRef = collection(db, "sales");
    const salesQuery = query(
      salesRef,
      where("IDCustomer", "==", selectedCustomers[0]?.IDCustomer),
      where("AgentId", "==", selectedAgentId),
      where("statusPolicy", "in", ["פעילה", "הצעה"])
    );
  
    console.log("selectedAgentId:", selectedAgentId, "selectedCustomer.IDCustomer:", selectedCustomers[0]?.IDCustomer);
  
    try {
      const salesSnapshot = await getDocs(salesQuery);
      let totalCommissionHekef = 0;
      let totalCommissionNifraim = 0;
  
      const salesWithNames = await Promise.all(
        salesSnapshot.docs.map(async (salesDoc) => {
          const salesData = salesDoc.data();
  
          // Fetch customer data
          const customerQuery = query(
            collection(db, "customer"),
            where("IDCustomer", "==", salesData.IDCustomer)
          );
          const customerSnapshot = await getDocs(customerQuery);
          const customerData = customerSnapshot.docs[0]?.data();
  
          const data: Sale = {
            ...salesData,
            firstNameCustomer: customerData?.firstNameCustomer || "Unknown",
            lastNameCustomer: customerData?.lastNameCustomer || "Unknown",
            IDCustomer: salesData.IDCustomer,
            product: salesData.product,
            company: salesData.company,
            month: salesData.mounth,
            status: salesData.status,
            insPremia: salesData.insPremia,
            pensiaPremia: salesData.pensiaPremia,
            pensiaZvira: salesData.pensiaZvira,
            finansimPremia: salesData.finansimPremia,
            finansimZvira: salesData.finansimZvira,
          };
  
          const contractMatch = contracts.find(
            (contract) =>
              contract.agentId === selectedAgentId &&
              contract.product === data.product &&
              contract.company === data.company &&
              (contract.minuySochen === data.minuySochen ||
                (contract.minuySochen === undefined && !data.minuySochen))
          );
  
          const commissions = calculateCommissions(data, contractMatch);
          totalCommissionHekef += commissions.commissionHekef;
          totalCommissionNifraim += commissions.commissionNifraim;
  
          const calcPrem = calculatePremiaAndTzvira(data);
  
          return { ...data, ...commissions, ...calcPrem };
        })
      );
  
      if (salesWithNames.length === 0) {
        addToast("warning", "לקוח זה אין מכירות");

        // setToastType("warning");
        // setToastMessage("ללקוח זה אין מכירות");
        // setShowToast(true);
        setSalesData(null);
      } else {
        setSalesData(salesWithNames);
        setTotalCommissions({ totalCommissionHekef, totalCommissionNifraim });
      }
    } catch (error) {
      console.error("Error fetching private sales data:", error);
      addToast("error", "כשלון בקבלת נתוני מכירות פרטיות");

      // setToastType("error");
      // setToastMessage("כשלון בקבלת נתוני מכירות פרטיות");
      // setShowToast(true);
    }
  };
  
  const fetchFamilySales = async () => {
    if (!selectedCustomers?.length) {
      addToast("error", "לא נבחר לקוח, נא לבחור לקוח לפני הפקת דוח");
      return;
    }
  
    try {
      const customerRef = collection(db, "customer");
      const customerQuery = query(customerRef, where("parentID", "==", selectedCustomers[0]?.parentID));
      const customerSnapshot = await getDocs(customerQuery);
      const customerIDs = customerSnapshot.docs.map(doc => doc.data().IDCustomer);
  
      const salesRef = collection(db, "sales");
      const salesQuery = query(
        salesRef,
        where("IDCustomer", "in", customerIDs),
        where("AgentId", "==", selectedAgentId),
        where("statusPolicy", "in", ["פעילה", "הצעה"])
      );
  
      const salesSnapshot = await getDocs(salesQuery);
      let totalCommissionHekef = 0;
      let totalCommissionNifraim = 0;
  
      const salesWithNames = await Promise.all(
        salesSnapshot.docs.map(async (salesDoc) => {
          const salesData = salesDoc.data();
          const customerQuery = query(collection(db, "customer"), where("IDCustomer", "==", salesData.IDCustomer));
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
            finansimZvira: salesData.finansimZvira,
          };
  
          const contractMatch = contracts.find(
            (contract) =>
              contract.agentId === selectedAgentId &&
              contract.product === data.product &&
              contract.company === data.company &&
              (contract.minuySochen === data.minuySochen ||
                (contract.minuySochen === undefined && !data.minuySochen))
          );
  
          const commissions = calculateCommissions(data, contractMatch);
          totalCommissionHekef += commissions.commissionHekef;
          totalCommissionNifraim += commissions.commissionNifraim;
          const calcPrem = calculatePremiaAndTzvira(data);
  
          return { ...data, ...commissions, ...calcPrem };
        })
      );
  
      if (salesWithNames.length === 0) {
        addToast("warning", "לקוח זה אין מכירות");

      } else {
        setSalesData(salesWithNames);
        setTotalCommissions({ totalCommissionHekef, totalCommissionNifraim });
      }
    } catch (error) {
      console.error("Error fetching family sales data:", error);
      addToast("error", "כשלון בקבלת נתוני מכירות משפחתיות");

        // setToastType("error");
        // setToastMessage("כשלון בקבלת נתוני מכירות משפחתיות");
        // setShowToast(true);
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

  const cancelProcess = () => {
    setSelectedCustomers([]);  // מנקה את רשימת הלקוחות שנבחרו
    setShowSelect(false);      // מחביא את אפשרות הבחירה
    setIsMainCustomerSelected(false); // מאפס את הסטטוס של המבוטח הראשי
    setMode('normal');         // מחזיר את המצב למצב רגיל
  };

  // const startLinkingProcessOld = () => {
  //   setMode('linking');
  //   setShowSelect(true);
  //   if (isNewDesignEnabled) {
  //     // עיצוב חדש - הצגת Dialog
  //     setDialogType('info'); // סוג הדיאלוג
  //     setDialogContent('בחר מבוטח ראשי'); // תוכן הדיאלוג
  //     setIsDialogOpen(true); // הצגת הדיאלוג
  //     } else {
  //     // עיצוב ישן - הצגת הודעת alert
  //     alert('בחר מבוטח ראשי');
  //    }
  // };

  // const startDisconnectionProcess = () => {
  //   setMode('disconnecting');
  //   setShowSelect(true);
  //   if (isNewDesignEnabled) {
  //     // עיצוב חדש - הצגת Dialog
  //     setDialogType('info'); // סוג הדיאלוג
  //   //  setDialogContent('בחר מבוטח לניתוק קשר'); // תוכן הדיאלוג
  //     setIsDialogOpen(true); // הצגת הדיאלוג
  //     } else {
  //     // עיצוב ישן - הצגת הודעת alert
  //   alert("בחר מבוטח לניתוק קשר");
  //   }
  // };

  // // confirm disconnect function **
  // const confirmDisconnection = (customerId: string): void => {
  //   const confirmAction = window.confirm("האם לבטל קשר משפחתי ?");
  //   if (confirmAction) {
  //     disconnectCustomer(customerId);
  //   }
  // }

  //disconnect function **
  // const disconnectCustomer = async (customerId: string): Promise<void> => {
  //   try {
  //     const customerDocRef = doc(db, 'customer', customerId);
  //     await updateDoc(customerDocRef, {
  //       parentID: customerId  // Resetting their parentID to their own ID effectively disconnects them.
  //     });
  //     alert("קשר משפחתי  נותק בהצלחה");
  //   } catch (error) {
  //     console.error("Failed to disconnect customer:", error);
  //     alert("כשלון בניתוק קשר משפחתי");
  //   } finally {
  //     setSelectedCustomers(new Set());  // Clear any selected customer ID
  //     fetchCustomersForAgent(selectedAgentId);  // Refresh the customer list
  //     setShowSelect(false);  // Optionally hide the selection UI
  //     // Reset any additional states or flags related to the process if necessary
  //     setMode('normal');  // Assuming you might have a mode state that needs to be reset
  //   }
  // }
  //handle function **
  // const handleSelectCustomerOld = (id: string) => {
  //   const newSelection = new Set(selectedCustomers);
  //   if (mode === 'disconnecting') {
  //     setSelectedCustomers(new Set([id]));  // Directly select only one for disconnection
  //     confirmDisconnection(id);  // Optionally ask for confirmation right after selection
  //   } else if (mode === 'linking') {

  //     // If the main customer is not yet selected, or the selected ID is the current main customer
  //     if (!isMainCustomerSelected || id === mainCustomerId) {
  //       if (isMainCustomerSelected && id === mainCustomerId) {
  //         // If the main customer is clicked again, offer to deselect or switch main customer
  //         const confirmDeselect = confirm('זהו לקוח ראשי, האם אתה רוצה לבטל את הבחירה?');
  //         if (confirmDeselect) {
  //           newSelection.clear(); // Clear all selections
  //           setIsMainCustomerSelected(false); // No main customer is selected now
  //           setMainCustomerId(null); // Clear the main customer ID
  //           setSelectedCustomers(newSelection); // Update the state
  //           return; // Exit the function after resetting
  //         }
  //       } else {
  //         // Set the clicked customer as the main customer
  //         newSelection.clear(); // Clear previous selections which might include old secondary selections
  //         newSelection.add(id); // Add this as the main customer
  //         setMainCustomerId(id); // Set the main customer ID
  //         setIsMainCustomerSelected(true); // A main customer is now selected
  //         alert('מבוטח ראשי הוגדר, כעת בחר מבוטחים משניים');
  //       }
  //     } else {
  //       // Handling secondary customers
  //       if (newSelection.has(id)) {
  //         newSelection.delete(id); // Deselect if already selected
  //       } else {
  //         newSelection.add(id); // Select if not already selected
  //       }
  //     }
  //     setSelectedCustomers(newSelection); // Update the selected customers state
  //   };
  // }

  //// link function ***
  // const linkSelectedCustomers = async () => {
  //   const ids = Array.from(selectedCustomers);
  //   if (ids.length > 0) {
  //     const mainCustomerId = ids[0];
  //     let familyConflict = false;
  //     let conflictingCustomerName = "";
  //     const mainCustomerDocRef = doc(db, 'customer', mainCustomerId);
  //     const mainCustomerDoc = await getDoc(mainCustomerDocRef);

  //     if (mainCustomerDoc.exists()) {
  //       const mainCustomerData = mainCustomerDoc.data();
  //       // Check if the main customer is already part of another family link
  //       if (mainCustomerData.parentID !== mainCustomerId) {
  //         alert(`הלקוח ${mainCustomerData.firstNameCustomer} כבר חלק מחיבור משפחתי אחר. יש לנתק את החיבור הקיים לפני הפיכתו ללקוח ראשי בחיבור חדש.`);
  //         console.log("Operation canceled due to existing parental connection.");
  //         return;  // Exit the function if the main customer is already linked
  //       }
  //     }

  //     // Check each secondary customer to ensure they are not already a main parent to other customers
  //     for (const customerId of ids.slice(1)) {  // Exclude the main customer
  //       const customerDocRef = doc(db, 'customer', customerId);
  //       const customerDoc = await getDoc(customerDocRef);
  //       if (customerDoc.exists()) {
  //         const customerData = customerDoc.data();
  //         const childCheckQuery = query(
  //           collection(db, 'customer'),
  //           where('AgentId', '==', customerData.AgentId),
  //           where('parentID', '==', customerId)  // Check if they are listed as a parent to other customers
  //         );
  //         const childCheckSnapshot = await getDocs(childCheckQuery);
  //         childCheckSnapshot.forEach((doc) => {
  //           if (doc.id !== customerId) {  // Ensure the document isn't the customer being their own parent
  //             familyConflict = true;
  //             conflictingCustomerName = customerData.firstNameCustomer;
  //             alert(`לא ניתן לחבר את הלקוח ${conflictingCustomerName} כלקוח משני מאחר שהוא כבר משמש כהורה בחיבור אחר.`);
  //             console.log("Operation canceled due to existing parental connection.");
  //             return;  // Exit from forEach and skip further processing
  //           }
  //         });
  //         if (familyConflict) {
  //           return;  // Exit the function if a conflict was found
  //         }
  //       }
  //     }
  //     for (const customerId of ids.slice(1)) { // Check secondary customers
  //       const customerDocRef = doc(db, 'customer', customerId);
  //       const customerDoc = await getDoc(customerDocRef);

  //       if (customerDoc.exists()) {
  //         const customerData = customerDoc.data();
  //         if (customerData.parentID && customerData.parentID !== customerId && customerData.parentID !== mainCustomerId) {
  //           familyConflict = true;
  //           conflictingCustomerName = customerData.firstNameCustomer;
  //           break;
  //         }
  //       }
  //     }
  //     if (familyConflict) {
  //       const confirmTransfer = confirm(`הלקוח ${conflictingCustomerName} כבר מקושר למשפחה אחרת. האם ברצונך להעביר את כולם למשפחה חדשה?`);
  //       if (!confirmTransfer) {
  //         console.log("Operation canceled by the user.");
  //         return;
  //       }
  //     }
  //     for (const customerId of ids) {
  //       const customerDocRef = doc(db, 'customer', customerId);
  //       await updateDoc(customerDocRef, {
  //         parentID: mainCustomerId
  //       });
  //     }
  //     alert('קשר משפחתי הוגדר בהצלחה');
  //     setSelectedCustomers(new Set());
  //     setShowSelect(false);
  //     setIsMainCustomerSelected(false); // Reset the main customer selection flag
  //     setMainCustomerId(null); // Reset the main customer ID
  //     if (selectedAgentId) {
  //       fetchCustomersForAgent(selectedAgentId);
  //     }
  //   }
  // };

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

  const handleSelectChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSourceValue(event.target.value); // Save the selected `id`
  };



  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openMenuRowCustomers, setOpenMenuRowCustomers] = useState<string | null>(null);


const handleOpenModalCustomerForm = () => {
  setIsModalOpen(true);
}



const menuItems = (
  rowId: string,
  handleEditRow: (id: string) => void,
  handleDeleteRow: (id: string, isCustomerPage?: boolean, updateSelectedCustomers?: (id: string) => void) => void,
  closeMenu: () => void // פונקציה לסגירת התפריט
) => [
  {
    key: `edit-${rowId}`, // מפתח ייחודי לעריכה
    label: "ערוך",
    onClick: () => {
      handleEditRow(rowId); // מבצע עריכה
      closeMenu(); // סוגר את התפריט
    },
    Icon: Edit,
  },
  {
    key: `delete-${rowId}`, // מפתח ייחודי למחיקה
    label: "מחק",
    onClick: () => {
      handleDeleteRow(rowId, true, removeCustomerFromList); // 🔹 מעבירים את הפונקציה לעדכון הסטייט
      closeMenu(); // סוגר את התפריט
    },
    Icon: Delete,
  },
];



const handleNewSelectCustomer = (id: string) => {
  setSelectedCustomers((prevSelected) => {
    const newSelection = [...prevSelected];
    const customer = filteredData.find((customer) => customer.id === id);

    if (!customer) return prevSelected; // אם הלקוח לא נמצא, החזר את הרשימה הקיימת

    const existingIndex = newSelection.findIndex((c) => c.id === id);

    if (existingIndex !== -1) {
      newSelection.splice(existingIndex, 1); // הסר אם כבר מסומן
    } else {
      newSelection.push(customer); // הוסף אם לא מסומן
    }
    setSalesData(null);
    setTotalCommissions({ totalCommissionHekef: 0, totalCommissionNifraim: 0 });
    console.log("Updated selectedCustomers:", newSelection);
    return newSelection;
  });
};

// new 

// const handleSelectCustomer = (id: string) => {
//   setSelectedCustomers((prevSelected) => {
//     const newSelection = new Set(prevSelected);
//     if (newSelection.has(id)) {
//       newSelection.delete(id); // הסרה אם נבחר שוב
//     } else {
//       newSelection.add(id); // הוספה אם לא נבחר
//     }
//     return newSelection;
//   });
// };

// const handleLinkCustomers = () => {
//   console.log("handleLinkCustomers called!");
//   if (selectedCustomers.size === 0) {
//     alert("בחר לפחות לקוח אחד לטובת הקישור.");
//     return;
//   }
//   // הדפסת נתוני הלקוחות שנבחרו
//   console.log("Selected Customers IDs:", Array.from(selectedCustomers));
//   // שליפת פרטי הלקוחות מתוך `filteredData`
//   const customersToShow = Array.from(selectedCustomers)
//     .map((id) => filteredData.find((customer) => customer.id === id))
//     .filter(Boolean) as CustomersTypeForFetching[]; // הסרת ערכים ריקים
//   console.log("Customers to Show in Modal:", customersToShow);
//   setDialogCustomers(customersToShow); // עדכון המודל עם הנתונים
//   console.log("Dialog Customers:", dialogCustomers);
//   setIsDialogOpen(true);
// };



// const handleConfirmFamilyLink = async (mainCustomerId: string) => {
//   const ids = Array.from(selectedCustomers);

//   if (!mainCustomerId) {
//     alert("יש לבחור מבוטח ראשי לפני יצירת החיבור.");
//     return;
//   }

//   let familyConflict = false;
//   let conflictingCustomerName = "";

//   const mainCustomerDocRef = doc(db, 'customer', mainCustomerId);
//   const mainCustomerDoc = await getDoc(mainCustomerDocRef);

//   if (mainCustomerDoc.exists()) {
//     const mainCustomerData = mainCustomerDoc.data();
//     if (mainCustomerData.parentID !== mainCustomerId) {
//       alert(`הלקוח ${mainCustomerData.firstNameCustomer} כבר חלק מחיבור משפחתי אחר. יש לנתק את החיבור הקיים לפני הפיכתו ללקוח ראשי בחיבור חדש.`);
//       return;
//     }
//   }

//   for (const customerId of ids) {
//     if (customerId === mainCustomerId) continue;
//     const customerDocRef = doc(db, 'customer', customerId);
//     const customerDoc = await getDoc(customerDocRef);

//     if (customerDoc.exists()) {
//       const customerData = customerDoc.data();
//       const childCheckQuery = query(
//         collection(db, 'customer'),
//         where('AgentId', '==', customerData.AgentId),
//         where('parentID', '==', customerId)  // Check if they are listed as a parent to other customers
//       );
//       const childCheckSnapshot = await getDocs(childCheckQuery);
//       childCheckSnapshot.forEach((doc) => {
//         if (doc.id !== customerId) {
//           familyConflict = true;
//           conflictingCustomerName = customerData.firstNameCustomer;
//           alert(`לא ניתן לחבר את הלקוח ${conflictingCustomerName} כלקוח משני מאחר שהוא כבר משמש כהורה בחיבור אחר.`);
//           return;
//         }
//       });
//       if (familyConflict) {
//         return;
//       }
//     }
//   }
//   if (familyConflict) {
//     const confirmTransfer = confirm(`הלקוח ${conflictingCustomerName} כבר מקושר למשפחה אחרת. האם ברצונך להעביר את כולם למשפחה חדשה?`);
//     if (!confirmTransfer) {
//       return;
//     }
//   }
//   for (const customerId of ids) {
//     const customerDocRef = doc(db, 'customer', customerId);
//     await updateDoc(customerDocRef, {
//       parentID: mainCustomerId
//     });
//   }
//   alert('קשר משפחתי הוגדר בהצלחה');
//   setSelectedCustomers(new Set());
//   setIsDialogOpen(false);
//   setIsMainCustomerSelected(false);
//   setMainCustomerId(null);
//   if (selectedAgentId) {
//     fetchCustomersForAgent(selectedAgentId);
//   }
// };



  return (
    <div className="content-container">
    <div className="first-table">
    <div className="table-header">
    <div className="table-title">ניהול לקוחות</div>
   <div className="newCustomerFormButton">
  <Button
    onClick={handleOpenModalCustomerForm}
    text="הזנת פרטי לקוח"
    type="primary"
    icon="on"
    state="default"
  />
  <Button
    onClick={saveCustomerChanges}
    text="שמור שינויים"
    type="primary"
    icon="off"
    state={editingRowCustomer ? "default" : "disabled"} // כפתור פעיל רק כשיש שורה שנערכת
    disabled={!editingRowCustomer} // מנוטרל אם אין שורה שנערכת
  />
  {/* כפתור לביטול עריכה */}
  <Button
    onClick={cancelEditCustomer}
    text="בטל"
    type="primary"
    icon="off"
    state={editingRowCustomer ? "default" : "disabled"} // כפתור פעיל רק כשיש שורה שנערכת
    disabled={!editingRowCustomer} // מנוטרל אם אין שורה שנערכת
  />
</div>
</div>
<div className="filter-inputs-container">
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
          <input className="filter-input"
            type="text"
            placeholder="שם פרטי"
            value={firstNameCustomerFilter}
            onChange={(e) => setfirstNameCustomerFilter(e.target.value)}
          />
          </div>
          <div className="filter-select-container">
          <input className="filter-input"
            type="text"
            placeholder="שם משפחה"
            value={lastNameCustomerFilter}
            onChange={(e) => setlastNameCustomerFilter(e.target.value)}
          />
          </div>
          <div className="filter-select-container">
          <input className="filter-input"
            type="text"
            placeholder="תז לקוח"
            value={idCustomerFilter}
            onChange={(e) => setIdCustomerFilter(e.target.value)}
          />
          </div>
          <div className="filter-select-container">
          <input className="filter-input"
            type="text"
            placeholder="מבוטח אב"
            value={parentFullNameFilter}
            onChange={(e) => setParentFullNameFilter(e.target.value)}
          />
          </div>
        </div>
      {isModalOpen && (
  <div className="modal">
    <div className="modal-content">
      {/* כפתור לסגירת המודל */}
      <button className="close-button" onClick={() =>  setIsModalOpen(false) }>
    ✖
  </button>
  <form onSubmit={handleSubmit} className="form-container">
      {/* כותרת המודל */}
      <div className="modal-title">פרטי לקוח</div>
      <section className="form-section">
      <h3 className="section-title">פרטים אישיים</h3>
      <div className="form-grid">
      {/* טופס המודל */}
        <div className="form-group">
          <label htmlFor="agentSelect">סוכנות</label>
          <select
            onChange={handleAgentChange}
            value={selectedAgentId}
          >
            {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
            {agents.map(agent => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>שם פרטי</label>
          <input
  type="text"
  value={editCustomerData.firstNameCustomer || ""}
  onChange={(e) =>
    handleValidatedEditChange("firstNameCustomer", e.target.value, setEditData, setErrors)
  }
/>
{errors.firstNameCustomer && <div className="error-message">{errors.firstNameCustomer}</div>}
        </div>
        <div className="form-group">
          <label>שם משפחה</label>
          <input
  type="text"
  value={editCustomerData.lastNameCustomer || ""}
  onChange={(e) =>
    handleValidatedEditChange("lastNameCustomer", e.target.value, setEditData, setErrors)
  }
/>
{errors.lastNameCustomer && <div className="error-message">{errors.lastNameCustomer}</div>}
        </div>
       <div className="form-group">
  <label htmlFor="IDCustomer">תעודת זהות</label>
  <input
  type="text"
  inputMode="numeric"
  maxLength={9}
  value={editCustomerData.IDCustomer || ""}
  onChange={(e) =>
    handleValidatedEditChange("IDCustomer", e.target.value, setEditData, setErrors)
  }
/>
  {errors.IDCustomer && <div className="error-message">{errors.IDCustomer}</div>}
</div>

        <div className="form-group">
          <label htmlFor="issueDay">תאריך הנפקה תז</label>
          <input
            type="date"
            id="issueDay"
            name="issueDay"
            value={issueDay}
            onChange={handleIssueDay}
          />
        </div>
        <div className="form-group">
          <label htmlFor="birthday">תאריך לידה</label>
          <input
            type="date"
            id="birthday"
            name="birthday"
            value={birthday}
            onChange={handleBirthdayChange}
          />
        </div>
        </div>
        </section>
{/* פרטי ליד */}
<section className="form-section">
  <h3 className="section-title">פרטי התקשרות</h3>
  <div className="form-grid">
        <div className="form-group">
          <label htmlFor="phone">טלפון</label>
          <input
            type="tel"
            id="phone"
            name="phone"
            value={phone}
            onChange={handlePhoneChange}
          />
        </div>
        <div className="form-group">
          <label htmlFor="mail">דואר אלקטרוני</label>
          <input
            type="email"
            id="mail"
            name="mail"
            value={mail}
            onChange={handleMailChange}
          />
        </div>
        <div className="form-group">
          <label htmlFor="address">כתובת</label>
          <input
            type="text"
            id="address"
            name="address"
            value={address}
            onChange={handleAddressChange}
          />
        </div>
        <div className="form-group">
          <label htmlFor="sourceLeadSelect">מקור ליד</label>
          <select
            id="sourceLeadSelect"
            value={sourceValue || ''}
            onChange={handleSelectChange}
          >
            <option value="">בחר מקור ליד</option>
            {sourceLeadList.map((item, index) => (
              <option key={index} value={item.id}>
                {item.sourceLead}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group full-width">
          <label htmlFor="notes">הערות</label>
          <textarea
            id="notes"
            name="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}></textarea>
        </div>
        </div>
        </section>
        {/* כפתורי הפעולה */}
        <div className="button-group">
          <Button
            type="primary"
            text="הזן"
            onClick={handleSubmit}
             icon="off"
            disabled={!canSubmit || isEditing}
             state={canSubmit && !isEditing ? "default" : "disabled"}
          />
             <Button
                onClick={() => setIsModalOpen(false)}
                text="בטל"
                type="secondary"
                icon="off"
                state="default"
              />
        </div>
      </form>
    </div>
  </div>
)}

        <div className="firstTableData" >
          <table>
          <thead>
  <tr>
    <th className="fixed-header">בחר</th> {/* לא ממוין */}
    <th onClick={() => handleSort("firstNameCustomer" as keyof CustomersTypeForFetching)}>
      שם פרטי {sortColumn && sortColumn === "firstNameCustomer" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th onClick={() => handleSort("lastNameCustomer" as keyof CustomersTypeForFetching)}>
      שם משפחה {sortColumn && sortColumn === "lastNameCustomer" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th onClick={() => handleSort("IDCustomer" as keyof CustomersTypeForFetching)}>
      תז {sortColumn && sortColumn === "IDCustomer" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th onClick={() => handleSort("parentFullName" as keyof CustomersTypeForFetching)}>
      מבוטח אב {sortColumn && sortColumn === "parentFullName" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th onClick={() => handleSort("birthday" as keyof CustomersTypeForFetching)}>
      תאריך לידה {sortColumn && sortColumn === "birthday" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th onClick={() => handleSort("phone" as keyof CustomersTypeForFetching)}>
      טלפון {sortColumn && sortColumn === "phone" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th onClick={() => handleSort("mail" as keyof CustomersTypeForFetching)}>
      מייל {sortColumn && sortColumn === "mail" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th onClick={() => handleSort("address" as keyof CustomersTypeForFetching)}>
      כתובת {sortColumn && sortColumn === "address" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th onClick={() => handleSort("sourceValue" as keyof CustomersTypeForFetching)}>
      מקור ליד {sortColumn && sortColumn === "sourceValue" ? (sortOrder === "asc" ? "▲" : "▼") : ""}
    </th>
    <th className="narrow-cell">🔧</th> {/* לא ממוין */}
  </tr>
</thead>
            <tbody>
  {currentRows.map((item) => (
    <tr key={item.id} className={editingRowCustomer === item.id ? "editing-row" : ""}
      onMouseEnter={() => setHoveredRowId(item.id)}
      onMouseLeave={() => setHoveredRowId(null)}
    >
    {/*  {showSelect && (*/}
    <td>
  <input
    type="checkbox"
    checked={selectedCustomers.some(customer => customer.IDCustomer === item.IDCustomer)}
    onChange={() => handleNewSelectCustomer(item.id)}
  />
</td>
     {/* )}
      {/* שם פרטי */}
    <td>
  {editingRowCustomer === item.id ? (
    <>
      <input
        type="text"
        value={editCustomerData.firstNameCustomer || ""}
        onChange={(e) => {
          const newValue = e.target.value;
          const errorMessage = validationRules["firstNameCustomer"]?.(newValue);
          setErrors((prevErrors) => ({
            ...prevErrors,
            firstNameCustomer: errorMessage || "",
          }));

          if (!errorMessage) {
            handleEditCustomerChange("firstNameCustomer", newValue);
          }
        }}
      />
      {errors.firstNameCustomer && <div className="error-message">{errors.firstNameCustomer}</div>}
    </>
  ) : (
    item.firstNameCustomer
  )}
</td>
      {/* שם משפחה */}
      <td>
  {editingRowCustomer === item.id ? (
    <>
      <input
        type="text"
        value={editCustomerData.lastNameCustomer || ""}
        onChange={(e) => {
          const newValue = e.target.value;
          const errorMessage = validationRules["lastNameCustomer"]?.(newValue);
          setErrors((prevErrors) => ({
            ...prevErrors,
            lastNameCustomer: errorMessage || "",
          }));

          if (!errorMessage) {
            handleEditCustomerChange("lastNameCustomer", newValue);
          }
        }}
      />
      {errors.lastNameCustomer && <div className="error-message">{errors.lastNameCustomer}</div>}
    </>
  ) : (
    item.lastNameCustomer
  )}
</td>
      {/* תעודת זהות */}
      <td>
  {editingRowCustomer === item.id ? (
    <>
      <input
        type="text"
        value={editCustomerData.IDCustomer || ""}
        onChange={(e) => {
          const newValue = e.target.value.replace(/\D/g, "").slice(0, 9); // 🔹 מסיר אותיות ומגביל ל-9 ספרות
          const errorMessage = validationRules["IDCustomer"]?.(e.target.value); // 🔍 בודק את הערך לפני העיבוד

          // 🔹 עדכון השגיאה בכל מקרה
          setErrors((prevErrors) => ({
            ...prevErrors,
            IDCustomer: errorMessage || "",
          }));

          // 🔹 עדכון הערך גם אם יש שגיאה, כדי שהמשתמש יראה מה הוא מקליד
          handleEditCustomerChange("IDCustomer", newValue);
        }}
      />
      {errors.IDCustomer && <div className="error-message">{errors.IDCustomer}</div>}
    </>
  ) : (
    item.IDCustomer
  )}
</td>
      {/* שם הורה */}
      <td>
        {editingRowCustomer === item.id ? (
          <input
            type="text"
            value={editCustomerData.parentFullName || ""}
            onChange={(e) =>
              handleEditCustomerChange("parentFullName", e.target.value)
            }
          />
        ) : (
          item.parentFullName || ""
        )}
      </td>
      {/* תאריך לידה */}
      <td>
        {editingRowCustomer === item.id ? (
          <input
            type="date"
            value={editCustomerData.birthday || ""}
            onChange={(e) =>
              handleEditCustomerChange("birthday", e.target.value)
            }
          />
        ) : item.birthday ? (
          formatIsraeliDateOnly(item.birthday)
        ) : (
          ""
        )}
      </td>
      {/* טלפון */}
      <td>
        {editingRowCustomer === item.id ? (
          <input
            type="tel"
            value={editCustomerData.phone || ""}
            onChange={(e) =>
              handleEditCustomerChange("phone", e.target.value)
            }
          />
        ) : (
          item.phone
        )}
      </td>
      {/* דואר אלקטרוני */}
      <td>
        {editingRowCustomer === item.id ? (
          <input
            type="email"
            value={editCustomerData.mail || ""}
            onChange={(e) =>
              handleEditCustomerChange("mail", e.target.value)
            }
          />
        ) : (
          item.mail
        )}
      </td>
      {/* כתובת */}
      <td>
        {editingRowCustomer === item.id ? (
          <input
            type="text"
            value={editCustomerData.address || ""}
            onChange={(e) =>
              handleEditCustomerChange("address", e.target.value)
            }
          />
        ) : (
          item.address
        )}
      </td>
      {/* מקור ליד */}
      <td>
        {editingRowCustomer === item.id ? (
          <select
            value={editCustomerData.sourceValue || ""}
            onChange={(e) =>
              handleEditCustomerChange("sourceValue", e.target.value)
            }
          >
            <option value="">לא נבחר</option>
            {Object.entries(sourceLeadMap).map(([key, value]) => (
              <option key={key} value={key}>
                {value}
              </option>
            ))}
          </select>
        ) : (
          sourceLeadMap[item.sourceValue] || "לא נבחר"
        )}
      </td>
      {/* פעולות */}
      <td className="narrow-cell">
        <MenuWrapper
          rowId={item.id}
          openMenuRow={openMenuRowCustomers}
          setOpenMenuRow={setOpenMenuRowCustomers}
          menuItems={menuItems(
            item.id,
            handleEditCustomerRow,
            handleDeleteCustomerRow,
            () => setOpenMenuRowCustomers(null)
          )}
        />
      </td>
    </tr>
  ))}
</tbody>
<tfoot>
  <tr>
    <td colSpan={16} style={{ textAlign: "right", backgroundColor: "var(--clrgray4)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center"}}>
        {/* כפתורי קשר משפחתי */}
        <div className="buttons-container" style={{ display: "flex"}}>
        <Button
  onClick={() => startLinkingProcess(
    setMode, 
    setShowSelect, 
    // isNewDesignEnabled, 
    setDialogType, 
    setDialogMessage, 
    setIsDialogOpen, 
    setDialogCustomers, // מילוי הנתונים במודל
    selectedCustomers,
    filteredData,
    setCustomers, // ✅ נוסיף את זה
    setFilteredData // ✅ נוסיף גם את זה
  )}
  text="הוסף קשר משפחתי"
  type="primary"
  icon="off"
  state={selectedCustomers.length > 0 ? "default" : "disabled"} // שינוי ל-`length`
  disabled={selectedCustomers.length === 0} 
/>
<Button
    onClick={() => disconnectCustomers(selectedCustomers, setSelectedCustomers, setCustomers, selectedAgentId, fetchCustomersForAgent)}
    text="נתק קשר משפחתי"
    type="primary"
    icon="off"
    state={selectedCustomers.length > 0 ? "default" : "disabled"}
    disabled={selectedCustomers.length === 0}
/>
  {/* הצגת המודל בתוך ה- return */}
  {dialogMessage && <p>{dialogMessage}</p>} {/* הצגת הודעה אם יש טקסט */}
  {isDialogOpen && (
 <FamilyLinkDialog
 isOpen={isDialogOpen}
 onClose={() => setIsDialogOpen(false)}
 customers={dialogCustomers} // הלקוחות שמועברים למודל
 onConfirm={(mainCustomerId) =>
  handleConfirmFamilyLink(
    mainCustomerId,
    selectedCustomers,
    setSelectedCustomers,
    setIsDialogOpen,
    selectedAgentId,
    fetchCustomersForAgent,
    setCustomers, // ✅ מעבירים את הפונקציה שמעדכנת
    setFilteredData // ✅ מעבירים גם את רשימת המסוננים
  )
}
 setSelectedCustomers={setSelectedCustomers} 
 setIsDialogOpen={setIsDialogOpen}
 selectedAgentId={selectedAgentId} // הוספת הפרופ החסר
 fetchCustomersForAgent={fetchCustomersForAgent} // מעבירים את הפונקציה עם הטיפוס הנכון
 setCustomers={setCustomers} // ✅ לוודא שזה נשלח
  setFilteredData={setFilteredData} // ✅ לוודא שזה נשלח
/>
)}
{selectedCustomers.length > 0 && (
  <div className="selected-customers-container">
    <strong>לקוחות שנבחרו:</strong>
    <ul>
      {selectedCustomers.map((customer) => (
        <li key={customer.id}>
          {customer.firstNameCustomer} {customer.lastNameCustomer} 
          <button onClick={() => handleRemoveCustomer(customer.id)}>❌</button>
        </li>
      ))}
    </ul>
    <button onClick={() => setSelectedCustomers([])}>נקה בחירה</button>
  </div>
)}
</div>
        {/* רכיב הניווט */}
        <TableFooter
          currentPage={currentPage}
          totalPages={Math.ceil(filteredData.length / rowsPerPage)}
          onPageChange={handlePageChange}
        />
      </div>
    </td>
  </tr>
</tfoot>
          </table>
        </div>
        <div className="SecondTable" >
            <div className="left-buttons">
            <Button
  onClick={fetchPrivateSales}
  text="הפק דוח אישי"
  type="primary"
  icon="on"
  state={selectedCustomers ? "default" : "disabled"}
  disabled={!selectedCustomers}
/>
<Button
  onClick={fetchFamilySales}
  text="הפק דוח משפחתי"
  type="primary"
  icon="on"
  state={selectedCustomers /* && selectedCustomers.parentID */ ? "default" : "disabled"}
  disabled={!selectedCustomers /* || !selectedCustomers.parentID*/}
/>
            </div>
          </div>
          <div className="DataTableReport">
            <table >
              <thead>
                <tr>
                  <th>שם פרטי</th>
                  <th>שם משפחה</th>
                  <th>תז</th>
                  <th>מוצר</th>
                  <th>חברה</th>
                  <th>חודש תוקף</th>
                  {canViewCommissions && <th>פרמיה</th>}
                  {canViewCommissions && <th>צבירה</th>}
                  {canViewCommissions && <th>היקף</th>}
                  {canViewCommissions && <th>נפרעים</th>}
                </tr>
              </thead>
              <tbody>
              {(salesData ?? []).map((sale, index) => (
                  <tr key={index}>
                    <td>{sale.firstNameCustomer}</td>
                    <td>{sale.lastNameCustomer}</td>
                    <td>{sale.IDCustomer}</td>
                    <td>{sale.product}</td>
                    <td>{sale.company}</td>
                    <td>{sale.month ? formatIsraeliDateOnly(sale.month) : ""}</td>
                    {canViewCommissions && <td>{sale.sumPremia?.toLocaleString()}</td>}
                    {canViewCommissions && <td>{sale.sumTzvira?.toLocaleString()}</td>}
                    {canViewCommissions && <td>{sale.commissionHekef?.toLocaleString()}</td>}
                    {canViewCommissions && <td>{sale.commissionNifraim?.toLocaleString()}</td>}
                  </tr>
                ))}
                {canViewCommissions && (
                  <tr>
                    <td colSpan={8} style={{ fontWeight: 'bold', textAlign: 'left' }} >סיכום עמלות</td>
                    <td style={{ fontWeight: 'bold' }}>{totalCommissions.totalCommissionHekef.toLocaleString()} </td>
                    <td style={{ fontWeight: 'bold' }}>{totalCommissions.totalCommissionNifraim.toLocaleString()}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {toasts.length > 0  && toasts.map((toast) => (
  <ToastNotification 
    key={toast.id}  
    type={toast.type}
    className={toast.isHiding ? "hide" : ""} 
    message={toast.message}
    onClose={() => setToasts((prevToasts) => prevToasts.filter((t) => t.id !== toast.id))}
  />
))}
        </div>
      </div>
  );
}
export default NewCustomer