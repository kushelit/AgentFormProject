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
  filters: { selectedAgentId: string | null; selectedWorkerIdFilter: string, selectedYear: number },
  monthlyTotals?: Record<string, MonthlyTotal>
) => {

  const [data, setData] = useState({
    newCustomerCounts: {},
    distinctCustomerCounts: {},
    calculatedData: {},
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchGraphData = async () => {
      if (!filters || !filters.selectedAgentId) {
        // Reset data if filters are invalid
        setData({
          newCustomerCounts: {},
          distinctCustomerCounts: {},
          calculatedData: {},
        });
        return;
      }
      setLoading(true);
      try {
        if (selectedGraph === 'newCustomers') {
          const result = await fetchNewCustomerData(filters);
          if (Object.keys(result.newCustomerCounts).length === 0) {
            setData({
              newCustomerCounts: {},
              distinctCustomerCounts: {},
              calculatedData: {},
            });
            console.warn('No data available for newCustomers');
            return;
          }
          setData({
            newCustomerCounts: result.newCustomerCounts,
            distinctCustomerCounts: result.distinctCustomerCounts,
            calculatedData: {},
          });
        } else if (selectedGraph === 'commissionPerMonth') {
          if (!monthlyTotals || Object.keys(monthlyTotals).length === 0) {
            setData({
              newCustomerCounts: {},
              distinctCustomerCounts: {},
              calculatedData: {},
            });
            console.warn('No data available for commissionPerMonth');
            return;
          }
          const result = await fetchCommissionPerCustomerData(filters, monthlyTotals);
          setData({
            newCustomerCounts: {},
            distinctCustomerCounts: {},
            calculatedData: result.calculatedData || {},
          });
        } else if (selectedGraph === 'companyCommissionPie') {
          if (!monthlyTotals || Object.keys(monthlyTotals).length === 0) {
            setData({
              newCustomerCounts: {},
              distinctCustomerCounts: {},
              calculatedData: {},
            });
            console.warn('No data available for companyCommissionPie');
            return;
          }
          const companyTotals = fetchCompanyCommissionData(monthlyTotals, filters.selectedYear);
          if (!companyTotals || Object.keys(companyTotals).length === 0) {
            setData({
              newCustomerCounts: {},
              distinctCustomerCounts: {},
              calculatedData: {},
            });
            console.warn('No company commission data available');
            return;
          }
          setData({
            newCustomerCounts: {},
            distinctCustomerCounts: {},
            calculatedData: companyTotals,
          });
        }
      } catch (error) {
        console.error('Error fetching graph data:', error);
        setData({
          newCustomerCounts: {},
          distinctCustomerCounts: {},
          calculatedData: {},
        });
      } finally {
        setLoading(false);
      }
    };

    fetchGraphData();
  }, [selectedGraph, filters, monthlyTotals]); // Ensure dependencies are correct

  return { data, loading };
};


// Fetch Data for New Customers Graph
const fetchNewCustomerData =
 async (filters: { selectedAgentId: string | null; selectedWorkerIdFilter: string; 
 selectedYear: number
 }) => {
  const { selectedAgentId, selectedWorkerIdFilter, selectedYear} = filters;
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear(); // Current year (e.g., 2024)
  const currentMonth = currentDate.getMonth() + 1; // Current month (1-12)
  const yearString = String(selectedYear).slice(2); // Last two digits of the year (e.g., "24")
 
  const monthsToInclude =
  selectedYear === currentYear
    ? currentMonth // If current year, include up to the current month
    : 12; // If earlier year, include all 12 months
   
    const monthsUpToNow = Array.from(
      { length: monthsToInclude },
      (_, i) => `${String(i + 1).padStart(2, '0')}/${yearString}`
    );


  let salesQuery = query(
    collection(db, 'sales'),
    where('statusPolicy', 'in', ['פעילה', 'הצעה'])
  );

  if (selectedAgentId && selectedAgentId !== 'all') {
    // Only add the condition if selectedAgentId is not null or empty
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

      const month = data.mounth.slice(0, 7);
      const formattedMonth = `${month.slice(5, 7)}/${month.slice(2, 4)}`;

      if (
        formattedMonth.endsWith(`/${yearString}`) && 
        parseInt(formattedMonth.split('/')[0]) <= monthsToInclude  // Only include months up to the current month
      ) {
        if (!customerFirstMonth[customer] || customerFirstMonth[customer] > formattedMonth) {
          customerFirstMonth[customer] = formattedMonth;
        }
        distinctCustomers.add(customer);
      }
    }
  });

  const newCustomerCounts: Record<string, number> = {};
  Object.values(customerFirstMonth).forEach((month) => {
    newCustomerCounts[month] = (newCustomerCounts[month] || 0) + 1;
  });

 // Ensure all months up to the current month are present in `newCustomerCounts`
//  const monthsUpToNow = Array.from(
//   { length: currentMonth },
//   (_, i) => `${String(i + 1).padStart(2, '0')}/${yearString}`
// );
monthsUpToNow.forEach((month) => {
  if (!newCustomerCounts[month]) {
    newCustomerCounts[month] = 0;
  }
});
  const distinctCustomerCounts: Record<string, number> = {};
  let cumulativeCount = 0;

  Object.keys(newCustomerCounts).sort().forEach((month) => {
    cumulativeCount += newCustomerCounts[month];
    distinctCustomerCounts[month] = cumulativeCount;
  });
console.log('newCustomerCounts', newCustomerCounts);
  return { newCustomerCounts, distinctCustomerCounts };
};

// Fetch Data for Commission Per Customer Graph
const fetchCommissionPerCustomerData = async (
  //filters: any,
  filters: { selectedAgentId: string | null; selectedWorkerIdFilter: string; selectedYear: number },
  monthlyTotals: Record<string, MonthlyTotal>
) => {
  const { distinctCustomerCounts } = await fetchNewCustomerData(filters);
  console.log('distinctCustomerCounts', distinctCustomerCounts);
  const calculatedData: Record<string, number> = {};
  let cumulativeCommission = 0; // To keep track of cumulative commission

  const selectedYear = filters.selectedYear;
  const yearString = String(selectedYear).slice(2); // Get the last two digits of the selected year

  // Sort months to ensure chronological order
  const sortedMonths = Object.keys(monthlyTotals)
    .filter((month) => month.endsWith(`/${yearString}`)) // Include only months in the selected year
    .sort((a, b) => {
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

   // console.log(
    //  `Month: ${month}, Cumulative Commission: ${cumulativeCommission}, Customers: ${distinctCustomers}, Result: ${calculatedData[month]}`
    //);
  });

 // console.log('Commission Per Customer Calculated Data:', calculatedData);

  return { calculatedData };
};

const fetchCompanyCommissionData = (
  monthlyTotals: Record<string, MonthlyTotal>,
  selectedYear: number
) => {
//  const currentYear = new Date().getFullYear().toString(); // e.g., "2024"
const yearString = String(selectedYear).slice(2); // Get the last two digits of the year (e.g., "24")
const companyTotals: Record<string, number> = {};

  // Iterate over `monthlyTotals` to sum commissions for the current year
  Object.keys(monthlyTotals).forEach((month) => {
    if (month.slice(3, 5) === yearString) {
      const monthlyData = monthlyTotals[month];

      // Sum up the total commissions for the yearString
      companyTotals["Total"] = (companyTotals["Total"] || 0) + monthlyData.commissionHekefTotal || 0;
    }
  });

 // console.log('Company Totals for Current Year:', companyTotals);

  return companyTotals;
};


export default useFetchGraphData;