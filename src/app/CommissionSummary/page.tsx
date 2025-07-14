// components/pages/CommissionSummaryPage.tsx
'use client';

import React, { useEffect, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { useAuth } from '@/lib/firebase/AuthContext';
import { Spinner } from '@/components/Spinner';
import { Button } from '@/components/Button/Button';
import { Download } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';

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

const CommissionSummaryPage = () => {
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();
  const [summaries, setSummaries] = useState<CommissionSummary[]>([]);
  const [templateCompanyMap, setTemplateCompanyMap] = useState<CompanyMap>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchSummaries = async () => {
      if (!selectedAgentId) return;
      setLoading(true);

      const q = query(
        collection(db, 'commissionSummaries'),
        where('agentId', '==', selectedAgentId)
      );
      const snapshot = await getDocs(q);
      const fetched: CommissionSummary[] = snapshot.docs.map(doc => doc.data() as CommissionSummary);
      setSummaries(fetched);
      setLoading(false);
    };
    fetchSummaries();
  }, [selectedAgentId]);

  useEffect(() => {
    const fetchCompanyNames = async () => {
      const templatesSnap = await getDocs(collection(db, 'commissionTemplates'));
      const map: CompanyMap = {};
      for (const docSnap of templatesSnap.docs) {
        const data = docSnap.data();
        if (data.companyId) {
          const companySnap = await getDoc(doc(db, 'company', data.companyId));
          if (companySnap.exists()) {
            map[docSnap.id] = companySnap.data().companyName || '';
          }
        }
      }
      setTemplateCompanyMap(map);
    };
    fetchCompanyNames();
  }, []);

  const summaryByCompanyAndCode = summaries.reduce((acc, curr) => {
    const company = templateCompanyMap[curr.templateId] || 'לא ידוע';
    const agentCode = curr.agentCode || 'לא מוגדר';
    const month = curr.reportMonth || 'לא צויין';
    if (!acc[company]) acc[company] = {};
    if (!acc[company][agentCode]) acc[company][agentCode] = {};
    if (!acc[company][agentCode][month]) acc[company][agentCode][month] = 0;
    acc[company][agentCode][month] += curr.totalCommissionAmount || 0;
    return acc;
  }, {} as Record<string, Record<string, Record<string, number>>>);

  const handleExportToExcel = () => {
    const wb = XLSX.utils.book_new();
    Object.entries(summaryByCompanyAndCode).forEach(([company, codes]) => {
      const allMonths = Array.from(new Set(Object.values(codes).flatMap(m => Object.keys(m))));
      const sortedMonths = allMonths.sort((a, b) => {
        const [ma, ya] = a.split('/').map(Number);
        const [mb, yb] = b.split('/').map(Number);
        return ya !== yb ? ya - yb : ma - mb;
      });
      const allAgentCodes = Object.keys(codes);
      const data = sortedMonths.map(month => {
        const row: Record<string, any> = { חודש: month };
        allAgentCodes.forEach(code => {
          row[code] = codes[code]?.[month] ?? '-';
        });
        return row;
      });
      const ws = XLSX.utils.json_to_sheet(data);
      XLSX.utils.book_append_sheet(wb, ws, company);
    });
    XLSX.writeFile(wb, 'סיכום_עמלות.xlsx');
  };

  const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#a4de6c', '#d0ed57', '#888888', '#ff6384', '#36a2eb', '#cc65fe'];

  return (
    <div className="p-6 max-w-6xl mx-auto text-right">
      <h2 className="text-2xl font-bold mb-4">סיכום עמלות לפי מספר סוכן, חודש וחברה</h2>

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

      {loading ? (
        <Spinner />
      ) : (
        <div className="space-y-6">
          <Button 
          onClick={handleExportToExcel} 
          text="📥 ייצוא לאקסל" 
          type="secondary" 
          icon="off"
          />
          {Object.entries(summaryByCompanyAndCode).map(([company, codes]) => {
            const allMonths = Array.from(
              new Set(Object.values(codes).flatMap(months => Object.keys(months)))
            );
            const sortedMonths = allMonths.sort((a, b) => {
              const [ma, ya] = a.split('/').map(Number);
              const [mb, yb] = b.split('/').map(Number);
              return ya !== yb ? ya - yb : ma - mb;
            });

            const allAgentCodes = Object.keys(codes);

            const chartData = sortedMonths.map(month => {
              const row: any = { name: month };
              allAgentCodes.forEach(code => {
                row[code] = codes[code]?.[month] ?? 0;
              });
              return row;
            });

            return (
              <div key={company} className="border p-4 rounded-lg shadow-sm overflow-auto">
                <h3 className="text-xl font-semibold mb-2">חברה: {company}</h3>
                <table className="table-auto border w-full text-sm text-right">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="border px-2 py-1">חודש</th>
                      {allAgentCodes.map(code => (
                        <th key={code} className="border px-2 py-1">{code}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedMonths.map(month => (
                      <tr key={month}>
                        <td className="border px-2 py-1 font-semibold">{month}</td>
                        {allAgentCodes.map(code => (
                          <td key={code} className="border px-2 py-1">
                            {codes[code]?.[month]?.toLocaleString() ?? '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-4 h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      {allAgentCodes.map((code, index) => (
                        <Line
                          key={code}
                          type="monotone"
                          dataKey={code}
                          stroke={colors[index % colors.length]}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CommissionSummaryPage;
