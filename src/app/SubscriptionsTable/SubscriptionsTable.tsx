// File: /components/SubscriptionsTable.tsx
'use client';

import { useEffect, useState } from 'react';
import { getAllSubscriptions, cancelSubscription, sendFailureEmail } from "@/components/subscriptionActions/subscriptionActions";




export default function SubscriptionsTable() {
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
    alert('המייל נשלח בהצלחה');
  };

  const handleCancel = async (id: string, subscriptionId: string) => {
    if (!confirm('האם אתה בטוח שברצונך לבטל את המנוי?')) return;
    await cancelSubscription(id, subscriptionId);
    setSubscriptions(subs => subs.map(sub => sub.id === id ? { ...sub, subscriptionStatus: 'canceled', isActive: false } : sub));
  };

  if (loading) return <div className="p-4">⏳ טוען מנויים...</div>;

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold mb-4">ניהול מנויים</h1>
      <table className="min-w-full border">
        <thead className="bg-gray-100">
          <tr>
            <th className="border px-2 py-1">שם</th>
            <th className="border px-2 py-1">אימייל</th>
            <th className="border px-2 py-1">טלפון</th>
            <th className="border px-2 py-1">תאריך תשלום אחרון</th>
            <th className="border px-2 py-1">סטטוס תשלום</th>
            <th className="border px-2 py-1">סטטוס מנוי</th>
            <th className="border px-2 py-1">פעולות</th>
          </tr>
        </thead>
        <tbody>
          {subscriptions.map(sub => (
            <tr key={sub.id}>
              <td className="border px-2 py-1">{sub.name}</td>
              <td className="border px-2 py-1">{sub.email}</td>
              <td className="border px-2 py-1">{sub.phone}</td>
              <td className="border px-2 py-1">{sub.lastPaymentDate ? new Date(sub.lastPaymentDate.toDate()).toLocaleDateString() : '-'}</td>
              <td className="border px-2 py-1">{sub.lastPaymentStatus}</td>
              <td className="border px-2 py-1">{sub.subscriptionStatus}</td>
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
                  onClick={() => handleCancel(sub.id, sub.subscriptionId)}
                  disabled={sub.subscriptionStatus === 'canceled'}
                >
                  סגור מנוי
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
