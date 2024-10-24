'use client';

import React, { useState, useEffect } from 'react';
import { query, collection, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import './SummaryTable.css';
import useFetchMD from "@/hooks/useMD"; 
import Select from 'react-select';
import SalesCountGraph from  "@/components/SalesCountGraph"; 
import useSalesData from '@/hooks/useSalesCalculateData';

 


const SummaryTable = () => {
  const { user, detail } = useAuth();
  const { workers, agents, selectedAgentId,setSelectedAgentId, handleAgentChange, handleWorkerChange, selectedWorkerId ,
    companies, selectedCompany, selectedWorkerIdFilter,
    setSelectedCompany,isLoadingAgent } = useFetchAgentData();

 
  const {
    products,
    selectedProduct,
    setSelectedProduct,
    selectedProductGroup, 
    setSelectedStatusPolicy, 
    selectedStatusPolicy, 
    statusPolicies
  } = useFetchMD();

  // useEffect(() => {
  //   if (!detail) {
  //     console.log("1-Detail is not available yet.");
  //     return; // Wait until detail is available
  //   }
  //   console.log("2-Detail:", detail); // Check if detail is available and what its content is
  //   if (detail.role === 'admin') {
  //     setSelectedAgentId(''); // Set "All Agents" for admin
  //     console.log("3-SelectedAgentId set to '' for admin");
  //   } else {
  //     setSelectedAgentId(detail.agentId || ''); // Set the agentId for other roles
  //     console.log("4-SelectedAgentId set to the user's agentId");
  //   }
  // }, [detail]); // Run this effect when `detail` is updated
  

  useEffect(() => {
    if (detail?.role === 'admin' && (selectedAgentId === null || selectedAgentId === undefined)) {
        setSelectedAgentId(''); // Set to "All Agents" on admin login
    }
    console.log("SelectedAgentId set to  " + selectedAgentId);
}, [detail, selectedAgentId]);

  // useEffect(() => {
  //   console.log("useEffect triggered on mount");
  //   console.log("admin " +selectedAgentId+ detail?.role  );
  //   if (detail?.role === 'admin' && (selectedAgentId === null || selectedAgentId === undefined)) {
  //     setSelectedAgentId(''); // Set "All Agents" by default when admin logs in
  //     console.log("SelectedAgentId set to '' for admin");
  //   }
  //   console.log("SelectedAgentId2 set to '' for admin");
  //   // Empty dependency array so it runs only once
  // }, []);


  const { monthlyTotals, overallTotals, isLoadingData } = useSalesData(selectedAgentId, selectedWorkerIdFilter, selectedCompany, selectedProduct, selectedStatusPolicy);
  const monthsCount = Object.keys(monthlyTotals).length;

  // Calculating averages
const averageFinansim = Math.round(overallTotals.finansimTotal / monthsCount);
const averagePensia = Math.round(overallTotals.pensiaTotal / monthsCount);
const averageInsurance = Math.round(overallTotals.insuranceTotal / monthsCount);
const averageNiudPensia = Math.round(overallTotals.niudPensiaTotal / monthsCount);
const averageCommissionHekef = Math.round(overallTotals.commissionHekefTotal / monthsCount);
const averageCommissionNifraim = Math.round(overallTotals.commissionNifraimTotal / monthsCount);




  return (
    <div className="frame-container bg-custom-white" style={{ maxWidth: '1000px', margin: '0 auto', padding: '10px 20px 20px 20px', border: '1px solid #ccc', borderRadius: '8px', marginTop: '10px' }}>

       <div style={{ marginTop: '20px', width: '90%', margin: '0 auto', overflowX: 'auto' }}>
      {/*   {defaultContracts.length > 0 ? ( */}
          <div className="table-container" style={{ width: '100%' }}>
            <table style={{ width: '100%'  }}></table>
          { isLoadingData  && (
  <div className="spinner-overlay">
    <div className="spinner"></div>
  </div>
)} 

      <table className="table-style">
        <thead>
          <tr>
            <th>חודש תפוקה</th>
            <th>סך פיננסים</th>
            <th>סך פנסיה</th>
            <th>סך ביטוח</th>
            <th>ניוד פנסיה</th>
            <th>עמלת היקף</th>
            <th>עמלת נפרעים</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(monthlyTotals).sort((a, b) => {
            const [monthA, yearA] = a[0].split('/').map(Number);
            const [monthB, yearB] = b[0].split('/').map(Number);
            return yearA - yearB || monthA - monthB;
          }).map(([month, totals]) => (
            <tr key={month}>
              <td>{month}</td>
              <td>{totals.finansimTotal.toLocaleString()}</td>
              <td>{totals.pensiaTotal.toLocaleString()}</td>
              <td>{totals.insuranceTotal.toLocaleString()}</td>
              <td>{totals.niudPensiaTotal.toLocaleString()}</td>
              <td>{totals.commissionHekefTotal.toLocaleString()}</td>
              <td>{totals.commissionNifraimTotal.toLocaleString()}</td>

            </tr>
          ))}
          <tr>
            <td><strong>סיכום</strong></td>
            <td><strong>{overallTotals.finansimTotal.toLocaleString()}</strong></td>
            <td><strong>{overallTotals.pensiaTotal.toLocaleString()}</strong></td>
            <td><strong>{overallTotals.insuranceTotal.toLocaleString()}</strong></td>
            <td><strong>{overallTotals.niudPensiaTotal.toLocaleString()}</strong></td>
            <td><strong>{overallTotals.commissionHekefTotal.toLocaleString()}</strong></td>
            <td><strong>{overallTotals.commissionNifraimTotal.toLocaleString()}</strong></td>

          </tr>
          <tr>
        <td><strong>ממוצע</strong></td>
        <td><strong>{averageFinansim.toLocaleString()}</strong></td>
        <td><strong>{averagePensia.toLocaleString()}</strong></td>
        <td><strong>{averageInsurance.toLocaleString()}</strong></td>
        <td><strong>{averageNiudPensia.toLocaleString()}</strong></td>
        <td><strong>{averageCommissionHekef.toLocaleString()}</strong></td>
        <td><strong>{averageCommissionNifraim.toLocaleString()}</strong></td>
      </tr>
        </tbody>
      </table>
      

      <div className="select-container" >
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

      <select id="companySelect" value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}>
        <option value="">בחר חברה</option>
         {companies.map((companyName, index) => (
         <option key={index} value={companyName}>{companyName}</option>
    ))}
     </select>
     <select id="productSelect" value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)}>
               <option value="">בחר מוצר</option>
              {products.map(product => (
             <option key={product.id} value={product.name}>{product.name}</option>
         ))}
        </select>
        <select
      id="statusPolicySelect"
      value={selectedStatusPolicy}
      onChange={(e) => setSelectedStatusPolicy(e.target.value)}>
     <option value="">בחר סטאטוס פוליסה</option>
                            {statusPolicies.map((status, index) => (
                                <option key={index} value={status}>{status}</option>
       ))}
       </select>

      </div>
    </div>
    </div>
  
   {/*  <div className="graph-container" style={{ width: '100%', height: '400px' }}>
  <CommissionGraph data={monthlyTotals} /> 
</div>*/}


   {/* 
   <div className="graph-container" style={{ width: '60%', height: '200px' }}>
  {Object.keys(salesCounts).length > 0 ? (
    <SalesCountGraph data={salesCounts} />
  ) : (
    <p>Loading data...</p>
  )}
</div> */}

    </div>
  );
};

export default SummaryTable;