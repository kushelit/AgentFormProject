import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import axios from 'axios';
import { GROW_ENDPOINTS } from '@/lib/growApi';
import { GROW_USER_ID } from '@/lib/env';



type CouponHistoryItem = {
  code: string;
  discount?: number;
  planId?: string;         // באיזו תוכנית זה היה
  appliedAt?: any;         // Timestamp
  expiresAt?: any;         // Timestamp (אם יש)
  removedAt?: any;         // Timestamp (מתי הפסיק להיות פעיל)
  reason?: 'plan-change' | 'manual' | 'expired' | 'removed';
  source?: 'webhook' | 'manual-upgrade' | 'admin';
};


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
    let appliedCouponCode: string | null = null;
    
    let couponAppliedAt: Date | null = null;
    let couponExpiresAt: Date | null = null;
    

    let agenciesValue: any = undefined;

  // ✅ בדיקת קופון אם קיים
if (couponCode) {
  const codeTrim = couponCode.trim();

  const couponSnap = await db.collection('coupons').doc(codeTrim).get();
  if (couponSnap.exists) {
    const couponData = couponSnap.data();
    const planDiscount = couponData?.planDiscounts?.[newPlanId];
    const isActive = couponData?.isActive;

    if (typeof couponData?.agencies !== 'undefined') {
      agenciesValue = couponData.agencies;
    }

    if (typeof planDiscount === 'number' && isActive) {
      appliedDiscount = planDiscount;
      appliedCouponCode = codeTrim;

      totalPrice -= totalPrice * (planDiscount / 100);

      // חדש
      couponAppliedAt = new Date();

      const durationDays = Number(couponData?.durationDays ?? 0); // 👈 שדה חדש במסמך קופון
      if (durationDays > 0) {
        const exp = new Date(couponAppliedAt);
        exp.setDate(exp.getDate() + durationDays);
        couponExpiresAt = exp;
      }
    }
  }
}


    if (totalPrice <= 0) totalPrice = 1;

    const VAT_RATE = 0.18;
    totalPrice *= 1 + VAT_RATE;

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
    if (appliedCouponCode) formData.append('cField5', appliedCouponCode);

    
    const { data } = await axios.post(
      GROW_ENDPOINTS.updateDirectDebit,
      formData,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    if (data?.status !== 1) {
      return NextResponse.json({ error: 'Grow update failed', details: data }, { status: 502 });
    }

    const prevCoupon = userData?.couponUsed || null;
    const prevCode = prevCoupon?.code || null;
    const nextCode = appliedCouponCode || null;
    
    const updateData: any = {
      subscriptionType: newPlanId,
      futureChargeAmount: totalPrice,
      lastPlanChangeDate: new Date(),
      ...(addOns ? { addOns } : {}),
    };
    
    // ✅ היסטוריה רק אם הקופון השתנה או הוסר
    const couponChanged = !!prevCode && prevCode !== nextCode;
    const couponRemoved = !!prevCode && !nextCode;
    
    if (couponChanged || couponRemoved) {
      updateData.couponHistory = admin.firestore.FieldValue.arrayUnion({
        code: prevCoupon.code,
        discount: prevCoupon.discount,
        planId: userData?.subscriptionType || null,
        appliedAt: prevCoupon.appliedAt || prevCoupon.date || null,
        expiresAt: prevCoupon.expiresAt || null,
        removedAt: admin.firestore.Timestamp.now(),
        reason: 'plan-change',
        source: 'manual-upgrade',
      });
    }
    
    // ✅ תמיד לפי התוצאה הנוכחית: אם יש קופון תקין -> לשמור, אחרת למחוק
    if (appliedCouponCode) {
      updateData.usedCouponCode = appliedCouponCode;
    
      updateData['couponUsed.code'] = appliedCouponCode;
      updateData['couponUsed.discount'] = appliedDiscount;
    
      // תאימות אחורה
      updateData['couponUsed.date'] = new Date().toISOString();
    
      updateData['couponUsed.appliedAt'] = admin.firestore.Timestamp.fromDate(
        couponAppliedAt || new Date()
      );
    
      if (couponExpiresAt) {
        updateData['couponUsed.expiresAt'] = admin.firestore.Timestamp.fromDate(couponExpiresAt);
      } else {
        updateData['couponUsed.expiresAt'] = admin.firestore.FieldValue.delete();
      }
    
      // ניקוי שדות נוטיפיקציה ישנים
      updateData['couponUsed.lastNotifiedAt'] = admin.firestore.FieldValue.delete();
      updateData['couponUsed.notifyFlags'] = admin.firestore.FieldValue.delete();
    } else {
      updateData.usedCouponCode = admin.firestore.FieldValue.delete();
      updateData.couponUsed = admin.firestore.FieldValue.delete();
    }
    
    
    // (כרגע לא נוגעים ב-agencies אם אין קופון חדש — לפי החלטתך)
    if (typeof agenciesValue !== 'undefined') {
      updateData.agencies = agenciesValue;
    }
    
    await userDocRef.update(updateData);
    

    return NextResponse.json({ success: true });
  } catch (err: any) {
    // console.error('❌ Upgrade error:', {
    //   message: err?.message,
    //   stack: err?.stack,
    //   axiosStatus: err?.response?.status,
    //   axiosData: err?.response?.data,
    // });   
    return NextResponse.json(
      {
        error: 'Internal Server Error',
        message: err?.message,
        axiosStatus: err?.response?.status,
        axiosData: err?.response?.data,
      },
      { status: 500 }
    );
  }
}
