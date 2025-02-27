import { ChangeEventHandler, FormEventHandler, SetStateAction, useEffect, useState } from "react";
import { collection, query,setDoc, where, getDocs,getDoc, addDoc, deleteDoc, doc, updateDoc,DocumentSnapshot, DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase"; // Ensure this path matches your project structure
import { useAuth } from '@/lib/firebase/AuthContext';
import Link from "next/link";
import './NewGoals.css';
import useFetchAgentData from "@/hooks/useFetchAgentData"; 
import useGoalsMD from "@/hooks/useGoalsMD"; 
import useFetchMD from "@/hooks/useMD"; 
import { Button } from "@/components/Button/Button";
import MenuWrapper from "@/components/MenuWrapper/MenuWrapper";
import Edit from '@/components/icons/Edit/Edit'; 
import Delete  from '@/components/icons/Delete/Delete'; 
import useEditableTable from "@/hooks/useEditableTable";
import { PromotionWithId, PromotionMapping,StarDataType, GoalDataType } from '@/types/Goal'; // טיפוסים
import fetchPromotionsForAgent from '@/services/fetchPromotionsForAgent'; // פונקציות
import { createPromotionsMap } from "@/services/createPromotionsMap";
import fetchStarsForAgent from '@/services/fetchStarsForAgent'; // פונקציות
import {fetchGoalsSuccessForAgent} from '@/services/fetchGoalsSuccessForAgent'; // פונקציות




const NewGoals: React.FC = () => {

const { user, detail } = useAuth();
const [selectedRow, setSelectedRow] = useState<any | null>(null);

const [isEditing, setIsEditing] = useState(false);
const [goalsSuccessList, setGoalsSuccessList] = useState<GoalDataType[]>([]);

const [status, setStatus] =  useState(false);
const [amaunt, setAmaunt] = useState<number>(0);  
const [selectedRowPromotion, setSelectedRowPromotion] = useState<any | null>(null);
const [selectedRowStars, setSelectedRowStars] = useState<any | null>(null);
const [isEditingPromotion, setIsEditingPromotion] = useState(false);
const [isEditingStars, setIsEditingStars] = useState(false);
const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
const [promotionName, setPromotionName] = useState<string | null>(null);
const [promotionStatus, setPromotionStatus] =  useState(false);
const [promotionMonthlyRepeat, setPromotionMonthlyRepeat] =  useState(false);
const [promotionStartDate, setPromotionStartDate] =  useState('');
const [promotionEndDate, setPromotionEndDate] =  useState('');
const [promotionList, SetPromotionList] = useState<any[]>([]);
const [insuranceStar, setInsuranceStar] = useState<number | null>(null);
const [pensiaStar, setPensiaStar] = useState<number | null>(null);
const [finansimStar, setFinansimStar] = useState<number | null>(null);
const [promotionId, setPromotionId] = useState<string | null>(null);
const [promotionListForStars, setPromotionListForStars] = useState<PromotionMapping>({});

const handlePromotionStartDate = (e: React.ChangeEvent<HTMLInputElement>) => setPromotionStartDate(e.target.value);
const handlePromotionEndDate = (e: React.ChangeEvent<HTMLInputElement>) => setPromotionEndDate(e.target.value)

const [sortCriteria] = useState<'worker' | 'promotion' | 'startDate'>('startDate'); // Default: Start Date
const [sortOrder] = useState<'asc' | 'desc'>('asc'); // Default: Ascending


const [isDropdownOpen, setIsDropdownOpen] = useState(false);
const [openDropdownRow, setOpenDropdownRow] = useState<string | null>(null);

const [activeTab, setActiveTab] = useState("goalsMD");
const [goals, setGoals] = useState<GoalDataType[]>([]);



const [openMenuRowPromotions, setOpenMenuRowPromotions] = useState<string | null>(null);
const [openMenuRowStars, setOpenMenuRowStars] = useState<string | null>(null);
const [openMenuRowGoals, setOpenMenuRowGoals] = useState<string | null>(null);


const { 
    agents, 
    selectedAgentId, 
    handleAgentChange, 
    handleWorkerChange,
    workers,
    selectedWorkerId,
    setSelectedWorkerName,
    setSelectedWorkerId, 
    fetchWorkersForSelectedAgent,
    workerNameMap,
    companies, selectedCompany, 
    selectedCompanies,
    setSelectedCompanies,
    setSelectedCompany

  } = useFetchAgentData();

 
const {   
    promotionValue,
    setPromotionValue,
    handleSelectPromotion,
    goalsTypeList,
    handleSelectGoalsType,
    goalsTypeValue,
    setGoalsTypeValue,
    goalsTypeMap,
    duplicateGoalsForNextMonth
} = useGoalsMD();


const {
  formatIsraeliDateOnly
} = useFetchMD();


// // Filter companies based on the search query
// const filteredCompanies = companies.filter(company =>
//   company.toLowerCase().includes(searchQuery.toLowerCase())
// );


const handleCompanyToggle = (company: string) => {
  if (selectedCompanies.includes(company)) {
    setSelectedCompanies(selectedCompanies.filter((c) => c !== company));
  } else {
    setSelectedCompanies([...selectedCompanies, company]);
  }
};

const {
  data: promotionsData,
  editingRow: editingPromotionRow,
  editData: editPromotionData,
  handleEditRow: handleEditPromotionRow,
  handleEditChange: handleEditPromotionChange,
  handleDeleteRow: handleDeletePromotionRow,
  saveChanges: savePromotionChanges,
  reloadData: reloadPromotionsData,
  cancelEdit: cancelEditPromotion, // פונקציה חדשה
} = useEditableTable({
  dbCollection: "promotion",
  agentId: selectedAgentId,
  fetchData: fetchPromotionsForAgent, // פונקציית שליפה
});

const {
  data: starsData,
  editingRow: editingStarRow,
  editData: editStarData,
  handleEditRow: handleEditStarRow,
  handleEditChange: handleEditStarChange,
  handleDeleteRow: handleDeleteStarRow,
  saveChanges: saveStarChanges,
  reloadData: reloadStarsData,
  cancelEdit: cancelEditStar, // פונקציה חדשה
} = useEditableTable<StarDataType>({
  dbCollection: "stars",
  agentId: selectedAgentId,
  fetchData: fetchStarsForAgent, // פונקציית שליפה
});

const {
  data: goalsData,
  editingRow: editingGoalRow,
  editData: editGoalData,
  handleEditRow: handleEditGoalRow,
  handleEditChange: handleEditGoalChange,
  handleDeleteRow: handleDeleteGoalRow,
  saveChanges: saveGoalChanges,
  reloadData: reloadGoalsData,
  cancelEdit: cancelEditGoal, 
} = useEditableTable<GoalDataType>({
  dbCollection: 'goalsSuccess',
  agentId: selectedAgentId,
  fetchData: async (agentId) => {
    const data = await fetchGoalsSuccessForAgent(agentId); // ✅ כאן אנו משתמשים בפונקציה
    console.log("✅ GoalsData received in useEditableTable:", data);
    return data;
  },
});

useEffect(() => {
  if (!selectedAgentId) return;
  
  console.log("🔄 Fetching goals data for selectedAgentId:", selectedAgentId);
  reloadGoalsData(selectedAgentId); // ריענון הנתונים בכל פעם שסוכן נבחר
}, [selectedAgentId]);

useEffect(() => {
  console.log("🧐 Updating goals state with goalsData:", goalsData);
  if (goalsData && goalsData.length > 0) {
    setGoals(goalsData); // מעדכן את הסטייט
  }
}, [goalsData]); // ירוץ כל פעם שהנתונים יתעדכנו


//עבור עריכת חברות בטבלת יעדים
const handleEditCompanyToggle = (company: string) => {
  const updatedCompanies = (editPromotionData.companies || []).includes(company)
    ? (editPromotionData.companies || []).filter((c) => c !== company)
    : [...(editPromotionData.companies || []), company];

  handleEditPromotionChange("companies", updatedCompanies);
}

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


// הועבר לSERVICE 
// const fetchPromotionsForAgent = async (UserAgentId: string) => {
//   const q = query(
//     collection(db, 'promotion'), 
//     where('AgentId', '==', UserAgentId)
//   );
//   try {
//     const querySnapshot = await getDocs(q);
//     promotionList.length = 0; // Clear the array before adding new data
//     const promotionsMap: PromotionMapping = {};
//     if (querySnapshot.empty) {
//       SetPromotionList([]); // Clear the state if no promotions are found
//       console.log('No promotions found for agent:', UserAgentId);
//       setPromotionListForStars({}); // Clear the state if no promotions are found
//     } else {
//       querySnapshot.forEach(doc => {
//         const data = doc.data() as PromotionData;
//         SetPromotionList(prev => [...prev, { id: doc.id, ...data }]);
//         if (typeof data.promotionName === 'string') {
//           promotionsMap[doc.id] = data.promotionName;
//         } else {
//           console.error('Promotion name missing or invalid for document:', doc.id);
//         }
//       });
//       setPromotionListForStars(promotionsMap); // Store the mapping
//       console.log('Promotions fetched and mapped:', promotionsMap);
//     }
//   } catch (error) {
//     console.error('Error fetching promotions:', error);
//     setPromotionListForStars({}); // Clear the state in case of error
//   }
// };

 // משרת את יצירת מפת שמות המבצעים לאחר שליפת מבצעים
const fetchPromotions = async () => {
  if (!selectedAgentId) return;
  try {
    const promotions = await fetchPromotionsForAgent(selectedAgentId); // שליפת הקידומים
    SetPromotionList(promotions); // עדכון הרשימה בטבלה
    // יצירת המפה מתוך הרשימה
    const promotionsMap = createPromotionsMap(promotions);
    setPromotionListForStars(promotionsMap); // עדכון המפה לטבלאות אחרות
  } catch (error) {
    console.error('Error fetching promotions:', error);
    // טיפול בשגיאות
    SetPromotionList([]);
    setPromotionListForStars({});
  }
};


  // קריאה לפונקציה בעת שינוי הסוכן הנבחר
  useEffect(() => {
    fetchPromotions();
  }, [selectedAgentId]);



// const fetchGoalsSuccessForAgent = async (UserAgentId: string) => {
//   const q = query(
//     collection(db, 'goalsSuccess'), 
//     where('AgentId', '==', UserAgentId)
//   );
//   const querySnapshot = await getDocs(q);
//   const data = querySnapshot.docs.map(doc => ({
//       id: doc.id, 
//       ...doc.data() 
//     }));
//     setGoalsSuccessList(data);
//   };



  // const handleRowClick = (item: any) => {
  //   setSelectedRow(item); 
  //   if (item.workerId === 'all-agency') {
  //     setSelectedWorkerId('all-agency');
  //     setSelectedWorkerName('כל הסוכנות');  
  // } else {
  //   const workerName = workerNameMap[item.workerId];
  //   if (workerName) {
  //       setSelectedWorkerId(item.workerId);
  //       setSelectedWorkerName(workerName);
  //   } else {
  //       // Handle case where the worker is not found - maybe clear or set default values
  //       setSelectedWorkerId('');
  //       setSelectedWorkerName('Unknown Worker');
  //   }
  // }
  //   const promotionValue = promotionListForStars[item.promotionId]; 
  //   if (promotionValue) {
  //       setPromotionValue(item.promotionId);
  //   } else {
  //       setPromotionValue('');
  //   }
  //   const goalsTypeValue = goalsTypeMap[item.goalsTypeId];
  //   if (goalsTypeValue) {
  //       setGoalsTypeValue(item.goalsTypeId);
  //   } else {
  //       setGoalsTypeValue('');
  //   } 
  //   setStatus(item.status || false);
  //   setAmaunt(item.amaunt || 0);
  // };

  
  // const handleDelete = async () => {
  //   if (selectedRow && selectedRow.id) {
  //     await deleteDoc(doc(db, 'goalsSuccess', selectedRow.id));
  //     setSelectedRow(null); // Reset selection
  //     resetForm();
  //     setIsEditing(false);
  //     if (selectedAgentId) {
  //       fetchGoalsSuccessForAgent(selectedAgentId);
  //     }
  //   } else {
  //     console.log("No selected row or row ID is undefined");
  //   }
  // };

  // const handleEdit = async () => {
  //   if (selectedRow && selectedRow.id) {
  //     try {
  //       const docRef = doc(db, 'goalsSuccess', selectedRow.id); 
  //       await updateDoc(docRef, {        
  //         workerId: selectedWorkerId,
  //         promotionId: promotionValue,
  //         goalsTypeId: goalsTypeValue,
  //         amaunt: amaunt,
  //         status: status
  //       });
  //       console.log("Document successfully updated");
  //       setSelectedRow(null); 
  //       resetForm();         
  //       if (selectedAgentId) {
  //           fetchGoalsSuccessForAgent(selectedAgentId);
  //         }
  //     } catch (error) {
  //       console.error("Error updating document:", error);     
  //     }
  //   } else {
  //     console.log("No row selected or missing document ID");
  //   }
  // };


  const resetForm = () => {
  setAmaunt(0);
  setGoalsTypeValue(null);
  setPromotionValue(null);
  setSelectedWorkerId('');

  };


  // const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
  //   try {
  //   event.preventDefault();
  //       const docRef = await addDoc(collection(db, 'goalsSuccess'), {
  //       AgentId: selectedAgentId,
  //       workerId: selectedWorkerId,
  //       promotionId: promotionValue,
  //       goalsTypeId: goalsTypeValue,
  //       amaunt: amaunt || 0,
  //       status: status
  //       });
  //     alert('התווסף בהצלחה');
  //     console.log('Document written with ID:', docRef.id);
  //     resetForm(); 
  //     setIsEditing(false);
  //     if (selectedAgentId) {
  //       fetchGoalsSuccessForAgent(selectedAgentId);
  //     }
      
  //   } catch (error) {
  //     console.error('Error adding document:', error);
  //   }
  // };
  
  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    try {
      event.preventDefault();
  
      if (!promotionValue) {
        alert('Please select a promotion.');
        return; // Prevent submission if no promotion is selected
      }
      const promotionRef = doc(db, 'promotion', promotionValue);
      const promotionDoc = await getDoc(promotionRef);
      if (!promotionDoc.exists()) {
        alert('Promotion not found!');
        return;
      }
      const promotionData = promotionDoc.data();
      const newGoal: any = {
        AgentId: selectedAgentId || '', 
        workerId: selectedWorkerId || '',
        promotionId: promotionValue, 
        goalsTypeId: goalsTypeValue || '',
        amaunt: amaunt || 0,
        status: status || 'pending',
      };
      if (promotionData.promotionMonthlyRepeat) {
        const now = new Date(); // Current local date
      
        // Calculate the first and last day of the current month
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1); // First day of the month
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0); // Last day of the month
      
        // Format the date as YYYY-MM-DD to avoid time zone issues
        const formatDate = (date: Date) =>
          `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      
        // Assign the formatted start and end dates to the new goal
        newGoal.startDate = formatDate(startOfMonth); // e.g., "2024-12-01"
        newGoal.endDate = formatDate(endOfMonth); // e.g., "2024-12-31"
      }
  
      const docRef = await addDoc(collection(db, 'goalsSuccess'), newGoal);
  
      alert('Goal added successfully!');
      console.log('Document written with ID:', docRef.id);
  
      resetForm();
      setIsEditing(false);
      if (selectedAgentId) {
        fetchGoalsSuccessForAgent(selectedAgentId);
      }
    } catch (error) {
      console.error('Error adding document:', error);
    }
  };
  
  // const fetchStarsForAgent = async (UserAgentId: string): Promise<StarDataType[]> => {
  //   const q = query(
  //     collection(db, 'stars'),
  //     where('AgentId', '==', UserAgentId)
  //   );
  
  //   const querySnapshot = await getDocs(q);
  //   const data = querySnapshot.docs.map((doc) => ({
  //     id: doc.id,
  //     ...doc.data(),
  //   })) as StarDataType[];
  
  //   setStarsList(data); // אם הסטייט עדיין קיים
  //   return data;
  // };
  



// const handleRowClickPromotion = (item: any) => {
// setSelectedRowPromotion(item); // Store the selected row's data
// setPromotionName(item.promotionName || '');
// setPromotionStatus(item.promotionStatus || '');
// setPromotionMonthlyRepeat(item.promotionMonthlyRepeat || '');
// setPromotionStartDate(item.promotionStartDate || '');
// setPromotionEndDate(item.promotionEndDate || '');
// setSelectedCompanies(item.companies || []); // Store the selected companies
// };



// const handleRowClickStars = (item: any) => {
// setSelectedRowStars(item); // Store the selected row's data
// const promotionValue = promotionListForStars[item.promotionId]; 
// if (promotionValue) {
//     setPromotionValue(item.promotionId);
// } else {
//     setPromotionValue('');
// }
// setInsuranceStar(item.insuranceStar || 0);
// setPensiaStar(item.pensiaStar || 0);
// setFinansimStar(item.finansimStar || 0);
// setPromotionId(item.promotionId || '');
// };



// const handleDeletePromotion = async () => {
// if (selectedRowPromotion && selectedRowPromotion.id) {
// await deleteDoc(doc(db, 'promotion', selectedRowPromotion.id));
// setSelectedRowPromotion(null); // Reset selection
// resetFormPromotion();
// setIsEditingPromotion(false);
// if (selectedAgentId) {
//   fetchPromotionsForAgent(selectedAgentId);
// }
// } else {
// console.log("No selected row or row ID is undefined");
// }
// };

// const handleDeleteStars = async () => {
// if (selectedRowStars && selectedRowStars.id) {
// await deleteDoc(doc(db, 'stars', selectedRowStars.id));
// setSelectedRowStars(null); // Reset selection
// resetFormStars();
// setIsEditingStars(false);
// if (selectedAgentId) {
//   fetchStarsForAgent(selectedAgentId);
// }
// } else {
// console.log("No selected row or row ID is undefined");
// }
// };



// const handleEditPromotion = async () => {
// if (selectedRowPromotion && selectedRowPromotion.id) {
// try {
//   const docRef = doc(db, 'promotion', selectedRowPromotion.id); 
//   await updateDoc(docRef, {        
//     promotionName,
//     promotionStatus:!!promotionStatus,
//     promotionMonthlyRepeat:!!promotionMonthlyRepeat,
//     promotionStartDate,
//     promotionEndDate,
//     companies: selectedCompanies
//   });
//   console.log("Document successfully updated");
//   setSelectedRowPromotion(null); 
//   resetFormPromotion();         
//   if (selectedAgentId) {
//       fetchPromotionsForAgent(selectedAgentId);
//     }
// } catch (error) {
//   console.error("Error updating document:", error);     
// }
// } else {
// console.log("No row selected or missing document ID");
// }
// };


// const handleEditStars = async () => {
// if (selectedRowStars && selectedRowStars.id) {
// try {
//   const docRef = doc(db, 'stars', selectedRowStars.id); 
//   await updateDoc(docRef, {        
//     insuranceStar,
//     pensiaStar,
//     finansimStar,
//     promotionId: promotionValue
//   });
//   console.log("Document successfully updated");
//   setSelectedRowStars(null); 
//   resetFormStars();         
//   if (selectedAgentId) {
//       fetchStarsForAgent(selectedAgentId);
//     }
// } catch (error) {
//   console.error("Error updating document:", error);     
// }
// } else {
// console.log("No row selected or missing document ID");
// }
// };


const resetFormPromotion = () => {
setPromotionName('');
setPromotionStatus(false);
setPromotionMonthlyRepeat(false);
setPromotionStartDate('');
setPromotionEndDate('');
setSelectedCompanies([]); // Clear selected companies
};


const resetFormStars = () => {
setPromotionValue('');
setInsuranceStar(0);
setPensiaStar(0);
setFinansimStar(0);
setPromotionId('');
};

const handleSubmitPromotion: FormEventHandler<HTMLFormElement> = async (event) => {
  try {
    event.preventDefault();

    // הוספת מסמך חדש ל-Firestore
    const docRef = await addDoc(collection(db, 'promotion'), {
      AgentId: selectedAgentId,
      promotionName: promotionName,
      promotionStatus: promotionStatus,
      promotionMonthlyRepeat: promotionMonthlyRepeat,
      promotionStartDate: promotionStartDate,
      promotionEndDate: promotionEndDate,
      companies: selectedCompanies,
    });
    alert('מבצע התווסף בהצלחה');
    console.log('Document written with ID:', docRef.id);
    // איפוס הטופס
    resetFormPromotion();
    setIsEditingPromotion(false);
    // קריאה לעדכון הנתונים ב-Hook
    if (selectedAgentId) {
      reloadPromotionsData(selectedAgentId); // קריאה ל-Hook לעדכון הטבלה
    }
  } catch (error) {
    console.error('Error adding document:', error);
  }
};


const handleSubmitStars: FormEventHandler<HTMLFormElement> = async (event) => {
try {
event.preventDefault();
  const docRef = await addDoc(collection(db, 'stars'), {
  AgentId: selectedAgentId,
  promotionId: promotionValue,
  insuranceStar: insuranceStar,
  pensiaStar: pensiaStar,
  finansimStar: finansimStar,
});
console.log('promotionValue:',promotionValue);
alert('התווסף בהצלחה');
console.log('Document written with ID:', docRef.id);
resetFormStars(); 
setIsEditingStars(false);
if (selectedAgentId) {
  fetchStarsForAgent(selectedAgentId);
}

} catch (error) {
console.error('Error adding document:', error);
}
};


useEffect(() => {
  const fetchData = async () => {
    if (!selectedAgentId) return;
    try {
      // שליפת קידומים
      const promotions = await fetchPromotionsForAgent(selectedAgentId);
      SetPromotionList(promotions); // עדכון רשימת הקידומים
      const promotionsMap = createPromotionsMap(promotions); // יצירת מפת הקידומים
      setPromotionListForStars(promotionsMap); // עדכון מפת הקידומים
      // שליפת כוכבים
      await fetchStarsForAgent(selectedAgentId);
      // שליפת יעדים שהושגו
      await fetchGoalsSuccessForAgent(selectedAgentId);
      console.log('Fetching data for agent:', selectedAgentId);
    } catch (error) {
      console.error('Error fetching data for agent:', error);
      // טיפול בשגיאות אם יש צורך
      SetPromotionList([]);
      setPromotionListForStars({});
    }
  };

  fetchData();
}, [selectedAgentId]);



const [isProcessing, setIsProcessing] = useState(false); // Track loading state
  const [message, setMessage] = useState<string | null>(null); // Track success/error message


  const handleDuplicateGoals = async () => {
    setIsProcessing(true);
    setMessage(null); // Clear previous messages
    try {
      await duplicateGoalsForNextMonth(selectedAgentId); // Call your function
      setMessage('Goals successfully duplicated for the next month!');
    } catch (error) {
      console.error('Error duplicating goals:', error);
      setMessage('An error occurred while duplicating goals.');
    } finally {
      setIsProcessing(false);
    }
  };

  // const sortedGoalsSuccessList = [...goalsSuccessList].sort((a, b) => {
  //   const orderMultiplier = sortOrder === 'asc' ? 1 : -1;

  //   switch (sortCriteria) {
  //     case 'worker':
  //       const workerA = a.workerId === 'all-agency' ? 'כל הסוכנות' : workerNameMap[a.workerId] || 'Unknown Worker';
  //       const workerB = b.workerId === 'all-agency' ? 'כל הסוכנות' : workerNameMap[b.workerId] || 'Unknown Worker';
  //       return workerA.localeCompare(workerB) * orderMultiplier;

  //     case 'promotion':
  //       const promotionA = promotionListForStars[a.promotionId] || 'Unknown Promotion';
  //       const promotionB = promotionListForStars[b.promotionId] || 'Unknown Promotion';
  //       return promotionA.localeCompare(promotionB) * orderMultiplier;

  //     case 'startDate':
  //       if (!a.startDate && !b.startDate) return 0; // Both N/A
  //       if (!a.startDate) return 1 * orderMultiplier; // N/A goes to the bottom
  //       if (!b.startDate) return -1 * orderMultiplier; // N/A goes to the bottom
  //       return a.startDate.localeCompare(b.startDate) * orderMultiplier;

  //     default:
  //       return 0; // Default: no sorting
  //   }
  // });

  const [isModalOpenNewGoal, setIsModalOpenNewGoal] = useState(false);

  const handleOpenModalNewGoal = () => {
    setIsModalOpenNewGoal(true);
  };

  const handleCloseModalNewGoal = () => {
    setIsModalOpenNewGoal(false);
  };

  const [isModalOpenNewStars, setIsModalOpenNewStars] = useState(false);

  const handleOpenModalNewStars = () => {
    setIsModalOpenNewStars(true);
  };

  const handleCloseModalNewStars = () => {
    setIsModalOpenNewStars(false);
  };


  const [isModalOpenGoalWorker, setIsModalOpenGoalWorker] = useState(false);

  const handleOpenModalGoalWorker = () => {
    setIsModalOpenGoalWorker(true);
  };

  const handleCloseModalGoalWorker = () => {
    setIsModalOpenGoalWorker(false);
  };


  // const handleSubmitPromotion = (e) => {
  //   e.preventDefault();
  //   // Add your form submission logic here
  //   console.log("Form submitted");
  // };


// ✅ בדיקה לפני הרינדור
if (!goals || goals.length === 0) {
  console.log("⏳ Waiting for goals to load...");
  return <p>טוען נתונים...</p>;
}

  return (
    <div className="content-container">
      <div className="table-header">
        <div className="table-title">ניהול יעדים ומבצעים</div>
        <div className="tabs-container">
        <div className="tabs">
        <button
          className={`tab  ${activeTab === "goalsMD" ? "selected" : "default"}`}
          onClick={() => {
            console.log("Switching to goalsMD");
            setActiveTab("goalsMD");
          }}
         >
          הגדרת יעדים ומבצעים
                  </button>
        <button
          className={`tab  ${activeTab === "GoalsWorkers" ? "selected" : "default"}`}
          onClick={() => {
            console.log("Switching to GoalsWorkers");
            setActiveTab("GoalsWorkers");
          }}
        >
          הקצאת יעדים ומבצעים לעובד
        </button>
      </div>
        </div>
        </div>
      {/* תוכן הלשוניות */}
      <div className="tab-content">
        {activeTab === "goalsMD" && (
          <div id="goals-tab" className={activeTab === "goalsMD" ? "active" : ""}>
            {/* תוכן לשונית הקצאת יעדים */}
            <div className="NewGoalsMD">
  <div className="newGoalButton">
  <div className="filter-select-container">
             <select onChange={handleAgentChange} value={selectedAgentId} className="select-input">
              {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
              {detail?.role === 'admin' && <option value="all">כל הסוכנות</option>}
              {agents.map(agent => (
               <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
             </select>
      </div>
  <Button
    onClick={handleOpenModalNewGoal}
    text="יעד חדש"
    type="primary"
    icon="on"
    state="default"
  />
  {/* כפתור לשמירת שינויים */}
  <Button
    onClick={savePromotionChanges}
    text="שמור שינויים"
    type="primary"
    icon="off"
    state={editingPromotionRow ? "default" : "disabled"}
    disabled={!editingPromotionRow}
  />
  <Button
  onClick={cancelEditPromotion}
  text=" בטל"
  type="primary"
  icon="off"
  state={editingPromotionRow ? "default" : "disabled"}
  disabled={!editingPromotionRow}
/>
</div>
  {/* המודל */}
  {isModalOpenNewGoal && (
    <div className="modal">
      <div className="modal-content">
      <button className="close-button" onClick={() => setIsModalOpenNewGoal(false)}>
    ✖
  </button>
        <div className="title">יעד חדש</div>
        <form onSubmit={handleSubmitPromotion} className="form-container">
  <div className="form-group">
    <label htmlFor="agentSelect">סוכנות</label>
    <select
      id="agentSelect"
      onChange={handleAgentChange}
      value={selectedAgentId}
    >
      {detail?.role === "admin" && <option value="">בחר סוכן</option>}
      {agents.map((agent) => (
        <option key={agent.id} value={agent.id}>
          {agent.name}
        </option>
      ))}
    </select>
  </div>
  <div className="form-group">
    <label htmlFor="promotionName">שם המבצע</label>
    <input
      type="text"
      id="promotionName"
      name="promotionName"
      value={promotionName || ""}
      onChange={(e) => setPromotionName(e.target.value)}
    />
  </div>
  <div className="form-group">
    <label>בחר חברות</label>
    <div className="dropdown-container">
      <span
        className="dropdown-header"
        onClick={() => setIsDropdownOpen((prev) => !prev)}
      >
        {selectedCompanies.length > 0
          ? selectedCompanies.join(", ")
          : "כל החברות"}
        <span
          className={`dropdown-arrow ${
            isDropdownOpen ? "open" : "closed"
          }`}
        >
          ▼
        </span>
      </span>
      {isDropdownOpen && (
        <div className="dropdown-list">
          {companies.map((company, index) => (
            <label key={index} className="dropdown-item">
              <input
                type="checkbox"
                value={company}
                checked={selectedCompanies.includes(company)}
                onChange={() => handleCompanyToggle(company)}
              />
              {company}
            </label>
          ))}
        </div>
      )}
    </div>
  </div>
  <div className="form-group">
  <div className="checkbox-container">
    <input
      type="checkbox"
      id="promotionMonthlyRepeat"
      name="promotionMonthlyRepeat"
    />
    <label htmlFor="promotionMonthlyRepeat">מתחדש חודשי</label>
  </div>
</div>
  <div className="form-group">
    <label htmlFor="promotionStartDate">תאריך התחלה</label>
    <input
      type="date"
      id="promotionStartDate"
      name="promotionStartDate"
      value={promotionStartDate}
      onChange={handlePromotionStartDate}
    />
  </div>
  <div className="form-group">
    <label htmlFor="promotionEndDate">תאריך סיום</label>
    <input
      type="date"
      id="promotionEndDate"
      name="promotionEndDate"
      value={promotionEndDate}
      onChange={handlePromotionEndDate}
    />
  </div>
  <div className="form-group">
  <div className="checkbox-container">
    <input
      type="checkbox"
      id="promotionStatus"
      name="promotionStatus"
      checked={promotionStatus}
      onChange={(e) => setPromotionStatus(e.target.checked)}
    />
    <label htmlFor="promotionStatus">פעיל</label>
  </div>
</div>
  <div className="button-group">
    <Button
      onClick={handleSubmitPromotion}
      text="הזן"
      type="primary"
      icon="on"
      state={isEditingPromotion ? "disabled" : "default"}
      disabled={isEditingPromotion}
    />
    <Button
      onClick={handleCloseModalNewGoal}
      text="בטל"
      type="primary"
      icon="off"
      state="default"
    />
  </div>
</form>
      </div>
    </div>
  )}
  {/* טבלת היעדים */}
  <div className="tableGoalsMD">
     
    <table>
      <thead>
        <tr>
          <th>שם מבצע</th>
          <th>חברות</th>
          <th>מתחדש</th>
          <th>תאריך התחלה</th>
          <th>תאריך סיום</th>
          <th>סטאטוס</th>
          <th className="narrow-cell">🔧</th>
        </tr>
      </thead>    
      <tbody>
  {promotionsData.map((item) => (
        <tr key={item.id} className={editingPromotionRow === item.id ? "editing-row" : ""}>
      <td>
        {editingPromotionRow === item.id ? (
          <input
            type="text"
            value={editPromotionData.promotionName || ""}
            onChange={(e) => handleEditPromotionChange("promotionName", e.target.value)}
          />
        ) : (
          item.promotionName
        )}
      </td>
      <td>
  {editingPromotionRow === item.id ? (
    <div style={{ position: "relative" }}>
      {/* תיבה עם רקע ומסגרת תואמים */}
      <div
        onClick={() =>
          setOpenDropdownRow(item.id === openDropdownRow ? null : item.id)
        }
        style={{
          border: openDropdownRow === item.id ? "1px solid #007bff" : "1px solid #ccc",
          borderRadius: "4px",
          padding: "5px",
          cursor: "pointer",
          backgroundColor: "#f8f8f8", // רקע תואם לשאר השדות
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "32px",
        }}
      >
        <span style={{ textAlign: "right", flexGrow: 1 }}>
          {(editPromotionData.companies || []).length > 0
            ? (editPromotionData.companies || []).join(", ")
            : "בחר חברות"}
        </span>
        <span
          style={{
            fontSize: "10px", // הקטנת החץ
            marginLeft: "10px",
            transform: openDropdownRow === item.id ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▼
        </span>
      </div>

      {/* רשימת האפשרויות */}
      {openDropdownRow === item.id && (
        <div
          style={{
            position: "absolute",
            border: "1px solid #ccc",
            borderRadius: "4px",
            backgroundColor: "#f8f8f8",
            maxHeight: "150px",
            overflowY: "auto",
            zIndex: 10,
            width: "100%",
            boxShadow: "0px 2px 5px rgba(0,0,0,0.2)",
          }}
        >
          {companies.map((company, index) => (
            <label
              key={index}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "5px 10px",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                value={company}
                checked={(editPromotionData.companies || []).includes(company)}
                onChange={() => handleEditCompanyToggle(company)}
                style={{
                  marginRight: "10px",
                  transform: "scale(0.9)", // הקטנת ה-checkbox
                  cursor: "pointer",
                }}
              />
              {company}
            </label>
          ))}
        </div>
      )}
    </div>
  ) : (
    // מצב רגיל: חברות מופרדות בפסיק או ריק
    item.companies?.join(", ") || " "
  )}
</td>
      <td>
        {editingPromotionRow === item.id ? (
          <input
            type="checkbox"
            checked={editPromotionData.promotionMonthlyRepeat || false}
            onChange={(e) =>
              handleEditPromotionChange(
                "promotionMonthlyRepeat",
                e.target.checked
              )
            }
          >
          </input>
        ) : (
          item.promotionMonthlyRepeat ? "✔️" : "❌"
        )}
      </td>
      <td>
  {editingPromotionRow === item.id ? (
    <input
      type="date"
      value={
        editPromotionData.promotionStartDate
          ? new Date(editPromotionData.promotionStartDate)
              .toISOString()
              .split("T")[0] // מתאם את הפורמט ל-YYYY-MM-DD עבור input
          : ""
      }
      onChange={(e) =>
        handleEditPromotionChange("promotionStartDate", e.target.value)
      }
    />
  ) : item.promotionStartDate ? (
    formatIsraeliDateOnly(item.promotionStartDate) // מציג בפורמט ישראלי בתצוגה
  ) : (
    ""
  )}
</td>
      <td>
  {editingPromotionRow === item.id ? (
    <input
      type="date"
      value={
        editPromotionData.promotionEndDate
          ? new Date(editPromotionData.promotionEndDate)
              .toISOString()
              .split("T")[0] // מתאם את הפורמט ל-YYYY-MM-DD עבור input
          : ""
      }
      onChange={(e) =>
        handleEditPromotionChange("promotionEndDate", e.target.value)
      }
    />
  ) : item.promotionEndDate ? (
    formatIsraeliDateOnly(item.promotionEndDate) // מציג בפורמט ישראלי בתצוגה
  ) : (
    ""
  )}
</td>
      <td>
        {editingPromotionRow === item.id ? (
          <input
          type="checkbox"
          checked={editPromotionData.promotionStatus || false}
            onChange={(e) =>
              handleEditPromotionChange(
                "promotionStatus",
                e.target.checked
              )
            }
          >
          </input>
        ) : (
          item.promotionStatus ? "✔️" : "❌"
        )}
      </td>
      <td className="narrow-cell">
  <MenuWrapper
    rowId={item.id}
    openMenuRow={openMenuRowPromotions}
    setOpenMenuRow={setOpenMenuRowPromotions}
    menuItems={menuItems(
      item.id,
      handleEditPromotionRow,
      handleDeletePromotionRow,
      () => setOpenMenuRowPromotions(null) // פונקציה לסגירת התפריט
    )}
  />
</td>
     </tr>
  ))}
</tbody>
    </table>  
  
  </div>
</div>
<div className="NewGoalsStars">
      {/* כפתור לפתיחת המודל */}
      <div className="newStarButton">
      <Button
  onClick={handleOpenModalNewStars}
  text="כוכב חדש"
  type="primary"
  icon="on"
  state="default"
/>
<Button
  onClick={saveStarChanges} // קורא לפונקציה מתוך useEditableTable
  text="שמור שינויים"
  type="primary"
  icon="off"
  state={editingStarRow ? "default" : "disabled"}
  disabled={!editingStarRow} // הכפתור יהיה פעיל רק אם יש שורה שנערכת
/>
<Button
  onClick={cancelEditStar}
  text="בטל"
  type="primary"
  icon="off"
  state={editingStarRow ? "default" : "disabled"}
  disabled={!editingStarRow} // הכפתור יהיה פעיל רק אם יש שורה שנערכת

  />     
</div>
      {/* המודל */}
      {isModalOpenNewStars && (
        <div className="modal">
       <div className="modal-content">
       <button className="close-button" onClick={() => setIsModalOpenNewStars(false)}>
    ✖
  </button>
<div className="title">כוכב חדש</div>
<form onSubmit={handleSubmitStars} className="form-container">
    <div className="form-group">
      <label htmlFor="agentSelect">סוכנות</label>
      <select onChange={handleAgentChange} value={selectedAgentId}>
        {detail?.role === "admin" && <option value="">בחר סוכן</option>}
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.name}
          </option>
        ))}
      </select>
    </div>
    <div className="form-group">
      <label htmlFor="promotionValue">שם מבצע</label>
      <select
        id="promotionValue"
        value={promotionValue || ""}
        onChange={handleSelectPromotion}
      >
        <option value="">בחר מבצע</option>
        {Object.entries(promotionListForStars).map(
          ([promotionId, promotionName]) => (
            <option key={promotionId} value={promotionId}>
              {promotionName}
            </option>
          )
        )}
      </select>
    </div>
    <div className="form-group">
      <label htmlFor="insuranceStar">שווי כוכב ביטוח</label>
      <input
        type="number"
        id="insuranceStar"
        name="insuranceStar"
        value={insuranceStar || 0}
        onChange={(e) => setInsuranceStar(parseInt(e.target.value))}
      />
    </div>
    <div className="form-group">
      <label htmlFor="pensiaStar">שווי כוכב פנסיה</label>
      <input
        type="number"
        id="pensiaStar"
        name="pensiaStar"
        value={pensiaStar || 0}
        onChange={(e) => setPensiaStar(parseInt(e.target.value))}
      />
    </div>
    <div className="form-group">
      <label htmlFor="finansimStar">שווי כוכב פיננסים</label>
      <input
        type="number"
        id="finansimStar"
        name="finansimStar"
        value={finansimStar || 0}
        onChange={(e) => setFinansimStar(parseInt(e.target.value))}
      />
    </div>
    <div className="button-group">
    <Button
    onClick={handleSubmitStars}
    text="הזן"
    type="primary"
    icon="on"
    state={isEditingStars ? "disabled" : "default"}
    disabled={isEditingStars}
  /> <Button
  onClick={handleCloseModalNewStars}
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
       <div className="tableStars">        
        <table>
         <thead>
         <tr>
         <th>שם מבצע</th>
         <th>שווי כוכב ביטוח</th>
          <th>שווי כוכב פנסיה</th>
          <th>שווי כוכב פיננסים</th>
          <th className="narrow-cell">🔧</th>
        </tr>
      </thead>
      <tbody>
      {starsData?.length > 0 ? (
    starsData.map((item, index) => (
<tr 
  key={item.id ?? `star-${index}`} 
  className={editingStarRow === item.id ? "editing-row" : ""}
>      <td>
        {editingStarRow === item.id ? (
          <select
            value={editStarData.promotionId || ""}
            onChange={(e) => handleEditStarChange("promotionId", e.target.value)}
          >
            <option value="">בחר מבצע</option>
            {Object.entries(promotionListForStars).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        ) : (
          promotionListForStars[item.promotionId] || "Unknown Promotion"
        )}
      </td>
      <td>
        {editingStarRow === item.id ? (
          <input
            type="number"
            value={editStarData.insuranceStar || ""}
            onChange={(e) =>
              handleEditStarChange("insuranceStar", parseFloat(e.target.value))
            }
          />
        ) : (
          item.insuranceStar?.toLocaleString() || "N/A"
        )}
      </td>
      <td>
        {editingStarRow === item.id ? (
          <input
            type="number"
            value={editStarData.pensiaStar || ""}
            onChange={(e) =>
              handleEditStarChange("pensiaStar", parseFloat(e.target.value))
            }
          />
        ) : (
          item.pensiaStar?.toLocaleString() || "N/A"
        )}
      </td>
      <td>
        {editingStarRow === item.id ? (
          <input
            type="number"
            value={editStarData.finansimStar || ""}
            onChange={(e) =>
              handleEditStarChange("finansimStar", parseFloat(e.target.value))
            }
          />
        ) : (
          item.finansimStar?.toLocaleString() || "N/A"
        )}
      </td>
      <td className="narrow-cell">
      <MenuWrapper
  rowId={item.id}
  openMenuRow={openMenuRowStars} // סטייט עבור הטבלה הזו
  setOpenMenuRow={setOpenMenuRowStars} // עדכון סטייט
  menuItems={menuItems(
    item.id,
    handleEditStarRow, // פונקציית עריכה
    handleDeleteStarRow, // פונקציית מחיקה
    () => setOpenMenuRowStars(null) // פונקציה לסגירת התפריט
  )}
/>
</td>
    </tr>
  ))
) : (
  // שורה שמוצגת אם אין נתונים
  <tr>
    <td colSpan={5} style={{ textAlign: "center" }}>אין נתונים להצגה</td>
  </tr>
)}
</tbody>
</table>
 </div>
</div>
</div>
     )}
        {activeTab === "GoalsWorkers" && (
          <div id="promotions-tab" className={activeTab === "GoalsWorkers" ? "active" : ""}>
            {/* תוכן לשונית מבצעים */}
            <div className="NewGoalsWorkers">
              <div className="newGoalButton">
              <div className="filter-select-container">
             <select onChange={handleAgentChange} value={selectedAgentId} className="select-input">
              {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
              {detail?.role === 'admin' && <option value="all">כל הסוכנות</option>}
              {agents.map(agent => (
               <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
             </select>
      </div>
      {/* כפתור לפתיחת המודל */}
 <Button
  onClick={handleOpenModalGoalWorker}
  text="הקצאה חדשה"
  type="primary"
  icon="on"
  state="default"
/>   
<Button
  onClick={saveGoalChanges} // פונקציית שמירת שינויים
  text="שמור שינויים"
  type="primary"
  icon="off"
  state={editingGoalRow ? "default" : "disabled"} // כפתור פעיל רק כשיש שורה שנערכת
  disabled={!editingGoalRow} // מנוטרל כשאין שורה שנערכת
/>
<Button
  onClick={cancelEditGoal}
  text="בטל"
  type="primary"
  icon="off"
  state={editingGoalRow ? "default" : "disabled"} // כפתור פעיל רק כשיש שורה שנערכת
  disabled={!editingGoalRow} // מנוטרל כשאין שורה שנערכת
/>
</div>
   {/* המודל */}
      {isModalOpenGoalWorker && (
        <div className="modal">
          <div className="modal-content">
          <button className="close-button" onClick={() => setIsModalOpenGoalWorker(false)}>
    ✖
  </button>
          <div className="title">יעד חדש</div>
          <form onSubmit={handleSubmit} className="form-container">
  <div className="form-group">
    <label htmlFor="agentSelect">סוכנות</label>
    <select onChange={handleAgentChange} value={selectedAgentId}>
      {detail?.role === "admin" && <option value="">בחר סוכן</option>}
      {agents.map((agent) => (
        <option key={agent.id} value={agent.id}>
          {agent.name}
        </option>
      ))}
    </select>
  </div>
  <div className="form-group">
    <label htmlFor="worker">עובד</label>
    <select
      id="worker-select"
      value={selectedWorkerId}
      onChange={(e) => handleWorkerChange(e, "insert")}
    >
      <option value="">כל העובדים</option>
      <option value="all-agency">כל הסוכנות</option>
      {workers.map((worker) => (
        <option key={worker.id} value={worker.id}>
          {worker.name}
        </option>
      ))}
    </select>
  </div>
  <div className="form-group">
    <label htmlFor="promotion">שם מבצע</label>
    <select
      id="promotionValue"
      value={promotionValue || ""}
      onChange={handleSelectPromotion}
    >
      <option value="">בחר מבצע</option>
      {Object.entries(promotionListForStars).map(
        ([promotionId, promotionName]) => (
          <option key={promotionId} value={promotionId}>
            {promotionName}
          </option>
        )
      )}
    </select>
  </div>
  <div className="form-group">
    <label htmlFor="goalsType">סוג יעד</label>
    <select
      id="goalsType"
      value={goalsTypeValue || ""}
      onChange={handleSelectGoalsType}
    >
      <option value="">בחר סוג יעד</option>
      {goalsTypeList.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </select>
  </div>
  <div className="form-group">
    <label htmlFor="amount">סכום</label>
    <input
      type="number"
      id="amount"
      name="amount"
      value={amaunt || 0}
      onChange={(e) => setAmaunt(parseInt(e.target.value))}
    />
  </div>
  <div className="form-group">
  <div className="checkbox-container">
    <input
      type="checkbox"
      id="status"
      name="status"
      checked={status}
      onChange={(e) => setStatus(e.target.checked)}
    />
    <label htmlFor="status">פעיל</label>
  </div>
</div>
  <div className="button-group">
  <Button
    onClick={handleSubmit} 
    text="הזן"
    type="primary"
    icon="on"
    state={isEditing ? "disabled" : "default"}
    disabled={isEditing}
  />
    <Button
    onClick={handleCloseModalGoalWorker}
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
       <div className="select-container" >      
        <table>
         <thead>
         <tr>
         <th>מבצע</th>
          <th>עובד</th>
          <th>סוג יעד</th>
          <th>סכום</th>
          <th>תאריך התחלה</th>
          <th>תאריך סיום</th>
          <th>פעיל</th>
          <th className="narrow-cell">🔧</th>
        </tr>
      </thead>
      <tbody>
  {goals.length > 0 ? (
    goals.map((item, index) => {
      const uniqueKey = item.id ? item.id : `goal-${index}`; // 🔹 מוודא key ייחודי
      return (
<tr 
  key={uniqueKey} 
  className={editingGoalRow === item.id ? "editing-row" : ""}
>
          <td>
            {editingGoalRow === item.id ? (
              <select
                value={editGoalData.promotionId ?? ""}
                onChange={(e) =>
                  handleEditGoalChange("promotionId", e.target.value)
                }
              >
                <option value="">בחר מבצע</option>
                {promotionListForStars &&
                  Object.entries(promotionListForStars).map(([id, name]) => (
                    <option key={`${id}-${name}`} value={id}> 
                      {name}
                    </option>
                  ))}
              </select>
            ) : (
              promotionListForStars?.[item.promotionId] || "Unknown Promotion"
            )}
          </td>
          <td>
            {editingGoalRow === item.id ? (
              <select
                value={editGoalData.workerId ?? ""}
                onChange={(e) =>
                  handleEditGoalChange("workerId", e.target.value)
                }
              >
                <option value="all-agency">כל הסוכנות</option>
                {workerNameMap &&
                  Object.entries(workerNameMap).map(([id, name]) => (
                    <option key={`${id}-${name}`} value={id}> 
                      {name}
                    </option>
                  ))}
              </select>
            ) : (
              workerNameMap?.[item.workerId] || "Unknown Worker"
            )}
          </td>
          <td>
            {editingGoalRow === item.id ? (
              <select
                value={editGoalData.goalsTypeId ?? ""}
                onChange={(e) =>
                  handleEditGoalChange("goalsTypeId", e.target.value)
                }
              >
                <option value="">בחר סוג יעד</option>
                {goalsTypeMap &&
                  Object.entries(goalsTypeMap).map(([id, name]) => (
                    <option key={`${id}-${name}`} value={id}> 
                      {name}
                    </option>
                  ))}
              </select>
            ) : (
              goalsTypeMap?.[item.goalsTypeId] || "Unknown goalsType"
            )}
          </td>

          <td>{editingGoalRow === item.id ? (
              <input type="number" value={editGoalData.amaunt ?? 0} onChange={(e) => handleEditGoalChange("amaunt", parseFloat(e.target.value))} />
            ) : (
              item.amaunt ? item.amaunt.toLocaleString() : "N/A"
            )}
          </td>

          <td>{editingGoalRow === item.id ? (
              <input type="date" value={editGoalData.startDate ?? ""} onChange={(e) => handleEditGoalChange("startDate", e.target.value)} />
            ) : item.startDate ? (
              formatIsraeliDateOnly(item.startDate)
            ) : (
              ""
            )}
          </td>

          <td>{editingGoalRow === item.id ? (
              <input type="date" value={editGoalData.endDate ?? ""} onChange={(e) => handleEditGoalChange("endDate", e.target.value)} />
            ) : item.endDate ? (
              formatIsraeliDateOnly(item.endDate)
            ) : (
              ""
            )}
          </td>

          <td>{editingGoalRow === item.id ? (
              <input type="checkbox" checked={!!editGoalData.status} onChange={(e) => handleEditGoalChange("status", e.target.checked)} />
            ) : (
              item.status ? "✔️" : "❌"
            )}
          </td>

          <td className="narrow-cell">
            <MenuWrapper
              rowId={item.id}
              openMenuRow={openMenuRowGoals}
              setOpenMenuRow={setOpenMenuRowGoals}
              menuItems={menuItems(item.id, handleEditGoalRow, handleDeleteGoalRow, () => setOpenMenuRowGoals(null))}
            />
          </td>
        </tr>
      );
    })
  ) : (
    <tr>
      <td colSpan={7}>אין נתונים להצגה</td>
    </tr>
  )}
</tbody>
    </table> 
 </div>
 <div>
 <Button
  onClick={handleDuplicateGoals}
  text={isProcessing ? "בתהליך..." : "שכפל יעדים לחודש הבא"}
  type="primary"
  icon="off"
  state={isProcessing ? "disabled" : "default"}
/>
    </div>
              </div>
        )}
      </div>
    </div>);
  };
  
  export default NewGoals;
  