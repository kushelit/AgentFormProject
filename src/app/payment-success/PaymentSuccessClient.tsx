'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { db, auth } from '@/lib/firebase/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';

export default function PaymentSuccessClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState('מעבד תשלום...');

  useEffect(() => {
    const processId = searchParams.get('processId');
    const name = searchParams.get('fullName');
    const email = searchParams.get('email');
    const phone = searchParams.get('phone');
    const customField = searchParams.get('customField') || `MAGICSALE-${email}`;

    if (!processId || !name || !email || !phone || !customField) {
      setStatus('חסרים פרטי תשלום, נא לפנות לשירות לקוחות.');
      return;
    }

    const saveUser = async () => {
      try {
        const tempPassword = Math.random().toString(36).slice(-8);
        await createUserWithEmailAndPassword(auth, email, tempPassword);

        const userDoc = doc(collection(db, 'users'));
        await setDoc(userDoc, {
          name,
          email,
          phone,
          subscriptionId: processId,
          subscriptionStatus: 'active',
          subscriptionStart: new Date(),
          nextBillingDate: null,
          role: 'agent', // 🔁 שינוי לרול סוכן
          agentId: processId, // ✅ הגדרת ה-agentId כמזהה המנוי
          customField,
        });

        setStatus('🎉 תשלום בוצע בהצלחה! חשבון סוכן נוצר. סיסמה זמנית נשלחה למייל.');
        setTimeout(() => {
          router.push('/auth/log-in');
        }, 5000);
      } catch (error) {
        console.error('שגיאה בשמירת המשתמש או יצירת חשבון:', error);
        setStatus('שגיאה בשמירת חשבון. אנא פנה לתמיכה.');
      }
    };

    saveUser();
  }, [searchParams, router]);

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>{status}</h1>
    </div>
  );
}
