// File: /app/api/cancel-subscription/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase'; // חיבור לפיירבייס
import { collection, query, where, getDocs, doc, updateDoc } from 'firebase/firestore';
import axios from 'axios';

export async function POST(req: NextRequest) {
  try {
    const { subscriptionId } = await req.json();

    if (!subscriptionId) {
      return NextResponse.json({ error: 'Missing subscriptionId' }, { status: 400 });
    }

    const formData = new URLSearchParams();
    formData.append('userId', '8f215caa9b2a3903'); // מזהה עסק
    formData.append('directDebitId', subscriptionId); // מזהה המנוי
    formData.append('action', 'cancel'); // פעולה: ביטול

    const { data } = await axios.post(
      'https://sandbox.meshulam.co.il/api/light/server/1.0/updateDirectDebit',
      formData,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    console.log('✅ Cancel response from Grow:', data);

    if (data?.status === '1') {
      // ביטול בוצע בהצלחה ב־Grow
      // עכשיו נעדכן גם ב-Firestore

      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('subscriptionId', '==', subscriptionId));
      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0];
        const userRef = doc(db, 'users', userDoc.id);

        await updateDoc(userRef, {
          subscriptionStatus: 'canceled',
          cancellationDate: new Date(),
        });

        console.log(`✅ User ${userDoc.id} subscription canceled in Firestore.`);
      } else {
        console.warn('⚠️ No user found with subscriptionId:', subscriptionId);
      }

      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: data?.err || 'Cancellation failed' }, { status: 500 });
    }
  } catch (error: any) {
    console.error('❌ Cancel subscription error:', error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
