'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { useAuth } from '@/lib/firebase/AuthContext';
import * as XLSX from 'xlsx';
import { Button } from '@/components/Button/Button';
import { ChevronLeft, ChevronRight } from 'lucide-react';


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
  const [comparisonRows, setComparisonRows] = useState<ComparisonRow[]>([]);
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
  

  interface ComparisonRow {
    policyNumber: string;
    row1: CommissionData | null;
    row2: CommissionData | null;
    status: string;
  }
  
  const [templateOptions, setTemplateOptions] = useState<TemplateOption[]>([]);
  
  const todayYm = new Date().toISOString().slice(0, 7);

const addMonths = (ym: string, delta: number) => {
  const base = ym && /^\d{4}-\d{2}$/.test(ym) ? ym : todayYm;
  const [y, m] = base.split('-').map(Number);
  const d = new Date(y, (m - 1) + delta, 1);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}`;
};

useEffect(() => {
  if (month1 && month2 && month2 < month1) setMonth2(month1);
}, [month1]); 

  
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
    const fmt = (d: Date) => d.toISOString().slice(0, 7); // YYYY-MM
    const now = new Date();
  
    // לקבע ליום 1 כדי להימנע מגלישות/אזורי זמן
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  
    setMonth1(fmt(prevMonth));  // קובע ליולי אם עכשיו אוגוסט
    setMonth2(fmt(thisMonth));  // קובע לאוגוסט (החודש הנוכחי)
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
    const exportData = visibleRows.map(({ policyNumber, row1, row2, status }: ComparisonRow) => ({
      'מספר פוליסה': policyNumber,
      'ת"ז לקוח': row1?.customerId || row2?.customerId || '',
      'מספר סוכן': row1?.agentCode || row2?.agentCode || '',
      [`עמלה ${formatMonth(month1)}`]: typeof row1?.commissionAmount === 'number' ? row1.commissionAmount.toFixed(2) : '',
      [`עמלה ${formatMonth(month2)}`]: typeof row2?.commissionAmount === 'number' ? row2.commissionAmount.toFixed(2) : '',
      'סטטוס': statusOptions.find(s => s.value === status)?.label || status
    }));
  
    // הוספת שורת סה"כ עם שדות מלאים (ולא רק חלקיים)
    exportData.push({
      'מספר פוליסה': 'סה"כ',
      'ת"ז לקוח': '',
      'מספר סוכן': '',
      [`עמלה ${formatMonth(month1)}`]: total1.toFixed(2),
      [`עמלה ${formatMonth(month2)}`]: total2.toFixed(2),
      'סטטוס': ''
    });
  
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


        const matchesAgentCode = !agentCodeFilter || (
          (row1?.agentCode && String(row1.agentCode) === agentCodeFilter) ||
          (row2?.agentCode && String(row2.agentCode) === agentCodeFilter)
        );
      
      const matchesStatus = !statusFilter || status === statusFilter;

      return matchesTerm && matchesAgentCode && matchesStatus;
    });
  }, [searchTerm, agentCodeFilter, statusFilter, comparisonRows]);



  const formatMonth = (value: string) => {
    if (!value) return '';
    const [year, month] = value.split('-');
    return `${month}/${year}`;
  };
  
  const statusSummary = useMemo(() => {
    return comparisonRows.reduce((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [comparisonRows]);
  

const visibleRows = useMemo(() => {
  return drillStatus
    ? filteredRows.filter(row => row.status === drillStatus)
    : filteredRows;
}, [filteredRows, drillStatus]);

const total1 = visibleRows.reduce((sum, r) =>
  typeof r.row1?.commissionAmount === 'number' ? sum + r.row1.commissionAmount : sum
, 0);

const total2 = visibleRows.reduce((sum, r) =>
  typeof r.row2?.commissionAmount === 'number' ? sum + r.row2.commissionAmount : sum
, 0);


const MonthStepper: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
}> = ({ label, value, onChange }) => {
  return (
    <div>
      <label className="block mb-1 font-semibold">{label}</label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="p-1 rounded border hover:bg-gray-100"
          aria-label="חודש קודם"
          title="חודש קודם"
          onClick={() => onChange(addMonths(value, -1))}
        >
  <ChevronRight className="h-4 w-4" /> {/* היה ChevronLeft */}
  </button>

        <input
          type="month"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input w-full"
        />

        <button
          type="button"
          className="p-1 rounded border hover:bg-gray-100"
          aria-label="חודש הבא"
          title="חודש הבא"
          onClick={() => onChange(addMonths(value, +1))}
        >
  <ChevronLeft className="h-4 w-4" /> {/* היה ChevronRight */}
  </button>
      </div>
    </div>
  );
};


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
  <MonthStepper
    label="חודש ראשון:"
    value={month1}
    onChange={setMonth1}
  />
  <MonthStepper
    label="חודש שני:"
    value={month2}
    onChange={setMonth2}
  />
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
        {filteredRows.length > 0 && !drillStatus && (
  <p className="text-gray-500 mt-4">בחר סטטוס להצגת פירוט.</p>
)}
      </>
    )}
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
  {/* חיפוש וסינון */}  <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
      <input
        type="text"
        placeholder='מספר פוליסה או ת"ז'
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
          <option value="">מספר סוכן</option>
          {agentCodes.map((code) => (
            <option key={code} value={code}>{code}</option>
          ))}
        </select>
      )}
      {/* <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        className="select-input w-full sm:w-1/2"
      >
        {statusOptions.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select> */}
      <button onClick={handleExport} className="btn btn-secondary">ייצוא לאקסל</button>
    </div>
    <h2 className="text-xl font-bold mb-2">
  פירוט לסטטוס: {statusOptions.find(s => s.value === drillStatus)?.label || drillStatus}
  {' '}({visibleRows.length} שורות)
</h2>
    <table className="w-full text-sm border">
      <thead>
        <tr className="bg-gray-200 text-right">
          <th className="border p-2">מספר פוליסה</th>
          <th className="border p-2">ת&quot;ז לקוח</th>
          <th className="border p-2">מספר סוכן</th>
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
            <td className="border p-2">{row1?.agentCode || row2?.agentCode || '-'}</td>
            <td className="border p-2">
  {typeof row1?.commissionAmount === 'number' ? row1.commissionAmount.toFixed(2) : '-'}
</td>
<td className="border p-2">
  {typeof row2?.commissionAmount === 'number' ? row2.commissionAmount.toFixed(2) : '-'}
</td>
            <td className="border p-2 font-bold">
              {statusOptions.find(s => s.value === status)?.label || 'ללא'}
            </td>
          </tr>
        ))}
        {visibleRows.length === 0 && (
  <tr>
    <td colSpan={6} className="text-center py-4 text-gray-500">
      לא נמצאו שורות תואמות לסינון הנבחר.
    </td>
  </tr>
)}<tr className="font-bold bg-blue-50">
<td className="border p-2 text-right">סה&quot;כ</td>     {/* 1: מספר פוליסה */}
<td className="border p-2"></td>                        {/* 2: ת"ז לקוח */}
<td className="border p-2"></td>                        {/* 3: מספר סוכן */}
<td className="border p-2">{total1.toFixed(2)}</td>     {/* 4: עמלה חודש 1 */}
<td className="border p-2">{total2.toFixed(2)}</td>     {/* 5: עמלה חודש 2 */}
<td className="border p-2"></td>                        {/* 6: סטטוס */}
</tr>

      </tbody>
    </table>
  </>
) : null}
  </div>
);
};

export default CommissionComparison;
