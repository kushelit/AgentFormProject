'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/firebase/AuthContext';
import { Button } from '@/components/Button/Button';
import { ToastNotification } from '@/components/ToastNotification';
import { useToast } from '@/hooks/useToast';
import useFetchAgentData from "@/hooks/useFetchAgentData"; 
import useFetchMD from "@/hooks/useMD"; 

const REPORTS = [
  { value: 'insurancePremiumReport', label: 'דוח פרמיית ביטוח ללקוח' },
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

  const { products,productToGroupMap, productGroupMap } = useFetchMD();

  const [reportType, setReportType] = useState(REPORTS[0].value);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedProductFilter, setSelectedProductFilter] = useState('');
  const [emailTo, setEmailTo] = useState(user?.email || '');
  const [loading, setLoading] = useState(false);


// // בתוך ReportsPage.tsx → handleSendReport
// const insuranceProductNames = Object.entries(productToGroupMap)
//   .filter(([_, group]) => group === 'insurance') // או בעברית: 'ביטוח'
//   .map(([productName]) => productName);



  const handleSendReport = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/sendReport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportType,
          fromDate,
          toDate,
          emailTo,
          uid: user?.uid,
          agentId: selectedAgentId,
          agentName: selectedAgentName,
          company: selectedCompanyFilter,
          product: selectedProductFilter,
        //   insuranceProductNames,
        })
      });

      if (!res.ok) throw new Error('Report generation failed');

      addToast('success', `הדוח נשלח בהצלחה לכתובת ${emailTo}`);
    } catch (error) {
      console.error(error);
      addToast('error', 'שגיאה בשליחת הדוח');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto text-right">
      <h2 className="text-2xl font-bold mb-4">שליחת דוח</h2>
      <p className="text-gray-600 mb-6">בחר את סוג הדוח, טווח התאריכים, סוכן, חברה ומוצר</p>

      {/* סוג הדוח */}
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

      {/* טווח תאריכים */}
      <div className="mb-4">
        <label className="block font-semibold mb-1">טווח תאריכים:</label>
        <div className="flex gap-2">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="input w-full"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="input w-full"
          />
        </div>
      </div>

      {/* סוכן */}
      <div className="mb-4">
        <label className="block font-semibold mb-1">בחר סוכן:</label>
        <select
          onChange={handleAgentChange}
          value={selectedAgentId}
          className="select-input w-full"
        >
          {detail?.role === 'admin' && <option value="">בחר סוכן</option>}
          {detail?.role === 'admin' && <option value="all">כל הסוכנות</option>}
          {agents.map(agent => (
            <option key={agent.id} value={agent.id}>{agent.name}</option>
          ))}
        </select>
      </div>

      {/* חברה */}
      <div className="mb-4">
        <label className="block font-semibold mb-1">בחר חברה:</label>
        <select
          value={selectedCompanyFilter}
          onChange={(e) => setSelectedCompanyFilter(e.target.value)}
          className="select-input w-full"
        >
          <option value="">בחר חברה</option>
          {companies.map((companyName, index) => (
            <option key={index} value={companyName}>{companyName}</option>
          ))}
        </select>
      </div>

      {/* מוצר */}
      <div className="mb-4">
        <label className="block font-semibold mb-1">בחר מוצר:</label>
        <select
          value={selectedProductFilter}
          onChange={(e) => setSelectedProductFilter(e.target.value)}
          className="select-input w-full"
        >
          <option value="">בחר מוצר</option>
          {products.map(product => (
            <option key={product.id} value={product.name}>{product.name}</option>
          ))}
        </select>
      </div>

      {/* אימייל */}
      <div className="mb-4">
        <label className="block font-semibold mb-1">כתובת מייל למשלוח:</label>
        <input
          type="email"
          value={emailTo}
          onChange={(e) => setEmailTo(e.target.value)}
          className="input w-full"
        />
      </div>

      {/* כפתור */}
      <Button
        onClick={handleSendReport}
        text={loading ? 'שולח דוח...' : 'שלח דוח'}
        type="primary"
        disabled={loading}
      />

      {/* טוסטים */}
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
