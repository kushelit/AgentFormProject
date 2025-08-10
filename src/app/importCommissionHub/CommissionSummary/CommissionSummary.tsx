// CommissionSummaryPage.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { useAuth } from '@/lib/firebase/AuthContext';
import { Spinner } from '@/components/Spinner';
import { Button } from '@/components/Button/Button';

interface CommissionSummary {
  agentId: string;
  agentCode: string;
  reportMonth: string;
  templateId: string;
  totalCommissionAmount: number;
}

interface CompanyMap {
  [templateId: string]: string;
}

interface AgentMonthMap {
  [company: string]: {
    [agentCode: string]: {
      [month: string]: number;
    };
  };
}

export default function CommissionSummaryPage() {
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();
  const [summaries, setSummaries] = useState<CommissionSummary[]>([]);
  const [companyMap, setCompanyMap] = useState<CompanyMap>({});
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<{ month: string; company: string } | null>(null);

  useEffect(() => {
    const fetchSummaries = async () => {
      if (!selectedAgentId) return;
      setLoading(true);
      const q = query(collection(db, 'commissionSummaries'), where('agentId', '==', selectedAgentId));
      const snapshot = await getDocs(q);
      const fetched = snapshot.docs.map(doc => doc.data() as CommissionSummary);
      setSummaries(fetched);
      setLoading(false);
    };
    fetchSummaries();
  }, [selectedAgentId]);
  useEffect(() => {
    const fetchCompanyMap = async () => {
      try {
        const templatesSnap = await getDocs(collection(db, 'commissionTemplates'));
        const map: CompanyMap = {};
  
        for (const docSnap of templatesSnap.docs) {
          const data = docSnap.data();
          const templateId = docSnap.id;
  
          if (data?.companyId) {
            const companyRef = doc(db, 'company', data.companyId);
            const companySnap = await getDoc(companyRef);
  
            if (companySnap.exists()) {
              const companyData = companySnap.data();
              map[templateId] = companyData?.companyName || 'חברה ללא שם';
            } else {
              map[templateId] = 'חברה לא נמצאה';
            }
          } else {
            map[templateId] = 'לא ידוע';
          }
        }
  
        setCompanyMap(map);
      } catch (error) {
        console.error('שגיאה בעת שליפת מפת החברות:', error);
      }
    };
  
    fetchCompanyMap();
  }, []);
  

  const summaryByMonthCompany = summaries.reduce((acc, curr) => {
    const company = companyMap[curr.templateId] || 'לא ידוע';
    const month = curr.reportMonth;
    if (!acc[month]) acc[month] = {};
    if (!acc[month][company]) acc[month][company] = 0;
    acc[month][company] += curr.totalCommissionAmount || 0;
    return acc;
  }, {} as Record<string, Record<string, number>>);

  const summaryByCompanyAgentMonth = summaries.reduce((acc, curr) => {
    const company = companyMap[curr.templateId] || 'לא ידוע';
    const month = curr.reportMonth;
    const agentCode = curr.agentCode || '-';
    if (!acc[company]) acc[company] = {};
    if (!acc[company][agentCode]) acc[company][agentCode] = {};
    if (!acc[company][agentCode][month]) acc[company][agentCode][month] = 0;
    acc[company][agentCode][month] += curr.totalCommissionAmount || 0;
    return acc;
  }, {} as AgentMonthMap);

  const allMonths = Object.keys(summaryByMonthCompany).sort();
  const allCompanies = Array.from(
    new Set(Object.values(summaryByMonthCompany).flatMap(m => Object.keys(m)))
  );

  const handleToggleExpand = (month: string, company: string) => {
    if (expanded?.month === month && expanded.company === company) {
      setExpanded(null);
    } else {
      setExpanded({ month, company });
    }
  };

  const selectedCompany = expanded?.company;

  return (
    <div className="p-6 max-w-6xl mx-auto text-right">
      <h2 className="text-2xl font-bold mb-4">סיכום עמלות לפי חודש וחברה</h2>

      <div className="mb-4">
        <label className="block font-semibold mb-1">בחר סוכן:</label>
        <select
          value={selectedAgentId}
          onChange={handleAgentChange}
          className="select-input w-full"
        >
          {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
          {agents.map(agent => (
            <option key={agent.id} value={agent.id}>{agent.name}</option>
          ))}
        </select>
      </div>

      {loading ? <Spinner /> : (
        <table className="table-auto w-full border text-sm text-right mt-6">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-2 py-1">חודש</th>
              {allCompanies.map(company => (
                <th key={company} className="border px-2 py-1">{company}</th>
              ))}
                  <th className="border px-2 py-1 font-bold bg-gray-50">סה"כ לחודש</th> 
            </tr>
          </thead>
          <tbody>
  {allMonths.map(month => {
    const monthTotal = allCompanies.reduce((sum, company) => {
      return sum + (summaryByMonthCompany[month]?.[company] || 0);
    }, 0);
    return (
      <tr key={month}>
        <td className="border px-2 py-1 font-semibold">{month}</td>
        {allCompanies.map(company => (
          <td
            key={company}
            className="border px-2 py-1 cursor-pointer hover:bg-gray-100"
            onClick={() => handleToggleExpand(month, company)}
          >
            {summaryByMonthCompany[month]?.[company]?.toLocaleString() ?? '-'}
          </td>
        ))}
        <td className="border px-2 py-1 font-bold bg-gray-100">{monthTotal.toLocaleString()}</td>
      </tr>
    );
  })}

  {/* שורת סיכום לכל חברה */}
  <tr className="bg-gray-200 font-bold">
    <td className="border px-2 py-1">סה"כ</td>
    {allCompanies.map(company => {
      const total = allMonths.reduce((sum, month) => {
        return sum + (summaryByMonthCompany[month]?.[company] || 0);
      }, 0);
      return (
        <td key={company} className="border px-2 py-1">{total.toLocaleString()}</td>
      );
    })}
    <td className="border px-2 py-1">
      {allMonths.reduce((sum, month) =>
        sum + allCompanies.reduce((innerSum, company) =>
          innerSum + (summaryByMonthCompany[month]?.[company] || 0), 0)
      , 0).toLocaleString()}
    </td>
  </tr>
</tbody>
        </table>
      )}

      {/* טבלת דריל דאון */}
      {selectedCompany && (
        <div className="mt-10">
          <h3 className="text-xl font-semibold mb-2">פירוט עבור חברה: {selectedCompany}</h3>
          <table className="table-auto border w-full text-sm text-right">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1">חודש</th>
                {Object.keys(summaryByCompanyAgentMonth[selectedCompany] || {}).sort().map(agentCode => (
                  <th key={agentCode} className="border px-2 py-1">{agentCode}</th>
                ))}
                    <th className="border px-2 py-1 font-bold bg-gray-50">סה"כ לחודש</th> 
              </tr>
            </thead>
            <tbody>
  {Array.from(
    new Set(
      Object.values(summaryByCompanyAgentMonth[selectedCompany] || {}).flatMap(m => Object.keys(m))
    )
  ).sort().map(month => {
    const rowTotal = Object.keys(summaryByCompanyAgentMonth[selectedCompany] || {}).reduce((sum, agentCode) => {
      return sum + (summaryByCompanyAgentMonth[selectedCompany]?.[agentCode]?.[month] || 0);
    }, 0);

    return (
      <tr key={month}>
        <td className="border px-2 py-1 font-semibold">{month}</td>
        {Object.keys(summaryByCompanyAgentMonth[selectedCompany] || {}).sort().map(agentCode => (
          <td key={agentCode} className="border px-2 py-1">
            {summaryByCompanyAgentMonth[selectedCompany]?.[agentCode]?.[month]?.toLocaleString() ?? '-'}
          </td>
        ))}
        <td className="border px-2 py-1 font-bold bg-gray-100">{rowTotal.toLocaleString()}</td>
      </tr>
    );
  })}

  {/* שורת סיכום לפי מספר סוכן */}
  <tr className="bg-gray-200 font-bold">
    <td className="border px-2 py-1">סה"כ</td>
    {Object.keys(summaryByCompanyAgentMonth[selectedCompany] || {}).sort().map(agentCode => {
      const total = Object.values(summaryByCompanyAgentMonth[selectedCompany]?.[agentCode] || {}).reduce((sum, val) => sum + val, 0);
      return (
        <td key={agentCode} className="border px-2 py-1">{total.toLocaleString()}</td>
      );
    })}
    <td className="border px-2 py-1">
      {Object.values(summaryByCompanyAgentMonth[selectedCompany] || {}).reduce((sum, agentData) => {
        return sum + Object.values(agentData).reduce((s, v) => s + v, 0);
      }, 0).toLocaleString()}
    </td>
  </tr>
</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
