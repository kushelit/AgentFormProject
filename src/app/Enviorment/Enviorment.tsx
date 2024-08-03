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
const [selectedRowPromotion, setSelectedRowPromotion] = useState<any | null>(null);
const [selectedRowStars, setSelectedRowStars] = useState<any | null>(null);
const [isEditing, setIsEditing] = useState(false);
const [isEditingPromotion, setIsEditingPromotion] = useState(false);
const [isEditingStars, setIsEditingStars] = useState(false);


const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
const [sourceLead, setSourceLead] = useState<string | null>(null);
const [statusLead, setStatusLead] =  useState(false);
const [sourceLeadList, SetSourceLeadList] = useState<any[]>([]);

const [promotionValue, setPromotionValue] = useState<string | null>(null);

const [promotionName, setPromotionName] = useState<string | null>(null);
const [promotionStatus, setPromotionStatus] =  useState(false);
const [promotionMonthlyRepeat, setPromotionMonthlyRepeat] =  useState(false);
const [promotionStartDate, setPromotionStartDate] =  useState('');
const [promotionEndtDate, setPromotionEndDate] =  useState('');
const [promotionList, SetPromotionList] = useState<any[]>([]);
const [promotionListForStars, setPromotionListForStars] = useState<PromotionMapping>({});
const [starsList,setStarsList ] = useState<any[]>([]);

const [insuranceStar, setInsuranceStar] = useState<number | null>(null);
const [pensiaStar, setPensiaStar] = useState<number | null>(null);
const [finansimStar, setFinansimStar] = useState<number | null>(null);
const [promotionId, setPromotionId] = useState<string | null>(null);

const handlePromotionStartDate = (e: React.ChangeEvent<HTMLInputElement>) => setPromotionStartDate(e.target.value);
const handlePromotionEndDate = (e: React.ChangeEvent<HTMLInputElement>) => setPromotionEndDate(e.target.value)

const { 
    agents, 
    selectedAgentId, 
    handleAgentChange, 
  } = useFetchAgentData();

 
    
  useEffect(() => {
    if (selectedAgentId) {
        fetchSourceLeadForAgent(selectedAgentId);
        fetchPromotionsForAgent(selectedAgentId);
        fetchStarsForAgent(selectedAgentId);
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


    const fetchPromotionsForAgent = async (UserAgentId: string) => {
      const q = query(
        collection(db, 'promotion'), 
        where('AgentId', '==', UserAgentId)
      );
      try {
        const querySnapshot = await getDocs(q);
        const promotionsMap: PromotionMapping = {};
        if (querySnapshot.empty) {
          SetPromotionList([]); // Clear the state if no promotions are found
          console.log('No promotions found for agent:', UserAgentId);
          setPromotionListForStars({}); // Clear the state if no promotions are found
        } else {
          querySnapshot.forEach(doc => {
            const data = doc.data() as PromotionData;
            SetPromotionList(prev => [...prev, { id: doc.id, ...data }]);
            if (typeof data.promotionName === 'string') {
              promotionsMap[doc.id] = data.promotionName;
            } else {
              console.error('Promotion name missing or invalid for document:', doc.id);
            }
          });
          
          setPromotionListForStars(promotionsMap); // Store the mapping
          console.log('Promotions fetched and mapped:', promotionsMap);
        }
      } catch (error) {
        console.error('Error fetching promotions:', error);
        setPromotionListForStars({}); // Clear the state in case of error
      }
    };


      const fetchStarsForAgent = async (UserAgentId: string) => {
        const q = query(
          collection(db, 'stars'), 
          where('AgentId', '==', selectedAgentId)
        );
        const querySnapshot = await getDocs(q);
        const data = querySnapshot.docs.map(doc => ({
            id: doc.id, 
            ...doc.data() 
          }));
          setStarsList(data);
          console.log('SetStarsList '+ setStarsList)
        };

  //handle row selected function **
  const handleRowClick = (item: any) => {
    setSelectedRow(item); // Store the selected row's data
    setSourceLead(item.sourceLead || '');
    setStatusLead(item.statusLead || '');
  };

  const handleRowClickPromotion = (item: any) => {
    setSelectedRowPromotion(item); // Store the selected row's data
    setPromotionName(item.promotionName || '');
    setPromotionStatus(item.promotionStatus || '');
    setPromotionMonthlyRepeat(item.promotionMonthlyRepeat || '');
    setPromotionStartDate(item.promotionStartDate || '');
    setPromotionEndDate(item.promotionEndDate || '');
  };


  
  const handleRowClickStars = (item: any) => {
    setSelectedRowStars(item); // Store the selected row's data
    setInsuranceStar(item.insuranceStar || 0);
    setPensiaStar(item.pensiaStar || 0);
    setFinansimStar(item.finansimStar || 0);
    setPromotionId(item.promotionId || '');
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

  const handleDeletePromotion = async () => {
    if (selectedRowPromotion && selectedRowPromotion.id) {
      await deleteDoc(doc(db, 'promotion', selectedRowPromotion.id));
      setSelectedRowPromotion(null); // Reset selection
      resetFormPromotion();
      setIsEditingPromotion(false);
      if (selectedAgentId) {
        fetchPromotionsForAgent(selectedAgentId);
      }
    } else {
      console.log("No selected row or row ID is undefined");
    }
  };

  const handleDeleteStars = async () => {
    if (selectedRowStars && selectedRowStars.id) {
      await deleteDoc(doc(db, 'stars', selectedRowStars.id));
      setSelectedRowStars(null); // Reset selection
      resetFormStars();
      setIsEditingStars(false);
      if (selectedAgentId) {
        fetchStarsForAgent(selectedAgentId);
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


  const handleEditPromotion = async () => {
    if (selectedRowPromotion && selectedRowPromotion.id) {
      try {
        const docRef = doc(db, 'promotion', selectedRowPromotion.id); 
        await updateDoc(docRef, {        
          promotionName,
          promotionStatus:!!promotionStatus,
          promotionMonthlyRepeat:!!promotionMonthlyRepeat,
          promotionStartDate,
          promotionEndtDate
        });
        console.log("Document successfully updated");
        setSelectedRowPromotion(null); 
        resetFormPromotion();         
        if (selectedAgentId) {
            fetchPromotionsForAgent(selectedAgentId);
          }
      } catch (error) {
        console.error("Error updating document:", error);     
      }
    } else {
      console.log("No row selected or missing document ID");
    }
  };


  const handleEditStars = async () => {
    if (selectedRowStars && selectedRowStars.id) {
      try {
        const docRef = doc(db, 'stars', selectedRowStars.id); 
        await updateDoc(docRef, {        
          insuranceStar,
          pensiaStar,
          finansimStar,
          promotionId: promotionValue
        });
        console.log("Document successfully updated");
        setSelectedRowStars(null); 
        resetFormStars();         
        if (selectedAgentId) {
            fetchStarsForAgent(selectedAgentId);
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

  const resetFormPromotion = () => {
   setPromotionName('');
    setPromotionStatus(false);
    setPromotionMonthlyRepeat(false);
    setPromotionStartDate('');
    setPromotionEndDate('');
  };

  
  const resetFormStars = () => {
    setPromotionValue('');
    setInsuranceStar(0);
    setPensiaStar(0);
    setFinansimStar(0);
    setPromotionId('');
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
  

  const handleSubmitPromotion: FormEventHandler<HTMLFormElement> = async (event) => {
    try {
    event.preventDefault();
        const docRef = await addDoc(collection(db, 'promotion'), {
        AgentId: selectedAgentId,
        promotionName: promotionName,
        promotionStatus: promotionStatus,
        promotionMonthlyRepeat: promotionMonthlyRepeat,
        promotionStartDate: promotionStartDate,
        promotionEndDate : promotionEndtDate,
      });
      alert('מבצע  התווסף בהצלחה');
      console.log('Document written with ID:', docRef.id);
      resetFormPromotion(); 
      setIsEditingPromotion(false);
      if (selectedAgentId) {
        fetchPromotionsForAgent(selectedAgentId);
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
  
  const handleSelectPromotion: ChangeEventHandler<HTMLSelectElement> = (event) => {
    setPromotionValue(event.target.value);
    console.log('promotionValue:',promotionValue);

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
            <button type="button" onClick={resetFormPromotion}>נקה</button>
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
      <form onSubmit={handleSubmitPromotion}>
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
                        <label htmlFor="sourceLead">שם מבצע</label>
                    </td>
                    <td>
                    <input type="text" id="promotionName" name="promotionName" value={promotionName || ''}  onChange={(e) => setPromotionName(e.target.value)} />
                    </td>
                    </tr> 
                    <tr>
                    <td>
                        <label htmlFor="notes">מתחדש</label>
                    </td>
                    <td>
                        <input type="checkbox" id="promotionMonthlyRepeat" name="promotionMonthlyRepeat" checked={promotionMonthlyRepeat} onChange={(e) => setPromotionMonthlyRepeat(e.target.checked)} />
                    </td>
                </tr>
                <tr>
                <td><label htmlFor="promotionStartDate">תאריך התחלה</label></td>
                <td><input type="date" id="promotionStartDate" name="promotionStartDate" value={promotionStartDate} onChange={handlePromotionStartDate} /></td>
              </tr>
              <tr>
                <td><label htmlFor="promotionEndDate">תאריך סיום</label></td>
                <td><input type="date" id="promotionEndDate" name="promotionEndDate" value={promotionEndtDate} onChange={handlePromotionEndDate} /></td>
              </tr>
                    <tr>
                    <td>
                        <label htmlFor="promotionStatus">פעיל</label>
                    </td>
                    <td>
                        <input type="checkbox" id="promotionStatus" name="promotionStatus" checked={promotionStatus} onChange={(e) => setPromotionStatus(e.target.checked)} />
                    </td>
                </tr>
          </tbody>       
        </table>
           <div className="form-group button-group" style={{ display: 'flex' }}>
            <button type="submit" disabled={isEditingPromotion}> הזן</button>                
            <button type="button" disabled={selectedRowPromotion === null} onClick={handleDeletePromotion} >מחק</button>
            <button type="button" disabled={selectedRowPromotion === null} onClick={handleEditPromotion}>עדכן</button>
            <button type="button" onClick={resetFormPromotion}>נקה</button>
          </div>        
       </form>
       <div className="select-container" >        
        <table>
         <thead>
         <tr>
         <th>שם מבצע</th>
          <th>מתחדש</th>
          <th>תאריך התחלה</th>
          <th>תאריך סיום</th>
          <th>סטאטוס</th>
        </tr>
      </thead>
      <tbody>
        {promotionList.map((item) => (
          <tr key={item.id}
          onClick={() => handleRowClickPromotion(item)}
          onMouseEnter={() => setHoveredRowId(item.id)}
          onMouseLeave={() => setHoveredRowId(null)}
          className={`${selectedRowPromotion && selectedRowPromotion.id === item.id ? 'selected-row' : ''} ${hoveredRowId === item.id ? 'hovered-row' : ''}`}>
              <td>{item.promotionName}</td>
              <td>{item.promotionMonthlyRepeat? 'כן' : 'לא'}</td>
              <td>{item.promotionStartDate}</td>
              <td>{item.promotionEndDate}</td>
              <td>{item.promotionStatus? 'כן' : 'לא'}</td>            

          </tr>
        ))}
      </tbody>
    </table>
 </div>
      </div>
  <div className="table-container" style={{ maxHeight: '300px' }}>
    <div className= "buttons-container" >  
    <div className="data-container">
      <form onSubmit={handleSubmitStars}>
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
                  <label htmlFor="promotionValue">שם מבצע </label>
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
                  <label htmlFor="insuranceStar">שווי כוכב ביטוח</label>
                </td>
                <td>
                  <input type="number" id="insuranceStar" name="insuranceStar" value={insuranceStar || 0} onChange={(e) => setInsuranceStar(parseInt(e.target.value))} />
                </td>
              </tr>
              <tr>
                <td>
                  <label htmlFor="pensiaStar">שווי כוכב פנסיה</label>
                </td>
                <td>
                  <input type="number" id="pensiaStar" name="pensiaStar" value={pensiaStar || 0} onChange={(e) => setPensiaStar(parseInt(e.target.value))} />
                </td>
              </tr>
              <tr>
                <td>
                  <label htmlFor="finansimStar">שווי כוכב פיננסים</label>
                </td>
                <td>
                  <input type="number" id="finansimStar" name="finansimStar" value={finansimStar || 0} onChange={(e) => setFinansimStar(parseInt(e.target.value))} />
                </td>
              </tr>
          </tbody>       
        </table>
           <div className="form-group button-group" style={{ display: 'flex' }}>
            <button type="submit" disabled={isEditingStars}> הזן</button>                
            <button type="button" disabled={selectedRowStars === null} onClick={handleDeleteStars} >מחק</button>
            <button type="button" disabled={selectedRowStars === null} onClick={handleEditStars}>עדכן</button>
            <button type="button" onClick={resetFormStars}>נקה</button>
          </div>        
       </form>
       <div className="select-container" >        
        <table>
         <thead>
         <tr>
         <th>שם מבצע</th>
         <th>שווי כוכב ביטוח</th>
          <th>שווי כוכב פנסיה</th>
          <th>שווי כוכב פיננסים</th>
        </tr>
      </thead>
      <tbody>
        {starsList.map((item) => (
          <tr key={item.id}
          onClick={() => handleRowClickStars(item)}
          onMouseEnter={() => setHoveredRowId(item.id)}
          onMouseLeave={() => setHoveredRowId(null)}
          className={`${selectedRowStars && selectedRowStars.id === item.id ? 'selected-row' : ''} ${hoveredRowId === item.id ? 'hovered-row' : ''}`}>
        <td>{promotionListForStars[item.promotionId] || 'Unknown Promotion'}</td>
        <td>{item.insuranceStar}</td>
              <td>{item.pensiaStar}</td>
              <td>{item.finansimStar}</td>
                
          </tr>
        ))}
      </tbody>
    </table>
 </div>
      </div>



        </div>
</div>
      </div>
    
);}
export default Enviorment;
