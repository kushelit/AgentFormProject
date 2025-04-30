'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

export default function PaymentSuccessClient() {
  const searchParams = useSearchParams();
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

    setStatus('🎉 תודה! אם התשלום אושר בהצלחה, החשבון שלך ייווצר תוך מספר דקות.');
  }, [searchParams]);

  return (
    <div style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>{status}</h1>
    </div>
  );
}
