import { ChangeEventHandler, FormEventHandler, SetStateAction, useEffect, useState } from "react";
import { collection, query,setDoc, where, getDocs,getDoc, addDoc, deleteDoc, doc, updateDoc,DocumentSnapshot, DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase"; // Ensure this path matches your project structure
import { useAuth } from '@/lib/firebase/AuthContext';
import Link from "next/link";
import './Goals.css';
import useFetchAgentData from "@/hooks/useFetchAgentData"; 
import useGoalsMD from "@/hooks/useGoalsMD"; 

const Goals: React.FC = () => {

const { user, detail } = useAuth();
const [selectedRow, setSelectedRow] = useState<any | null>(null);

const [isEditing, setIsEditing] = useState(false);
const [goalsSuccessList, setGoalsSuccessList] = useState<any[]>([]);
const [promotionId, setPromotionId] = useState<string | null>(null);
const [goalsTypeId, setGoalsTypeId] = useState<string | null>(null);


const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
const [sourceLead, setSourceLead] = useState<string | null>(null);
const [status, setStatus] =  useState(false);

const [amaunt, setAmaunt] = useState<number | null>(null);

const { 
    agents, 
    selectedAgentId, 
    handleAgentChange, 
    handleWorkerChange,
    workers,
    selectedWorkerId,
    setSelectedWorkerName,
    setSelectedWorkerId, 
    fetchWorkersForSelectedAgent

  } = useFetchAgentData();

 
const {   
    promotionListForStars,
    promotionValue,
    setPromotionValue,
    handleSelectPromotion,
    goalsTypeList,
    handleSelectGoalsType,
    goalsTypeValue,
    setGoalsTypeValue
} = useGoalsMD();


  
const fetchGoalsSuccessForAgent = async (UserAgentId: string) => {
  const q = query(
    collection(db, 'GoalsSuccess'), 
    where('AgentId', '==', selectedAgentId)
  );
  const querySnapshot = await getDocs(q);
  const data = querySnapshot.docs.map(doc => ({
      id: doc.id, 
      ...doc.data() 
    }));
    setGoalsSuccessList(data);
    console.log('goalsSuccessList '+ goalsSuccessList)
  };

  //handle row selected function **
  const handleRowClick = (item: any) => {
    setSelectedRow(item); 
    fetchWorkersForSelectedAgent(item.agentId).then(() => {
      const worker = workers.find(w => w.id === item.workerId);
      if (worker) {
        setSelectedWorkerId(worker.id);
        setSelectedWorkerName(worker.name);
      }
    });
    setPromotionId(item.promotionId || '');
    setGoalsTypeId(item.goalsTypeId || '');
    setAmaunt(item.amaunt || '');
  };

  
  const handleDelete = async () => {
    if (selectedRow && selectedRow.id) {
      await deleteDoc(doc(db, 'goalsSuccess', selectedRow.id));
      setSelectedRow(null); // Reset selection
      resetForm();
      setIsEditing(false);
      if (selectedAgentId) {
        fetchGoalsSuccessForAgent(selectedAgentId);
      }
    } else {
      console.log("No selected row or row ID is undefined");
    }
  };

  const handleEdit = async () => {
    if (selectedRow && selectedRow.id) {
      try {
        const docRef = doc(db, 'goalsSuccess', selectedRow.id); 
        await updateDoc(docRef, {        
          workerId: selectedWorkerId,
          promotionId: promotionValue,
          goalsTypeId: goalsTypeValue,
          amaunt: amaunt,
        });
        console.log("Document successfully updated");
        setSelectedRow(null); 
        resetForm();         
        if (selectedAgentId) {
            fetchGoalsSuccessForAgent(selectedAgentId);
          }
      } catch (error) {
        console.error("Error updating document:", error);     
      }
    } else {
      console.log("No row selected or missing document ID");
    }
  };


  const resetForm = () => {
  setAmaunt(null);
  setGoalsTypeValue(null);
  setPromotionValue(null);
  setSelectedWorkerId('');

  };


  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    try {
    event.preventDefault();
        const docRef = await addDoc(collection(db, 'goalsSuccess'), {
        AgentId: selectedAgentId,
        workerId: selectedWorkerId,
        promotionId: promotionValue,
        goalsTypeId: goalsTypeValue,
        amaunt: amaunt,
      });
      alert('התווסף בהצלחה');
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
  


  return (
    <div className="content-container">
      <div className="form-container">
        <form onSubmit={handleSubmit}>
      <table>    
          <tbody>
          <tr>
            <td>
               <label htmlFor="agentSelect">סוכנות</label>
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
                        <label htmlFor="sourceLead">עובד</label>
                    </td>
                    <td>
                    <select id="worker-select" value={selectedWorkerId} 
                   onChange={(e) => handleWorkerChange(e, 'insert')}>
                 <option value="">כל העובדים</option>
                 {workers.map(worker => (
          <option key={worker.id} value={worker.id}>{worker.name}</option>
        ))}
      </select>
                    </td>
                    </tr> 
                    <tr>
                    <td>
                        <label htmlFor="promotion">שם מבצע </label>
                    </td>
                    <td>
          <select id="promotionValue" value={promotionValue || ''} onChange={handleSelectPromotion}>
           <option value="">בחר מבצע</option>
            {Object.entries(promotionListForStars).map(([promotionId, promotionName]) => (
          <option key={promotionId} value={promotionId}>{promotionName}</option>
          ))}
            </select>

                    </td>
                    </tr>
                    <tr>
                    <td>
                        <label htmlFor="goalsType">סוג יעד</label>
                    </td>
                    <td>
                    <select id="goalsType" value={goalsTypeValue || ''} onChange={handleSelectGoalsType}>
    <option value="">בחר סוג יעד</option>
    {goalsTypeList.map((item) => (
        <option key={item.id} value={item.id}>{item.name}</option>
    ))}
</select>

                    </td>
                    </tr>
                    <tr>
                <td>
                  <label htmlFor="amount">סכום</label>
                </td>
                <td>
                  <input type="number" id="amount" name="amount" value={amaunt|| 0} onChange={(e) => setAmaunt(parseInt(e.target.value))} />
                </td>
              </tr>
                    <tr>
                    <td>
                        <label htmlFor="status">פעיל</label>
                    </td>
                    <td>
                        <input type="checkbox" id="status" name="status" checked={status} onChange={(e) => setStatus(e.target.checked)} />
                    </td>
                </tr>
          </tbody>       
        </table>
           <div className="form-group button-group" style={{ display: 'flex' }}>
            <button type="submit" disabled={isEditing}> הזן</button>                
            <button type="button" disabled={selectedRow === null} onClick={handleDelete} >מחק</button>
            <button type="button" disabled={selectedRow === null} onClick={handleEdit}>עדכן</button>
            <button type="button" onClick={resetForm}>נקה</button>
          </div>        
       </form>
       <div className="select-container" >        
        <table>
         <thead>
         <tr>
         <th>מבצע</th>
          <th>עובד</th>
          <th>סוג יעד</th>
          <th>סכום</th>
          <th>פעיל</th>
        </tr>
      </thead>
      <tbody>
        {goalsSuccessList.map((item) => (
          <tr key={item.id}
          onClick={() => handleRowClick(item)}
          onMouseEnter={() => setHoveredRowId(item.id)}
          onMouseLeave={() => setHoveredRowId(null)}
          className={`${selectedRow && selectedRow.id === item.id ? 'selected-row' : ''} ${hoveredRowId === item.id ? 'hovered-row' : ''}`}>
        <td>{promotionListForStars[item.promotionId] || 'Unknown Promotion'}</td>
        <td>{item.statusLead? 'כן' : 'לא'}</td>
          </tr>
        ))}
      </tbody>
    </table>
 </div>
      </div>  
      <div className="data-container">
     </div>
  <div className="table-container" style={{ maxHeight: '300px' }}>
    <div className= "buttons-container" >  
    <div className="data-container">
   </div>

        </div>
</div>
      </div>
    
);}
export default Goals;
