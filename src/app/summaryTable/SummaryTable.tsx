'use client';

import React, { useState, useEffect } from 'react';
import { query, collection, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from '@/hooks/useFetchAgentData';

interface MonthlyData {
  finansimTotal: number;
  pensiaTotal: number;
  insuranceTotal: number;
  niudPensiaTotal: number;
  testCommissionTotal: number;
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
}

interface Product {
  productName: string;
  productGroup: string;
  // Add other fields as necessary
}


const SummaryTable = () => {
  const { user, detail } = useAuth();
  const { workers, agents, selectedAgentId, handleAgentChange, handleWorkerChange, selectedWorkerId } = useFetchAgentData();

  const [monthlyTotals, setMonthlyTotals] = useState<MonthlyTotals>({});
  const [overallFinansimTotal, setOverallFinansimTotal] = useState(0);
  const [overallPensiaTotal, setOverallPensiaTotal] = useState(0);
  const [overallInsuranceTotal, setOverallInsuranceTotal] = useState(0);
  const [overallNiudPensiaTotal, setOverallNiudPensiaTotal] = useState(0);
  const [overallTestCommissionTotal, setOverallTestCommissionTotal] = useState(0);
  const [contracts, setContracts] = useState<Contract[]>([]);

  const [productMap, setProductMap] = useState<Record<string, string>>({});


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
        commissionNifraim: doc.data().commissionNifraim
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
      if (selectedWorkerId) {
        salesQuery = query(salesQuery, where('workerId', '==', selectedWorkerId));
      }

      const querySnapshot = await getDocs(salesQuery);
      querySnapshot.forEach(doc => {
        const data = doc.data();
        const month = data.mounth;
        const productGroup = productMap[data.product]; // Use the productMap to get the productGroup

        const contractMatch = contracts.find(contract => contract.agentId === data.AgentId && contract.product === data.product && contract.company === data.company);


        if (!initialMonthlyTotals[month]) {
          initialMonthlyTotals[month] = { finansimTotal: 0, pensiaTotal: 0, insuranceTotal: 0, niudPensiaTotal: 0, testCommissionTotal: 0 };
        }

        initialMonthlyTotals[month].finansimTotal += parseInt(data.finansimZvira) || 0;
        initialMonthlyTotals[month].insuranceTotal += (parseInt(data.insPremia) || 0) * 12;
        initialMonthlyTotals[month].pensiaTotal += (parseInt(data.pensiaPremia) || 0) * 12;
        initialMonthlyTotals[month].niudPensiaTotal += parseInt(data.pensiaZvira) || 0;

        if (contractMatch) {
          initialMonthlyTotals[month].testCommissionTotal += (parseInt(data.insPremia) || 0) * contractMatch.commissionNifraim;
        } else {
          // Try to match based on productGroup
          const groupMatch = contracts.find(contract =>
            contract.productsGroup === productGroup &&
            contract.agentId === data.AgentId
          );
          if (groupMatch) {
            initialMonthlyTotals[month].testCommissionTotal += (parseInt(data.insPremia) || 0) * groupMatch.commissionNifraim;
          } else {
            initialMonthlyTotals[month].testCommissionTotal += 999;
          }
        }
      });

      setMonthlyTotals(initialMonthlyTotals);
      // Calculate overall totals
      let overallFinansimTotal = 0;
      let overallPensiaTotal = 0;
      let overallInsuranceTotal = 0;
      let overallNiudPensiaTotal = 0;
      let overallTestCommissionTotal = 0;

      Object.values(initialMonthlyTotals).forEach(month => {
        overallFinansimTotal += month.finansimTotal;
        overallPensiaTotal += month.pensiaTotal;
        overallInsuranceTotal += month.insuranceTotal;
        overallNiudPensiaTotal += month.niudPensiaTotal;
        overallTestCommissionTotal += month.testCommissionTotal;
      });

      setOverallFinansimTotal(overallFinansimTotal);
      setOverallPensiaTotal(overallPensiaTotal);
      setOverallInsuranceTotal(overallInsuranceTotal);
      setOverallNiudPensiaTotal(overallNiudPensiaTotal);
      setOverallTestCommissionTotal(overallTestCommissionTotal);
    };

    fetchData();
  }, [selectedAgentId, selectedWorkerId, contracts]);

  return (
    <div style={{ paddingTop: '4rem' }}>
      <h1 style={{ textAlign: 'right', paddingRight: '20px' }}>לוח מרכזי</h1>
      <table>
        <thead>
          <tr>
            <th>חודש תפוקה</th>
            <th>סך פיננסים</th>
            <th>סך פנסיה</th>
            <th>סך ביטוח</th>
            <th>ניוד פנסיה</th>
            <th>חישוב עמלה</th>
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
              <td>{totals.testCommissionTotal.toLocaleString()}</td>
            </tr>
          ))}
          <tr>
            <td><strong>סיכום</strong></td>
            <td><strong>{overallFinansimTotal.toLocaleString()}</strong></td>
            <td><strong>{overallPensiaTotal.toLocaleString()}</strong></td>
            <td><strong>{overallInsuranceTotal.toLocaleString()}</strong></td>
            <td><strong>{overallNiudPensiaTotal.toLocaleString()}</strong></td>
            <td><strong>{overallTestCommissionTotal.toLocaleString()}</strong></td>
          </tr>
        </tbody>
      </table>
      <select id="agent-select" value={selectedAgentId} onChange={handleAgentChange}>
        {detail?.role === 'admin' && <option value="">כל הסוכנות</option>}
        {agents.map(agent => (
          <option key={agent.id} value={agent.id}>{agent.name}</option>
        ))}
      </select>
      <select id="worker-select" value={selectedWorkerId} onChange={handleWorkerChange}>
        <option value="">כל העובדים</option>
        {workers.map(worker => (
          <option key={worker.id} value={worker.id}>{worker.name}</option>
        ))}
      </select>
    </div>
  );
};

export default SummaryTable;