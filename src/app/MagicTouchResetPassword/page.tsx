'use client';

import { FormEventHandler, useState } from 'react';
import Link from 'next/link';

import MagicTouchAuthShell, {
  magicTouchErrorClass,
  magicTouchInputClass,
  magicTouchPrimaryButtonClass,
} from '@/components/MagicTouch/Public/MagicTouchAuthShell';

export default function MagicTouchResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/magic-touch/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'שליחת המייל נכשלה. יש לנסות שוב.');
      }

      setSent(true);
    } catch (submitError: any) {
      setError(submitError?.message || 'שליחת המייל נכשלה. יש לנסות שוב.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <MagicTouchAuthShell>
      {sent ? (
        <div className="space-y-5 text-center">
          <h1 className="text-2xl font-semibold">בדקו את תיבת המייל</h1>

          <p className="text-sm leading-6 text-slate-300">
            אם הכתובת <span dir="ltr" className="font-semibold text-cyan-200">{email}</span> רשומה
            ב-MagicTouch, נשלח אליה קישור לקביעת סיסמה חדשה.
            <br />
            אם המייל לא הגיע תוך כמה דקות, כדאי לבדוק גם בתיקיית הספאם.
          </p>

          <Link href="/MagicTouchLogin" className={`${magicTouchPrimaryButtonClass} block`}>
            חזרה לכניסה
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="text-center">
            <h1 className="text-2xl font-semibold">איפוס סיסמה</h1>
            <p className="mt-2 text-sm text-slate-300">
              נשלח אליך מייל עם קישור לקביעת סיסמה חדשה
            </p>
          </div>

          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-200">
              כתובת מייל
            </label>
            <input
              id="email"
              name="email"
              type="email"
              dir="ltr"
              required
              disabled={loading}
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={magicTouchInputClass}
            />
          </div>

          {error && (
            <div className={magicTouchErrorClass} role="alert">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className={magicTouchPrimaryButtonClass}>
            {loading ? 'שולח...' : 'שליחת קישור לאיפוס'}
          </button>

          <div className="text-center text-sm">
            <Link href="/MagicTouchLogin" className="text-cyan-300 hover:text-cyan-200 hover:underline">
              חזרה לכניסה
            </Link>
          </div>
        </form>
      )}
    </MagicTouchAuthShell>
  );
}
