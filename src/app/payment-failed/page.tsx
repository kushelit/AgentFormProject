'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { db } from '@/lib/firebase/firebase';
import { collection, doc, setDoc } from 'firebase/firestore';

export default function PaymentFailedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const fullName = searchParams.get('fullName');
    const email = searchParams.get('email');
    const phone = searchParams.get('phone');

    if (fullName && email && phone) {
      const saveFailedUser = async () => {
        try {
          const userDoc = doc(collection(db, 'failedPayments')); // שמירה בקולקשן נפרד
          await setDoc(userDoc, {
            fullName,
            email,
            phone,
            subscriptionStatus: 'failed',
            failedAt: new Date(),
          });
          console.log('Failed payment saved');
        } catch (error) {
          console.error('Failed to save failed payment:', error);
        }
      };

      saveFailedUser();
    }

    const timer = setTimeout(() => {
      router.push('/subscription-sign-up');
    }, 5000);

    return () => clearTimeout(timer);
  }, [searchParams, router]);

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>😕 התשלום נכשל</h1>
      <p>נראה שארעה שגיאה במהלך ביצוע התשלום.</p>
      <p>אם זו טעות, ניתן לנסות שוב בעוד רגע או ליצור קשר עם התמיכה.</p>

      <button
        onClick={() => router.push('/subscription-sign-up')}
        style={{
          marginTop: '1.5rem',
          padding: '0.5rem 1rem',
          backgroundColor: '#003366',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer'
        }}
      >
        נסה שוב
      </button>
    </div>
  );
}
