import { ChangeEventHandler, FormEvent, FormEventHandler, useEffect, useMemo, useState } from "react";
import { collection, query, where, getDocs, addDoc, 
  deleteDoc, doc, updateDoc,writeBatch, } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase"; // Ensure this path matches your project structure
import { useAuth } from '@/lib/firebase/AuthContext';
import Link from "next/link";
import useFetchMD from "@/hooks/useMD"; 
import './NewManageContracts.css';
import useFetchAgentData from "@/hooks/useFetchAgentData"; 
import { Button } from "@/components/Button/Button";
import MenuWrapper from "@/components/MenuWrapper/MenuWrapper";
import Edit from '@/components/icons/Edit/Edit'; 
import Delete  from '@/components/icons/Delete/Delete'; 
import useEditableTable from "@/hooks/useEditableTable";
import { Contract, ContractAgent } from '@/types/Contract'; // טיפוסים
import {ToastNotification} from '@/components/ToastNotification';
import { useToast } from "@/hooks/useToast";
import { fetchSourceLeadsForAgent } from '@/services/sourceLeadService';
import { SourceLead } from '@/types/SourceLead'; // טיפוס SourceLead
import { fetchSplits } from '@/services/splitsService';


  const NewManageContracts: React.FC = () => {
  const { user, detail } = useAuth();
  //const [defaultContracts, setDefaultContracts] = useState<Contract[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);

  const [commissionPercentHekef1, setCommissionPercentHekef1] = useState('');
  const [commissionPercentNifraim1, setCommissionPercentNifraim1] = useState('');
  const [commissionPercentNiud1, setCommissionPercentNiud1] = useState('');

  
  const [commissionPercentHekef2, setCommissionPercentHekef2] = useState('');
  const [commissionPercentNifraim2, setCommissionPercentNifraim2] = useState('');
  const [commissionPercentNiud2, setCommissionPercentNiud2] = useState('');


  const [selectedRow, setSelectedRow] = useState<any | null>(null);
  const [hoveredRowId, setHoveredRowId] = useState(null);

  const [isEditing1, setIsEditing1] = useState(false);
  const [isEditing2, setIsEditing2] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  
  const [minuySochenFilter1, setMinuySochenFilter1] = useState('');
  const [minuySochenFilter2, setMinuySochenFilter2] = useState('');
  const [minuySochen1, setMinuySochen1] = useState(false);
  const [minuySochen2, setMinuySochen2] = useState(false);

  const { toasts, addToast, setToasts } = useToast();
  const [splitMode, setSplitMode] = useState<'commission' | 'production'>('commission');


  const { 
    agents, 
    selectedAgentId, 
    handleAgentChange, 
  } = useFetchAgentData();

 


  //const [date, setDate] = useState('');

  const {
    companies, 
    selectedCompany, 
    setSelectedCompany,
    products,
    setSelectedProduct,
    selectedProduct,
    //productGroups, old
    productGroupsDB, //new
    selectedProductGroup,
    setSelectedProductGroup,
    productGroupMap,
    selectedProductFilter,
    selectedProductGroupFilter,
    setSelectedProductGroupFilter,
    setSelectedProductFilter,
  } = useFetchMD();

  const { 
    selectedCompanyFilter,
    setSelectedCompanyFilter,
    // selectedAgentId,
  } = useFetchAgentData();



  type CompanyProductRow = {
    company: string;
    product: string;
    minuySochen: boolean;
    commissionHekef: string;
    commissionNifraim: string;
    commissionNiud: string;
  };

  // מצב העבודה בלשונית באמצעית: לפי חברה או לפי מוצר
const [agentMode, setAgentMode] = useState<"byCompany" | "byProduct">("byCompany");

// מצב 1: חברה -> מוצרים
const [selectedCompanyForMatrix, setSelectedCompanyForMatrix] = useState<string>("");
const [selectedProductsForCompany, setSelectedProductsForCompany] = useState<string[]>([]);
const [rowsByCompany, setRowsByCompany] = useState<CompanyProductRow[]>([]);

// מצב 2: מוצר -> חברות
const [selectedProductForMatrix, setSelectedProductForMatrix] = useState<string>("");
const [selectedCompaniesForProduct, setSelectedCompaniesForProduct] = useState<string[]>([]);
const [rowsByProduct, setRowsByProduct] = useState<CompanyProductRow[]>([]);

// בחירה מרובה של מוצרים (במצב "חברה -> מוצרים")
const handleProductsForCompanyChange: React.ChangeEventHandler<HTMLSelectElement> = (e) => {
  const options = Array.from(e.target.selectedOptions);
  const values = options.map(o => o.value);
  setSelectedProductsForCompany(values);
};

// בחירה מרובה של חברות (במצב "מוצר -> חברות")
const handleCompaniesForProductChange: React.ChangeEventHandler<HTMLSelectElement> = (e) => {
  const options = Array.from(e.target.selectedOptions);
  const values = options.map(o => o.value);
  setSelectedCompaniesForProduct(values);
};

useEffect(() => {
  const loadByCompany = async () => {
    if (!selectedAgentId || !selectedCompanyForMatrix) {
      setRowsByCompany([]);
      return;
    }

    // 1. שליפה מה-DB: כל ההסכמים של הסוכן לחברה הזו
    const q = query(
      collection(db, "contracts"),
      where("AgentId", "==", selectedAgentId),
      where("company", "==", selectedCompanyForMatrix)
    );

    const snap = await getDocs(q);
    const allDocs = snap.docs.map(d => d.data() as any);

    // 2. אילו מוצרים להציג?
    //    אם בחרת מוצרים מעניינים → רק הם
    //    אם לא בחרת → כל המוצרים שיש ב-DB לחברה הזו
    const productsToShow: string[] =
      selectedProductsForCompany.length > 0
        ? selectedProductsForCompany
        : Array.from(new Set(allDocs.map(c => c.product)));

    // 3. מיפוי לפי product כדי למלא ערכים קיימים
    const existingByProduct: Record<string, any> = {};
    snap.forEach(docSnap => {
      const data = docSnap.data() as any;
      existingByProduct[data.product] = { id: docSnap.id, data };
    });

    // 4. בניית השורות – גם למה שקיים וגם למה שחדש
    const rows: CompanyProductRow[] = productsToShow.map(productName => {
      const existing = existingByProduct[productName];
      return {
        company: selectedCompanyForMatrix,
        product: productName,
        minuySochen: existing?.data?.minuySochen ?? false,
        commissionHekef: existing?.data?.commissionHekef?.toString?.() ?? "",
        commissionNifraim: existing?.data?.commissionNifraim?.toString?.() ?? "",
        commissionNiud: existing?.data?.commissionNiud?.toString?.() ?? "",
      };
    });

    setRowsByCompany(rows);
  };

  loadByCompany();
}, [selectedAgentId, selectedCompanyForMatrix, selectedProductsForCompany]);


useEffect(() => {
  const loadByProduct = async () => {
    if (!selectedAgentId || !selectedProductForMatrix) {
      setRowsByProduct([]);
      return;
    }

    const q = query(
      collection(db, "contracts"),
      where("AgentId", "==", selectedAgentId),
      where("product", "==", selectedProductForMatrix)
    );

    const snap = await getDocs(q);
    const allDocs = snap.docs.map(d => d.data() as any);

    const companiesToShow: string[] =
      selectedCompaniesForProduct.length > 0
        ? selectedCompaniesForProduct
        : Array.from(new Set(allDocs.map(c => c.company)));

    const existingByCompany: Record<string, any> = {};
    snap.forEach(docSnap => {
      const data = docSnap.data() as any;
      existingByCompany[data.company] = { id: docSnap.id, data };
    });

    const rows: CompanyProductRow[] = companiesToShow.map(companyName => {
      const existing = existingByCompany[companyName];
      return {
        company: companyName,
        product: selectedProductForMatrix,
        minuySochen: existing?.data?.minuySochen ?? false,
        commissionHekef: existing?.data?.commissionHekef?.toString?.() ?? "",
        commissionNifraim: existing?.data?.commissionNifraim?.toString?.() ?? "",
        commissionNiud: existing?.data?.commissionNiud?.toString?.() ?? "",
      };
    });

    setRowsByProduct(rows);
  };

  loadByProduct();
}, [selectedAgentId, selectedProductForMatrix, selectedCompaniesForProduct]);


const updateRowByCompany = (
  productName: string,
  field: keyof Omit<CompanyProductRow, "company" | "product">,
  value: string | boolean
) => {
  setRowsByCompany(prev =>
    prev.map(row =>
      row.product === productName
        ? { ...row, [field]: value }
        : row
    )
  );
};

const updateRowByProduct = (
  companyName: string,
  field: keyof Omit<CompanyProductRow, "company" | "product">,
  value: string | boolean
) => {
  setRowsByProduct(prev =>
    prev.map(row =>
      row.company === companyName
        ? { ...row, [field]: value }
        : row
    )
  );
};


const hasAnyValues = (row: CompanyProductRow) =>
  row.minuySochen ||
  row.commissionHekef.trim() !== "" ||
  row.commissionNifraim.trim() !== "" ||
  row.commissionNiud.trim() !== "";

const saveRows = async (rows: CompanyProductRow[], successMessage: string) => {
  if (!selectedAgentId || rows.length === 0) return;

  const batch = writeBatch(db);

  // טוענים את כל החוזים של הסוכן כדי לדעת מה כבר קיים
  const q = query(
    collection(db, "contracts"),
    where("AgentId", "==", selectedAgentId)
  );
  const snap = await getDocs(q);

  const existingMap: Record<string, { id: string; data: any }> = {};
  snap.forEach(docSnap => {
    const data = docSnap.data() as any;
    const key = `${data.company}___${data.product}`;
    existingMap[key] = { id: docSnap.id, data };
  });

  rows.forEach(row => {
    if (!hasAnyValues(row)) return;

    const key = `${row.company}___${row.product}`;
    const existing = existingMap[key];

    const docRef = existing
      ? doc(db, "contracts", existing.id)
      : doc(collection(db, "contracts"));

    batch.set(
      docRef,
      {
        AgentId: selectedAgentId,
        company: row.company,
        product: row.product,
        productsGroup: "",
        commissionHekef: row.commissionHekef,
        commissionNifraim: row.commissionNifraim,
        commissionNiud: row.commissionNiud,
        minuySochen: row.minuySochen,
      },
      { merge: true }
    );
  });

  await batch.commit();
  addToast("success", successMessage);
};

const saveByCompany = () =>
  saveRows(rowsByCompany, "הסכמי העמלות עודכנו לפי חברה");

const saveByProduct = () =>
  saveRows(rowsByProduct, "הסכמי העמלות עודכנו לפי מוצר");





//קיים//
  useEffect(() => {
    // console.log("🔄 productGroupMap השתנה:", productGroupMap);
  }, [productGroupMap]);
  const handlecommissionPercentHekef1: ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
    setCommissionPercentHekef1(value || "0"); // אם השדה ריק, ישים "0"
};

const handlecommissionPercentNifraim1: ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
    setCommissionPercentNifraim1(value || "0"); // אם השדה ריק, ישים "0"
};

const handlecommissionPercentNiud1: ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
    setCommissionPercentNiud1(value || "0"); // אם השדה ריק, ישים "0"
};

const handlecommissionPercentHekef2: ChangeEventHandler<HTMLInputElement> = (e) => {
  const value = e.target.value;
  const onlyNumsAndDot = value.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
  setCommissionPercentHekef2(onlyNumsAndDot);
};

const handlecommissionPercentNifraim2: ChangeEventHandler<HTMLInputElement> = (e) => {
const value = e.target.value;
const onlyNumsAndDot = value.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
setCommissionPercentNifraim2(onlyNumsAndDot);
};

const handlecommissionPercentNiud2: ChangeEventHandler<HTMLInputElement> = (e) => {
  const value = e.target.value;
  const onlyNumsAndDot = value.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
  setCommissionPercentNiud2(onlyNumsAndDot);
  };
  
const resetFormDefault = () => {
  setSelectedProductGroup('');
  setCommissionPercentHekef1('');
  setCommissionPercentNifraim1('');
  setCommissionPercentNiud1('');
  setIsEditing1(false);
  setSelectedRow(null); 
  setMinuySochen1(false);
};

const resetFormContracts = () => {
  setSelectedCompany('');
  setSelectedProduct('');
  setCommissionPercentHekef2('');
  setCommissionPercentNifraim2('');
  setCommissionPercentNiud2('');
  setIsEditing2(false);
  setSelectedRow(null); 
  setMinuySochen2(false);
};

const resetFormSplit = () => {
  setSelectedSourceLeadId('');
  setPercentToAgent('');
  setPercentToSourceLead('');
  setIsEditing2(false);
  setSelectedRow(null); 
}

const canSubmit1 = useMemo(() => (
  selectedProductGroup?.trim() !== '' &&
  commissionPercentHekef1?.trim() !== '' &&
  commissionPercentNifraim1?.trim() !== '' &&
  commissionPercentNiud1?.trim() !== '' &&
  minuySochen1 !== null && minuySochen1 !== undefined
), [selectedProductGroup, commissionPercentHekef1, commissionPercentNifraim1, commissionPercentNiud1, minuySochen1]);

 const handleSubmitDiffultValue =async (event: FormEvent<HTMLFormElement>) => {
  if (event) event.preventDefault(); // ✅ מונע רענון דף במקרה של `<form>`

    try {
     
        if (!detail || !detail.agentId) return;

        const existingContractQuery = query(collection(db, 'contracts'), 
        where('AgentId', '==', detail.agentId),
        where('productsGroup', '==', selectedProductGroup),
        where('minuySochen', '==', minuySochen1)
      );
  
      const querySnapshot = await getDocs(existingContractQuery);
      if (!querySnapshot.empty) {
        // console.log('A contract with the same details already exists.');
        addToast("error", "לא ניתן להזין הסכם זהה להסכם קיים");
        return; 
      }
        const docRef = await addDoc(collection(db, 'contracts'), {
        AgentId: selectedAgentId,
        company: '',
        productsGroup: selectedProductGroup,
        product: '',
        commissionHekef:commissionPercentHekef1,
        commissionNifraim:commissionPercentNifraim1,
        commissionNiud:commissionPercentNiud1,
        minuySochen:minuySochen1

      });      
      // console.log('Document written with ID:', docRef.id);
      addToast("success", "הסכם עמלות הוזן בהצלחה");

      resetFormDefault(); 
  setIsModalOpenCommission(false);
  reloadDefaultContractsData(selectedAgentId);
    } catch (error) {
      // console.error('Error adding document:', error);
    }
  };

  const canSubmit2 = useMemo(() => (
    selectedCompany.trim() !== '' &&
    selectedProduct.trim() !== '' &&
    commissionPercentHekef2.trim() !== '' &&
    commissionPercentNifraim2.trim() !== '' &&
    commissionPercentNiud2.trim() !== '' 
  ), [selectedCompany, selectedProduct, commissionPercentHekef2, commissionPercentNifraim2, 
    commissionPercentNiud2 
   ]);
  

  const handleSubmitFullValuesCommission = async (event: FormEvent<HTMLFormElement>) => {
    if (event) event.preventDefault();
      try {    
          if (!detail || !detail.agentId) return;

      const existingContractQuery = query(collection(db, 'contracts'), 
      where('AgentId', '==', detail.agentId),
      where('company', '==', selectedCompany),
      where('product', '==', selectedProduct),
      where('minuySochen', '==', minuySochen2)
    );

    const querySnapshot = await getDocs(existingContractQuery);
    if (!querySnapshot.empty) {
      // console.log('A contract with the same details already exists.');
      addToast("error", "לא ניתן להזין הסכם זהה להסכם קיים");

      // alert('לא ניתן להזין הסכם זהה להסכם קיים'); 
      return; 
    }
          // console.log("got here");
          const docRef = await addDoc(collection(db, 'contracts'), {
            AgentId: selectedAgentId,
          company: selectedCompany,
          productsGroup: '',
          product: selectedProduct,
          commissionHekef:commissionPercentHekef2,
          commissionNifraim:commissionPercentNifraim2,
          commissionNiud:commissionPercentNiud2,
          minuySochen:minuySochen2
        });      
        // console.log('Document written with ID:', docRef.id);
        addToast("success", "הסכם עמלות הוזן בהצלחה");

        resetFormContracts(); 
     //   setIsEditing(false);
     //   if (selectedAgent) {
      // fetchContracts(detail?.agentId || "");
      //  }
      setIsModalOpenAgent(false);
      reloadContractsData(selectedAgentId);
      } catch (error) {
        // console.error('Error adding document:', error);
      }
    };
    const fetchContracts = async (agentId: string): Promise<ContractAgent[]> => {
      // אם לא נבחר כלום בכלל
      if (!agentId) return [];
    
      // בסיס השאילתה: תמיד productsGroup == ""
      let q;
    
      if (agentId === "all") {
        // כל הסוכנות – בלי סינון AgentId
        q = query(
          collection(db, "contracts"),
          where("productsGroup", "==", "")
        );
      } else {
        // סוכן ספציפי
        q = query(
          collection(db, "contracts"),
          where("AgentId", "==", agentId),
          where("productsGroup", "==", "")
        );
      }
    
      if (selectedCompanyFilter.trim() !== "") {
        q = query(q, where("company", "==", selectedCompanyFilter));
      }
    
      if (selectedProductFilter.trim() !== "") {
        q = query(q, where("product", "==", selectedProductFilter));
      }
    
      if (minuySochenFilter2.trim() !== "") {
        const boolValue = minuySochenFilter2 === "true";
        q = query(q, where("minuySochen", "==", boolValue));
      }
    
      try {
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ContractAgent[];
      } catch (error) {
        // console.error("Error fetching contracts data:", error);
        return [];
      }
    };
    
    
    useEffect(() => {
      const agentIdToLoad =
        selectedAgentId || detail?.agentId || "";
    
      if (!agentIdToLoad) return;
    
      reloadContractsData(agentIdToLoad);
    }, [
      selectedAgentId,
      selectedCompanyFilter,
      selectedProductFilter,
      minuySochenFilter2,
      detail?.agentId,
    ]);
    

    const fetchdefaultContracts = async (agentId: string): Promise<Contract[]> => {
      if (!agentId) return [];
      let diffContractsQuery = query(
        collection(db, "contracts"),
        where("AgentId", "==", agentId),
        where("productsGroup", ">", "")
      );
      if (selectedProductGroupFilter.trim() !== "") {
        diffContractsQuery = query(diffContractsQuery, where("productsGroup", "==", selectedProductGroupFilter));
      }
      if (minuySochenFilter1.trim() !== "") {
        const boolValue = minuySochenFilter1 === "true"; // המרה ל-boolean
        diffContractsQuery = query(diffContractsQuery, where("minuySochen", "==", boolValue));
      }
      
      try {
        const querySnapshot = await getDocs(diffContractsQuery);
        return querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        } as Contract));


      } catch (error) {
        // console.error("Error fetching contracts data:", error);
        return [];
      }
    };
    
    useEffect(() => {
      reloadDefaultContractsData(selectedAgentId); // קריאה ל-reloadData מתוך ה-hook
    }, [selectedProductGroupFilter, minuySochenFilter1, selectedAgentId]); // מעקב אחרי שינוי פרמטרים
    

  const [activeTab, setActiveTab] = useState("contractDefault");
  const [isModalOpenCommission, setIsModalOpenCommission] = useState(false);
  const [openMenuRowContracts, setOpenMenuRowContracts] = useState<string | null>(null);
  const [openMenuRowDefaultContracts, setOpenMenuRowDefaultContracts] = useState<string | null>(null);
  const handleOpenModalAgent = () => setIsModalOpenAgent(true);
const handleCloseModalAgent = () => setIsModalOpenAgent(false);
const [isModalOpenAgent, setIsModalOpenAgent] =  useState(false);


  const handleOpenModalCommission = () => {
    setIsModalOpenCommission(true);
  };
  
  const handleCloseModalCommission = () => {
    setIsModalOpenCommission(false);
  };

  const {
    data: defaultContracts,
    editingRow: editingRowDefaultContracts,
    editData: editDefaultContractData,
    handleEditRow: handleEditDefaultContractRow,
    handleEditChange: handleEditDefaultContractChange,
    handleDeleteRow: handleDeleteDefaultContractRow,
    saveChanges: saveDefaultContractChanges,
    reloadData: reloadDefaultContractsData,
    cancelEdit: cancelEditDefaultContract,
  } = useEditableTable({
    dbCollection: "contracts",
    agentId: selectedAgentId,
    fetchData: fetchdefaultContracts, // Fetch עבור ברירות מחדל
  });
  


  const {
    data: contractsData,
    editingRow: editingRowContracts,
    editData: editContractData,
    handleEditRow: handleEditContractRow,
    handleEditChange: handleEditContractChange,
    handleDeleteRow: handleDeleteContractRow,
    saveChanges: saveContractChanges,
    reloadData: reloadContractsData,
    cancelEdit: cancelEditContract,
  } = useEditableTable({
    dbCollection: "contracts",
    agentId: selectedAgentId,
    fetchData: fetchContracts, // Fetch עבור החוזים
  });
  
  

  const menuItems = (
    rowId: string,
    handleEditRow: (id: string) => void,
    handleDeleteRow: (id: string) => void,
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
        handleDeleteRow(rowId); // מבצע מחיקה
        closeMenu(); // סוגר את התפריט
      },
      Icon: Delete,
    },
  ];



  const [isModalOpenSplit, setIsModalOpenSplit] = useState(false);
  const [selectedSourceLeadId, setSelectedSourceLeadId] = useState('');
  const [percentToAgent, setPercentToAgent] = useState('');
  const [percentToSourceLead, setPercentToSourceLead] = useState('');
  const [sourceLeads, setSourceLeads] = useState<SourceLead[]>([]);
  const [openMenuRowCommissionSplit, setOpenMenuRowCommissionSplit] = useState<string | null>(null);

  
  const handleSubmitSplitForm = async (e: any) => {
    e.preventDefault();
    if (!selectedAgentId || !selectedSourceLeadId) return;
  
    await addDoc(collection(db, 'commissionSplits'), {
      agentId: selectedAgentId,
      sourceLeadId: selectedSourceLeadId,
      percentToAgent: Number(percentToAgent),
      percentToSourceLead: Number(percentToSourceLead),
      splitMode, // 🔴 נשמר את סוג ההסכם
    });
  
    resetFormSplit(); 
    setIsModalOpenSplit(false);
    reloadCommissionSplits(selectedAgentId);
  };
  
  
  
  
  useEffect(() => {
    if (!selectedAgentId) return;
    // console.log("📌 agentId לשליפת לידים:", selectedAgentId);
    fetchSourceLeadsForAgent(selectedAgentId).then(setSourceLeads);
    fetchSplits (selectedAgentId);
  }, [selectedAgentId]);
  


  const {
    data: commissionSplits,
    editingRow: editingRowCommissionSplit,
    editData: editCommissionSplitData,
    handleEditRow: handleEditCommissionSplitRow,
    handleEditChange: handleEditCommissionSplitChange,
    handleDeleteRow: handleDeleteCommissionSplitRow,
    saveChanges: saveSplitAgreementChanges,
    reloadData: reloadCommissionSplits,
    cancelEdit: cancelEditSplitAgreement,
  } = useEditableTable({
    dbCollection: "commissionSplits",
    agentId: selectedAgentId,
    fetchData: fetchSplits ,
  });
  

return (
  <div className="content-container">
        <div className="table-header">
            <div className="table-title">ניהול עמלות</div>
            <div className="tabs">
  <button
    className={`tab ${activeTab === "contractDefault" ? "selected" : "default"}`}
    onClick={() => setActiveTab("contractDefault")}
  >
    הגדרת עמלות ברירת מחדל
  </button>
  <button
    className={`tab ${activeTab === "contractAgent" ? "selected" : "default"}`}
    onClick={() => setActiveTab("contractAgent")}
  >
    הגדרת עמלות למוצר
  </button>
  <button
    className={`tab ${activeTab === "commissionSplit" ? "selected" : "default"}`}
    onClick={() => setActiveTab("commissionSplit")}
  >
    פיצול עמלות
  </button>
</div>
      </div>
          {/* תוכן הלשוניות */}
          <div className="tab-content">
        {activeTab === "contractDefault" && (
          <div id="contractDefault-tab" className={activeTab === "contractDefault" ? "active" : ""}>
            {/* תוכן לשונית הקצאת יעדים */}
            <div className="NewcontractsDefaultMD">
            <div className="filter-select-container">
             <select onChange={handleAgentChange} value={selectedAgentId} className="select-input">
              {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
              {detail?.role === 'admin' && <option value="all">כל הסוכנות</option>}
              {agents.map(agent => (
               <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
             </select>
          <select className="select-input" 
          value={selectedProductGroupFilter}
          onChange={(e) => {
            // console.log("Selected Product Group:", e.target.value);
            setSelectedProductGroupFilter(e.target.value);
          }}
        >
               <option value="">בחר קבוצת מוצר</option>
               {productGroupsDB.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
         ))}
        </select>
        <select
  className="select-input"
  value={minuySochenFilter1}
  onChange={(e) => setMinuySochenFilter1(e.target.value)}
>
  <option value="">מינוי סוכן </option>
  <option value="true">כן</option>
  <option value="false">לא</option>
</select>
        </div>
  {/* כפתור לפתיחת המודל */}
  <div className="newcontractsDefaultButton">
    <Button
      onClick={handleOpenModalCommission}
      text="הזנת עמלות"
      type="primary"
      icon="on"
      state="default"
    />  
    <Button
  onClick={saveDefaultContractChanges} // פונקציית שמירת שינויים
  text="שמור שינויים"
  type="primary"
  icon="off"
  state={editingRowDefaultContracts ? "default" : "disabled"} // כפתור פעיל רק כשיש שורה שנערכת
  disabled={!editingRowDefaultContracts} // מנוטרל כשאין שורה שנערכת
/>
<Button
  onClick={cancelEditDefaultContract}
  text="בטל"
  type="primary"
  icon="off"
  state={editingRowDefaultContracts ? "default" : "disabled"} // כפתור פעיל רק כשיש שורה שנערכת
/>
  </div>
  {isModalOpenCommission && (
    <div className="modal">
      <div className="modal-content">
        {/* כפתור לסגירת המודל */}
        <button className="close-button" onClick={() => setIsModalOpenCommission(false)}>
    ✖
  </button>
        {/* כותרת המודל */}
        <div className="modal-title">הזנת עמלות</div>
        {/* טופס המודל */}
        <form onSubmit={(e) => { e.preventDefault(); handleSubmitDiffultValue(e); }} 
             className="form-container">
          <div className="form-group">
            <label htmlFor="productGroupSelect1">קבוצת מוצר</label>
            <select
              id="productGroupSelect1"
              value={selectedProductGroup}
              onChange={(e) => setSelectedProductGroup(e.target.value)}
            >
              <option value="">בחר קבוצת מוצר</option>
              {productGroupsDB.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <div className="checkbox-container">
              <input
                type="checkbox"
                id="minuySochen1"
                checked={minuySochen1}
                onChange={(e) => setMinuySochen1(e.target.checked)}
              />
              <label htmlFor="minuySochen1">מינוי סוכן</label>
              </div>
            </div>
          <div className="form-group">
            <label htmlFor="priceInputHekef1">אחוז היקף</label>
            <input
              type="text"
              id="priceInputHekef1"
              value={commissionPercentHekef1}
              onChange={handlecommissionPercentHekef1}
            />
          </div>
          <div className="form-group">
            <label htmlFor="priceInputNifraim1">אחוז נפרעים</label>
            <input
              type="text"
              id="priceInputNifraim1"
              value={commissionPercentNifraim1}
              onChange={handlecommissionPercentNifraim1}
            />
          </div>
          <div className="form-group">
            <label htmlFor="priceInputNiud1">אחוז ניוד</label>
            <input
              type="text"
              id="priceInputNiud1"
              value={commissionPercentNiud1}
              onChange={handlecommissionPercentNiud1}
            />
          </div>
          {/* כפתורים */}
          <div className="button-group">
            <Button
              onClick={handleSubmitDiffultValue}
              text="הזן"
              type="primary"
              icon="on"
              state={canSubmit1 ? "default" : "disabled"}
              disabled={!canSubmit1} 
            />
            <Button
              onClick={handleCloseModalCommission}
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
  <div className="tableContractDefaultMD">
        <table>
              <thead>
                <tr>
                  <th>קבוצת מוצרים</th>
                  <th>מינוי סוכן</th>
                  <th>עמלת היקף</th>
                  <th>עמלת נפרעים</th>
                  <th>עמלת ניוד</th>
                  <th className="narrow-cell">🔧</th>
                </tr>
              </thead>
            <tbody>
  {defaultContracts.map((item) => (
    <tr key={item.id}>
      {/* קבוצת מוצר */}
      <td>
  {editingRowDefaultContracts === item.id ? (
    <select
      id={`productGroupSelect-${item.id}`}
      value={editDefaultContractData.productsGroup || ""}
      onChange={(e) =>
        handleEditDefaultContractChange("productsGroup", e.target.value)
      }
    >
      <option value="">בחר קבוצת מוצר</option>
      {productGroupsDB.map((group) => (
        <option key={group.id} value={group.id}>
          {group.name}
        </option>
      ))}
    </select>
  ) : (
    // console.log("productsGroupPage " + Number(item.productsGroup)),
    productGroupMap[Number(item.productsGroup)] || "N/A"
  )}
</td>
      {/* מינוי סוכן */}
      <td>
        {editingRowDefaultContracts === item.id ? (
          <input
            type="checkbox"
            checked={editDefaultContractData.minuySochen || false}
            onChange={(e) =>
              handleEditDefaultContractChange("minuySochen", e.target.checked)
            }
          />
        ) : (
          item.minuySochen ? "כן" : "לא"
        )}
      </td>

      {/* אחוז היקף */}
      <td>
        {editingRowDefaultContracts === item.id ? (
          <input
            type="text"
            value={editDefaultContractData.commissionHekef || ""}
            onChange={(e) =>
              handleEditDefaultContractChange("commissionHekef", e.target.value)
            }
          />
        ) : (
          `${item.commissionHekef}%`
        )}
      </td>

      {/* אחוז נפראים */}
      <td>
        {editingRowDefaultContracts === item.id ? (
          <input
            type="text"
            value={editDefaultContractData.commissionNifraim || ""}
            onChange={(e) =>
              handleEditDefaultContractChange(
                "commissionNifraim",
                e.target.value
              )
            }
          />
        ) : (
          `${item.commissionNifraim}%`
        )}
      </td>

      {/* אחוז ניוד */}
      <td>
        {editingRowDefaultContracts === item.id ? (
          <input
            type="text"
            value={editDefaultContractData.commissionNiud || ""}
            onChange={(e) =>
              handleEditDefaultContractChange("commissionNiud", e.target.value)
            }
          />
        ) : (
          `${item.commissionNiud}%`
        )}
      </td>

      {/* תפריט פעולות */}
      <td className="narrow-cell">
        <MenuWrapper
          rowId={item.id}
          openMenuRow={openMenuRowDefaultContracts}
          setOpenMenuRow={setOpenMenuRowDefaultContracts}
          menuItems={menuItems(
            item.id,
            handleEditDefaultContractRow,
            handleDeleteDefaultContractRow,
            () => setOpenMenuRowDefaultContracts(null)
          )}
        />
      </td>
    </tr>
  ))}
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
           )}
      {activeTab === "contractAgent" && (
  <div id="contractAgent-tab" className="active">
    <div className="NewcontractAgent">

      {/* בחירת סוכן למעלה */}
      <div className="filter-select-container">
        <select onChange={handleAgentChange} value={selectedAgentId} className="select-input">
          {detail?.role === "admin" && <option value="">בחר סוכן</option>}
          {detail?.role === "admin" && <option value="all">כל הסוכנות</option>}
          {agents.map(agent => (
            <option key={agent.id} value={agent.id}>{agent.name}</option>
          ))}
        </select>
      </div>

      {/* טאבים פנימיים: חברה -> מוצרים / מוצר -> חברות */}
      <div className="tabs sub-tabs">
        <button
          className={`tab ${agentMode === "byCompany" ? "selected" : "default"}`}
          onClick={() => setAgentMode("byCompany")}
        >
          חברה → כל המוצרים שלה
        </button>
        <button
          className={`tab ${agentMode === "byProduct" ? "selected" : "default"}`}
          onClick={() => setAgentMode("byProduct")}
        >
          מוצר → על החברות
        </button>
      </div>

      {/* מצב 1: חברה -> מוצרים */}
      {agentMode === "byCompany" && (
        <>
          <div className="filter-select-container">
            {/* בחירת חברה */}
            <select
  className="select-input"
  value={selectedCompanyForMatrix}
  onChange={(e) => {
    setSelectedCompanyForMatrix(e.target.value);
    setRowsByCompany([]);
  }}
>
  <option value="">בחר חברה</option>
  {companies.map((companyName, idx) => (
    <option key={idx} value={companyName}>{companyName}</option>
  ))}
</select>
            {/* מוצרים מעניינים (multi-select) */}
            <select
              multiple
              className="select-input"
              value={selectedProductsForCompany}
              onChange={handleProductsForCompanyChange}
            >
              {products.map(product => (
                <option key={product.id} value={product.name}>{product.name}</option>
              ))}
            </select>
          </div>

          <div className="tableContractDefaultMD">
            <table>
              <thead>
                <tr>
                  <th>מוצר</th>
                  <th>מינוי סוכן</th>
                  <th>עמלת היקף</th>
                  <th>עמלת נפרעים</th>
                  <th>עמלת ניוד</th>
                </tr>
              </thead>
              <tbody>
                {rowsByCompany.map(row => (
                  <tr key={`${row.company}___${row.product}`}>
                    <td>{row.product}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.minuySochen}
                        onChange={(e) =>
                          updateRowByCompany(row.product, "minuySochen", e.target.checked)
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={row.commissionHekef}
                        onChange={(e) =>
                          updateRowByCompany(row.product, "commissionHekef", e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={row.commissionNifraim}
                        onChange={(e) =>
                          updateRowByCompany(row.product, "commissionNifraim", e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={row.commissionNiud}
                        onChange={(e) =>
                          updateRowByCompany(row.product, "commissionNiud", e.target.value)
                        }
                      />
                    </td>
                  </tr>
                ))}
                {rowsByCompany.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center" }}>
                      בחרי חברה ומוצרים להצגה
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="newcontractAgentButton">
            <Button
              onClick={saveByCompany}
              text="שמור עמלות לחברה"
              type="primary"
              icon="on"
              state={rowsByCompany.length > 0 ? "default" : "disabled"}
              disabled={rowsByCompany.length === 0}
            />
          </div>
        </>
      )}

      {/* מצב 2: מוצר -> חברות */}
      {agentMode === "byProduct" && (
        <>
          <div className="filter-select-container">
            {/* בחירת מוצר */}
            <select
              className="select-input"
              value={selectedProductForMatrix}
              onChange={(e) => {
                setSelectedProductForMatrix(e.target.value);
                setRowsByProduct([]);
              }}
            >
              <option value="">בחר מוצר</option>
              {products.map(product => (
                <option key={product.id} value={product.name}>{product.name}</option>
              ))}
            </select>

            {/* חברות מעניינות (multi-select) */}
            <select
              multiple
              className="select-input"
              value={selectedCompaniesForProduct}
              onChange={handleCompaniesForProductChange}
            >
              {companies.map((companyName, idx) => (
                <option key={idx} value={companyName}>{companyName}</option>
              ))}
            </select>
          </div>

          <div className="tableContractDefaultMD">
            <table>
              <thead>
                <tr>
                  <th>חברה</th>
                  <th>מינוי סוכן</th>
                  <th>עמלת היקף</th>
                  <th>עמלת נפרעים</th>
                  <th>עמלת ניוד</th>
                </tr>
              </thead>
              <tbody>
                {rowsByProduct.map(row => (
                  <tr key={`${row.company}___${row.product}`}>
                    <td>{row.company}</td>
                    <td>
                      <input
                        type="checkbox"
                        checked={row.minuySochen}
                        onChange={(e) =>
                          updateRowByProduct(row.company, "minuySochen", e.target.checked)
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={row.commissionHekef}
                        onChange={(e) =>
                          updateRowByProduct(row.company, "commissionHekef", e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={row.commissionNifraim}
                        onChange={(e) =>
                          updateRowByProduct(row.company, "commissionNifraim", e.target.value)
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={row.commissionNiud}
                        onChange={(e) =>
                          updateRowByProduct(row.company, "commissionNiud", e.target.value)
                        }
                      />
                    </td>
                  </tr>
                ))}
                {rowsByProduct.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center" }}>
                      בחרי מוצר וחברות להצגה
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="newcontractAgentButton">
            <Button
              onClick={saveByProduct}
              text="שמור עמלות למוצר"
              type="primary"
              icon="on"
              state={rowsByProduct.length > 0 ? "default" : "disabled"}
              disabled={rowsByProduct.length === 0}
            />
          </div>
        </>
      )}

      {toasts.length > 0 && toasts.map((toast) => (
        <ToastNotification
          key={toast.id}
          type={toast.type}
          className={toast.isHiding ? "hide" : ""}
          message={toast.message}
          onClose={() =>
            setToasts(prev => prev.filter(t => t.id !== toast.id))
          }
        />
      ))}
    </div>
  </div>
)}
        {activeTab === "commissionSplit" && (
  <div id="commissionSplit-tab" className="active">
    <div className="filter-select-container">
      <select
        onChange={handleAgentChange}
        value={selectedAgentId}
        className="select-input"
      >
        {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
        {agents.map(agent => (
          <option key={agent.id} value={agent.id}>{agent.name}</option>
        ))}
      </select>
      </div>
      <div className="newSplitCommissionButton">
      <Button
        onClick={() => setIsModalOpenSplit(true)}
        text="הוספת הסכם פיצול"
        type="primary"
        icon="on"
        state="default"
      />
      {/* כפתורי פעולה לשמירה וביטול */}
  <Button
    onClick={saveSplitAgreementChanges}
    text="שמור שינויים"
    type="primary"
    icon="off"
    state={editingRowCommissionSplit ? "default" : "disabled"}
    disabled={!editingRowCommissionSplit}
  />
  <Button
    onClick={cancelEditSplitAgreement}
    text="בטל"
    type="primary"
    icon="off"
    state={editingRowCommissionSplit ? "default" : "disabled"}
    disabled={!editingRowCommissionSplit}
  />
    </div>

    {/* טבלה עם הסכמי פיצול */}
    <div className="tableCommissionSplit">
      <table>
        <thead>
          <tr>
            <th>מקור ליד</th>
            <th>אחוז לסוכן</th>
            <th>אחוז למקור ליד</th>
            <th>סוג הסכם</th>
            <th>פעולות</th>
          </tr>
        </thead>
        <tbody>
  {commissionSplits.map((item) => {
    const lead = sourceLeads.find(l => l.id === item.sourceLeadId);
    return (
      <tr key={item.id}>
        {/* מקור ליד */}
        <td>
          {editingRowCommissionSplit === item.id ? (
            <select
              value={editCommissionSplitData.sourceLeadId || ''}
              onChange={(e) =>
                handleEditCommissionSplitChange("sourceLeadId", e.target.value)
              }
            >
              <option value="">בחר מקור ליד</option>
              {sourceLeads.map((lead) => (
                <option key={lead.id} value={lead.id}>{lead.sourceLead}</option>
              ))}
            </select>
          ) : (
            lead?.sourceLead || '—'
          )}
        </td>

        {/* אחוז לסוכן */}
        <td>
          {editingRowCommissionSplit === item.id ? (
            <input
              type="number"
              value={editCommissionSplitData.percentToAgent ?? ''}
              onChange={(e) =>
                handleEditCommissionSplitChange("percentToAgent", Number(e.target.value))
              }
            />
          ) : (
            `${item.percentToAgent}%`
          )}
        </td>

        {/* אחוז למקור ליד */}
        <td>
          {editingRowCommissionSplit === item.id ? (
            <input
              type="number"
              value={editCommissionSplitData.percentToSourceLead ?? ''}
              onChange={(e) =>
                handleEditCommissionSplitChange("percentToSourceLead", Number(e.target.value))
              }
            />
          ) : (
            `${item.percentToSourceLead}%`
          )}
        </td>
        <td>
          {editingRowCommissionSplit === item.id ? (
            <select
              value={editCommissionSplitData.splitMode || 'commission'}
              onChange={(e) =>
                handleEditCommissionSplitChange("splitMode", e.target.value as 'commission' | 'production')
              }
            >
              <option value="commission">פיצול עמלות</option>
              <option value="production">פיצול תפוקות</option>
            </select>
          ) : (
            item.splitMode === 'production' ? 'פיצול תפוקות' : 'פיצול עמלות'
          )}
        </td>
        {/* פעולות */}
        <td>
          <MenuWrapper
            rowId={item.id}
            openMenuRow={openMenuRowCommissionSplit}
            setOpenMenuRow={setOpenMenuRowCommissionSplit}
            menuItems={menuItems(
              item.id,
              handleEditCommissionSplitRow,
              handleDeleteCommissionSplitRow,
              () => setOpenMenuRowCommissionSplit(null)
            )}
          />
        </td>
      </tr>
    );
  })}
</tbody>
      </table>
    </div>

    {/* מודל להזנה */}
    {isModalOpenSplit && (
      <div className="modal">
        <div className="modal-content">
          <button className="close-button" onClick={() => setIsModalOpenSplit(false)}>✖</button>
          <div className="modal-title">הוספת הסכם פיצול</div>
          <form onSubmit={handleSubmitSplitForm} className="form-container">
            <div className="form-group">
              <label>מקור ליד</label>
              <select
                value={selectedSourceLeadId}
                onChange={(e) => setSelectedSourceLeadId(e.target.value)}
              >
                <option value="">בחר מקור ליד</option>
                {sourceLeads.map((lead) => (
                  <option key={lead.id} value={lead.id}>{lead.sourceLead}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>אחוז לסוכן</label>
              <input
                type="number"
                value={percentToAgent}
                onChange={(e) => setPercentToAgent(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>אחוז למקור ליד</label>
              <input
                type="number"
                value={percentToSourceLead}
                onChange={(e) => setPercentToSourceLead(e.target.value)}
              />
            </div>
                 {/* בתוך המודל של הוספת הסכם פיצול */}
<div className="form-group">
  <label>סוג הסכם</label>
  <select
    value={splitMode}
    onChange={(e) => setSplitMode(e.target.value as 'commission' | 'production')}
  >
    <option value="commission">פיצול עמלות</option>
    <option value="production">פיצול תפוקות</option>
  </select>
</div>
            <div className="button-group">
              <Button
                onClick={handleSubmitSplitForm}
                text="שמור"
                type="primary"
                icon="on"
                state="default"
              />
              <Button
                onClick={() => setIsModalOpenSplit(false)}
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
  </div>
)} 
      </div>
    </div>

      )};

export default NewManageContracts;