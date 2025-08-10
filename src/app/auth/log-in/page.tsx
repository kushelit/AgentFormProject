'use client';
import { useAuth } from "@/lib/firebase/AuthContext";
import { FormEventHandler, useState } from "react";
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';
import { auth } from '@/lib/firebase/firebase';

declare global {
  interface Window {
    recaptchaVerifier?: RecaptchaVerifier;
    confirmationResult?: ConfirmationResult;
  }
}

export default function LogInPage() {
  const { logIn } = useAuth();
  const [error, setError] = useState('');
  const [step, setStep] = useState<'login' | 'sms'>('login');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [userCredential, setUserCredential] = useState<any>(null);
  const router = useRouter();

  const handleLogIn: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const email = values.get("email") as string | null;
    const password = values.get("password") as string | null;

    if (!email || !password) return;

    try {
      const credential = await logIn(email, password);
      const userId = credential.user.uid;
      
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) {
        throw new Error('המשתמש לא נמצא במערכת');
      }

      const userData = userDoc.data();
      if (userData?.isActive === false) {
        throw new Error('המנוי שלך אינו פעיל');
      }

      if (userData?.mfaRequired === true) {
        const userPhoneNumber = userData?.phone;
        console.log('User phone:', userPhoneNumber);
        
        if (!userPhoneNumber) {
          throw new Error('לא נמצא מספר טלפון עבור המשתמש');
        }

        if (!userPhoneNumber.startsWith('+')) {
          throw new Error('מספר הטלפון חייב להיות בפורמט בינלאומי (מתחיל ב-+)');
        }

        setUserCredential(credential);
        setPhoneNumber(userPhoneNumber);
        
        if (window.recaptchaVerifier) {
          try {
            window.recaptchaVerifier.clear();
            delete window.recaptchaVerifier;
          } catch (e) {
            console.log('Error clearing recaptcha:', e);
          }
        }

        const recaptchaContainer = document.getElementById('recaptcha-container');
        if (recaptchaContainer) {
          recaptchaContainer.innerHTML = '';
        }

        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          size: 'invisible',
          callback: (response: any) => {
            console.log('reCAPTCHA solved:', response);
          },
          'expired-callback': () => {
            console.log('reCAPTCHA expired');
          }
        });

        try {
          const confirmResult = await signInWithPhoneNumber(auth, userPhoneNumber, window.recaptchaVerifier);
          window.confirmationResult = confirmResult;
          setStep('sms');
        } catch (smsError: any) {
          console.error('SMS Error details:', smsError);
          if (smsError.code === 'auth/invalid-app-credential') {
            throw new Error('שגיאה בהגדרות האימות. נסה שוב מאוחר יותר.');
          }
          if (smsError.code === 'auth/too-many-requests') {
            throw new Error('יותר מדי ניסיונות. נסה שוב בעוד כמה דקות.');
          }
          throw smsError;
        }
      } else {
        router.push('/NewAgentForm');
      }

    } catch (err: any) {
      console.error({ err });
      setError(err.message || 'אירעה שגיאה בעת ההתחברות');
    }
  };

  const handleSMSVerification: FormEventHandler<HTMLFormElement> = async (event) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const smsCode = values.get("smsCode") as string | null;

    if (!smsCode || !window.confirmationResult) return;

    try {
      const result = await window.confirmationResult.confirm(smsCode);
      
      console.log('SMS verification successful!');
      console.log('User UID:', result.user.uid);
      console.log('Original user UID:', userCredential?.user.uid);
      
      setTimeout(() => {
        console.log('🚀 Redirecting to NewAgentForm...');
        router.push('/NewAgentForm');
      }, 1000);
      
    } catch (err: any) {
      console.error('SMS verification error:', { err });
      if (err.code === 'auth/invalid-verification-code') {
        setError('קוד SMS שגוי');
      } else if (err.code === 'auth/code-expired') {
        setError('קוד SMS פג תוקף');
      } else {
        setError('קוד SMS שגוי או פג תוקף');
      }
    }
  };

  const resendSMS = async () => {
    if (!phoneNumber) return;
    
    try {
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
      }

      const recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'normal',
        callback: (response: any) => {
          console.log('reCAPTCHA solved:', response);
        }
      });

      const confirmResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
      window.confirmationResult = confirmResult;
      setError('');
    } catch (err: any) {
      console.error({ err });
      setError('שגיאה בשליחת SMS חוזרת');
    }
  };

  if (step === 'sms') {
    return (
      <div className="max-w-md w-full mx-auto p-6 bg-white rounded shadow">
        <form onSubmit={handleSMSVerification} className="space-y-4">
          <h1 className="text-2xl font-bold text-center text-blue-900">אימות SMS</h1>
          
          <p className="text-sm text-gray-600 text-center">
            נשלח קוד אימות למספר: {phoneNumber}
          </p>

          <div>
            <label htmlFor="smsCode" className="block text-sm font-medium">קוד אימות</label>
            <input 
              type="text" 
              id="smsCode" 
              name="smsCode" 
              required 
              maxLength={6}
              className="w-full border border-gray-300 rounded px-3 py-2 text-center text-lg"
              placeholder="הכנס קוד בן 6 ספרות"
            />
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <button type="submit" className="w-full bg-blue-900 text-white py-2 rounded hover:bg-blue-800">
            אמת קוד
          </button>

          <button 
            type="button" 
            onClick={resendSMS}
            className="w-full bg-gray-500 text-white py-2 rounded hover:bg-gray-600"
          >
            שלח קוד מחדש
          </button>

          <button 
            type="button" 
            onClick={() => setStep('login')}
            className="w-full bg-gray-300 text-gray-700 py-2 rounded hover:bg-gray-400"
          >
            חזור להתחברות
          </button>
        </form>
        
        <div id="recaptcha-container"></div>
      </div>
    );
  }

  return (
    <div className="max-w-md w-full mx-auto p-6 bg-white rounded shadow">
      <form onSubmit={handleLogIn} className="space-y-4">
        <h1 className="text-2xl font-bold text-center text-blue-900">התחברות</h1>

        <div>
          <label htmlFor="email" className="block text-sm font-medium">כתובת מייל</label>
          <input type="email" id="email" name="email" required className="w-full border border-gray-300 rounded px-3 py-2" />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium">סיסמא</label>
          <input type="password" id="password" name="password" required className="w-full border border-gray-300 rounded px-3 py-2" />
        </div>

        <div className="text-sm text-right">
          <Link href="/auth/reset-password" className="text-blue-600 hover:underline">שכחת סיסמא?</Link>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div id="recaptcha-container" className="flex justify-center"></div>

        <button type="submit" className="w-full bg-blue-900 text-white py-2 rounded hover:bg-blue-800">כניסה</button>
      
        <div className="text-center mt-4 text-sm">
          <span>אינך רשום למערכת? </span>
          <Link href="/subscription-sign-up" className="text-blue-600 font-semibold hover:underline">
            להרשמה
          </Link>
        </div>
      </form>
    </div>
  );
}