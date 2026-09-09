// app/admin/subscriptions/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';

import { ToastNotification } from '@/components/ToastNotification';
import { useToast } from '@/hooks/useToast';
import { ChangePlanModal } from '@/components/ChangePlanModal/ChangePlanModal';
import AdminGuard from '@/app/admin/_components/AdminGuard';

type AddOns = {
  leadsModule?: boolean;
  extraWorkers?: number;
};

type SubscriptionRow = {
  id: string;
  agentId?: string;
  workersCount?: number;

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
    date?: any;
    appliedAt?: any;
    expiresAt?: any;
    lastNotifiedAt?: any;
    notifyFlags?: {
      d14?: boolean;
      d7?: boolean;
      d3?: boolean;
      d1?: boolean;
      expired?: boolean;
    };
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

type KpiKey = 'total' | 'active' | 'failed' | 'withCoupon' | 'missingGrow';

const moneyFormatter = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  maximumFractionDigits: 0,
});

function formatMoney(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return '-';
  }
  return moneyFormatter.format(Number(value));
}

function formatIsraeliPhone(value?: string) {
  if (!value) return '-';
  let clean = String(value).replace(/\D/g, '');
  if (clean.startsWith('00972')) clean = clean.slice(2);
  if (clean.startsWith('972')) clean = `0${clean.slice(3)}`;
  if (clean.length === 10 && clean.startsWith('05')) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  }
  if (clean.length === 10 && clean.startsWith('07')) {
    return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
  }
  if (clean.length === 9 && clean.startsWith('0')) {
    return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5)}`;
  }
  return value;
}

function toTelHref(value?: string) {
  if (!value) return '';
  let clean = String(value).replace(/\D/g, '');
  if (clean.startsWith('00972')) clean = clean.slice(2);
  if (clean.startsWith('972')) return `+${clean}`;
  if (clean.startsWith('0')) return `+972${clean.slice(1)}`;
  return clean;
}

function formatDateOnly(value: any) {
  if (!value) return '';
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate().toLocaleDateString('he-IL');
  }
  if (value instanceof Date) return value.toLocaleDateString('he-IL');
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('he-IL');
  }
  if (typeof value === 'string') {
    const raw = value.trim();
    if (!raw) return '';
    if (raw.includes(',')) return raw.split(',')[0];
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString('he-IL');
    return raw;
  }
  return '';
}

function parseDate(value: any): Date | null {
  if (!value) return null;
  if (typeof value === 'object' && typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string') {
    const raw = value.trim().split(',')[0];
    const israeliMatch = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (israeliMatch) {
      const [, day, month, year] = israeliMatch;
      const date = new Date(Number(year), Number(month) - 1, Number(day));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function getDaysLeft(value: any) {
  const date = parseDate(value);
  if (!date) return null;
  const diffMs = date.getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getSubscriptionStatusLabel(sub: SubscriptionRow) {
  if (sub.subscriptionStatus === 'canceled') return 'מבוטל';
  if (!sub.isActive) return 'לא פעיל';
  if (sub.lastPaymentStatus === 'failed') return 'כשל חיוב';
  return 'פעיל';
}

// Tokenized status tone — one place that maps status to the palette,
// used by both the table row dot and the drawer pill.
function getStatusTone(sub: SubscriptionRow) {
  if (sub.subscriptionStatus === 'canceled') {
    return { dot: 'bg-[#8B8478]', text: 'text-[#8B8478]', pill: 'bg-[#EFEDE7] text-[#6B6459]' };
  }
  if (sub.lastPaymentStatus === 'failed') {
    return { dot: 'bg-[#B23B2E]', text: 'text-[#B23B2E]', pill: 'bg-[#F5E4E0] text-[#B23B2E]' };
  }
  if (!sub.isActive) {
    return { dot: 'bg-[#A9711F]', text: 'text-[#A9711F]', pill: 'bg-[#F3E9D6] text-[#A9711F]' };
  }
  return { dot: 'bg-[#1F6F4A]', text: 'text-[#1F6F4A]', pill: 'bg-[#E4EEE8] text-[#1F6F4A]' };
}

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconChevron() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="6" cy="5.5" r="2.1" stroke="currentColor" strokeWidth="1.4" />
      <path d="M2 13c0-2.2 1.8-3.6 4-3.6s4 1.4 4 3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="11.5" cy="5.2" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <path d="M9.6 9.8c1.9.2 3.3 1.5 3.3 3.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export default function SubscriptionsAdminPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterActive, setFilterActive] = useState<FilterActive>('all');
  const [filterSubStatus, setFilterSubStatus] = useState<FilterSubStatus>('all');
  const [filterPlan, setFilterPlan] = useState('all');
  const [filterGrow, setFilterGrow] = useState<FilterGrow>('all');
  const [filterCoupon, setFilterCoupon] = useState<FilterCoupon>('all');
  const [search, setSearch] = useState('');

  const [selectedForChange, setSelectedForChange] = useState<SubscriptionRow | null>(null);
  const [selectedForDetail, setSelectedForDetail] = useState<SubscriptionRow | null>(null);

  const [couponEmailTarget, setCouponEmailTarget] = useState<SubscriptionRow | null>(null);
  const [couponEmailSubject, setCouponEmailSubject] = useState('');
  const [couponEmailBody, setCouponEmailBody] = useState('');
  const [couponEmailSending, setCouponEmailSending] = useState(false);

  const { toasts, addToast, setToasts } = useToast();
  const [errorShown, setErrorShown] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchSubscriptions = async () => {
      try {
        const { data } = await axios.get<SubscriptionRow[]>('/api/subscriptions');
        if (!cancelled) setSubscriptions(data);
      } catch {
        if (!cancelled && !errorShown) {
          addToast('error', 'שגיאה בטעינת המנויים');
          setErrorShown(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSubscriptions();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const planOptions = useMemo(() => {
    return Array.from(
      new Set(
        subscriptions.map((sub) => sub.subscriptionType).filter((value): value is string => Boolean(value))
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [subscriptions]);

  const hasGrow = (sub: SubscriptionRow) =>
    Boolean(sub.transactionToken && sub.transactionId && sub.asmachta);

  const hasCoupon = (sub: SubscriptionRow) => Boolean(sub.usedCouponCode || sub.couponUsed?.code);

  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter((sub) => {
      if (filterActive === 'active' && !sub.isActive) return false;
      if (filterActive === 'inactive' && sub.isActive) return false;

      if (filterSubStatus === 'ok') {
        if (sub.subscriptionStatus === 'canceled') return false;
        if (sub.lastPaymentStatus === 'failed') return false;
      }

      if (filterSubStatus === 'failed' && sub.lastPaymentStatus !== 'failed') return false;
      if (filterSubStatus === 'canceled' && sub.subscriptionStatus !== 'canceled') return false;
      if (filterPlan !== 'all' && sub.subscriptionType !== filterPlan) return false;
      if (filterGrow === 'missing' && hasGrow(sub)) return false;
      if (filterCoupon === 'with' && !hasCoupon(sub)) return false;

      if (search.trim()) {
        const needle = search.trim().toLowerCase();
        const phoneDigits = search.replace(/\D/g, '');

        const haystack = [
          sub.name,
          sub.email,
          sub.phone,
          sub.idNumber,
          formatIsraeliPhone(sub.phone),
          sub.agentId,
          sub.subscriptionId,
          sub.transactionId,
          sub.subscriptionType,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        const subPhoneDigits = String(sub.phone || '').replace(/\D/g, '');
        const matchesText = haystack.includes(needle);
        const matchesPhone = phoneDigits.length >= 4 && subPhoneDigits.includes(phoneDigits);

        if (!matchesText && !matchesPhone) return false;
      }

      return true;
    });
  }, [subscriptions, filterActive, filterSubStatus, filterPlan, filterGrow, filterCoupon, search]);

  const kpi = useMemo(() => {
    const total = filteredSubscriptions.length;
    const active = filteredSubscriptions.filter(
      (sub) => sub.isActive && sub.subscriptionStatus !== 'canceled'
    ).length;
    const failed = filteredSubscriptions.filter((sub) => sub.lastPaymentStatus === 'failed').length;
    const withCoupon = filteredSubscriptions.filter((sub) => hasCoupon(sub)).length;
    const missingGrow = filteredSubscriptions.filter((sub) => !hasGrow(sub)).length;
    const workers = filteredSubscriptions.reduce((sum, sub) => sum + Number(sub.workersCount || 0), 0);
    const monthlyRevenue = filteredSubscriptions.reduce((sum, sub) => {
      if (!sub.isActive || sub.subscriptionStatus === 'canceled') return sum;
      return sum + Number(sub.futureChargeAmount || 0);
    }, 0);

    return { total, active, failed, withCoupon, missingGrow, workers, monthlyRevenue };
  }, [filteredSubscriptions]);

  const isTotalSelected =
    filterActive === 'all' &&
    filterSubStatus === 'all' &&
    filterPlan === 'all' &&
    filterGrow === 'all' &&
    filterCoupon === 'all' &&
    !search.trim();

  const isActiveSelected = filterActive === 'active' && filterSubStatus === 'all';
  const isFailedSelected = filterSubStatus === 'failed';
  const isWithCouponSelected = filterCoupon === 'with';
  const isMissingGrowSelected = filterGrow === 'missing';

  const resetFilters = () => {
    setFilterActive('all');
    setFilterSubStatus('all');
    setFilterPlan('all');
    setFilterGrow('all');
    setFilterCoupon('all');
    setSearch('');
  };

  const applyKpi = (key: KpiKey) => {
    const alreadySelected =
      (key === 'total' && isTotalSelected) ||
      (key === 'active' && isActiveSelected) ||
      (key === 'failed' && isFailedSelected) ||
      (key === 'withCoupon' && isWithCouponSelected) ||
      (key === 'missingGrow' && isMissingGrowSelected);

    if (alreadySelected) {
      resetFilters();
      return;
    }

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
      case 'failed':
        setFilterSubStatus('failed');
        return;
      case 'withCoupon':
        setFilterCoupon('with');
        return;
      case 'missingGrow':
        setFilterGrow('missing');
        return;
    }
  };

  const handleExportExcel = () => {
    if (filteredSubscriptions.length === 0) {
      addToast('error', 'אין נתונים לייצוא');
      return;
    }

    const rows = filteredSubscriptions.map((sub) => ({
      'שם לקוח': sub.name || '',
      'תעודת זהות': sub.idNumber || '',
      'טלפון': formatIsraeliPhone(sub.phone),
      'אימייל': sub.email || '',
      'Agent ID': sub.agentId || '',
      'תוכנית': sub.subscriptionType || '',
      'Role': sub.role || '',
      'מספר עובדים': Number(sub.workersCount || 0),
      'מחיר חודשי': sub.futureChargeAmount ?? '',
      'קוד קופון': sub.couponUsed?.code || sub.usedCouponCode || '',
      'הנחה %': sub.couponUsed?.discount ?? '',
      'תאריך הפעלת קופון': formatDateOnly(sub.couponUsed?.appliedAt || sub.couponUsed?.date),
      'תוקף קופון': formatDateOnly(sub.couponUsed?.expiresAt),
      'תאריך רישום': formatDateOnly(sub.subscriptionStartDate),
      'שינוי תוכנית אחרון': formatDateOnly(sub.lastPlanChangeDate),
      'תשלום אחרון': formatDateOnly(sub.lastPaymentDate),
      'סטטוס תשלום': sub.lastPaymentStatus || '',
      'סטטוס מנוי': getSubscriptionStatusLabel(sub),
      'פעיל': sub.isActive ? 'כן' : 'לא',
      'Grow': hasGrow(sub) ? 'מחובר' : 'חסר',
      'Subscription ID': sub.subscriptionId || '',
      'Transaction ID': sub.transactionId || '',
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    worksheet['!cols'] = [
      { wch: 22 }, { wch: 16 }, { wch: 30 }, { wch: 28 }, { wch: 20 }, { wch: 14 },
      { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 10 }, { wch: 18 }, { wch: 16 },
      { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 10 },
      { wch: 12 }, { wch: 24 }, { wch: 24 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'מנויים');

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `MagicSale-Subscriptions-${today}.xlsx`);

    addToast('success', `יוצאו ${filteredSubscriptions.length} מנויים לאקסל`);
  };

  const handleSendFailureEmail = async (email: string, name: string) => {
    try {
      await axios.post('/api/sendFailureEmail', { email, name });
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
        updates: {},
      });

      setSubscriptions((prev) =>
        prev.map((item) =>
          item.id === sub.id
            ? {
                ...item,
                subscriptionStatus: 'canceled',
                isActive: false,
                growCancellationStatus: data?.growCanceled ? 'success' : item.growCancellationStatus,
              }
            : item
        )
      );

      setSelectedForDetail((prev) => (prev?.id === sub.id ? null : prev));

      if (data?.growCanceled) {
        addToast('success', 'המנוי בוטל גם במערכת וגם ב-Grow');
      } else {
        addToast('success', data?.message || 'המנוי בוטל במערכת');
      }
    } catch (error: any) {
      addToast('error', error?.response?.data?.error || 'שגיאה בביטול המנוי');
    }
  };

  const openCouponEmailModal = (sub: SubscriptionRow) => {
    setCouponEmailTarget(sub);

    const code = sub.couponUsed?.code || sub.usedCouponCode || '';
    const discount = sub.couponUsed?.discount;
    const niceDiscount = typeof discount === 'number' ? ` (${discount}%)` : '';

    setCouponEmailSubject('תזכורת – הקופון שלך ל־MagicSale עומד לפוג');
    setCouponEmailBody(`שלום ${sub.name},

רק מזכירים שהקופון שלך${code ? ` ${code}${niceDiscount}` : ''} עומד לפוג בקרוב.

לאחר פקיעת הקופון, המחיר יעודכן באופן אוטומטי למחיר המלא של XX ₪ לחודש.

לשאלות או עזרה – אפשר להשיב למייל זה או ליצור קשר עם צוות MagicSale.

בברכה,
צוות MagicSale`);
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
      setCouponEmailTarget(null);
    } catch (error: any) {
      addToast('error', error?.response?.data?.error || 'שגיאה בשליחת מייל הקופון');
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
      const { data } = await axios.post('/api/create-subscription', {
        existingUserUid: sub.id,
        source: 'existing-user-upgrade',
        plan: sub.subscriptionType,
        addOns: sub.addOns || {},
        couponCode: sub.usedCouponCode || sub.couponUsed?.code || undefined,
        fullName: sub.name,
        email: sub.email,
        phone: sub.phone,
        idNumber: sub.idNumber,
      });

      if (data?.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        addToast('error', 'לא התקבל קישור לעדכון אמצעי התשלום');
      }
    } catch (error: any) {
      addToast('error', error?.response?.data?.error || 'שגיאה בפתיחת תהליך עדכון התשלום');
    }
  };

  if (loading) {
    return (
      <AdminGuard>
        <div
          className="flex min-h-[60vh] items-center justify-center bg-[#F7F6F2]"
          style={{ fontFamily: "'Heebo', sans-serif" }}
        >
          <div className="flex items-center gap-3 rounded-xl border border-[#E4E1D6] bg-white px-6 py-4 text-sm font-medium text-[#5B6560]">
            <span className="h-3.5 w-3.5 animate-pulse rounded-full bg-[#1F6F4A]" />
            טוען מנויים...
          </div>
        </div>
      </AdminGuard>
    );
  }

  const metrics: Array<{
    key: KpiKey | null;
    label: string;
    value: string;
    selected: boolean;
    tone: string;
  }> = [
    { key: 'total', label: 'סה״כ לקוחות', value: String(kpi.total), selected: isTotalSelected, tone: 'text-[#1F2A24]' },
    { key: 'active', label: 'פעילים', value: String(kpi.active), selected: isActiveSelected, tone: 'text-[#1F6F4A]' },
    { key: 'failed', label: 'כשלי חיוב', value: String(kpi.failed), selected: isFailedSelected, tone: 'text-[#B23B2E]' },
    { key: 'withCoupon', label: 'עם קופון', value: String(kpi.withCoupon), selected: isWithCouponSelected, tone: 'text-[#1F2A24]' },
    { key: 'missingGrow', label: 'ללא Grow', value: String(kpi.missingGrow), selected: isMissingGrowSelected, tone: 'text-[#A9711F]' },
    { key: null, label: 'עובדים', value: String(kpi.workers), selected: false, tone: 'text-[#1F2A24]' },
    { key: null, label: 'הכנסה חודשית', value: formatMoney(kpi.monthlyRevenue), selected: false, tone: 'text-[#1F2A24]' },
  ];

  return (
    <AdminGuard>
      <div dir="rtl" className="min-h-screen bg-[#F7F6F2]" style={{ fontFamily: "'Heebo', sans-serif" }}>
        {/* Header */}
        <div className="sticky top-0 z-30 border-b border-[#E4E1D6] bg-[#F7F6F2]/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-6 px-6 py-6 sm:px-9">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-[26px] font-bold leading-[1.2] tracking-[-0.01em] text-[#1F2A24]">
                  לקוחות ומנויים
                </h1>
                <span className="rounded-md bg-[#E4EEE8] px-2 py-1 text-[11px] font-semibold leading-none text-[#1F6F4A]">
                  UNAMIX
                </span>
              </div>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#5B6560]">
                תמונת מצב עסקית של הלקוחות, המנויים והחיובים
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2.5">
              <button
                type="button"
                onClick={resetFilters}
                className="h-10 rounded-lg border border-[#E4E1D6] bg-white px-4 text-[13.5px] font-medium text-[#1F2A24] transition hover:border-[#C8C4B6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F6F4A]/30"
              >
                איפוס סינון
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                className="h-10 rounded-lg bg-[#1F2A24] px-[18px] text-[13.5px] font-semibold text-white transition hover:bg-[#16201B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F6F4A]/40"
              >
                ייצוא לאקסל · {filteredSubscriptions.length}
              </button>
            </div>
          </div>

          {/* Ledger strip */}
          <div className="mx-auto max-w-[1440px] overflow-x-auto px-6 sm:px-9">
            <div className="flex w-max divide-x divide-x-reverse divide-[#E4E1D6] border-t border-[#E4E1D6] sm:w-full">
              {metrics.map((m) => {
                const clickable = m.key !== null;
                const Comp: any = clickable ? 'button' : 'div';
                return (
                  <Comp
                    key={m.label}
                    type={clickable ? 'button' : undefined}
                    onClick={clickable ? () => applyKpi(m.key as KpiKey) : undefined}
                    className={`min-w-[140px] flex-1 px-[18px] py-4 text-right transition ${
                      clickable ? 'cursor-pointer hover:bg-white/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F6F4A]/30' : ''
                    }`}
                  >
                    <div
                      className={`text-[11.5px] font-medium leading-none ${
                        m.selected ? 'text-[#1F6F4A]' : 'text-[#8B8478]'
                      }`}
                    >
                      {m.label}
                    </div>
                    <div
                      className={`mt-2 text-[22px] font-bold leading-none tabular-nums ${
                        m.selected ? 'text-[#1F6F4A]' : m.tone
                      }`}
                    >
                      {m.value}
                    </div>
                    {m.selected && <div className="mt-2 h-[2px] w-6 rounded-full bg-[#1F6F4A]" />}
                  </Comp>
                );
              })}
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-[1440px] px-6 py-6 sm:px-9">
          {/* Filter row */}
          <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="חיפוש לפי שם, ת.ז., טלפון, מייל, Agent ID..."
                className="h-10 w-full rounded-lg border border-[#E4E1D6] bg-white px-4 pr-9 text-[13.5px] leading-relaxed text-[#1F2A24] outline-none transition placeholder:text-[#A6A192] focus:border-[#1F6F4A] focus:ring-2 focus:ring-[#1F6F4A]/15"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#A6A192]">⌕</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-[#E4E1D6] bg-white p-1 text-[12.5px] font-medium">
                {(
                  [
                    ['all', 'כולם'],
                    ['active', 'פעילים'],
                    ['inactive', 'לא פעילים'],
                  ] as [FilterActive, string][]
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilterActive(value)}
                    className={`rounded-md px-3.5 py-2 transition ${
                      filterActive === value ? 'bg-[#1F2A24] text-white' : 'text-[#5B6560] hover:bg-[#F7F6F2]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex rounded-lg border border-[#E4E1D6] bg-white p-1 text-[12.5px] font-medium">
                {(
                  [
                    ['all', 'כל הסטטוסים'],
                    ['ok', 'תקין'],
                    ['failed', 'כשל חיוב'],
                    ['canceled', 'מבוטל'],
                  ] as [FilterSubStatus, string][]
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilterSubStatus(value)}
                    className={`rounded-md px-3.5 py-2 transition ${
                      filterSubStatus === value ? 'bg-[#1F2A24] text-white' : 'text-[#5B6560] hover:bg-[#F7F6F2]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <select
                value={filterPlan}
                onChange={(event) => setFilterPlan(event.target.value)}
                className="h-9 rounded-lg border border-[#E4E1D6] bg-white px-3 text-[12.5px] font-medium text-[#1F2A24] outline-none"
              >
                <option value="all">כל התוכניות</option>
                {planOptions.map((plan) => (
                  <option key={plan} value={plan}>
                    {plan}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setFilterCoupon(filterCoupon === 'with' ? 'all' : 'with')}
                className={`h-9 rounded-lg border px-3.5 text-[12.5px] font-medium transition ${
                  filterCoupon === 'with'
                    ? 'border-[#1F6F4A] bg-[#E4EEE8] text-[#1F6F4A]'
                    : 'border-[#E4E1D6] bg-white text-[#5B6560] hover:border-[#C8C4B6]'
                }`}
              >
                עם קופון בלבד
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-hidden rounded-xl border border-[#E4E1D6] bg-white">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-[13.5px]">
                <thead>
                  <tr className="border-b border-[#E4E1D6] bg-[#FBFAF7] text-right text-[11.5px] font-semibold text-[#8B8478]">
                    <th className="px-5 py-3.5 font-semibold">לקוח</th>
                    <th className="px-5 py-3.5 font-semibold">מנוי</th>
                    <th className="px-5 py-3.5 font-semibold">עובדים</th>
                    <th className="px-5 py-3.5 font-semibold">תשלום חודשי</th>
                    <th className="px-5 py-3.5 font-semibold">קופון</th>
                    <th className="px-5 py-3.5 font-semibold">Grow</th>
                    <th className="px-5 py-3.5 font-semibold">סטטוס</th>
                    <th className="w-10 px-5 py-3.5" />
                  </tr>
                </thead>
                <tbody>
                  {filteredSubscriptions.map((sub) => {
                    const tone = getStatusTone(sub);
                    const couponCode = sub.couponUsed?.code || sub.usedCouponCode || '';
                    const daysLeft = getDaysLeft(sub.couponUsed?.expiresAt);
                    const couponUrgent = typeof daysLeft === 'number' && daysLeft <= 7;

                    return (
                      <tr
                        key={sub.id}
                        onClick={() => setSelectedForDetail(sub)}
                        className="cursor-pointer border-b border-[#EFEDE7] transition last:border-b-0 hover:bg-[#FBFAF7]"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F0EEE7] text-[13px] font-bold text-[#5B6560]">
                              {(sub.name || '?').trim().charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-[14px] font-semibold leading-snug text-[#1F2A24]">
                                {sub.name || 'ללא שם'}
                              </div>
                              <div className="mt-0.5 truncate text-[12.5px] leading-snug text-[#8B8478]" dir="ltr">
                                {sub.email || '-'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="inline-flex rounded-md bg-[#F0EEE7] px-2.5 py-1 text-[12.5px] font-semibold text-[#1F2A24]">
                            {sub.subscriptionType || 'לא הוגדר'}
                          </span>
                        </td>
                        <td className="px-5 py-4 tabular-nums text-[#1F2A24]">{sub.workersCount ?? 0}</td>
                        <td className="px-5 py-4 tabular-nums font-medium text-[#1F2A24]">
                          {formatMoney(sub.futureChargeAmount)}
                        </td>
                        <td className="px-5 py-4">
                          {couponCode ? (
                            <span
                              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12.5px] font-semibold ${
                                couponUrgent ? 'bg-[#F5E4E0] text-[#B23B2E]' : 'bg-[#F3E9D6] text-[#A9711F]'
                              }`}
                            >
                              {couponCode}
                              {typeof daysLeft === 'number' && ` · ${daysLeft <= 0 ? 'פג' : `${daysLeft}י'`}`}
                            </span>
                          ) : (
                            <span className="text-[12.5px] text-[#C8C4B6]">—</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex h-2 w-2 rounded-full align-middle ${
                              hasGrow(sub) ? 'bg-[#1F6F4A]' : 'bg-[#A9711F]'
                            }`}
                          />
                          <span className="mr-1.5 text-[12.5px] text-[#5B6560]">{hasGrow(sub) ? 'מחובר' : 'חסר'}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12.5px] font-semibold ${tone.pill}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                            {getSubscriptionStatusLabel(sub)}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-[#C8C4B6]">
                          <IconChevron />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredSubscriptions.length === 0 && (
              <div className="px-6 py-16 text-center">
                <div className="text-base font-semibold text-[#5B6560]">לא נמצאו לקוחות</div>
                <div className="mt-1.5 text-[13.5px] leading-relaxed text-[#A6A192]">נסי לשנות את החיפוש או את הסינון</div>
              </div>
            )}
          </div>

          <p className="mt-3.5 px-1 text-[12.5px] text-[#8B8478]">
            מוצגים {filteredSubscriptions.length} מתוך {subscriptions.length}
          </p>
        </div>

        {/* Detail drawer */}
        {selectedForDetail && (
          <>
            <div
              className="fixed inset-0 z-40 bg-[#1F2A24]/30"
              onClick={() => setSelectedForDetail(null)}
            />
            <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-white shadow-2xl motion-reduce:transition-none">
              {(() => {
                const sub = selectedForDetail;
                const tone = getStatusTone(sub);
                const couponCode = sub.couponUsed?.code || sub.usedCouponCode || '';
                const couponDiscount = sub.couponUsed?.discount;
                const daysLeft = getDaysLeft(sub.couponUsed?.expiresAt);
                const couponUrgent = typeof daysLeft === 'number' && daysLeft <= 7;

                // Workers are separate accounts whose agentId points back at this
                // agent's own id — resolved from the already-loaded list, no extra call.
                const agentWorkers = subscriptions.filter(
                  (s) => s.id !== sub.id && s.agentId === sub.id
                );

                return (
                  <>
                    <div className="flex items-start justify-between gap-3 border-b border-[#E4E1D6] px-6 py-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F0EEE7] text-[17px] font-bold text-[#5B6560]">
                          {(sub.name || '?').trim().charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="text-[17px] font-bold leading-snug text-[#1F2A24]">{sub.name || 'ללא שם'}</div>
                          <span className={`mt-1.5 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12px] font-semibold ${tone.pill}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                            {getSubscriptionStatusLabel(sub)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedForDetail(null)}
                        className="rounded-lg p-2 text-[#8B8478] transition hover:bg-[#F7F6F2] hover:text-[#1F2A24] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F6F4A]/30"
                        aria-label="סגירה"
                      >
                        <IconClose />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-6 py-5">
                      {/* Actions */}
                      <div className="mb-6 grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => setSelectedForChange(sub)}
                          disabled={sub.subscriptionStatus === 'canceled'}
                          className="rounded-lg border border-[#E4E1D6] px-3 py-2.5 text-[13px] font-semibold leading-none text-[#1F2A24] transition hover:border-[#1F6F4A] hover:text-[#1F6F4A] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          שינוי תוכנית
                        </button>
                        <button
                          type="button"
                          onClick={() => handleChangePaymentMethod(sub)}
                          className="rounded-lg border border-[#E4E1D6] px-3 py-2.5 text-[13px] font-semibold leading-none text-[#1F2A24] transition hover:border-[#1F6F4A] hover:text-[#1F6F4A]"
                        >
                          החלפת אמצעי תשלום
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSendFailureEmail(sub.email, sub.name)}
                          className="rounded-lg border border-[#E4E1D6] px-3 py-2.5 text-[13px] font-semibold leading-none text-[#1F2A24] transition hover:border-[#A9711F] hover:text-[#A9711F]"
                        >
                          שליחת מייל כשלון
                        </button>
                        <button
                          type="button"
                          onClick={() => openCouponEmailModal(sub)}
                          disabled={!hasCoupon(sub)}
                          className="rounded-lg border border-[#E4E1D6] px-3 py-2.5 text-[13px] font-semibold leading-none text-[#1F2A24] transition hover:border-[#1F6F4A] hover:text-[#1F6F4A] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          שליחת מייל קופון
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCancel(sub)}
                        disabled={sub.subscriptionStatus === 'canceled'}
                        className="mb-7 w-full rounded-lg border border-[#F0D9D4] bg-[#FBF2F0] px-3 py-2.5 text-[13px] font-bold leading-none text-[#B23B2E] transition hover:bg-[#F5E4E0] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        סגירת מנוי
                      </button>

                      {/* Contact */}
                      <div className="mb-6">
                        <div className="mb-2.5 text-[11.5px] font-semibold text-[#8B8478]">פרטי קשר</div>
                        <div className="space-y-3 rounded-lg border border-[#EFEDE7] p-4 text-[13.5px] leading-relaxed">
                          <div className="flex justify-between">
                            <span className="text-[#8B8478]">טלפון</span>
                            {sub.phone ? (
                              <a href={`tel:${toTelHref(sub.phone)}`} className="font-medium text-[#1F2A24] hover:text-[#1F6F4A]" dir="ltr">
                                {formatIsraeliPhone(sub.phone)}
                              </a>
                            ) : (
                              <span>-</span>
                            )}
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8B8478]">אימייל</span>
                            {sub.email ? (
                              <a href={`mailto:${sub.email}`} className="max-w-[220px] truncate font-medium text-[#1F2A24] hover:text-[#1F6F4A]" dir="ltr">
                                {sub.email}
                              </a>
                            ) : (
                              <span>-</span>
                            )}
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8B8478]">ת.ז.</span>
                            <span dir="ltr" className="font-medium tabular-nums text-[#1F2A24]">
                              {sub.idNumber || '-'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8B8478]">Role</span>
                            <span className="font-medium text-[#1F2A24]">{sub.role || '-'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8B8478]">Agent ID</span>
                            <span className="font-medium tabular-nums text-[#1F2A24]">{sub.agentId || sub.id}</span>
                          </div>
                        </div>
                      </div>

                      {/* Subscription */}
                      <div className="mb-6">
                        <div className="mb-2.5 text-[11.5px] font-semibold text-[#8B8478]">מנוי ותשלום</div>
                        <div className="space-y-3 rounded-lg border border-[#EFEDE7] p-4 text-[13.5px] leading-relaxed">
                          <div className="flex justify-between">
                            <span className="text-[#8B8478]">תוכנית</span>
                            <span className="font-medium text-[#1F2A24]">{sub.subscriptionType || 'לא הוגדר'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8B8478]">מספר עובדים</span>
                            <span className="font-medium tabular-nums text-[#1F2A24]">
                              {sub.workersCount ?? agentWorkers.length}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8B8478]">תשלום חודשי</span>
                            <span className="font-medium tabular-nums text-[#1F2A24]">{formatMoney(sub.futureChargeAmount)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8B8478]">סה״כ חויב</span>
                            <span className="font-medium tabular-nums text-[#1F2A24]">{formatMoney(sub.totalCharged)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8B8478]">תאריך רישום</span>
                            <span className="font-medium text-[#1F2A24]">{formatDateOnly(sub.subscriptionStartDate) || '-'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8B8478]">שינוי תוכנית אחרון</span>
                            <span className="font-medium text-[#1F2A24]">{formatDateOnly(sub.lastPlanChangeDate) || '-'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8B8478]">תשלום אחרון</span>
                            <span className="font-medium text-[#1F2A24]">{formatDateOnly(sub.lastPaymentDate) || '-'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8B8478]">סטטוס תשלום</span>
                            <span
                              className={`font-medium ${
                                sub.lastPaymentStatus === 'failed' ? 'text-[#B23B2E]' : 'text-[#1F6F4A]'
                              }`}
                            >
                              {sub.lastPaymentStatus || '-'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-[#8B8478]">Grow</span>
                            <span className={`font-medium ${hasGrow(sub) ? 'text-[#1F6F4A]' : 'text-[#A9711F]'}`}>
                              {hasGrow(sub) ? 'מחובר' : 'חסר'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Employees */}
                      <div className="mb-6">
                        <div className="mb-2.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-[#8B8478]">
                          <IconUsers />
                          עובדי הסוכן {agentWorkers.length > 0 && `(${agentWorkers.length})`}
                        </div>
                        {agentWorkers.length > 0 ? (
                          <div className="divide-y divide-[#EFEDE7] rounded-lg border border-[#EFEDE7]">
                            {agentWorkers.map((worker) => (
                              <button
                                key={worker.id}
                                type="button"
                                onClick={() => setSelectedForDetail(worker)}
                                className="flex w-full items-center gap-3 p-3.5 text-right transition hover:bg-[#FBFAF7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1F6F4A]/20"
                              >
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F0EEE7] text-[12px] font-bold text-[#5B6560]">
                                  {(worker.name || '?').trim().charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-[13.5px] font-semibold leading-snug text-[#1F2A24]">
                                    {worker.name || 'ללא שם'}
                                  </div>
                                  <div className="truncate text-[12px] leading-snug text-[#8B8478]">
                                    {worker.role || 'עובד'}
                                  </div>
                                </div>
                                <span className="text-[#C8C4B6]">
                                  <IconChevron />
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-[#E4E1D6] p-4 text-[13.5px] leading-relaxed text-[#A6A192]">
                            לא נמצאו עובדים המקושרים לסוכן זה
                          </div>
                        )}
                      </div>

                      {/* Coupon */}
                      <div>
                        <div className="mb-2.5 text-[11.5px] font-semibold text-[#8B8478]">קופון / הנחה</div>
                        {couponCode ? (
                          <div className="rounded-lg border border-[#EFEDE7] p-4 text-[13.5px] leading-relaxed">
                            <div className="flex items-center justify-between">
                              <span className="rounded-md bg-[#F3E9D6] px-2.5 py-1 text-[12.5px] font-bold text-[#A9711F]">{couponCode}</span>
                              {typeof couponDiscount === 'number' && (
                                <span className="text-[17px] font-bold text-[#A9711F]">{couponDiscount}%</span>
                              )}
                            </div>
                            {sub.couponUsed?.expiresAt && (
                              <div className={`mt-2.5 text-[12.5px] ${couponUrgent ? 'font-bold text-[#B23B2E]' : 'text-[#8B8478]'}`}>
                                בתוקף עד {formatDateOnly(sub.couponUsed.expiresAt)}
                                {typeof daysLeft === 'number' && ` · ${daysLeft <= 0 ? 'פג תוקף' : `נותרו ${daysLeft} ימים`}`}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-[#E4E1D6] p-4 text-[13.5px] leading-relaxed text-[#A6A192]">
                            ללא קופון פעיל
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </>
        )}

        {toasts.map((toast) => (
          <ToastNotification
            key={toast.id}
            type={toast.type}
            className={toast.isHiding ? 'hide' : ''}
            message={toast.message}
            onClose={() => setToasts((prev) => prev.filter((item) => item.id !== toast.id))}
          />
        ))}

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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1F2A24]/30 p-4">
            <div className="w-full max-w-xl rounded-xl bg-white p-5 text-right shadow-2xl">
              <div className="mb-4">
                <div className="text-[12px] font-semibold text-[#A9711F]">דיוור לקוח</div>
                <h2 className="mt-1 text-[19px] font-bold leading-snug text-[#1F2A24]">
                  מייל קופון ל־{couponEmailTarget.name}
                </h2>
              </div>

              <div className="mb-3">
                <label className="mb-1.5 block text-[13.5px] font-semibold text-[#1F2A24]">נושא המייל</label>
                <input
                  value={couponEmailSubject}
                  onChange={(event) => setCouponEmailSubject(event.target.value)}
                  className="w-full rounded-lg border border-[#E4E1D6] px-3.5 py-2.5 text-[13.5px] leading-relaxed outline-none focus:border-[#1F6F4A] focus:ring-2 focus:ring-[#1F6F4A]/15"
                />
              </div>

              <div className="mb-4">
                <label className="mb-1.5 block text-[13.5px] font-semibold text-[#1F2A24]">תוכן המייל</label>
                <textarea
                  value={couponEmailBody}
                  onChange={(event) => setCouponEmailBody(event.target.value)}
                  className="min-h-[200px] w-full rounded-lg border border-[#E4E1D6] px-3.5 py-2.5 text-[13.5px] leading-relaxed outline-none focus:border-[#1F6F4A] focus:ring-2 focus:ring-[#1F6F4A]/15"
                />
                <p className="mt-1.5 text-[12.5px] text-[#8B8478]">אפשר לערוך את המלל לפני השליחה.</p>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCouponEmailTarget(null)}
                  className="rounded-lg bg-[#F0EEE7] px-4 py-2.5 text-[13.5px] font-semibold leading-none text-[#1F2A24] hover:bg-[#E7E4DA]"
                >
                  ביטול
                </button>
                <button
                  type="button"
                  onClick={handleSendCouponEmail}
                  disabled={couponEmailSending}
                  className="rounded-lg bg-[#1F6F4A] px-4 py-2.5 text-[13.5px] font-semibold leading-none text-white hover:bg-[#195A3C] disabled:opacity-60"
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