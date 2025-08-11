'use client';

import React, { FormEventHandler, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  RecaptchaVerifier,
  PhoneAuthProvider,
  getMultiFactorResolver,
  PhoneMultiFactorGenerator,
  multiFactor,
  MultiFactorResolver,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/firebase';

type Step = 'login' | 'mfa' | 'enroll';

export default function LogInPage() {
  const router = useRouter();

  // UI
  const [step, setStep] = useState<Step>('login');
  const [loading, setLoading] = useState(false);
  const [smsLoading, setSmsLoading] = useState(false);
  const [error, setError] = useState('');

  // MFA state
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [resolverState, setResolverState] = useState<MultiFactorResolver | null>(null);
  const [phoneForMfa, setPhoneForMfa] = useState<string>('');

  // ניקוי reCAPTCHA והקונטיינר ב-unmount
  useEffect(() => {
    return () => {
      try {
        recaptchaRef.current?.clear();
      } catch {}
      try {
        const el = document.getElementById('recaptcha-container');
        if (el && el.parentElement) el.parentElement.removeChild(el);
      } catch {}
      recaptchaRef.current = null;
    };
  }, []);

  // יוצר/מחזיר RecaptchaVerifier יחיד ומרנדר אותו (חשוב!)
  const ensureRecaptcha = async () => {
    if (!recaptchaRef.current) {
      // יצירת קונטיינר דינמית (לא מוסיפים div ב-JSX!)
      let el = document.getElementById('recaptcha-container');
      if (!el) {
        el = document.createElement('div');
        el.id = 'recaptcha-container';
        el.style.minHeight = '48px';
        // מיקום בגוף הדף — לא בתוך קומפוננטה שעלולה להתחלף
        document.body.appendChild(el);
      }

      // חתימה נכונה של SDK מודולרי: auth → container → params
      recaptchaRef.current = new RecaptchaVerifier(
        auth,
        'recaptcha-container',
        {
          size: 'invisible',
          callback: (token: string) => {
            // דיבוג — אפשר להשאיר/להסיר
            console.log('✅ reCAPTCHA solved. Token:', token);
          },
        }
      );

      await recaptchaRef.current.render();
    }
    return recaptchaRef.current!;
  };

  // אתגר MFA (כשכבר יש פקטור רשום)
  const startMfaChallenge = async (resolver: MultiFactorResolver) => {
    const verifier = await ensureRecaptcha();

    // דואגים ל-token לפני הקריאה (מונע MISSING_RECAPTCHA_TOKEN)
    await verifier.verify().catch(() => null);

    const provider = new PhoneAuthProvider(auth);
    const hint = resolver.hints.find((h) => 'phoneNumber' in h) ?? resolver.hints[0];

    const id = await provider.verifyPhoneNumber(
      { multiFactorHint: hint, session: resolver.session },
      verifier
    );

    setVerificationId(id);
    setResolverState(resolver);
    setStep('mfa');
  };

  // Enrollment (כשדורשים MFA אבל אין פקטור למשתמש)
  const startEnroll = async (phoneE164: string) => {
    const user = auth.currentUser!;
    const mfaUser = multiFactor(user);
    const verifier = await ensureRecaptcha();

    // דואגים ל-token לפני הקריאה
    await verifier.verify().catch(() => null);

    const session = await mfaUser.getSession();
    const provider = new PhoneAuthProvider(auth);

    const id = await provider.verifyPhoneNumber(
      { phoneNumber: phoneE164, session },
      verifier
    );

    setVerificationId(id);
    setStep('enroll');
  };

  // שלב 1: לוגין בסיסי
  const handleLogIn: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const values = new FormData(e.currentTarget);
    const email = (values.get('email') as string) ?? '';
    const password = (values.get('password') as string) ?? '';

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);

      // בדיקת משתמש ב-Firestore
      const snap = await getDoc(doc(db, 'users', cred.user.uid));
      if (!snap.exists()) throw new Error('המשתמש לא נמצא במערכת');
      const data = snap.data() as any;

      if (data?.isActive === false) throw new Error('המנוי שלך אינו פעיל');

      const requireMfa = !!data?.mfaRequired;
      const phone = (data?.phone as string) || '';
      setPhoneForMfa(phone);

      // אם דורשים MFA ועדיין אין פקטור → הרשמה (Enrollment)
      if (requireMfa && auth.currentUser && multiFactor(auth.currentUser).enrolledFactors.length === 0) {
        if (!phone || !phone.startsWith('+')) throw new Error('מספר טלפון לא תקין בנתוני המשתמש');
        await startEnroll(phone);
        return;
      }

      // בלי MFA
      router.push('/NewAgentForm');
    } catch (err: any) {
      if (err?.code === 'auth/multi-factor-auth-required') {
        try {
          const resolver = getMultiFactorResolver(auth, err);
          await startMfaChallenge(resolver);
          return;
        } catch (inner: any) {
          setError(inner?.message || 'שגיאה בהפעלת MFA');
        }
      } else {
        setError(err?.message || 'שגיאה בהתחברות');
      }
    } finally {
      setLoading(false);
    }
  };

  // שלב 2א: אימות קוד לאתגר MFA
  const handleVerifyMfa: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setSmsLoading(true);
    setError('');

    const values = new FormData(e.currentTarget);
    const code = (values.get('smsCode') as string) ?? '';

    try {
      if (!verificationId || !resolverState) throw new Error('אין מזהה אימות פעיל');
      const cred = PhoneAuthProvider.credential(verificationId, code);
      const assertion = PhoneMultiFactorGenerator.assertion(cred);

      await resolverState.resolveSignIn(assertion);
      router.push('/NewAgentForm');
    } catch (err: any) {
      let msg = 'קוד שגוי או פג תוקף';
      if (err?.code === 'auth/too-many-requests') msg = 'יותר מדי ניסיונות. נסה/י מאוחר יותר';
      setError(msg);
    } finally {
      setSmsLoading(false);
    }
  };

  // שלב 2ב: אימות קוד ל-Enroll
  const handleVerifyEnroll: FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setSmsLoading(true);
    setError('');

    const values = new FormData(e.currentTarget);
    const code = (values.get('smsCode') as string) ?? '';

    try {
      if (!verificationId || !auth.currentUser) throw new Error('אין מזהה אימות פעיל');
      const cred = PhoneAuthProvider.credential(verificationId, code);
      const assertion = PhoneMultiFactorGenerator.assertion(cred);

      await multiFactor(auth.currentUser).enroll(assertion, 'Main phone');
      router.push('/NewAgentForm');
    } catch (err: any) {
      let msg = 'קוד שגוי או פג תוקף';
      if (err?.code === 'auth/too-many-requests') msg = 'יותר מדי ניסיונות. נסה/י מאוחר יותר';
      setError(msg);
    } finally {
      setSmsLoading(false);
    }
  };

  // ===== RENDERS =====

  if (step === 'mfa') {
    return (
      <div className="max-w-md w-full mx-auto p-6 bg-white rounded shadow">
        <form onSubmit={handleVerifyMfa} className="space-y-4">
          <h1 className="text-2xl font-bold text-center text-blue-900">אימות SMS</h1>
          <p className="text-center text-sm text-gray-600">הזיני את הקוד שנשלח אלייך</p>

          <input
            name="smsCode"
            maxLength={6}
            pattern="[0-9]{6}"
            required
            disabled={smsLoading}
            className="w-full border border-gray-300 rounded px-3 py-3 text-center text-xl font-mono"
            placeholder="123456"
            autoComplete="one-time-code"
          />

          {error && <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">{error}</div>}

          <button
            type="submit"
            disabled={smsLoading}
            className="w-full bg-blue-900 text-white py-3 rounded hover:bg-blue-800 disabled:bg-gray-400"
          >
            {smsLoading ? 'מאמת...' : 'אמת קוד'}
          </button>
        </form>
      </div>
    );
  }

  if (step === 'enroll') {
    return (
      <div className="max-w-md w-full mx-auto p-6 bg-white rounded shadow">
        <form onSubmit={handleVerifyEnroll} className="space-y-4">
          <h1 className="text-2xl font-bold text-center text-blue-900">רישום אימות דו־שלבי</h1>
          <p className="text-center text-sm text-gray-600">
            נשלח קוד למספר: <span className="font-semibold">{phoneForMfa}</span>
          </p>

          <input
            name="smsCode"
            maxLength={6}
            pattern="[0-9]{6}"
            required
            disabled={smsLoading}
            className="w-full border border-gray-300 rounded px-3 py-3 text-center text-xl font-mono"
            placeholder="123456"
            autoComplete="one-time-code"
          />

          {error && <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">{error}</div>}

          <button
            type="submit"
            disabled={smsLoading}
            className="w-full bg-blue-900 text-white py-3 rounded hover:bg-blue-800 disabled:bg-gray-400"
          >
            {smsLoading ? 'מאמת...' : 'אמת וסיים רישום'}
          </button>
        </form>
      </div>
    );
  }

  // Login
  return (
    <div className="max-w-md w-full mx-auto p-6 bg-white rounded shadow">
      <form onSubmit={handleLogIn} className="space-y-4">
        <h1 className="text-2xl font-bold text-center text-blue-900">התחברות</h1>

        <div>
          <label htmlFor="email" className="block text-sm font-medium mb-2">כתובת מייל</label>
          <input
            id="email"
            name="email"
            type="email"
            required
            disabled={loading}
            autoComplete="email"
            className="w-full border border-gray-300 rounded px-3 py-2 disabled:bg-gray-100"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium mb-2">סיסמה</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            disabled={loading}
            autoComplete="current-password"
            className="w-full border border-gray-300 rounded px-3 py-2 disabled:bg-gray-100"
          />
        </div>

        <div className="text-sm text-right">
          <Link href="/auth/reset-password" className="text-blue-600 hover:underline">שכחת סיסמה?</Link>
        </div>

        {error && <div className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-900 text-white py-3 rounded hover:bg-blue-800 disabled:bg-gray-400"
        >
          {loading ? 'מתחבר/ת...' : 'כניסה'}
        </button>

        <div className="text-center mt-4 text-sm">
          <span>אינך רשום/ה? </span>
          <Link href="/subscription-sign-up" className="text-blue-600 font-semibold hover:underline">להרשמה</Link>
        </div>
      </form>
    </div>
  );
}
