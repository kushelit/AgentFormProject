import { ChangeEventHandler, FormEventHandler, useEffect, useMemo, useState } from "react";
import { collection, query, where, getDocs, addDoc, deleteDoc, doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase"; // Ensure this path matches your project structure
import { useAuth } from '@/lib/firebase/AuthContext';
import Link from "next/link";
import useFetchMD from "@/hooks/useMD"; 
import './ManageSimulation.css';
import useFetchAgentData from "@/hooks/useFetchAgentData"; 

interface Simulation {
  id: string;
  company: string;
  lowPrem: number;
  highPrem: number;
  cuttingPercent: number;
  // Add other properties as needed
}
  const ManageSimulation: React.FC = () => {
  const { user, detail } = useAuth();
  const [defaultContracts, setDefaultContracts] = useState<any[]>([]);
  const [defaultSimulation, setDefaultSimulation] = useState<any[]>([]);

  const [contracts, setContracts] = useState<any[]>([]);

  const [lowPrem, setLowPrem] = useState(0);
  const [highPrem, setHighPrem] = useState(0);
  const [cuttingPercent, setCuttingPercent] = useState('');

  
  const [selectedRow, setSelectedRow] = useState<any | null>(null);
  const [hoveredRowId, setHoveredRowId] = useState(null);

  const [isEditing1, setIsEditing1] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  
  const [minuySochenFilter1, setMinuySochenFilter1] = useState('');
  const [minuySochen1, setMinuySochen1] = useState(false);



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
  } = useFetchAgentData();


  const handleLowPremChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value;
    const onlyNums = value.replace(/[^0-9]/g, ''); // Remove non-numeric characters
    const numberValue = parseInt(onlyNums, 10); // Convert the string to an integer
    if (!isNaN(numberValue)) { // Check if the conversion gives a valid number
      setLowPrem(numberValue); // Set the state with the number
    } else {
      setLowPrem(0); // Optionally set to 0 or another default value if the input is invalid
    }
  }

   const handleHighPremChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value;
    const onlyNums = value.replace(/[^0-9]/g, ''); // Remove non-numeric characters
    const numberValue = parseInt(onlyNums, 10); // Convert the string to an integer
    if (!isNaN(numberValue)) { // Check if the conversion gives a valid number
      setHighPrem(numberValue); // Set the state with the number
    } else {
      setHighPrem(0); // Optionally set to 0 or another default value if the input is invalid
    }
   };


   const handleCuttingPercent: ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value;
    // Allow numbers and one dot for decimal places
    const onlyNumsAndDot = value.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
    setCuttingPercent(onlyNumsAndDot);
};



const resetForm = () => {
  setSelectedCompany('');
  setLowPrem(0);
  setHighPrem(0);
  setCuttingPercent('');
  setIsEditing1(false);
  setSelectedRow(null); 
};

const canSubmit1 = useMemo(() => (
  selectedCompany.trim() !== '' &&
  lowPrem !== undefined && lowPrem !== null &&
  highPrem !== undefined && highPrem !== null &&
  cuttingPercent !== undefined && cuttingPercent !== null
), [selectedCompany, lowPrem, highPrem, cuttingPercent]);



  const handleSubmit = async () => {
  //  event.preventDefault();
    try {
     
        if (!detail || !detail.agentId) return;

        const docRef = await addDoc(collection(db, 'simulation'), {
        agencyParentid:"1",
        company: selectedCompany,
        lowPrem:lowPrem,
        highPrem:highPrem,
        cuttingPercent:cuttingPercent,
      });      
      console.log('Document written with ID:', docRef.id);
      resetForm(); 
    fetchSimulationData();
    } catch (error) {
      console.error('Error adding document:', error);
    }
  };

  const fetchSimulationData = async () => {
    if (!detail || !detail.agentId) return;
    let simulationQuery = query(
      collection(db, 'simulation'),
      where('agencyParentid', '==', "1")
    );
  
    if (selectedCompanyFilter.trim() !== '') {
      simulationQuery = query(simulationQuery, where('company', '==', selectedCompanyFilter));
    }
  
    try {
      const querySnapshot = await getDocs(simulationQuery);
      const simulationList: Simulation[] = querySnapshot.docs.map(doc => ({
        id: doc.id, // This is correct and should not cause an overwrite error
        ...doc.data() as Omit<Simulation, 'id'> // Explicit cast, ensuring no 'id' is expected from data
      }));
      simulationList.sort((a, b) => {
        if (a.company && b.company) {
          if (a.company < b.company) return -1;
          if (a.company > b.company) return 1;
        }
        return (a.lowPrem || 0) - (b.lowPrem || 0);
      });
      setDefaultSimulation(simulationList);
      resetForm(); 
    } catch (error) {
      console.error("Error fetching contracts data:", error);
    }
  };

  useEffect(() => {
    fetchSimulationData();
  }, [detail,  selectedCompanyFilter]);  // Dependency array




  const handleRowClick = (item: any) => {
    setSelectedRow(item); // Store the selected row's data
    setSelectedCompany(item.company );  
    setLowPrem(item.lowPrem);
    setHighPrem(item.highPrem);
    setCuttingPercent(item.cuttingPercent);
    setIsEditing1(true);
};



  const handleDelete = async () => {
    if (selectedRow && selectedRow.id) {
      await deleteDoc(doc(db, 'simulation', selectedRow.id));
      setSelectedRow(null); 
      resetForm();
      fetchSimulationData();
    } else {
      console.log("No selected row or row ID is undefined");

    }
  };



  const handleEdit = async () => {
    if (selectedRow && selectedRow.id) { // Ensure selectedRow has an 'id' property
      try {
        const docRef = doc(db, 'simulation', selectedRow.id); // Reference to the Firestore document
        await updateDoc(docRef, {
        agencyParentid:"1",
        company: selectedCompany,
        lowPrem:lowPrem,
        highPrem:highPrem,
        cuttingPercent:cuttingPercent,
          });
        console.log("Document successfully updated");
        setSelectedRow(null); 
        resetForm();             
        fetchSimulationData();
      
      } catch (error) {
        console.error("Error updating document:", error);     
      }
    } else {
      console.log("No row selected or missing document ID");
    }
  };

  

return (
  <div>
    {/* First Frame */}
    <div className="frame-container bg-custom-white " style={{ maxWidth: '1000px', margin: '0 auto', padding: '10px 20px 20px 20px', border: '1px solid #ccc', borderRadius: '8px', marginTop: '10px' }}>
      <h2 style={{ textAlign: 'center' , marginBottom: '10px', fontSize:'12px' }}>ניהול סימולטור</h2>    
      <div style={{ marginTop: '20px', width: '90%', margin: '0 auto', overflowX: 'auto' }}>
      {/*   {defaultContracts.length > 0 ? ( */}
          <div className="table-container" style={{ width: '100%' }}>
          <div className="select-container" >
          <select id="company-Select" value={selectedCompanyFilter} onChange={(e) => setSelectedCompanyFilter(e.target.value)}>
        <option value="">בחר חברה</option>
         {companies.map((companyName, index) => (
         <option key={index} value={companyName}>{companyName}</option>
    ))}
     </select>
            </div>
            <table style={{ width: '100%'  }}>
              <thead>
                <tr>
                  <th>חברה</th>
                  <th>סף תחתון</th>
                  <th>סף עליון</th>
                  <th>עמלת קיטום</th>
                </tr>
              </thead>
              <tbody>  
             <tr>
             <td>
          <select
            id="companySelect"
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            style={{ width: '100%' }}>
            <option value="">בחר חברה</option>
            {companies.map((companyName, index) => (
    <option key={index} value={companyName}>{companyName}</option>
    ))}
          </select>
          </td>
          <td>
          <input type="text" 
          inputMode="numeric" 
          value={lowPrem} 
          onChange={handleLowPremChange} 
               />
             </td>
          <td>
          <input type="text" 
          inputMode="numeric" 
          value={highPrem} 
          onChange={handleHighPremChange} 
               />
          </td>
      
        <td>
          <input type="text" 
          id="cuttingPercent" 
          value={cuttingPercent} 
          onChange={handleCuttingPercent} 
          style={{ width: '100%' }} />
        </td>
      </tr>
        {defaultSimulation.map((item) => (
                  <tr key={item.id}
                  onClick={() => handleRowClick(item)}
                  onMouseEnter={() => setHoveredRowId(item.id)}
                  onMouseLeave={() => setHoveredRowId(null)}
                  className={`${selectedRow && selectedRow.id === item.id ? 'selected-row' : ''} ${hoveredRowId === item.id ? 'hovered-row' : ''}`}>
                    <td>{item.company}</td> {/* Use the map for fast lookup */}
                    <td>{item.lowPrem}</td>
                    <td>{item.highPrem}</td>
                    <td>{item.cuttingPercent}</td>
                  </tr>
                ))}
              
  
              </tbody>
            </table>
          </div>
     {/*    ) : (
          <p>No data available for the selected agent.</p>
        )
        
    }*/}
      </div>
      <div className="form-group button-group" >
         <button type="button" onClick={handleSubmit} disabled={!canSubmit1 || isEditing1}>הזן</button>      
          <button type="button" disabled={selectedRow === null} onClick={handleDelete} >מחק</button>
          <button type="button" disabled={selectedRow === null} onClick={handleEdit}>עדכן</button>
          <button type="button" onClick={resetForm}>נקה</button>
        </div>
      </div>
       
    {/* Second Frame */}
   
      </div>
      
  
);};
export default ManageSimulation;