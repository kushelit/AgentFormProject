'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/firebase/AuthContext';
import { db } from '@/lib/firebase/firebase';
import { doc, getDoc } from 'firebase/firestore';
import axios from 'axios';

export default function CancelSubscriptionPage() {
  const { user } = useAuth();
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchSubscriptionId = async () => {
      if (!user?.uid) return;
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        if (data.subscriptionId) {
          setSubscriptionId(data.subscriptionId);
        } else {
          setStatus('לא נמצא מנוי פעיל');
        }
      } else {
        setStatus('המשתמש לא נמצא');
      }
      setLoading(false);
    };

    fetchSubscriptionId();
  }, [user]);

  const handleCancel = async () => {
    if (!subscriptionId) return;
    setStatus('מבטל מנוי...');
    try {
      const res = await axios.post('/api/cancel-subscription', { subscriptionId });
      if (res.data.success) {
        setStatus('✅ המנוי בוטל בהצלחה');
      } else {
        setStatus('❌ לא הצלחנו לבטל את המנוי.');
      }
    } catch (err) {
      console.error(err);
      setStatus('❌ שגיאה בעת ביטול המנוי.');
    }
  };

  if (loading) {
    return <div className="p-4">טוען מידע...</div>;
  }

  return (
    <div className="max-w-md mx-auto mt-10 p-6 bg-white rounded-xl shadow text-right">
      <h2 className="text-2xl font-bold mb-4">ביטול מנוי</h2>
      {subscriptionId ? (
        <>
          <p className="mb-4">מזהה מנוי: <span className="font-mono">{subscriptionId}</span></p>
          <button
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
            onClick={handleCancel}
          >
            בטל מנוי
          </button>
        </>
      ) : (
        <p className="text-gray-600">אין מנוי פעיל</p>
      )}
      {status && <p className="mt-4 text-sm text-blue-800">{status}</p>}
    </div>
  );
}
