'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { useAuth } from '@/lib/firebase/AuthContext';
import * as XLSX from 'xlsx';
import { Button } from '@/components/Button/Button';


interface CommissionData {
  policyNumber: string;
  commissionAmount: number;
  customerId?: string;
  [key: string]: any;
}

interface Agent {
  id: string;
  name: string;
  agentCodes?: string[];
}

const statusOptions = [
  { value: '', label: 'הצג הכל' },
  { value: 'added', label: 'פוליסה נוספה' },
  { value: 'removed', label: 'פוליסה נמחקה' },
  { value: 'changed', label: 'עמלה שונתה' },
  { value: 'unchanged', label: 'ללא שינוי' }
];

const CommissionComparison = () => {
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange }: {
    agents: { id: string; name: string; agentCodes?: string[] }[];
    selectedAgentId: string;
    handleAgentChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  } = useFetchAgentData();
  
  const [templateId, setTemplateId] = useState('');
  // const [templateOptions, setTemplateOptions] = useState<{ id: string; companyName: string; type: string }[]>([]);
  const [month1, setMonth1] = useState('');
  const [month2, setMonth2] = useState('');
  const [comparisonRows, setComparisonRows] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [agentCodeFilter, setAgentCodeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [agentCodes, setAgentCodes] = useState<string[]>([]);

  const [selectedCompanyId, setSelectedCompanyId] = useState('');

  const [drillStatus, setDrillStatus] = useState<string | null>(null);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleAgentCodeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setAgentCodeFilter(e.target.value);
  };

  interface TemplateOption {
    id: string;
    companyId: string;
    companyName: string;
    type: string;
    Name?: string;
  }
  
  const [templateOptions, setTemplateOptions] = useState<TemplateOption[]>([]);
  
  
  const fetchTemplates = async () => {
    const snapshot = await getDocs(collection(db, 'commissionTemplates'));
    const templates: TemplateOption[] = [];
  
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const companyId = data.companyId || '';
      let companyName = '';
  
      if (companyId) {
        const companySnap = await getDocs(
          query(collection(db, 'company'), where('__name__', '==', companyId))
        );
        companySnap.forEach(doc => {
          companyName = doc.data().companyName || '';
        });
      }
  
      templates.push({
        id: docSnap.id,
        companyId,
        companyName,
        type: data.type || '',
        Name: data.Name || '',
      });
    }
  
    setTemplateOptions(templates);
  };
  
  useEffect(() => {
    fetchTemplates();
  }, []);
  
  const uniqueCompanies = useMemo(() => {
    return Array.from(
      new Map(
        templateOptions.map(t => [t.companyId, { id: t.companyId, name: t.companyName }])
      ).values()
    );
  }, [templateOptions]);

  const filteredTemplates = templateOptions.filter(
    t => t.companyId === selectedCompanyId
  );
  
  
  useEffect(() => {
    const now = new Date();
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 2);
    const format = (d: Date) => d.toISOString().slice(0, 7);
    setMonth1(format(prevMonth));
    setMonth2(format(lastMonth));
  }, []);

  useEffect(() => {
    const agent = agents.find((a: Agent) => a.id === selectedAgentId);
    if (agent?.agentCodes) {
      setAgentCodes(agent.agentCodes);
    } else {
      setAgentCodes([]);
    }
  }, [selectedAgentId, agents]);

  const handleCompare = async () => {
    if (!selectedAgentId || !templateId || !month1 || !month2) {
      alert('יש למלא את כל השדות לפני ההשוואה');
      return;
    }

    setIsLoading(true);
    const formatMonth = (value: string) => value.slice(0, 7);

    const q1 = query(
      collection(db, 'externalCommissions'),
      where('agentId', '==', selectedAgentId),
      where('templateId', '==', templateId),
      where('reportMonth', '==', formatMonth(month1))
    );

    const q2 = query(
      collection(db, 'externalCommissions'),
      where('agentId', '==', selectedAgentId),
      where('templateId', '==', templateId),
      where('reportMonth', '==', formatMonth(month2))
    );

    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

    const reduceCommissions = (snap: any): Record<string, CommissionData> => {
      const grouped: Record<string, CommissionData> = {};
      snap.forEach((doc: any) => {
        const d = doc.data() as CommissionData;
        const key = d.policyNumber;
        if (!key) return;
        if (!grouped[key]) {
          grouped[key] = { ...d };
        } else {
          grouped[key].commissionAmount += d.commissionAmount;
        }
      });
      return grouped;
    };

    const data1 = reduceCommissions(snap1);
    const data2 = reduceCommissions(snap2);

    const allKeys = new Set([...Object.keys(data1), ...Object.keys(data2)]);
    const result = Array.from(allKeys).map((policyNumber) => {
      const row1 = data1[policyNumber] ?? null;
      const row2 = data2[policyNumber] ?? null;

      let status = '';
      if (!row1 && row2) status = 'added';
      else if (row1 && !row2) status = 'removed';
      else if (row1 && row2 && row1.commissionAmount !== row2.commissionAmount) status = 'changed';
      else status = 'unchanged';

      return { policyNumber, row1, row2, status };
    });

    setComparisonRows(result);
    setIsLoading(false);
  };

  const handleExport = () => {
    const exportData = comparisonRows.map(({ policyNumber, row1, row2, status }) => ({
      'מספר פוליסה': policyNumber,
      'ת"ז לקוח': row1?.customerId || row2?.customerId || '',
      'עמלה חודש ראשון': row1?.commissionAmount ?? '',
      'עמלה חודש שני': row2?.commissionAmount ?? '',
      'סטטוס': statusOptions.find(s => s.value === status)?.label || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'השוואת עמלות');
    XLSX.writeFile(wb, 'השוואת_עמלות.xlsx');
  };

  const filteredRows = useMemo(() => {
    return comparisonRows.filter(({ policyNumber, row1, row2, status }) => {
      const matchesTerm = !searchTerm || policyNumber.includes(searchTerm) ||
        String(row1?.customerId || '').includes(searchTerm) ||
        String(row2?.customerId || '').includes(searchTerm);

        const matchesAgentCode = !agentCodeFilter ||
        String(row1?.agentCode ?? '') === agentCodeFilter ||
        String(row2?.agentCode ?? '') === agentCodeFilter;
      
      const matchesStatus = !statusFilter || status === statusFilter;

      return matchesTerm && matchesAgentCode && matchesStatus;
    });
  }, [searchTerm, agentCodeFilter, statusFilter, comparisonRows]);

  const total1 = filteredRows.reduce((sum, r) => sum + (r.row1?.commissionAmount || 0), 0);
  const total2 = filteredRows.reduce((sum, r) => sum + (r.row2?.commissionAmount || 0), 0);

  const formatMonth = (value: string) => {
    if (!value) return '';
    const [year, month] = value.split('-');
    return `${month}/${year}`;
  };
  
  const statusSummary = useMemo(() => {
    return filteredRows.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [filteredRows]);
  

const visibleRows = useMemo(() => {
  return drillStatus
    ? filteredRows.filter(row => row.status === drillStatus)
    : filteredRows;
}, [filteredRows, drillStatus]);
return (
  <div className="p-6 max-w-6xl mx-auto text-right">
    <h1 className="text-2xl font-bold mb-4">השוואת עמלות בין חודשים</h1>

    {/* בחירת סוכן */}
    <div className="mb-4">
      <label className="block mb-1 font-semibold">בחר סוכן:</label>
      <select value={selectedAgentId} onChange={handleAgentChange} className="select-input w-full">
        {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
        {agents.map(agent => (
          <option key={agent.id} value={agent.id}>{agent.name}</option>
        ))}
      </select>
    </div>

    {/* בחירת חברה */}
    <div className="mb-4">
      <label className="block font-semibold mb-1">בחר חברה:</label>
      <select
        value={selectedCompanyId}
        onChange={(e) => {
          setSelectedCompanyId(e.target.value);
          setTemplateId('');
        }}
        className="select-input w-full"
      >
        <option value="">בחר חברה</option>
        {uniqueCompanies.map(company => (
          <option key={company.id} value={company.id}>{company.name}</option>
        ))}
      </select>
    </div>

    {/* בחירת תבנית */}
    {selectedCompanyId && (
      <div className="mb-4">
        <label className="block font-semibold mb-1">בחר תבנית:</label>
        <select
          value={templateId}
          onChange={e => setTemplateId(e.target.value)}
          className="select-input w-full"
        >
          <option value="">בחר תבנית</option>
          {filteredTemplates.map(opt => (
            <option key={opt.id} value={opt.id}>
              {opt.Name || opt.type}
            </option>
          ))}
        </select>
      </div>
    )}

    {/* חודשים */}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
      <div>
        <label className="block mb-1 font-semibold">חודש ראשון:</label>
        <input type="month" value={month1} onChange={(e) => setMonth1(e.target.value)} className="input w-full" />
      </div>
      <div>
        <label className="block mb-1 font-semibold">חודש שני:</label>
        <input type="month" value={month2} onChange={(e) => setMonth2(e.target.value)} className="input w-full" />
      </div>
    </div>

    <Button
      text={isLoading ? 'טוען...' : 'השווה'}
      type="primary"
      onClick={handleCompare}
      disabled={isLoading}
      className="mb-4 text-lg font-bold"
    />

    {/* סיכום לפי סטטוס */}
    {filteredRows.length > 0 && (
      <>
        <h2 className="text-xl font-bold mb-2">סיכום לפי סטטוס</h2>
        <table className="w-full text-sm border mb-6">
          <thead>
            <tr className="bg-gray-300 text-right font-bold">
              <th className="border p-2">סטטוס</th>
              <th className="border p-2">כמות</th>
            </tr>
          </thead>
          <tbody>
            {statusOptions
              .filter((s) => s.value && statusSummary[s.value])
              .map(({ value, label }) => (
                <tr
                  key={value}
                  className="hover:bg-gray-100 cursor-pointer"
                  onClick={() => setDrillStatus(value)}
                >
                  <td className="border p-2">{label}</td>
                  <td className="border p-2 text-center text-blue-600 underline">
                    {statusSummary[value] ?? 0}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </>
    )}

    {/* חיפוש וסינון */}
    <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
      <input
        type="text"
        placeholder='חיפוש לפי מספר פוליסה או ת"ז'
        value={searchTerm}
        onChange={handleSearchChange}
        className="input w-full sm:w-1/2"
      />
      {agentCodes.length > 0 && (
        <select
          value={agentCodeFilter}
          onChange={handleAgentCodeChange}
          className="select-input w-full sm:w-1/2"
        >
          <option value="">סינון לפי קוד סוכן</option>
          {agentCodes.map((code) => (
            <option key={code} value={code}>{code}</option>
          ))}
        </select>
      )}
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className="select-input w-full sm:w-1/2"
      >
        {statusOptions.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <button onClick={handleExport} className="btn btn-secondary">ייצוא לאקסל</button>
    </div>

    {/* חזור מכל Drilldown */}
   {/* טבלה מפורטת רק אם drillStatus קיים */}
{drillStatus ? (
  <>
    <button
      className="mb-4 px-4 py-2 bg-gray-500 text-white rounded"
      onClick={() => setDrillStatus(null)}
    >
      חזור לכל הסטאטוסים
    </button>

    <h2 className="text-xl font-bold mb-2">
      פירוט לסטטוס: {statusOptions.find(s => s.value === drillStatus)?.label || drillStatus}
    </h2>

    <table className="w-full text-sm border">
      <thead>
        <tr className="bg-gray-200 text-right">
          <th className="border p-2">מספר פוליסה</th>
          <th className="border p-2">ת&quot;ז לקוח</th>
          <th className="border p-2">{`עמלה ${formatMonth(month1) || 'חודש ראשון'}`}</th>
          <th className="border p-2">{`עמלה ${formatMonth(month2) || 'חודש שני'}`}</th>
          <th className="border p-2">סטטוס</th>
        </tr>
      </thead>
      <tbody>
        {visibleRows.map(({ policyNumber, row1, row2, status }) => (
          <tr key={policyNumber} className="border">
            <td className="border p-2">{policyNumber}</td>
            <td className="border p-2">{row1?.customerId || row2?.customerId || '-'}</td>
            <td className="border p-2">{row1?.commissionAmount ?? '-'}</td>
            <td className="border p-2">{row2?.commissionAmount ?? '-'}</td>
            <td className="border p-2 font-bold">
              {statusOptions.find(s => s.value === status)?.label || 'ללא'}
            </td>
          </tr>
        ))}
        <tr className="font-bold bg-blue-50">
        <td className="border p-2 text-right">סה&quot;כ</td>
        <td className="border p-2"></td>
          <td className="border p-2">{total1.toFixed(2)}</td>
          <td className="border p-2">{total2.toFixed(2)}</td>
          <td className="border p-2"></td>
        </tr>
      </tbody>
    </table>
  </>
) : (
  <p className="text-gray-500 mt-4">בחר סטטוס להצגת פירוט.</p>
)}
  </div>
);
};

export default CommissionComparison;
