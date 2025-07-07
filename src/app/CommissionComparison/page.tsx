'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import { useAuth } from '@/lib/firebase/AuthContext';
import * as XLSX from 'xlsx';

interface CommissionData {
  policyNumber: string;
  commissionAmount: number;
  customerId?: string;
  [key: string]: any;
}

const CommissionComparison = () => {
  const { detail } = useAuth();
  const { agents, selectedAgentId, handleAgentChange } = useFetchAgentData();

  const [templateId, setTemplateId] = useState('');
  const [templateOptions, setTemplateOptions] = useState<{ id: string; companyName: string; type: string }[]>([]);
  const [month1, setMonth1] = useState('');
  const [month2, setMonth2] = useState('');
  const [comparisonRows, setComparisonRows] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchTemplates = async () => {
      const snapshot = await getDocs(collection(db, 'commissionTemplates'));
      const templates: { id: string; companyName: string; type: string }[] = [];

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const companyId = data.companyId;
        let companyName = '';
        if (companyId) {
          const companySnap = await getDocs(query(collection(db, 'company'), where('__name__', '==', companyId)));
          companySnap.forEach(doc => {
            companyName = doc.data().companyName || '';
          });
        }
        templates.push({
          id: docSnap.id,
          companyName,
          type: data.type || ''
        });
      }
      setTemplateOptions(templates);
    };
    fetchTemplates();
  }, []);

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

  const getRowColor = (status: string) => {
    switch (status) {
      case 'added':
        return 'bg-green-100 border-green-300';
      case 'removed':
        return 'bg-red-100 border-red-300';
      case 'changed':
        return 'bg-yellow-100 border-yellow-300';
      default:
        return 'bg-white border-gray-200';
    }
  };

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim();
    if (!term) return comparisonRows;
    return comparisonRows.filter(({ policyNumber, row1, row2 }) =>
      policyNumber.includes(term) ||
      String(row1?.customerId || '').includes(term) ||
      String(row2?.customerId || '').includes(term)
    );
  }, [searchTerm, comparisonRows]);
  

  const total1 = filteredRows.reduce((sum, r) => sum + (r.row1?.commissionAmount || 0), 0);
  const total2 = filteredRows.reduce((sum, r) => sum + (r.row2?.commissionAmount || 0), 0);

  const handleExport = () => {
    const exportData = filteredRows.map(({ policyNumber, row1, row2, status }) => ({
      'מספר פוליסה': policyNumber,
      'ת"ז לקוח': row1?.customerId || row2?.customerId || '',
      'עמלה חודש ראשון': row1?.commissionAmount ?? '',
      'עמלה חודש שני': row2?.commissionAmount ?? '',
      'סטטוס': status === 'added' ? 'פוליסה נוספה' : status === 'removed' ? 'פוליסה נמחקה' : status === 'changed' ? 'עמלה שונה' : 'ללא שינוי'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'השוואת עמלות');
    XLSX.writeFile(wb, 'השוואת_עמלות.xlsx');
  };

  return (
    <div className="p-6 max-w-6xl mx-auto text-right">
      <h1 className="text-2xl font-bold mb-4">השוואת עמלות בין חודשים</h1>

      {/* טפסים עליונים */}
      <div className="mb-4">
        <label className="block mb-1 font-semibold">בחר סוכן:</label>
        <select value={selectedAgentId} onChange={handleAgentChange} className="select-input w-full">
          {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
          {agents.map(agent => (
            <option key={agent.id} value={agent.id}>{agent.name}</option>
          ))}
        </select>
      </div>

      <div className="mb-4">
        <label className="block mb-1 font-semibold">בחר תבנית:</label>
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className="select-input w-full">
          <option value="">בחר תבנית</option>
          {templateOptions.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>{tpl.companyName} – {tpl.type}</option>
          ))}
        </select>
      </div>

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

      <button onClick={handleCompare} className="btn btn-primary mb-4" disabled={isLoading}>
        {isLoading ? 'טוען...' : 'השווה'}
      </button>

      {/* שורת חיפוש + ייצוא */}
      {comparisonRows.length > 0 && (
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
          <input
            type="text"
            placeholder="חיפוש לפי מספר פוליסה או ת״ז"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input w-full sm:w-1/2"
          />
          <button onClick={handleExport} className="btn btn-secondary">ייצוא לאקסל</button>
        </div>
      )}

      {/* טבלה */}
      {filteredRows.length > 0 ? (
        <table className="w-full text-sm border">
          <thead>
            <tr className="bg-gray-200 text-right">
              <th className="border p-2">מספר פוליסה</th>
              <th className="border p-2">ת"ז לקוח</th>
              <th className="border p-2">עמלה חודש ראשון</th>
              <th className="border p-2">עמלה חודש שני</th>
              <th className="border p-2">סטטוס</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(({ policyNumber, row1, row2, status }) => (
              <tr key={policyNumber} className={`${getRowColor(status)} border`}>
                <td className="border p-2">{policyNumber}</td>
                <td className="border p-2">{row1?.customerId || row2?.customerId || '-'}</td>
                <td className="border p-2">{row1?.commissionAmount ?? '-'}</td>
                <td className="border p-2">{row2?.commissionAmount ?? '-'}</td>
                <td className="border p-2 font-bold">
                  {status === 'added' && <span className="text-green-700">נוספה</span>}
                  {status === 'removed' && <span className="text-red-700">נמחקה</span>}
                  {status === 'changed' && <span className="text-yellow-700">שונתה</span>}
                  {status === 'unchanged' && <span className="text-gray-600">ללא שינוי</span>}
                </td>
              </tr>
            ))}

            {/* שורת סה"כ */}
            <tr className="font-bold bg-blue-50">
              <td className="border p-2 text-right">סה״כ</td>
              <td className="border p-2"></td>
              <td className="border p-2">{total1.toFixed(2)}</td>
              <td className="border p-2">{total2.toFixed(2)}</td>
              <td className="border p-2"></td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="text-gray-500 mt-4">אין נתונים להצגה</p>
      )}
    </div>
  );
};

export default CommissionComparison;
