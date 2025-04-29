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

    console.log('✅ Webhook payload from Grow:', JSON.stringify(payload, null, 2));

    const paymentData = payload?.[0]?.data;
    const status = paymentData?.status;
    const customField = paymentData?.cField1;
    const paymentDate = new Date(); // Grow לא שולחים תאריך מדויק — נשתמש בנוכחי

    if (!status || !customField) {
      return NextResponse.json({ error: 'Missing status or cField1' }, { status: 400 });
    }

    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('customField', '==', customField));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.warn('⚠️ No user found with customField:', customField);
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userDoc = querySnapshot.docs[0];
    const userRef = doc(db, 'users', userDoc.id);

    await updateDoc(userRef, {
      subscriptionStatus: status,
      lastPaymentDate: paymentDate,
    });

    console.log(`✅ User ${userDoc.id} updated with status: ${status}`);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Webhook error:', error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
