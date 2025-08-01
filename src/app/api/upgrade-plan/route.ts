import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import axios from 'axios';
import { GROW_ENDPOINTS } from '@/lib/growApi';
import { GROW_USER_ID } from '@/lib/env';

export async function POST(req: NextRequest) {
  try {
    const {
      id,
      subscriptionId,
      transactionToken,
      transactionId,
      asmachta,
      newPlanId,
      addOns,
      couponCode, // ✅ תוספת חדשה
    } = await req.json();

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

    const planSnap = await db.collection('subscriptions_permissions').doc(newPlanId).get();
    if (!planSnap.exists) {
      return NextResponse.json({ error: 'New plan not found' }, { status: 404 });
    }

    const planData = planSnap.data();
    const basePrice = planData?.price || 0;
    const leadsPrice = addOns?.leadsModule ? 29 : 0;
    const extraWorkersPrice = addOns?.extraWorkers ? addOns.extraWorkers * 49 : 0;

    let totalPrice = basePrice + leadsPrice + extraWorkersPrice;
    let appliedDiscount = 0;
    let appliedCouponId: string | null = null;

    // ✅ בדיקת קופון אם קיים
    if (couponCode) {
      const couponSnap = await db.collection('coupons').doc(couponCode.trim()).get();
      if (couponSnap.exists) {
        const couponData = couponSnap.data();
        const planDiscount = couponData?.planDiscounts?.[newPlanId];
        const isActive = couponData?.isActive;

        if (typeof planDiscount === 'number' && isActive) {
          appliedDiscount = planDiscount;
          totalPrice -= totalPrice * (planDiscount / 100);
          appliedCouponId = couponSnap.id;
        }
      }
    }

    if (totalPrice <= 0) totalPrice = 1;
    totalPrice = parseFloat(totalPrice.toFixed(2));

    const formData = new URLSearchParams();
    formData.append('userId', GROW_USER_ID);
    formData.append('transactionToken', transactionToken);
    formData.append('transactionId', transactionId);
    formData.append('asmachta', asmachta);
    formData.append('changeStatus', '1');
    formData.append('sum', totalPrice.toString());
    formData.append('cField3', JSON.stringify(addOns || {}));
    formData.append('cField4', 'manual-upgrade');
    if (couponCode) {
      formData.append('cField5', couponCode); 
    }
    
    const { data } = await axios.post(
      GROW_ENDPOINTS.updateDirectDebit,
      formData,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    if (data?.status !== 1) {
      return NextResponse.json({ error: 'Grow update failed', details: data }, { status: 502 });
    }

    const updateData: any = {
      subscriptionType: newPlanId,
      futureChargeAmount: totalPrice,
      lastPlanChangeDate: new Date(),
      ...(addOns ? { addOns } : {}),
    };

    if (appliedCouponId) {
      updateData.couponUsed = {
        code: appliedCouponId,
        discount: appliedDiscount,
        date: new Date(),
      };
    }

    await userDocRef.update(updateData);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('❌ Upgrade error:', err.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
