// שלד ראשוני לדף החדש שמשווה בין externalCommissions ל-sales לפי policyNumber

'use client';

import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { useAuth } from '@/lib/firebase/AuthContext';
import { calculateCommissions } from '@/utils/commissionCalculations';
import type { ContractForCompareCommissions } from '@/types/Contract';
import type { SalesToCompareCommissions } from '@/types/Sales';

export type ExternalCommissionRow = {
  policyNumber: string;
  commissionAmount: number;
  company: string;
};

interface Product {
  productName: string;
  productGroup: string;
  isOneTimeCommission?: boolean;
}


const CompareRealToReported = () => {
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  const [company, setCompany] = useState('');
  const [reportMonth, setReportMonth] = useState('');
  const [externalRows, setExternalRows] = useState<ExternalCommissionRow[]>([]);
  const [salesRows, setSalesRows] = useState<SalesToCompareCommissions[]>([]);
  const [contracts, setContracts] = useState<ContractForCompareCommissions[]>([]);
  const [comparisonRows, setComparisonRows] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [availableCompanies, setAvailableCompanies] = useState<string[]>([]);

  useEffect(() => {
    const fetchCompanies = async () => {
      const snapshot = await getDocs(collection(db, 'company'));
      const companies = snapshot.docs.map(doc => doc.data().companyName).sort();
      setAvailableCompanies(companies);
    };

    fetchCompanies();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!selectedAgentId || !company || !reportMonth) return;

      setIsLoading(true);

      const extQ = query(
        collection(db, 'externalCommissions'),
        where('agentId', '==', selectedAgentId),
        where('company', '==', company),
        where('reportMonth', '==', reportMonth)
      );
      console.log('🔎 Filters for externalCommissions:', {
        agentId: selectedAgentId,
        company,
        reportMonth
      });
      
      const extSnap = await getDocs(extQ);
      const extData = extSnap.docs.map(doc => {
        const data = doc.data() as ExternalCommissionRow;
        return {
          ...data,
          id: doc.id,
          policyNumber: String(data.policyNumber).trim().padStart(8, '0') // אם אורך צפוי של פוליסה הוא 8
        };
      });
      console.log('🧾 רשימת policyNumber מתוך extData:', extData.map(r => ({
        raw: r.policyNumber,
        asString: String(r.policyNumber),
        trimmed: String(r.policyNumber).trim(),
        type: typeof r.policyNumber
      })));
      
      setExternalRows(extData);

      const salesQ = query(
        collection(db, 'sales'),
        where('AgentId', '==', selectedAgentId),
        where('company', '==', company)
      );

      const salesSnap = await getDocs(salesQ);
      const salesData = salesSnap.docs.map(doc => {
        const data = doc.data() as SalesToCompareCommissions;
        return {
          ...data,
          id: doc.id,
          policyNumber: String(data.policyNumber).trim()
        };
      });
      setSalesRows(salesData);

      const contractsQ = query(
        collection(db, 'contracts'),
        where('AgentId', '==', selectedAgentId)
      );

      const contractsSnap = await getDocs(contractsQ);
      const contractsData = contractsSnap.docs.map(doc => doc.data() as ContractForCompareCommissions);
      setContracts(contractsData);

      const productMap: Record<string, Product> = {};
      contractsData.forEach(contract => {
        contract.productsGroup?.split(',').forEach(prod => {
          const trimmed = prod.trim();
          productMap[trimmed] = {
            productName: trimmed,
            productGroup: contract.productsGroup,
            isOneTimeCommission: false // או true אם צריך לפי לוגיקה כלשהי
          };
        });
      });

      const grouped: any[] = [];
      const allPolicies = new Set([
        ...extData.map(r => String(r.policyNumber).trim()),
        ...salesData.map(r => String(r.policyNumber).trim())
      ]);      
      console.log('📃 רשימת פוליסות מקובץ externalCommissions:', extData.map(r => r.policyNumber));

      allPolicies.forEach(policy => {
        const reported = extData.find(r => r.policyNumber === policy);
        console.log('🔍 בודק פוליסה:', policy);
        const actualSale = salesData.find(r => r.policyNumber === policy);

        let actualCommission = 0;
        if (actualSale) {
          console.log('🔧 actualSale.product:', actualSale.product);
          console.log('🔧 actualSale.minuySochen:', actualSale.minuySochen);
          console.log('📃 contractsData:', contractsData);
          console.log('selectedAgentId:', selectedAgentId);
          console.log('company:', company);

          const contractMatch = contractsData.find(contract =>
            contract.AgentId === selectedAgentId &&
            contract.company === company &&
            contract.product === actualSale.product &&
            contract.minuySochen === actualSale.minuySochen
          );

          const commissions = calculateCommissions(
            actualSale,
            contractMatch,
            contractsData,
            productMap,
            selectedAgentId
          );
          actualCommission = commissions.commissionNifraim;

          console.log('🔎 policy:', policy);
          console.log('reported:', reported);
          console.log('actualSale:', actualSale);
          console.log('contractMatch:', contractMatch);

          if (!reported) {
            console.log('🚫 לא נמצא דיווח עבור הפוליסה:', policy);
            console.log('🔍 בדיקה מול רשימת פוליסות בקובץ:', extData.map(r => r.policyNumber));
          }
        }

        const status = !reported
          ? 'not_reported'
          : !actualSale
          ? 'not_found'
          : reported.commissionAmount !== actualCommission
          ? 'mismatch'
          : 'match';

        grouped.push({
          policyNumber: policy,
          reportedAmount: reported?.commissionAmount || 0,
          actualAmount: actualCommission,
          status
        });
      });

      setComparisonRows(grouped);
      setIsLoading(false);
    };

    fetchData();
  }, [selectedAgentId, company, reportMonth]);

  return (
    <div className="p-6 max-w-6xl mx-auto text-right">
      <h1 className="text-2xl font-bold mb-4">השוואת עמלות מדווחות לעמלות בפועל</h1>

      {/* Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <select value={selectedAgentId} onChange={handleAgentChange} className="select-input">
          <option value="">בחר סוכן</option>
          {agents.map(agent => (
            <option key={agent.id} value={agent.id}>{agent.name}</option>
          ))}
        </select>

        <select value={company} onChange={(e) => setCompany(e.target.value)} className="select-input">
          <option value="">בחר חברה</option>
          {availableCompanies.map((comp, idx) => (
            <option key={idx} value={comp}>{comp}</option>
          ))}
        </select>

        <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} className="input" />
      </div>

      {/* טבלת השוואה */}
      {comparisonRows.length > 0 && (
        <table className="w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border p-2">מספר פוליסה</th>
              <th className="border p-2">עמלה מדווחת</th>
              <th className="border p-2">עמלה בפועל</th>
              <th className="border p-2">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {comparisonRows.map(({ policyNumber, reportedAmount, actualAmount, status }) => (
              <tr key={policyNumber}>
                <td className="border p-2">{policyNumber}</td>
                <td className="border p-2">{reportedAmount}</td>
                <td className="border p-2">{actualAmount}</td>
                <td className="border p-2 font-bold">{status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {isLoading && <p className="text-gray-500 mt-4">טוען נתונים...</p>}
    </div>
  );
};

export default CompareRealToReported;
