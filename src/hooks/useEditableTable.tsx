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
      // console.log("🔄 נתונים נטענו מחדש מה-DB:", result);
      setData(result);
    } catch (error) {
      // console.error('Error fetching data:', error);
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
    // console.log(`✏️ Field updated: →`, value);
    setEditData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

 


  const handleDeleteRow = async (id: string
    , isCustomerPage: boolean = false,
    updateSelectedCustomers?: (id: string) => void
  ) => {
    const isConfirmed = window.confirm('האם אתה בטוח שברצונך למחוק את השורה?');
    if (!isConfirmed) return;
  
    try {
      const docRef = doc(db, dbCollection, id);
      await deleteDoc(docRef);
      // console.log("✅ שורה נמחקה בהצלחה מה-DB:", id);
  
     // 🔹 עדכון מידי של הסטייט אם זו טבלת לקוחות
     if (isCustomerPage && updateSelectedCustomers) {
      updateSelectedCustomers(id);
    }

      // 🔹 קריאה לרענון הנתונים מהשרת
      if (agentId) {
        await reloadData(agentId);
        // console.log("🔄 נתונים נטענו מחדש לאחר מחיקה");
      } else {
        // console.warn("⚠️ Agent ID is undefined, skipping reloadData");
      }
  
    } catch (error) {
      // console.error("❌ שגיאה במחיקת השורה:", error);
    }
  };
  

  const stripCustomerFields = (x: any) => {
    const {
      // ❌ לא רוצים לשמור בעסקה
      phone,
      mail,
      address,
      birthday,
      gender,
      sourceValue,
      sourceLead,
      parentID,
  
      // כל היתר נשאר (כולל ✅ firstNameCustomer/lastNameCustomer)
      ...rest
    } = x || {};
  
    return rest;
  };
  
  const saveChanges = async () => {
    try {
      if (!editingRow) return;
  
      // ✅ לשימוש רק עבור בדיקות שינוי סטטוס + שליחה לסמווב
      const beforeRow = data.find((x) => x.id === editingRow) as any | undefined;
  
      const prevStatus = String(beforeRow?.statusPolicy ?? "");
      const nextStatus = String((editData as any)?.statusPolicy ?? prevStatus);
      const statusChanged = prevStatus !== nextStatus;
  
      // ✅ מזהים לממשק (לוקחים מהשורה המקורית, לא מה-editData)
      const agentIdToSend = String(beforeRow?.AgentId ?? "");
      const idCustomerToSend = String(beforeRow?.IDCustomer ?? "");
  
      const shouldSyncSmoove =
        dbCollection === "sales" &&
        statusChanged &&
        !!agentIdToSend &&
        !!idCustomerToSend;
  
      // ✅ מעדכנים CUSTOMER רק אם זו עריכה מתוך SALES
      if (dbCollection === "sales") {
        await updateCustomerIfNeeded(editData as any, beforeRow);
      }
  
      // ✅ מעדכנים SALES בלי שדות הלקוח (אבל כן משאירים first/last כמו שביקשת)
      const patchForDb =
        dbCollection === "sales" ? stripCustomerFields(editData) : editData;
  
      // עדכון UI מידי
      const updatedData = data.map((item) =>
        item.id === editingRow ? { ...item, ...patchForDb } : item
      );
      setData(updatedData);
  
      // עדכון DB
      const docRef = doc(db, dbCollection, editingRow);
      await updateDoc(docRef, {
        ...(patchForDb as any),
        lastUpdateDate: serverTimestamp(),
      });
  
      // ✅ שליחה לסמווב רק כשסטטוס השתנה
      if (shouldSyncSmoove) {
        await fetch("/api/integrations/smoove/sync-customer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: agentIdToSend,
            IDCustomer: idCustomerToSend,
          }),
        });
      }
  
      // רענון נתונים
      if (agentId) {
        await reloadData(agentId);
      }
    } catch (error) {
      // console.error("Error updating row:", error);
    } finally {
      setEditingRow(null);
      setEditData({});
    }
  
    // סגירת מודל (כמו אצלך)
    if (dbCollection === "sales" && onCloseModal) {
      onCloseModal();
    }
    if (onCloseModal) {
      onCloseModal();
    }
  };
  

  const cancelEdit = (clearAllFields: boolean = false) => {
    // console.log("🔄 cancelEdit הופעלה | clearAllFields:", clearAllFields);

    setEditingRow(null); // איפוס השורה הנערכת
    setEditData({}); // איפוס הנתונים ששונו

     // אם clearAllFields = true → איפוס מלא של השדות, אחרת חלקי
     if (resetForm) {
      // console.log("🔄 Calling resetForm with clearAllFields:", clearAllFields);
      resetForm(clearAllFields); // ✅ נוודא שהפונקציה קיימת לפני הקריאה
    } else {
      // console.warn("⚠️ resetForm is not defined!");
    }
     // ✅ הוספת סגירת המודל
  if (onCloseModal) {
    // console.log("❌ סוגר את המודל...");
    onCloseModal();
  } else {
    // console.warn("⚠️ onCloseModal לא קיים, המודל לא ייסגר!");
  }
    };


  // const updateCustomerIfNeeded = async (editData: Partial<CombinedData>) => {
  //   if (!editData.IDCustomer) return; // אם אין תעודת זהות - לא עושים כלום
  
  //   try {
  //     const customerQuery = query(
  //       collection(db, 'customer'),
  //       where('IDCustomer', '==', editData.IDCustomer)
  //     );
  //     const customerSnapshot = await getDocs(customerQuery);
  
  //     if (!customerSnapshot.empty) {
  //       const customerDocRef = customerSnapshot.docs[0].ref;
  //       await updateDoc(customerDocRef, {
  //         firstNameCustomer: editData.firstNameCustomer,
  //         lastNameCustomer: editData.lastNameCustomer,
  //       });
  //       // console.log('Customer updated successfully');
  //     }
  //   } catch (error) {
  //     // console.error('Error updating customer:', error);
  //   }
  // };
  
  const updateCustomerIfNeeded = async (
    editData: Partial<CombinedData>,
    beforeRow?: any
  ) => {
    const id = String(editData.IDCustomer ?? beforeRow?.IDCustomer ?? "").trim();
    const agentId = String(editData.AgentId ?? beforeRow?.AgentId ?? "").trim();
  
    if (!id || !agentId) return;
  
    const customerQuery = query(
      collection(db, "customer"),
      where("IDCustomer", "==", id),
      where("AgentId", "==", agentId)
    );
  
    const snap = await getDocs(customerQuery);
    if (snap.empty) return;
  
    const ref = snap.docs[0].ref;
  
    const patch: any = { lastUpdateDate: serverTimestamp() };
  
    // שמות
    if (editData.firstNameCustomer !== undefined) patch.firstNameCustomer = editData.firstNameCustomer;
    if (editData.lastNameCustomer !== undefined) patch.lastNameCustomer = editData.lastNameCustomer;
  
    // פרטי קשר
    if ((editData as any).phone !== undefined) patch.phone = (editData as any).phone;
    if ((editData as any).mail !== undefined) patch.mail = (editData as any).mail;
    if ((editData as any).address !== undefined) patch.address = (editData as any).address;
  
    // דמוגרפיה
    if ((editData as any).birthday !== undefined) patch.birthday = (editData as any).birthday;
    if ((editData as any).gender !== undefined) patch.gender = (editData as any).gender;
  
    // מקור ליד (select)
    if ((editData as any).sourceValue !== undefined) patch.sourceValue = (editData as any).sourceValue;
  
    await updateDoc(ref, patch);
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