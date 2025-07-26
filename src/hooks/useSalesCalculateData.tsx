import { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from "@/lib/firebase/firebase";
import { useAuth } from '@/lib/firebase/AuthContext';
import { CommissionSplit } from '@/types/CommissionSplit';
import {  CombinedData } from '../types/Sales';
import { fetchSplits } from '@/services/splitsService';
import  fetchDataForAgent from '@/services/fetchDataForAgent';


type MonthlyTotal = {
    finansimTotal: number;
    pensiaTotal: number;
    insuranceTotal: number;
    niudPensiaTotal: number;
    commissionHekefTotal: number;
    commissionNifraimTotal: number;
    insuranceTravelTotal: number;     
  prishaMyaditTotal: number;       
};

type MonthlyTotals = {
    [key: string]: MonthlyTotal;
};

interface Contract {
    id: string;
    company: string;
    product: string;
    productsGroup: string;
    agentId: string;
    commissionNifraim: number;
    commissionHekef: number;
    commissionNiud: number;
    minuySochen: boolean;
}

interface Product {
    productName: string;
    productGroup: string;
    isOneTimeCommission?: boolean; // שדה חדש – האם העמלה חד־פעמית
}


function useSalesData(
    selectedAgentId: string, 
    selectedWorkerIdFilter: string,
     selectedCompany: string, selectedProduct: string, 
     selectedStatusPolicy: string,
     selectedYear: number, // Add selectedYear as a parameter
     includePreviousDecember: boolean = false, // 🆕 פרמטר חדש
     isCommissionSplitEnabled: boolean
    ) {
    const [monthlyTotals, setMonthlyTotals] = useState<MonthlyTotals>({});
    const [overallTotals, setOverallTotals] = useState<MonthlyTotal>({ finansimTotal: 0, pensiaTotal: 0, insuranceTotal: 0, niudPensiaTotal: 0, commissionHekefTotal: 0, commissionNifraimTotal: 0  , insuranceTravelTotal: 0, prishaMyaditTotal: 0 }); // הוספת שדה חדש
    const [contracts, setContracts] = useState<Contract[]>([]);
const [productMap, setProductMap] = useState<Record<string, Product>>({});
    const { user, detail } = useAuth(); // Assuming useAuth() hook provides user and detail context
    const [loading, setLoading] = useState(true);  // Add loading state here
    const [isLoadingData, setIsLoadingData] = useState(false);
    const [companyCommissions, setCompanyCommissions] = useState<Record<string, number>>({});


    const [commissionSplits, setCommissionSplits] = useState<CommissionSplit[]>([]);
    const [customers, setCustomers] = useState<CombinedData[]>([]);


    useEffect(() => {
      const fetchAllData = async () => {
        const [splits, customerData] = await Promise.all([
          fetchSplits(selectedAgentId),
          fetchDataForAgent(selectedAgentId),
        ]);
        
        setCommissionSplits(splits);
        setCustomers(customerData); // כאן customerData הוא מסוג CustomersTypeForFetching[]
        
      };
    
      if (selectedAgentId) {
        fetchAllData();
      }
    }, [selectedAgentId]);
    


    useEffect(() => {
        async function fetchContractsAndProducts() {
            const contractsSnapshot = await getDocs(collection(db, 'contracts'));
            const productsSnapshot = await getDocs(collection(db, 'product'));
    
            const fetchedContracts: Contract[] = contractsSnapshot.docs.map(doc => ({
                id: doc.id,
                company: doc.data().company,
                product: doc.data().product,
                productsGroup: doc.data().productsGroup,
                agentId: doc.data().AgentId,
                commissionNifraim: doc.data().commissionNifraim,
                commissionHekef: doc.data().commissionHekef,
                commissionNiud: doc.data().commissionNiud,
                minuySochen: doc.data().minuySochen,
            }));
    
            const newProductMap: Record<string, Product> = {};
            productsSnapshot.forEach(doc => {
                const data = doc.data();
                newProductMap[data.productName] = {
                    productName: data.productName,
                    productGroup: data.productGroup,
                    isOneTimeCommission: data.isOneTime || false, // שדה חדש
                };
            });
    
            setContracts(fetchedContracts);
            setProductMap(newProductMap);
            setLoading(false);
        }
    
        if (selectedAgentId || detail?.role === 'admin') {
            fetchContractsAndProducts();
        }
    }, [selectedAgentId]);
    
    
    const createSalesQuery = (filterMinuySochen = false) => {
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
        const endOfYear = `${selectedYear}-12-31`;
        const endOfCurrentMonth = `${selectedYear}-${currentMonth}-31`;
      
        const endDate = selectedYear === currentYear ? endOfCurrentMonth : endOfYear;
      
        // 🟡 פה השינוי – נשתמש ב־startDate רק אם לא מדובר בגרף נפרעים ללקוח
        let salesQuery;
      console.log("includePreviousDecember: " + includePreviousDecember);
        if (includePreviousDecember) {
          // מצטבר – נביא מהעבר, בלי הגבלה של התחלה
          salesQuery = query(
            collection(db, 'sales'),
            where('statusPolicy', 'in', ['פעילה', 'הצעה']),
            where('mounth', '<=', endDate)
          );
        } else {
          // רגיל – רק השנה הנבחרת
          const startOfYear = `${selectedYear}-01-01`;
          salesQuery = query(
            collection(db, 'sales'),
            where('statusPolicy', 'in', ['פעילה', 'הצעה']),
            where('mounth', '>=', startOfYear),
            where('mounth', '<=', endDate)
          );
        }
      
        // סינונים נוספים...
        if (selectedAgentId && selectedAgentId !== 'all') {
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
        if (filterMinuySochen) {
          salesQuery = query(salesQuery, where('minuySochen', '==', false));
        }
      
        return salesQuery;
      };
      

    useEffect(() => {
        async function fetchData() {
            if (!loading) {
                // Handle the case when "בחר סוכן" is selected
                if (selectedAgentId === '') {
                    setMonthlyTotals({});
                    setCompanyCommissions({});
                    setOverallTotals({
                        finansimTotal: 0,
                        pensiaTotal: 0,
                        insuranceTotal: 0,
                        niudPensiaTotal: 0,
                        commissionHekefTotal: 0,
                        commissionNifraimTotal: 0,
                        insuranceTravelTotal: 0,
                        prishaMyaditTotal: 0, // הוספת שדה חדש
                    });
                    return;
                }
                setIsLoadingData(true);
                try {
                    const commissionSalesQuery = createSalesQuery(); // Only minuySochen=false
                    const generalSalesQuery = createSalesQuery(); // Including all minuySochen
    
                    if (!commissionSalesQuery || !generalSalesQuery) {
                        // If the query is invalid (e.g., "בחר סוכן"), skip fetching
                        setIsLoadingData(false);
                        return;
                    }
    
                const [generalQuerySnapshot, commissionQuerySnapshot] = await Promise.all([
                    getDocs(generalSalesQuery),
                    getDocs(commissionSalesQuery)
                ]);
                let newMonthlyTotals: MonthlyTotals = {};
                let newCompanyCommissions: Record<string, number> = {}; 

                generalQuerySnapshot.forEach(doc => {
                const data = doc.data();
                console.log("📦 תאריך מהממסמך:", data.mounth); // 🔍 הוספת שורת בדיקה

                const date = new Date(data.mounth);
                if (isNaN(date.getTime())) {
                    console.warn("❌ תאריך לא תקני:", data.mounth);
                    return;
                  }
                const year = date.getFullYear();
                const monthNumber = date.getMonth() + 1;
                const formattedMonth = `${String(monthNumber).padStart(2, '0')}/${String(year).slice(2)}`;

                if (!includePreviousDecember && year !== selectedYear) {
                    return; // סנן כל מה שלא בשנה הנבחרת
                  }
                                    
             //   const month = `${date.getMonth() + 1}`.padStart(2, '0') + '/' + date.getFullYear().toString().slice(2);
            //   const month = `${date.getMonth() + 1}`.padStart(2, '0') + '/' + year.toString().slice(2);

                if (!newMonthlyTotals[formattedMonth]) {
                        newMonthlyTotals[formattedMonth] = { finansimTotal: 0, pensiaTotal: 0, insuranceTotal: 0, niudPensiaTotal: 0, commissionHekefTotal: 0, commissionNifraimTotal: 0,insuranceTravelTotal: 0, prishaMyaditTotal: 0,
                    };
                }
                    updateTotalsForMonth(data, newMonthlyTotals[formattedMonth], data.minuySochen, productMap[data.product]);
                                
                });
                commissionQuerySnapshot.forEach(doc => {
                const data = doc.data();
                const date = new Date(data.mounth);
                const year = date.getFullYear();


        //    if (year !== selectedYear) return;

        if (!includePreviousDecember && year !== selectedYear) return;
        
            //   const month = `${date.getMonth() + 1}`.padStart(2, '0') + '/' + date.getFullYear().toString().slice(2);
            const month = `${date.getMonth() + 1}`.padStart(2, '0') + '/' + year.toString().slice(2);
            const product = productMap[data.product]; // זה כל אובייקט המוצר

            
            if (newMonthlyTotals[month]) {
                updateCommissions(data, newMonthlyTotals[month], product,
                  newCompanyCommissions,
                  commissionSplits,
                  customers,
                  isCommissionSplitEnabled

                );
              }
                });

                setMonthlyTotals(newMonthlyTotals);
                setCompanyCommissions(newCompanyCommissions); 
                aggregateOverallTotals(newMonthlyTotals);
            } catch (error) {
                console.error("7-Error fetching data:", error);
            } finally {
               setIsLoadingData(false); 
            }
        }
    }
     
        fetchData();
   
    }, [loading,selectedAgentId, selectedWorkerIdFilter, selectedCompany, 
        selectedProduct, selectedStatusPolicy,selectedYear,  includePreviousDecember, isCommissionSplitEnabled
    ]);

  

    function updateTotalsForMonth(data: any, monthTotals: MonthlyTotal, includeMinuySochen: boolean, product?: Product) {  
        if (!includeMinuySochen) {
            const isOneTime = product?.isOneTimeCommission ?? false;
          
            if (isOneTime) {
              // נפרדים לקטגוריות חד־פעמיות
              monthTotals.insuranceTravelTotal = (monthTotals.insuranceTravelTotal || 0) + (parseInt(data.insPremia) || 0);
              monthTotals.prishaMyaditTotal = (monthTotals.prishaMyaditTotal || 0) + (parseInt(data.pensiaZvira) || 0);
            } else {
              // מצטברים רגילים
              monthTotals.finansimTotal += parseInt(data.finansimZvira) || 0;
              monthTotals.insuranceTotal += (parseInt(data.insPremia) || 0) * 12;
              monthTotals.pensiaTotal += (parseInt(data.pensiaPremia) || 0) * 12;
              monthTotals.niudPensiaTotal += parseInt(data.pensiaZvira) || 0;
            }
          }
        }

    function updateCommissions(data: any, monthTotals: MonthlyTotal, 
       product: Product | undefined,
        companyCommissions: Record<string, number>,
        commissionSplits: CommissionSplit[],
      customers: CombinedData[],
     isCommissionSplitEnabled: boolean
    ) {  
        const productGroup = product?.productGroup;

        const contractMatch = contracts.find(contract => contract.agentId === data.AgentId && contract.product === data.product && contract.company === data.company &&   (contract.minuySochen === data.minuySochen || (contract.minuySochen === undefined && data.minuySochen === false)));
       
        if (contractMatch) {
            calculateCommissions(monthTotals, data, contractMatch, product , 
              companyCommissions,
               commissionSplits,
            customers,
             isCommissionSplitEnabled
            );
        } else {
            const groupMatch = contracts.find(contract => contract.productsGroup === productGroup && contract.agentId === data.AgentId &&  (contract.minuySochen === data.minuySochen || (contract.minuySochen === undefined && data.minuySochen === false)));
            
            if (groupMatch) {
                calculateCommissions(monthTotals, data, groupMatch, product ,
                   companyCommissions,
                   commissionSplits,
                   customers,
                   isCommissionSplitEnabled
                  
                  );
            } else {
                // console.log('No Match Found' , data.productGroup);
            }
        }
    }

    function calculateCommissions(monthTotals: MonthlyTotal, 
      data: any, 
      contract: Contract,
       product: Product | undefined, 
      companyCommissions: Record<string, number>,
      commissionSplits: CommissionSplit[],
      customers: CombinedData[], // ✅ חדש
      isCommissionSplitEnabled: boolean // ✅ FLAG
    ) 
    {
      console.log("📌 calculateCommissions called for", data.IDCustomer);
      console.log("✅ isCommissionSplitEnabled:", isCommissionSplitEnabled);
      
        const isOneTime = product?.isOneTimeCommission ?? false;
        const multiplier = isOneTime ? 1 : 12;


        let  hekef = ((parseInt(data.insPremia) || 0) * contract.commissionHekef / 100 * multiplier) + 
                     ((parseInt(data.pensiaPremia) || 0) * contract.commissionHekef / 100 * multiplier) + 
                     ((parseInt(data.pensiaZvira) || 0) * contract.commissionNiud / 100) + 
                     ((parseInt(data.finansimPremia) || 0) * contract.commissionHekef / 100 * multiplier) + 
                     ((parseInt(data.finansimZvira) || 0) * contract.commissionNiud / 100);
    
      
  // 🛑 אם מדובר במוצר חד-פעמי, נוותר על חישוב נפרעים
  let  nifraim = isOneTime ? 0 : (
    ((parseInt(data.insPremia) || 0) * contract.commissionNifraim / 100) +
    ((parseInt(data.pensiaPremia) || 0) * contract.commissionNifraim / 100) +
    ((parseInt(data.finansimZvira) || 0) * contract.commissionNifraim / 100 / 12)
  );
  // 🟢 בדיקת פיצול עמלות רק אם הופעל הדגל
if (isCommissionSplitEnabled) {
  console.log("🔁 בדיקת פיצול הופעלה עבור לקוח:", data.IDCustomer, "וסוכן:", data.AgentId);

  const customer = customers.find(
    cust => cust.IDCustomer === data.IDCustomer && cust.AgentId === data.AgentId
  );

  console.log("🧍‍♂️ לקוח שנמצא:", customer);

  if (customer?.sourceValue) {
    console.log("📌 sourceValue שנמצא:", customer.sourceValue);

    const splitAgreement = commissionSplits.find(
      split => split.agentId === data.AgentId && split.sourceLeadId === customer.sourceValue

    );

    console.log("📄 הסכם פיצול שנמצא:", splitAgreement);

    if (splitAgreement) {
      const percentToAgent = splitAgreement.percentToAgent;
      console.log(`💰 אחוז לסוכן לפי הסכם הפיצול: ${percentToAgent}%`);

      hekef *= (percentToAgent / 100);
      nifraim *= (percentToAgent / 100);

      console.log("✅ עמלה לאחר פיצול - היקף:", hekef, "| נפרעים:", nifraim);
    } else {
      console.log("⚠️ לא נמצא הסכם פיצול ל-sourceLead:", customer.sourceValue);
    }
  } else {
    console.log("🚫 ללקוח אין sourceValue – אין פיצול");
  }
}


        monthTotals.commissionHekefTotal += Math.round(hekef);
        monthTotals.commissionNifraimTotal += Math.round(nifraim);

  // Update company-specific commissions
  if (data.company) {
    companyCommissions[data.company] = (companyCommissions[data.company] || 0) + Math.round(hekef);
  //  console.log("companyCommissions[data.company]: " + companyCommissions[data.company]);
  }

    }

    function aggregateOverallTotals(monthlyTotals: MonthlyTotals) {
        let totals: MonthlyTotal = {
          finansimTotal: 0,
          pensiaTotal: 0,
          insuranceTotal: 0,
          niudPensiaTotal: 0,
          commissionHekefTotal: 0,
          commissionNifraimTotal: 0,
          insuranceTravelTotal: 0,
          prishaMyaditTotal: 0,
        };
      
        Object.values(monthlyTotals).forEach(month => {
          totals.finansimTotal += month.finansimTotal;
          totals.pensiaTotal += month.pensiaTotal;
          totals.insuranceTotal += month.insuranceTotal;
          totals.niudPensiaTotal += month.niudPensiaTotal;
          totals.commissionHekefTotal += month.commissionHekefTotal;
          totals.commissionNifraimTotal += month.commissionNifraimTotal;
          totals.insuranceTravelTotal += month.insuranceTravelTotal || 0;
          totals.prishaMyaditTotal += month.prishaMyaditTotal || 0;
        });
      
        setOverallTotals(totals);
      }
      

    return {
        monthlyTotals,
        overallTotals,
        isLoadingData,
        companyCommissions, 

    };
}

export default useSalesData;