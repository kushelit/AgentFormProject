'use client';

import React, { useState, useEffect } from 'react';
import { query, collection, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/lib/firebase/AuthContext';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import './SummaryTable.css';
import useFetchMD from "@/hooks/useMD"; 
import Select from 'react-select';
import SalesCountGraph from  "@/components/SalesCountGraph"; 
import useSalesData from '@/hooks/useSalesCalculateData';


//interface MonthlyData {
 // finansimTotal: number;
//  pensiaTotal: number;
//  insuranceTotal: number;
//  niudPensiaTotal: number;
//  commissionHekefTotal: number;
//  commissionNifraimTotal: number;
//}

//interface MonthlyTotals {
 // [key: string]: MonthlyData;
//}

//interface Contract {
////  id: string;
 // company: string;
 // product: string;
 // productsGroup: string;
//  agentId: string;
//  commissionNifraim: number;
//  commissionHekef: number;
//  commissionNiud: number;
 // minuySochen: boolean;

//}

//interface Product {
 // productName: string;
 // productGroup: string;
  // Add other fields as necessary
//}


const SummaryTable = () => {
  const { user, detail } = useAuth();
  const { workers, agents, selectedAgentId, handleAgentChange, handleWorkerChange, selectedWorkerId ,
    companies, selectedCompany, selectedWorkerIdFilter,
    setSelectedCompany } = useFetchAgentData();

 // const [monthlyTotals, setMonthlyTotals] = useState<MonthlyTotals>({});
//  const [overallFinansimTotal, setOverallFinansimTotal] = useState(0);
//  const [overallPensiaTotal, setOverallPensiaTotal] = useState(0);
//  const [overallInsuranceTotal, setOverallInsuranceTotal] = useState(0);
//  const [overallNiudPensiaTotal, setOverallNiudPensiaTotal] = useState(0);
//  const [overallCommissionHekefTotal, setOverallCommissionHekefTotal] = useState(0);
 // const [overallCommissionNifraimTotal, setOverallCommissionNifraimTotal] = useState(0);
 // const [contracts, setContracts] = useState<Contract[]>([]);

  //const [productMap, setProductMap] = useState<Record<string, string>>({});
  

  const {
    products,
    selectedProduct,
    setSelectedProduct,
    selectedProductGroup, 
    setSelectedStatusPolicy, 
    selectedStatusPolicy, 
    statusPolicies
  } = useFetchMD();

  const { monthlyTotals, overallTotals } = useSalesData(selectedAgentId, selectedWorkerIdFilter, selectedCompany, selectedProduct, selectedStatusPolicy);
  const monthsCount = Object.keys(monthlyTotals).length;

  // Calculating averages
const averageFinansim = Math.round(overallTotals.finansimTotal / monthsCount);
const averagePensia = Math.round(overallTotals.pensiaTotal / monthsCount);
const averageInsurance = Math.round(overallTotals.insuranceTotal / monthsCount);
const averageNiudPensia = Math.round(overallTotals.niudPensiaTotal / monthsCount);
const averageCommissionHekef = Math.round(overallTotals.commissionHekefTotal / monthsCount);
const averageCommissionNifraim = Math.round(overallTotals.commissionNifraimTotal / monthsCount);


 // useEffect(() => {
  //  const fetchProducts = async () => {
    //  const querySnapshot = await getDocs(collection(db, 'product'));
    //  const productMapping: Record<string, string> = {}; // More specific type than {}
     // querySnapshot.forEach((doc) => {
     //   const productData = doc.data() as Product; // Here you assert the type
     //   productMapping[productData.productName] = productData.productGroup;
    //  });
    //  setProductMap(productMapping);
   // };
  
   // fetchProducts();
  //}, []);


  //useEffect(() => {
//    const fetchContracts = async () => {
//      const snapshot = await getDocs(collection(db, 'contracts'));
 //     const fetchedContracts: Contract[] = snapshot.docs.map(doc => ({
 //       id: doc.id,
 //       company: doc.data().company,
 //       product: doc.data().product,
 ////       productsGroup: doc.data().productsGroup,
 //       agentId: doc.data().AgentId,
  //      commissionNifraim: doc.data().commissionNifraim,
  //      commissionHekef: doc.data().commissionHekef,
  //      commissionNiud: doc.data().commissionNiud,
 //       minuySochen: doc.data().minuySochen,
//
//      }));
//      setContracts(fetchedContracts);
//    };
 //   if (selectedAgentId) {
 //     fetchContracts();
 // }
//}, [selectedAgentId]);  //

 // useEffect(() => {
 //   const fetchData = async () => {
  //    let initialMonthlyTotals: MonthlyTotals = {};

  //    let salesQuery = query(collection(db, 'sales'), where('statusPolicy', 'in', ['פעילה', 'הצעה']));
  //    if (selectedAgentId) {
  //      salesQuery = query(salesQuery, where('AgentId', '==', selectedAgentId));
  //    }
 //     if (selectedWorkerIdFilter) {
  //      salesQuery = query(salesQuery, where('workerId', '==', selectedWorkerIdFilter));
  //    }
 //     if (selectedCompany) {
  //      salesQuery = query(salesQuery, where('company', '==', selectedCompany));
 //     }
 //     if (selectedProduct) {
  //      salesQuery = query(salesQuery, where('product', '==', selectedProduct));
  //    }
  //    if (selectedStatusPolicy) {
  //      salesQuery = query(salesQuery, where('statusPolicy', '==', selectedStatusPolicy));
 //   }

 //     const querySnapshot = await getDocs(salesQuery);
 //     querySnapshot.forEach(doc => {
 //       const data = doc.data();
 //       const month = data.mounth;
 //       const productGroup = productMap[data.product]; // Use the productMap to get the productGroup

//        const contractMatch = contracts.find(contract => contract.agentId === data.AgentId && contract.product === data.product && contract.company === data.company && (contract.minuySochen === data.minuySochen || (contract.minuySochen === undefined && !data.minuySochen)));


 //       if (!initialMonthlyTotals[month]) {
 //         initialMonthlyTotals[month] = { finansimTotal: 0, pensiaTotal: 0, insuranceTotal: 0, niudPensiaTotal: 0, commissionHekefTotal: 0 ,commissionNifraimTotal: 0};
 //       }

 //       initialMonthlyTotals[month].finansimTotal += parseInt(data.finansimZvira) || 0;
  //      initialMonthlyTotals[month].insuranceTotal += (parseInt(data.insPremia) || 0) * 12;
 //       initialMonthlyTotals[month].pensiaTotal += (parseInt(data.pensiaPremia) || 0) * 12;
 //       initialMonthlyTotals[month].niudPensiaTotal += parseInt(data.pensiaZvira) || 0;

 //       if (contractMatch) {
        //  initialMonthlyTotals[month].commissionHekefTotal += Math.round(
      //    let totalHekef=(
  //        ((parseInt(data.insPremia) || 0) * contractMatch.commissionHekef/100 * 12)
  //        +((parseInt(data.pensiaPremia) || 0) * contractMatch.commissionHekef/100 * 12)
  //        +((parseInt(data.pensiaZvira) || 0) * contractMatch.commissionNiud/100)
  //        +((parseInt(data.finansimPremia) || 0) * contractMatch.commissionHekef/100 * 12)
  //        +((parseInt(data.finansimZvira) || 0) * contractMatch.commissionNiud/100)
  //        );
  //        initialMonthlyTotals[month].commissionHekefTotal += Math.round(totalHekef);

 //       } else {
          // Try to match based on productGroup
 //         const groupMatch = contracts.find(contract =>
  //          contract.productsGroup === productGroup &&
 //           contract.agentId === data.AgentId &&  (contract.minuySochen === data.minuySochen || (contract.minuySochen === undefined && !data.minuySochen))
 //         );
 //         if (groupMatch) {
 //           let totalHekef=(
           // initialMonthlyTotals[month].commissionHekefTotal += Math.round(
  //          ((parseInt(data.insPremia) || 0) * groupMatch.commissionHekef /100 * 12)
  //          +((parseInt(data.pensiaPremia) || 0) * groupMatch.commissionHekef /100 * 12)
  //          +((parseInt(data.pensiaZvira) || 0) * groupMatch.commissionNiud/100) 
  //          +((parseInt(data.finansimPremia) || 0) * groupMatch.commissionHekef/100 *12)
  //          +((parseInt(data.finansimZvira) || 0) * groupMatch.commissionNiud/100)
  //          );
  //          initialMonthlyTotals[month].commissionHekefTotal += Math.round(totalHekef);

  //        } else {
  //          initialMonthlyTotals[month].commissionHekefTotal += 0;
  //        }
  //      }

   //     if (contractMatch) {
        //  initialMonthlyTotals[month].commissionNifraimTotal += Math.round(
 //         let totalNifraim=(
  //        ((parseInt(data.insPremia) || 0) * contractMatch.commissionNifraim /100)
  //        +((parseInt(data.pensiaPremia) || 0) * contractMatch.commissionNifraim /100)
  //        +((parseInt(data.finansimZvira) || 0) * contractMatch.commissionNifraim /100/ 12)
  //        );

 //         initialMonthlyTotals[month].commissionNifraimTotal += Math.round(totalNifraim);

 //       } else {
          // Try to match based on productGroup
  //        const groupMatch = contracts.find(contract =>
  //          contract.productsGroup === productGroup &&
  //          contract.agentId === data.AgentId &&  (contract.minuySochen === data.minuySochen || (contract.minuySochen === undefined && !data.minuySochen))
  //        );
  //        if (groupMatch) {
           // initialMonthlyTotals[month].commissionNifraimTotal += Math.round(
 //           let totalNifraim=(
 //             ((parseInt(data.insPremia) || 0) * groupMatch.commissionNifraim /100)
 //           +((parseInt(data.pensiaPremia) || 0) * groupMatch.commissionNifraim /100)
 //           +((parseInt(data.finansimZvira) || 0) * groupMatch.commissionNifraim /100 / 12)
 //           );
 //           initialMonthlyTotals[month].commissionNifraimTotal += Math.round(totalNifraim)
//
 //         } else {
 //           initialMonthlyTotals[month].commissionNifraimTotal += 0;
 //         }
 //       }

//      });

 //     setMonthlyTotals(initialMonthlyTotals);
      // Calculate overall totals
 //     let overallFinansimTotal = 0;
  //    let overallPensiaTotal = 0;
  //    let overallInsuranceTotal = 0;
  //    let overallNiudPensiaTotal = 0;
 ///     let overallCommissionHekefTotal = 0;
 //     let overallCommissionNifraimTotal = 0;

 //     Object.values(initialMonthlyTotals).forEach(month => {
 //       overallFinansimTotal += month.finansimTotal;
 //       overallPensiaTotal += month.pensiaTotal;
 //       overallInsuranceTotal += month.insuranceTotal;
  //      overallNiudPensiaTotal += month.niudPensiaTotal;
 //       overallCommissionHekefTotal += month.commissionHekefTotal;
   //     overallCommissionNifraimTotal += month.commissionNifraimTotal;

   //   });

   //   setOverallFinansimTotal(overallFinansimTotal);
   //   setOverallPensiaTotal(overallPensiaTotal);
   //   setOverallInsuranceTotal(overallInsuranceTotal);
   //   setOverallNiudPensiaTotal(overallNiudPensiaTotal);
   //   setOverallCommissionHekefTotal(overallCommissionHekefTotal);
   //   setOverallCommissionNifraimTotal(overallCommissionNifraimTotal);

   // };

   // fetchData();
  //}, [selectedAgentId, selectedWorkerId, contracts, productMap, selectedCompany, selectedProduct, selectedStatusPolicy, selectedWorkerIdFilter]);

  //const [salesCounts, setSalesCounts] = useState<Record<string, number>>({});

  //const fetchSalesData = async () => {
  //  let salesData: Record<string, number> = {};
  //  let salesQuery = query(collection(db, 'sales'), where('AgentId', '==', selectedAgentId));
 
   // if (selectedWorkerIdFilter) {
  //    salesQuery = query(salesQuery, where('workerId', '==', selectedWorkerIdFilter));
 //   }
//    const querySnapshot = await getDocs(salesQuery);
//    querySnapshot.forEach(doc => {
 //     const data = doc.data();
 //     console.log(data);  // Check what each document contains
 //     const month = data.mounth; // Ensure 'month' exists and is correct
//      if (!salesData[month]) {
 //       salesData[month] = 0;
 //     }
 //     salesData[month]++;
 //   });
 //   console.log("Fetched sales data:", salesData); // Check the processed sales data
//    setSalesCounts(salesData);
//    console.log("Updated state with:", salesData);

 // };

  //useEffect(() => {
//    fetchSalesData(); // Call fetchSalesData within the useEffect hook
//}, [selectedAgentId, selectedWorkerIdFilter]); 

  //  const [companyMonthlyTotals, setCompanyMonthlyTotals] = useState<Record<string, Record<string, { commissionNifraimTotal: number }>>>({});
  //  const filters = {
  //      AgentId: selectedAgentId,
  //      WorkerId: selectedWorkerIdFilter,
   //     Company: selectedCompany,
   //     Product: selectedProduct,
    //    StatusPolicy: selectedStatusPolicy
   // };
  
   // const fetchCompanyCommissionsPerMonth = async (filters: Record<string, any>) => {
   //   let initialMonthlyCompanyTotals: Record<string, Record<string, { commissionNifraimTotal: number }>> = {};
    //  let salesQuery = query(collection(db, 'sales'), where('statusPolicy', 'in', ['פעילה', 'הצעה']));
  
      // Apply filters
    //  Object.entries(filters).forEach(([key, value]) => {
   //       if (value) {
   //           salesQuery = query(salesQuery, where(key, '==', value));
    //      }
   //   });
  
  //    const querySnapshot = await getDocs(salesQuery);
  //    querySnapshot.forEach(doc => {
  //        const data = doc.data();
  //        const month = data.mounth;
   //       const company = data.company;
  
    //      if (!initialMonthlyCompanyTotals[month]) {
    //          initialMonthlyCompanyTotals[month] = {};
     //     }
     //     if (!initialMonthlyCompanyTotals[month][company]) {
    //          initialMonthlyCompanyTotals[month][company] = { commissionNifraimTotal: 0 };
    //      }
  
   //       initialMonthlyCompanyTotals[month][company].commissionNifraimTotal += parseFloat(data.commissionNifraim) || 0;
  //    });
  
 //     return initialMonthlyCompanyTotals;
 // };

 // useEffect(() => {
   // fetchTotalCommissions(filters).then(setMonthlyTotals);
//    fetchCompanyCommissionsPerMonth(filters).then(setCompanyMonthlyTotals);
//}, [filters])

  return (
    <div className="frame-container bg-custom-white" style={{ maxWidth: '1000px', margin: '0 auto', padding: '10px 20px 20px 20px', border: '1px solid #ccc', borderRadius: '8px', marginTop: '10px' }}>

       <div style={{ marginTop: '20px', width: '90%', margin: '0 auto', overflowX: 'auto' }}>
      {/*   {defaultContracts.length > 0 ? ( */}
          <div className="table-container" style={{ width: '100%' }}>
            <table style={{ width: '100%'  }}></table>
      <table>
        <thead>
          <tr>
            <th>חודש תפוקה</th>
            <th>סך פיננסים</th>
            <th>סך פנסיה</th>
            <th>סך ביטוח</th>
            <th>ניוד פנסיה</th>
            <th>עמלת היקף</th>
            <th>עמלת נפרעים</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(monthlyTotals).sort((a, b) => {
            const [monthA, yearA] = a[0].split('/').map(Number);
            const [monthB, yearB] = b[0].split('/').map(Number);
            return yearA - yearB || monthA - monthB;
          }).map(([month, totals]) => (
            <tr key={month}>
              <td>{month}</td>
              <td>{totals.finansimTotal.toLocaleString()}</td>
              <td>{totals.pensiaTotal.toLocaleString()}</td>
              <td>{totals.insuranceTotal.toLocaleString()}</td>
              <td>{totals.niudPensiaTotal.toLocaleString()}</td>
              <td>{totals.commissionHekefTotal.toLocaleString()}</td>
              <td>{totals.commissionNifraimTotal.toLocaleString()}</td>

            </tr>
          ))}
          <tr>
            <td><strong>סיכום</strong></td>
            <td><strong>{overallTotals.finansimTotal.toLocaleString()}</strong></td>
            <td><strong>{overallTotals.pensiaTotal.toLocaleString()}</strong></td>
            <td><strong>{overallTotals.insuranceTotal.toLocaleString()}</strong></td>
            <td><strong>{overallTotals.niudPensiaTotal.toLocaleString()}</strong></td>
            <td><strong>{overallTotals.commissionHekefTotal.toLocaleString()}</strong></td>
            <td><strong>{overallTotals.commissionNifraimTotal.toLocaleString()}</strong></td>

          </tr>
          <tr>
        <td><strong>ממוצע</strong></td>
        <td><strong>{averageFinansim.toLocaleString()}</strong></td>
        <td><strong>{averagePensia.toLocaleString()}</strong></td>
        <td><strong>{averageInsurance.toLocaleString()}</strong></td>
        <td><strong>{averageNiudPensia.toLocaleString()}</strong></td>
        <td><strong>{averageCommissionHekef.toLocaleString()}</strong></td>
        <td><strong>{averageCommissionNifraim.toLocaleString()}</strong></td>
      </tr>
        </tbody>
      </table>
      
      <div className="select-container" >
      <select id="agent-select" value={selectedAgentId} onChange={handleAgentChange}>
        {detail?.role === 'admin' && <option value="">כל הסוכנות</option>}
        {agents.map(agent => (
          <option key={agent.id} value={agent.id}>{agent.name}</option>
        ))}
      </select>
      <select id="worker-select" value={selectedWorkerIdFilter} 
       onChange={(e) => handleWorkerChange(e, 'filter')}>
       <option value="">כל העובדים</option>
        {workers.map(worker => (
          <option key={worker.id} value={worker.id}>{worker.name}</option>
        ))}
      </select>

      <select id="companySelect" value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)}>
        <option value="">בחר חברה</option>
         {companies.map((companyName, index) => (
         <option key={index} value={companyName}>{companyName}</option>
    ))}
     </select>
     <select id="productSelect" value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)}>
               <option value="">בחר מוצר</option>
              {products.map(product => (
             <option key={product.id} value={product.name}>{product.name}</option>
         ))}
        </select>
        <select
      id="statusPolicySelect"
      value={selectedStatusPolicy}
      onChange={(e) => setSelectedStatusPolicy(e.target.value)}>
     <option value="">בחר סטאטוס פוליסה</option>
                            {statusPolicies.map((status, index) => (
                                <option key={index} value={status}>{status}</option>
       ))}
       </select>

      </div>
    </div>
    </div>
  
   {/*  <div className="graph-container" style={{ width: '100%', height: '400px' }}>
  <CommissionGraph data={monthlyTotals} /> 
</div>*/}


   {/* 
   <div className="graph-container" style={{ width: '60%', height: '200px' }}>
  {Object.keys(salesCounts).length > 0 ? (
    <SalesCountGraph data={salesCounts} />
  ) : (
    <p>Loading data...</p>
  )}
</div> */}

    </div>
  );
};

export default SummaryTable;