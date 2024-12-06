/* eslint-disable react/jsx-no-comment-textnodes */
"use client"
import React, { useState, useEffect, FormEventHandler, ChangeEventHandler, ChangeEvent, useMemo, useCallback } from 'react';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs, doc, addDoc, deleteDoc, updateDoc, getDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import './Log.css';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from "@/hooks/useFetchAgentData"; 
import useSalesData from "@/hooks/useSalesData"; 
import useFetchMD from "@/hooks/useMD"; 
import useCalculateSalesData from "@/hooks/useCalculateGoalsSales"; 


function Log() {
  const { user, detail } = useAuth();
  const { 
    agents, 
    selectedAgentId, 
    handleAgentChange, 
    workers, 
    selectedWorkerId,
    selectedWorkerName, 
    setSelectedWorkerName,
    setSelectedWorkerId, 
    selectedAgentName,
    handleWorkerChange , 
    companies,
    setCompanies,
    selectedCompany, 
    setSelectedCompany,
    selectedWorkerIdFilter,
    setSelectedWorkerIdFilter,
    selectedWorkerNameFilter,
    selectedCompanyFilter,
    setSelectedCompanyFilter,
    fetchWorkersForSelectedAgent,
    workerNameMap,
    selectedWorkerIdGoals,
    setSelectedWorkerIdGoals,
    selectedWorkerNameGoal, 
    setSelectedWorkerNameGoal,
    isLoadingAgent
  } = useFetchAgentData();



   const {
    products,
    selectedProduct,
    setSelectedProduct,
    selectedProductGroup, 
    setSelectedStatusPolicy, 
    selectedStatusPolicy, 
    statusPolicies,
    selectedProductFilter,
    setSelectedProductFilter,
    selectedStatusPolicyFilter, 
    setSelectedStatusPolicyFilter, 
    productGroupMap,
    formatIsraeliDateOnly
  } = useFetchMD();

 


const [agentData, setAgentData] = useState<any[]>([]);
const [idCustomerFilter, setIdCustomerFilter] = useState('');
const [firstNameCustomerFilter, setfirstNameCustomerFilter] = useState('');
const [lastNameCustomerFilter, setlastNameCustomerFilter] = useState('');
const [minuySochenFilter, setMinuySochenFilter] = useState('');
const [expiryDateFilter, setExpiryDateFilter] = useState('');

const [timeRange, setTimeRange] = useState('יום'); // Default is 'lastDay'
const [loading, setLoading] = useState(true);  // Add loading state here

interface Customer {
  id: string;
  AgentId: string;
  firstNameCustomer: string;
  lastNameCustomer: string;
  IDCustomer: string;
  // Add other customer fields as necessary
}

interface Sale {
  id: string;
  AgentId: string;
  IDCustomer: string;
  company: string;
  product: string;
  insPremia: number;
  pensiaPremia: number;
  pensiaZvira: number;
  finansimPremia: number;
  finansimZvira: number;
  mounth: string;
  statusPolicy: string;
  minuySochen: boolean;
  workerName: string;
  workerId: string;
  notes: string;
  createdAt: Timestamp;
  // Add other sale fields as necessary
}

interface CombinedData extends Sale {
  firstNameCustomer: string;
  lastNameCustomer: string;
}

type AgentDataType = {
  id: string;
  firstNameCustomer: string;
  lastNameCustomer: string;
  IDCustomer: string;
  company: string;
  product: string;
  insPremia: number;
  pensiaPremia: number;
  pensiaZvira: number;
  finansimPremia: number;
  finansimZvira: number;
  mounth: string;
  statusPolicy: string;
  minuySochen: boolean;
  workerName: string;
  workerId: string; 
  notes: string; 
  createdAt: Timestamp;
};


type AgentDataTypeForFetching = {
  
  firstNameCustomer: string;
  lastNameCustomer: string;
  IDCustomer: string;
  company: string;
  product: string;
  insPremia: number;
  pensiaPremia: number;
  pensiaZvira: number;
  finansimPremia: number;
  finansimZvira: number;
  mounth: string;
  statusPolicy: string;
  minuySochen: boolean;
  workerName: string;
  workerId: string; 
  notes: string; 
 
};

const [filteredData, setFilteredData] = useState<AgentDataType[]>([]);

// Handler for changing the time range
const handleTimeRangeChange = (event: { target: { value: React.SetStateAction<string>; }; }) => {
  setTimeRange(event.target.value);
};



useEffect(() => {
     fetchDataForAgent(selectedAgentId); 
 }, [selectedAgentId, timeRange]); 


 const fetchDataForAgent = async (UserAgentId: string) => {
  setLoading(true); // Set loading to true when the fetch starts

  let customerQuery;
  let salesQuery;
  let dateRangeFilter; // Timestamp to filter based on time range

  // Log timeRange and UserAgentId for debugging
  console.log("Fetching data for time range:", timeRange, "and agent ID:", UserAgentId);

  // Calculate the appropriate date range based on the selected time range
  if (timeRange === 'יום') {
    // Create a new Date object to avoid mutation
    const oneDayAgo = new Date(); // New Date object for Last Day
    oneDayAgo.setDate(oneDayAgo.getDate() - 1); // Subtract 1 day
    dateRangeFilter = Timestamp.fromDate(oneDayAgo);
    console.log("Date range filter applied for Last Day:", dateRangeFilter);

  } else if (timeRange === 'שבוע') {
    // Create a new Date object to avoid mutation
    const sevenDaysAgo = new Date(); // New Date object for Last Week
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7); // Subtract 7 days
    dateRangeFilter = Timestamp.fromDate(sevenDaysAgo); // Convert to Firestore Timestamp

    console.log("Date range filter applied for Last Week:", dateRangeFilter);

    dateRangeFilter = Timestamp.fromDate(sevenDaysAgo);
  }

  // If no specific agent is selected, fetch all data
  if (UserAgentId) {
    customerQuery = query(collection(db, 'customer'), where('AgentId', '==', UserAgentId));
    salesQuery = query(collection(db, 'sales'), where('AgentId', '==', UserAgentId));
  } else {
    customerQuery = collection(db, 'customer'); // Fetch all customers
    salesQuery = collection(db, 'sales'); // Fetch all sales
  }

  // Apply date filter to salesQuery if a time range is selected (not "all")
  if (timeRange !== 'all' && dateRangeFilter) {
    salesQuery = query(
      salesQuery,
      where('createdAt', '!=', null), // Ensure createdAt is not null
      where('createdAt', '>=', dateRangeFilter) // Apply date range filter
    );
    console.log('Sales query with date filter applied:', dateRangeFilter.toDate());
  }

  // Fetch customer data
  const customerSnapshot = await getDocs(customerQuery);
  const customers: Customer[] = customerSnapshot.docs.map(doc => ({
    ...doc.data() as Customer,
    id: doc.id
  }));

  // Fetch sales data
  const salesSnapshot = await getDocs(salesQuery);
  const sales: Sale[] = salesSnapshot.docs.map(doc => ({
    ...doc.data() as Sale,
    id: doc.id
  }));

  // Log sales data for debugging
  console.log("Fetched sales data:", sales);

  // Combine sales and customer data
  const combinedData: CombinedData[] = sales.map(sale => {
    const customer = customers.find(customer => customer.IDCustomer === sale.IDCustomer);
    return {
      ...sale, 
      firstNameCustomer: customer ? customer.firstNameCustomer : 'Unknown',
      lastNameCustomer: customer ? customer.lastNameCustomer : 'Unknown',
    };
  });

  // Sort the combined data by the month/year field in descending order
  setAgentData(combinedData.sort((a, b) => {
    const [monthA, yearA] = a.mounth.split('/').map(Number);
    const [monthB, yearB] = b.mounth.split('/').map(Number);
    return (yearB + 2000) - (yearA + 2000) || monthB - monthA; // Adjust sort for descending order
  }));

  setLoading(false); // Set loading to false when the fetch completes
};

  useEffect(() => {


     // Log selectedAgentId to ensure it's empty when "כל הסוכנים" is selected
  console.log("selectedAgentId: ", selectedAgentId);

  // Ensure agentData contains all agents' data
  console.log("agentData: ", agentData);
    let data = agentData.filter(item => {

    const matchesAgent = selectedAgentId !== '' ? item.AgentId === selectedAgentId : true;
    const matchesWorker = selectedWorkerIdFilter ? item.workerId === selectedWorkerIdFilter : true;
    const matchesCompany = selectedCompanyFilter ? item.company === selectedCompanyFilter : true;
    const matchesProduct = selectedProductFilter ? item.product === selectedProductFilter : true;
    const matchesIDCustomer = item.IDCustomer.includes(idCustomerFilter);
    const matchesFirstName = item.firstNameCustomer.includes(firstNameCustomerFilter);
    const matchesLastName = item.lastNameCustomer.includes(lastNameCustomerFilter);
    const matchesMinuySochen = (minuySochenFilter === '' || item.minuySochen.toString() === minuySochenFilter);
    const matchesMonth = item.mounth.includes(expiryDateFilter);
    const matchesStatusPolicy = selectedStatusPolicyFilter ? item.statusPolicy === selectedStatusPolicyFilter : true;

    // Return true if all conditions match
    return (
      matchesAgent &&
      matchesWorker &&
      matchesCompany &&
      matchesProduct &&
      matchesIDCustomer &&
      matchesFirstName &&
      matchesLastName &&
      matchesMinuySochen &&
      matchesMonth &&
      matchesStatusPolicy
    );
  });
console.log("selectedAgentId "+ selectedAgentId)
     // Sort the filtered data by createDate in descending order (latest first)
  data = data.sort((a, b) => {
    // Ensure createDate exists and is either a Firestore Timestamp or a Date
    const dateA = a.createdAt instanceof Timestamp ? a.createdAt.toDate() : a.createdAt;
    const dateB = b.createdAt instanceof Timestamp ? b.createdAt.toDate() : b.createdAt;

    // If createDate doesn't exist, sort it last
    if (!dateA) return 1;
    if (!dateB) return -1;

    return dateB.getTime() - dateA.getTime(); // Sort by date, latest first
  });
  
    setFilteredData(data);
  }, [selectedAgentId, selectedWorkerIdFilter, selectedCompanyFilter, selectedProductFilter, selectedStatusPolicyFilter, agentData, idCustomerFilter, firstNameCustomerFilter, lastNameCustomerFilter, minuySochenFilter, expiryDateFilter]);

  

  return (
    <div className="frame-container bg-custom-white" style={{ maxWidth: '1000px', margin: '0 auto', padding: '10px 20px 20px 20px', border: '1px solid #ccc', borderRadius: '8px', marginTop: '10px' }}>
                  
   <div style={{ marginTop: '20px', width: '90%', margin: '0 auto', overflowX: 'auto' }}>
   <div className="select-container" style={{ overflowX: 'auto', maxHeight: '300px' }}>      
 
 <select value={timeRange} onChange={(e) => setTimeRange(e.target.value)}>
  <option value="יום">יום אחרון</option>
  <option value="שבוע">שבוע אחרון</option>
  <option value="all">הכל</option>
</select>
 
 <select id="agent-select" value={selectedAgentId} onChange={handleAgentChange}>
        {detail?.role === 'admin' && <option value="">כל הסוכנות</option>}
        {agents.map(agent => (
          <option key={agent.id} value={agent.id}>{agent.name}</option>
        ))}
      </select>
      <select id="worker-select" value={selectedWorkerIdFilter} 
       onChange={(e) => handleWorkerChange(e, 'filter')}>
        <option value="">כל העובדים</option>
        {workers.map(worker => (
          <option key={worker.id} value={worker.id}>{worker.name}</option>
        ))}
      </select>
 <select id="company-Select" value={selectedCompanyFilter} onChange={(e) => setSelectedCompanyFilter(e.target.value)}>
        <option value="">בחר חברה</option>
         {companies.map((companyName, index) => (
         <option key={index} value={companyName}>{companyName}</option>
    ))}
     </select>
     <select id="product-Select" value={selectedProductFilter} onChange={(e) => setSelectedProductFilter(e.target.value)}>
               <option value="">בחר מוצר</option>
              {products.map(product => (
             <option key={product.id} value={product.name}>{product.name}</option>
         ))}
        </select>
        <input type="text" 
        id="expiry-Date" 
        name="expiry-Date" 
        placeholder="MM/YY" 
        maxLength={5} 
        value={expiryDateFilter} 
        onChange={(e) => setExpiryDateFilter(e.target.value)} />

        <select
      id="status-PolicySelect"
      value={selectedStatusPolicyFilter}
      onChange={(e) => setSelectedStatusPolicyFilter(e.target.value)}>
     <option value=""> סטאטוס פוליסה</option>
                            {statusPolicies.map((status, index) => (
                                <option key={index} value={status}>{status}</option>
       ))}
       </select>
       <select value={minuySochenFilter} onChange={(e) => setMinuySochenFilter(e.target.value)}>
    <option value="">מינוי סוכן </option>
    <option value="true">כן</option>
    <option value="false">לא</option>
  </select>
        </div>
   <div className="table-container" style={{ width: '100%' }}>

   <table style={{ width: '100%'  }}>
            <thead>
              <tr>
              <th>תאריך יצירה</th>
                <th>שם פרטי </th>
                <th>שם משפחה </th>
                <th>תז </th>
                <th>חברה</th>
                <th className="narrow-column">מוצר</th>
                <th>פרמיה ביטוח</th>
                <th>פרמיה פנסיה</th>
                <th>צבירה פנסיה</th>
                <th>פרמיה פיננסים</th>
                <th>צבירה פיננסים</th>
                <th className="narrow-column">חודש תפוקה</th>
                <th> סטאטוס</th>
                <th>מינוי סוכן</th>
                <th>שם עובד</th>
                {/* Add more titles as necessary */}
              </tr>
            </thead>
            <tbody>
              {filteredData.map((item) => (
                <tr key={item.id}
      
                 >
                   <td>{item.createdAt ? item.createdAt.toDate().toLocaleDateString() : 'N/A'}</td>
                  <td>{item.firstNameCustomer}</td>
                  <td>{item.lastNameCustomer}</td>
                  <td>{item.IDCustomer}</td>
                  <td>{item.company}</td>
                  <td className="narrow-column">{item.product}</td>
                  <td>{Number(item.insPremia).toLocaleString('en-US')}</td>
                  <td>{Number(item.pensiaPremia).toLocaleString('en-US')}</td>
                  <td>{Number(item.pensiaZvira).toLocaleString('en-US')}</td>
                  <td>{Number(item.finansimPremia).toLocaleString('en-US')}</td>
                  <td>{Number(item.finansimZvira).toLocaleString('en-US')}</td>
                  <td className="narrow-column">{item.mounth ? formatIsraeliDateOnly(item.mounth) : ""}</td>
                  <td>{item.statusPolicy}</td>
                  <td>{item.minuySochen ? 'כן' : 'לא'}</td>
                  <td>{item.workerName}</td>
                  {/* Add more data fields as necessary */}
                </tr>
              ))}
            </tbody>
          </table>
     

      </div>
      </div>
      </div>
  );
        }
export default Log;
