'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/firebase/AuthContext';
import { Button } from '@/components/Button/Button';
import { ToastNotification } from '@/components/ToastNotification';
import { useToast } from '@/hooks/useToast';
import useFetchAgentData from '@/hooks/useFetchAgentData';
import useFetchMD from '@/hooks/useMD';
import Select from 'react-select';
import { db } from '@/lib/firebase/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
// import { Product } from '@/types';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { registerLocale } from 'react-datepicker';
import { he } from 'date-fns/locale/he'; // ✅ נכון


registerLocale('he', he);


interface ReportProductGroup {
  reportType: string;
  allowedProductGroups: string[];
}

const REPORTS = [
  { value: 'insurancePremiumReport', label: 'דוח פרמיית ביטוח ללקוח' },
  { value: 'clientPoliciesReport', label: 'דוח עסקאות לתקופה' }, 
  { value: 'clientNifraimSummaryReport', label: 'דוח נפרעים לפי לקוח' },
  { value: 'clientFinancialAccumulationReport', label: 'דוח צבירה פיננסית ללקוח' },
  { value: 'clientNifraimReportedVsMagic', label: 'דוח נפרעים ללקוח – קובץ מול MagicSale' },

];

const ReportsPage: React.FC = () => {
  const { user, detail } = useAuth();
  const { toasts, addToast, setToasts } = useToast();
  const {
    agents,
    selectedAgentId,
    handleAgentChange,
    selectedAgentName,
    companies,
    selectedCompanyFilter,
    setSelectedCompanyFilter,
  } = useFetchAgentData();

  const { products, productToGroupMap, productGroupMap, statusPolicies
  } = useFetchMD();

  const DEFAULT_STATUS = ['פעילה', 'הצעה'];
  const [selectedStatusPolicyFilter, setSelectedStatusPolicyFilter] = useState<string[]>(DEFAULT_STATUS);
  const [minuySochenFilter, setMinuySochenFilter] = useState<string | null>(null);


  const [reportType, setReportType] = useState(REPORTS[0].value);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<{ value: string; label: string }[]>([]);
  const [emailTo, setEmailTo] = useState(user?.email || '');
  const [loading, setLoading] = useState(false);
  const [reportProductGroups, setReportProductGroups] = useState<Record<string, string[]>>({});
  const [selectedCompanies, setSelectedCompanies] = useState<{ value: string; label: string }[]>([]);

  const minuySochenOptions = [
    { value: 'true', label: 'כן' },
    { value: 'false', label: 'לא' },
  ];
  

  useEffect(() => {
    const fetchReportGroups = async () => {
      const q = query(collection(db, 'reportProductGroups'), where('isActive', '==', true));
      const snapshot = await getDocs(q);

      const mapping: Record<string, string[]> = {};
      snapshot.forEach((doc) => {
        const data = doc.data() as ReportProductGroup;
        if (data.reportType && Array.isArray(data.allowedProductGroups)) {
          mapping[data.reportType] = data.allowedProductGroups;
        }
      });

      setReportProductGroups(mapping);
    };

    fetchReportGroups();
  }, []);

  const filteredProducts = products.filter((product) => {
    const groupId = product.productGroup;
    const allowedGroups = reportProductGroups?.[reportType] ?? [];
    return allowedGroups.includes(String(groupId));
  });
  
  const productOptions = filteredProducts.map((product) => ({
    value: product.name,
    label: product.name,
  }));

  const handleSendReport = async () => {
    setLoading(true);
    try {
      const clean = (val: any) => (val === '' ? undefined : val);
  
      const payload = {
        reportType,
        fromDate,
        toDate,
        emailTo: (emailTo || '').trim(),
        uid: user?.uid,
        agentId: clean(selectedAgentId),
        agentName: clean(selectedAgentName),
        company: selectedCompanies.length > 0 ? selectedCompanies.map(c => c.value) : undefined,
        product: selectedProducts.length > 0 ? selectedProducts.map(p => p.value) : undefined,
        statusPolicy:
          selectedStatusPolicyFilter.length > 0 ? selectedStatusPolicyFilter : undefined,
        minuySochen:
          minuySochenFilter !== null ? minuySochenFilter === 'true' : undefined,
      };
  
      const res = await fetch('/api/sendReport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
  
      if (!res.ok) {
        let msg = 'שגיאה בשליחת הדוח';
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {/* ignore */}
        addToast('error', msg);
        return;
      }
  
      addToast('success', `הדוח נשלח בהצלחה לכתובת ${payload.emailTo}`);
    } catch (err) {
      // console.error(err);
      addToast('error', 'שגיאה בשליחת הדוח');
    } finally {
      setLoading(false);
    }
  };
  

  return (
    <div className="p-6 max-w-4xl mx-auto text-right">
      <h2 className="text-2xl font-bold mb-4">דוחות</h2>
      <p className="text-gray-600 mb-6">בחר את סוג הדוח, טווח התאריכים, סוכן, חברה ומוצר</p>

      <div className="mb-4">
        <label className="block font-semibold mb-1">בחר דוח:</label>
        <select
          value={reportType}
          onChange={(e) => setReportType(e.target.value)}
          className="select-input w-full"
        >
          {REPORTS.map((report) => (
            <option key={report.value} value={report.value}>{report.label}</option>
          ))}
        </select>
      </div>

      {/* <div className="mb-4">
        <label className="block font-semibold mb-1">טווח תאריכים:</label>
        <div className="flex gap-2">
          <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="input w-full" />
          <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="input w-full" />
        </div>
      </div> */}
      <div className="mb-4">
  <label className="block font-semibold mb-1">טווח תאריכי חודש תפוקה:</label>
  <div className="flex gap-2">
    <DatePicker
      selected={fromDate ? new Date(fromDate) : null}
      onChange={(date: Date | null) =>
        setFromDate(date ? date.toISOString().split('T')[0] : '')
      }
      placeholderText="מתאריך"
      className="input w-full"
      locale="he"
      dateFormat="dd/MM/yyyy"
      isClearable
    />
    <DatePicker
      selected={toDate ? new Date(toDate) : null}
      onChange={(date: Date | null) =>
        setToDate(date ? date.toISOString().split('T')[0] : '')
      }
      placeholderText="עד תאריך"
      className="input w-full"
      locale="he"
      dateFormat="dd/MM/yyyy"
      isClearable
    />
  </div>
</div>
      <div className="mb-4">
        <label className="block font-semibold mb-1">בחר סוכן:</label>
        <select onChange={handleAgentChange} value={selectedAgentId} className="select-input w-full">
          {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
          {detail?.role === 'admin' && <option value="all">כל הסוכנות</option>}
          {agents.map(agent => (
            <option key={agent.id} value={agent.id}>{agent.name}</option>
          ))}
        </select>
      </div>
      <div className="mb-4">
  <label className="block font-semibold mb-1">בחר חברות:</label>
  <Select
    isMulti
    options={companies.map(name => ({ value: name, label: name }))}
    value={selectedCompanies}
    onChange={(selected) => setSelectedCompanies(selected as any)}
    placeholder="בחר חברות"
    className="basic-multi-select"
    classNamePrefix="select"
  />
</div>
      <div className="mb-4">
        <label className="block font-semibold mb-1">בחר מוצר:</label>
        <Select
          isMulti
          options={productOptions}
          value={selectedProducts}
          onChange={(selected) => setSelectedProducts(selected as any)}
          placeholder="בחר מוצר"
          className="basic-multi-select"
          classNamePrefix="select"
        />
      </div>
      <div className="mb-4">
  <label className="block font-semibold mb-1">סטאטוס פוליסה:</label>
  <Select
    isMulti
    options={statusPolicies.map((status) => ({ value: status, label: status }))}
    value={selectedStatusPolicyFilter.map((status) => ({ value: status, label: status }))}
    onChange={(selectedOptions) =>
      setSelectedStatusPolicyFilter(selectedOptions.map((opt) => opt.value))
    }
    placeholder="בחר סטאטוס"
    className="basic-multi-select"
    classNamePrefix="select"
  />
</div>
<div className="mb-4">
  <label className="block font-semibold mb-1">מינוי סוכן:</label>
  <Select
    isClearable
    options={minuySochenOptions}
    value={minuySochenOptions.find(opt => opt.value === minuySochenFilter) || null}
    onChange={(selectedOption) => setMinuySochenFilter(selectedOption ? selectedOption.value : null)}
    placeholder="בחר מינוי סוכן"
    className="basic-single-select"
    classNamePrefix="select"
  />
</div>
      <div className="mb-4">
        <label className="block font-semibold mb-1">כתובת מייל למשלוח:</label>
        <input
          type="email"
          value={emailTo}
          onChange={(e) => setEmailTo(e.target.value)}
          className="input w-full"
        />
      </div>

      <Button
        onClick={handleSendReport}
        text={loading ? 'שולח דוח...' : 'שלח דוח'}
        type="primary"
        disabled={loading}
      />

      {toasts.length > 0 && toasts.map((toast) => (
        <ToastNotification
          key={toast.id}
          type={toast.type}
          className={toast.isHiding ? 'hide' : ''}
          message={toast.message}
          onClose={() => setToasts((prevToasts) => prevToasts.filter((t) => t.id !== toast.id))}
        />
      ))}
    </div>
  );
};

export default ReportsPage;
