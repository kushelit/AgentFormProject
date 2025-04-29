'use client';

import { useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

export default function SubscriptionSignUpPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fullName || !email || !phone) {
      setError('אנא מלא/י את כל השדות הנדרשים');
      return;
    }

    try {
      console.log('📨 Sending subscription request:', { fullName, email, phone });

      const res = await axios.post('/api/create-subscription', {
        fullName,
        email,
        phone,
      }, {
        headers: { 'Content-Type': 'application/json' },
      });

      const { paymentUrl } = res.data;

      if (paymentUrl) {
        console.log('✅ Redirecting to payment URL:', paymentUrl);
        window.location.href = paymentUrl; // 👈 כאן משתמשים ב-window.location.href ולא ב-router.push
      } else {
        console.error('❌ No payment URL received:', res.data);
        setError('אירעה שגיאה בקבלת קישור לתשלום. נסה/י שוב.');
      }

    } catch (err: any) {
      console.error('❌ Subscription request failed:', err.message || err);
      setError('אירעה שגיאה. אנא נסה/י שוב או פנה/י לתמיכה.');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 bg-white shadow-lg rounded-xl p-6 text-right">
      <h2 className="text-2xl font-bold mb-4">הרשמה למנוי</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block mb-1 font-semibold">שם מלא *</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-right"
            required
          />
        </div>
        <div>
          <label className="block mb-1 font-semibold">אימייל *</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-right"
            required
          />
        </div>
        <div>
          <label className="block mb-1 font-semibold">טלפון *</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-right"
            required
          />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
        >
          המשך לתשלום
        </button>
      </form>
    </div>
  );
}
