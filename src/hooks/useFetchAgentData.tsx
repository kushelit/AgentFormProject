import { useEffect, useState, ChangeEvent  } from 'react';
import { query, collection, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from "@/lib/firebase/firebase";
import { useAuth } from '@/lib/firebase/AuthContext';
import { useRouter } from 'next/router';
//import useCalculateSalesData from "@/hooks/useCalculateGoalsSales"; 


interface Agent {
  id: string;
  name: string;
}

interface Worker {
  name: string;
  id: string;
}

// Assuming User and Detail interfaces are correctly imported or defined above

const useFetchAgentData = () => {
  const { user, detail } = useAuth(); // Assuming useAuth() hook correctly provides User | null and Detail | null
  const [agents, setAgents] = useState<{id: string, name: string}[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedAgentName, setSelectedAgentName] = useState("");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [selectedWorkerName, setSelectedWorkerName] = useState("")
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');


  const [selectedWorkerIdFilter, setSelectedWorkerIdFilter] = useState("");
  const [selectedWorkerNameFilter, setSelectedWorkerNameFilter] = useState("")
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState('');

  const [workerNameMap, setWorkerNameMap] = useState<WorkerNameMap>({});


 // const { fetchDataGoalsForWorker} = useCalculateSalesData();



  interface WorkerNameMap {
    [key: string]: string;
  }



  useEffect(() => {
    const fetchAgentData = async () => {
      if (user && detail?.role === 'admin') {
        const agentsQuery = query(collection(db, 'users'), where('role', '==', 'agent'));
        const querySnapshot = await getDocs(agentsQuery);
        const agentsList = querySnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name as string,
        }));
        setAgents(agentsList);
      } else if (detail?.agentId) {
        const agentDocRef = doc(db, 'users', detail.agentId);
        const agentDocSnap = await getDoc(agentDocRef);
        if (agentDocSnap.exists()) {
          const agent = { id: agentDocSnap.id, name: agentDocSnap.data().name as string };
          setAgents([agent]);
          setSelectedAgentId(agent.id); // Auto-select if only one agent is applicable
          setSelectedAgentName(agent.name)
          await fetchWorkersForSelectedAgent(detail.agentId);
        } else {
          console.log("No such Agent!");
        }
      }
    };
    fetchAgentData();
  }, [user, detail]);


  const fetchWorkersForSelectedAgent = async (agentId: string) => {
    if (!agentId) {
      console.log("Agent ID is undefined");
      setWorkers([]);
      setWorkerNameMap({});
      return;
    }
  
    const workersQuery = query(collection(db, 'users'), where('agentId', '==', agentId), where('role', 'in', ['worker', 'agent']));
    try {
      const querySnapshot = await getDocs(workersQuery);
      const workersData: Worker[] = [];
      const workersMap: WorkerNameMap = {};
  
      querySnapshot.forEach(doc => {
        const data = doc.data() as Worker; // Assume data always contains 'name'
        workersData.push({ id: doc.id, name: data.name });
        workersMap[doc.id] = data.name; // Build the map
      });
  
      setWorkers(workersData); // Update the workers list
      setWorkerNameMap(workersMap); // Update the map for quick lookup
    } catch (error) {
      console.error('Failed to fetch workers:', error);
      setWorkers([]);
      setWorkerNameMap({});
    }
  };


  useEffect(() => {
    if (selectedAgentId) {
      fetchWorkersForSelectedAgent(selectedAgentId);
    } else {
      setWorkers([]);
    }
  }, [selectedAgentId]);

  const handleAgentChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target;
    const selectedAgent = agents.find(agent => agent.id === value);
  
    if (selectedAgent) {
      setSelectedAgentId(selectedAgent.id); 
      setSelectedAgentName(selectedAgent.name); 
    }
  };



  const handleWorkerChange = (event: React.ChangeEvent<HTMLSelectElement> , updateType: 'insert' | 'filter') => {
    const selectedOption = event.target.options[event.target.selectedIndex];
    if (updateType === 'insert') {
    setSelectedWorkerId(selectedOption.value); // Update the ID of the selected worker
    setSelectedWorkerName(selectedOption.text); // Update the name of the selected worker
    }
    else {
      setSelectedWorkerIdFilter(selectedOption.value); 
      setSelectedWorkerNameFilter(selectedOption.text); 
    //  handleCalculate().catch(console.error); 
    }
  };


 // const handleCalculate = async () => {
 //   if (!selectedAgentId) {
  //      console.error('No agent selected');
  //      return;
   // }

   // if (selectedWorkerIdFilter) {
        // If a specific worker is selected, fetch data for that worker
    //    console.log(`Fetching data for worker ${selectedWorkerIdFilter}`);
      //  await fetchDataGoalsForWorker(selectedAgentId, selectedWorkerIdFilter);
   // } else {
        // If no worker is selected, fetch data for all workers under the selected agent
    //    console.log('Fetching data for all workers under the selected agent');
   //     await fetchDataGoalsForWorker(selectedAgentId);
 //   }
  //  console.log('Data fetched and table data should be updated now');
//};





  useEffect(() => {
    const fetchCompanies = async () => {
      const querySnapshot = await getDocs(collection(db, 'company'));
      const companiesList = querySnapshot.docs.map(doc => doc.data().companyName); // Assuming the field name is 'companyName'
      setCompanies(companiesList);
    };

    fetchCompanies();
  }, []);





 return {
  agents,
  selectedAgentId,
  workers,
  selectedWorkerId,
  setSelectedWorkerName,
  setSelectedWorkerId,
  
  handleAgentChange,
  handleWorkerChange,
  selectedAgentName,
  selectedWorkerName,
  //handleCompaniesChange,
  companies,
  setCompanies,
  selectedCompany, 
  setSelectedCompany,
  selectedWorkerIdFilter,
  selectedWorkerNameFilter,
  selectedCompanyFilter,
  setSelectedCompanyFilter,
  fetchWorkersForSelectedAgent,
  workerNameMap,
  //handleCalculate
  // Any other states or functions you might be using
};
};


export default useFetchAgentData;