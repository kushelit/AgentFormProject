import { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from "@/lib/firebase/firebase";
import { useAuth } from '@/lib/firebase/AuthContext';

type MonthlyTotal = {
    finansimTotal: number;
    pensiaTotal: number;
    insuranceTotal: number;
    niudPensiaTotal: number;
    commissionHekefTotal: number;
    commissionNifraimTotal: number;
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
    // Add other fields as necessary
  }


  
function useSalesData(selectedAgentId: string, selectedWorkerIdFilter: string, selectedCompany: string, selectedProduct: string, selectedStatusPolicy: string) {
    const [monthlyTotals, setMonthlyTotals] = useState<MonthlyTotals>({});
    const [overallTotals, setOverallTotals] = useState<MonthlyTotal>({ finansimTotal: 0, pensiaTotal: 0, insuranceTotal: 0, niudPensiaTotal: 0, commissionHekefTotal: 0, commissionNifraimTotal: 0 });
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [productMap, setProductMap] = useState<Record<string, string>>({});
    const { user, detail } = useAuth(); // Assuming useAuth() hook provides user and detail context
    const [loading, setLoading] = useState(true);  // Add loading state here
    const [isLoadingData, setIsLoadingData] = useState(false);

    const [companyCommissions, setCompanyCommissions] = useState<Record<string, number>>({});

    useEffect(() => {
        async function fetchContractsAndProducts() {
            // console.log("before 6 - loading: " + loading);
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
            const newProductMap: Record<string, string> = {};
            productsSnapshot.forEach(doc => {
                newProductMap[doc.data().productName] = doc.data().productGroup;
            });
            setContracts(fetchedContracts);
            setProductMap(newProductMap);
            setLoading(false);
            // console.log("after 6 - loading: " + loading);
        }

        if (selectedAgentId || detail?.role === 'admin') {
            fetchContractsAndProducts();
        }
    }, [selectedAgentId]);

    

    const createSalesQuery = (filterMinuySochen  = false) => {

        const currentYear = new Date().getFullYear();
        const startOfYear = `${currentYear}-01-01`;
        const endOfYear = `${currentYear}-12-31`;

        let salesQuery = query(collection(db, 'sales'), 
        where('statusPolicy', 'in', ['פעילה', 'הצעה']),
        where('mounth', '>=', startOfYear),
        where('mounth', '<=', endOfYear)
    );
        // if (selectedAgentId) {
        //     salesQuery = query(salesQuery, where('AgentId', '==', selectedAgentId));
        // }

//new to test 
if (selectedAgentId && selectedAgentId !== 'all') {
    salesQuery = query(salesQuery, where('AgentId', '==', selectedAgentId));
}
console.log("selectedAgentId in salesQewry: " + selectedAgentId);
 
        if (selectedWorkerIdFilter) salesQuery = query(salesQuery, where('workerId', '==', selectedWorkerIdFilter));
        if (selectedCompany) salesQuery = query(salesQuery, where('company', '==', selectedCompany));
        if (selectedProduct) salesQuery = query(salesQuery, where('product', '==', selectedProduct));
        if (selectedStatusPolicy) salesQuery = query(salesQuery, where('statusPolicy', '==', selectedStatusPolicy));
        // Include the minuySochen condition only if includeMinuySochen is true
        // console.log("filterMinuySochen:", filterMinuySochen);
        if (filterMinuySochen ) {
            salesQuery = query(salesQuery, where('minuySochen', '==', false));
     //       console.log("filterMinuySochen:", filterMinuySochen.toString() + salesQuery);
        }
    //console.log("salesQuery: " + salesQuery);
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
                const date = new Date(data.mounth);
                const month = `${date.getMonth() + 1}`.padStart(2, '0') + '/' + date.getFullYear().toString().slice(2);
           
                if (!newMonthlyTotals[month]) {
                        newMonthlyTotals[month] = { finansimTotal: 0, pensiaTotal: 0, insuranceTotal: 0, niudPensiaTotal: 0, commissionHekefTotal: 0, commissionNifraimTotal: 0 };
                    }
                    updateTotalsForMonth(data, newMonthlyTotals[month], data.minuySochen);
                                
                });
                commissionQuerySnapshot.forEach(doc => {
                const data = doc.data();
                const date = new Date(data.mounth);
                const month = `${date.getMonth() + 1}`.padStart(2, '0') + '/' + date.getFullYear().toString().slice(2);
                if (newMonthlyTotals[month]) {
                        updateCommissions(data, newMonthlyTotals[month], productMap[data.product], newCompanyCommissions);
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
   
    }, [loading,selectedAgentId, selectedWorkerIdFilter, selectedCompany, selectedProduct, selectedStatusPolicy

    ]);

  


    function updateTotalsForMonth(data: any, monthTotals: MonthlyTotal, includeMinuySochen: boolean) {  
        if (!includeMinuySochen ) {       
        monthTotals.finansimTotal += parseInt(data.finansimZvira) || 0;
        monthTotals.insuranceTotal += (parseInt(data.insPremia) || 0) * 12;
        monthTotals.pensiaTotal += (parseInt(data.pensiaPremia) || 0) * 12;
        monthTotals.niudPensiaTotal += parseInt(data.pensiaZvira) || 0;
    }
    }

    function updateCommissions(data: any, monthTotals: MonthlyTotal, productGroup: string,
        companyCommissions: Record<string, number> // Pass an object to track per-company commissions
    ) {  
       // contracts.forEach(contract => {       
        // });
        const contractMatch = contracts.find(contract => contract.agentId === data.AgentId && contract.product === data.product && contract.company === data.company &&   (contract.minuySochen === data.minuySochen || (contract.minuySochen === undefined && data.minuySochen === false)));
       
        if (contractMatch) {
            calculateCommissions(monthTotals, data, contractMatch, companyCommissions);
        } else {
            const groupMatch = contracts.find(contract => contract.productsGroup === productGroup && contract.agentId === data.AgentId &&  (contract.minuySochen === data.minuySochen || (contract.minuySochen === undefined && data.minuySochen === false)));
            
            if (groupMatch) {
                calculateCommissions(monthTotals, data, groupMatch, companyCommissions);
            } else {
                // console.log('No Match Found' , data.productGroup);
            }
        }
    }

    function calculateCommissions(monthTotals: MonthlyTotal, data: any, contract: Contract,
        companyCommissions: Record<string, number> // Add company-specific commission tracking

    ) {
        const hekef = ((parseInt(data.insPremia) || 0) * contract.commissionHekef / 100 * 12) + 
                     ((parseInt(data.pensiaPremia) || 0) * contract.commissionHekef / 100 * 12) + 
                     ((parseInt(data.pensiaZvira) || 0) * contract.commissionNiud / 100) + 
                     ((parseInt(data.finansimPremia) || 0) * contract.commissionHekef / 100 * 12) + 
                     ((parseInt(data.finansimZvira) || 0) * contract.commissionNiud / 100);
    
      
    const nifraim = ((parseInt(data.insPremia) || 0) * contract.commissionNifraim / 100) + 
    ((parseInt(data.pensiaPremia) || 0) * contract.commissionNifraim / 100) + 
    ((parseInt(data.finansimZvira) || 0) * contract.commissionNifraim / 100 / 12);

        monthTotals.commissionHekefTotal += Math.round(hekef);
        monthTotals.commissionNifraimTotal += Math.round(nifraim);

  // Update company-specific commissions
  if (data.company) {
    companyCommissions[data.company] = (companyCommissions[data.company] || 0) + Math.round(hekef);
  //  console.log("companyCommissions[data.company]: " + companyCommissions[data.company]);
  }

    }




    function aggregateOverallTotals(monthlyTotals: MonthlyTotals) {
        let totals: MonthlyTotal = { finansimTotal: 0, pensiaTotal: 0, insuranceTotal: 0, niudPensiaTotal: 0, commissionHekefTotal: 0, commissionNifraimTotal: 0 };
        Object.values(monthlyTotals).forEach(month => {
            totals.finansimTotal += month.finansimTotal;
            totals.pensiaTotal += month.pensiaTotal;
            totals.insuranceTotal += month.insuranceTotal;
            totals.niudPensiaTotal += month.niudPensiaTotal;
            totals.commissionHekefTotal += month.commissionHekefTotal;
            totals.commissionNifraimTotal += month.commissionNifraimTotal;
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