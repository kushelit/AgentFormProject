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
            // console.warn('No data available for newCustomers');
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
            // console.warn('No data available for commissionPerMonth');
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
            // console.warn('No data available for companyCommissionPie');
            return;
          }
          const companyTotals = fetchCompanyCommissionData(monthlyTotals, filters.selectedYear);
          if (!companyTotals || Object.keys(companyTotals).length === 0) {
            setData({
              newCustomerCounts: {},
              distinctCustomerCounts: {},
              calculatedData: {},
            });
            // console.warn('No company commission data available');
            return;
          }
          setData({
            newCustomerCounts: {},
            distinctCustomerCounts: {},
            calculatedData: companyTotals,
          });
        }
      } catch (error) {
        // console.error('Error fetching graph data:', error);
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


const fetchNewCustomerData = async (filters: { selectedAgentId: string | null; selectedWorkerIdFilter: string; selectedYear: number }) => {
  const { selectedAgentId, selectedWorkerIdFilter, selectedYear } = filters;

  const yearString = String(selectedYear).slice(2);

  // יצירת רשימת חודשים לשנה המסוננת
  const monthsUpToNow = Array.from(
    { length: 12 },
    (_, i) => `${String(i + 1).padStart(2, '0')}/${yearString}`
  );

  // console.log('Months to process for selected year:', monthsUpToNow);

  // יצירת השאילתה
  let salesQuery = query(
    collection(db, 'sales'),
    where('statusPolicy', 'in', ['פעילה', 'הצעה'])
  );

  if (selectedAgentId && selectedAgentId !== 'all') {
    salesQuery = query(salesQuery, where('AgentId', '==', selectedAgentId));
  }
  if (selectedWorkerIdFilter) {
    salesQuery = query(salesQuery, where('workerId', '==', selectedWorkerIdFilter));
  }

  const querySnapshot = await getDocs(salesQuery);

  // מיפוי החודש הראשון של כל מבוטח
  const customerFirstMonth: Record<string, string> = {};
  querySnapshot.forEach((doc) => {
    const data = doc.data();
    if (data.IDCustomer && data.mounth && typeof data.mounth === 'string') {
      const customer = data.IDCustomer;
      const month = data.mounth.slice(0, 7);
      const formattedMonth = `${month.slice(5, 7)}/${month.slice(2, 4)}`;
      if (!customerFirstMonth[customer] || customerFirstMonth[customer] > formattedMonth) {
        customerFirstMonth[customer] = formattedMonth;
      }
    }
  });

  // console.log('Customer first month mapping:', customerFirstMonth);

  // חישוב כמות לקוחות חדשים לכל חודש
  const newCustomerCounts: Record<string, number> = {};
  Object.values(customerFirstMonth).forEach((month) => {
    newCustomerCounts[month] = (newCustomerCounts[month] || 0) + 1;
  });

  // console.log('New customer counts (all years):', newCustomerCounts);

  // **חישוב המצטבר לכל שנה ושמירת ערכי סוף שנה קודמת**
  const distinctCustomerCounts: Record<string, number> = {};
  let cumulativeCount = 0;
  const yearlyCumulative: Record<number, number> = {}; // שמירה על מצטבר לכל שנה

  const sortedMonths = Object.keys(newCustomerCounts).sort((a, b) => {
    const [monthA, yearA] = a.split('/').map(Number);
    const [monthB, yearB] = b.split('/').map(Number);
    return yearA - yearB || monthA - monthB;
  });

  sortedMonths.forEach((month) => {
    const [, year] = month.split('/').map(Number);
    cumulativeCount += newCustomerCounts[month];
    distinctCustomerCounts[month] = cumulativeCount;
    yearlyCumulative[year] = cumulativeCount; // שמירת המצטבר של השנה האחרונה
  });

  // console.log('Distinct customer counts (cumulative, all years):', distinctCustomerCounts);
  // console.log('Yearly cumulative snapshot:', yearlyCumulative);

  // **מציאת המצטבר של סוף השנה הקודמת - ניקח את דצמבר של השנה האחרונה**
  let cumulativeTotalBeforeYear = 0;
  const prevYear = selectedYear - 1;
  const prevYearDecember = `12/${String(prevYear).slice(2)}`;

  if (distinctCustomerCounts[prevYearDecember]) {
    cumulativeTotalBeforeYear = distinctCustomerCounts[prevYearDecember];
  }

  // console.log(`Cumulative count from last December (${prevYearDecember}):`, cumulativeTotalBeforeYear);

  // **מצטבר לכל חודש בשנת הבחירה בלבד, כולל מה שהיה לפני**
  let cumulativeForYear = cumulativeTotalBeforeYear;
  const filteredDistinctCustomerCounts: Record<string, number> = {};

  monthsUpToNow.forEach((month) => {
    const currentNewCustomerCount = newCustomerCounts[month] || 0;
    cumulativeForYear += currentNewCustomerCount;
    filteredDistinctCustomerCounts[month] = cumulativeForYear;
  });

  // **לקוחות חדשים רק לשנה הנבחרת**
  const filteredNewCustomerCounts = Object.fromEntries(
    monthsUpToNow.map((month) => [month, newCustomerCounts[month] || 0])
  );

  // console.log('Filtered new customer counts:', filteredNewCustomerCounts);
  // console.log('Filtered distinct customer counts:', filteredDistinctCustomerCounts);

  return { newCustomerCounts: filteredNewCustomerCounts, distinctCustomerCounts: filteredDistinctCustomerCounts };
};



const fetchCommissionPerCustomerData = async (
  filters: { selectedAgentId: string | null; selectedWorkerIdFilter: string; selectedYear: number },
  monthlyTotals: Record<string, MonthlyTotal>
) => {
  // console.log("🔍 מפתחות monthlyTotals:", Object.keys(monthlyTotals));

  const { distinctCustomerCounts } = await fetchNewCustomerData(filters);
  const calculatedData: Record<string, number> = {};
  const selectedYear = filters.selectedYear;
  const yearString = String(selectedYear).slice(2);

  let cumulativeCommission = 0;

  // 🔄 צוברים את כל החודשים עד לשנה הנבחרת (כולל שנה קודמת)
  const sortedMonths = Object.keys(monthlyTotals)
    .filter((month) => {
      const [monthNum, year] = month.split('/').map(Number);
      return year <= selectedYear; // כולל שנים קודמות
    })
    .sort((a, b) => {
      const [monthA, yearA] = a.split('/').map(Number);
      const [monthB, yearB] = b.split('/').map(Number);
      return yearA - yearB || monthA - monthB;
    });
    // console.log("🧾 כל החודשים שקיימים ב־monthlyTotals:", Object.keys(monthlyTotals));

  sortedMonths.forEach((month) => {
    const commission = monthlyTotals[month]?.commissionNifraimTotal || 0;
    cumulativeCommission += commission;
    // console.log("🧾cumulativeCommission:", cumulativeCommission);


    // 💡 רק חודשים מהשנה הנבחרת ייכנסו ל־calculatedData
    if (month.endsWith(`/${yearString}`)) {
      const distinctCustomers = distinctCustomerCounts[month] || 1;
      calculatedData[month] = cumulativeCommission / distinctCustomers;
      // console.log(`📊 חודש: ${month}, נפרעים מצטבר: ${cumulativeCommission}, לקוחות מצטברים: ${distinctCustomers}, ממוצע: ${calculatedData[month]}`);
    }
  });

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