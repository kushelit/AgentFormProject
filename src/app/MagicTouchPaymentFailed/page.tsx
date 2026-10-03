'use client';

import Link from 'next/link';

import MagicTouchAuthShell, {
  magicTouchPrimaryButtonClass,
} from '@/components/MagicTouch/Public/MagicTouchAuthShell';

export default function MagicTouchPaymentFailedPage() {
  return (
    <MagicTouchAuthShell>
      <div className="space-y-5 text-center">
        <h1 className="text-2xl font-semibold">התשלום לא הושלם</h1>

        <p className="text-sm leading-6 text-slate-300">
          לא בוצע חיוב והחשבון לא נפתח.
          <br />
          אפשר לנסות שוב, או לפנות אלינו ונשמח לעזור.
        </p>

        <div className="space-y-3">
          <Link href="/MagicTouchSignUp" className={`${magicTouchPrimaryButtonClass} block`}>
            חזרה להרשמה
          </Link>
          <Link
            href="/MagicTouchSupport"
            className="block text-sm text-cyan-300 hover:text-cyan-200 hover:underline"
          >
            לעמוד התמיכה
          </Link>
        </div>
      </div>
    </MagicTouchAuthShell>
  );
}
