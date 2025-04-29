import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
} from 'firebase/firestore';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    console.log('✅ Webhook received:', JSON.stringify(payload, null, 2));

    const { status, subscriptionId, custom_field, paymentDate } = payload;

    if (!status || (!subscriptionId && !custom_field)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // חיפוש המשתמש לפי subscriptionId או custom_field
    const usersRef = collection(db, 'users');
    const conditions = [];

    if (subscriptionId) {
      conditions.push(where('subscriptionId', '==', subscriptionId));
    }

    if (custom_field) {
      conditions.push(where('customField', '==', custom_field));
    }

    const q = query(usersRef, ...conditions);
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.warn('⚠️ No user found for:', { subscriptionId, custom_field });
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userDoc = querySnapshot.docs[0];
    const userRef = doc(db, 'users', userDoc.id);

    await updateDoc(userRef, {
      subscriptionStatus: status, // לדוגמה: 'paid', 'failed', 'canceled'
      lastPaymentDate: paymentDate ? new Date(paymentDate) : new Date(),
    });

    console.log(`✅ Updated user ${userDoc.id} with status: ${status}`);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Webhook error:', error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
