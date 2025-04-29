import { Suspense } from 'react';
import PaymentSuccessClient from './PaymentSuccessClient';

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div>טוען...</div>}>
      <PaymentSuccessClient />
    </Suspense>
  );
}
