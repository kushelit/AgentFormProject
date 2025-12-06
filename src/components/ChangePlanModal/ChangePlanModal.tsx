// ✅ ChangePlanModal.tsx – עדכני
'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from '@/hooks/useToast';
import { ToastNotification } from '@/components/ToastNotification';
import DialogNotification from '@/components/DialogNotification';

interface Plan {
  id: string;
  name: string;
  price: number;
  description: string;
  // אופציונלי אם מגיע מה-API שלך:
  permissions?: string[];
  maxUsers?: number;
}

interface ChangePlanModalProps {
  userId: string;
  transactionToken?: string;
  transactionId?: string;
  asmachta?: string;
  currentPlan?: string;
  currentAddOns?: {
    leadsModule?: boolean;
    extraWorkers?: number;
  };
  prefill?: {
    name?: string;
    email?: string;
    phone?: string;
    idNumber?: string;
  };
  onClose: () => void;
}

const planDescriptions: Record<string, string> = {
  basic: 'מנוי לסוכן אחד בלבד',
  pro: 'מנוי לסוכן +  עובד, ניתן להוסיף עובדים נוספים בתשלום',
  enterprise: 'מנוי מותאם אישית – יטופל בנפרד',
};
const planFeatures: Record<string, string[]> = {
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

export const ChangePlanModal: React.FC<ChangePlanModalProps> = ({
  userId,
  transactionToken,
  transactionId,
  asmachta,
  currentPlan,
  currentAddOns,
  prefill,
  onClose,
}) => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(currentPlan || null);
  const [withLeadsModule, setWithLeadsModule] = useState<boolean>(currentAddOns?.leadsModule ?? false);
  const [extraWorkers, setExtraWorkers] = useState<number>(currentAddOns?.extraWorkers ?? 0);

  const [couponCode, setCouponCode] = useState<string>('');
  const [discount, setDiscount] = useState<number>(0);
  const [couponError, setCouponError] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false);

  const { toasts, addToast, setToasts } = useToast();

  // האם יש הוראת קבע קיימת? (זרימה 2)
  const hasGrow = Boolean(transactionToken && transactionId && asmachta);

  // שדות השלמה לפופאפ (רק כשאין הוראת קבע קיימת)
  const [idNumberInput, setIdNumberInput] = useState<string>(prefill?.idNumber ?? '');
  const [phoneInput, setPhoneInput] = useState<string>(prefill?.phone ?? '');

  // שמירה על סנכרון אם ה-prefill השתנה
  useEffect(() => {
    setIdNumberInput(prefill?.idNumber ?? '');
    setPhoneInput(prefill?.phone ?? '');
  }, [prefill?.idNumber, prefill?.phone]);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await axios.get('/api/subscription-plans');
        setPlans(res.data);
        if (currentPlan && res.data.find((p: Plan) => p.id === currentPlan)) {
          setSelectedPlan(currentPlan);
        } else if (res.data.length > 0) {
          setSelectedPlan(res.data[0].id);
        }
      } catch (err) {
        // console.error('שגיאה בטעינת מסלולים', err);
      }
    };
    fetchPlans();
  }, [currentPlan]);

  useEffect(() => {
    if (selectedPlan !== 'pro') setExtraWorkers(0);
  }, [selectedPlan]);

  useEffect(() => {
    if (couponCode && selectedPlan) checkCoupon(couponCode, selectedPlan);
  }, [couponCode, selectedPlan]);

  const checkCoupon = async (code: string, plan: string) => {
    try {
      const res = await axios.post('/api/validate-coupon', {
        couponCode: code.trim(),
        plan,
      });
      if (res.data.valid) {
        setDiscount(res.data.discount);
        setCouponError('');
      } else {
        setDiscount(0);
        setCouponError(res.data.reason || 'קוד קופון לא תקף');
      }
    } catch {
      setDiscount(0);
      setCouponError('שגיאה בעת אימות קוד הקופון');
    }
  };

  const calculateTotal = () => {
    const base = plans.find((p) => p.id === selectedPlan)?.price || 0;
    const leadsPrice = withLeadsModule ? 29 : 0;
    const workersPrice = selectedPlan === 'pro' ? extraWorkers * 49 : 0;
    let total = base + leadsPrice + workersPrice;
    if (discount > 0) total -= total * (discount / 100);
    const VAT_RATE = 0.18;
    total *= 1 + VAT_RATE;
    return Math.max(1, parseFloat(total.toFixed(2)));
  };

  const handleConfirmUpgrade = async () => {
    if (!selectedPlan || !userId) return;

     // ❗ אם enterprise – לא משנים תוכנית בכלל
  if (selectedPlan === 'enterprise') {
    setShowConfirmDialog(false);
    return;
  }
    setLoading(true);
    try {
      if (hasGrow) {
        // זרימה 2 – עדכון הוראת קבע קיימת
        const res = await axios.post('/api/upgrade-plan', {
          id: userId,
          transactionToken,
          transactionId,
          asmachta,
          newPlanId: selectedPlan,
          couponCode,
          addOns: {
            leadsModule: withLeadsModule,
            extraWorkers: selectedPlan === 'pro' ? extraWorkers : 0,
          },
        });
        if (!res.data?.success) throw new Error('Grow update failed');
        addToast('success', 'המנוי עודכן בהצלחה');
        setTimeout(() => {
          onClose();
          window.location.reload();
        }, 1500);
      } else {
        // זרימה 3 – יצירת הוראת קבע חדשה למשתמש קיים (UID קיים)
        const { data } = await axios.post('/api/create-subscription', {
          existingUserUid: userId,                // ⭐ מקשר ל-UID הקיים
          source: 'existing-user-upgrade',        // ⭐ שה-webhook יידע לא ליצור יוזר
          plan: selectedPlan,
          addOns: {
            leadsModule: withLeadsModule,
            extraWorkers: selectedPlan === 'pro' ? extraWorkers : 0,
          },
          couponCode: couponCode?.trim() || undefined,
          // דואגים שהטופס של Grow יתמלא; השם יילקח מ-prefill בצד שרת
          fullName: prefill?.name,
          email: prefill?.email,
          phone: phoneInput || prefill?.phone,
          idNumber: idNumberInput || prefill?.idNumber,
        });

        if (data?.paymentUrl) {
          window.location.href = data.paymentUrl; // מעבר לתשלום ב-Grow
          return;
        }
        throw new Error('Missing paymentUrl');
      }
    } catch (err) {
      // console.error('שגיאה בעת שינוי התוכנית:', err);
      addToast('error', 'שגיאה בעדכון התוכנית');
    } finally {
      setLoading(false);
      setShowConfirmDialog(false);
    }
  };


  const order = ['basic', 'pro', 'enterprise'];
  const orderedPlans = React.useMemo(
    () => [...plans].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)),
    [plans]
  );


  if (!plans.length) {
    return <div className="p-6 text-center text-gray-500">⏳ טוען מסלולים...</div>;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-4xl w-full text-right p-6 overflow-y-auto max-h-[90vh]">
        <h2 className="text-2xl font-bold mb-6">שינוי תוכנית</h2>

        <div className="mb-6 bg-blue-50 border border-blue-200 p-3 rounded text-sm text-blue-800">
          <p className="font-semibold mb-1">מה יהיה כלול לאחר השינוי:</p>
          {selectedPlan && <p>✔ תוכנית: {plans.find((p) => p.id === selectedPlan)?.name}</p>}
          {selectedPlan === 'pro' && extraWorkers > 0 && <p>✔ {extraWorkers} עובדים נוספים</p>}
          {!withLeadsModule && (selectedPlan !== 'pro' || extraWorkers === 0) && <p>אין תוספים נוספים</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
  {orderedPlans.map((plan) => (
    <div
      key={plan.id}
      onClick={() => setSelectedPlan(plan.id)}
      className={`relative cursor-pointer rounded-lg border p-4 shadow-md transition hover:shadow-xl text-right flex flex-col justify-between min-h-[420px] ${
        selectedPlan === plan.id ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
      }`}
    >
      {/* תגים למעלה */}
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

      {/* תוכן עליון */}
      <div>
        <h3 className="text-lg font-bold mb-2">{plan.name}</h3>
        <p className="text-sm text-gray-600 mb-3">
          {plan.id === 'basic' && 'מנוי לסוכן אחד בלבד'}
          {plan.id === 'pro' && 'מנוי לסוכן + עובד, ניתן להוסיף עובדים נוספים בתשלום'}
          {plan.id === 'enterprise' && 'מנוי מותאם אישית – יטופל בנפרד'}
        </p>

        <ul className="text-sm text-gray-700 space-y-1 mt-2 pr-2">
          {planFeatures[plan.id]?.map((feature, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="text-green-600 font-bold">
                {feature.startsWith('📞') ? '📞' : '✔️'}
              </span>
              <span>{feature.replace(/^✔️ |^📞 /, '')}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* מחיר בתחתית */}
      {plan.id !== 'enterprise' && (
        <p className="text-xl font-bold mt-4 text-right">₪{plan.price} + מע&quot;מ</p>
      )}
    </div>
  ))}
</div>

        {selectedPlan !== 'enterprise' && (
  <div className="space-y-3">
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

    <div>
      <label className="block mb-1 font-semibold">קוד קופון</label>
      <input
        type="text"
        value={couponCode}
        onChange={(e) => setCouponCode(e.target.value)}
        className="w-full border border-gray-300 rounded px-3 py-2 text-right"
        placeholder="יש לך קופון?"
      />
      {couponError && <p className="text-red-600 text-sm mt-1">{couponError}</p>}
      {discount > 0 && (
        <p className="text-green-700 text-sm font-medium mt-1">קופון הנחה של {discount}% הופעל</p>
      )}
    </div>
  </div>
)}


        {/* השלמת פרטים רק כשאין הוראת קבע קיימת */}
        {!hasGrow && (
          <div className="space-y-3 mt-6 border rounded p-3 bg-gray-50">
            <p className="text-sm text-gray-700 font-semibold">השלמת פרטים לפתיחת הוראת קבע</p>

            <label className="block">
              <span className="block mb-1 font-semibold">ת״ז / ח״פ *</span>
              <input
                value={idNumberInput}
                onChange={(e) => setIdNumberInput(e.target.value)}
                className="w-full border rounded px-3 py-2 text-right"
                required
              />
            </label>

            <label className="block">
              <span className="block mb-1 font-semibold">טלפון נייד *</span>
              <input
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                className="w-full border rounded px-3 py-2 text-right"
                required
              />
            </label>
          </div>
        )}

<p className="font-bold text-lg mt-4">
  {selectedPlan === 'enterprise'
    ? 'להצעת מחיר – פנו אלינו'
    : `סה"כ לתשלום (כולל מע"מ): ₪${calculateTotal()}`}
</p>

<div className="flex justify-end gap-4 mt-6">
  {selectedPlan === 'enterprise' ? (
    <>
      <a
        href="https://wa.me/972553001487?text=%D7%94%D7%99%D7%99%2C%20%D7%9E%D7%A2%D7%95%D7%A0%D7%99%D7%99%D7%9F%2F%D7%AA%20%D7%91%D7%94%D7%A6%D7%A2%D7%AA%20%D7%9E%D7%97%D7%99%D7%A8%20%D7%9C%D7%AA%D7%95%D7%9B%D7%A0%D7%99%D7%AA%20Enterprise%20%D7%A9%D7%9C%20MagicSale"
        target="_blank"
        rel="noopener noreferrer"
        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
      >
        להצעת מחיר – דברו איתנו ב-WhatsApp
      </a>
      <a
        href="/landing#contact"
        className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition"
      >
        או – טופס יצירת קשר
      </a>
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition"
      >
        סגור
      </button>
    </>
  ) : (
    <>
      <button
        onClick={() => setShowConfirmDialog(true)}
        disabled={!selectedPlan || loading}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-60"
      >
        {loading ? 'טוען...' : 'החלף תוכנית'}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition"
      >
        סגור
      </button>
    </>
  )}
</div>
        {toasts.map((t) => (
          <ToastNotification
            key={t.id}
            type={t.type}
            className={t.isHiding ? 'hide' : ''}
            message={t.message}
            onClose={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
          />
        ))}

        {showConfirmDialog && (
          <DialogNotification
            type="warning"
            title="אישור שינוי תוכנית"
            message="האם את בטוחה שברצונך להחיל את שינוי התוכנית?"
            onConfirm={handleConfirmUpgrade}
            onCancel={() => setShowConfirmDialog(false)}
            confirmText="אישור"
            cancelText="ביטול"
          />
        )}
      </div>
    </div>
  );
};
