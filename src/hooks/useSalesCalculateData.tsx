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
            const newProductMap: Record<string, string> = {};
            productsSnapshot.forEach(doc => {
                newProductMap[doc.data().productName] = doc.data().productGroup;
            });
            setContracts(fetchedContracts);
            setProductMap(newProductMap);
            setLoading(false);
        }

        if (selectedAgentId) {
            fetchContractsAndProducts();
        }
    }, [selectedAgentId]);

    

    const createSalesQuery = (filterMinuySochen  = false) => {
        let salesQuery = query(collection(db, 'sales'), where('statusPolicy', 'in', ['פעילה', 'הצעה']));
        if (selectedAgentId) salesQuery = query(salesQuery, where('AgentId', '==', selectedAgentId));
        if (selectedWorkerIdFilter) salesQuery = query(salesQuery, where('workerId', '==', selectedWorkerIdFilter));
        if (selectedCompany) salesQuery = query(salesQuery, where('company', '==', selectedCompany));
        if (selectedProduct) salesQuery = query(salesQuery, where('product', '==', selectedProduct));
        if (selectedStatusPolicy) salesQuery = query(salesQuery, where('statusPolicy', '==', selectedStatusPolicy));
        // Include the minuySochen condition only if includeMinuySochen is true
        console.log("filterMinuySochen:", filterMinuySochen);
        if (filterMinuySochen ) {
            salesQuery = query(salesQuery, where('minuySochen', '==', false));
            console.log("filterMinuySochen:", filterMinuySochen.toString() + salesQuery);
        }
    
        return salesQuery;
    };

    useEffect(() => {
        async function fetchData() {
            if (!loading) {            
               
                const commissionSalesQuery = createSalesQuery(); // Only minuySochen=false
                const generalSalesQuery = createSalesQuery(); // Including all minuySochen
                const [generalQuerySnapshot, commissionQuerySnapshot] = await Promise.all([
                    getDocs(generalSalesQuery),
                    getDocs(commissionSalesQuery)
                ]);
                let newMonthlyTotals: MonthlyTotals = {};

                generalQuerySnapshot.forEach(doc => {
                    const data = doc.data();
                    const month = data.mounth;
                    if (!newMonthlyTotals[month]) {
                        newMonthlyTotals[month] = { finansimTotal: 0, pensiaTotal: 0, insuranceTotal: 0, niudPensiaTotal: 0, commissionHekefTotal: 0, commissionNifraimTotal: 0 };
                    }
                    updateTotalsForMonth(data, newMonthlyTotals[month], data.minuySochen);
                });

                commissionQuerySnapshot.forEach(doc => {
                    const data = doc.data();
                    const month = data.mounth;
                    if (newMonthlyTotals[month]) {
                        updateCommissions(data, newMonthlyTotals[month], productMap[data.product]);
                    }
                });

                setMonthlyTotals(newMonthlyTotals);
                aggregateOverallTotals(newMonthlyTotals);
            }
        }

        fetchData();
    }, [loading, selectedAgentId, selectedWorkerIdFilter, selectedCompany, selectedProduct, selectedStatusPolicy, contracts, productMap]);


    function updateTotalsForMonth(data: any, monthTotals: MonthlyTotal, includeMinuySochen: boolean) {
      
        if (!includeMinuySochen ) {
            
        monthTotals.finansimTotal += parseInt(data.finansimZvira) || 0;
        monthTotals.insuranceTotal += (parseInt(data.insPremia) || 0) * 12;
        monthTotals.pensiaTotal += (parseInt(data.pensiaPremia) || 0) * 12;
        monthTotals.niudPensiaTotal += parseInt(data.pensiaZvira) || 0;
    }
    }

    function updateCommissions(data: any, monthTotals: MonthlyTotal, productGroup: string) {
        console.log("Current data product group:", data.productGroup);
        console.log("Available contracts:", contracts);
     
        contracts.forEach(contract => {
            console.log(`Checking against - AgentId: ${contract.agentId}, Product: ${contract.product}, Company: ${contract.company}, MinuySochen: ${contract.minuySochen}`);
            console.log('Match conditions:', {
                agentMatch: contract.agentId === data.AgentId,
                productMatch: contract.product === data.product,
                companyMatch: contract.company === data.company,
                minuySochenMatch: contract.minuySochen === data.minuySochen
            });
        });
        const contractMatch = contracts.find(contract => contract.agentId === data.AgentId && contract.product === data.product && contract.company === data.company &&   (contract.minuySochen === data.minuySochen || (contract.minuySochen === undefined && data.minuySochen === false)));
        console.log('data.AgentId:', data.AgentId);
        console.log('data.product:', data.product);
        console.log('data.company:', data.company);
        console.log('data.minuySochen:', data.minuySochen);
        console.log('productGroup:', productGroup);
        if (contractMatch) {
            console.log('Contract Match Found:', contractMatch);
            calculateCommissions(monthTotals, data, contractMatch);
        } else {
          //  const productGroup = productMap[data.product];
            console.log('data.product:', data.product+ " " +productGroup);
            
            const groupMatch = contracts.find(contract => contract.productsGroup === productGroup && contract.agentId === data.AgentId &&  (contract.minuySochen === data.minuySochen || (contract.minuySochen === undefined && data.minuySochen === false)));
            console.log('groupMatch:', groupMatch);
            
            if (groupMatch) {
                console.log('Group Match Found:', groupMatch, data.productGroup);
                calculateCommissions(monthTotals, data, groupMatch);
            } else {
                console.log('No Match Found' , data.productGroup);
            }
        }
    }

    function calculateCommissions(monthTotals: MonthlyTotal, data: any, contract: Contract) {
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
    };
}

export default useSalesData;