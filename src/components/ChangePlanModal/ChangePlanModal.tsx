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
    extraCustomerBlocks?: number;
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
  pro: 'מנוי לסוכן + עובד, ניתן להוסיף עובדים נוספים בתשלום',
  enterprise: 'מנוי מותאם אישית – יטופל בנפרד',
  magic_touch: 'MagicTouch בלבד – כולל סוכן + עובד אחד',
  magic_suite: 'MagicSale Pro + MagicTouch – כולל סוכן + עובד אחד',
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
    '✔️ מודול אינטיליגנטי לטעינת והשוואת עמלות מחברות הביטוח',
    '✔️ המחיר כולל עד 2,000 לקוחות פעילים',
    '✔️ כל 2,000 לקוחות פעילים נוספים: 39 ₪ לחודש',
  ],

  magic_touch: [
    '✔️ ניהול תקשורת ותהליכים מול לקוחות',
    '✔️ עבודה עם WhatsApp כחלק מתהליך העבודה',
    '✔️ מעקב אחר אנשי קשר, שיחות ותהליכים במקום אחד',
    '✔️ חיבור לאינטגרציות ותהליכים אוטומטיים לפי הצורך',
    '✔️ כולל סוכן + עובד אחד',
    '✔️ אפשרות להוספת עובדים נוספים לפי צורך',
  ],

  magic_suite: [
    '✔️ כל מה שכלול במנוי MagicTouch',
    '✔️ כל מה שכלול במנוי MagicSale Pro',
    '✔️ ניהול עסקאות, לקוחות ועמלות',
    '✔️ ניהול עובדים והרשאות',
    '✔️ טעינה וניתוח של נתוני עמלות',
    '✔️ המחיר כולל עד 2,000 לקוחות פעילים',
    '✔️ כל 2,000 לקוחות פעילים נוספים: 39 ₪ לחודש',
    '✔️ כולל סוכן + עובד אחד',
    '✔️ אפשרות להוספת עובדים נוספים לפי צורך',
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
  const [extraCustomerBlocks, setExtraCustomerBlocks] = useState<number>(
    currentAddOns?.extraCustomerBlocks ?? 0
  );

  const [couponCode, setCouponCode] = useState<string>('');
  const [discount, setDiscount] = useState<number>(0);
  const [couponError, setCouponError] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false);

  const { toasts, addToast, setToasts } = useToast();

  // האם יש הוראת קבע קיימת? (זרימה 2)
  const hasGrow = Boolean(transactionToken && transactionId && asmachta);

  const supportsExtraWorkers = (planId: string | null | undefined) =>
    Boolean(
      planId &&
        ['pro', 'magic_touch', 'magic_suite'].includes(planId)
    );

  const supportsExtraCustomerBlocks = (
    planId: string | null | undefined
  ) =>
    Boolean(
      planId &&
        ['pro', 'magic_suite'].includes(planId)
    );

  const getAllowedPlanIds = (planId?: string) => {
    // מנוי MagicSale רגיל:
    // נשארים במשפחת MagicSale, עם אפשרות לשדרג לחבילה המשולבת.
    if (!planId || ['basic', 'pro', 'enterprise'].includes(planId)) {
      return ['basic', 'pro', 'enterprise', 'magic_suite'];
    }

    // MagicTouch בלבד:
    // ניתן להישאר ב-Touch או לשדרג לחבילה המשולבת.
    if (planId === 'magic_touch') {
      return ['magic_touch', 'magic_suite'];
    }

    // חבילה משולבת:
    // ניתן להישאר משולב, לרדת ל-MagicTouch בלבד,
    // או להישאר עם MagicSale Pro בלבד.
    if (planId === 'magic_suite') {
      return ['magic_suite', 'magic_touch', 'pro'];
    }

    return [planId];
  };

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

        const allPlans: Plan[] = Array.isArray(res.data)
          ? res.data
          : [];

        const allowedIds = getAllowedPlanIds(currentPlan);

        const visiblePlans = allPlans.filter((plan) =>
          allowedIds.includes(plan.id)
        );

        setPlans(visiblePlans);

        if (
          currentPlan &&
          visiblePlans.find((plan) => plan.id === currentPlan)
        ) {
          setSelectedPlan(currentPlan);
        } else if (visiblePlans.length > 0) {
          setSelectedPlan(visiblePlans[0].id);
        }
      } catch (err) {
        // console.error('שגיאה בטעינת מסלולים', err);
      }
    };

    fetchPlans();
  }, [currentPlan]);

  useEffect(() => {
    if (!supportsExtraWorkers(selectedPlan)) {
      setExtraWorkers(0);
    }

    if (!supportsExtraCustomerBlocks(selectedPlan)) {
      setExtraCustomerBlocks(0);
    }
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
    const workersPrice = supportsExtraWorkers(selectedPlan)
      ? extraWorkers * 49
      : 0;

    const customerBlocksPrice = supportsExtraCustomerBlocks(selectedPlan)
      ? extraCustomerBlocks * 39
      : 0;

    let total = base + leadsPrice + workersPrice + customerBlocksPrice;
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
            extraWorkers: supportsExtraWorkers(selectedPlan) ? extraWorkers : 0,
            extraCustomerBlocks: supportsExtraCustomerBlocks(selectedPlan)
              ? extraCustomerBlocks
              : 0,
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
            extraWorkers: supportsExtraWorkers(selectedPlan) ? extraWorkers : 0,
            extraCustomerBlocks: supportsExtraCustomerBlocks(selectedPlan)
              ? extraCustomerBlocks
              : 0,
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
    } catch (err: any) {
  //     const e = err as any;
  // console.log('upgrade status:', e?.response?.status);
  // console.log('upgrade data:', e?.response?.data); 
       addToast('error', 'שגיאה בעדכון התוכנית');
    } finally {
      setLoading(false);
      setShowConfirmDialog(false);
    }
  };


  const order = [
    'basic',
    'pro',
    'enterprise',
    'magic_touch',
    'magic_suite',
  ];

  const orderedPlans = React.useMemo(
    () =>
      [...plans].sort(
        (a, b) => order.indexOf(a.id) - order.indexOf(b.id)
      ),
    [plans]
  );


  if (!plans.length) {
    return <div className="p-6 text-center text-gray-500">⏳ טוען מסלולים...</div>;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-6xl w-full text-right p-6 overflow-y-auto max-h-[90vh]">
        <h2 className="text-2xl font-bold mb-6">שינוי תוכנית</h2>

        <div className="mb-6 bg-blue-50 border border-blue-200 p-3 rounded text-sm text-blue-800">
          <p className="font-semibold mb-1">מה יהיה כלול לאחר השינוי:</p>
          {selectedPlan && <p>✔ תוכנית: {plans.find((p) => p.id === selectedPlan)?.name}</p>}
          {supportsExtraWorkers(selectedPlan) && extraWorkers > 0 && (
            <p>✔ {extraWorkers} עובדים נוספים</p>
          )}

          {supportsExtraCustomerBlocks(selectedPlan) &&
            extraCustomerBlocks > 0 && (
              <p>
                ✔ הרחבת קיבולת ל־
                {(1 + extraCustomerBlocks) * 2000}
                {' '}לקוחות פעילים
              </p>
            )}

          {!withLeadsModule &&
            (!supportsExtraWorkers(selectedPlan) || extraWorkers === 0) &&
            (!supportsExtraCustomerBlocks(selectedPlan) ||
              extraCustomerBlocks === 0) && (
              <p>אין תוספים נוספים</p>
            )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
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

      {plan.id === 'magic_touch' && (
        <div className="absolute top-2 left-2 bg-cyan-600 text-white text-xs font-bold px-2 py-1 rounded shadow">
          MagicTouch
        </div>
      )}

   {plan.id === 'magic_suite' && (
  <div
    className="
      absolute
      -top-3
      left-3
      z-10
      rounded-md
      bg-indigo-600
      px-2.5
      py-1
      text-xs
      font-semibold
      text-white
      shadow
    "
  >
    משולב
  </div>
)}
{/* תוכן עליון */}
<div>
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="text-lg font-bold">{plan.name}</h3>

          {plan.id === currentPlan && (
            <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              המסלול הנוכחי
            </span>
          )}

        </div>
        <p className="text-sm text-gray-600 mb-3">
          {planDescriptions[plan.id] || plan.description}
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
    <label
      className={`flex items-center gap-2 ${
        !supportsExtraWorkers(selectedPlan) ? 'opacity-50' : ''
      }`}
    >
      עובדים נוספים (₪49 לעובד):
      <input
        type="number"
        value={extraWorkers}
        min={0}
        disabled={!supportsExtraWorkers(selectedPlan)}
        onChange={(e) =>
          setExtraWorkers(Math.max(0, Number(e.target.value) || 0))
        }
        className="w-20 border rounded px-2 py-1 text-right"
      />
    </label>

    <div
      className={`rounded-lg border p-3 ${
        supportsExtraCustomerBlocks(selectedPlan)
          ? 'border-slate-200 bg-slate-50'
          : 'border-slate-100 bg-slate-50/50 opacity-50'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-800">
            הרחבת כמות לקוחות פעילים
          </div>

          <div className="mt-1 text-xs leading-5 text-slate-500">
            מנוי Pro כולל עד 2,000 לקוחות פעילים.
            כל תוספת של עד 2,000 לקוחות פעילים נוספים היא 39 ₪ לחודש.
            החל מהלקוח ה־2,001 נדרשת הרחבה אחת.
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">
            חבילות נוספות:
          </span>

          <input
            type="number"
            value={extraCustomerBlocks}
            min={0}
            disabled={!supportsExtraCustomerBlocks(selectedPlan)}
            onChange={(e) =>
              setExtraCustomerBlocks(
                Math.max(0, Number(e.target.value) || 0)
              )
            }
            className="w-20 border rounded px-2 py-1 text-right"
          />
        </div>
      </div>

      {supportsExtraCustomerBlocks(selectedPlan) && (
        <div className="mt-2 text-xs font-medium text-blue-700">
          קיבולת כוללת לאחר ההרחבה:{' '}
          {(1 + extraCustomerBlocks) * 2000}
          {' '}לקוחות פעילים
        </div>
      )}
    </div>

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
