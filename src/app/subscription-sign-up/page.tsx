'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';

interface Plan {
  id: string;
  name: string;
  price: number;
  description: string;
  permissions: string[];
  maxUsers: number;
}

const permissionLabels: { [key: string]: string } = {
  access_agentForm: 'גישה מלאה לדף עסקאות',
  access_customer: 'גישה מלאה לדף לקוחות',
  access_summaryTable: 'גישה מלאה לדף ניהול עמלות',
  access_goals: 'גישה מלאה לדף ניהול יעדים',
  access_leads: 'גישה מלאה לדף ניהול לידים',
  access_workers: 'גישה מלאה לדף ניהול עובדים',
  access_permissions: 'גישנ מלאה לדף ניהול הרשאות',
};

export default function SubscriptionSignUpPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [withLeadsModule, setWithLeadsModule] = useState(false);
  const [extraWorkers, setExtraWorkers] = useState(0);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; email?: string; phone?: string }>({});
  const router = useRouter();

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await axios.get('/api/subscription-plans');
  
        // ✅ בדיקה לכל תוכנית
        res.data.forEach((plan: any, index: number) => {
          if (!plan.permissions || !Array.isArray(plan.permissions)) {
            console.warn(`⚠️ תוכנית [${plan.name || plan.id || index}] חסרה שדה permissions או שהוא לא מערך`);
          }
  
          if (typeof plan.name !== 'string' || typeof plan.price !== 'number') {
            console.warn(`⚠️ תוכנית [${plan.id || index}] עם שדות name או price לא תקינים`);
          }
        });
  
        setPlans(res.data);
        if (res.data.length > 0) {
          setSelectedPlan(res.data[0].id);
        }
      } catch (err) {
        console.error('שגיאה בטעינת מסלולים', err);
      }
    };
  
    fetchPlans();
  }, []);
  

  const calculateTotal = () => {
    const base = plans.find(p => p.id === selectedPlan)?.price || 0;
    const leadsPrice = withLeadsModule ? 29 : 0;
    const workersPrice = selectedPlan === 'pro' ? extraWorkers * 49 : 0;
    return base + leadsPrice + workersPrice;
  };

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
        addOns: {
          leadsModule: withLeadsModule,
          extraWorkers: selectedPlan === 'pro' ? extraWorkers : 0
        },
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {plans.map((plan) => (
            <div
              key={plan.id}
              onClick={() => setSelectedPlan(plan.id)}
              className={`cursor-pointer rounded-lg border p-4 shadow-md transition hover:shadow-xl text-right flex flex-col justify-between ${
                selectedPlan === plan.id ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
              }`}
            >
              <div>
                <h3 className="text-lg font-bold mb-2">{plan.name}</h3>
                <p className="text-sm text-gray-600 mb-3">
  כולל {plan.permissions?.length || 0} הרשאות, עד {plan.maxUsers || 1} משתמשים
</p>
                <ul className="text-sm text-gray-700 space-y-1 mt-2 pr-2">
                  {plan.permissions?.map((perm, index) => (
                    <li key={index} className="flex items-center gap-2">
                      <span className="text-green-600 font-bold">✓</span>
                      <span>{permissionLabels[perm] || perm}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="text-xl font-bold mt-4">₪{plan.price}</p>
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

        <div className="mt-6 space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={withLeadsModule} onChange={(e) => setWithLeadsModule(e.target.checked)} />
            מודול לידים (₪29)
          </label>

          <label className={`flex items-center gap-2 ${selectedPlan !== 'pro' ? 'opacity-50' : ''}`}>
            עובדים נוספים (₪49 לעובד):
            <input
              type="number"
              value={extraWorkers}
              min={0}
              disabled={selectedPlan !== 'pro'}
              onChange={(e) => setExtraWorkers(Number(e.target.value))}
              className="w-20 border rounded px-2 py-1 text-right"
            />
          </label>
        </div>

        <div className="font-bold text-lg">סה"כ לתשלום : ₪{calculateTotal()}</div>
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
