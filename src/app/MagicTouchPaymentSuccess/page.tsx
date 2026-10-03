'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import MagicTouchAuthShell, {
  magicTouchPrimaryButtonClass,
} from '@/components/MagicTouch/Public/MagicTouchAuthShell';

function PaymentSuccessContent() {
  const searchParams = useSearchParams();

  const fullName = searchParams.get('fullName') || '';
  const email = searchParams.get('email') || '';

  if (!fullName || !email) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-semibold">חסרים פרטי תשלום</h1>
        <p className="text-sm text-slate-300">
          אם בוצע חיוב, החשבון ייפתח בדקות הקרובות.
          אם לא התקבל מייל, נשמח לעזור בעמוד התמיכה.
        </p>
        <Link href="/MagicTouchSupport" className={`${magicTouchPrimaryButtonClass} block`}>
          לעמוד התמיכה
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-400/15 text-2xl text-emerald-300">
        ✓
      </div>

      <h1 className="text-2xl font-semibold">
        תודה, {fullName}!
      </h1>

      <p className="text-sm leading-6 text-slate-300">
        התשלום התקבל והחשבון שלך ב-MagicTouch נפתח.
        <br />
        שלחנו מייל ל-<span dir="ltr" className="font-semibold text-cyan-200">{email}</span> עם
        קישור לקביעת סיסמה.
      </p>

      <p className="text-xs text-slate-400">
        אם המייל לא הגיע תוך כמה דקות, כדאי לבדוק בתיקיית הספאם,
        או לבקש קישור חדש בעמוד איפוס הסיסמה.
      </p>

      <div className="space-y-3">
        <Link href="/MagicTouchLogin" className={`${magicTouchPrimaryButtonClass} block`}>
          לכניסה ל-MagicTouch
        </Link>
        <Link
          href="/MagicTouchResetPassword"
          className="block text-sm text-cyan-300 hover:text-cyan-200 hover:underline"
        >
          לא קיבלתי מייל – שליחת קישור חדש
        </Link>
      </div>
    </div>
  );
}

export default function MagicTouchPaymentSuccessPage() {
  return (
    <MagicTouchAuthShell>
      <Suspense fallback={<div className="text-center text-slate-300">טוען...</div>}>
        <PaymentSuccessContent />
      </Suspense>
    </MagicTouchAuthShell>
  );
}
