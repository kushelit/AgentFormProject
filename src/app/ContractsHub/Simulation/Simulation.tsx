import React, { useState, useEffect, ChangeEventHandler, FormEventHandler } from 'react';
import { Firestore, QueryDocumentSnapshot, DocumentData ,collection, query, where, getDocs, CollectionReference  } from "firebase/firestore";
import { db } from "@/lib/firebase/firebase";
import { useAuth } from '@/lib/firebase/AuthContext';
import './Simulation.css';
import useFetchAgentData from "@/hooks/useFetchAgentData";


interface Company {
    companyName: string;
  }

  
interface Simulation {
    company: string;
    cuttingPercent: number;
    lowPrem: number;
    highPrem: number;
  }

  // Additional interface to include relevant data along with the snapshot
interface SimulationData {
    snapshot: QueryDocumentSnapshot<Simulation>;
    cuttingPercent: number;
  }
  

  interface Contract {
    company: string;
    AgentId: string; 
    product: string;
    productsGroup: number;
    commissionHekef: number;
    commissionNifraim: number;
    commissionNiud: number;
    minuySochen?: boolean;
  }

  interface ContractData {
    snapshot: QueryDocumentSnapshot<Contract>;
    commissionHekef: number;
    commissionNifraim: number;
    commissionNiud: number;
  }


  interface CalculatedResult {
    company: string;
    cuttingPercent: number;
    calculatedProductivityHekef: number;
    calculatedProductivityNifraim: number;
    calculatedNiud: number;
    onceHekefNiud: number;
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
  const [niud, setNiud] = useState(0);
  const [results, setResults] = useState<CalculatedResult[]>([]);
  const [loading, setLoading] = useState(false);

  const {
    agents,
    selectedAgentId,
    handleAgentChange,
  } = useFetchAgentData();

  const handleSalary: ChangeEventHandler<HTMLInputElement> = (e) => {
    const onlyNums = e.target.value.replace(/[^0-9]/g, '').slice(0, 9);
    setSalary(onlyNums);
  };

  const handleNuid: ChangeEventHandler<HTMLInputElement> = (e) => {
    const onlyNums = e.target.value.replace(/[^0-9]/g, '');
    setNiud(Number(onlyNums));
  };

  const [displayValue, setDisplayValue] = useState(''); // Display value with %

  const handleProvision = (event: { target: { value: string; }; }) => {
    const input = event.target.value.replace(/%/g, ''); // Remove % for calculation
    const numericValue = input.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1'); // Remove non-digits for the actual value
    setProvision(numericValue); // Update the actual numeric value
    setDisplayValue(`${numericValue}%`); // Update the display value
  };

  
 // const handleProvision: ChangeEventHandler<HTMLInputElement> = (e) => {
 //   const onlyNumsAndDot = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*?)\..*/g, '$1');
 //   setProvision(onlyNumsAndDot);
 // };

  useEffect(() => {
    if (salary && provision) {
      const calculatedValue = parseFloat(salary) * parseFloat(provision) / 100;
      const roundedValue = Math.round(calculatedValue);
      setSalaryDoubleProvision(roundedValue);
    }
  }, [salary, provision]);

  useEffect(() => {
    if (salary && provision && salaryDoubleProvision) {
      const calculatedValue = salaryDoubleProvision * 12;
      const roundedValue = Math.round(calculatedValue);
      setProductivity(roundedValue);
    }
  }, [provision, salary, salaryDoubleProvision]);


  const resetForm = () => {
    setSalary('');
    setProvision('');
    setSalaryDoubleProvision(0);
    setProductivity(0);
    setNiud(0);
    setResults([]);  
  };

  
const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();  
//    setLoading(true);
    setIsEditing(true);
    setResults([]);  
    try {
        const companySnapshot = await fetchCompanyData();  
        const simData = await fetchSimulationData(companySnapshot, productivity);  
        const contractData = await fetchContractData(companySnapshot, selectedAgentId);  
        const processedResults = processResults(companySnapshot, simData, contractData);  
        setResults(processedResults);  
    } catch (error) {
        // console.error('Error handling the data fetching process:', error);
    }
 //   setLoading(false);
    setIsEditing(false);
};


  const fetchCompanyData = async (): Promise<QueryDocumentSnapshot<Company>[]> => {
    const companyQuery = query(collection(db, "company"), where("simulator", "==", true));
    const snapshot = await getDocs(companyQuery);
    return snapshot.docs as QueryDocumentSnapshot<Company>[];
  };


  const fetchSimulationData = async (
    companySnapshot: QueryDocumentSnapshot<Company>[],
    productivity: number
): Promise<SimulationData[][]> => {
  
    const fetchPromises = companySnapshot.map(doc => {
      
        const company = doc.data().companyName;
        const simulationsRef = collection(db, "simulation") as CollectionReference<Simulation>;
        const simQuery = query(
            simulationsRef,
            where("company", "==", company),
            where("lowPrem", "<=", productivity),
            where("highPrem", ">=", productivity)
        );

        return getDocs(simQuery).then(simSnapshot => {
            return simSnapshot.docs.map(snapshot => ({
                snapshot: snapshot,
                cuttingPercent: snapshot.data().cuttingPercent
            }));
        }).catch(error => {
            // console.error(`Error fetching simulation data for company ${company}:`, error);
            return [];  // Handle errors appropriately, maybe return an empty array
        });
    });

    const startTime = performance.now();  // Start timing before the requests
    const results = await Promise.all(fetchPromises);
    const endTime = performance.now();    // End timing after all requests have finished
    // console.log(`Fetched all simulation data in ${(endTime - startTime).toFixed(2)} ms`);

    return results;
};


const fetchContractData = async (
  companySnapshot: QueryDocumentSnapshot<Company>[],
  selectedAgentId: string
): Promise<ContractData[][]> => {
  const contractData: ContractData[][] = [];
  // console.log('Fetching contracts data...');
  const startTime = performance.now();
  const fetchPromises = companySnapshot.map(doc => {
      const company = doc.data().companyName;
      const contractCollectionRef = collection(db, "contracts") as CollectionReference<Contract>;
      const initialQuery = query(
          contractCollectionRef,
          where("company", "==", company),
          where("AgentId", "==", selectedAgentId),
          where("product", "==", "פנסיה"),
          where("minuySochen", "==", false)
      );
     
      return getDocs(initialQuery).then(querySnapshot => {
        
          if (querySnapshot.empty) {
              // Fallback query
              const fallbackQuery = query(
                  contractCollectionRef,
                  where("AgentId", "==", selectedAgentId),
                  where("productsGroup", "==", "1"),
                  where("minuySochen", "==", false)
              );
              return getDocs(fallbackQuery).then(fallbackSnapshot => 
                  fallbackSnapshot.docs.map(doc => ({
                      snapshot: doc,
                      commissionHekef: doc.data().commissionHekef,
                      commissionNifraim: doc.data().commissionNifraim,
                      commissionNiud: doc.data().commissionNiud
                  }))
              );
          } else {
              return querySnapshot.docs.map(doc => ({
                  snapshot: doc,
                  commissionHekef: doc.data().commissionHekef,
                  commissionNifraim: doc.data().commissionNifraim,
                  commissionNiud: doc.data().commissionNiud
              }));
          }
      }).catch(error => {
          // console.error(`Error fetching contracts for company ${company}:`, error);
          return [];  // Return an empty array in case of error
      });
  });
 
  const results = await Promise.all(fetchPromises);
  const endTime = performance.now();
  // console.log(`Fetched contracts data in ${(endTime - startTime).toFixed(2)} ms`);
  return results;
  
};


  const processResults = (
    companySnapshot: QueryDocumentSnapshot<Company>[],
    simData: SimulationData[][],  // This should contain all simulation data per company
    contractData: ContractData[][]  // This should contain all contract data per company
  ): CalculatedResult[] => {
    const results: CalculatedResult[] = [];
    // console.log('Fetching results data...');
    const startTime = performance.now();
    companySnapshot.forEach((companyDoc, index) => {
      const companyInfo = companyDoc.data();
      simData[index].forEach(simulationData => {
        const simulation = simulationData.snapshot.data();
        contractData[index].forEach(contractData => {
          const contract = contractData.snapshot.data();
       //   if (!contract.minuySochen) {
            const calculatedProductivityHekef = Math.round(productivity * contract.commissionHekef / 100 * simulation.cuttingPercent / 100);
            const calculatedProductivityNifraim = Math.round(salaryDoubleProvision * contract.commissionNifraim / 100);
            const calculatedNiud = Math.round(Number(niud) * contract.commissionNiud / 100);
            const onceHekefNiud = calculatedProductivityHekef + calculatedNiud;
            results.push({
              company: companyInfo.companyName,
              cuttingPercent: simulation.cuttingPercent,
              calculatedProductivityHekef,
              calculatedProductivityNifraim,
              calculatedNiud,
              onceHekefNiud
            }
          );
          }
   //     }
      );
      });
    });
    const endTime = performance.now();
    // console.log(`Fetched results data in ${(endTime - startTime).toFixed(2)} ms`);
    results.sort((a, b) => b.onceHekefNiud - a.onceHekefNiud);
    return results;
  };
  // console.log(results); 

  return (
    <div className="content-container">
      <div className="form-container">
        <form onSubmit={handleSubmit}>
          <table>
            <tbody>
              <tr>
                <td><label htmlFor="agentSelect">סוכנות</label></td>
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
                <td><label htmlFor="salary">שכר</label></td>
                <td><input type="text" id="salary" name="salary" value={salary} onChange={handleSalary} /></td>
              </tr>
              <tr>
                <td><label htmlFor="provision">הפרשות</label></td>
                <td><input type="text" id="provision" name="provision" value={displayValue} onChange={handleProvision} /></td>
              </tr>
              <tr>
                <td><label htmlFor="salaryDoubleProvision">חודשי</label></td>
                <td><input type="text" id="salaryDoubleProvision" name="salaryDoubleProvision" value={salaryDoubleProvision.toLocaleString()} readOnly /></td>
              </tr>
              <tr>
                <td><label htmlFor="productivity">תפוקה</label></td>
                <td><input type="text" id="productivity" name="productivity" value={productivity.toLocaleString()} onChange={(e) => setProductivity(Number(e.target.value.replace(/,/g, '')))} /></td>
              </tr>
              <tr>
                <td><label htmlFor="nuid">ניוד</label></td>
                <td><input type="text" id="nuid" name="nuid" value={niud.toString()} onChange={handleNuid} /></td>
              </tr>
            </tbody>
          </table>
          <div className="form-group button-group" style={{ display: 'flex' }}>
            <button type="submit" disabled={isEditing === true}>חשב</button>
            <button type="button" onClick={resetForm}>נקה</button>
          </div>
        </form>
  {/*      {loading && (
          <div className="loader"></div> // This will show the loading spinner
        )} */}
        <div className="select-container">
          <table>
            <thead>
              <tr>
                <th>חברה</th>
                {detail!.role !== 'worker' && <th>אחוז קיטום</th>}
                {detail!.role !== 'worker' && <th>היקף</th>}
                {detail!.role !== 'worker' && <th>ניוד</th>}
                {detail!.role !== 'worker' && <th>חד פעמי</th>}
                {detail!.role !== 'worker' && <th>נפרעים</th>}
              </tr>
            </thead>
            <tbody>
              {results.map((item, index) => (
                <tr key={index}>
                  <td>{item.company}</td>
                  {detail?.role !== 'worker' && <td>{item.cuttingPercent}%</td>}
                  {detail?.role !== 'worker' && <td>{item.calculatedProductivityHekef.toLocaleString()}</td>}
                  {detail?.role !== 'worker' && <td>{item.calculatedNiud.toLocaleString()}</td>}
                  {detail?.role !== 'worker' && <td>{item.onceHekefNiud.toLocaleString()}</td>}
                  {detail?.role !== 'worker' && <td>{item.calculatedProductivityNifraim.toLocaleString()}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="data-container">
        <div className="table-container" style={{ overflowX: 'auto', maxHeight: '300px' }}>
          <div className="buttons-container"></div>
        </div>
      </div>
    </div>
  );
}

export default Simulation;