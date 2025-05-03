import { useState, useEffect } from 'react';
import { collection, getDocs, query, where, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
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

function useSalesData(
  selectedAgentId: string,
  selectedWorkerId: string,
  selectedYear: number,
  includePreviousDecember: boolean = false
) {
  const [monthlyTotals, setMonthlyTotals] = useState<MonthlyTotals>({});
  const [overallFinansimTotal, setOverallFinansimTotal] = useState<number>(0);
  const [overallPensiaTotal, setOverallPensiaTotal] = useState<number>(0);
  const [overallInsuranceTotal, setOverallInsuranceTotal] = useState<number>(0);
  const [overallNiudPensiaTotal, setOverallNiudPensiaTotal] = useState<number>(0);

  const { user, detail } = useAuth();

  useEffect(() => {
    const fetchData = async () => {
      setMonthlyTotals({});
      setOverallFinansimTotal(0);
      setOverallPensiaTotal(0);
      setOverallInsuranceTotal(0);
      setOverallNiudPensiaTotal(0);

      let salesQuery = query(collection(db, 'sales'), where('statusPolicy', 'in', ['פעילה', 'הצעה']));

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
        const date = new Date(data.mounth);
        const year = date.getFullYear();
        const month = date.getMonth() + 1; // 1-based
        const formattedMonth = `${String(month).padStart(2, '0')}/${String(year).slice(2)}`;

        // 🟡 תנאי לכלול רק חודשים רלוונטיים
        if (!includePreviousDecember && year !== selectedYear) return;
        if (includePreviousDecember && !(year === selectedYear || (year === selectedYear - 1 && month === 12))) return;

        if (!initialMonthlyTotals[formattedMonth]) {
          initialMonthlyTotals[formattedMonth] = { finansimTotal: 0, pensiaTotal: 0, insuranceTotal: 0, niudPensiaTotal: 0 };
        }

        initialMonthlyTotals[formattedMonth].finansimTotal += parseInt(data.finansimZvira) || 0;
        initialMonthlyTotals[formattedMonth].insuranceTotal += (parseInt(data.insPremia) || 0) * 12;
        initialMonthlyTotals[formattedMonth].pensiaTotal += (parseInt(data.pensiaPremia) || 0) * 12;
        initialMonthlyTotals[formattedMonth].niudPensiaTotal += parseInt(data.pensiaZvira) || 0;
      });

      setMonthlyTotals(initialMonthlyTotals);

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
  }, [selectedAgentId, selectedWorkerId, selectedYear, includePreviousDecember]);

  return {
    monthlyTotals,
    overallFinansimTotal,
    overallPensiaTotal,
    overallInsuranceTotal,
    overallNiudPensiaTotal,
  };
}

export default useSalesData;
