// /app/api/subscriptions/route.ts
import { NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function GET() {
  const snapshot = await admin.firestore().collection('users').get();

  const subscriptions = snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name,
      email: data.email,
      phone: data.phone,
      lastPaymentDate: data.lastPaymentDate?.toDate().toLocaleDateString('he-IL') || '',
      lastPaymentStatus: data.lastPaymentStatus || '',
      subscriptionStatus: data.subscriptionStatus || '',
      isActive: data.isActive ?? true,
      subscriptionId: data.subscriptionId || '',
    };
  });

  return NextResponse.json(subscriptions);
}
