import { ChangeEventHandler, FormEventHandler, SetStateAction, useEffect, useState } from "react";
import { collection, query,setDoc, where, getDocs,getDoc, addDoc, deleteDoc, doc, updateDoc,DocumentSnapshot, DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase"; // Ensure this path matches your project structure
import { useAuth } from '@/lib/firebase/AuthContext';
import Link from "next/link";
import './NewEnviorment.css';
import useFetchAgentData from "@/hooks/useFetchAgentData"; 
import useFetchMD from "@/hooks/useMD";
import { Button } from "@/components/Button/Button";
import MenuWrapper from "@/components/MenuWrapper/MenuWrapper";
import Edit from '@/components/icons/Edit/Edit'; 
import Delete  from '@/components/icons/Delete/Delete'; 
import useEditableTable from "@/hooks/useEditableTable";
import { Lead, StatusLead } from '@/types/Enviorment';


const NewEnviorment: React.FC = () => {
const { user, detail } = useAuth();
const [selectedRow, setSelectedRow] = useState<any | null>(null);
const [isEditing, setIsEditing] = useState(false);
const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
const [sourceLead, setSourceLead] = useState<string | null>(null);
const [statusLead, setStatusLead] =  useState(false);
//const [sourceLeadList, SetSourceLeadList] = useState<any[]>([]);

//const [statusLeadMap, SetStatusLeadMap] = useState<any[]>([]);
const [statusLeadName, setStatusLeadName] = useState<string | null>(null);
const [statusLeadList, setStatusLeadList] = useState(false);
const [defaultStatusLead, setDefaultStatusLead] = useState(false);
const [isEditingStatusLead, setIsEditingStatusLead] = useState(false);
const [isAPILead, setIsAPILead] = useState(false);
const [hoveredRowIdStatusLead, setHoveredRowIdStatusLead] = useState<string | null>(null);
const [selectedRowStatusLead, setSelectedRowStatusLead] = useState<any | null>(null);
const [isSubmitting, setIsSubmitting] = useState(false);
const [isSubmittingLead, setIsSubmittingLead] = useState(false);



const { 
    agents, 
    selectedAgentId, 
    handleAgentChange, 
  } = useFetchAgentData();

 
  const { 
    statusLeadMap,
    sourceLeadList,
    SetSourceLeadList,
    fetchSourceLeadForAgent,
    fetchStatusLeadForAgentAndDefault
  } = useFetchMD(selectedAgentId);


    
  // useEffect(() => {
  //   if (selectedAgentId) {
  //       fetchSourceLeadForAgent(selectedAgentId);
  //    //   fetchStatusLeadForAgentAndDefault(selectedAgentId);
  //   }
  // }, [selectedAgentId]); 
  
  // const fetchSourceLeadForAgent = async (UserAgentId: string) => {
  //   const q = query(
  //     collection(db, 'sourceLead'), 
  //     where('AgentId', '==', selectedAgentId)
  //   );
  //   const querySnapshot = await getDocs(q);
  //   const data = querySnapshot.docs.map(doc => ({
  //       id: doc.id, 
  //       ...doc.data() 
  //     }));
  //     SetSourceLeadList(data);
  //     console.log('SetSourceLeadList '+ SetSourceLeadList)
  //   };


  // //handle row selected function **
  // const handleRowClick = (item: any) => {
  //   setSelectedRow(item); // Store the selected row's data
  //   setSourceLead(item.sourceLead || '');
  //   setStatusLead(item.statusLead || '');
  //   setIsAPILead(item.isAPILead || '');
  // };


  // // delete function ***
  // const handleDelete = async () => {
  //   if (selectedRow && selectedRow.id) {
  //     await deleteDoc(doc(db, 'sourceLead', selectedRow.id));
  //     setSelectedRow(null); // Reset selection
  //     setIsEditing(false);
  //     if (selectedAgentId) {
  //    //   fetchSourceLeadForAgent(selectedAgentId);
  //    await fetchSourceLeadForAgent(selectedAgentId); 
  //     }
  //   } else {
  //     console.log("No selected row or row ID is undefined");
  //   }
  // };



  // const handleEdit = async () => {
  //   if (selectedRow && selectedRow.id) {
  //     try {
  //       const docRef = doc(db, 'sourceLead', selectedRow.id); 
  //       await updateDoc(docRef, {        
  //         sourceLead,
  //         statusLead:!!statusLead,
  //         isAPILead:!!isAPILead,
  //       });
  //       console.log("Document successfully updated");
  //       setSelectedRow(null); 
  //       resetForm();         
  //       if (selectedAgentId) {
  //      //     fetchSourceLeadForAgent(selectedAgentId);
  //      fetchSourceLeadForAgent
  //         }
  //     } catch (error) {
  //       console.error("Error updating document:", error);     
  //     }
  //   } else {
  //     console.log("No row selected or missing document ID");
  //   }
  // };

  
    //   const handleRowClickStatusLead = (item: any) => {
    //     setSelectedRowStatusLead(item); 
    //     setStatusLeadName(item.statusLeadName || '');
    //     setStatusLeadList(item.statusLeadList || '');
    //     setDefaultStatusLead(item.defaultStatusLead || '');
    //   };
    


    //   const handleDeleteStatusLead = async () => {
    //     if (!selectedRowStatusLead || !selectedRowStatusLead.id) {
    //       console.log("No selected row or row ID is undefined");
    //       return;
    //     }
    //     const isDefaultStatus = selectedRowStatusLead.defaultStatusLead === true; // Check if it's a default status
    //     const userRole = detail?.role; 
    //     if (isDefaultStatus && userRole !== 'admin') {
    //       alert('רק מנהל יכול למחוק סטאטוס מערכת');
    //       console.log("Only admin users can delete default statuses");
    //       return;
    //     }   
    //     try {
    //       await deleteDoc(doc(db, 'statusLeadList', selectedRowStatusLead.id));
    //       setSelectedRowStatusLead(null);
    //       setIsEditingStatusLead(false);
    // //      if (selectedAgentId) {
    //         fetchStatusLeadForAgentAndDefault(selectedAgentId);
    // //    statusLeadMap
    // //      }
    //     } catch (error) {
    //       console.error("Error deleting status lead:", error);
    //     }
    //   };
      

    //   const handleEditStatusLead = async () => {
    //     if (!selectedRowStatusLead || !selectedRowStatusLead.id) {
    //       console.log("No row selected or missing document ID");
    //       return;
    //     }  
    //     const isDefaultStatus = selectedRowStatusLead.defaultStatusLead === true; // Check if it's a default status
    //     const userRole = detail?.role; // Assuming you get the user role from `detail`
      
    //     if (isDefaultStatus && userRole !== 'admin') {
    //       alert('רק מנהל יכול לערוך סטאטוס מערכת');
    //       console.log("Only admin users can edit default statuses");
    //       return;
    //     }     
    //     try {
    //       const docRef = doc(db, 'statusLeadList', selectedRowStatusLead.id);
    //       await updateDoc(docRef, {
    //         statusLeadName,
    //         statusLeadList,
    //         defaultStatusLead: !!selectedRowStatusLead.defaultStatusLead, // Ensure boolean value is stored
    //       });
    //       setSelectedRowStatusLead(null);
      
    // //      if (selectedAgentId) {
    //         fetchStatusLeadForAgentAndDefault(selectedAgentId);
    //   //    statusLeadMap
    //  //     }
    //     } catch (error) {
    //       console.error("Error updating document:", error);
    //     }
    //   };
      
      const handleDeleteStatus = (id: string) => {
        // מציאת השורה המתאימה
        const rowToDelete = statusLeadData.find((item) => item.id === id);
        if (!rowToDelete) {
            console.log("❌ שורה לא נמצאה למחיקה");
            return;
        }
    
        // בדיקת הרשאה רק לטבלת הסטאטוסים
        if (rowToDelete.defaultStatusLead && detail?.role !== 'admin') {
            alert('רק מנהל יכול למחוק סטאטוס מערכת');
            console.log("❌ רק משתמשי admin יכולים למחוק סטאטוס מערכת");
            return;
        }
    
        // קריאה לפונקציה הכללית אחרי שעברנו את הבדיקות
        handleDeleteStatusLeadRow(id);
    };


    const handleEditStatusLead = (id: string) => {
      // מציאת השורה המתאימה
      const rowToEdit = statusLeadData.find((item) => item.id === id);
      if (!rowToEdit) {
          console.log("❌ שורה לא נמצאה לעריכה");
          return;
      }
      // בדיקת הרשאה - רק מנהל יכול לערוך סטאטוס מערכת
      if (rowToEdit.defaultStatusLead && detail?.role !== 'admin') {
          alert('רק מנהל יכול לערוך סטאטוס מערכת');
          console.log("❌ רק משתמשי admin יכולים לערוך סטאטוס מערכת");
          return;
      }
  
      // קריאה לפונקציה הכללית לאחר הבדיקה
      handleEditStatusLeadRow(id);
  };
  



    const handleSubmitLead: FormEventHandler<HTMLFormElement> = async (event) => {
      event.preventDefault();
      if (isSubmittingLead) return; // מונע לחיצות כפולות
      try {
      event.preventDefault();
          const docRef = await addDoc(collection(db, 'sourceLead'), {
          AgentId: selectedAgentId,
          sourceLead,
          statusLead,
          isAPILead,
        });
        alert('מקור ליד התווסף בהצלחה');
        console.log('Document written with ID:', docRef.id);
        setIsEditing(false);
        reloadLeadsData(selectedAgentId);
        setIsModalOpenNewLead(false);
      } catch (error) {
        console.error('Error adding document:', error);
      } finally {
        setIsSubmittingLead(false); // מפעיל מחדש את הכפתור אחרי סיום
    }
    };



const handleSubmitStatusLead: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    if (isSubmitting) return; // מונע לחיצות כפולות

    try {
        setIsSubmitting(true); // משבית את הכפתור
        const docRef = await addDoc(collection(db, 'statusLeadList'), {
            AgentId: selectedAgentId,
            statusLeadName,
            statusLeadList,
            defaultStatusLead,
        });
        alert('סטאטוס ליד התווסף בהצלחה');
        setIsEditingStatusLead(false);
        reloadStatusLeadData(selectedAgentId);
        setIsModalOpenNewStatusLead(false);
    } catch (error) {
        console.error('Error adding document:', error);
    } finally {
        setIsSubmitting(false); // מפעיל מחדש את הכפתור אחרי סיום
    }
};

  
      const [isModalOpenNewLead, setIsModalOpenNewLead] = useState(false);
      const [openMenuRowLeads, setOpenMenuRowLeads] = useState<string | null>(null);
      const [isModalOpenNewStatusLead, setIsModalOpenNewStatusLead] = useState(false);


      const handleOpenModalNewLead = () => {
        setIsModalOpenNewLead(true);
      };
    
      const handleCloseModalNewLead = () => {
        setIsModalOpenNewLead(false);
      };

      const handleOpenModalNewStatusLead = () => {
        setIsModalOpenNewStatusLead(true);
      };

      const handleCloseModalNewStatusLead = () => {
        setIsModalOpenNewStatusLead(false);
      };

    
      const {
        data: leadsData,
        editingRow: editingLeadRow,
        editData: editLeadData,
        handleEditRow: handleEditLeadRow,
        handleEditChange: handleEditLeadChange,
        handleDeleteRow: handleDeleteLeadRow,
        saveChanges: saveLeadChanges,
        reloadData: reloadLeadsData,
        cancelEdit: cancelEditLead,
      } = useEditableTable<Lead>({
        dbCollection: "sourceLead",
        agentId: selectedAgentId,
        fetchData: fetchSourceLeadForAgent, // פונקציית שליפה
      });
      
      const {
        data: statusLeadData,
        editingRow: editingRowStatusLead,
        editData: editStatusLeadData,
        handleEditRow: handleEditStatusLeadRow,
        handleEditChange: handleEditStatusLeadChange,
        handleDeleteRow: handleDeleteStatusLeadRow,
        saveChanges: saveStatusLeadChanges,
        reloadData: reloadStatusLeadData,
        cancelEdit: cancelEditStatusLead,
      } = useEditableTable<StatusLead>({
        dbCollection: "statusLeadList",
        agentId: selectedAgentId,
        fetchData: fetchStatusLeadForAgentAndDefault,
      });
      
      const [openMenuRowStatusLead, setOpenMenuRowStatusLead] = useState<string | null>(null);
      

      
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
      

  return (
    <div className="content-container"> 
    <div className="first-table">
    <div className="table-header">
    <div className="table-title">ניהול מקורות ליד</div>
    <div className="header-actions">
    <div className="filter-select-container">
             <select onChange={handleAgentChange} value={selectedAgentId} className="select-input">
              {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
              {detail?.role === 'admin' && <option value="all">כל הסוכנות</option>}
              {agents.map(agent => (
               <option key={agent.id} value={agent.id}>{agent.name}</option>
                ))}
             </select>
               </div>
    <div className="newLeadButton">
  {/* כפתור לפתיחת מודל יצירת ליד חדש */}
  <Button
    onClick={handleOpenModalNewLead}
    text="צור ליד חדש"
    type="primary"
    icon="on"
    state="default"
  />
  {/* כפתור לשמירת שינויים */}
  <Button
    onClick={saveLeadChanges}
    text="שמור שינויים"
    type="primary"
    icon="off"
    state={editingLeadRow ? "default" : "disabled"}
    disabled={!editingLeadRow}
  />
  {/* כפתור לביטול עריכה */}
  <Button
    onClick={cancelEditLead}
    text="בטל"
    type="primary"
    icon="off"
    state={editingLeadRow ? "default" : "disabled"}
    disabled={!editingLeadRow}
  />
</div>
</div>
</div>
      {/* תצוגת המודל ליצירת ליד חדש */}  
    {isModalOpenNewLead && (
  <div className="modal">
    <div className="modal-content">
    <button className="close-button" onClick={() => setIsModalOpenNewLead(false)}>
    ✖
  </button>
      <div className="modal_title">ליד חדש</div>
      <form onSubmit={handleSubmitLead} className="form-container">
        <div className="form-group">
          <label htmlFor="agentSelect">סוכנות</label>
          <select
            id="agentSelect"
            onChange={handleAgentChange}
            value={selectedAgentId}
          >
            {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
            {agents.map(agent => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="sourceLead">מקור ליד</label>
          <input
            type="text"
            id="sourceLead"
            name="sourceLead"
            value={sourceLead || ''}
            onChange={(e) => setSourceLead(e.target.value)}
          />
        </div>
        <div className="form-group">
          <div className="checkbox-container">
            <input
              type="checkbox"
              id="isAPILead"
              name="isAPILead"
              checked={isAPILead}
              onChange={(e) => setIsAPILead(e.target.checked)}
            />
            <label htmlFor="isAPILead">API</label>
          </div>
        </div>
        <div className="form-group">
          <div className="checkbox-container">
            <input
              type="checkbox"
              id="statusLead"
              name="statusLead"
              checked={statusLead}
              onChange={(e) => setStatusLead(e.target.checked)}
            />
            <label htmlFor="statusLead">פעיל</label>
          </div>
        </div>
        <div className="button-group">
          <Button
            onClick={handleSubmitLead}
            text="הזן"
            type="primary"
            icon="on"
            state={isEditing ? "disabled" : "default"}
            disabled={isEditing}
          />
            <Button
      onClick={handleCloseModalNewLead}
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
       <div className="first-container-tableHeader" >        
        <table>
         <thead>
         <tr>
         <th>מקור ליד </th>
          <th>API</th>
          <th>סטאטוס</th>
          <th className="narrow-cell">🔧</th>
        </tr>
      </thead>
      <tbody>
      {leadsData.map((item) => (
  <tr key={item.id} className={editLeadData === item.id ? "editing-row" : ""}>
      {/* מקור ליד */}
      <td>
        {editingLeadRow === item.id ? (
          <input
            type="text"
            value={editLeadData.sourceLead || ""}
            onChange={(e) =>
              handleEditLeadChange("sourceLead", e.target.value)
            }
          />
        ) : (
          item.sourceLead
        )}
      </td>
      {/* API */}
      <td>
        {editingLeadRow === item.id ? (
          <input
            type="checkbox"
            checked={editLeadData.isAPILead || false}
            onChange={(e) =>
              handleEditLeadChange("isAPILead", e.target.checked)
            }
          />
        ) : (
          item.isAPILead ? "✔️" : "❌"
        )}
      </td>
      {/* סטטוס */}
      <td>
        {editingLeadRow === item.id ? (
          <input
            type="checkbox"
            checked={editLeadData.statusLead || false}
            onChange={(e) =>
              handleEditLeadChange("statusLead", e.target.checked)
            }
          />
        ) : (
          item.statusLead ? "✔️" : "❌"
        )}
      </td>
      {/* תפריט פעולות */}
      <td className="narrow-cell">
        <MenuWrapper
          rowId={item.id}
          openMenuRow={openMenuRowLeads}
          setOpenMenuRow={setOpenMenuRowLeads}
          menuItems={menuItems(
            item.id,
            handleEditLeadRow,
            handleDeleteLeadRow,
            () => setOpenMenuRowLeads(null)
          )}
        />
      </td>
    </tr>
  ))}
</tbody>
    </table>
 </div>
      </div>  
      <div className="second-container">
      <div className="table-header">
       <div className="table-title">ניהול סטאטוס ליד </div>
      <div className="newStatusLeadButton">
  <Button
    onClick={handleOpenModalNewStatusLead}
    text="סטטוס ליד חדש"
    type="primary"
    icon="on"
    state="default"
  />
  <Button
    onClick={saveStatusLeadChanges}
    text="שמור שינויים"
    type="primary"
    icon="off"
    state={editingRowStatusLead ? "default" : "disabled"}
    disabled={!editingRowStatusLead}
  />
  <Button
    onClick={cancelEditStatusLead}
    text="בטל"
    type="primary"
    icon="off"
    state={editingRowStatusLead ? "default" : "disabled"}
    disabled={!editingRowStatusLead}
  />  
</div>
</div>
      {isModalOpenNewStatusLead && (
  <div className="modal">
    <div className="modal-content">
      {/* כפתור לסגירת המודל */}
      <button className="close-button" onClick={() => setIsModalOpenNewStatusLead(false)}>
    ✖
  </button>
      {/* כותרת המודל */}
      <div className="modal_title">סטטוס ליד חדש</div>
      {/* הטופס */}
      <form onSubmit={handleSubmitStatusLead} className="form-container">
        <div className="form-group">
          <label htmlFor="agentSelect">סוכנות</label>
          <select
            id="agentSelect"
            onChange={handleAgentChange}
            value={selectedAgentId}
          >
            {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
            {agents.map(agent => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="statusLeadName">שם סטטוס</label>
          <input
            type="text"
            id="statusLeadName"
            name="statusLeadName"
            value={statusLeadName || ''}
            onChange={(e) => setStatusLeadName(e.target.value)}
          />
        </div>
        <div className="form-group">
          <div className="checkbox-container">
            <input
              type="checkbox"
              id="defaultStatusLead"
              name="defaultStatusLead"
              checked={defaultStatusLead}
              onChange={(e) => setDefaultStatusLead(e.target.checked)}
            />
            <label htmlFor="defaultStatusLead">סטטוס מערכת</label>
          </div>
        </div>
        <div className="form-group">
          <div className="checkbox-container">
            <input
              type="checkbox"
              id="statusLeadList"
              name="statusLeadList"
              checked={statusLeadList}
              onChange={(e) => setStatusLeadList(e.target.checked)}
            />
            <label htmlFor="statusLeadList">פעיל</label>
          </div>
        </div>
        <div className="button-group">
          <Button
            onClick={handleSubmitStatusLead}
            text="הזן"
            type="primary"
            icon="on"
            state={isSubmitting ? "disabled" : "default"}
            disabled={isSubmitting}
          />
          <Button
            onClick={handleCloseModalNewStatusLead}
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
  <div className="secondTable-container" >        
       <table>
         <thead>
         <tr>
         <th>שם סטאטוס</th>
          <th>סטאטוס מערכת</th>
          <th>פעיל</th>
          <th className="narrow-cell">🔧</th>
        </tr>
      </thead>
      <tbody>
      {statusLeadData.map((item) => (
        <tr key={item.id} className={editingRowStatusLead === item.id ? "editing-row" : ""}>
        <td>
        {editingRowStatusLead === item.id ? (
          <input
            type="text"
            value={editStatusLeadData.statusLeadName || ""}
            onChange={(e) =>
              handleEditStatusLeadChange("statusLeadName", e.target.value)
            }
          />
        ) : (
          item.statusLeadName
        )}
      </td>
      <td>
        {editingRowStatusLead === item.id ? (
          <input
            type="checkbox"
            checked={editStatusLeadData.defaultStatusLead || false}
            onChange={(e) =>
              handleEditStatusLeadChange(
                "defaultStatusLead",
                e.target.checked
              )
            }
          />
        ) : item.defaultStatusLead ? (
          "✔️"
        ) : (
          "❌"
        )}
      </td>
      <td>
        {editingRowStatusLead === item.id ? (
          <input
            type="checkbox"
            checked={editStatusLeadData.statusLeadList || false}
            onChange={(e) =>
              handleEditStatusLeadChange(
                "statusLeadList",
                e.target.checked
              )
            }
          />
        ) : item.statusLeadList ? (
          "✔️"
        ) : (
          "❌"
        )}
      </td>
      <td className="narrow-cell">
        <MenuWrapper
          rowId={item.id}
          openMenuRow={openMenuRowStatusLead}
          setOpenMenuRow={setOpenMenuRowStatusLead}
          menuItems={menuItems(
            item.id,
            handleEditStatusLead,
            handleDeleteStatus,
            () => setOpenMenuRowStatusLead(null)
          )}
        />  
      </td>
    </tr>
  ))}
</tbody>
    </table>
 </div>
      </div>
      </div>   
);}
export default NewEnviorment;