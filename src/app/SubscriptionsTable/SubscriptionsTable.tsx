'use client';

import { useEffect, useState } from 'react';
import { getAllSubscriptions, cancelSubscription, sendFailureEmail } from "@/components/subscriptionActions/subscriptionActions";
import { ToastNotification } from '@/components/ToastNotification';
import { useToast } from "@/hooks/useToast";

export default function SubscriptionsTable() {
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all');

  const { toasts, addToast, setToasts } = useToast();

  useEffect(() => {
    const fetchSubscriptions = async () => {
      const data = await getAllSubscriptions();
      setSubscriptions(data);
      setLoading(false);
    };
    fetchSubscriptions();
  }, []);

  const handleSendFailureEmail = async (email: string, name: string) => {
    await sendFailureEmail(email, name);
    addToast('success', `המייל נשלח ל־${name}`);
  };

  const handleCancel = async (id: string, subscriptionId: string, transactionToken?: string) => {
    console.log('📦 ביטול מנוי:', { id, subscriptionId, transactionToken });
    if (!confirm('האם אתה בטוח שברצונך לבטל את המנוי?')) return;

    try {
      const result = await cancelSubscription(id, subscriptionId, transactionToken );
      setSubscriptions(subs =>
        subs.map(sub =>
          sub.id === id ? { ...sub, subscriptionStatus: 'canceled', isActive: false } : sub
        )
      );

      if (result?.growCanceled) {
        addToast('success', 'המנוי בוטל גם במערכת וגם ב־Grow');
      } else if (result?.message) {
        addToast(
          'warning',
          typeof result.message === 'string'
            ? result.message
            : JSON.stringify(result.message)
        );
              } else {
        addToast('success', 'המנוי בוטל במערכת');
      }
    } catch (error: any) {
      addToast(
        'error',
        typeof error.message === 'string'
          ? error.message
          : error.message?.message || '❌ שגיאה כללית לא צפויה'
      );
          }
  };

  const filteredSubscriptions = subscriptions.filter(sub => {
    if (filterActive === 'all') return true;
    if (filterActive === 'active') return sub.isActive === true;
    if (filterActive === 'inactive') return sub.isActive === false;
    return true;
  });

  if (loading) return <div className="p-4">⏳ טוען מנויים...</div>;

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">ניהול מנויים</h1>

      {/* סינון לפי סטטוס פעיל */}
      <div className="mb-4">
        <label className="mr-2 font-semibold">סינון לפי סטטוס:</label>
        <select
          className="border px-2 py-1 rounded"
          value={filterActive}
          onChange={(e) => setFilterActive(e.target.value as 'all' | 'active' | 'inactive')}
        >
          <option value="all">כל המשתמשים</option>
          <option value="active">פעילים בלבד</option>
          <option value="inactive">לא פעילים בלבד</option>
        </select>
      </div>

      <table className="min-w-full border">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1">שם</th>
            <th className="border px-2 py-1">אימייל</th>
            <th className="border px-2 py-1">טלפון</th>
            <th className="border px-2 py-1">תאריך תשלום אחרון</th>
            <th className="border px-2 py-1">סטטוס תשלום</th>
            <th className="border px-2 py-1">סטטוס מנוי</th>
            <th className="border px-2 py-1">מספר עסקה</th>
            <th className="border px-2 py-1">פעיל?</th>
            <th className="border px-2 py-1">פעולות</th>
          </tr>
        </thead>
        <tbody>
          {filteredSubscriptions.map(sub => (
            <tr key={sub.id}>
              <td className="border px-2 py-1">{sub.name}</td>
              <td className="border px-2 py-1">{sub.email}</td>
              <td className="border px-2 py-1">{sub.phone}</td>
              <td className="border px-2 py-1">{sub.lastPaymentDate || '-'}</td>
              <td className="border px-2 py-1">{sub.lastPaymentStatus}</td>
              <td className="border px-2 py-1">{sub.subscriptionStatus}</td>
              <td className="border px-2 py-1 font-mono text-xs break-all">
                {sub.transactionId || '-'}
              </td>
              <td className="border px-2 py-1 text-center">
  <span
    className={`inline-block px-2 py-1 rounded-full text-xs font-semibold 
      ${sub.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}
  >
    {sub.isActive ? 'פעיל' : 'לא פעיל'}
  </span>
</td>
              <td className="border px-2 py-1 text-sm space-x-2">
                <button
                  className="bg-yellow-300 px-2 py-1 rounded"
                  onClick={() => handleSendFailureEmail(sub.email, sub.name)}
                  disabled={sub.subscriptionStatus === 'canceled'}
                >
                  שלח מייל כשלון
                </button>
                <button
                  className="bg-red-400 px-2 py-1 rounded text-white"
                  onClick={() => handleCancel(sub.id, sub.subscriptionId, sub.transactionToken)}
                  disabled={sub.subscriptionStatus === 'canceled'}
                >
                  סגור מנוי
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* טוסטים */}
      {toasts.length > 0 && toasts.map((toast) => (
        <ToastNotification
          key={toast.id}
          type={toast.type}
          className={toast.isHiding ? "hide" : ""}
          message={toast.message}
          onClose={() => setToasts((prevToasts) => prevToasts.filter((t) => t.id !== toast.id))}
        />
      ))}
    </div>
  );
}
