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
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { CommissionSplit } from '@/types/CommissionSplit';
import { fetchSplits } from '@/services/splitsService';



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
  const [productMap, setProductMap] = useState<Record<string, Product>>({});

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
// const rowsPerPage = 8; // מספר השורות בעמוד

const [rowsPerPage, setRowsPerPage] = useState(10);
const totalPages = Math.ceil(filteredData.length / rowsPerPage);

// חישוב הנתונים לעמוד הנוכחי
const indexOfLastRow = currentPage * rowsPerPage;
const indexOfFirstRow = indexOfLastRow - rowsPerPage;
const currentRows = sortedData.slice(indexOfFirstRow, indexOfLastRow);

const [commissionSplits, setCommissionSplits] = useState<CommissionSplit[]>([]);

const [isCommissionSplitEnabled, setIsCommissionSplitEnabled] = useState(false);

useEffect(() => {
  setCurrentPage(1);
}, [rowsPerPage]);

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

  useEffect(() => {
    const loadSplits = async () => {
      if (selectedAgentId) {
        const splits = await fetchSplits(selectedAgentId);
        setCommissionSplits(splits);
      } else {
        setCommissionSplits([]); // ריק אם אין סוכן
      }
    };
  
    loadSplits();
  }, [selectedAgentId]);
  

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


  useEffect(() => {
    if (selectedRow && selectedRow.parentID) {
      fetchFamilySales();
    }
  }, [selectedRow]); // React to changes in selectedRow


  const resetForm = () => {
    setEditData({}); // איפוס כלל שדות הלקוח
    setErrors({}); // אופציונלי – איפוס שגיאות
    setIssueDay('');
    setBirthday('');
    // setParentID('');
    setNotes('');
    // setParentFullName('')
    setMail('');
    setPhone('');
    setAddress('');
    setSourceValue('');
    setSuggestions([]);
    setIsEditing(false);
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
  
      const {
        firstNameCustomer = "",
        lastNameCustomer = "",
        IDCustomer = ""
      } = editCustomerData;
  
      const fullNameCustomer = `${firstNameCustomer} ${lastNameCustomer}`.trim();
  
      // Check for existing customer with the same IDCustomer and AgentId
      const customerQuery = query(
        collection(db, 'customer'),
        where('IDCustomer', '==', IDCustomer),
        where('AgentId', '==', selectedAgentId)
      );
      const customerSnapshot = await getDocs(customerQuery);
  
      if (customerSnapshot.empty) {
        const customerRef = doc(collection(db, 'customer'));
  
        await setDoc(customerRef, {
          agent: selectedAgentName,
          AgentId: selectedAgentId,
          firstNameCustomer,
          lastNameCustomer,
          fullNameCustomer,
          IDCustomer,
          parentID: customerRef.id,
          notes,
          issueDay,
          birthday,
          phone,
          mail,
          address,
          sourceLead: sourceValue,
          createdAt: serverTimestamp(),
          lastUpdateDate: serverTimestamp()
        });
  
        addToast("success", "לקוח התווסף בהצלחה");
      } else {
        addToast("error", "לא ניתן להוסיף - לקוח קיים במערכת");
      }
  
      resetForm();
      setIsEditing(false);
      setIsModalOpen(false);
      reloadCustomerData(selectedAgentId);
    } catch (error) {
      console.error('Error adding document:', error);
    }
  };
  
  const canSubmit = useMemo(() => (
    selectedAgentId.trim() !== '' &&
    (editCustomerData.firstNameCustomer || '').trim() !== '' &&
    (editCustomerData.lastNameCustomer || '').trim() !== '' &&
    (editCustomerData.IDCustomer || '').trim() !== ''
  ), [selectedAgentId, editCustomerData]);
  

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
    isOneTime?: boolean; 
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
      const productMapping: Record<string, Product> = {}; // ⬅️ שינוי כאן
  
      querySnapshot.forEach((doc) => {
        const productData = doc.data() as Product;
        productMapping[productData.productName] = {
          productName: productData.productName,
          productGroup: productData.productGroup,
          isOneTime: productData.isOneTime || false, // ⬅️ נלקח מה-DB
        };
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
  
    const product = productMap[sale.product];
    const isOneTime = product?.isOneTime ?? false;
    const multiplier = isOneTime ? 1 : 12;
  
    if (contractMatch) {
      commissionHekef = (
        ((parseInt(sale.insPremia) || 0) * contractMatch.commissionHekef / 100 * multiplier) +
        ((parseInt(sale.pensiaPremia) || 0) * contractMatch.commissionHekef / 100 * multiplier) +
        ((parseInt(sale.pensiaZvira) || 0) * contractMatch.commissionNiud / 100) +
        ((parseInt(sale.finansimPremia) || 0) * contractMatch.commissionHekef / 100 * multiplier) +
        ((parseInt(sale.finansimZvira) || 0) * contractMatch.commissionNiud / 100)
      );
  
      if (!isOneTime) {
        commissionNifraim = (
          ((parseInt(sale.insPremia) || 0) * contractMatch.commissionNifraim / 100) +
          ((parseInt(sale.pensiaPremia) || 0) * contractMatch.commissionNifraim / 100) +
          ((parseInt(sale.finansimZvira) || 0) * contractMatch.commissionNifraim / 100 / 12)
        );
      }
  
    } else {
      const groupMatch = contracts.find(contract =>
        contract.productsGroup === product?.productGroup &&
        contract.agentId === selectedAgentId &&
        (contract.minuySochen === sale.minuySochen || (contract.minuySochen === undefined && !sale.minuySochen))
      );
  
      if (groupMatch) {
        commissionHekef = (
          ((parseInt(sale.insPremia) || 0) * groupMatch.commissionHekef / 100 * multiplier) +
          ((parseInt(sale.pensiaPremia) || 0) * groupMatch.commissionHekef / 100 * multiplier) +
          ((parseInt(sale.pensiaZvira) || 0) * groupMatch.commissionNiud / 100) +
          ((parseInt(sale.finansimPremia) || 0) * groupMatch.commissionHekef / 100 * multiplier) +
          ((parseInt(sale.finansimZvira) || 0) * groupMatch.commissionNiud / 100)
        );
  
        if (!isOneTime) {
          commissionNifraim = (
            ((parseInt(sale.insPremia) || 0) * groupMatch.commissionNifraim / 100) +
            ((parseInt(sale.pensiaPremia) || 0) * groupMatch.commissionNifraim / 100) +
            ((parseInt(sale.finansimZvira) || 0) * groupMatch.commissionNifraim / 100 / 12)
          );
        }
  
      } else {
        commissionHekef = 0;
        commissionNifraim = 0;
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
  
          const sourceValue = customerData?.sourceValue || '';

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

          if (isCommissionSplitEnabled && sourceValue) {
            const splitAgreement = commissionSplits.find(
              (split) =>
                split.agentId === selectedAgentId &&
                split.sourceLeadId === sourceValue
            );
          
            if (splitAgreement) {
              commissions.commissionHekef = Math.round(commissions.commissionHekef * (splitAgreement.percentToAgent / 100));
              commissions.commissionNifraim = Math.round(commissions.commissionNifraim * (splitAgreement.percentToAgent / 100));
            }
          }

          totalCommissionHekef += commissions.commissionHekef;
          totalCommissionNifraim += commissions.commissionNifraim;
  
          const calcPrem = calculatePremiaAndTzvira(data);
  
          return { ...data, ...commissions, ...calcPrem };
        })
      );
  
      if (salesWithNames.length === 0) {
        addToast("warning", "לקוח זה אין מכירות");
        setSalesData(null);
      } else {
        setSalesData(salesWithNames);
        setTotalCommissions({ totalCommissionHekef, totalCommissionNifraim });
      }
    } catch (error) {
      console.error("Error fetching private sales data:", error);
      addToast("error", "כשלון בקבלת נתוני מכירות פרטיות");
    }
  };
  
  useEffect(() => {
    console.log("🔁 isCommissionSplitEnabled changed:", isCommissionSplitEnabled);
  }, [isCommissionSplitEnabled]);

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
  
          const commissionsRaw = calculateCommissions(data, contractMatch);

          let commissions = { ...commissionsRaw };
          
          // 🧠 כאן בודקים האם מופעל פיצול ומהו ערך ה־sourceValue
          const sourceValue = customerData?.sourceValue || '';
          
          if (isCommissionSplitEnabled && sourceValue) {
            const splitAgreement = commissionSplits.find(
              (split) =>
                split.agentId === selectedAgentId &&
                split.sourceLeadId === sourceValue
            );
          
            if (splitAgreement) {
              commissions = {
                commissionHekef: Math.round(commissionsRaw.commissionHekef * (splitAgreement.percentToAgent / 100)),
                commissionNifraim: Math.round(commissionsRaw.commissionNifraim * (splitAgreement.percentToAgent / 100)),
              };
            }
          }
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



 const exportCustomersToExcel = (filteredCustomers: any[]) => {
  if (!filteredCustomers.length) return;

  const translatedCustomers = filteredCustomers.map((item) => ({
    "שם פרטי": item.firstNameCustomer || "",
    "שם משפחה": item.lastNameCustomer || "",
    "תעודת זהות": item.IDCustomer || "",
    "מבוטח אב": item.parentFullName || "",
    "תאריך לידה": item.birthday || "",
    "טלפון": item.phone || "",
    "מייל": item.mail || "",
    "כתובת": item.address || "",
    "מקור ליד": item.sourceValue || ""
  }));

  const worksheet = XLSX.utils.json_to_sheet(translatedCustomers);
  worksheet["!rtl"] = true;

  const range = XLSX.utils.decode_range(worksheet['!ref'] || '');
  worksheet['!ref'] = XLSX.utils.encode_range(range);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "לקוחות");

  const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
  saveAs(blob, "לקוחות.xlsx");
};



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
  <button onClick={() => exportCustomersToExcel(filteredData)}>
  <img src="/static/img/excel-icon.svg" alt="ייצוא לקוחות" width={24} height={24} />
</button>
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
            onClick={() => {
             resetForm();
            setIsModalOpen(false);
            }}               
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
          item.sourceValue && sourceLeadMap[item.sourceValue] ? sourceLeadMap[item.sourceValue] : "לא נבחר"
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
  totalPages={totalPages}
  onPageChange={handlePageChange}
  rowsPerPage={rowsPerPage}
  onRowsPerPageChange={setRowsPerPage}
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
<div dir="rtl" className="flex items-center gap-2">
  <span className="text-sm">חשב עם פיצול עמלות</span>
  <label className="relative inline-flex items-center cursor-pointer">
    <input
      type="checkbox"
      className="sr-only peer"
      checked={isCommissionSplitEnabled}
      onChange={() => setIsCommissionSplitEnabled(!isCommissionSplitEnabled)}
    />
    <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:bg-blue-600 transition-all duration-200"></div>
    <div className="absolute left-0.5 top-0.5 bg-white w-5 h-5 rounded-full transition-transform duration-200 peer-checked:translate-x-5"></div>
  </label>
</div>

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