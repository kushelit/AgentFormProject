'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function PaymentSuccessClient() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState('מעבד תשלום...');

  useEffect(() => {
    const name = searchParams.get('fullName');
    const email = searchParams.get('email');
    const phone = searchParams.get('phone');
    const customField = searchParams.get('customField');

    if (!name || !email || !phone || !customField) {
      setStatus('⚠️ חסרים פרטי תשלום. נא לפנות לשירות הלקוחות.');
      return;
    }

    setStatus(`🎉 תודה על התשלום, ${name}! 
    החשבון שלך נוצר כעת, ונשלח אליך מייל עם קישור להגדרת סיסמה.

    ⚠️ אם לא התקבל מייל תוך מספר דקות, בדוק/י בתיקיית הספאם.

    ✉️ ניתן גם לאפס סיסמה ישירות כאן: 
    https://test.magicsale.co.il/auth/reset-password`);
  }, [searchParams]);

  return (
    <div style={{ padding: '2rem', textAlign: 'center', lineHeight: '2' }}>
      <h1 style={{ whiteSpace: 'pre-line' }}>{status}</h1>
    </div>
  );
}
