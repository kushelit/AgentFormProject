'use client';

import { query, collection, where, getDocs } from "firebase/firestore";
import { useState, useEffect } from "react";
import Link from "next/link";
import { db } from "@/lib/firebase/firebase";
//import './summaryTable.css';
import { useSearchParams } from 'next/navigation'

const SummaryTable = () => {
  const searchParams = useSearchParams();
  const agentName = searchParams?.get('agentName');


  const [finansimSum, setFinansimSum] = useState(0);
  const [pensiaSum, setPensiaSum] = useState(0);
  const [insuranceSum, setInsuranceSum] = useState(0);
  const [niudPensiaSum, setNiudPensiaSum] = useState(0);
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
  

  useEffect(() => {
    const fetchData = async () => {
      if (!agentName) return;
  
      const salesQuery = query(
        collection(db, 'sales'),
        where('agent', '==', agentName),
        where('minuySochen', '==', false),
        where('statusPolicy', 'in', ['פעילה', 'הצעה'])
      );
  
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
  }, [agentName]);

  // Render your table with the calculated sums
  return (
    <div>
      <h1>לוח מרכזי, סוכן :  {agentName}</h1>
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
    {Object.entries(monthlyTotals).map(([month, totals]) => (
      <tr key={month}>
      <td>{month}</td>
      <td>{totals.finansimTotal.toLocaleString()}</td>
      <td>{totals.pensiaTotal.toLocaleString()}</td>
      <td>{totals.insuranceTotal.toLocaleString()}</td>
      <td>{totals.niudPensiaTotal.toLocaleString()}</td>
    </tr>
  ))}
  <tr>
    <td>סיכום</td>
    <td>{overallFinansimTotal.toLocaleString()}</td>
    <td>{overallPensiaTotal.toLocaleString()}</td>
    <td>{overallInsuranceTotal.toLocaleString()}</td>
    <td>{overallNiudPensiaTotal.toLocaleString()}</td>
  </tr>
</tbody>
</table>
      <div>
        <Link href="/">
          חזור לדף ניהול מכירות
        </Link>
      </div>
    </div>
  );
};

export default SummaryTable;