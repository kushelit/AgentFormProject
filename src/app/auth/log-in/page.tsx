'use client';

import React, {
  FormEventHandler,
  useEffect,
  useRef,
  useState,
} from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

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

type Step = 'login' | 'mfa';

type FirebaseLikeError = {
  code?: string;
  message?: string;
  name?: string;
  customData?: unknown;
  stack?: string;
};

/**
 * המרת מספר טלפון לתצוגה מוסתרת.
 */
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

/**
 * הודעות שגיאה לשלב ההתחברות ושליחת SMS.
 */
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
      return 'המשתמש חסום ב־Firebase Authentication.';

    case 'auth/too-many-requests':
      return 'בוצעו יותר מדי ניסיונות. יש להמתין ולנסות שוב מאוחר יותר.';

    case 'auth/network-request-failed':
      return 'לא ניתן להתחבר ל־Firebase. בדקי את החיבור לאינטרנט ונסי שוב.';

    case 'auth/quota-exceeded':
      return 'חריגה ממכסת הודעות ה־SMS. יש לפנות לתמיכה.';

    case 'auth/invalid-phone-number':
      return 'מספר הטלפון הרשום עבור MFA אינו תקין.';

    case 'auth/captcha-check-failed':
      return 'אימות האבטחה נכשל. רענני את הדף ונסי שוב.';

    case 'auth/missing-recaptcha-token':
      return 'לא התקבל אישור reCAPTCHA. רענני את הדף ונסי שוב.';

    case 'auth/invalid-app-credential':
      return 'אימות האתר מול Firebase נכשל. יש לבדוק את הגדרות הדומיין וה־API Key.';

    case 'auth/unauthorized-domain':
      return 'הדומיין הנוכחי אינו מורשה ב־Firebase Authentication.';

    case 'auth/internal-error':
      return 'Firebase לא הצליח להפעיל את אימות ה־SMS. פרטי התקלה נרשמו ב־Console.';

    case 'auth/multi-factor-info-not-found':
      return 'אמצעי ה־MFA הרשום למשתמש אינו זמין עוד.';

    case 'auth/multi-factor-auth-required':
      return 'נדרש אימות נוסף באמצעות SMS.';

    default:
      return code
        ? `ההתחברות נכשלה (${code}).`
        : error?.message || 'אירעה שגיאה בהתחברות.';
  }
};

/**
 * הודעות שגיאה לשלב אימות קוד ה־SMS.
 */
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
      return 'לא ניתן להתחבר ל־Firebase. בדקי את החיבור לאינטרנט ונסי שוב.';

    case 'auth/internal-error':
      return 'Firebase לא הצליח לאמת את הקוד. פרטי התקלה נרשמו ב־Console.';

    default:
      return code
        ? `אימות הקוד נכשל (${code}).`
        : 'אירעה שגיאה באימות הקוד.';
  }
};

export default function LogInPage() {
  const router = useRouter();

  // ===== UI STATE =====

  const [step, setStep] = useState<Step>('login');
  const [loading, setLoading] = useState(false);
  const [smsLoading, setSmsLoading] = useState(false);
  const [error, setError] = useState('');

  // ===== MFA STATE =====

  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  const [verificationId, setVerificationId] =
    useState<string | null>(null);

  const [resolverState, setResolverState] =
    useState<MultiFactorResolver | null>(null);

  const [phoneForMfa, setPhoneForMfa] =
    useState('');

  /**
   * ניקוי ה־reCAPTCHA.
   */
  const resetRecaptcha = () => {
    try {
      recaptchaRef.current?.clear();
    } catch (clearError) {
      console.warn(
        '[AUTH][RECAPTCHA] Failed to clear verifier',
        clearError
      );
    }

    recaptchaRef.current = null;

    try {
      const container = document.getElementById(
        'recaptcha-container'
      );

      if (container) {
        container.innerHTML = '';
      }
    } catch (containerError) {
      console.warn(
        '[AUTH][RECAPTCHA] Failed to clear container',
        containerError
      );
    }
  };

  /**
   * ניקוי בעת יציאה מהדף.
   */
  useEffect(() => {
    return () => {
      try {
        recaptchaRef.current?.clear();
      } catch {
        // אין צורך להציג שגיאה ב־unmount
      }

      recaptchaRef.current = null;

      try {
        const container = document.getElementById(
          'recaptcha-container'
        );

        if (container?.parentElement) {
          container.parentElement.removeChild(container);
        }
      } catch {
        // אין צורך להציג שגיאה ב־unmount
      }
    };
  }, []);

  /**
   * יצירת reCAPTCHA חדש.
   *
   * חשוב:
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

      container.innerHTML = '';

      const verifier = new RecaptchaVerifier(
        auth,
        'recaptcha-container',
        {
          size: 'invisible',

          callback: () => {
            console.info(
              '[AUTH][RECAPTCHA] Verification completed'
            );
          },

          'expired-callback': () => {
            console.warn(
              '[AUTH][RECAPTCHA] Verification expired'
            );

            resetRecaptcha();
          },
        }
      );

      try {
        const widgetId = await verifier.render();

        console.info(
          '[AUTH][RECAPTCHA] Rendered successfully',
          {
            widgetId,
          }
        );

        recaptchaRef.current = verifier;

        return verifier;
      } catch (renderError) {
        console.error(
          '[AUTH][RECAPTCHA] Render failed',
          renderError
        );

        try {
          verifier.clear();
        } catch {
          // אין צורך לזרוק שגיאה נוספת
        }

        recaptchaRef.current = null;

        throw renderError;
      }
    };

  /**
   * בדיקת המשתמש ב־Firestore לאחר התחברות מלאה.
   */
  const validateUserAndRedirect = async (
    user: User
  ): Promise<void> => {
    console.info('[AUTH] Validating Firestore user', {
      uid: user.uid,
    });

    const userRef = doc(db, 'users', user.uid);
    const userSnapshot = await getDoc(userRef);

    if (!userSnapshot.exists()) {
      throw new Error('המשתמש לא נמצא במערכת');
    }

    const userData = userSnapshot.data();

    if (userData?.isActive === false) {
      throw new Error('המנוי שלך אינו פעיל');
    }

    console.info('[AUTH] Login completed successfully', {
      uid: user.uid,
    });

    resetRecaptcha();
    router.push('/NewAgentForm');
  };

  /**
   * הפעלת אתגר MFA ושליחת קוד SMS.
   */
  const startMfaChallenge = async (
    resolver: MultiFactorResolver
  ): Promise<void> => {
    console.info('[AUTH][MFA] Starting MFA challenge', {
      hintCount: resolver.hints.length,
      hints: resolver.hints.map((hint) => ({
        factorId: hint.factorId,
        displayName: hint.displayName || null,
        hasPhoneNumber: 'phoneNumber' in hint,
      })),
    });

    const phoneHint =
      resolver.hints.find(
        (hint) =>
          hint.factorId ===
            PhoneMultiFactorGenerator.FACTOR_ID ||
          'phoneNumber' in hint
      ) ?? null;

    if (!phoneHint) {
      console.error(
        '[AUTH][MFA] No phone factor was found',
        {
          hints: resolver.hints.map((hint) => ({
            factorId: hint.factorId,
            displayName: hint.displayName || null,
          })),
        }
      );

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
     * בכל ניסיון MFA יוצרים verifier חדש.
     * כך לא משתמשים בטוקן reCAPTCHA ישן או שכבר נוצל.
     */
    resetRecaptcha();

    const verifier = await ensureRecaptcha();
    const phoneProvider = new PhoneAuthProvider(auth);

    try {
      console.info(
        '[AUTH][MFA] Requesting SMS challenge',
        {
          factorId: phoneHint.factorId,
          phoneMasked: maskPhone(phoneNumber),
        }
      );

      /*
       * אין להפעיל verifier.verify() ידנית.
       * verifyPhoneNumber משתמש ב־verifier בעצמו.
       */
      const newVerificationId =
        await phoneProvider.verifyPhoneNumber(
          {
            multiFactorHint: phoneHint,
            session: resolver.session,
          },
          verifier
        );

      console.info(
        '[AUTH][MFA] SMS challenge created successfully'
      );

      setVerificationId(newVerificationId);
      setResolverState(resolver);
      setError('');
      setStep('mfa');
    } catch (challengeError: unknown) {
      const firebaseError =
        challengeError as FirebaseLikeError;

      console.error(
        '[AUTH][MFA] verifyPhoneNumber failed',
        {
          code: firebaseError?.code,
          message: firebaseError?.message,
          name: firebaseError?.name,
          customData: firebaseError?.customData,
          stack: firebaseError?.stack,
        }
      );

      resetRecaptcha();

      throw challengeError;
    }
  };

  /**
   * שלב ראשון: התחברות עם מייל וסיסמה.
   */
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

    const email = String(
      formData.get('email') ?? ''
    )
      .trim()
      .toLowerCase();

    const password = String(
      formData.get('password') ?? ''
    );

    try {
      console.info('[AUTH] Password sign-in started');

      const credential =
        await signInWithEmailAndPassword(
          auth,
          email,
          password
        );

      /*
       * אם הפעולה הצליחה בלי multi-factor-auth-required,
       * למשתמש אין דרישת MFA פעילה.
       */
      await validateUserAndRedirect(credential.user);
    } catch (loginError: unknown) {
      const firebaseError =
        loginError as FirebaseLikeError;

      console.error('[AUTH] Sign-in failed', {
        code: firebaseError?.code,
        message: firebaseError?.message,
        name: firebaseError?.name,
        customData: firebaseError?.customData,
        stack: firebaseError?.stack,
      });

      if (
        firebaseError?.code ===
        'auth/multi-factor-auth-required'
      ) {
        try {
          console.info(
            '[AUTH][MFA] MFA is required for this user'
          );

          const resolver = getMultiFactorResolver(
            auth,
            loginError as never
          );

          await startMfaChallenge(resolver);
        } catch (mfaError: unknown) {
          const firebaseMfaError =
            mfaError as FirebaseLikeError;

          console.error(
            '[AUTH][MFA] Challenge initialization failed',
            {
              code: firebaseMfaError?.code,
              message: firebaseMfaError?.message,
              name: firebaseMfaError?.name,
              customData:
                firebaseMfaError?.customData,
              stack: firebaseMfaError?.stack,
            }
          );

          setError(mapAuthError(firebaseMfaError));
        }
      } else {
        setError(mapAuthError(firebaseError));
      }
    } finally {
      setLoading(false);
    }
  };

  /**
   * שלב שני: אימות קוד ה־SMS.
   */
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

    const smsCode = String(
      formData.get('smsCode') ?? ''
    )
      .replace(/\D/g, '')
      .slice(0, 6);

    try {
      if (!verificationId) {
        throw new Error(
          'לא קיים מזהה אימות פעיל. יש לחזור למסך ההתחברות.'
        );
      }

      if (!resolverState) {
        throw new Error(
          'לא קיים תהליך MFA פעיל. יש לחזור למסך ההתחברות.'
        );
      }

      if (smsCode.length !== 6) {
        throw new Error(
          'יש להזין קוד אימות בן 6 ספרות.'
        );
      }

      console.info(
        '[AUTH][MFA] Verifying SMS code'
      );

      const phoneCredential =
        PhoneAuthProvider.credential(
          verificationId,
          smsCode
        );

      const assertion =
        PhoneMultiFactorGenerator.assertion(
          phoneCredential
        );

      const result =
        await resolverState.resolveSignIn(
          assertion
        );

      console.info(
        '[AUTH][MFA] SMS code verified successfully'
      );

      await validateUserAndRedirect(result.user);
    } catch (verificationError: unknown) {
      const firebaseError =
        verificationError as FirebaseLikeError;

      console.error(
        '[AUTH][MFA] SMS verification failed',
        {
          code: firebaseError?.code,
          message: firebaseError?.message,
          name: firebaseError?.name,
          customData: firebaseError?.customData,
          stack: firebaseError?.stack,
        }
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

  /**
   * חזרה למסך ההתחברות.
   */
  const handleBackToLogin = () => {
    resetRecaptcha();

    setVerificationId(null);
    setResolverState(null);
    setPhoneForMfa('');
    setError('');
    setStep('login');
  };

  // ===== MFA SCREEN =====

  if (step === 'mfa') {
    return (
      <div
        className="max-w-md w-full mx-auto p-6 bg-white rounded shadow"
        dir="rtl"
      >
        <form
          onSubmit={handleVerifyMfa}
          className="space-y-4"
        >
          <h1 className="text-2xl font-bold text-center text-blue-900">
            אימות SMS
          </h1>

          <p className="text-center text-sm text-gray-600">
            קוד אימות נשלח אל:{' '}
            <span className="font-semibold">
              {maskPhone(phoneForMfa)}
            </span>
          </p>

          <div>
            <label
              htmlFor="smsCode"
              className="block text-sm font-medium mb-2"
            >
              קוד אימות
            </label>

          <input
  id="smsCode"
  name="smsCode"
  type="text"
  inputMode="numeric"
  maxLength={6}
  pattern="[0-9]{6}"
  required
  disabled={smsLoading}
  className="w-full border border-gray-300 rounded px-3 py-3 text-center text-xl font-mono disabled:bg-gray-100"
  placeholder="123456"
  autoComplete="one-time-code"
/>
          </div>

          {error && (
            <div
              className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm"
              role="alert"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={smsLoading}
            className="w-full bg-blue-900 text-white py-3 rounded hover:bg-blue-800 disabled:bg-gray-400"
          >
            {smsLoading
              ? 'מאמת...'
              : 'אימות קוד'}
          </button>

          <button
            type="button"
            disabled={smsLoading}
            onClick={handleBackToLogin}
            className="w-full border border-gray-300 text-gray-700 py-3 rounded hover:bg-gray-50 disabled:bg-gray-100"
          >
            חזרה למסך ההתחברות
          </button>
        </form>
      </div>
    );
  }

  // ===== LOGIN SCREEN =====

  return (
    <div
      className="max-w-md w-full mx-auto p-6 bg-white rounded shadow"
      dir="rtl"
    >
      <form
        onSubmit={handleLogIn}
        className="space-y-4"
      >
        <h1 className="text-2xl font-bold text-center text-blue-900">
          התחברות
        </h1>

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium mb-2"
          >
            כתובת מייל
          </label>

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
          <label
            htmlFor="password"
            className="block text-sm font-medium mb-2"
          >
            סיסמה
          </label>

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
          <Link
            href="/auth/reset-password"
            className="text-blue-600 hover:underline"
          >
            שכחת סיסמה?
          </Link>
        </div>

        {error && (
          <div
            className="bg-red-50 border border-red-200 rounded p-3 text-red-700 text-sm"
            role="alert"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-900 text-white py-3 rounded hover:bg-blue-800 disabled:bg-gray-400"
        >
          {loading
            ? 'מתחבר/ת...'
            : 'כניסה'}
        </button>

        <div className="text-center mt-4 text-sm">
          <span>אינך רשום/ה? </span>

          <Link
            href="/subscription-sign-up"
            className="text-blue-600 font-semibold hover:underline"
          >
            להרשמה
          </Link>
        </div>
      </form>
    </div>
  );
}