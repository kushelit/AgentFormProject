'use client';

import { useState } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

export default function SubscriptionSignUpPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; email?: string; phone?: string }>({});
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    try {
      const res = await axios.post('/api/create-subscription', {
        fullName,
        email,
        phone,
      }, {
        headers: { 'Content-Type': 'application/json' },
      });

      const { paymentUrl } = res.data;
      if (paymentUrl) {
        window.location.href = paymentUrl;
      } else {
        setError('אירעה שגיאה לא צפויה.');
      }

    } catch (err: any) {
      const msg = err?.response?.data?.error || 'שגיאה כללית';
      const status = err?.response?.status;

      console.error('❌ Error:', msg, 'Status:', status);

      // שגיאות לפי קוד HTTP
      if (status === 400) {
        if (msg.includes('שם מלא')) {
          setFieldErrors(prev => ({ ...prev, fullName: msg }));
        } else if (msg.includes('טלפון')) {
          setFieldErrors(prev => ({ ...prev, phone: msg }));
        } else {
          setError(msg);
        }
      } else if (status === 503 || status === 504) {
        setError(msg);
      } else {
        setError('אירעה שגיאה. אנא נסו שוב או פנו לתמיכה.');
      }
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
          {fieldErrors.fullName && <p className="text-red-600 text-sm">{fieldErrors.fullName}</p>}
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
          {fieldErrors.phone && <p className="text-red-600 text-sm">{fieldErrors.phone}</p>}
        </div>

        {error && <p className="text-red-600 text-sm font-semibold">{error}</p>}

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
