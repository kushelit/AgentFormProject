'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import './NewSummaryTable.css';
import useFetchMD from '@/hooks/useMD';
import SalesCountGraph from '@/components/SalesCountGraph';
import useSalesData from '@/hooks/useSalesCalculateData';
import useFetchGraphData from '@/hooks/useFetchGraphData';
import CommissionPerCustomerGraph from '@/components/CommissionPerCustomerGraph';
import PieChartGraph from '@/components/CompanyCommissionPie';
import { useDesignFlag } from '@/hooks/useDesignFlag';
import { usePermission } from '@/hooks/usePermission';

// 🔹 הלשונית החדשה של סיכומי סוכנות
import AgencySummaryAgentsTab from '@/components/AgencySummaryAgentsTab';

import useProfitByLeadSourceData from '@/hooks/useProfitByLeadSourceData';
import ProfitByLeadSourceStackedGraph from '@/components/ProfitByLeadSourceStackedGraph';


type ViewMode = 'agent' | 'agencyMargin';

const NewSummaryTable = () => {
  const { user, detail } = useAuth();
  const {
    workers,
    agents,
    selectedAgentId,
    setSelectedAgentId,
    handleAgentChange,
    handleWorkerChange,
    selectedWorkerId,
    companies,
    selectedCompany,
    selectedWorkerIdFilter,
    setSelectedCompany,
    isLoadingAgent,
  } = useFetchAgentData();

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const [selectedGraph, setSelectedGraph] = useState<
    'newCustomers' | 'commissionPerMonth' | 'companyCommissionPie' | 'profitByLeadSource'
  >('newCustomers');

  const isNewDesignEnabled = useDesignFlag();

  const [isCommissionSplitEnabled, setIsCommissionSplitEnabled] = useState(false);

  // ✅ מקור אמת יחיד
  const [viewMode, setViewMode] = useState<ViewMode>('agent');

  const canSeeAgencyMargin = !!detail?.agencyId && detail?.role === 'admin';

  const {
    products,
    selectedProduct,
    setSelectedProduct,
    selectedProductGroup,
    setSelectedStatusPolicy,
    selectedStatusPolicy,
    statusPolicies,
  } = useFetchMD();

  const { canAccess: canViewCommissions } = usePermission('view_commissions_field');

  const {
    monthlyTotals,
    overallTotals,
    isLoadingData,
    companyCommissions,
  } = useSalesData(
    selectedAgentId,
    selectedWorkerIdFilter,
    selectedCompany,
    selectedProduct,
    selectedStatusPolicy,
    selectedYear,
    selectedGraph === 'commissionPerMonth',
    isCommissionSplitEnabled,
    viewMode,
    detail?.agencyId
  );

  const monthsCount = Object.keys(monthlyTotals).length || 1;

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
    selectedGraph === 'commissionPerMonth' ? monthlyTotals : undefined
  );

  // 🔹 מצב לשונית – דף מרכז לסוכן / סיכומי סוכנות
  const [activeTab, setActiveTab] = useState<'agent' | 'agencyAgents'>('agent');

  // מי רואה את לשונית הסוכנות?
  const canSeeAgencyTab = detail && ['admin', 'manager'].includes(detail.role);

  useEffect(() => {
    if (canSeeAgencyTab && (selectedAgentId === null || selectedAgentId === undefined)) {
      setSelectedAgentId('select');
    }
  }, [canSeeAgencyTab, selectedAgentId, setSelectedAgentId]);

  // אם אין הרשאה למרווח — נחזיר למבט סוכן
  useEffect(() => {
    if (!canSeeAgencyMargin && viewMode === 'agencyMargin') {
      setViewMode('agent');
    }
  }, [canSeeAgencyMargin, viewMode]);

  // ✅ פיצול עמלות: רק כשסוכן ספציפי + viewMode=agent
  const canEnableSplit =
    Boolean(selectedAgentId) &&
    selectedAgentId !== 'all' &&
    viewMode === 'agent';

  useEffect(() => {
    if (!canEnableSplit && isCommissionSplitEnabled) {
      setIsCommissionSplitEnabled(false);
    }
  }, [canEnableSplit, isCommissionSplitEnabled]);

  // ממוצעים חודשיים
  const averageFinansim = Math.round(overallTotals.finansimTotal / monthsCount);
  const averagePensia = Math.round(overallTotals.pensiaTotal / monthsCount);
  const averageInsurance = Math.round(overallTotals.insuranceTotal / monthsCount);
  const averageNiudPensia = Math.round(overallTotals.niudPensiaTotal / monthsCount);
  const averageCommissionHekef = Math.round(overallTotals.commissionHekefTotal / monthsCount);
  const averageCommissionNifraim = Math.round(overallTotals.commissionNifraimTotal / monthsCount);
  const averageInsuranceTravel = Math.round(overallTotals.insuranceTravelTotal / monthsCount);
  const averagePrishaMyadit = Math.round(overallTotals.prishaMyaditTotal / monthsCount);


  const { rows: leadSourceRows, loading: leadSourceLoading } = useProfitByLeadSourceData({
    selectedAgentId,
    selectedWorkerIdFilter,
    selectedCompany,
    selectedProduct,
    selectedStatusPolicy,
    selectedYear,
    isCommissionSplitEnabled,
  });
  

  return (
    <div className="content-container-NewAgentForm">
      <div className={`table-container-AgentForm-new-design`}>
        <div className="table-header">
          <div className="table-title">דף מרכז</div>

          {/* ✅ בחירה אחת בלבד (אחיד) */}
          {canSeeAgencyMargin && (
            <div dir="rtl" className="mt-2 flex items-center gap-2">
              <div className="flex bg-green-100 rounded-full p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('agent')}
                  className={`px-3 py-0.5 rounded-full transition-all duration-200 ${
                    viewMode === 'agent'
                      ? 'bg-white text-green-800 font-bold'
                      : 'text-gray-500'
                  }`}
                >
                  מבט סוכן
                </button>

                <button
                  type="button"
                  onClick={() => setViewMode('agencyMargin')}
                  className={`px-3 py-0.5 rounded-full transition-all duration-200 ${
                    viewMode === 'agencyMargin'
                      ? 'bg-white text-green-800 font-bold'
                      : 'text-gray-500'
                  }`}
                >
                  מרווח בית סוכן
                </button>
              </div>
            </div>
          )}

          {/* לשוניות */}
          {canSeeAgencyTab && (
            <div dir="rtl" className="flex items-center gap-2 mt-2 text-xs">
              <div className="flex bg-blue-100 rounded-full p-0.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('agent')}
                  className={`px-3 py-1 rounded-full transition-all ${
                    activeTab === 'agent'
                      ? 'bg-white text-blue-800 font-bold'
                      : 'text-gray-600'
                  }`}
                >
                  תצוגת סוכן
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('agencyAgents')}
                  className={`px-3 py-1 rounded-full transition-all ${
                    activeTab === 'agencyAgents'
                      ? 'bg-white text-blue-800 font-bold'
                      : 'text-gray-600'
                  }`}
                >
                  תצוגת סוכנות
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 🔹 לשונית 1 – תצוגת סוכן */}
        {activeTab === 'agent' && (
          <>
            <div className="filter-inputs-container-new">
              <div className="filter-select-container">
                <select
                  id="agent-select"
                  className="select-input"
                  value={selectedAgentId}
                  onChange={handleAgentChange}
                >
                  {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
                  {detail?.role === 'admin' && <option value="all">כל הסוכנות</option>}
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-select-container">
                <select
                  id="worker-select"
                  className="select-input"
                  value={selectedWorkerIdFilter}
                  onChange={(e) => handleWorkerChange(e, 'filter')}
                >
                  <option value="">כל העובדים</option>
                  {workers.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {worker.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-select-container">
                <select
                  id="companySelect"
                  className="select-input"
                  value={selectedCompany}
                  onChange={(e) => setSelectedCompany(e.target.value)}
                >
                  <option value="">בחר חברה</option>
                  {companies.map((companyName, index) => (
                    <option key={index} value={companyName}>
                      {companyName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-select-container">
                <select
                  id="productSelect"
                  className="select-input"
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                >
                  <option value="">בחר מוצר</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.name}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-select-container">
                <select
                  id="statusPolicySelect"
                  className="select-input"
                  value={selectedStatusPolicy}
                  onChange={(e) => setSelectedStatusPolicy(e.target.value)}
                >
                  <option value="">בחר סטאטוס פוליסה</option>
                  {statusPolicies.map((status, index) => (
                    <option key={index} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-select-container">
                <select
                  id="yearPicker"
                  className="select-input"
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

              {/* פיצול */}
              <div dir="rtl" className="flex items-center gap-2">
                <div className="flex bg-blue-100 rounded-full p-0.5 text-xs">
                  <button
                    type="button"
                    disabled={!canEnableSplit}
                    onClick={() => setIsCommissionSplitEnabled(false)}
                    className={`px-3 py-0.5 rounded-full transition-all duration-200 ${
                      !isCommissionSplitEnabled
                        ? 'bg-white text-blue-800 font-bold'
                        : 'text-gray-500'
                    } ${!canEnableSplit ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    ללא פיצול עמלות
                  </button>

                  <button
                    type="button"
                    disabled={!canEnableSplit}
                    onClick={() => setIsCommissionSplitEnabled(true)}
                    className={`px-3 py-0.5 rounded-full transition-all duration-200 ${
                      isCommissionSplitEnabled
                        ? 'bg-white text-blue-800 font-bold'
                        : 'text-gray-500'
                    } ${!canEnableSplit ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    עם פיצול עמלות
                  </button>
                </div>
              </div>
            </div>

            {/* טבלה */}
            <div className="table-container" style={{ width: '100%' }}>
              {isLoadingData && (
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

                      {canViewCommissions && (
                        <th>{viewMode === 'agencyMargin' ? 'מרווח היקף' : 'עמלת היקף'}</th>
                      )}
                      {canViewCommissions && (
                        <th>{viewMode === 'agencyMargin' ? 'מרווח נפרעים' : 'עמלת נפרעים'}</th>
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {Object.entries(monthlyTotals)
                      .sort((a, b) => {
                        const [monthA, yearA] = a[0].split('/').map(Number);
                        const [monthB, yearB] = b[0].split('/').map(Number);
                        return yearA - yearB || monthA - monthB;
                      })
                      .map(([month, totals]) => (
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
                      {canViewCommissions && (
                        <td><strong>{overallTotals.commissionHekefTotal.toLocaleString()}</strong></td>
                      )}
                      {canViewCommissions && (
                        <td><strong>{overallTotals.commissionNifraimTotal.toLocaleString()}</strong></td>
                      )}
                    </tr>

                    <tr>
                      <td><strong>ממוצע</strong></td>
                      <td><strong>{averageFinansim.toLocaleString()}</strong></td>
                      <td><strong>{averagePensia.toLocaleString()}</strong></td>
                      <td><strong>{averageInsurance.toLocaleString()}</strong></td>
                      <td><strong>{averageNiudPensia.toLocaleString()}</strong></td>
                      <td><strong>{averageInsuranceTravel.toLocaleString()}</strong></td>
                      <td><strong>{averagePrishaMyadit.toLocaleString()}</strong></td>
                      {canViewCommissions && (
                        <td><strong>{averageCommissionHekef.toLocaleString()}</strong></td>
                      )}
                      {canViewCommissions && (
                        <td><strong>{averageCommissionNifraim.toLocaleString()}</strong></td>
                      )}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* גרפים */}
            <div className="graf">
              <div className="graf-Type">
                <select
                  value={selectedGraph}
                  onChange={(e) =>
                    setSelectedGraph(
                      e.target.value as 'newCustomers' | 'commissionPerMonth' | 'companyCommissionPie'
                    )
                  }
                >
                  <option value="newCustomers">לקוחות חדשים</option>
                  {canViewCommissions && <option value="commissionPerMonth">ממוצע נפרעים ללקוח</option>}
                  {canViewCommissions && <option value="companyCommissionPie">סך היקף לחברה</option>}
                  {canViewCommissions && selectedAgentId && selectedAgentId !== 'all' && (
  <option value="profitByLeadSource">רווחיות לפי מקור ליד</option>
)}
                </select>
              </div>

              <div className="graf-container">
                {(loading || isLoadingData) && <p>Loading...</p>}
                {!loading && selectedGraph === 'newCustomers' && <SalesCountGraph data={data} />}
                {!loading && selectedGraph === 'commissionPerMonth' && (
                  <CommissionPerCustomerGraph data={data.calculatedData || {}} />
                )}
                {!loading && selectedGraph === 'companyCommissionPie' && (
                  <PieChartGraph data={companyCommissions || {}} />
                )}
                {selectedGraph === 'profitByLeadSource' && (
  <>
    {(leadSourceLoading || isLoadingData) && <p>Loading...</p>}
    {!leadSourceLoading && <ProfitByLeadSourceStackedGraph rows={leadSourceRows} />}
  </>
)}
              </div>
            </div>
          </>
        )}

        {/* 🔹 לשונית 2 – סיכומי סוכנות לפי סוכן */}
        {activeTab === 'agencyAgents' && canSeeAgencyTab && (
          <AgencySummaryAgentsTab
            viewMode={viewMode}
            setViewMode={setViewMode}
            agencyId={detail?.agencyId}
          />
        )}
      </div>
    </div>
  );
};

export default NewSummaryTable;
