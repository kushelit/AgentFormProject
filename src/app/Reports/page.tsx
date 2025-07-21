import React, { useState } from 'react';
import { useAuth } from '@/lib/firebase/AuthContext';
import { Button } from '@/components/Button/Button';
import { ToastNotification } from '@/components/ToastNotification';
import { useToast } from '@/hooks/useToast';
import './ReportsPage.css';

const REPORTS = [
  { value: 'clientPremiumSummary', label: 'דוח פרמייה ללקוח' },
  // אפשר להוסיף דוחות נוספים כאן
];

const ReportsPage: React.FC = () => {
  const { user } = useAuth();
  const { toasts, addToast, setToasts } = useToast();
  const [reportType, setReportType] = useState('clientPremiumSummary');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [emailTo, setEmailTo] = useState(user?.email || '');
  const [loading, setLoading] = useState(false);

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
          idNumber,
          emailTo,
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
      <p className="text-gray-600 mb-6">בחר את סוג הדוח, טווח התאריכים והאם לשלוח ללקוח מסוים</p>

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

      <div className="mb-4">
        <label className="block font-semibold mb-1">תז (אופציונלי):</label>
        <input
          type="text"
          value={idNumber}
          onChange={(e) => setIdNumber(e.target.value)}
          className="input w-full"
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
