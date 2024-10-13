/* eslint-disable react/jsx-no-comment-textnodes */
"use client"
import React, { useState, useEffect, FormEventHandler, ChangeEventHandler, ChangeEvent, useMemo, useCallback } from 'react';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs, doc, addDoc, deleteDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';
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
    productGroupMap
  } = useFetchMD();




const [agentData, setAgentData] = useState<any[]>([]);
const [idCustomerFilter, setIdCustomerFilter] = useState('');
const [firstNameCustomerFilter, setfirstNameCustomerFilter] = useState('');
const [lastNameCustomerFilter, setlastNameCustomerFilter] = useState('');
const [minuySochenFilter, setMinuySochenFilter] = useState('');
const [expiryDateFilter, setExpiryDateFilter] = useState('');


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

useEffect(() => {
 
   if (selectedAgentId) {
     fetchDataForAgent(selectedAgentId);
   }
 }, [selectedAgentId]); 



const fetchDataForAgent = async (UserAgentId: string) => {
  const customerQuery = query(collection(db, 'customer'), where('AgentId', '==', UserAgentId));
  const customerSnapshot = await getDocs(customerQuery);
  const customers: Customer[] = customerSnapshot.docs.map(doc => ({
    ...doc.data() as Customer, // Spread the customer data first
    id: doc.id // Then assign the 'id', so it does not get overwritten by doc.data()
  }));

  const salesQuery = query(collection(db, 'sales'), where('AgentId', '==', UserAgentId));
  const salesSnapshot = await getDocs(salesQuery);
  const sales: Sale[] = salesSnapshot.docs.map(doc => ({
    ...doc.data() as Sale, // Spread the sales data first
    id: doc.id // Then assign the 'id', ensuring it is set correctly
  }));

  const combinedData: CombinedData[] = sales.map(sale => {
    const customer = customers.find(customer => customer.IDCustomer === sale.IDCustomer);
    return {
      ...sale, 
      firstNameCustomer: customer ? customer.firstNameCustomer : 'Unknown',
      lastNameCustomer: customer ? customer.lastNameCustomer : 'Unknown',
    };
  });

  setAgentData(combinedData.sort((a, b) => {
    const [monthA, yearA] = a.mounth.split('/').map(Number);
    const [monthB, yearB] = b.mounth.split('/').map(Number);
    return (yearB + 2000) - (yearA + 2000) || monthB - monthA; // Adjust sort for descending order
  }));
};



  useEffect(() => {
    // Filter data based on selected filter values
    let data = agentData.filter(item => {
      return (selectedWorkerIdFilter ? item.workerId === selectedWorkerIdFilter : true) &&
             (selectedCompanyFilter ? item.company === selectedCompanyFilter : true) &&
             (selectedProductFilter ? item.product === selectedProductFilter : true) &&
             item.IDCustomer.includes(idCustomerFilter)&&
             item.firstNameCustomer.includes(firstNameCustomerFilter)&&
             item.lastNameCustomer.includes(lastNameCustomerFilter)&&
             (minuySochenFilter === '' || item.minuySochen.toString() === minuySochenFilter) &&
             item.mounth.includes(expiryDateFilter)&&
             (selectedStatusPolicyFilter ? item.statusPolicy === selectedStatusPolicyFilter : true);
    });
    setFilteredData(data);
  }, [selectedWorkerIdFilter, selectedCompanyFilter, selectedProductFilter, selectedStatusPolicyFilter, agentData, idCustomerFilter, firstNameCustomerFilter, lastNameCustomerFilter, minuySochenFilter, expiryDateFilter]);



  return (
    <div className="frame-container bg-custom-white" style={{ maxWidth: '1000px', margin: '0 auto', padding: '10px 20px 20px 20px', border: '1px solid #ccc', borderRadius: '8px', marginTop: '10px' }}>
                  
   <div style={{ marginTop: '20px', width: '90%', margin: '0 auto', overflowX: 'auto' }}>
       
   <div className="table-container" style={{ width: '100%' }}>

       <input
       type="text"
       placeholder="שם פרטי"
       value={firstNameCustomerFilter}
       onChange={(e) => setfirstNameCustomerFilter(e.target.value)}
       />
        <input
       type="text"
       placeholder="שם משפחה"
       value={lastNameCustomerFilter}
       onChange={(e) => setlastNameCustomerFilter(e.target.value)}
       />
      <input
       type="text"
       placeholder="תז לקוח"
       value={idCustomerFilter}
       onChange={(e) => setIdCustomerFilter(e.target.value)}
       />
      

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

       <select id="worker-select" value={selectedWorkerIdFilter} 
       onChange={(e) => handleWorkerChange(e, 'filter')}>
        <option value="">כל העובדים</option>
        {workers.map(worker => (
          <option key={worker.id} value={worker.id}>{worker.name}</option>
        ))}
      </select>
      <select id="agent-select" value={selectedAgentId} onChange={handleAgentChange}>
        {detail?.role === 'admin' && <option value="">כל הסוכנות</option>}
        {agents.map(agent => (
          <option key={agent.id} value={agent.id}>{agent.name}</option>
        ))}
      </select>
      <div className="select-container" >

              
<table>
            <thead>
              <tr>
                <th>שם פרטי </th>
                <th>שם משפחה </th>
                <th>תז </th>
                <th>חברה</th>
                <th>מוצר</th>
                <th>פרמיה ביטוח</th>
                <th>פרמיה פנסיה</th>
                <th>צבירה פנסיה</th>
                <th>פרמיה פיננסים</th>
                <th>צבירה פיננסים</th>
                <th>חודש תפוקה</th>
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
                  <td>{item.firstNameCustomer}</td>
                  <td>{item.lastNameCustomer}</td>
                  <td>{item.IDCustomer}</td>
                  <td>{item.company}</td>
                  <td>{item.product}</td>
                  <td>{Number(item.insPremia).toLocaleString('en-US')}</td>
                  <td>{Number(item.pensiaPremia).toLocaleString('en-US')}</td>
                  <td>{Number(item.pensiaZvira).toLocaleString('en-US')}</td>
                  <td>{Number(item.finansimPremia).toLocaleString('en-US')}</td>
                  <td>{Number(item.finansimZvira).toLocaleString('en-US')}</td>
                  <td>{item.mounth}</td>
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
      </div>
  );
        }
export default Log;
