'use client';

import React, { useState, useEffect } from 'react';
import { query, collection, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import './SummaryTable.css';
import useFetchMD from "@/hooks/useMD"; 
import Select from 'react-select';


interface MonthlyData {
  finansimTotal: number;
  pensiaTotal: number;
  insuranceTotal: number;
  niudPensiaTotal: number;
  commissionHekefTotal: number;
  commissionNifraimTotal: number;
}

interface MonthlyTotals {
  [key: string]: MonthlyData;
}

interface Contract {
  id: string;
  company: string;
  product: string;
  productsGroup: string;
  agentId: string;
  commissionNifraim: number;
  commissionHekef: number;
  commissionNiud: number;
}

interface Product {
  productName: string;
  productGroup: string;
  // Add other fields as necessary
}


const SummaryTable = () => {
  const { user, detail } = useAuth();
  const { workers, agents, selectedAgentId, handleAgentChange, handleWorkerChange, selectedWorkerId ,
    companies, selectedCompany, selectedWorkerIdFilter,
    setSelectedCompany } = useFetchAgentData();

  const [monthlyTotals, setMonthlyTotals] = useState<MonthlyTotals>({});
  const [overallFinansimTotal, setOverallFinansimTotal] = useState(0);
  const [overallPensiaTotal, setOverallPensiaTotal] = useState(0);
  const [overallInsuranceTotal, setOverallInsuranceTotal] = useState(0);
  const [overallNiudPensiaTotal, setOverallNiudPensiaTotal] = useState(0);
  const [overallCommissionHekefTotal, setOverallCommissionHekefTotal] = useState(0);
  const [overallCommissionNifraimTotal, setOverallCommissionNifraimTotal] = useState(0);
  const [contracts, setContracts] = useState<Contract[]>([]);

  const [productMap, setProductMap] = useState<Record<string, string>>({});

  const {
    products,
    selectedProduct,
    setSelectedProduct,
    selectedProductGroup, 
    setSelectedStatusPolicy, 
    selectedStatusPolicy, 
    statusPolicies
  } = useFetchMD();



  useEffect(() => {
    const fetchProducts = async () => {
      const querySnapshot = await getDocs(collection(db, 'product'));
      const productMapping: Record<string, string> = {}; // More specific type than {}
      querySnapshot.forEach((doc) => {
        const productData = doc.data() as Product; // Here you assert the type
        productMapping[productData.productName] = productData.productGroup;
      });
      setProductMap(productMapping);
    };
  
    fetchProducts();
  }, []);


  useEffect(() => {
    const fetchContracts = async () => {
      const snapshot = await getDocs(collection(db, 'contracts'));
      const fetchedContracts: Contract[] = snapshot.docs.map(doc => ({
        id: doc.id,
        company: doc.data().company,
        product: doc.data().product,
        productsGroup: doc.data().productsGroup,
        agentId: doc.data().AgentId,
        commissionNifraim: doc.data().commissionNifraim,
        commissionHekef: doc.data().commissionHekef,
        commissionNiud: doc.data().commissionNiud
      }));
      setContracts(fetchedContracts);
    };

    fetchContracts();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      let initialMonthlyTotals: MonthlyTotals = {};

      let salesQuery = query(collection(db, 'sales'), where('minuySochen', '==', false), where('statusPolicy', 'in', ['פעילה', 'הצעה']));
      if (selectedAgentId) {
        salesQuery = query(salesQuery, where('AgentId', '==', selectedAgentId));
      }
      if (selectedWorkerIdFilter) {
        salesQuery = query(salesQuery, where('workerId', '==', selectedWorkerIdFilter));
      }
      if (selectedCompany) {
        salesQuery = query(salesQuery, where('company', '==', selectedCompany));
      }
      if (selectedProduct) {
        salesQuery = query(salesQuery, where('product', '==', selectedProduct));
      }
      if (selectedStatusPolicy) {
        salesQuery = query(salesQuery, where('statusPolicy', '==', selectedStatusPolicy));
    }

      const querySnapshot = await getDocs(salesQuery);
      querySnapshot.forEach(doc => {
        const data = doc.data();
        const month = data.mounth;
        const productGroup = productMap[data.product]; // Use the productMap to get the productGroup

        const contractMatch = contracts.find(contract => contract.agentId === data.AgentId && contract.product === data.product && contract.company === data.company);


        if (!initialMonthlyTotals[month]) {
          initialMonthlyTotals[month] = { finansimTotal: 0, pensiaTotal: 0, insuranceTotal: 0, niudPensiaTotal: 0, commissionHekefTotal: 0 ,commissionNifraimTotal: 0};
        }

        initialMonthlyTotals[month].finansimTotal += parseInt(data.finansimZvira) || 0;
        initialMonthlyTotals[month].insuranceTotal += (parseInt(data.insPremia) || 0) * 12;
        initialMonthlyTotals[month].pensiaTotal += (parseInt(data.pensiaPremia) || 0) * 12;
        initialMonthlyTotals[month].niudPensiaTotal += parseInt(data.pensiaZvira) || 0;

        if (contractMatch) {
        //  initialMonthlyTotals[month].commissionHekefTotal += Math.round(
          let totalHekef=(
          ((parseInt(data.insPremia) || 0) * contractMatch.commissionHekef/100 * 12)
          +((parseInt(data.pensiaPremia) || 0) * contractMatch.commissionHekef/100 * 12)
          +((parseInt(data.pensiaZvira) || 0) * contractMatch.commissionNiud/100)
          +((parseInt(data.finansimPremia) || 0) * contractMatch.commissionHekef/100 * 12)
          +((parseInt(data.finansimZvira) || 0) * contractMatch.commissionNiud/100)
          );
          initialMonthlyTotals[month].commissionHekefTotal += Math.round(totalHekef);

        } else {
          // Try to match based on productGroup
          const groupMatch = contracts.find(contract =>
            contract.productsGroup === productGroup &&
            contract.agentId === data.AgentId
          );
          if (groupMatch) {
            let totalHekef=(
           // initialMonthlyTotals[month].commissionHekefTotal += Math.round(
            ((parseInt(data.insPremia) || 0) * groupMatch.commissionHekef /100 * 12)
            +((parseInt(data.pensiaPremia) || 0) * groupMatch.commissionHekef /100 * 12)
            +((parseInt(data.pensiaZvira) || 0) * groupMatch.commissionNiud/100) 
            +((parseInt(data.finansimPremia) || 0) * groupMatch.commissionHekef/100 *12)
            +((parseInt(data.finansimZvira) || 0) * groupMatch.commissionNiud/100)
            );
            initialMonthlyTotals[month].commissionHekefTotal += Math.round(totalHekef);

          } else {
            initialMonthlyTotals[month].commissionHekefTotal += 0;
          }
        }

        if (contractMatch) {
        //  initialMonthlyTotals[month].commissionNifraimTotal += Math.round(
          let totalNifraim=(
          ((parseInt(data.insPremia) || 0) * contractMatch.commissionNifraim /100)
          +((parseInt(data.pensiaPremia) || 0) * contractMatch.commissionNifraim /100)
          +((parseInt(data.finansimZvira) || 0) * contractMatch.commissionNifraim /100/ 12)
          );

          initialMonthlyTotals[month].commissionNifraimTotal += Math.round(totalNifraim);

        } else {
          // Try to match based on productGroup
          const groupMatch = contracts.find(contract =>
            contract.productsGroup === productGroup &&
            contract.agentId === data.AgentId
          );
          if (groupMatch) {
           // initialMonthlyTotals[month].commissionNifraimTotal += Math.round(
            let totalNifraim=(
              ((parseInt(data.insPremia) || 0) * groupMatch.commissionNifraim /100)
            +((parseInt(data.pensiaPremia) || 0) * groupMatch.commissionNifraim /100)
            +((parseInt(data.finansimZvira) || 0) * groupMatch.commissionNifraim /100 / 12)
            );
            initialMonthlyTotals[month].commissionNifraimTotal += Math.round(totalNifraim)

          } else {
            initialMonthlyTotals[month].commissionNifraimTotal += 0;
          }
        }

      });

      setMonthlyTotals(initialMonthlyTotals);
      // Calculate overall totals
      let overallFinansimTotal = 0;
      let overallPensiaTotal = 0;
      let overallInsuranceTotal = 0;
      let overallNiudPensiaTotal = 0;
      let overallCommissionHekefTotal = 0;
      let overallCommissionNifraimTotal = 0;

      Object.values(initialMonthlyTotals).forEach(month => {
        overallFinansimTotal += month.finansimTotal;
        overallPensiaTotal += month.pensiaTotal;
        overallInsuranceTotal += month.insuranceTotal;
        overallNiudPensiaTotal += month.niudPensiaTotal;
        overallCommissionHekefTotal += month.commissionHekefTotal;
        overallCommissionNifraimTotal += month.commissionNifraimTotal;

      });

      setOverallFinansimTotal(overallFinansimTotal);
      setOverallPensiaTotal(overallPensiaTotal);
      setOverallInsuranceTotal(overallInsuranceTotal);
      setOverallNiudPensiaTotal(overallNiudPensiaTotal);
      setOverallCommissionHekefTotal(overallCommissionHekefTotal);
      setOverallCommissionNifraimTotal(overallCommissionNifraimTotal);

    };

    fetchData();
  }, [selectedAgentId, selectedWorkerId, contracts, productMap, selectedCompany, selectedProduct, selectedStatusPolicy, selectedWorkerIdFilter]);

  return (
    <div className="frame-container bg-custom-white " style={{ maxWidth: '1000px', margin: '0 auto', padding: '10px 20px 20px 20px', border: '1px solid #ccc', borderRadius: '8px', marginTop: '80px' }}>

       <div style={{ marginTop: '20px', width: '90%', margin: '0 auto', overflowX: 'auto' }}>
      {/*   {defaultContracts.length > 0 ? ( */}
          <div className="table-container" style={{ width: '100%' }}>
            <table style={{ width: '100%'  }}></table>
      <table>
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
            <td><strong>{overallFinansimTotal.toLocaleString()}</strong></td>
            <td><strong>{overallPensiaTotal.toLocaleString()}</strong></td>
            <td><strong>{overallInsuranceTotal.toLocaleString()}</strong></td>
            <td><strong>{overallNiudPensiaTotal.toLocaleString()}</strong></td>
            <td><strong>{overallCommissionHekefTotal.toLocaleString()}</strong></td>
            <td><strong>{overallCommissionNifraimTotal.toLocaleString()}</strong></td>

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
    </div>
  );
};

export default SummaryTable;