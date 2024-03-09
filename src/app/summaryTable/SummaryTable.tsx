'use client';

import { query, collection, where, getDocs } from "firebase/firestore";
import React,{ useState, useEffect } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase/firebase";
//import './summaryTable.css';
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from "@/hooks/useFetchAgentData"; 
import { useRouter } from 'next/router';


const SummaryTable = () => {

 // const searchParams = useSearchParams();
 // const agentIdAdmin = searchParams?.get('agentId');
 // const agentName = searchParams?.get('agentName');
 
  //console.log(agentIdAdmin ,'agentIdAdmin');

  const { user, detail } = useAuth();
  const {
    workers,
    agents,
    selectedAgentId,
    handleAgentChange,
    handleWorkerChange,
    selectedWorkerId,
  } = useFetchAgentData();

 
const [monthlyTotals, setMonthlyTotals] = useState<MonthlyTotals>({});
const [overallFinansimTotal, setOverallFinansimTotal] = useState(0);
const [overallPensiaTotal, setOverallPensiaTotal] = useState(0);
const [overallInsuranceTotal, setOverallInsuranceTotal] = useState(0);
const [overallNiudPensiaTotal, setOverallNiudPensiaTotal] = useState(0);

  
  interface MonthlyTotals {
      [key: string]: {
      finansimTotal: number;
      pensiaTotal: number;
      insuranceTotal: number;
      niudPensiaTotal: number;
    };
  }
  //const SummaryTable: React.FC = () => {
    
  

  useEffect(() => {
    const fetchData = async () => {

      //const effectiveAgentId = agentIdAdmin || detail?.agentId;
     // console.log(selectedAgentId,'selectedAgentId');
    //  console.log(selectedWorkerId,'selectedWorkerId');
    //  if (!selectedAgentId) return;
  
     // const salesQuery = query(
     //   collection(db, 'sales'),
     //   where('AgentId', '==', selectedAgentId), //new
     //   where('workerId', '==', selectedWorkerId), //new
    //    where('minuySochen', '==', false),
    //    where('statusPolicy', 'in', ['פעילה', 'הצעה'])
    //  );


  //  async function fetchSalesData(selectedAgentId: string | undefined, selectedWorkerId: string | undefined) {
      // Start with a base query for the 'sales' collection

      setMonthlyTotals({});
      setOverallFinansimTotal(0);
      setOverallPensiaTotal(0);
      setOverallInsuranceTotal(0);
      setOverallNiudPensiaTotal(0);


      let salesQuery = query(collection(db, 'sales'), where('minuySochen', '==', false), where('statusPolicy', 'in', ['פעילה', 'הצעה']));
    
      // Conditionally add 'AgentId' filter if 'selectedAgentId' is provided
      if (selectedAgentId) {
        salesQuery = query(salesQuery, where('AgentId', '==', selectedAgentId));
        console.log(selectedAgentId,'selectedAgentId');
        console.log(selectedWorkerId,'selectedWorkerId');
      }
    
      // Conditionally add 'workerId' filter if 'selectedWorkerId' is provided
      if (selectedWorkerId) {
        salesQuery = query(salesQuery, where('workerId', '==', selectedWorkerId));
        console.log(selectedAgentId,'selectedAgentId');
        console.log(selectedWorkerId,'selectedWorkerId');
      }

      

      const querySnapshot = await getDocs(salesQuery);
      let initialMonthlyTotals: MonthlyTotals = {};
  
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const mounth = data.mounth; // Assuming you have a month field
  
        if (!initialMonthlyTotals[mounth]) {
          initialMonthlyTotals[mounth] = { finansimTotal: 0, pensiaTotal: 0, insuranceTotal: 0, niudPensiaTotal: 0 };
        }
  
        // Accumulate values directly into initialMonthlyTotals
        initialMonthlyTotals[mounth].finansimTotal += parseInt(data.finansimZvira) || 0;
        initialMonthlyTotals[mounth].insuranceTotal += (parseInt(data.insPremia) || 0) * 12;
        initialMonthlyTotals[mounth].pensiaTotal += (parseInt(data.pensiaPremia) || 0) * 12;
        initialMonthlyTotals[mounth].niudPensiaTotal += parseInt(data.pensiaZvira) || 0;
      });
  
      setMonthlyTotals(initialMonthlyTotals); // Now, this correctly updates the state
      let overallFinansimTotal = 0;
      let overallPensiaTotal = 0;
      let overallInsuranceTotal = 0;
      let overallNiudPensiaTotal = 0;
      
      Object.values(initialMonthlyTotals).forEach(month => {
        overallFinansimTotal += month.finansimTotal;
        overallPensiaTotal += month.pensiaTotal;
        overallInsuranceTotal += month.insuranceTotal;
        overallNiudPensiaTotal += month.niudPensiaTotal;


      setOverallFinansimTotal(overallFinansimTotal);
      setOverallPensiaTotal(overallPensiaTotal);
      setOverallInsuranceTotal(overallInsuranceTotal);
      setOverallNiudPensiaTotal(overallNiudPensiaTotal);
      });


    };
  
    fetchData();
  }, [selectedAgentId, selectedWorkerId]);

  // Render your table with the calculated sums
  return (
    <div  style={{ paddingTop: '4rem' }}   >
      <h1  style={{ textAlign: 'right' , paddingRight: '20px' }}  > לוח מרכזי 
      </h1> 
      <table>
      <thead>
              <tr>
               <th>חודש תפוקה </th>
                <th>סך פיננסים</th>
                <th>סך פנסיה</th>
                <th>סך ביטוח</th>
                <th>ניוד פנסיה</th>
              </tr>
            </thead>
        <tbody>
    {Object.entries(monthlyTotals)
      .sort((a, b) => {
        const [monthA, yearA] = a[0].split("/").map(Number);
        const [monthB, yearB] = b[0].split("/").map(Number);
        // First compare by year, then by month if the years are equal
        return yearA !== yearB ? yearA - yearB : monthA - monthB;
      })
      .map(([month, totals]) => (
      <tr key={month}>
      <td>{month}</td>
      <td>{totals.finansimTotal.toLocaleString()}</td>
      <td>{totals.pensiaTotal.toLocaleString()}</td>
      <td>{totals.insuranceTotal.toLocaleString()}</td>
      <td>{totals.niudPensiaTotal.toLocaleString()}</td>
    </tr>
  ))}
  <tr>
    <td> <strong>סיכום</strong></td>
    <td><strong>{overallFinansimTotal.toLocaleString()}</strong></td>
    <td><strong>{overallPensiaTotal.toLocaleString()}</strong></td>
    <td><strong>{overallInsuranceTotal.toLocaleString()}</strong></td>
    <td><strong>{overallNiudPensiaTotal.toLocaleString()}</strong></td>
  </tr>
</tbody>
</table>

<select id="agent-select" value={selectedAgentId} onChange={handleAgentChange}>
  {detail?.role === 'admin' && <option value="">כל הסוכנות </option>}
  {agents.map((agent) => (
    <option key={agent.id} value={agent.id}>{agent.name}</option>

  ))}
</select>
<select id="worker-select" value={selectedWorkerId} onChange={handleWorkerChange}>
        <option value="">כל העובדים</option>
        {workers.map((worker) => (
          <option key={worker.id} value={worker.id}>{worker.name}</option>
        ))}
      </select>

    </div>
  
  );
};

export default SummaryTable;