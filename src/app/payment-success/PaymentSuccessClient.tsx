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
      setStatus('חסרים פרטי תשלום, נא לפנות לשירות לקוחות.');
      return;
    }

    setStatus('🎉 תודה! אם התשלום עבר בהצלחה, החשבון שלך ייפתח תוך מספר דקות. אנא בדוק/י את הדוא"ל להתחברות.');
  }, [searchParams]);

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>{status}</h1>
    </div>
  );
}
