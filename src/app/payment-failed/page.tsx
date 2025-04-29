import { Suspense } from 'react';
import PaymentFailedClient from './PaymentFailedClient';

export default function PaymentFailedPage() {
  return (
    <Suspense fallback={<div>טוען...</div>}>
      <PaymentFailedClient />
    </Suspense>
  );
}
