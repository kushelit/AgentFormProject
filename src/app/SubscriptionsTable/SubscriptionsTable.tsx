// app/admin/subscriptions/page.tsx
'use client';

import { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { ToastNotification } from '@/components/ToastNotification';
import { useToast } from '@/hooks/useToast';
import { ChangePlanModal } from '@/components/ChangePlanModal/ChangePlanModal'; // 👈 מסלול לפי איפה שמיקמת אותו
import AdminGuard from '@/app/admin/_components/AdminGuard'; // אם יש לך כזה


type AddOns = {
  leadsModule?: boolean;
  extraWorkers?: number;
};


type SubscriptionRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  isActive: boolean;
  idNumber?: string;

  subscriptionType: string;
  subscriptionStatus: string;
  subscriptionId: string;
  subscriptionStartDate?: string;
  lastPlanChangeDate?: string;
  lastPaymentDate?: string;
  lastPaymentStatus?: string;
  totalCharged?: number | null;
  futureChargeAmount?: number | null;

  cancellationDate?: string;
  growCancellationStatus?: string;
  wasRefunded?: boolean;
  refundDate?: string;

  usedCouponCode?: string;

  couponUsed?: {
    code: string;
    discount: number;
    // ישן - קיים אצלך היום
    date?: any;
    // חדש - נכניס מעכשיו
    appliedAt?: any;
    expiresAt?: any;
    lastNotifiedAt?: any;
    notifyFlags?: { d14?: boolean; d7?: boolean; d3?: boolean; d1?: boolean; expired?: boolean };
  } | null;
  
    agencies?: any;

  transactionId?: string;
  transactionToken?: string;
  asmachta?: string;
  addOns?: AddOns;
};

type FilterActive = 'all' | 'active' | 'inactive';
type FilterSubStatus = 'all' | 'ok' | 'failed' | 'canceled';


type FilterGrow = 'all' | 'missing';
type FilterCoupon = 'all' | 'with';

type KpiKey =
  | 'total'
  | 'active'
  | 'inactive'
  | 'failed'
  | 'canceled'
  | 'missingGrow'
  | 'withCoupon';


export default function SubscriptionsAdminPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterActive, setFilterActive] = useState<FilterActive>('all');
  const [filterSubStatus, setFilterSubStatus] = useState<FilterSubStatus>('all');
  const [filterPlan, setFilterPlan] = useState<string>('all');
  const [search, setSearch] = useState('');

  const [selectedForChange, setSelectedForChange] = useState<SubscriptionRow | null>(null);

  const { toasts, addToast, setToasts } = useToast();
  const [errorShown, setErrorShown] = useState(false);


const [couponEmailTarget, setCouponEmailTarget] = useState<SubscriptionRow | null>(null);
const [couponEmailSubject, setCouponEmailSubject] = useState('');
const [couponEmailBody, setCouponEmailBody] = useState('');
const [couponEmailSending, setCouponEmailSending] = useState(false);




const [filterGrow, setFilterGrow] = useState<FilterGrow>('all');
const [filterCoupon, setFilterCoupon] = useState<FilterCoupon>('all');


  useEffect(() => {
    let cancelled = false;
  
    const fetchSubscriptions = async () => {
      try {
        const { data } = await axios.get<SubscriptionRow[]>('/api/subscriptions');
        if (!cancelled) {
          setSubscriptions(data);
        }
      } catch (e) {
        if (!cancelled && !errorShown) {
          addToast('error', 'שגיאה בטעינת המנויים');
          setErrorShown(true);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
  
    fetchSubscriptions();
  
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSendFailureEmail = async (email: string, name: string) => {
    try {
      await axios.post('/api/sendFailureEmail', { email, name }); // אם יש לך כזה
      addToast('success', `המייל נשלח ל־${name}`);
    } catch {
      addToast('error', 'שגיאה בשליחת המייל');
    }
  };

  const handleCancel = async (sub: SubscriptionRow) => {
    if (!confirm(`האם לבטל את המנוי של ${sub.name}?`)) return;

    try {
      const { data } = await axios.post('/api/cancelSubscription', {
        id: sub.id,
        subscriptionId: sub.subscriptionId,
        transactionToken: sub.transactionToken,
        transactionId: sub.transactionId,
        asmachta: sub.asmachta,
        sendCancelEmail: true,
        updates: {}, // אם תרצי שדות נוספים – אפשר להעביר כאן
      });

      setSubscriptions(prev =>
        prev.map(s =>
          s.id === sub.id
            ? {
                ...s,
                subscriptionStatus: 'canceled',
                isActive: false,
                growCancellationStatus: data?.growCanceled ? 'success' : s.growCancellationStatus,
              }
            : s
        )
      );

      if (data?.growCanceled) {
        addToast('success', 'המנוי בוטל גם במערכת וגם ב-Grow');
      } else {
        addToast('success', data?.message || 'המנוי בוטל במערכת');
      }
    } catch (e: any) {
      addToast('error', e?.response?.data?.error || 'שגיאה בביטול המנוי');
    }
  };

  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter((sub) => {
      // 1) סינון פעיל / לא פעיל
      if (filterActive === 'active' && !sub.isActive) return false;
      if (filterActive === 'inactive' && sub.isActive) return false;
  
      // 2) סינון סטטוס מנוי
      if (filterSubStatus === 'ok') {
        if (!['active', ''].includes(sub.subscriptionStatus)) return false;
      }
      if (filterSubStatus === 'failed') {
        if (sub.lastPaymentStatus !== 'failed') return false;
      }
      if (filterSubStatus === 'canceled') {
        if (sub.subscriptionStatus !== 'canceled') return false;
      }
  
      // 3) סינון תוכנית
      if (filterPlan !== 'all' && sub.subscriptionType !== filterPlan) return false;
  
      // 4) ✅ סינון Grow
      if (filterGrow === 'missing') {
        const hasGrow = Boolean(sub.transactionToken && sub.transactionId && sub.asmachta);
        if (hasGrow) return false;
      }
  
      // 5) ✅ סינון קופון
      if (filterCoupon === 'with') {
        const hasCoupon = Boolean(sub.usedCouponCode || sub.couponUsed?.code);
        if (!hasCoupon) return false;
      }
  
      // 6) חיפוש
      if (search.trim()) {
        const s = search.trim().toLowerCase();
        const haystack = [
          sub.name,
          sub.email,
          sub.phone,
          sub.subscriptionId,
          sub.transactionId,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
  
        if (!haystack.includes(s)) return false;
      }
  
      return true;
    });
  }, [
    subscriptions,
    filterActive,
    filterSubStatus,
    filterPlan,
    filterGrow,
    filterCoupon,
    search,
  ]);
  



  const hasGrow = (sub: SubscriptionRow) =>
    Boolean(sub.transactionToken && sub.transactionId && sub.asmachta);
  
  const hasCoupon = (sub: SubscriptionRow) =>
    Boolean(sub.usedCouponCode || sub.couponUsed?.code);
  



  const openCouponEmailModal = (sub: SubscriptionRow) => {
    setCouponEmailTarget(sub);
  
    const code = sub.couponUsed?.code || sub.usedCouponCode || '';
    const discount = sub.couponUsed?.discount;
    const niceDiscount = typeof discount === 'number' ? ` (${discount}%)` : '';
  
    setCouponEmailSubject('תזכורת – הקופון שלך ל־MagicSale עומד לפוג');
  
    setCouponEmailBody(
  `שלום ${sub.name},
  
  רק מזכירים שהקופון שלך${code ? ` ${code}${niceDiscount}` : ''} עומד לפוג בקרוב.
  
  לאחר פקיעת הקופון, המחיר יעודכן באופן אוטומטי למחיר המלא של XX ₪ לחודש.
    
  לשאלות או עזרה – אפשר להשיב למייל זה או ליצור קשר עם צוות MagicSale.
  
  בברכה,
  צוות MagicSale`
    );
  };
  
  const handleSendCouponEmail = async () => {
    if (!couponEmailTarget) return;
    if (!couponEmailSubject.trim() || !couponEmailBody.trim()) {
      addToast('error', 'נא למלא נושא ותוכן למייל');
      return;
    }
  
    try {
      setCouponEmailSending(true);
  
      await axios.post('/api/sendEmail', {
        to: couponEmailTarget.email,
        subject: couponEmailSubject.trim(),
        html: couponEmailBody.replace(/\n/g, '<br>'),
      });
  
      addToast('success', `המייל נשלח ל־${couponEmailTarget.name}`);
      setCouponEmailTarget(null); // סגירת מודאל
    } catch (e: any) {
      addToast('error', e?.response?.data?.error || 'שגיאה בשליחת מייל הקופון');
    } finally {
      setCouponEmailSending(false);
    }
  };

  const handleChangePaymentMethod = async (sub: SubscriptionRow) => {
    if (!sub.subscriptionType) {
      addToast('error', 'לא נמצאה תוכנית למנוי הזה');
      return;
    }
  
    if (!confirm(`לפתוח תהליך עדכון אמצעי תשלום עבור ${sub.name}?`)) return;
  
    try {
      // משתמשים ב־/api/create-subscription הקיים
      const { data } = await axios.post('/api/create-subscription', {
        existingUserUid: sub.id,              // ⭐ משתמש קיים
        source: 'existing-user-upgrade',      // אפשר גם 'payment-method-change' אם תטפלי בזה ב-webhook
        plan: sub.subscriptionType,           // נשאר באותה תוכנית
        addOns: sub.addOns || {},             // אותם תוספים קיימים
        couponCode: sub.usedCouponCode || sub.couponUsed?.code || undefined,
  
        // פרטי זיהוי – אם חסר משהו, ה־API שלך משלים מה-DB
        fullName: sub.name,
        email: sub.email,
        phone: sub.phone,
        idNumber: sub.idNumber,
      });
  
      if (data?.paymentUrl) {
        // מעבירים את הלקוח לעמוד של Grow לעדכון אמצעי התשלום
        window.location.href = data.paymentUrl;
      } else {
        addToast('error', 'לא התקבל קישור לעדכון אמצעי התשלום');
      }
    } catch (e: any) {
      addToast('error', e?.response?.data?.error || 'שגיאה בפתיחת תהליך עדכון התשלום');
    }
  };
  
  const kpi = useMemo(() => {
    const total = filteredSubscriptions.length;
  
    const active = filteredSubscriptions.filter(s => s.isActive).length;
    const inactive = total - active;
  
    const failed = filteredSubscriptions.filter(s => s.lastPaymentStatus === 'failed').length;
    const canceled = filteredSubscriptions.filter(s => s.subscriptionStatus === 'canceled').length;
  
    const missingGrow = filteredSubscriptions.filter(s => !hasGrow(s)).length;
    const withCoupon = filteredSubscriptions.filter(s => hasCoupon(s)).length;
  
    return {
      total,
      active,
      inactive,
      failed,
      canceled,
      missingGrow,
      withCoupon,
    };
  }, [filteredSubscriptions]);
  



const isTotalSelected =
  filterActive === 'all' &&
  filterSubStatus === 'all' &&
  filterPlan === 'all' &&
  !search.trim() &&
  filterGrow === 'all' &&
  filterCoupon === 'all';

  const isActiveSelected = filterActive === 'active' && filterSubStatus === 'all';
  const isInactiveSelected = filterActive === 'inactive' && filterSubStatus === 'all';  
const isFailedSelected = filterSubStatus === 'failed';
const isCanceledSelected = filterSubStatus === 'canceled';
const isMissingGrowSelected = filterGrow === 'missing';
const isWithCouponSelected = filterCoupon === 'with';

const resetFilters = () => {
  setFilterActive('all');
  setFilterSubStatus('all');
  setFilterPlan('all');
  setSearch('');
  setFilterGrow('all');
  setFilterCoupon('all');
};

const applyKpi = (key: KpiKey) => {
  // ✅ טוגל: אם כבר נבחר — איפוס
  const alreadySelected =
    (key === 'total' && isTotalSelected) ||
    (key === 'active' && isActiveSelected) ||
    (key === 'inactive' && isInactiveSelected) ||
    (key === 'failed' && isFailedSelected) ||
    (key === 'canceled' && isCanceledSelected) ||
    (key === 'missingGrow' && isMissingGrowSelected) ||
    (key === 'withCoupon' && isWithCouponSelected);

  if (alreadySelected) {
    resetFilters();
    return;
  }

  // ברירת מחדל: לא לגעת בחיפוש, אבל לאפס את הפילטרים ה"מיוחדים"
  setFilterGrow('all');
  setFilterCoupon('all');

  switch (key) {
    case 'total':
      resetFilters();
      return;

    case 'active':
      setFilterActive('active');
      setFilterSubStatus('all');
      return;

    case 'inactive':
      setFilterActive('inactive');
      setFilterSubStatus('all');
      return;

    case 'failed':
      setFilterSubStatus('failed');
      return;

    case 'canceled':
      setFilterSubStatus('canceled');
      return;

    case 'missingGrow':
      setFilterGrow('missing');
      return;

    case 'withCoupon':
      setFilterCoupon('with');
      return;
  }
};

const formatDateOnly = (value: any) => {
  if (!value) return '';

  // Firestore Timestamp
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate().toLocaleDateString('he-IL');
  }

  // Date
  if (value instanceof Date) {
    return value.toLocaleDateString('he-IL');
  }

  // ISO string / any string
  if (typeof value === 'string') {
    // אם זה פורמט ישן "date,time" – נשמור את ההתנהגות שלך
    if (value.includes(',')) return value.split(',')[0];

    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('he-IL');

    return value; // fallback
  }

  // number timestamp
  if (typeof value === 'number') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('he-IL');
  }

  return '';
};

const getDaysLeft = (expiresAt: any) => {
  if (!expiresAt) return null;

  const exp =
    typeof expiresAt === 'object' && typeof expiresAt.toDate === 'function'
      ? expiresAt.toDate()
      : expiresAt instanceof Date
      ? expiresAt
      : new Date(expiresAt);

  if (isNaN(exp.getTime())) return null;

  const diffMs = exp.getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};



  if (loading) {
    return (
      <AdminGuard>
        <div className="p-6 text-center">⏳ טוען מנויים...</div>
      </AdminGuard>
    );
  }



  return (
    <AdminGuard>
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">ניהול מנויים</h1>
{/* KPI */}
<div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3 mb-5">
  <button
    type="button"
    onClick={() => applyKpi('total')}
    className={`border rounded-lg p-3 bg-white text-right hover:shadow transition ${isTotalSelected ? 'ring-2 ring-blue-500' : ''}`}
  >
    <div className="text-xs text-gray-500">סה״כ (בסינון)</div>
    <div className="text-2xl font-bold">{kpi.total}</div>
  </button>

  <button
    type="button"
    onClick={() => applyKpi('active')}
    className={`border rounded-lg p-3 bg-white text-right hover:shadow transition ${isActiveSelected ? 'ring-2 ring-blue-500' : ''}`}
  >
    <div className="text-xs text-gray-500">פעילים</div>
    <div className="text-2xl font-bold">{kpi.active}</div>
  </button>

  <button
    type="button"
    onClick={() => applyKpi('inactive')}
    className={`border rounded-lg p-3 bg-white text-right hover:shadow transition ${isInactiveSelected ? 'ring-2 ring-blue-500' : ''}`}
  >
    <div className="text-xs text-gray-500">לא פעילים</div>
    <div className="text-2xl font-bold">{kpi.inactive}</div>
  </button>

  <button
    type="button"
    onClick={() => applyKpi('failed')}
    className={`border rounded-lg p-3 bg-white text-right hover:shadow transition ${isFailedSelected ? 'ring-2 ring-blue-500' : ''}`}
  >
    <div className="text-xs text-gray-500">כשלי חיוב</div>
    <div className="text-2xl font-bold">{kpi.failed}</div>
  </button>

  <button
    type="button"
    onClick={() => applyKpi('canceled')}
    className={`border rounded-lg p-3 bg-white text-right hover:shadow transition ${isCanceledSelected ? 'ring-2 ring-blue-500' : ''}`}
  >
    <div className="text-xs text-gray-500">מבוטלים</div>
    <div className="text-2xl font-bold">{kpi.canceled}</div>
  </button>

  <button
    type="button"
    onClick={() => applyKpi('missingGrow')}
    className={`border rounded-lg p-3 bg-white text-right hover:shadow transition ${isMissingGrowSelected ? 'ring-2 ring-blue-500' : ''}`}
  >
    <div className="text-xs text-gray-500">בלי Grow</div>
    <div className="text-2xl font-bold">{kpi.missingGrow}</div>
  </button>

  <button
    type="button"
    onClick={() => applyKpi('withCoupon')}
    className={`border rounded-lg p-3 bg-white text-right hover:shadow transition ${isWithCouponSelected ? 'ring-2 ring-blue-500' : ''}`}
  >
    <div className="text-xs text-gray-500">עם קופון</div>
    <div className="text-2xl font-bold">{kpi.withCoupon}</div>
  </button>
</div>
        {/* אזור פילטרים */}
        <div className="flex flex-wrap gap-4 mb-4 items-end">
          <div>
            <label className="block text-sm font-semibold mb-1">סטטוס משתמש</label>
            <select
              className="border px-2 py-1 rounded"
              value={filterActive}
              onChange={(e) => setFilterActive(e.target.value as FilterActive)}
            >
              <option value="all">כולם</option>
              <option value="active">פעילים</option>
              <option value="inactive">לא פעילים</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">סטטוס מנוי</label>
            <select
              className="border px-2 py-1 rounded"
              value={filterSubStatus}
              onChange={(e) => setFilterSubStatus(e.target.value as FilterSubStatus)}
            >
              <option value="all">הכול</option>
              <option value="ok">פעילים / תקין</option>
              <option value="failed">כשלי חיוב</option>
              <option value="canceled">מבוטלים</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">תוכנית</label>
            <select
              className="border px-2 py-1 rounded"
              value={filterPlan}
              onChange={(e) => setFilterPlan(e.target.value)}
            >
              <option value="all">כל התוכניות</option>
              <option value="basic">Basic</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>

          <div className="flex-1 min-w-[180px]">
            <label className="block text-sm font-semibold mb-1">חיפוש</label>
            <input
              className="border px-2 py-1 rounded w-full"
              placeholder="חיפוש לפי שם / אימייל / טלפון / מספר עסקה"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* טבלה */}
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border px-2 py-1">שם</th>
                <th className="border px-2 py-1">אימייל</th>
                <th className="border px-2 py-1">טלפון</th>
                <th className="border px-2 py-1">תוכנית</th>
                <th className="border px-2 py-1">תפקיד</th>
                <th className="border px-2 py-1">תאריך רישום</th>
              <th className="border px-2 py-1">שינוי תוכנית</th>
                <th className="border px-2 py-1">תשלום אחרון</th>
                <th className="border px-2 py-1">סטטוס תשלום</th>
                <th className="border px-2 py-1">סטטוס מנוי</th>
                <th className="border px-2 py-1">קופון</th>
                <th className="border px-2 py-1">פעיל?</th>
                <th className="border px-2 py-1">Grow</th>
                <th className="border px-2 py-1">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubscriptions.map(sub => (
                <tr key={sub.id} className="odd:bg-white even:bg-gray-50">
                  <td className="border px-2 py-1">{sub.name}</td>
                  <td className="border px-2 py-1">{sub.email}</td>
                  <td className="border px-2 py-1">{sub.phone}</td>
                  <td className="border px-2 py-1">
                    {sub.subscriptionType || '-'}
                  </td>
                  <td className="border px-2 py-1">{sub.role || '-'}</td>
                  <td className="border px-2 py-1">{sub.subscriptionStartDate || '-'}</td>
                <td className="border px-2 py-1">{sub.lastPlanChangeDate || '-'}</td>
                  <td className="border px-2 py-1">{sub.lastPaymentDate || '-'}</td>
                  <td className="border px-2 py-1">{sub.lastPaymentStatus || '-'}</td>
                  <td className="border px-2 py-1">
                    {sub.subscriptionStatus || '-'}
                    {sub.cancellationDate && (
                      <div className="text-xs text-gray-500">
                        בוטל: {sub.cancellationDate}
                      </div>
                    )}
                  </td>
                  <td className="border px-2 py-1">
  {sub.usedCouponCode || sub.couponUsed?.code ? (
    <div className="flex flex-col">
      {/* קוד + אחוז */}
      <span>
        {sub.usedCouponCode || sub.couponUsed?.code}
        {typeof sub.couponUsed?.discount === 'number' &&
          ` (${sub.couponUsed.discount}%)`}
      </span>

      {/* תאריך בלבד */}
   {/* תאריך שימוש (הישן - date) */}
   {(() => {
  const appliedDate = sub.couponUsed?.appliedAt || sub.couponUsed?.date;
  if (!appliedDate) return null;

  return (
    <span className="text-xs text-gray-500">
      הופעל: {formatDateOnly(appliedDate)}
    </span>
  );
})()}

{/* תאריך פקיעה (חדש - expiresAt) אם קיים */}
{sub.couponUsed?.expiresAt && (() => {
  const daysLeft = getDaysLeft(sub.couponUsed.expiresAt);
  const isUrgent = typeof daysLeft === 'number' && daysLeft <= 7;

  return (
    <span className={`text-xs ${isUrgent ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
      פוקע: {formatDateOnly(sub.couponUsed.expiresAt)}
      {typeof daysLeft === 'number' && (
        <> {daysLeft <= 0 ? '(פג)' : `(עוד ${daysLeft} ימים)`}</>
      )}
    </span>
  );
})()}
    </div>
  ) : (
    '-'
  )}
</td>
      <td className="border px-2 py-1 text-center">
                    <span
                      className={`inline-block px-2 py-1 rounded-full text-xs font-semibold 
                        ${sub.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}
                    >
                      {sub.isActive ? 'פעיל' : 'לא פעיל'}
                    </span>
                  </td>
                  <td className="border px-2 py-1 text-xs">
                    {sub.growCancellationStatus && (
                      <div>ביטול Grow: {sub.growCancellationStatus}</div>
                    )}
                    {sub.wasRefunded && (
                      <div className="text-green-700">
                        זוכה {sub.refundDate ? `(${sub.refundDate})` : ''}
                      </div>
                    )}
                  </td>
                  <td className="border px-2 py-1 text-xs space-y-1">
                    <button
                      className="bg-blue-600 text-white px-2 py-1 rounded w-full"
                      onClick={() => setSelectedForChange(sub)}
                      disabled={sub.subscriptionStatus === 'canceled'}
                    >
                      שינוי תוכנית
                    </button>
                    <button
                      className="bg-red-500 text-white px-2 py-1 rounded w-full"
                      onClick={() => handleCancel(sub)}
                      disabled={sub.subscriptionStatus === 'canceled'}
                    >
                      סגירת מנוי
                    </button>
                    <button
                      className="bg-yellow-300 px-2 py-1 rounded w-full"
                      onClick={() => handleSendFailureEmail(sub.email, sub.name)}
                    >
                      מייל כשלון
                    </button>
                    <button
  className="bg-orange-400 text-white px-2 py-1 rounded w-full"
  onClick={() => openCouponEmailModal(sub)}
  disabled={!sub.usedCouponCode && !sub.couponUsed?.code}
>
  מייל קופון
</button>
<button
  className="bg-indigo-500 text-white px-2 py-1 rounded w-full"
  onClick={() => handleChangePaymentMethod(sub)}
>
  החלפת אמצעי תשלום
</button>

                  </td>
                </tr>
              ))}

              {filteredSubscriptions.length === 0 && (
                <tr>
                  <td colSpan={14} className="text-center py-4 text-gray-500">
                    לא נמצאו מנויים בהתאם לסינון
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* טוסטים */}
        {toasts.map((toast) => (
          <ToastNotification
            key={toast.id}
            type={toast.type}
            className={toast.isHiding ? 'hide' : ''}
            message={toast.message}
            onClose={() =>
              setToasts(prev => prev.filter(t => t.id !== toast.id))
            }
          />
        ))}

        {/* מודאל שינוי תוכנית */}
        {selectedForChange && (
          <ChangePlanModal
            userId={selectedForChange.id}
            transactionId={selectedForChange.transactionId}
            transactionToken={selectedForChange.transactionToken}
            asmachta={selectedForChange.asmachta}
            currentPlan={selectedForChange.subscriptionType}
            currentAddOns={selectedForChange.addOns}
             prefill={{
              name: selectedForChange.name,
              email: selectedForChange.email,
              phone: selectedForChange.phone,
              idNumber: selectedForChange.idNumber,
            }}
            onClose={() => setSelectedForChange(null)}
          />
        )}
        {couponEmailTarget && (
  <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
    <div className="bg-white rounded-xl shadow-xl max-w-xl w-full p-5 text-right">
      <h2 className="text-xl font-bold mb-4">
        מייל קופון ל־{couponEmailTarget.name}
      </h2>

      <div className="mb-3">
        <label className="block text-sm font-semibold mb-1">נושא המייל</label>
        <input
          className="border rounded px-3 py-2 w-full"
          value={couponEmailSubject}
          onChange={e => setCouponEmailSubject(e.target.value)}
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-semibold mb-1">תוכן המייל</label>
        <textarea
          className="border rounded px-3 py-2 w-full min-h-[180px]"
          value={couponEmailBody}
          onChange={e => setCouponEmailBody(e.target.value)}
        />
        <p className="text-xs text-gray-500 mt-1">
          אפשר לערוך חופשי את המלל, כולל מחיר יעד (XX ₪).
        </p>
      </div>

      <div className="flex justify-end gap-3">
        <button
          onClick={() => setCouponEmailTarget(null)}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
          type="button"
        >
          ביטול
        </button>
        <button
          onClick={handleSendCouponEmail}
          disabled={couponEmailSending}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60"
          type="button"
        >
          {couponEmailSending ? 'שולח...' : 'שלח מייל'}
        </button>
      </div>
    </div>
  </div>
)}
      </div>
    </AdminGuard>
  );
}
