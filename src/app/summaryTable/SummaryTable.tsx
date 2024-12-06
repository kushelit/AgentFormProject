'use client';

import React, { useState, useEffect } from 'react';
import { query, collection, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import './SummaryTable.css';
import useFetchMD from "@/hooks/useMD"; 
import SalesCountGraph from  "@/components/SalesCountGraph"; 
import useSalesData from '@/hooks/useSalesCalculateData';
import useFetchGraphData from '@/hooks/useFetchGraphData';
import { useMemo } from 'react';
import CommissionPerCustomerGraph from '@/components/CommissionPerCustomerGraph';
import PieChartGraph from '@/components/CompanyCommissionPie';



const SummaryTable = () => {
  const { user, detail } = useAuth();
  const { workers, agents, selectedAgentId,setSelectedAgentId, handleAgentChange, handleWorkerChange, selectedWorkerId ,
    companies, selectedCompany, selectedWorkerIdFilter,
    setSelectedCompany,isLoadingAgent } = useFetchAgentData();
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear()); // Default to the current year
    const [selectedGraph, setSelectedGraph] = useState('newCustomers');

    const {
      products,
      selectedProduct,
      setSelectedProduct,
      selectedProductGroup, 
      setSelectedStatusPolicy, 
      selectedStatusPolicy, 
      statusPolicies
    } = useFetchMD();

  const { monthlyTotals, overallTotals, isLoadingData, companyCommissions } = useSalesData(selectedAgentId, selectedWorkerIdFilter, selectedCompany, selectedProduct, selectedStatusPolicy,selectedYear);

  const monthsCount = Object.keys(monthlyTotals).length;

  const filters = useMemo(() => {
    return {
      selectedAgentId: selectedAgentId || null, // Pass null explicitly if no agent is selected
      selectedWorkerIdFilter,
    };
  }, [selectedAgentId, selectedWorkerIdFilter]);



  const { data, loading } = useFetchGraphData(
    selectedGraph,
    filters,
    selectedGraph === 'commissionPerMonth' ? monthlyTotals : undefined // Only pass monthlyTotals if required
  );


  useEffect(() => {
    if (detail?.role === 'admin' && (selectedAgentId === null || selectedAgentId === undefined)) {
        setSelectedAgentId('select'); // Set to "All Agents" on admin login
    }
   // console.log("SelectedAgentId set to  " + selectedAgentId);
}, [detail, selectedAgentId]);


  // Calculating averages
const averageFinansim = Math.round(overallTotals.finansimTotal / monthsCount);
const averagePensia = Math.round(overallTotals.pensiaTotal / monthsCount);
const averageInsurance = Math.round(overallTotals.insuranceTotal / monthsCount);
const averageNiudPensia = Math.round(overallTotals.niudPensiaTotal / monthsCount);
const averageCommissionHekef = Math.round(overallTotals.commissionHekefTotal / monthsCount);
const averageCommissionNifraim = Math.round(overallTotals.commissionNifraimTotal / monthsCount);






  return (
    <div className="frame-container bg-custom-white" style={{ maxWidth: '1000px', margin: '0 auto', padding: '10px 20px 20px 20px', border: '1px solid #ccc', borderRadius: '8px', marginTop: '10px',minHeight: '800px' }}>

       <div style={{ marginTop: '20px', width: '90%', margin: '0 auto', overflowX: 'auto' }}>


       <div className="select-container" >
      <select id="agent-select" value={selectedAgentId} onChange={handleAgentChange}>
      {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
      {detail?.role === 'admin' && <option value="all">כל הסוכנות</option>}
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
  <select
    id="yearPicker"
    value={selectedYear}
    onChange={(e) => setSelectedYear(parseInt(e.target.value))}
  >
     <option value="">בחר שנה</option>
    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((year) => (
      <option key={year} value={year}>
        {year}
      </option>
    ))}
  </select>

      </div>

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
      

    </div>
    </div>
  
    {/*  <div className="graph-container" style={{ width: '100%', height: '400px' }}>
  <CommissionGraph data={monthlyTotals} /> 
</div> */}

<div>
<div style={{ margin: '20px' }}>
  {/* Graph Selection */}
  <select value={selectedGraph} onChange={(e) => setSelectedGraph(e.target.value)}>
    <option value="newCustomers">לקוחות חדשים</option>
    <option value="commissionPerMonth">ממוצע נפרעים ללקוח</option>
    <option value="companyCommissionPie">סך היקף לחברה</option>
  </select>

  {/* Render Graph */}
  <div>
    {(loading || isLoadingData) && <p>Loading...</p>}
    {!loading && selectedGraph === 'newCustomers' && <SalesCountGraph data={data} />}
    {!loading && selectedGraph === 'commissionPerMonth' && (
      <CommissionPerCustomerGraph data={data.calculatedData || {}} />
    )}
    {!loading && selectedGraph === 'companyCommissionPie' && (
      <PieChartGraph data={companyCommissions || {}} />
    )}
  </div>
</div>

</div>

</div>

  );
};

export default SummaryTable;