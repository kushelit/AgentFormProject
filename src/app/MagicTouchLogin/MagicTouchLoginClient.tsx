'use client';

import React, {
  FormEventHandler,
  useEffect,
  useRef,
  useState,
} from 'react';

import Link from 'next/link';

import {
  useRouter,
  useSearchParams,
} from 'next/navigation';

import {
  signInWithEmailAndPassword,
  RecaptchaVerifier,
  PhoneAuthProvider,
  getMultiFactorResolver,
  PhoneMultiFactorGenerator,
  MultiFactorResolver,
  User,
} from 'firebase/auth';

import {
  doc,
  getDoc,
} from 'firebase/firestore';

import {
  auth,
  db,
} from '@/lib/firebase/firebase';

import {
  resetNavigationState,
} from '@/hooks/usePrimarySystem';

import MagicTouchAuthShell, {
  magicTouchErrorClass,
  magicTouchInputClass,
  magicTouchNoticeClass,
  magicTouchPrimaryButtonClass,
  magicTouchSecondaryButtonClass,
} from '@/components/MagicTouch/Public/MagicTouchAuthShell';

/*
 * מסך ההתחברות של MagicTouch.
 *
 * לוגיקת ההתחברות וה־MFA זהה לזו של /auth/log-in (MagicSale),
 * אבל המסך ממותג MagicTouch ותמיד מפנה ל־/MagicTouch.
 * בכוונה לא נגענו בדף ההתחברות של MagicSale.
 */

const MAGIC_TOUCH_HOME = '/MagicTouch';

type Step = 'login' | 'mfa';

type FirebaseLikeError = {
  code?: string;
  message?: string;
  name?: string;
  customData?: unknown;
  stack?: string;
};

const maskPhone = (phoneNumber?: string): string => {
  if (!phoneNumber) {
    return '';
  }

  const normalized = phoneNumber.trim();

  if (normalized.length <= 6) {
    return normalized;
  }

  const visibleStart = normalized.slice(0, 5);
  const visibleEnd = normalized.slice(-2);
  const hiddenLength = Math.max(
    normalized.length - visibleStart.length - visibleEnd.length,
    1
  );

  return `${visibleStart}${'*'.repeat(hiddenLength)}${visibleEnd}`;
};

const mapAuthError = (error?: FirebaseLikeError): string => {
  const code = error?.code;

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'כתובת המייל או הסיסמה אינם נכונים.';

    case 'auth/invalid-email':
      return 'כתובת המייל אינה תקינה.';

    case 'auth/user-disabled':
      return 'המשתמש חסום. יש לפנות לתמיכה.';

    case 'auth/too-many-requests':
      return 'בוצעו יותר מדי ניסיונות. יש להמתין ולנסות שוב מאוחר יותר.';

    case 'auth/network-request-failed':
      return 'לא ניתן להתחבר כרגע. יש לבדוק את החיבור לאינטרנט ולנסות שוב.';

    case 'auth/quota-exceeded':
      return 'חריגה ממכסת הודעות ה־SMS. יש לפנות לתמיכה.';

    case 'auth/invalid-phone-number':
      return 'מספר הטלפון הרשום לאימות אינו תקין.';

    case 'auth/captcha-check-failed':
    case 'auth/missing-recaptcha-token':
      return 'אימות האבטחה נכשל. יש לרענן את הדף ולנסות שוב.';

    case 'auth/invalid-app-credential':
    case 'auth/unauthorized-domain':
      return 'אימות האתר נכשל. יש לפנות לתמיכה.';

    case 'auth/internal-error':
      return 'לא ניתן היה להפעיל את אימות ה־SMS. יש לנסות שוב.';

    case 'auth/multi-factor-info-not-found':
      return 'אמצעי האימות הרשום למשתמש אינו זמין עוד. יש לפנות לתמיכה.';

    default:
      return code
        ? `ההתחברות נכשלה (${code}).`
        : error?.message || 'אירעה שגיאה בהתחברות.';
  }
};

const mapSmsVerificationError = (
  error?: FirebaseLikeError
): string => {
  const code = error?.code;

  switch (code) {
    case 'auth/invalid-verification-code':
      return 'קוד האימות שהוזן אינו נכון.';

    case 'auth/code-expired':
    case 'auth/session-expired':
      return 'קוד האימות פג תוקף. יש לחזור למסך ההתחברות ולבקש קוד חדש.';

    case 'auth/missing-verification-code':
      return 'לא הוזן קוד אימות.';

    case 'auth/too-many-requests':
      return 'בוצעו יותר מדי ניסיונות אימות. יש להמתין ולנסות שוב מאוחר יותר.';

    case 'auth/network-request-failed':
      return 'לא ניתן להתחבר כרגע. יש לבדוק את החיבור לאינטרנט ולנסות שוב.';

    default:
      return code
        ? `אימות הקוד נכשל (${code}).`
        : 'אירעה שגיאה באימות הקוד.';
  }
};

const logFirebaseError = (
  label: string,
  error: unknown
) => {
  const firebaseError = error as FirebaseLikeError;

  console.error(label, {
    code: firebaseError?.code,
    message: firebaseError?.message,
    name: firebaseError?.name,
    customData: firebaseError?.customData,
    stack: firebaseError?.stack,
  });
};

export default function MagicTouchLoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const wasIdleLogout =
    searchParams.get('reason') === 'idle';

  const [step, setStep] = useState<Step>('login');
  const [loading, setLoading] = useState(false);
  const [smsLoading, setSmsLoading] = useState(false);
  const [error, setError] = useState('');

  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  const [verificationId, setVerificationId] =
    useState<string | null>(null);

  const [resolverState, setResolverState] =
    useState<MultiFactorResolver | null>(null);

  const [phoneForMfa, setPhoneForMfa] =
    useState('');

  const resetRecaptcha = () => {
    try {
      recaptchaRef.current?.clear();
    } catch (clearError) {
      console.warn(
        '[MT-AUTH][RECAPTCHA] Failed to clear verifier',
        clearError
      );
    }

    recaptchaRef.current = null;

    try {
      const container = document.getElementById(
        'recaptcha-container'
      );

      if (container?.parentElement) {
        container.parentElement.removeChild(container);
      }
    } catch (containerError) {
      console.warn(
        '[MT-AUTH][RECAPTCHA] Failed to remove container',
        containerError
      );
    }
  };

  useEffect(() => {
    return () => {
      resetRecaptcha();
    };
  }, []);

  /*
   * לא מפעילים כאן verifier.verify().
   * PhoneAuthProvider.verifyPhoneNumber מפעיל את התהליך בעצמו.
   */
  const ensureRecaptcha =
    async (): Promise<RecaptchaVerifier> => {
      if (recaptchaRef.current) {
        return recaptchaRef.current;
      }

      let container = document.getElementById(
        'recaptcha-container'
      );

      if (!container) {
        container = document.createElement('div');
        container.id = 'recaptcha-container';
        document.body.appendChild(container);
      }

      const verifier = new RecaptchaVerifier(
        auth,
        'recaptcha-container',
        {
          size: 'invisible',

          'expired-callback': () => {
            console.warn(
              '[MT-AUTH][RECAPTCHA] Verification expired'
            );

            resetRecaptcha();
          },
        }
      );

      recaptchaRef.current = verifier;

      return verifier;
    };

  const validateUserAndRedirect = async (
    user: User
  ): Promise<void> => {
    const userSnapshot = await getDoc(
      doc(db, 'users', user.uid)
    );

    if (!userSnapshot.exists()) {
      throw new Error('המשתמש לא נמצא במערכת');
    }

    if (userSnapshot.data()?.isActive === false) {
      throw new Error('המנוי שלך אינו פעיל');
    }

    resetNavigationState();
    resetRecaptcha();

    router.push(MAGIC_TOUCH_HOME);
  };

  const startMfaChallenge = async (
    resolver: MultiFactorResolver
  ): Promise<void> => {
    const phoneHint =
      resolver.hints.find(
        (hint) =>
          hint.factorId ===
            PhoneMultiFactorGenerator.FACTOR_ID ||
          'phoneNumber' in hint
      ) ?? null;

    if (!phoneHint) {
      throw new Error(
        'לא נמצא אמצעי אימות טלפוני הרשום למשתמש'
      );
    }

    const phoneNumber =
      'phoneNumber' in phoneHint &&
      typeof phoneHint.phoneNumber === 'string'
        ? phoneHint.phoneNumber
        : '';

    setPhoneForMfa(phoneNumber);

    /*
     * בכל ניסיון MFA יוצרים verifier חדש,
     * כדי לא להשתמש בטוקן reCAPTCHA שכבר נוצל.
     */
    resetRecaptcha();

    const verifier = await ensureRecaptcha();
    const phoneProvider = new PhoneAuthProvider(auth);

    try {
      const newVerificationId =
        await phoneProvider.verifyPhoneNumber(
          {
            multiFactorHint: phoneHint,
            session: resolver.session,
          },
          verifier
        );

      setVerificationId(newVerificationId);
      setResolverState(resolver);
      setError('');
      setStep('mfa');
    } catch (challengeError: unknown) {
      logFirebaseError(
        '[MT-AUTH][MFA] verifyPhoneNumber failed',
        challengeError
      );

      resetRecaptcha();

      throw challengeError;
    }
  };

  const handleLogIn: FormEventHandler<
    HTMLFormElement
  > = async (event) => {
    event.preventDefault();

    if (loading) {
      return;
    }

    setLoading(true);
    setError('');

    const formData = new FormData(event.currentTarget);

    const email = String(formData.get('email') ?? '')
      .trim()
      .toLowerCase();

    const password = String(formData.get('password') ?? '');

    try {
      const credential =
        await signInWithEmailAndPassword(
          auth,
          email,
          password
        );

      await validateUserAndRedirect(credential.user);
    } catch (loginError: unknown) {
      const firebaseError =
        loginError as FirebaseLikeError;

      if (
        firebaseError?.code ===
        'auth/multi-factor-auth-required'
      ) {
        try {
          const resolver = getMultiFactorResolver(
            auth,
            loginError as never
          );

          await startMfaChallenge(resolver);
        } catch (mfaError: unknown) {
          logFirebaseError(
            '[MT-AUTH][MFA] Challenge initialization failed',
            mfaError
          );

          setError(
            mapAuthError(mfaError as FirebaseLikeError)
          );
        }
      } else {
        logFirebaseError(
          '[MT-AUTH] Sign-in failed',
          loginError
        );

        setError(mapAuthError(firebaseError));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyMfa: FormEventHandler<
    HTMLFormElement
  > = async (event) => {
    event.preventDefault();

    if (smsLoading) {
      return;
    }

    setSmsLoading(true);
    setError('');

    const formData = new FormData(event.currentTarget);

    const smsCode = String(formData.get('smsCode') ?? '')
      .replace(/\D/g, '')
      .slice(0, 6);

    try {
      if (!verificationId || !resolverState) {
        throw new Error(
          'לא קיים תהליך אימות פעיל. יש לחזור למסך ההתחברות.'
        );
      }

      if (smsCode.length !== 6) {
        throw new Error(
          'יש להזין קוד אימות בן 6 ספרות.'
        );
      }

      const assertion =
        PhoneMultiFactorGenerator.assertion(
          PhoneAuthProvider.credential(
            verificationId,
            smsCode
          )
        );

      const result =
        await resolverState.resolveSignIn(assertion);

      await validateUserAndRedirect(result.user);
    } catch (verificationError: unknown) {
      const firebaseError =
        verificationError as FirebaseLikeError;

      logFirebaseError(
        '[MT-AUTH][MFA] SMS verification failed',
        verificationError
      );

      /*
       * שגיאות מקומיות שיצרנו בעצמנו אינן מכילות code.
       */
      if (
        !firebaseError?.code &&
        firebaseError?.message
      ) {
        setError(firebaseError.message);
      } else {
        setError(
          mapSmsVerificationError(firebaseError)
        );
      }
    } finally {
      setSmsLoading(false);
    }
  };

  const handleBackToLogin = () => {
    resetRecaptcha();

    setVerificationId(null);
    setResolverState(null);
    setPhoneForMfa('');
    setError('');
    setStep('login');
  };

  if (step === 'mfa') {
    return (
      <MagicTouchAuthShell>
        <form
          key="mfa-form"
          onSubmit={handleVerifyMfa}
          className="space-y-5"
        >
          <div className="text-center">
            <h1 className="text-2xl font-semibold">
              אימות SMS
            </h1>

            <p className="mt-2 text-sm text-slate-300">
              קוד אימות נשלח אל:{' '}
              <span
                dir="ltr"
                className="font-semibold text-cyan-200"
              >
                {maskPhone(phoneForMfa)}
              </span>
            </p>
          </div>

          <div>
            <label
              htmlFor="smsCode"
              className="mb-1.5 block text-sm font-medium text-slate-200"
            >
              קוד אימות
            </label>

            <input
              id="smsCode"
              name="smsCode"
              inputMode="numeric"
              maxLength={6}
              pattern="[0-9]{6}"
              required
              disabled={smsLoading}
              className={`${magicTouchInputClass} text-center font-mono text-xl tracking-[0.4em]`}
              placeholder="123456"
              autoComplete="one-time-code"
            />
          </div>

          {error && (
            <div className={magicTouchErrorClass} role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={smsLoading}
            className={magicTouchPrimaryButtonClass}
          >
            {smsLoading ? 'מאמת...' : 'אימות קוד'}
          </button>

          <button
            type="button"
            disabled={smsLoading}
            onClick={handleBackToLogin}
            className={magicTouchSecondaryButtonClass}
          >
            חזרה למסך ההתחברות
          </button>
        </form>
      </MagicTouchAuthShell>
    );
  }

  return (
    <MagicTouchAuthShell>
      <form
        key="login-form"
        onSubmit={handleLogIn}
        className="space-y-5"
      >
        <div className="text-center">
          <h1 className="text-2xl font-semibold">
            כניסה ל-MagicTouch
          </h1>

          <p className="mt-2 text-sm text-slate-300">
            ניהול השיחות והתהליכים מול הלקוחות שלך
          </p>
        </div>

        {wasIdleLogout && (
          <div className={magicTouchNoticeClass} role="status">
            נותקת מהמערכת עקב חוסר פעילות.
            <br />
            יש להתחבר מחדש כדי להמשיך בעבודה.
          </div>
        )}

        <div>
          <label
            htmlFor="email"
            className="mb-1.5 block text-sm font-medium text-slate-200"
          >
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
            className={magicTouchInputClass}
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-sm font-medium text-slate-200"
          >
            סיסמה
          </label>

          <input
            id="password"
            name="password"
            type="password"
            dir="ltr"
            required
            disabled={loading}
            autoComplete="current-password"
            className={magicTouchInputClass}
          />
        </div>

        <div className="text-sm">
          <Link
            href="/MagicTouchResetPassword"
            className="text-cyan-300 hover:text-cyan-200 hover:underline"
          >
            שכחת סיסמה?
          </Link>
        </div>

        {error && (
          <div className={magicTouchErrorClass} role="alert">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className={magicTouchPrimaryButtonClass}
        >
          {loading ? 'מתחבר/ת...' : 'כניסה'}
        </button>

        <div className="text-center text-sm text-slate-300">
          <span>עדיין אין לך חשבון? </span>

          <Link
            href="/MagicTouchSignUp"
            className="font-semibold text-cyan-300 hover:text-cyan-200 hover:underline"
          >
            הצטרפות ל-MagicTouch
          </Link>
        </div>
      </form>
    </MagicTouchAuthShell>
  );
}
