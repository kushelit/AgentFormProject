import { useEffect, useState, ChangeEvent  } from 'react';
import { query, collection, where, getDocs, getDoc, doc } from 'firebase/firestore';
import { db } from "@/lib/firebase/firebase";
import { useAuth } from '@/lib/firebase/AuthContext';
import { useRouter } from 'next/router';
//import useCalculateSalesData from "@/hooks/useCalculateGoalsSales"; 
import { hasPermission } from '@/lib/permissions/hasPermission';


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
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  
  
//  const [selectedAgentId, setSelectedAgentId] = useState<string>(() => {
//   if (detail?.role === 'admin') {
//       return ''; // Treat empty string as "all agents" for admins
//   }
//   return detail?.agentId || ''; // Default to the logged-in user's agent ID for other roles
// });
  

  const [selectedAgentName, setSelectedAgentName] = useState("");
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [selectedWorkerName, setSelectedWorkerName] = useState("")
  const [companies, setCompanies] = useState<string[]>([]);
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedWorkerIdGoals, setSelectedWorkerIdGoals] = useState("");
  const [selectedWorkerNameGoal, setSelectedWorkerNameGoal] = useState("")
  const [selectedWorkerIdFilter, setSelectedWorkerIdFilter] = useState("");
  const [selectedWorkerNameFilter, setSelectedWorkerNameFilter] = useState("")
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState('');
  const [workerNameMap, setWorkerNameMap] = useState<WorkerNameMap>({});
  const [isLoadingAgent, setIsLoadingAgent] = useState(false);

  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]); // Selected companies

 // const { fetchDataGoalsForWorker} = useCalculateSalesData();



  interface WorkerNameMap {
    [key: string]: string;
  }

  useEffect(() => {
    console.log("🔍 user changed:", user);
    console.log("🔍 detail changed:", detail);
  }, [user, detail]);




  // useEffect(() => {
  //   if (!user || !detail || agents.length > 0) return; // ✅ אם כבר יש נתונים, לא טוענים שוב!
  //   const fetchAgentData = async () => {
  //     setIsLoadingAgent(true);
  //     console.log("🔄 Fetching agents...");
  
  //     try {
  //       if (detail.role === 'admin') {
  //         console.log("👤 User is admin, fetching all agents.");
  //         const agentsQuery = query(collection(db, 'users'), where('role', '==', 'agent'));
  //         const querySnapshot = await getDocs(agentsQuery);
  //         const agentsList = querySnapshot.docs.map(doc => ({
  //           id: doc.id,
  //           name: doc.data().name as string,
  //         }));
  //         console.log("✅ Agents loaded:", agentsList);
  //         setAgents(agentsList);
  //       } else if (detail.agentId) {
  //         setAgents([{ id: detail.agentId, name: detail.name }]);
  //         setSelectedAgentId(detail.agentId);
  //         setSelectedAgentName(detail.name);
  //         await fetchWorkersForSelectedAgent(detail.agentId);
  //       }
  //     } catch (error) {
  //       console.error("⚠️ Failed to fetch agents:", error);
  //       setAgents([]);
  //     } finally {
  //       setIsLoadingAgent(false);
  //     }
  //   };
  //   fetchAgentData();
  // }, [user, detail]); // ✅ הקריאה ל-DB לא תקרה שוב אם `agents` כבר מלאים!
  

  // useEffect(() => {
  //   if (!user || !detail || agents.length > 0) return;
  
  //   const fetchAgentData = async () => {
  //     setIsLoadingAgent(true);
  //     try {
  //       if (detail.role === 'admin') {
  //         const agentsQuery = query(
  //           collection(db, 'users'),
  //           where('role', 'in', ['agent', 'manager'])
  //         );
  //         const querySnapshot = await getDocs(agentsQuery);
  //         const agentsList = querySnapshot.docs.map(doc => ({
  //           id: doc.id,
  //           name: doc.data().name as string,
  //         }));
  //         setAgents(agentsList);
  //       } else if (detail.role === 'manager') {
  //         // שלוף סוכנים שה-managerId שלהם שווה למזהה המשתמש
  //         const agentsQuery = query(
  //           collection(db, 'users'),
  //           where('role', '==', 'agent'),
  //           where('managerId', '==', detail.agentId)
  //         );
  //         const querySnapshot = await getDocs(agentsQuery);
  //         const agentsList = querySnapshot.docs.map(doc => ({
  //           id: doc.id,
  //           name: doc.data().name as string,
  //         }));
  // console.log("agentsList manager", agentsList);
  //         setAgents([
  //           { id: detail.agentId, name: detail.name }, // המנג'ר עצמו ראשון
  //           ...agentsList
  //         ]);
  
  //         setSelectedAgentId(detail.agentId);
  //         setSelectedAgentName(detail.name);
  //         await fetchWorkersForSelectedAgent(detail.agentId);
  //       } else {
  //         // Worker רגיל - שלוף את הסוכן לפי agentId
  //         const agentDoc = await getDoc(doc(db, 'users', detail.agentId));
  //         const agentName = agentDoc.exists() ? agentDoc.data().name : 'לא נמצא';
        
  //         setAgents([{ id: detail.agentId, name: agentName }]);
  //         setSelectedAgentId(detail.agentId);
  //         setSelectedAgentName(agentName);
  //         await fetchWorkersForSelectedAgent(detail.agentId);
  //       }        
  //     } catch (error) {
  //       console.error("⚠️ Failed to fetch agents:", error);
  //       setAgents([]);
  //     } finally {
  //       setIsLoadingAgent(false);
  //     }
  //   };
  
  //   fetchAgentData();
  // }, [user, detail]);
  
  useEffect(() => {
    if (!user || !detail || agents.length > 0) return;
  
    const fetchAgentData = async () => {
      setIsLoadingAgent(true);
      try {
        const currentUser = {
          ...user,
          permissionOverrides: detail.permissionOverrides || {}
        };
  
        // טען את ההרשאות לפי התפקיד הנוכחי של המשתמש
        const roleDoc = await getDoc(doc(db, 'roles', detail.role));
        const rolePerms = roleDoc.exists() ? roleDoc.data().permissions || [] : [];
  
        const hasExpandedAccess = hasPermission({
          user: currentUser,
          permission: 'access_all_agents_under_manager',
          rolePermissions: rolePerms
        });
  
        if (detail.role === 'admin') {
          const agentsQuery = query(
            collection(db, 'users'),
            where('role', 'in', ['agent', 'manager'])
          );
          const querySnapshot = await getDocs(agentsQuery);
          const agentsList = querySnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name as string,
          }));
          setAgents(agentsList);
        } else if (detail.role === 'manager') {
          const agentsQuery = query(
            collection(db, 'users'),
            where('role', '==', 'agent'),
            where('managerId', '==', detail.agentId)
          );
          const querySnapshot = await getDocs(agentsQuery);
          const agentsList = querySnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name as string,
          }));
  
          setAgents([
            { id: detail.agentId, name: detail.name },
            ...agentsList.filter(a => a.id !== detail.agentId)
          ]);
          setSelectedAgentId(detail.agentId);
          setSelectedAgentName(detail.name);
          await fetchWorkersForSelectedAgent(detail.agentId);
        } else if ((detail.role === 'agent' || detail.role === 'worker') && hasExpandedAccess) {
          const agentDoc = await getDoc(doc(db, 'users', detail.agentId));
          const agentData = agentDoc.exists() ? agentDoc.data() : null;
  
          if (!agentData) {
            setAgents([]);
            setIsLoadingAgent(false);
            return;
          }
  
          const isAgentManager = agentData.role === 'manager';
          const managerId = isAgentManager ? detail.agentId : agentData.managerId;
  
          const managerDoc = managerId ? await getDoc(doc(db, 'users', managerId)) : null;
          const managerData = managerDoc?.exists() ? managerDoc.data() : null;
  
          const agentsQuery = managerId ? query(
            collection(db, 'users'),
            where('role', '==', 'agent'),
            where('managerId', '==', managerId)
          ) : null;
  
          const querySnapshot = agentsQuery ? await getDocs(agentsQuery) : { docs: [] };
          const agentsList = querySnapshot.docs.map(doc => ({
            id: doc.id,
            name: doc.data().name as string,
          }));
  
          const fullList = [
            ...(managerId && managerData ? [{ id: managerId, name: managerData.name }] : []),
            ...(agentDoc.exists() && agentData && agentDoc.id !== managerId ? [{ id: agentDoc.id, name: agentData.name }] : []),
            ...agentsList.filter(a => a.id !== agentDoc.id && a.id !== managerId)
          ];
  
          setAgents(fullList);
          setSelectedAgentId(detail.agentId);
          setSelectedAgentName(agentData.name || 'לא נמצא');
          await fetchWorkersForSelectedAgent(detail.agentId);
        } else {
          const agentDoc = await getDoc(doc(db, 'users', detail.agentId));
          const agentName = agentDoc.exists() ? agentDoc.data().name : 'לא נמצא';
  
          setAgents([{ id: detail.agentId, name: agentName }]);
          setSelectedAgentId(detail.agentId);
          setSelectedAgentName(agentName);
          await fetchWorkersForSelectedAgent(detail.agentId);
        }
      } catch (error) {
        console.error("⚠️ Failed to fetch agents:", error);
        setAgents([]);
      } finally {
        setIsLoadingAgent(false);
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


  // useEffect(() => {
  //   if (selectedAgentId) {
  //     fetchWorkersForSelectedAgent(selectedAgentId);
  //   } else {
  //     setWorkers([]);
  //   }
  // }, [selectedAgentId]);


  useEffect(() => {
    if (selectedAgentId) {
      // Fetch workers for the selected agent
      fetchWorkersForSelectedAgent(selectedAgentId);
      
      // Reset worker selection when the agent changes
      setSelectedWorkerIdFilter(''); // Clear any previously selected worker
      setSelectedWorkerName(''); // Clear worker name, if necessary
    } else {
      setWorkers([]);
      setSelectedWorkerIdFilter(''); // Ensure the worker selection is cleared if no agent is selected
    }
  }, [selectedAgentId]);




  // const handleAgentChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
  //   const { value } = event.target;
  
  //   if (value === '') {
  //     // If "All Agents" is selected, set selectedAgentId to ''
  //     setSelectedAgentId(''); 
  //     setSelectedAgentName('כל הסוכנים');
  //     setWorkers([]); // Clear workers list
  //   } else {
  //     // Otherwise, set the selected agent's ID
  //     const selectedAgent = agents.find(agent => agent.id === value);
  
  //     if (selectedAgent) {
  //       setSelectedAgentId(selectedAgent.id);
  //       setSelectedAgentName(selectedAgent.name);

  //       // Clear the worker selection after the agent is changed
  //     setSelectedWorkerIdFilter('');
  //     }
  //   }
  // };


  const handleAgentChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const { value } = event.target;
//here
    if (value === '') {
        // Reset state for "בחר סוכן"
        setSelectedAgentId('');
        setSelectedAgentName('בחר סוכן');
        setWorkers([]); // Clear workers list
    } else if (value === 'all') {
        // Fetch data for "כל הסוכנות"
        setSelectedAgentId('all');
        setSelectedAgentName('כל הסוכנות');
        setWorkers([]);
    } else {
        // Fetch data for a specific agent
        const selectedAgent = agents.find((agent) => agent.id === value);

        if (selectedAgent) {
            setSelectedAgentId(selectedAgent.id);
            console.log("Selected agent ID:", selectedAgent.id);
            setSelectedAgentName(selectedAgent.name);
            setSelectedWorkerIdFilter('');
        }
    }
};





  const handleWorkerChange = (event: React.ChangeEvent<HTMLSelectElement> , updateType: 'insert' | 'filter' | 'goal') => {
    const selectedOption = event.target.options[event.target.selectedIndex];
    if (updateType === 'insert') {
    setSelectedWorkerId(selectedOption.value); // Update the ID of the selected worker
    setSelectedWorkerName(selectedOption.text); // Update the name of the selected worker
    }
    else if (updateType === 'filter') {
      setSelectedWorkerIdFilter(selectedOption.value); 
      setSelectedWorkerNameFilter(selectedOption.text); 
    //  handleCalculate().catch(console.error); 
    }
    else if (updateType === 'goal') {
      setSelectedWorkerIdGoals(selectedOption.value); 
      setSelectedWorkerNameGoal(selectedOption.text);
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
      const companiesList = querySnapshot.docs.map(doc => doc.data().companyName); 
      setCompanies(companiesList);
    };

    fetchCompanies();
  }, []);

 

 return {
  agents,
  selectedAgentId,
  setSelectedAgentId,
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
  setSelectedWorkerIdFilter,
  selectedWorkerIdGoals, 
  setSelectedWorkerIdGoals,
  selectedWorkerNameGoal, 
  setSelectedWorkerNameGoal,
  isLoadingAgent,
  setIsLoadingAgent,
  selectedCompanies,
  setSelectedCompanies
  //handleCalculate
  // Any other states or functions you might be using
};
};


export default useFetchAgentData;