import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import axios from 'axios';
import { GROW_ENDPOINTS } from '@/lib/growApi';
import { GROW_USER_ID, GROW_PAGE_CODE, APP_BASE_URL } from '@/lib/env';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      fullName: _fullName,
      email: _email,
      phone: _phone,
      idNumber: _idNumber,
      plan,
      couponCode,
      addOns,
      total,
      source,
      existingUserUid,
    } = body;

    const db = admin.firestore();

    // נעדיף נתונים מהבקשה, ואם חסר—נשלים מה-DB כשיש UID קיים
    let fullName = _fullName ?? '';
    let email    = (_email ?? '').toLowerCase();
    let phone    = _phone ?? '';
    let idNumber = _idNumber ?? '';

    if (existingUserUid) {
      const snap = await db.collection('users').doc(existingUserUid).get();
      if (!snap.exists) {
        return NextResponse.json({ error: 'Existing user not found' }, { status: 404 });
      }
      const u = snap.data() || {};
      fullName = fullName || u.name || '';
      email    = (email || u.email || '').toLowerCase();
      phone    = phone || u.phone || '';
      idNumber = idNumber || u.idNumber || '';
    }

    // ולידציה בסיסית
    if (!plan || !email || !phone || !fullName || !idNumber) {
      return NextResponse.json({ error: 'אנא מלא/י את כל השדות הנדרשים' }, { status: 400 });
    }

    // קופון (אופציונלי)
    let couponData: any = null;
    if (couponCode) {
      const couponSnap = await db.collection('coupons').where('code', '==', couponCode).get();
      if (!couponSnap.empty) {
        const doc = couponSnap.docs[0];
        const data = doc.data();
        if (!data.planId || data.planId === plan) {
          couponData = data;
        } else {
          console.warn('⚠️ קופון לא תואם את התוכנית', { plan, planIdInCoupon: data.planId });
        }
      } else {
        console.warn('❌ לא נמצא קופון עם הקוד:', couponCode);
      }
    }

    // שליפת מסלול
    const planDoc = await db.collection('subscriptions_permissions').doc(plan).get();
    if (!planDoc.exists) {
      return NextResponse.json({ error: 'סוג מסלול לא קיים' }, { status: 400 });
    }
    const planData = planDoc.data();
    const basePrice = planData?.price || 0;
    const leadsPrice = addOns?.leadsModule ? 29 : 0;
    const extraWorkersPrice = addOns?.extraWorkers ? addOns.extraWorkers * 49 : 0;

    // חישוב סך
    const VAT_RATE = 0.18;
    let calculatedTotal = basePrice + leadsPrice + extraWorkersPrice;

    if (couponData) {
      const discountPercent = (couponData.planDiscounts?.[plan] ?? couponData.discount ?? 0) as number;
      if (discountPercent > 0) {
        calculatedTotal -= calculatedTotal * (discountPercent / 100);
      }
    }

    calculatedTotal = parseFloat((calculatedTotal * (1 + VAT_RATE)).toFixed(2));
    if (calculatedTotal <= 0) calculatedTotal = 1;

    // לכבד total מהלקוח אם ההפרש קטן
    let totalPrice = calculatedTotal;
    if (typeof total === 'number') {
      const normalizedTotal = parseFloat(Number(total).toFixed(2));
      if (Math.abs(normalizedTotal - calculatedTotal) <= 0.01) {
        totalPrice = normalizedTotal;
      } else {
        console.warn('⚠️ total מהפרונט שונה – משתמשים בחישוב השרת', {
          fromFrontend: normalizedTotal,
          fromBackend: calculatedTotal,
        });
      }
    }

    // בדיקת קיום ב-Auth — רק אם זה *לא* UID קיים
    if (!existingUserUid) {
      try {
        const existent = await admin.auth().getUserByEmail(email.toLowerCase());
        if (!existent.disabled) {
          return NextResponse.json(
            { error: 'משתמש עם כתובת אימייל זו כבר קיים במערכת.' },
            { status: 400 }
          );
        }
      } catch (error: any) {
        if (error.code !== 'auth/user-not-found') {
          console.error('⚠️ שגיאה בבדיקת קיום המשתמש ב-Auth:', error);
          return NextResponse.json({ error: 'שגיאה בבדיקת קיום המשתמש' }, { status: 500 });
        }
        // user-not-found → מותר להמשיך
      }
    }

    // בניית בקשה ל-Grow
    const normalizedEmail = email.toLowerCase();
    const customField = `MAGICSALE-${normalizedEmail}`;
    const resolvedSource = source || (existingUserUid ? 'existing-user-upgrade' : 'public-signup');

    const successUrl =
      `${APP_BASE_URL}/payment-success?fullName=${encodeURIComponent(fullName)}` +
      `&email=${encodeURIComponent(normalizedEmail)}` +
      `&phone=${encodeURIComponent(phone)}` +
      `&customField=${encodeURIComponent(customField)}` +
      `&plan=${plan}`;

    const cancelUrl = `${APP_BASE_URL}/payment-failed`;

    const formData = new URLSearchParams();
    formData.append('pageCode', GROW_PAGE_CODE);
    formData.append('userId', GROW_USER_ID);
    formData.append('sum', totalPrice.toString());
    formData.append('successUrl', successUrl);
    formData.append('cancelUrl', cancelUrl);
    formData.append('description', `תשלום עבור מסלול ${plan}`);
    formData.append('pageField[fullName]', fullName);
    formData.append('pageField[phone]', phone);
    formData.append('pageField[email]', normalizedEmail);
    formData.append('cField1', customField);
    formData.append('cField2', plan);
    formData.append('cField3', JSON.stringify(addOns || {}));
    formData.append('cField4', resolvedSource);        // ⭐ מזהה זרימה
    if (existingUserUid) formData.append('cField9', existingUserUid); // ⭐ UID קיים
    formData.append('cField6', total?.toString() || totalPrice.toString());
    formData.append('cField7', idNumber);
    formData.append('cField8', GROW_PAGE_CODE);
    if (couponCode) formData.append('cField5', couponCode);
    formData.append('notifyUrl', `${APP_BASE_URL}/api/webhook`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

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
      }

      return NextResponse.json({ error: 'יצירת תשלום נכשלה' }, { status: 500 });
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
