import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import axios from 'axios';

export async function POST(req: NextRequest) {
  try {
    const { id, subscriptionId, transactionToken, transactionId, asmachta, newPlanId, addOns } = await req.json();
    const db = admin.firestore();

    let userDocRef = null;
    if (id) {
      userDocRef = db.collection('users').doc(id);
    } else if (subscriptionId) {
      const snapshot = await db.collection('users').where('subscriptionId', '==', subscriptionId).get();
      if (!snapshot.empty) {
        userDocRef = snapshot.docs[0].ref;
      } else {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
    }

    if (!userDocRef || !transactionToken || !transactionId || !asmachta || !newPlanId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const userSnap = await userDocRef.get();
    const userData = userSnap.data();
    const userEmail = userData?.email || '';
    const userName = userData?.name || '';

    const planSnap = await db.collection('subscriptions_permissions').doc(newPlanId).get();
    if (!planSnap.exists) {
      return NextResponse.json({ error: 'New plan not found' }, { status: 404 });
    }

    const planData = planSnap.data();
    const basePrice = planData?.price || 0;
    const leadsPrice = addOns?.leadsModule ? 29 : 0;
    const extraWorkersPrice = addOns?.extraWorkers ? addOns.extraWorkers * 49 : 0;
    const totalPrice = basePrice + leadsPrice + extraWorkersPrice;

    const formData = new URLSearchParams();
    formData.append('userId', '8f215caa9b2a3903');
    formData.append('transactionToken', transactionToken);
    formData.append('transactionId', transactionId);
    formData.append('asmachta', asmachta);
    formData.append('changeStatus', '1');
    formData.append('sum', totalPrice.toString());
    formData.append('cField3', JSON.stringify(addOns || {}));
    formData.append('cField4', 'manual-upgrade');


    formData.forEach((value, key) => console.log(`🔧 ${key}: ${value}`));

    const { data } = await axios.post(
      'https://sandbox.meshulam.co.il/api/light/server/1.0/updateDirectDebit',
      formData,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    console.log('✅ Grow response:', data);

    if (data?.status !== 1) {
      return NextResponse.json({ error: 'Grow update failed', details: data }, { status: 502 });
    }

    console.log('🔥 updateDoc called with:', {
      userId: userSnap.id,
      subscriptionType: newPlanId,
      lastPrice: totalPrice,
      lastPlanChangeDate: new Date(),
      addOns: addOns || {}
    });

    await userDocRef.update({
      subscriptionType: newPlanId,
      lastPrice: totalPrice,
      lastPlanChangeDate: new Date(),
      ...(addOns ? { addOns } : {})
    });

    return NextResponse.json({ success: true });

  } catch (err: any) {
    console.error('❌ Upgrade error:', err.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
