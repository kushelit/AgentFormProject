'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';

function SuccessHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState('מעבד תשלום...');

  useEffect(() => {
    const subscriptionId = searchParams.get('subscriptionId');
    const fullName = searchParams.get('fullName');
    const email = searchParams.get('email');
    const phone = searchParams.get('phone');

    if (!subscriptionId || !fullName || !email || !phone) {
      setStatus('חסרים פרטי תשלום, נא לפנות לשירות לקוחות.');
      return;
    }

    const saveUser = async () => {
      try {
        const userDoc = doc(collection(db, 'users'));
        await setDoc(userDoc, {
          fullName,
          email,
          phone,
          subscriptionId,
          subscriptionStatus: 'active',
          subscriptionStart: new Date(),
          nextBillingDate: null,
          role: 'subscriber',
        });

        setStatus('תשלום בוצע בהצלחה! חשבונך נוצר.');
        setTimeout(() => {
          router.push('/auth/log-in');
        }, 3000);
      } catch (error) {
        console.error('שגיאה בשמירת המשתמש:', error);
        setStatus('שגיאה בשמירת חשבון. אנא פנה לתמיכה.');
      }
    };

    saveUser();
  }, [searchParams, router]);

  return (
    <div className="success-container">
      <h1>{status}</h1>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div>טוען נתונים...</div>}>
      <SuccessHandler />
    </Suspense>
  );
}
