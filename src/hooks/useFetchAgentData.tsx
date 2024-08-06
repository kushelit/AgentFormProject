import { useEffect, useState, ChangeEvent  } from 'react';
import { query, collection, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from "@/lib/firebase/firebase";
import { useAuth } from '@/lib/firebase/AuthContext';
import { useRouter } from 'next/router';


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

 // const fetchWorkersForSelectedAgent = async (agentId: string) => {
   // if (!agentId) {
     // console.log("agentId is undefined");
      //return; // Exit the function if agentId is undefined to avoid making a faulty query
  //}
   // const workersQuery = query(collection(db, 'users'), where('agentId', '==', agentId), where('role', 'in', ['worker', 'agent']));
   // const querySnapshot = await getDocs(workersQuery);
   // const workersList = querySnapshot.docs.map(doc => ({
   //   id: doc.id,
   //   name: doc.data().name,
   // }));
  //  setWorkers(workersList);
  //};

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
      setSelectedAgentId(selectedAgent.id); // Assuming this state is managed here or passed down from the hook
      setSelectedAgentName(selectedAgent.name); // Update the state for the selected agent's name
    }
  };



  const handleWorkerChange = (event: React.ChangeEvent<HTMLSelectElement> , updateType: 'insert' | 'filter') => {
    const selectedOption = event.target.options[event.target.selectedIndex];
    if (updateType === 'insert') {
    setSelectedWorkerId(selectedOption.value); // Update the ID of the selected worker
    setSelectedWorkerName(selectedOption.text); // Update the name of the selected worker
    }
    else {
      // Update other variables
      setSelectedWorkerIdFilter(selectedOption.value); // Assuming you have a setter for other variable IDs
      setSelectedWorkerNameFilter(selectedOption.text); // Assuming you have a setter for other variable names
    }
  };



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
  workerNameMap
  // Any other states or functions you might be using
};
};


export default useFetchAgentData;