import { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import useSalesData from '@/hooks/useSalesCalculateData';


type MonthlyTotal = {
  finansimTotal: number;
  pensiaTotal: number;
  insuranceTotal: number;
  niudPensiaTotal: number;
  commissionHekefTotal: number;
  commissionNifraimTotal: number;
};

const useFetchGraphData = (
  selectedGraph: string,
  filters: any,
  monthlyTotals?: Record<string, MonthlyTotal>
) => {
  const [data, setData] = useState<{
    newCustomerCounts: Record<string, number>;
    distinctCustomerCounts: Record<string, number>;
    calculatedData?: Record<string, number>;
  }>({
    newCustomerCounts: {},
    distinctCustomerCounts: {},
  });
  const [loading, setLoading] = useState(true);



  useEffect(() => {
    const fetchGraphData = async () => {
      setLoading(true);
      try {
        if (selectedGraph === 'newCustomers') {
          const result = await fetchNewCustomerData(filters);
          setData({
            newCustomerCounts: result.newCustomerCounts,
            distinctCustomerCounts: result.distinctCustomerCounts,
          });
        } else if (selectedGraph === 'commissionPerMonth') {
          if (!monthlyTotals || Object.keys(monthlyTotals).length === 0) {
            console.error('Monthly totals are required for commissionPerMonth');
            return;
          }
          const result = await fetchCommissionPerCustomerData(filters, monthlyTotals);
          setData({
            newCustomerCounts: {}, // Empty dataset for unused property
            distinctCustomerCounts: {}, // Empty dataset for unused property
            calculatedData: result.calculatedData,
          });
        }
        else if (selectedGraph === 'companyCommissionPie') {
          if (!monthlyTotals || Object.keys(monthlyTotals).length === 0) {
            console.error('Monthly totals are required for companyCommissionPie');
            setData({
              newCustomerCounts: {},
              distinctCustomerCounts: {},
              calculatedData: {}, // Empty data for the pie chart
            });
            return;
          }   
          // Use fetchCompanyCommissionData to aggregate data
          const companyTotals = fetchCompanyCommissionData(monthlyTotals);
          setData({
            newCustomerCounts: {}, // Empty dataset for unused property
            distinctCustomerCounts: {}, // Empty dataset for unused property
            calculatedData: companyTotals, // Pass aggregated company totals for pie chart
          });
        }
      } catch (error) {
        console.error('Error fetching graph data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchGraphData();
  }, [selectedGraph, filters, monthlyTotals]);

  return { data, loading };
};

// Fetch Data for New Customers Graph
const fetchNewCustomerData = async (filters: any) => {
  const { selectedAgentId, selectedWorkerIdFilter } = filters;

  let salesQuery = query(
    collection(db, 'sales'),
   // where('AgentId', '==', selectedAgentId),
    where('statusPolicy', 'in', ['פעילה', 'הצעה'])
  );
  if (selectedAgentId) {
    salesQuery = query(salesQuery, where('AgentId', '==', selectedAgentId));
  }
  
  if (selectedWorkerIdFilter) {
    salesQuery = query(salesQuery, where('workerId', '==', selectedWorkerIdFilter));
  }

  const querySnapshot = await getDocs(salesQuery);

  const customerFirstMonth: Record<string, string> = {};
  const distinctCustomers: Set<string> = new Set();

  querySnapshot.forEach((doc) => {
    const data = doc.data();
    if (data.IDCustomer && data.mounth && typeof data.mounth === 'string') {
      const customer = data.IDCustomer;

      // Convert month to MM/YY format to match `monthlyTotals`
      const month = data.mounth.slice(0, 7); // Extract "YYYY-MM"
      const formattedMonth = `${month.slice(5, 7)}/${month.slice(2, 4)}`; // Convert to MM/YY

      if (!customerFirstMonth[customer] || customerFirstMonth[customer] > formattedMonth) {
        customerFirstMonth[customer] = formattedMonth;
      }
      distinctCustomers.add(customer);
    }
  });

  const newCustomerCounts: Record<string, number> = {};
  Object.values(customerFirstMonth).forEach((month) => {
    newCustomerCounts[month] = (newCustomerCounts[month] || 0) + 1;
  });

  const distinctCustomerCounts: Record<string, number> = {};
  const sortedMonths = Object.keys(newCustomerCounts).sort();
  let cumulativeCount = 0;

  sortedMonths.forEach((month) => {
    cumulativeCount += newCustomerCounts[month];
    distinctCustomerCounts[month] = cumulativeCount;
  });

  return { newCustomerCounts, distinctCustomerCounts };
};


// Fetch Data for Commission Per Customer Graph
const fetchCommissionPerCustomerData = async (
  filters: any,
  monthlyTotals: Record<string, MonthlyTotal>
) => {
  const { distinctCustomerCounts } = await fetchNewCustomerData(filters);

  const calculatedData: Record<string, number> = {};
  let cumulativeCommission = 0; // To keep track of cumulative commission

  // Sort months to ensure chronological order
  const sortedMonths = Object.keys(monthlyTotals).sort((a, b) => {
    const [monthA, yearA] = a.split('/').map(Number);
    const [monthB, yearB] = b.split('/').map(Number);
    return yearA - yearB || monthA - monthB;
  });

  sortedMonths.forEach((month) => {
    const commission = monthlyTotals[month]?.commissionNifraimTotal || 0;
    cumulativeCommission += commission; // Add current month's commission to cumulative total

    const distinctCustomers = distinctCustomerCounts[month] || 1; // Avoid division by zero

    // Calculate commission per customer
    calculatedData[month] = cumulativeCommission / distinctCustomers;

    console.log(
      `Month: ${month}, Cumulative Commission: ${cumulativeCommission}, Customers: ${distinctCustomers}, Result: ${calculatedData[month]}`
    );
  });

  console.log('Commission Per Customer Calculated Data:', calculatedData);

  return { calculatedData };
};

const fetchCompanyCommissionData = (
  monthlyTotals: Record<string, MonthlyTotal>
) => {
  const currentYear = new Date().getFullYear().toString(); // e.g., "2024"
  const companyTotals: Record<string, number> = {};

  // Iterate over `monthlyTotals` to sum commissions for the current year
  Object.keys(monthlyTotals).forEach((month) => {
    if (month.slice(3, 5) === currentYear.slice(2)) {
      const monthlyData = monthlyTotals[month];

      // Sum up the total commissions for the current year
      companyTotals["Total"] = (companyTotals["Total"] || 0) + monthlyData.commissionHekefTotal || 0;
    }
  });

  console.log('Company Totals for Current Year:', companyTotals);

  return companyTotals;
};



export default useFetchGraphData;
