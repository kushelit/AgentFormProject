
'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

interface Plan {
  id: string;
  name: string;
  price: number;
  description: string;
}

export default function SubscriptionSignUpPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; email?: string; phone?: string }>({});
  const router = useRouter();

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await axios.get('/api/subscription-plans'); // צריך לבנות API שמחזיר את הנתונים מ־Firestore
        setPlans(res.data);
        if (res.data.length > 0) {
          setSelectedPlan(res.data[0].id); // בחר את המסלול הראשון כברירת מחדל
        }
      } catch (err) {
        console.error('שגיאה בטעינת מסלולים', err);
      }
    };

    fetchPlans();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    try {
      const res = await axios.post('/api/create-subscription', {
        fullName,
        email,
        phone,
        plan: selectedPlan,
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
    <div className="max-w-4xl mx-auto mt-10 bg-white shadow-lg rounded-xl p-6 text-right">
      <h2 className="text-2xl font-bold mb-6">הרשמה למנוי</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              className={`cursor-pointer rounded-lg border p-4 shadow-md transition hover:shadow-xl text-right ${
                selectedPlan === plan.id ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
              }`}
            >
              <h3 className="text-lg font-bold mb-2">{plan.name}</h3>
              <p className="text-sm text-gray-600 mb-3">{plan.description}</p>
              <p className="text-xl font-bold">₪{plan.price}</p>
            </div>
          ))}
        </div>

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
