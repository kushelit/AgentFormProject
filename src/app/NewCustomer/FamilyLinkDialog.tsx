import { useState } from "react";
import { CustomersTypeForFetching } from '@/types/Customer';
import { doc, getDoc, updateDoc, query, collection, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase"; // Ensure this path matches your project structure
import './FamilyLinkDialog.css';
import { Button } from "@/components/Button/Button";
// import {fetchCustomersForAgent} from '@/services/fetchCustomersForAgent'; // פונקציות




export const FamilyLinkDialog = ({ 
  isOpen, onClose, customers, onConfirm,setSelectedCustomers,
   setIsDialogOpen, selectedAgentId
  , fetchCustomersForAgent, 
  setCustomers,  // ✅ קבלת הפרופס
  setFilteredData // ✅ קבלת הפרופס
}: {
  isOpen: boolean,
  onClose: () => void,
  customers: CustomersTypeForFetching[],
  onConfirm: (mainCustomerId: string) => void
  setSelectedCustomers: (customers: CustomersTypeForFetching[]) => void;
  setIsDialogOpen: (open: boolean) => void;
  selectedAgentId: string; // הוספת ה-agentId
  fetchCustomersForAgent: (agentId: string) => Promise<CustomersTypeForFetching[]>; // שינוי הציפייה לפונקציה שמחזירה רשימת לקוחות
  setCustomers: (customers: CustomersTypeForFetching[]) => void;  // 🛠️ ✅ תיקון: הוספת הטיפוס
  setFilteredData: (customers: CustomersTypeForFetching[]) => void; // 🛠️ ✅ הוספת הטיפוס
}) => {
    console.log("Customers received in modal:", customers);
  const [mainCustomer, setMainCustomer] = useState<string | null>(null);
  if (!isOpen) return null;


  return (
    <div className="modal-overlay">
      <div className="modal-container">
        {/* כפתור לסגירת הדיאלוג */}
        <button className="close-button" onClick={() => {onClose} }>
    ✖
  </button>
        {/* כותרת הדיאלוג */}
        <div className="title">הגדר מבוטח ראשי של המשפחה</div>
        <div className="customer-list">
          {customers.map((customer) => (
            <div
              key={customer.IDCustomer || customer.id}
              className={`customer-row styled-customer-box ${
                mainCustomer === ( customer.id) ? "selected" : ""
              }`}
            >
                <div className="radio-container">
              <input
                type="radio"
                name="mainCustomer"
                value={customer.id}
                checked={mainCustomer === ( customer.id)}
                onChange={() => {
                  console.log("בחירת מבוטח ראשי - מזהה מסמך:", customer.id); // הדפסה כדי לוודא
                  setMainCustomer(customer.id);
                }}
              />
            </div>

              <div className="customer-info">
                <span className="info-item">
                  <label>ת.ז</label>
                  <span>{customer.IDCustomer}</span>
                </span>
                <span className="info-item">
                  <label>שם פרטי</label>
                  <span>{customer.firstNameCustomer}</span>
                </span>
                <span className="info-item">
                  <label>שם משפחה</label>
                  <span>{customer.lastNameCustomer}</span>
                </span>
                <span className="info-item">
                  <label>הורה</label>
                  <span>{customer.parentFullName}</span>
                </span>
              </div>
            </div>
          ))}
          <div className="button-group">
          <Button
              onClick={() =>
                mainCustomer &&
                handleConfirmFamilyLink(mainCustomer, customers, setSelectedCustomers, setIsDialogOpen,
                selectedAgentId, fetchCustomersForAgent, setCustomers, setFilteredData
              )
              }
              text="אשר"
              type="primary"
              icon="on"
              state={mainCustomer ? "default" : "disabled"}
              disabled={!mainCustomer}
            />
          <Button
            onClick={onClose}
            text="בטל"
            type="secondary"
            icon="off"
            state="default"
          />
          </div>
        </div>
      </div>
    </div>
  );
}
   

export const handleConfirmFamilyLink = async (
  mainCustomerId: string,
  selectedCustomers: CustomersTypeForFetching[],
  setSelectedCustomers: (customers: CustomersTypeForFetching[]) => void,
  setIsDialogOpen: (open: boolean) => void,
  selectedAgentId: string, // הוספת ה-agentId
  fetchCustomersForAgent: (agentId: string) => Promise<CustomersTypeForFetching[]>, // שינוי לטיפוס הנכון
  setCustomers: (customers: CustomersTypeForFetching[]) => void, // שליחה של סטייט העדכון
  setFilteredData: (customers: CustomersTypeForFetching[]) => void // שליחה של המסוננים
) => {
  if (!mainCustomerId) {
      alert("יש לבחור מבוטח ראשי לפני יצירת החיבור.");
      return;
  }

  let familyConflict = false;
  let conflictingCustomerName = "";

  const mainCustomerDocRef = doc(db, 'customer', mainCustomerId);
  const mainCustomerDoc = await getDoc(mainCustomerDocRef);

  if (mainCustomerDoc.exists()) {
      const mainCustomerData = mainCustomerDoc.data();
      if (mainCustomerData.parentID !== mainCustomerId) {
          alert(`הלקוח ${mainCustomerData.firstNameCustomer} כבר חלק מחיבור משפחתי אחר. יש לנתק את החיבור הקיים לפני הפיכתו ללקוח ראשי בחיבור חדש.`);
          return;
      }
  }

  for (const customer of selectedCustomers) {
      if (customer.id === mainCustomerId) continue; // שינוי ל-id במקום IDCustomer
      const customerDocRef = doc(db, 'customer', customer.id); // שימוש ב-id של המסמך
      const customerDoc = await getDoc(customerDocRef);

      if (customerDoc.exists()) {
          const customerData = customerDoc.data();
          const childCheckQuery = query(
              collection(db, 'customer'),
              where('AgentId', '==', customerData.AgentId),
              where('parentID', '==', customer.id) // שינוי ל-id
          );
          const childCheckSnapshot = await getDocs(childCheckQuery);
          childCheckSnapshot.forEach((doc) => {
              if (doc.id !== customer.id) {
                  familyConflict = true;
                  conflictingCustomerName = customerData.firstNameCustomer;
                  alert(`לא ניתן לחבר את הלקוח ${conflictingCustomerName} כלקוח משני מאחר שהוא כבר משמש כהורה בחיבור אחר.`);
                  return;
              }
          });
          if (familyConflict) {
              return;
          }
      }
  }

  if (familyConflict) {
      const confirmTransfer = confirm(`הלקוח ${conflictingCustomerName} כבר מקושר למשפחה אחרת. האם ברצונך להעביר את כולם למשפחה חדשה?`);
      if (!confirmTransfer) {
          return;
      }
  }
 console.log("mainCustomerId", mainCustomerId);
 console.log("selectedCustomers", selectedCustomers);

 for (const customer of selectedCustomers) {
      const customerDocRef = doc(db, 'customer', customer.id); // שימוש ב-id של המסמך
      await updateDoc(customerDocRef, {
          parentID: mainCustomerId
      });
  }
  alert('קשר משפחתי הוגדר בהצלחה');
  setSelectedCustomers([]);
  setIsDialogOpen(false);
  if (selectedAgentId) {
    const updatedCustomers = await fetchCustomersForAgent(selectedAgentId);
    console.log("✅ רשימת הלקוחות החדשה מה-DB:", updatedCustomers);
    setCustomers(updatedCustomers);
    setFilteredData(updatedCustomers); // עדכון רשימת המסוננים
}
};


export const startLinkingProcess = (
    setMode: (mode: string) => void,
    setShowSelect: (show: boolean) => void,
    isNewDesignEnabled: boolean,
    setDialogType: (type: string) => void,
    setDialogMessage: (message: string) => void,
    setIsDialogOpen: (open: boolean) => void,
    setDialogCustomers: (customers: CustomersTypeForFetching[]) => void, // נוסיף את זה כאן
    selectedCustomers: CustomersTypeForFetching[], // נוסיף את הרשימה הנכונה
    filteredData: CustomersTypeForFetching[],// נוסיף גם את רשימת הנתונים
    setCustomers: (customers: CustomersTypeForFetching[]) => void, // ✅ נוסיף את זה
    setFilteredData: (customers: CustomersTypeForFetching[]) => void // ✅ נוסיף גם את זה
  ) => {
    setMode("linking");
    setShowSelect(true);
  
    if (selectedCustomers.length === 0) { // שינוי מ-`size` ל-`length`
      alert("בחר לפחות לקוח אחד לטובת הקישור.");
      return;
    }
    console.log("Customers to Show in Modal:", selectedCustomers);
    setDialogCustomers(selectedCustomers); // נעדכן את המודל עם הרשימה
    setDialogType("info");
    // setDialogMessage("בחר מבוטח ראשי");
    setIsDialogOpen(true);
  };


  export const disconnectCustomers = async (
    selectedCustomers: CustomersTypeForFetching[],
    setSelectedCustomers: (customers: CustomersTypeForFetching[]) => void,
    setCustomers: (customers: CustomersTypeForFetching[]) => void, // נוסיף פונקציה שמעדכנת את כל רשימת הלקוחות
    selectedAgentId: string,
    fetchCustomersForAgent: (agentId: string) => Promise<CustomersTypeForFetching[]> 
  ) => {
    if (selectedCustomers.length === 0) {
        alert("יש לבחור לפחות מבוטח אחד לפני ניתוק הקשר.");
        return;
    }
  
    const confirmAction = window.confirm(
        `האם לבטל קשר משפחתי עבור ${selectedCustomers.length} מבוטחים שנבחרו?`
    );
    if (!confirmAction) return;
  
    try {
        const updatePromises = selectedCustomers.map(async (customer) => {
            const customerDocRef = doc(db, "customer", customer.id);
            const customerDoc = await getDoc(customerDocRef);
  
            if (!customerDoc.exists()) {
                console.warn(`הלקוח ${customer.firstNameCustomer} לא קיים במערכת.`);
                return;
            }
  
            const customerData = customerDoc.data();
            if (!customerData.parentID || customerData.parentID === customer.id) {
                console.warn(`הלקוח ${customer.firstNameCustomer} כבר מנותק ממשפחתו.`);
                return;
            }
  
            await updateDoc(customerDocRef, {
                parentID: customer.id, // ניתוק המבוטח מהמשפחה
            });
        });
  
        await Promise.all(updatePromises);
  
        alert("קשרים משפחתיים נותקו בהצלחה!");
  
        // רענון רשימת כל הלקוחות ולא רק הנבחרים
        if (selectedAgentId) {
            const updatedCustomers = await fetchCustomersForAgent(selectedAgentId);
            console.log("✅ רשימת הלקוחות החדשה מה-DB:", updatedCustomers);
            setCustomers([...updatedCustomers]); // יוצר אובייקט חדש כדי להכריח רינדור מחדש
            setSelectedCustomers([]); // מרוקן רק את הנבחרים, לא את כולם
        }
    } catch (error) {
        console.error("Failed to disconnect customers:", error);
        alert("כשלון בניתוק קשר משפחתי");
    }
  };
  