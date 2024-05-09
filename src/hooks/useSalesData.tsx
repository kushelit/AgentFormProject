import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore'; // Adjust imports as necessary
import { db } from "@/lib/firebase/firebase";
import { useAuth } from '@/lib/firebase/AuthContext';




interface MonthlyTotals {
  [key: string]: {
    finansimTotal: number;
    pensiaTotal: number;
    insuranceTotal: number;
    niudPensiaTotal: number;
  };
}


function useSalesData(selectedAgentId: string, selectedWorkerId: string
  
  //selectedAgentId?: string,
  //selectedWorkerId?: string
) {
  const [monthlyTotals, setMonthlyTotals] = useState<MonthlyTotals>({});
  const [overallFinansimTotal, setOverallFinansimTotal] = useState<number>(0);
  const [overallPensiaTotal, setOverallPensiaTotal] = useState<number>(0);
  const [overallInsuranceTotal, setOverallInsuranceTotal] = useState<number>(0);
  const [overallNiudPensiaTotal, setOverallNiudPensiaTotal] = useState<number>(0);
  
  const { user, detail } = useAuth(); // Assuming useAuth() hook correctly provides User | null and Detail | null

  useEffect(() => {
    const fetchData = async () => {
      setMonthlyTotals({});
      setOverallFinansimTotal(0);
      setOverallPensiaTotal(0);
      setOverallInsuranceTotal(0);
      setOverallNiudPensiaTotal(0);

      let salesQuery = query(collection(db, 'sales'), where('minuySochen', '==', false), where('statusPolicy', 'in', ['פעילה', 'הצעה']));

      if (selectedAgentId) {
        salesQuery = query(salesQuery, where('AgentId', '==', selectedAgentId));
      }

      if (selectedWorkerId) {
        salesQuery = query(salesQuery, where('workerId', '==', selectedWorkerId));
      }

      const querySnapshot = await getDocs(salesQuery);
      let initialMonthlyTotals: MonthlyTotals = {};

      querySnapshot.forEach((doc: QueryDocumentSnapshot<DocumentData>) => {
        const data = doc.data();
        const month = data.month; // Ensure the correct field name for month

        if (!initialMonthlyTotals[month]) {
          initialMonthlyTotals[month] = { finansimTotal: 0, pensiaTotal: 0, insuranceTotal: 0, niudPensiaTotal: 0 };
        }

        initialMonthlyTotals[month].finansimTotal += parseInt(data.finansimZvira) || 0;
        initialMonthlyTotals[month].insuranceTotal += (parseInt(data.insPremia) || 0) * 12;
        initialMonthlyTotals[month].pensiaTotal += (parseInt(data.pensiaPremia) || 0) * 12;
        initialMonthlyTotals[month].niudPensiaTotal += parseInt(data.pensiaZvira) || 0;
      });

      setMonthlyTotals(initialMonthlyTotals);

      // Calculations for overall totals should be outside of the forEach loop
      let finansimTotal = 0;
      let pensiaTotal = 0;
      let insuranceTotal = 0;
      let niudPensiaTotal = 0;

      Object.values(initialMonthlyTotals).forEach(month => {
        finansimTotal += month.finansimTotal;
        pensiaTotal += month.pensiaTotal;
        insuranceTotal += month.insuranceTotal;
        niudPensiaTotal += month.niudPensiaTotal;
      });

      setOverallFinansimTotal(finansimTotal);
      setOverallPensiaTotal(pensiaTotal);
      setOverallInsuranceTotal(insuranceTotal);
      setOverallNiudPensiaTotal(niudPensiaTotal);
    };

    fetchData();
  }, [selectedAgentId, selectedWorkerId]);

  return { monthlyTotals, overallFinansimTotal, overallPensiaTotal, overallInsuranceTotal, overallNiudPensiaTotal };
}

export default useSalesData;