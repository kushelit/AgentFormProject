'use client';

import React, { useState, useEffect } from 'react';
import { query, collection, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import './NewSummaryTable.css';
import useFetchMD from "@/hooks/useMD"; 
import SalesCountGraph from  "@/components/SalesCountGraph"; 
import useSalesData from '@/hooks/useSalesCalculateData';
import useFetchGraphData from '@/hooks/useFetchGraphData';
import { useMemo } from 'react';
import CommissionPerCustomerGraph from '@/components/CommissionPerCustomerGraph';
import PieChartGraph from '@/components/CompanyCommissionPie';
import { useDesignFlag } from  "@/hooks/useDesignFlag";
import { usePermission } from "@/hooks/usePermission";



const NewSummaryTable = () => {
  const { user, detail } = useAuth();
  const { workers, agents, selectedAgentId,setSelectedAgentId, handleAgentChange, handleWorkerChange, selectedWorkerId ,
    companies, selectedCompany, selectedWorkerIdFilter,
    setSelectedCompany,isLoadingAgent } = useFetchAgentData();
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear()); // Default to the current year
    const [selectedGraph, setSelectedGraph] = useState('newCustomers');

    const isNewDesignEnabled = useDesignFlag();

    const {
      products,
      selectedProduct,
      setSelectedProduct,
      selectedProductGroup, 
      setSelectedStatusPolicy, 
      selectedStatusPolicy, 
      statusPolicies
    } = useFetchMD();

  const { monthlyTotals, overallTotals, isLoadingData, companyCommissions } =
   useSalesData
   (selectedAgentId, selectedWorkerIdFilter, 
    selectedCompany, selectedProduct, 
    selectedStatusPolicy,selectedYear,
    selectedGraph === 'commissionPerMonth' // ✅ הוספנו פרמטר חדש
);

  const monthsCount = Object.keys(monthlyTotals).length;

  const filters = useMemo(() => {
    return {
      selectedAgentId: selectedAgentId || null, 
      selectedWorkerIdFilter,
      selectedYear,
    };
  }, [selectedAgentId, selectedWorkerIdFilter, selectedYear]);



  const { data, loading } = useFetchGraphData(
    selectedGraph,
    filters,
    selectedGraph === 'commissionPerMonth' ? monthlyTotals : undefined // Only pass monthlyTotals if required
  );


  useEffect(() => {
    if (detail?.role === 'admin' && (selectedAgentId === null || selectedAgentId === undefined)) {
        setSelectedAgentId('select'); // Set to "All Agents" on admin login
    }
}, [detail, selectedAgentId]);


  // Calculating averages
const averageFinansim = Math.round(overallTotals.finansimTotal / monthsCount);
const averagePensia = Math.round(overallTotals.pensiaTotal / monthsCount);
const averageInsurance = Math.round(overallTotals.insuranceTotal / monthsCount);
const averageNiudPensia = Math.round(overallTotals.niudPensiaTotal / monthsCount);
const averageCommissionHekef = Math.round(overallTotals.commissionHekefTotal / monthsCount);
const averageCommissionNifraim = Math.round(overallTotals.commissionNifraimTotal / monthsCount);
const averageInsuranceTravel = Math.round(overallTotals.insuranceTravelTotal / monthsCount);
const averagePrishaMyadit = Math.round(overallTotals.prishaMyaditTotal / monthsCount);


const { canAccess: canViewCommissions } = usePermission("view_commissions_field");


  return (
<div className="content-container-NewAgentForm">  
    <div className={`table-container-AgentForm-new-design`}>  
              <div className="table-header">
                   <div className="table-title">דף מרכז</div>
               </div>
<div className="filter-inputs-container-new">
    <div className="filter-select-container">
         <select id="agent-select" className="select-input" value={selectedAgentId} onChange={handleAgentChange}>
      {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
      {detail?.role === 'admin' && <option value="all">כל הסוכנות</option>}
       {agents.map(agent => (
          <option key={agent.id} value={agent.id}>{agent.name}</option>
        ))}
      </select>
      </div>
      <div className="filter-select-container">
      <select id="worker-select" className="select-input" value={selectedWorkerIdFilter} 
       onChange={(e) => handleWorkerChange(e, 'filter')}>
       <option value="">כל העובדים</option>
        {workers.map(worker => (
          <option key={worker.id} value={worker.id}>{worker.name}</option>
        ))}
      </select>
      </div>
      <div className="filter-select-container">
      <select id="companySelect" className="select-input" value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}>
        <option value="">בחר חברה</option>
         {companies.map((companyName, index) => (
         <option key={index} value={companyName}>{companyName}</option>
    ))}
     </select>
      </div>
      <div className="filter-select-container">
     <select id="productSelect" className="select-input" value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)}>
               <option value="">בחר מוצר</option>
              {products.map(product => (
             <option key={product.id} value={product.name}>{product.name}</option>
         ))}
        </select>
      </div>
      <div className="filter-select-container">
        <select
      id="statusPolicySelect" className="select-input"
      value={selectedStatusPolicy}
      onChange={(e) => setSelectedStatusPolicy(e.target.value)}>
     <option value="">בחר סטאטוס פוליסה</option>
                            {statusPolicies.map((status, index) => (
                                <option key={index} value={status}>{status}</option>
       ))}
       </select>
      </div>
      <div className="filter-select-container">
  <select
    id="yearPicker" className="select-input"
    value={selectedYear}
    onChange={(e) => setSelectedYear(parseInt(e.target.value))}>
     <option value="">בחר שנה</option>
    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((year) => (
      <option key={year} value={year}>
        {year}
      </option>
    ))}
  </select>
      </div>
      </div>
          <div className="table-container" style={{ width: '100%' }}>
          { isLoadingData  && (
  <div className="spinner-overlay">
    <div className="spinner"></div>
  </div>
)} 
       <div className={`table-Data-AgentForm ${isNewDesignEnabled ? 'is-new-design' : ''}`}>
        <table>
       <thead>
          <tr>
            <th>חודש תפוקה</th>
            <th>סך פיננסים</th>
            <th>סך פנסיה</th>
            <th>סך ביטוח</th>
            <th>ניוד פנסיה</th>
            <th>סך נסיעות חול</th>
            <th>סך פרישה מיידית</th>       
            {canViewCommissions &&<th>עמלת היקף</th>}
             {canViewCommissions &&<th>עמלת נפרעים</th>}
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
              <td>{totals.insuranceTravelTotal?.toLocaleString() || '0'}</td>
              <td>{totals.prishaMyaditTotal?.toLocaleString() || '0'}</td>
              {canViewCommissions && <td>{totals.commissionHekefTotal.toLocaleString()}</td>}
              {canViewCommissions && <td>{totals.commissionNifraimTotal.toLocaleString()}</td>}
            </tr>
          ))}
          <tr>
            <td><strong>סיכום</strong></td>
            <td><strong>{overallTotals.finansimTotal.toLocaleString()}</strong></td>
            <td><strong>{overallTotals.pensiaTotal.toLocaleString()}</strong></td>
            <td><strong>{overallTotals.insuranceTotal.toLocaleString()}</strong></td>
            <td><strong>{overallTotals.niudPensiaTotal.toLocaleString()}</strong></td>
            <td><strong>{overallTotals.insuranceTravelTotal.toLocaleString()}</strong></td>
            <td><strong>{overallTotals.prishaMyaditTotal.toLocaleString()}</strong></td>
            {canViewCommissions &&   <td><strong>{overallTotals.commissionHekefTotal.toLocaleString()}</strong></td>}
            {canViewCommissions &&  <td><strong>{overallTotals.commissionNifraimTotal.toLocaleString()}</strong></td>}
          </tr>
          <tr>
        <td><strong>ממוצע</strong></td>
        <td><strong>{averageFinansim.toLocaleString()}</strong></td>
        <td><strong>{averagePensia.toLocaleString()}</strong></td>
        <td><strong>{averageInsurance.toLocaleString()}</strong></td>
        <td><strong>{averageNiudPensia.toLocaleString()}</strong></td>
        <td><strong>{averageInsuranceTravel.toLocaleString()}</strong></td>
        <td><strong>{averagePrishaMyadit.toLocaleString()}</strong></td>
        {canViewCommissions && <td><strong>{averageCommissionHekef.toLocaleString()}</strong></td>}
        {canViewCommissions && <td><strong>{averageCommissionNifraim.toLocaleString()}</strong></td>}
      </tr>
        </tbody>
      </table>     
    </div>
    </div>
<div className='graf'>
    <div className="graf-Type">
  <select value={selectedGraph} onChange={(e) => setSelectedGraph(e.target.value)}>
    <option value="newCustomers">לקוחות חדשים</option>
    {canViewCommissions && <option value="commissionPerMonth">ממוצע נפרעים ללקוח</option>}
     {canViewCommissions && <option value="companyCommissionPie">סך היקף לחברה</option>}
  </select>
  </div>
  {/* Render Graph */}
  <div className='graf-container'>
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
export default NewSummaryTable;