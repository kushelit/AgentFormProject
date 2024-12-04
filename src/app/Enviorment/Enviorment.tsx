import { ChangeEventHandler, FormEventHandler, SetStateAction, useEffect, useState } from "react";
import { collection, query,setDoc, where, getDocs,getDoc, addDoc, deleteDoc, doc, updateDoc,DocumentSnapshot, DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase"; // Ensure this path matches your project structure
import { useAuth } from '@/lib/firebase/AuthContext';
import Link from "next/link";
import './Enviorment.css';
import useFetchAgentData from "@/hooks/useFetchAgentData"; 
import useFetchMD from "@/hooks/useMD";


const Enviorment: React.FC = () => {
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
const [hoveredRowIdStatusLead, setHoveredRowIdStatusLead] = useState<string | null>(null);
const [selectedRowStatusLead, setSelectedRowStatusLead] = useState<any | null>(null);


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
     //   fetchSourceLeadForAgent(selectedAgentId);
     await fetchSourceLeadForAgent(selectedAgentId); 
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
       //     fetchSourceLeadForAgent(selectedAgentId);
       fetchSourceLeadForAgent
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

 const resetFormStatusLead = () => {
    setStatusLeadName(''); 
    setStatusLeadList(false);
    setDefaultStatusLead(false);
  }

  

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
      //  fetchSourceLeadForAgent(selectedAgentId);
      fetchSourceLeadForAgent
      }
      
    } catch (error) {
      console.error('Error adding document:', error);
    }
  };
  
  // const fetchStatusLeadForAgentAndDefault = async (selectedAgentId: string) => {
  //   try {
  //     // Query 1: Fetch statuses specific to the agent where `statusLeadList = true`
  //     const agentQuery = query(
  //       collection(db, 'statusLeadList'),
  //       where('AgentId', '==', selectedAgentId),
  //       where('statusLeadList', '==', true)
  //     );
  //     const agentQuerySnapshot = await getDocs(agentQuery);

  //     // Query 2: Fetch default statuses where `defaultStatusLead = true` and `statusLeadList = true`
  //     const defaultQuery = query(
  //       collection(db, 'statusLeadList'),
  //       where('defaultStatusLead', '==', true),
  //       where('statusLeadList', '==', true)
  //     );
  //     const defaultQuerySnapshot = await getDocs(defaultQuery);
  //     // Extract data from both queries
  //     const agentStatuses = agentQuerySnapshot.docs.map(doc => ({
  //       id: doc.id,
  //       ...doc.data(),
  //     }));
  
  //     const defaultStatuses = defaultQuerySnapshot.docs.map(doc => ({
  //       id: doc.id,
  //       ...doc.data(),
  //     }));
  
  //     // Combine the results and remove duplicates
  //     const allStatuses = [...agentStatuses, ...defaultStatuses];
  //     const uniqueStatuses = Array.from(
  //       new Map(allStatuses.map(item => [item.id, item])).values()
  //     );
  
  //     SetStatusLeadMap(uniqueStatuses); // Set the combined unique statuses
  //     console.log('SetStatusLeadMap:', uniqueStatuses);
  //   } catch (error) {
  //     console.error('Error fetching status leads:', error);
  //   }
  // };
  

      const handleRowClickStatusLead = (item: any) => {
        setSelectedRowStatusLead(item); 
        setStatusLeadName(item.statusLeadName || '');
        setStatusLeadList(item.statusLeadList || '');
        setDefaultStatusLead(item.defaultStatusLead || '');
      };
    
      const handleDeleteStatusLead = async () => {
        if (!selectedRowStatusLead || !selectedRowStatusLead.id) {
          console.log("No selected row or row ID is undefined");
          return;
        }
      
        const isDefaultStatus = selectedRowStatusLead.defaultStatusLead === true; // Check if it's a default status
        const userRole = detail?.role; 
      
        if (isDefaultStatus && userRole !== 'admin') {
          alert('רק מנהל יכול למחוק סטאטוס מערכת');
          console.log("Only admin users can delete default statuses");
          return;
        }   
        try {
          await deleteDoc(doc(db, 'statusLeadList', selectedRowStatusLead.id));
          setSelectedRowStatusLead(null);
          resetFormStatusLead();
          setIsEditingStatusLead(false);
      
    //      if (selectedAgentId) {
            fetchStatusLeadForAgentAndDefault(selectedAgentId);
    //    statusLeadMap
    //      }
        } catch (error) {
          console.error("Error deleting status lead:", error);
        }
      };
      
      const handleEditStatusLead = async () => {
        if (!selectedRowStatusLead || !selectedRowStatusLead.id) {
          console.log("No row selected or missing document ID");
          return;
        }  
        const isDefaultStatus = selectedRowStatusLead.defaultStatusLead === true; // Check if it's a default status
        const userRole = detail?.role; // Assuming you get the user role from `detail`
      
        if (isDefaultStatus && userRole !== 'admin') {
          alert('רק מנהל יכול לערוך סטאטוס מערכת');
          console.log("Only admin users can edit default statuses");
          return;
        }     
        try {
          const docRef = doc(db, 'statusLeadList', selectedRowStatusLead.id);
          await updateDoc(docRef, {
            statusLeadName,
            statusLeadList,
            defaultStatusLead: !!selectedRowStatusLead.defaultStatusLead, // Ensure boolean value is stored
          });
          setSelectedRowStatusLead(null);
          resetFormStatusLead();
      
    //      if (selectedAgentId) {
            fetchStatusLeadForAgentAndDefault(selectedAgentId);
      //    statusLeadMap
     //     }
        } catch (error) {
          console.error("Error updating document:", error);
        }
      };
      
      
  
      const handleSubmitStatusLead: FormEventHandler<HTMLFormElement> = async (event) => {
        try {
        event.preventDefault();
            const docRef = await addDoc(collection(db, 'statusLeadList'), {
            AgentId: selectedAgentId,
            statusLeadName,
            statusLeadList,
            defaultStatusLead,
          });
          alert('סטאטוס ליד התווסף בהצלחה');
          resetFormStatusLead(); 
          setIsEditingStatusLead(false);
       //   if (selectedAgentId) {
           fetchStatusLeadForAgentAndDefault(selectedAgentId);    
          //      }
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
          className={`${selectedRow && selectedRow.id === item.id ? 'selected-row' : ''} ${hoveredRowId === item.id ? 'hovered-row' : ''}`} 
          >
              <td>{item.sourceLead}</td>
              <td>{item.statusLead? 'כן' : 'לא'}</td>
          </tr>
        ))}
      </tbody>
    </table>
 </div>
      </div>  
      <div className="data-container">
      <form onSubmit={handleSubmitStatusLead}>
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
                        <label htmlFor="statusLeadName">שם סטאטוס</label>
                    </td>
                    <td>
                    <input type="text" id="statusLeadName" name="statusLeadName" value={statusLeadName || ''}  onChange={(e) => setStatusLeadName(e.target.value)} />
                    </td>
                    </tr> 
                    <tr>
                    <td>
                        <label htmlFor="defaultStatusLead">סטאטוס מערכת</label>
                    </td>
                    <td>
                        <input type="checkbox" id="defaultStatusLead" name="deafultStatusLead" checked={defaultStatusLead} onChange={(e) => setDefaultStatusLead(e.target.checked)} />
                    </td>
                </tr>
                    <tr>
                    <td>
                        <label htmlFor="statusLeadList">פעיל</label>
                    </td>
                    <td>
                        <input type="checkbox" id="statusLeadList" name="statusLeadList" checked={statusLeadList} onChange={(e) => setStatusLeadList(e.target.checked)} />
                    </td>
                </tr>
          </tbody>       
        </table>
           <div className="form-group button-group" style={{ display: 'flex' }}>
            <button type="submit" disabled={isEditingStatusLead}> הזן</button>                
            <button type="button" disabled={selectedRowStatusLead === null} onClick={handleDeleteStatusLead} >מחק</button>
            <button type="button" disabled={selectedRowStatusLead === null} onClick={handleEditStatusLead}>עדכן</button>
            <button type="button" onClick={resetFormStatusLead}>נקה</button>
          </div>        
       </form>
       <div className="select-container" >        
       <table>
         <thead>
         <tr>
         <th>שם סטאטוס</th>
          <th>סטאטוס מערכת</th>
          <th>פעיל</th>
        </tr>
      </thead>
      <tbody>
        {statusLeadMap.map((item) => (
          <tr key={item.id}
          onClick={() => handleRowClickStatusLead(item)}
          onMouseEnter={() => setHoveredRowIdStatusLead(item.id)}
          onMouseLeave={() => setHoveredRowIdStatusLead(null)}
          className={`${selectedRowStatusLead && selectedRowStatusLead.id === item.id ? 'selected-row' : ''} ${hoveredRowIdStatusLead === item.id ? 'hovered-row' : ''}`}>
              <td>{item.statusLeadName}</td>
              <td>{item.defaultStatusLead? 'כן' : 'לא'}</td>
             <td>{item.statusLeadList? 'כן' : 'לא'}</td>            

          </tr>
        ))}
      </tbody>
    </table>
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