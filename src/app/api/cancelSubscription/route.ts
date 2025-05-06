// File: /app/api/cancelSubscription/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import axios from 'axios';

export async function POST(req: NextRequest) {
  try {
    const { id, subscriptionId, updates, sendCancelEmail } = await req.json();
    const db = admin.firestore();

    // שלב 1: ביטול הוראת קבע ב-Grow אם קיים subscriptionId
    if (subscriptionId) {
      const formData = new URLSearchParams();
      formData.append('userId', '8f215caa9b2a3903');
      formData.append('directDebitId', subscriptionId);
      formData.append('action', 'cancel');

      const { data } = await axios.post(
        'https://sandbox.meshulam.co.il/api/light/server/1.0/updateDirectDebit',
        formData,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      console.log('🔁 Grow cancel result:', data);

      if (data?.status !== '1') {
        return NextResponse.json({ error: data?.err || 'Grow cancellation failed' }, { status: 500 });
      }
    }

    // שלב 2: עדכון המשתמש במסד הנתונים
    let userDocRef = null;
    let userEmail = '';
    let userName = '';

    if (id) {
      userDocRef = db.collection('users').doc(id);
      const userSnap = await userDocRef.get();
      const userData = userSnap.data();
      if (userData) {
        userEmail = userData.email;
        userName = userData.name;
      }
    } else if (subscriptionId) {
      const snapshot = await db.collection('users').where('subscriptionId', '==', subscriptionId).get();
      if (!snapshot.empty) {
        userDocRef = snapshot.docs[0].ref;
        const userData = snapshot.docs[0].data();
        userEmail = userData.email;
        userName = userData.name;
      } else {
        return NextResponse.json({ error: 'User not found for subscriptionId' }, { status: 404 });
      }
    }

    if (!userDocRef) {
      return NextResponse.json({ error: 'Missing user ID or subscriptionId' }, { status: 400 });
    }

    await userDocRef.update({
      subscriptionStatus: 'canceled',
      isActive: false,
      cancellationDate: new Date(),
      ...(updates || {})
    });

    // שלב 3: שליחת מייל ביטול במידת הצורך
    if (sendCancelEmail && userEmail) {
      await fetch('https://test.magicsale.co.il/api/sendCancelEmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: userEmail, name: userName })
      });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('❌ CancelSubscription error:', err.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
