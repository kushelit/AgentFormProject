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

    const createSalesQuery = (includeMinuySochen = false) => {
        let salesQuery = query(collection(db, 'sales'), where('statusPolicy', 'in', ['פעילה', 'הצעה']));
        if (selectedAgentId) salesQuery = query(salesQuery, where('AgentId', '==', selectedAgentId));
        if (selectedWorkerIdFilter) salesQuery = query(salesQuery, where('workerId', '==', selectedWorkerIdFilter));
        if (selectedCompany) salesQuery = query(salesQuery, where('company', '==', selectedCompany));
        if (selectedProduct) salesQuery = query(salesQuery, where('product', '==', selectedProduct));
        if (selectedStatusPolicy) salesQuery = query(salesQuery, where('statusPolicy', '==', selectedStatusPolicy));
        if (includeMinuySochen) salesQuery = query(salesQuery, where('minuySochen', '==', false));

        return salesQuery;
    };


    const fetchData = async () => {
        const generalSalesQuery = createSalesQuery(true);
        const commissionSalesQuery = createSalesQuery(); // Including minuySochen

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
            updateTotalsForMonth(data, newMonthlyTotals[month]);
        });

        commissionQuerySnapshot.forEach(doc => {
            const data = doc.data();
            const month = data.mounth;
            if (newMonthlyTotals[month]) {
                updateCommissions(data, newMonthlyTotals[month]);
            }
        });

        setMonthlyTotals(newMonthlyTotals);
        aggregateOverallTotals(newMonthlyTotals);
    };

    useEffect(() => {
        fetchData();
    }, [selectedAgentId, selectedWorkerIdFilter, selectedCompany, selectedProduct, selectedStatusPolicy]);

    function updateTotalsForMonth(data: any, monthTotals: MonthlyTotal) {
        monthTotals.finansimTotal += parseInt(data.finansimZvira) || 0;
        monthTotals.insuranceTotal += parseInt(data.insPremia) || 0 * 12;
        monthTotals.pensiaTotal += parseInt(data.pensiaPremia) || 0 * 12;
        monthTotals.niudPensiaTotal += parseInt(data.pensiaZvira) || 0;
    }

    function updateCommissions(data: any, monthTotals: MonthlyTotal) {
        console.log("Current data product group:", data.productGroup);
        console.log("Available contracts:", contracts);
     
        const contractMatch = contracts.find(contract => contract.agentId === data.AgentId && contract.product === data.product && contract.company === data.company && (contract.minuySochen === data.minuySochen || contract.minuySochen === undefined));
        if (contractMatch) {
            console.log('Contract Match Found:', contractMatch);
            calculateCommissions(monthTotals, data, contractMatch);
        } else {
            const groupMatch = contracts.find(contract => contract.productsGroup === data.productGroup && contract.agentId === data.AgentId && (contract.minuySochen === data.minuySochen || contract.minuySochen === undefined));
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



    useEffect(() => {
        const fetchProducts = async () => {
          const querySnapshot = await getDocs(collection(db, 'product'));
          const productMapping: Record<string, string> = {}; // More specific type than {}
          querySnapshot.forEach((doc) => {
            const productData = doc.data() as Product; // Here you assert the type
            productMapping[productData.productName] = productData.productGroup;
          });
          setProductMap(productMapping);
        };
      
        fetchProducts();
      }, []);


    // Fetch contracts
    useEffect(() => {
        const fetchContracts = async () => {
            const snapshot = await getDocs(collection(db, 'contracts'));
            const fetchedContracts: Contract[] = snapshot.docs.map(doc => ({
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
            setContracts(fetchedContracts);
        };  
        if (selectedAgentId) {
            fetchContracts();
        }
    }, [selectedAgentId]); 




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