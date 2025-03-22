import React, { useState, useEffect } from 'react';
import { CombinedData } from '@/types/Sales';

import {
  collection,
  query,
  where,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

import { db } from '@/lib/firebase/firebase';


type UseTableActionsProps<T> = {
  dbCollection: string; // שם האוסף העיקרי
  agentId?: string; // מזהה הסוכן (לא חובה)
  fetchData?: (agentId: string) => Promise<T[]>; // פונקציה לטעינת נתונים
  onCloseModal?: () => void; // ✅ נוסיף את הפונקציה לסגירת המודל (רק אם קיים)
resetForm?: (clearAllFields: boolean) => void; // ✅ פונקציה לאיפוס הטופס
};

type UseTableActionsResult<T> = {
  data: T[];
  isLoadingHookEdit: boolean;
  editingRow: string | null;
  editData: Partial<T>;
  setEditData: React.Dispatch<React.SetStateAction<Partial<T>>>; // ✅ הוספה של setEditData
  handleEditRow: (id: string) => void;
  handleDeleteRow: (id: string) => Promise<void>;
  saveChanges: () => Promise<void>;
  handleEditChange: (field: keyof T, value: T[keyof T]) => void;
  reloadData: (agentId: string) => Promise<void>;
  cancelEdit: (clearAllFields?: boolean) => void;
};

function useEditableTable<T extends { id: string }>({
  dbCollection,
  agentId,
  fetchData,
  onCloseModal, // ✅ נוסיף את הפרופס החדש
  resetForm, // ✅ נוסיף את הפרופס החדש a
}: UseTableActionsProps<T>): UseTableActionsResult<T> {
  const [data, setData] = useState<T[]>([]);
  const [isLoadingHookEdit, setIsLoadingHookEdit] = useState(true);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<T>>({});


  // פונקציה לטעינת נתונים
  const reloadData = async (UserAgentId: string) => {
    if (!fetchData || !UserAgentId) return;
    setIsLoadingHookEdit(true);
    try {
      const result = await fetchData(UserAgentId);
      console.log("🔄 נתונים נטענו מחדש מה-DB:", result);
      setData(result);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoadingHookEdit(false);
    }
  };

  useEffect(() => {
    if (agentId) {
      reloadData(agentId);
    }
  }, [agentId]);


  const handleEditRow = (id: string, openModal?: () => void) => {
    setEditingRow(id);
    const rowData = data.find((item) => item.id === id);
    if (rowData) {
      setEditData({ ...rowData });
  
      if (openModal) {
        openModal(); // פתיחת המודל אם הפונקציה קיימת
      }
    }
  };
  
  
  const handleEditChange = (field: keyof T, value: T[keyof T]) => {
    console.log(`✏️ Field updated: →`, value);
    setEditData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

 
  
  // const handleDeleteRow = async (id: string) => {
  //   const isConfirmed = window.confirm('האם אתה בטוח שברצונך למחוק את השורה?');
  //   if (!isConfirmed) return;

  //   try {
  //     const updatedData = data.filter((item) => item.id !== id);
  //     setData(updatedData);

  //     const docRef = doc(db, dbCollection, id);
  //     await deleteDoc(docRef);
  //     console.log("✅ שורה נמחקה בהצלחה מה-DB:", id);
  //   } catch (error) {
  //     console.error("❌ שגיאה במחיקת השורה:", error);
  //   }
  // };

  const handleDeleteRow = async (id: string
    , isCustomerPage: boolean = false,
    updateSelectedCustomers?: (id: string) => void
  ) => {
    const isConfirmed = window.confirm('האם אתה בטוח שברצונך למחוק את השורה?');
    if (!isConfirmed) return;
  
    try {
      const docRef = doc(db, dbCollection, id);
      await deleteDoc(docRef);
      console.log("✅ שורה נמחקה בהצלחה מה-DB:", id);
  
     // 🔹 עדכון מידי של הסטייט אם זו טבלת לקוחות
     if (isCustomerPage && updateSelectedCustomers) {
      updateSelectedCustomers(id);
    }

      // 🔹 קריאה לרענון הנתונים מהשרת
      if (agentId) {
        await reloadData(agentId);
        console.log("🔄 נתונים נטענו מחדש לאחר מחיקה");
      } else {
        console.warn("⚠️ Agent ID is undefined, skipping reloadData");
      }
  
    } catch (error) {
      console.error("❌ שגיאה במחיקת השורה:", error);
    }
  };
  




  const saveChanges = async () => {
    try {
      if (!editingRow) return;
  
      const updatedData = data.map((item) =>
        item.id === editingRow ? { ...item, ...editData } : item
      );
      setData(updatedData);
  
      const docRef = doc(db, dbCollection, editingRow);
      await updateDoc(docRef, {
        ...editData,
        lastUpdateDate: serverTimestamp(),
      });
  
      console.log('Row updated successfully');
  
      // 🔹 אם מדובר בטבלת 'sales', עדכן גם את פרטי הלקוח
      if (dbCollection === 'sales') {
        await updateCustomerIfNeeded(editData);
      }
  
      if (agentId) {
        await reloadData(agentId);
        console.log("Data reloaded successfully");
      } else {
        console.warn("Agent ID is undefined, skipping reloadData");
      }

    } catch (error) {
      console.error('Error updating row:', error);
    } finally {
      setEditingRow(null);
      setEditData({});
    }
     // ✅ אם זו טבלת עסקאות והפונקציה קיימת, נסגור את המודל
     if (dbCollection === 'sales' && onCloseModal) {
      onCloseModal();
    }

    // ✅ סגירת המודל אם מדובר בלידים
    if (onCloseModal) {
      console.log("🔴 סוגר את המודל דרך onCloseModal");
      onCloseModal();
    }
    
  };
  

  const cancelEdit = (clearAllFields: boolean = false) => {
    console.log("🔄 cancelEdit הופעלה | clearAllFields:", clearAllFields);

    setEditingRow(null); // איפוס השורה הנערכת
    setEditData({}); // איפוס הנתונים ששונו

     // אם clearAllFields = true → איפוס מלא של השדות, אחרת חלקי
     if (resetForm) {
      console.log("🔄 Calling resetForm with clearAllFields:", clearAllFields);
      resetForm(clearAllFields); // ✅ נוודא שהפונקציה קיימת לפני הקריאה
    } else {
      console.warn("⚠️ resetForm is not defined!");
    }
     // ✅ הוספת סגירת המודל
  if (onCloseModal) {
    console.log("❌ סוגר את המודל...");
    onCloseModal();
  } else {
    console.warn("⚠️ onCloseModal לא קיים, המודל לא ייסגר!");
  }
    };


  const updateCustomerIfNeeded = async (editData: Partial<CombinedData>) => {
    if (!editData.IDCustomer) return; // אם אין תעודת זהות - לא עושים כלום
  
    try {
      const customerQuery = query(
        collection(db, 'customer'),
        where('IDCustomer', '==', editData.IDCustomer)
      );
      const customerSnapshot = await getDocs(customerQuery);
  
      if (!customerSnapshot.empty) {
        const customerDocRef = customerSnapshot.docs[0].ref;
        await updateDoc(customerDocRef, {
          firstNameCustomer: editData.firstNameCustomer,
          lastNameCustomer: editData.lastNameCustomer,
        });
        console.log('Customer updated successfully');
      }
    } catch (error) {
      console.error('Error updating customer:', error);
    }
  };
  

  return {
    data,
    isLoadingHookEdit,
    editingRow,
    editData,
    setEditData,
    handleEditRow,
    handleEditChange,
    handleDeleteRow,
    saveChanges,
    reloadData,
    cancelEdit,
  };
}

export default useEditableTable;
