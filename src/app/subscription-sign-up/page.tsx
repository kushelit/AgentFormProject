'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PlansSection from '@/components/FeatureCard/PlansSection';


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
  // access_leads: 'גישה מלאה לדף ניהול לידים',
  access_workers: 'גישה מלאה לדף ניהול עובדים',
  access_permissions: 'גישנ מלאה לדף ניהול הרשאות',
  access_simulation: 'גישה מלאה לדף סימולציה',
  access_manageWorkers : 'גישה מלאה לדף ניהול עובדים',
  access_teamPermissionsTable : 'גישה מלאה לדף ניהול הרשאות עובדים',
  edit_permissions : 'עריכת הרשאות', 
  access_manageEnviorment : 'גישה מלאה לדף ניהול הגדרות לידים ',
  access_manageGoals : 'גישה מלאה לדף ניהול יעדים',
  access_manageContracts : 'גישה מלאה לדף ניהול הסכמים',
  access_viewCommissions : 'גישה מלאה לדף ניהול עמלות',
  access_helpsPages : 'גישה מלאה לדפי עזרה',
  view_commissions_field : 'צפייה בנתוני עמלות',
  access_flow : 'גישה מלאה לדף ניהול לידים ',
};

const planFeatures: { [key: string]: string[] } = {
  basic: [
    '✔️ ניהול עסקאות בצורה פשוטה ונוחה',
    '✔️ יצירה ועדכון של לקוחות ומשפחות',
    '✔️ צפייה בעמלות חודשיות וסיכומים כלליים',
    '✔️ ניהול לידים וקבלת לידים מממשקים חיצוניים',
    '✔️ ניהול יעדים',
    '✔️ שימוש בסימולטור לחישוב רווחים צפויים',
    '✔️ יבוא נתונים מקובצי אקסל',
    '✔️ מעקב גרפי אחר ביצועים',
    '✔️ מודול דוחות מתקדם',
  ],

  pro: [
    '✔️ כל מה שכלול בתוכנית Basic, ובנוסף:',
    '✔️ ניהול עובדים, כולל שיוך לסוכנים',
    '✔️ הקצאת הרשאות לפי תפקידים',
    '✔️ ניהול יעדים אישיים וקבוצתיים',
    '✔️ אפשרות להוספת עובדים נוספים לפי צורך',
    '✔️ מודול אינטיליגנטי לטעינת והשוואת עמלות מחברות הביטוח (המחיר כולל עד 2,000 לקוחות פעילים)',
  ],

  enterprise: [
    '✔️ כל מה שכלול בתוכנית Pro, ובנוסף:',
    '✔️ ניהול מתקדם של קבוצות וסוכנויות משנה',
    '✔️ התאמות מיוחדות לפי צרכי הארגון',
    '✔️ תמיכה טכנית מורחבת ומנהל לקוח אישי',
    '✔️ אפשרויות אינטגרציה מתקדמות למערכות חיצוניות',
    '📞 להצעת מחיר מותאמת – צרו איתנו קשר',
  ],
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
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; email?: string; phone?: string; idNumber?: string }>({});
  const router = useRouter();
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [idNumber, setIdNumber] = useState('');


  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await axios.get('/api/subscription-plans');
  
        // ✅ בדיקה לכל תוכנית
        res.data.forEach((plan: any, index: number) => {
          if (!plan.permissions || !Array.isArray(plan.permissions)) {
            // console.warn(`⚠️ תוכנית [${plan.name || plan.id || index}] חסרה שדה permissions או שהוא לא מערך`);
          }
  
          if (typeof plan.name !== 'string' || typeof plan.price !== 'number') {
            // console.warn(`⚠️ תוכנית [${plan.id || index}] עם שדות name או price לא תקינים`);
          }
        });
  
      setPlans(res.data);
if (res.data.length > 0) {
  const proPlan = res.data.find((p: Plan) => p.id === 'pro');
  setSelectedPlan(proPlan ? proPlan.id : res.data[0].id);
}
      } catch (err) {
        // console.error('שגיאה בטעינת מסלולים', err);
      } finally {
        setIsLoading(false); // חשוב! תמיד לסיים את הטעינה
      }
    };
  
    fetchPlans();
  }, []);
  
  const orderedPlanIds = ['basic', 'pro', 'enterprise'];
  const orderedPlans = [...plans].sort(
    (a, b) => orderedPlanIds.indexOf(a.id) - orderedPlanIds.indexOf(b.id)
  );
  
  const [discount, setDiscount] = useState(0);

  const checkCoupon = async (code: string, plan: string) => {
    if (!code) {
      setDiscount(0);
      setCouponError('');
      return;
    }
  
    try {
      const res = await axios.post('/api/validate-coupon', {
        couponCode: code.trim(),
        plan: plan
      });
  
      if (res.data.valid) {
        setDiscount(res.data.discount);
        setCouponError('');
      } else {
        setDiscount(0);
        setCouponError(res.data.reason || 'קוד הקופון אינו תקף');
      }
    } catch (err) {
      setDiscount(0);
      setCouponError('שגיאה בעת אימות קוד הקופון');
    }
  };
  
  
  useEffect(() => {
    checkCoupon(couponCode, selectedPlan);
  }, [couponCode, selectedPlan]);
  
  const calculateTotal = (discountValue: number = discount) => {

    if (selectedPlan === 'enterprise') {
      return 0;
    }
    
    const base = plans.find(p => p.id === selectedPlan)?.price || 0;
    const leadsPrice = withLeadsModule ? 29 : 0;
    const workersPrice = selectedPlan === 'pro' ? extraWorkers * 49 : 0;
  
    let total = base + leadsPrice + workersPrice;
  
    if (discountValue > 0) {
      const discountAmount = total * (discountValue / 100);
      total -= discountAmount;
    }
  
    if (total <= 0) total = 1;
    const VAT_RATE = 0.18; // 18% מע״מ
    total = total * (1 + VAT_RATE);
  
    return parseFloat(total.toFixed(2));
  };
  
  
 // בדיקת תקינות ת"ז / ח.פ
const isValidIsraeliIdOrCorp = (id: string) => {
  const cleanId = id.trim();
  if (!/^\d{5,10}$/.test(cleanId)) return false;

  const paddedId = cleanId.padStart(9, '0');
  let sum = 0;

  for (let i = 0; i < 9; i++) {
    let digit = Number(paddedId[i]) * ((i % 2) + 1);
    if (digit > 9) digit -= 9;
    sum += digit;
  }

  return sum % 10 === 0;
};

// בדיקת תקינות טלפון סלולרי ישראלי
const isValidIsraeliPhone = (phone: string) => {
  const cleanPhone = phone.replace(/\D/g, '');
  return /^05[0-9]{8}$/.test(cleanPhone);
};

const isValidFullName = (name: string) => {
  const parts = name.trim().split(/\s+/); // מחלק לפי רווחים
  return parts.length >= 2 && parts.every(part => part.length >= 2);
};



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    if (selectedPlan === 'enterprise') {
      setError('תוכנית Enterprise ניתנת לרכישה בהתאמה אישית בלבד. אנא צרו קשר להצעת מחיר.');
      return;
    }
    
    if (!acceptTerms) {
      setError('יש לאשר את תנאי השימוש לפני המשך התשלום.');
      return;
    }

    if (!isValidIsraeliIdOrCorp(idNumber)) {
      setFieldErrors(prev => ({ ...prev, idNumber: 'מספר ת"ז / ח.פ אינו תקין' }));
      return;
    }
    
    if (!isValidIsraeliPhone(phone)) {
      setFieldErrors(prev => ({ ...prev, phone: 'מספר טלפון נייד לא תקין' }));
      return;
    }
    if (!isValidFullName(fullName)) {
      setFieldErrors(prev => ({ ...prev, fullName: 'יש להזין שם מלא – לפחות שם פרטי ושם משפחה.' }));
      return;
    }
    
  
    try {

       // אימות קופון רק אם באמת הוזן קוד
    let finalDiscount = 0;
    const trimmedCoupon = couponCode.trim();

    if (trimmedCoupon) {
      try {
        const couponRes = await axios.post('/api/validate-coupon', {
          couponCode: trimmedCoupon,
          plan: selectedPlan,
        });
        finalDiscount = couponRes.data?.valid ? couponRes.data.discount : 0;
        setCouponError(
          couponRes.data?.valid ? '' : (couponRes.data?.reason || 'קוד הקופון אינו תקף')
        );
      } catch (e: any) {
        // לא מפילים את התשלום בגלל קופון – ממשיכים בלי הנחה
        finalDiscount = 0;
        setCouponError(e?.response?.data?.error || 'שגיאה בעת אימות קוד הקופון');
      }
    }
      // ⬇️ חישוב מחיר לפי ההנחה שהתקבלה הרגע
      const total = calculateTotal(finalDiscount);

      // לא שולחים couponCode אם הוא ריק
      const payload: any = {
        fullName,
        email,
        phone,
        idNumber,
        plan: selectedPlan,
        addOns: {
          leadsModule: withLeadsModule,
          extraWorkers: selectedPlan === 'pro' ? extraWorkers : 0,
        },
        total,
      };
      if (trimmedCoupon) {
        payload.couponCode = trimmedCoupon;
      }
  
      const res = await axios.post('/api/create-subscription', payload, {
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

      // console.error('❌ Error:', msg, 'Status:', status);

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
// מצב טעינה בלבד
if (isLoading || plans.length === 0) {
  return (
    <div className="flex justify-center items-center h-[60vh]">
      <div className="text-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-lg text-gray-600">טוען מסלולים...</p>
      </div>
    </div>
  );
}

    return (
    <div className="max-w-4xl mx-auto mt-10 bg-white shadow-lg rounded-xl p-6 text-right">
      <h2 className="text-2xl font-bold mb-6">הרשמה למנוי</h2>
      <p className="text-gray-600 text-sm mb-6">
  אתם עומדים לרכוש מנוי לשימוש חודשי במערכת <strong>MagicSale</strong> – מערכת לניהול סוכני ביטוח, הכוללת ניהול עסקאות, לקוחות, עמלות, עובדים, גרפים ויעדים.
</p>
      <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
      {orderedPlans.map((plan) => (
        <div
  key={plan.id}
  onClick={() => setSelectedPlan(plan.id)}
  className={`relative cursor-pointer rounded-lg border p-4 shadow-md transition hover:shadow-xl text-right flex flex-col justify-between h-full min-h-[420px] ${
    selectedPlan === plan.id
      ? plan.id === 'pro'
        ? 'border-2 border-blue-600 bg-blue-50 shadow-xl scale-[1.03] ring-2 ring-blue-300'
        : 'border-blue-500 bg-blue-50'
      : plan.id === 'enterprise'
      ? 'bg-purple-50 border-purple-400'
      : 'border-gray-300'
  }`}
>
         {/* תג הכי פופולרי */}
         {plan.id === 'pro' && (
           <div className="absolute top-2 left-2 bg-yellow-400 text-white text-xs font-bold px-2 py-1 rounded shadow">
             הכי פופולרי ⭐
           </div>
         )}
         {plan.id === 'enterprise' && (
  <div className="absolute top-2 left-2 bg-purple-600 text-white text-xs font-bold px-2 py-1 rounded shadow">
    מותאם לארגונים
  </div>
)}       
         <div>
           <h3 className="text-lg font-bold mb-2">{plan.name}</h3>
           <p className="text-sm text-gray-600 mb-3">
  {plan.id === 'basic' && 'מנוי לסוכן אחד בלבד'}
  {plan.id === 'pro' && 'מנוי לסוכן + עובד, ניתן להוסיף עובדים נוספים בתשלום'}
  {plan.id === 'enterprise' && 'מנוי מותאם אישית – יטופל בנפרד'}
</p>
           <ul className="text-sm text-gray-700 space-y-1 mt-2 pr-2">
             {planFeatures[plan.id]?.map((feature, index) => (
               <li key={index} className="flex items-center gap-2">
                 <span className="text-green-600 font-bold">
                   {feature.startsWith('📞') ? '📞' : '✔️'}
                 </span>
                 <span>{feature.replace(/^✔️ |^📞 /, '')}</span>
               </li>
             ))}
           </ul>
         </div>
       
         {/* מחיר */}
         {plan.id !== 'enterprise' && (
          <p className="text-xl font-bold mt-4">₪{plan.price} + מע&quot;מ</p>
         )}
       </div>       
          ))}
        </div>

        <div className="mt-6 space-y-2">
          {/* <label className="flex items-center gap-2">
            <input type="checkbox" checked={withLeadsModule} onChange={(e) => setWithLeadsModule(e.target.checked)} />
            מודול לידים (₪29)
          </label> */}

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
        <div>
        <label className="block mb-1 font-semibold">ת&apos;ז / ח.פ *</label>
        <input
    type="text"
    value={idNumber}
    onChange={(e) => setIdNumber(e.target.value)}
    className="w-full border border-gray-300 rounded px-3 py-2 text-right"
    required
  />
  {fieldErrors.idNumber && <p className="text-red-600 text-sm">{fieldErrors.idNumber}</p>}
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
        <div>
  <label className="block mb-1 font-semibold">קוד קופון</label>
  <input
  type="text"
  value={couponCode}
  onChange={(e) => {
    const value = e.target.value.trim();
    setCouponCode(value);
    checkCoupon(value, selectedPlan);
  }}
  className="w-full border border-gray-300 rounded px-3 py-2 text-right"
  placeholder="יש לך קופון?"
/>
</div>
<div className="flex items-center gap-2 mt-4">
  <input
    type="checkbox"
    id="acceptTerms"
    checked={acceptTerms}
    onChange={(e) => setAcceptTerms(e.target.checked)}
    className="w-4 h-4"
  />
  <label htmlFor="acceptTerms" className="text-sm text-gray-700">
    אני מאשר/ת שקראתי את <Link href="/terms" className="text-blue-700 underline">תנאי השימוש</Link>
  </label>
</div>
<div className="font-bold text-lg">
סה&quot;כ לתשלום (כולל מע&quot;מ): ₪{calculateTotal().toFixed(2)}
</div>
        {discount > 0 && (
  <p className="text-green-700 text-sm font-medium">
    קופון הנחה של {discount}% הופעל
  </p>
)}

        {error && <p className="text-red-600 text-sm font-semibold">{error}</p>}
        {couponError && <p className="text-red-600 text-sm mt-1">{couponError}</p>}
        {selectedPlan === 'enterprise' ? (
  <button
    type="button"
    onClick={() => router.push('/landing#contact')} // עדכני לנתיב הנכון שלך
    className="w-full bg-purple-600 text-white text-center py-2 rounded hover:bg-purple-700 transition font-semibold"
  >
    להצעת מחיר – צרו איתנו קשר
  </button>
) : (
  <button
    type="submit"
    className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
  >
    המשך לתשלום
  </button>
)}
      </form>
    </div>
   );
}
