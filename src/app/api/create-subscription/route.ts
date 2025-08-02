import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import axios from 'axios';
import { GROW_ENDPOINTS } from '@/lib/growApi';
import { GROW_USER_ID, GROW_PAGE_CODE, APP_BASE_URL } from '@/lib/env';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fullName, email, phone, idNumber, plan, couponCode, addOns, total } = body;

    if (!fullName || !email || !phone || !idNumber || !plan) {
      return NextResponse.json({ error: 'אנא מלא/י את כל השדות הנדרשים' }, { status: 400 });
    }

    const db = admin.firestore();

    let couponData = null;

    if (couponCode) {
      const couponSnap = await db
  .collection('coupons')
  .where('code', '==', couponCode)
  .get();

if (!couponSnap.empty) {
  const doc = couponSnap.docs[0];
  const data = doc.data();
  console.log('🎟 קופון שנמצא ב־Firestore:', data); // ← לוג מרכזי

  if (!data.planId || data.planId === plan) {
    console.log('✅ קופון תקף עבור התוכנית:', plan);
    couponData = data;
  } else {
    console.warn('⚠️ קופון לא תואם את התוכנית:', {
      planFromRequest: plan,
      planIdInCoupon: data.planId,
    });
  }
} else {
  console.warn('❌ לא נמצא קופון עם הקוד:', couponCode);
}
 }

    const planDoc = await db.collection('subscriptions_permissions').doc(plan).get();

    if (!planDoc.exists) {
      return NextResponse.json({ error: 'סוג מסלול לא קיים' }, { status: 400 });
    }

    const planData = planDoc.data();
    const basePrice = planData?.price || 0;
    const leadsPrice = addOns?.leadsModule ? 29 : 0;
    const extraWorkersPrice = addOns?.extraWorkers ? addOns.extraWorkers * 49 : 0;

    // חישוב סכום צפוי בשרת
    let calculatedTotal = basePrice + leadsPrice + extraWorkersPrice;

    if (couponData) {
      const discountPercent =
        couponData.planDiscounts?.[plan] ?? couponData.discount ?? 0;
    
      if (discountPercent > 0) {
        const discountAmount = calculatedTotal * (discountPercent / 100);
        calculatedTotal -= discountAmount;
        console.log(`🎯 שימוש בהנחה של ${discountPercent}% למסלול "${plan}"`);
      } else {
        console.log(`ℹ️ אין הנחה תקפה לקופון עבור המסלול "${plan}"`);
      }
    }
    
    calculatedTotal = parseFloat(calculatedTotal.toFixed(2));
    if (calculatedTotal <= 0) calculatedTotal = 1;

    // בדיקת התאמה מול total מהפרונט
    let totalPrice = calculatedTotal;

    if (typeof total === 'number') {
      const normalizedTotal = parseFloat(Number(total).toFixed(2));
      const difference = Math.abs(normalizedTotal - calculatedTotal);

      if (difference <= 0.01) {
        totalPrice = normalizedTotal; // ✅ סומכים על מה שהגיע מהפרונט
      } else {
        console.warn('⚠️ סכום מהפרונט שונה מהחישוב בשרת – משתמשים בחישוב מהשרת', {
          fromFrontend: normalizedTotal,
          fromBackend: calculatedTotal,
        });
      }
    } else {
      console.warn('⚠️ שדה total מהפרונט לא היה מספר – משתמשים בחישוב מהשרת.');
    }

    const normalizedEmail = email.toLowerCase();
    const customField = `MAGICSALE-${normalizedEmail}`;
    const successUrl = `${APP_BASE_URL}/payment-success?fullName=${encodeURIComponent(fullName)}&email=${encodeURIComponent(normalizedEmail)}&phone=${encodeURIComponent(phone)}&customField=${encodeURIComponent(customField)}&plan=${plan}`;
    const cancelUrl = `${APP_BASE_URL}/payment-failed`;

    const formData = new URLSearchParams();
    formData.append('pageCode', GROW_PAGE_CODE);
    formData.append('userId', GROW_USER_ID);
    formData.append('sum', totalPrice.toString()); // ✅ הסכום שייגבה בפועל
    formData.append('successUrl', successUrl);
    formData.append('cancelUrl', cancelUrl);
    formData.append('description', `תשלום עבור מסלול ${plan}`);
    formData.append('pageField[fullName]', fullName);
    formData.append('pageField[phone]', phone);
    formData.append('pageField[email]', normalizedEmail);
    formData.append('cField1', customField);
    formData.append('cField6', total?.toString() || totalPrice.toString()); // לצרכים פנימיים
    formData.append('cField7', idNumber);
    formData.append('cField8', GROW_PAGE_CODE);
    formData.append('cField2', plan);
    formData.append('cField3', JSON.stringify(addOns || {}));
    if (couponCode) {
      formData.append('cField5', couponCode);
    }
    formData.append('notifyUrl', `${APP_BASE_URL}/api/webhook`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
 
    console.log('📤 שליחה ל־Grow – פרטי הבקשה:');
formData.forEach((value, key) => {
  console.log(`→ ${key}: ${value}`);
});


    try {
      const response = await axios.post(GROW_ENDPOINTS.createPayment, formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const data = response.data;

      if (data?.status === 1 && data?.data?.url && data?.data?.processId) {
        const redirectUrl = new URL(data.data.url);
        redirectUrl.searchParams.set('processId', data.data.processId);
        redirectUrl.searchParams.set('fullName', fullName);
        redirectUrl.searchParams.set('email', normalizedEmail);
        redirectUrl.searchParams.set('phone', phone);
        redirectUrl.searchParams.set('customField', customField);
        redirectUrl.searchParams.set('plan', plan);

        return NextResponse.json({ paymentUrl: redirectUrl.toString() });
      } else {
        return NextResponse.json({ error: 'יצירת תשלום נכשלה' }, { status: 500 });
      }
    } catch (error: any) {
      clearTimeout(timeout);

      if (error.code === 'ERR_CANCELED') {
        return NextResponse.json({ error: 'פנייה לספק נקטעה. נסו שוב.' }, { status: 504 });
      }

      console.error('❌ Grow API error:', error.message);
      return NextResponse.json({ error: 'שגיאה בתקשורת עם Grow' }, { status: 502 });
    }
  } catch (error: any) {
    console.error('❌ Internal error:', error);
    return NextResponse.json({ error: 'שגיאה פנימית בשרת' }, { status: 500 });
  }
}
