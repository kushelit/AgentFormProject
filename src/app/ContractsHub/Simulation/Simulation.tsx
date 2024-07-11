import { ChangeEventHandler, FormEventHandler, useEffect, useState } from "react";
import { collection, query,setDoc, where, getDocs,getDoc, addDoc, deleteDoc, doc, updateDoc,DocumentSnapshot, DocumentData } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase"; // Ensure this path matches your project structure
import { useAuth } from '@/lib/firebase/AuthContext';
import Link from "next/link";
import './Simulation.css';
import useFetchAgentData from "@/hooks/useFetchAgentData"; 

interface Contract {
  company: string;
  agentId: string;
  product: string;
  productGroup: number;
  commissionHekef: number;
  commissionNifraim: number;
  cuttingPercent: number;
}

interface CalculatedData {
  company: string;
  cuttingPercent: number;
  calculatedProductivityHekef: number;
}

interface SimulationData {
  company: string;
  cuttingPercent: number;
}

const Simulation: React.FC = () => {
const { user, detail } = useAuth();
const [selectedRow, setSelectedRow] = useState<any | null>(null);
const [isEditing, setIsEditing] = useState(false);
const [hoveredRowId, setHoveredRowId] = useState<string | null>(null);
const [salary, setSalary] = useState('');
const [provision, setProvision] = useState('');
const [salaryDoubleProvision, setSalaryDoubleProvision] = useState(0);
const [productivity, setProductivity] = useState(0);
const [results, setResults] = useState<CalculatedData[]>([]);


const { 
    agents, 
    selectedAgentId, 
    handleAgentChange, 
  } = useFetchAgentData();

   
  const handleSalary: ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value
    const onlyNums = value.replace(/[^0-9]/g, '').slice(0, 9);
    setSalary(onlyNums);
  };

 
  const handleProvision: ChangeEventHandler<HTMLInputElement> = (e) => {
    const value = e.target.value;
    const onlyNumsAndDot = value.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
    setProvision(onlyNumsAndDot);
};

useEffect(() => {
    if (salary && provision) {
      const calculatedValue = parseFloat(salary) * parseFloat(provision)/100;
      const roundedValue = Math.round(calculatedValue);
      setSalaryDoubleProvision(roundedValue); // Convert number to string
    }
  }, [salary, provision]);

  useEffect(() => {
    if (salary && provision && salaryDoubleProvision) {
      const calculatedValue = (salaryDoubleProvision) * 12;
      const roundedValue = Math.round(calculatedValue);
      setProductivity(roundedValue); 
    }
  }, [provision, salary, salaryDoubleProvision]);


  async function fetchAndCalculateProductivity(selectedAgentID: string, productivity: number): Promise<CalculatedData[]> {
    const companyCollection = collection(db, "company");
    const simulationCollection = collection(db, "simulation");
    const contractsCollection = collection(db, "contracts");
    const results: CalculatedData[] = [];

    const companyQuery = query(companyCollection, where("simulator", "==", true));
    const companySnapshot = await getDocs(companyQuery);

    if (companySnapshot.empty) {
        console.log("No companies found with simulator==true");
        return [];
    }

    for (const companyDoc of companySnapshot.docs) {
        const company = companyDoc.data().companyName as string;

        const simQuery = query(
            simulationCollection,
            where("company", "==", company),
            where("lowPrem", "<=", productivity),
            where("highPrem", ">=", productivity)
        );
        const simSnapshot = await getDocs(simQuery);

        for (const simDoc of simSnapshot.docs) {
            const simulation = simDoc.data();
            const cuttingPercent = simulation.cuttingPercent as number;

            let contractQuery = query(
                contractsCollection,
                where("company", "==", company),
                where("AgentId", "==", selectedAgentID),
                where("product", "==", "פנסיה"),
            );
            let contractSnapshot = await getDocs(contractQuery);
       
            console.log(`Contracts fetched for ${company}:`, contractSnapshot.size);

            if (contractSnapshot.empty) {
                console.log(`No contracts found for company ${company} with product 'פנסיה', trying fallback...`);
                contractQuery = query(
                    contractsCollection,
                    where("AgentId", "==", selectedAgentID),
                    where("productsGroup", "==", "1"),
                );
              
                contractSnapshot = await getDocs(contractQuery);                
            }
            contractSnapshot.forEach(contractDoc => {
                const contractData = contractDoc.data();
                if (contractData.minuySochen === false || contractData.minuySochen === undefined) {

                const commissionHekef = contractData.commissionHekef as number;
                const calculatedProductivityHekef = productivity * commissionHekef/100 * cuttingPercent/100;
                results.push({
                    company: company,
                    cuttingPercent: cuttingPercent,
                    calculatedProductivityHekef: calculatedProductivityHekef
                });
            }}
          );
        }
    }

    return results;
}

  const resetForm = () => {
    setSalary(''); 
    setProvision('');
    setSalaryDoubleProvision(0);
    setProductivity(0);
  };


  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();  
    try {    
      const fetchedResults = await fetchAndCalculateProductivity(selectedAgentId, productivity);
      setResults(fetchedResults); 
    } catch (error) {
      console.error('Error finding document:', error);
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
                        <label htmlFor="salary">שכר</label>
                    </td>
                    <td>
                    <input type="text" id="salary" name="salary" value={salary}   onChange={handleSalary} />
                    </td>
                    </tr> 
                    <tr>
                    <td>
                        <label htmlFor="provision">הפרשות</label>
                    </td>
                    <td>
                    <input type="text" id="provision" name="provision" value={provision}  onChange ={handleProvision} />
                    </td>
                    </tr> 
                    <tr>
                    <td>
                        <label htmlFor="salaryDoubleProvision">חודשי</label>
                    </td>
                    <td>
                    <input type="text" id="salaryDoubleProvision" name="salaryDoubleProvision" value={salaryDoubleProvision.toLocaleString()} />
                    </td>
                    </tr> 
                    <tr>
                    <td>
                        <label htmlFor="productivity">תפוקה</label>
                    </td>
                    <td>
                    <input type="text" id="productivity" name="productivity" value={productivity.toLocaleString()} />
                    </td>
                    </tr> 
          </tbody>       
        </table>
           <div className="form-group button-group" style={{ display: 'flex' }}>
            <button type="submit" >חשב</button>                
            <button type="button" onClick={resetForm}>נקה</button>
          </div>        
       </form>
       <div className="select-container" >        
        <table>
         <thead>
         <tr>
          <th>חברה</th>
          <th>אחוז קיטום</th>
          <th>תפוקה מחושבת</th>
        </tr>
      </thead>
      <tbody>
      {results.map((item, index) => (
            <tr key={index}>
              <td>{item.company}</td>
              <td>{item.cuttingPercent}</td>
              <td>{item.calculatedProductivityHekef.toLocaleString()}</td> {/* Display calculated productivity */}

            </tr>
          ))}
      </tbody>
    </table>
 </div>
      </div>  
      <div className="data-container">
     
  <div className="table-container" style={{ overflowX: 'auto', maxHeight: '300px' }}>
    <div className= "buttons-container" >  
        </div>
</div>
      </div>
    </div>
    
);}
export default Simulation;
