import { ChangeEventHandler, FormEventHandler, SetStateAction, useEffect, useState } from "react";
import { collection, query,setDoc, where, getDocs,getDoc, addDoc, deleteDoc, doc, updateDoc,DocumentSnapshot, DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase"; // Ensure this path matches your project structure
import { useAuth } from '@/lib/firebase/AuthContext';
import Link from "next/link";
import './Enviorment.css';
import useFetchAgentData from "@/hooks/useFetchAgentData"; 


const Enviorment: React.FC = () => {
const { user, detail } = useAuth();
const [selectedRow, setSelectedRow] = useState<any | null>(null);
const [isEditing, setIsEditing] = useState(false);
const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
const [sourceLead, setSourceLead] = useState<string | null>(null);
const [statusLead, setStatusLead] =  useState(false);
const [sourceLeadList, SetSourceLeadList] = useState<any[]>([]);


const { 
    agents, 
    selectedAgentId, 
    handleAgentChange, 
  } = useFetchAgentData();

 
    
  useEffect(() => {
    if (selectedAgentId) {
        fetchSourceLeadForAgent(selectedAgentId);
    }
  }, [selectedAgentId]); 
  
  const fetchSourceLeadForAgent = async (UserAgentId: string) => {
    const q = query(
      collection(db, 'sourceLead'), 
      where('AgentId', '==', selectedAgentId)
    );
    const querySnapshot = await getDocs(q);
    const data = querySnapshot.docs.map(doc => ({
        id: doc.id, 
        ...doc.data() 
      }));
      SetSourceLeadList(data);
      console.log('SetSourceLeadList '+ SetSourceLeadList)
    };
    interface PromotionData {
      promotionName: string;
    }
    
    interface PromotionMapping {
      [key: string]: string;
    }



  //handle row selected function **
  const handleRowClick = (item: any) => {
    setSelectedRow(item); // Store the selected row's data
    setSourceLead(item.sourceLead || '');
    setStatusLead(item.statusLead || '');
  };



  

  // delete function ***
  const handleDelete = async () => {
    if (selectedRow && selectedRow.id) {
      await deleteDoc(doc(db, 'sourceLead', selectedRow.id));
      setSelectedRow(null); // Reset selection
      resetForm();
      setIsEditing(false);
      if (selectedAgentId) {
        fetchSourceLeadForAgent(selectedAgentId);
      }
    } else {
      console.log("No selected row or row ID is undefined");
    }
  };



  const handleEdit = async () => {
    if (selectedRow && selectedRow.id) {
      try {
        const docRef = doc(db, 'sourceLead', selectedRow.id); 
        await updateDoc(docRef, {        
          sourceLead,
          statusLead:!!statusLead,
        });
        console.log("Document successfully updated");
        setSelectedRow(null); 
        resetForm();         
        if (selectedAgentId) {
            fetchSourceLeadForAgent(selectedAgentId);
          }
      } catch (error) {
        console.error("Error updating document:", error);     
      }
    } else {
      console.log("No row selected or missing document ID");
    }
  };



//reset function **
  const resetForm = () => {
    setSourceLead(''); 
    setStatusLead(false);
  };

 

  

  const handleSubmitLead: FormEventHandler<HTMLFormElement> = async (event) => {
    try {
    event.preventDefault();
        const docRef = await addDoc(collection(db, 'sourceLead'), {
        AgentId: selectedAgentId,
        sourceLead,
        statusLead,
      });
      alert('מקור ליד התווסף בהצלחה');
      console.log('Document written with ID:', docRef.id);
      resetForm(); 
      setIsEditing(false);
      if (selectedAgentId) {
        fetchSourceLeadForAgent(selectedAgentId);
      }
      
    } catch (error) {
      console.error('Error adding document:', error);
    }
  };
  


  return (
    <div className="content-container">
      <div className="form-container">
        <form onSubmit={handleSubmitLead}>
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
                        <label htmlFor="sourceLead">מקור ליד</label>
                    </td>
                    <td>
                    <input type="text" id="sourceLead" name="sourceLead" value={sourceLead || ''}  onChange={(e) => setSourceLead(e.target.value)} />
                    </td>
                    </tr> 
                    <tr>
                    <td>
                        <label htmlFor="statusLead">פעיל</label>
                    </td>
                    <td>
                        <input type="checkbox" id="statusLead" name="statusLead" checked={statusLead} onChange={(e) => setStatusLead(e.target.checked)} />
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
         <th>מקור ליד </th>
          <th>סטאטוס</th>
        </tr>
      </thead>
      <tbody>
        {sourceLeadList.map((item) => (
          <tr key={item.id}
          onClick={() => handleRowClick(item)}
          onMouseEnter={() => setHoveredRowId(item.id)}
          onMouseLeave={() => setHoveredRowId(null)}
          className={`${selectedRow && selectedRow.id === item.id ? 'selected-row' : ''} ${hoveredRowId === item.id ? 'hovered-row' : ''}`}>
              <td>{item.sourceLead}</td>
              <td>{item.statusLead? 'כן' : 'לא'}</td>
          </tr>
        ))}
      </tbody>
    </table>
 </div>
      </div>  
      <div className="data-container">
     
       <div className="select-container" >        
       
 </div>
      </div>
  <div className="table-container" style={{ maxHeight: '300px' }}>
    <div className= "buttons-container" >  
    <div className="data-container">
       <div className="select-container" >        
       
 </div>
      </div>



        </div>
</div>
      </div>
    
);}
export default Enviorment;