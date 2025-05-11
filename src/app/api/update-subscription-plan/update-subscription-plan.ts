import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import axios from 'axios';
import { getAuth } from 'firebase-admin/auth';

export async function POST(req: NextRequest) {
  try {
    const { newPlanId } = await req.json();

    const auth = getAuth();
    const session = await auth.verifySessionCookie(req.cookies.get('__session')?.value || '', true);
    const userId = session.uid;

    if (!userId || !newPlanId) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const userData = userSnap.data();
    const { transactionId, transactionToken, asmachta } = userData || {};

    if (!transactionId || !transactionToken || !asmachta) {
      return NextResponse.json({ error: 'Missing Grow transaction details' }, { status: 400 });
    }

    // שליפת פרטי מסלול חדש
    const planRef = db.collection('subscriptions_permissions').doc(newPlanId);
    const planSnap = await planRef.get();

    if (!planSnap.exists) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const newPlanData = planSnap.data();
    const newPrice = newPlanData?.price;
    const newPermissions = newPlanData?.permissions || [];

    // קריאה ל-Grow לעדכון סכום בהוראת קבע
    const formData = new URLSearchParams();
    formData.append('userId', '8f215caa9b2a3903');
    formData.append('transactionToken', transactionToken);
    formData.append('transactionId', transactionId);
    formData.append('asmachta', asmachta);
    formData.append('changeStatus', '1');
    formData.append('sum', newPrice.toString());

    const { data } = await axios.post(
      'https://sandbox.meshulam.co.il/api/light/server/1.0/updateDirectDebit',
      formData,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    if (data?.status !== '1') {
      return NextResponse.json({ error: 'Grow update failed', details: data }, { status: 502 });
    }

    // עדכון Firestore
    await userRef.update({
      subscriptionType: newPlanId,
      lastPrice: newPrice,
      lastPlanChangeDate: new Date(),
      permissions: newPermissions,
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('❌ Update plan error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
