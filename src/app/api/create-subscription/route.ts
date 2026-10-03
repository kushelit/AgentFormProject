import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import axios from 'axios';
import { GROW_ENDPOINTS } from '@/lib/growApi';
import { GROW_USER_ID, GROW_PAGE_CODE, APP_BASE_URL } from '@/lib/env';

const normalizePhoneE164 = (raw?: string) => {
  if (!raw) return undefined;
  let s = String(raw).replace(/[\s\-()]/g, '').trim();
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+972')) return s;
  if (s.startsWith('972')) return '+' + s;
  if (s.startsWith('0')) return '+972' + s.slice(1);
  if (s.startsWith('+')) return s;
  if (/^\d{9,10}$/.test(s)) {
    if (s.length === 10 && s.startsWith('0')) s = s.slice(1);
    return '+972' + s;
  }
  return undefined;
};

/** uid of the user that owns this phone in Firebase Auth or in users.phone, or null. */
async function findPhoneOwnerUid(phoneE164: string): Promise<string | null> {
  try {
    return (await admin.auth().getUserByPhoneNumber(phoneE164)).uid;
  } catch (e: any) {
    if (e?.code !== 'auth/user-not-found') throw e;
  }
  const snap = await admin.firestore().collection('users').where('phone', '==', phoneE164).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

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
      existingUserUid, // optional incoming
    } = body;

    const trimmedCoupon = (couponCode ?? '').trim();
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
      // Identity fields come from the existing record, never from the request:
      // the phone identifies the user to the WhatsApp bot. Changing it is an admin action.
      email    = (u.email || email || '').toLowerCase();
      phone    = u.phone || phone || '';
      idNumber = idNumber || u.idNumber || '';
    }

    const isFullNameOk = (s: string) => s.trim().split(/\s+/).length >= 2;

if (!isFullNameOk(fullName)) {
  return NextResponse.json(
    { error: 'יש להזין שם מלא (שם פרטי + שם משפחה)' },
    { status: 400 }
  );
}

    const phoneE164 = normalizePhoneE164(phone);
    if (!phoneE164) {
      return NextResponse.json({ error: 'מספר טלפון לא תקין' }, { status: 400 });
    }

    phone = phoneE164;

    // ולידציה בסיסית
    if (!plan || !email || !phone || !fullName || !idNumber) {
      return NextResponse.json({ error: 'אנא מלא/י את כל השדות הנדרשים' }, { status: 400 });
    }

    // קופון (אופציונלי)
    let couponData: any = null;
    if (trimmedCoupon) {
      // const couponSnap = await db.collection('coupons').where('code', '==', trimmedCoupon).get();
     
      const couponSnap = await db.collection('coupons')
      .where('code', '==', trimmedCoupon)
      .limit(1)
      .get();
    
      if (!couponSnap.empty) {
        const doc = couponSnap.docs[0];
        const data = doc.data();
        if (!data.planId || data.planId === plan) {
          couponData = data;
        } else {
          // console.warn('⚠️ קופון לא תואם את התוכנית', { plan, planIdInCoupon: data.planId });
        }
      } else {
        // console.warn('❌ לא נמצא קופון עם הקוד:', couponCode);
      }
    }

    // שליפת מסלול
    const planDoc = await db.collection('subscriptions_permissions').doc(plan).get();
    if (!planDoc.exists) {
      return NextResponse.json({ error: 'סוג מסלול לא קיים' }, { status: 400 });
    }
    const planData = planDoc.data();


    // const basePrice = planData?.price || 0;
    // const leadsPrice = addOns?.leadsModule ? 29 : 0;
    // const extraWorkersPrice = addOns?.extraWorkers ? addOns.extraWorkers * 49 : 0;

    // // חישוב סך
    // const VAT_RATE = 0.18;
    // let calculatedTotal = basePrice + leadsPrice + extraWorkersPrice;



    const basePrice = planData?.price || 0;

const leadsPrice =
  addOns?.leadsModule ? 29 : 0;

const supportsExtraWorkers =
  ['pro', 'magic_touch', 'magic_suite'].includes(plan);

const extraWorkers =
  supportsExtraWorkers
    ? Math.max(
        0,
        Number(addOns?.extraWorkers || 0)
      )
    : 0;

const supportsExtraCustomerBlocks =
  ['pro', 'magic_suite'].includes(plan);

const extraCustomerBlocks =
  supportsExtraCustomerBlocks
    ? Math.max(
        0,
        Number(addOns?.extraCustomerBlocks || 0)
      )
    : 0;

const normalizedAddOns = {
  leadsModule: !!addOns?.leadsModule,
  extraWorkers,
  extraCustomerBlocks,
};

const extraWorkersPrice =
  extraWorkers * 49;

const extraCustomerBlocksPrice =
  extraCustomerBlocks * 39;

// חישוב סך
const VAT_RATE = 0.18;

let calculatedTotal =
  basePrice +
  leadsPrice +
  extraWorkersPrice +
  extraCustomerBlocksPrice;


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
        // console.warn('⚠️ total מהפרונט שונה – משתמשים בחישוב השרת', {
        //   fromFrontend: normalizedTotal,
        //   fromBackend: calculatedTotal,
        // });
      }
    }

    // === הכרעה מוקדמת: הרשמה חדשה / החייאה / חסימה על משתמש/טלפון פעיל או קונפליקט ===
    const auth = admin.auth();
    const emailLower = email.toLowerCase();

    let resolvedSource = source || (existingUserUid ? 'existing-user-upgrade' : 'public-signup');
    let resolvedExistingUid: string | undefined = existingUserUid;

    if (!resolvedExistingUid) {
      let byEmail: admin.auth.UserRecord | null = null;
      let byPhone: admin.auth.UserRecord | null = null;

      // 1) קודם לפי אימייל
      try {
        byEmail = await auth.getUserByEmail(emailLower);
      } catch (e: any) {
        if (e.code !== 'auth/user-not-found') {
          // console.error('⚠️ שגיאה בבדיקת אימייל ב-Auth:', e);
          return NextResponse.json({ error: 'שגיאה בבדיקת משתמש לפי אימייל' }, { status: 500 });
        }
      }

      if (byEmail) {
        if (!byEmail.disabled) {
          // אימייל קיים ופעיל → לא מאפשרים יציאה לתשלום מהפלואו הזה
          return NextResponse.json(
            { error: 'חשבון עם אימייל זה כבר פעיל. יש להתחבר למערכת ולנהל את המנוי מתוך החשבון.' },
            { status: 400 }
          );
        }
        // אימייל קיים אך מושבת → החייאה/שדרוג, רק עם הטלפון של אותו חשבון.
        // הטלפון מזהה את הסוכן מול הבוט, ולכן שינוי טלפון נעשה רק ע"י אדמין (טבלת מנויים → עדכון טלפון).
        const accountDoc = await db.collection('users').doc(byEmail.uid).get();
        const accountPhone = normalizePhoneE164(byEmail.phoneNumber || accountDoc.data()?.phone);
        if (accountPhone && accountPhone !== phone) {
          return NextResponse.json(
            { error: 'מספר הטלפון שהוזן אינו תואם לחשבון הקיים. לחידוש המנוי יש לפנות לתמיכה.' },
            { status: 400 }
          );
        }
        if (!accountPhone) {
          const ownerUid = await findPhoneOwnerUid(phone);
          if (ownerUid && ownerUid !== byEmail.uid) {
            return NextResponse.json(
              { error: 'מספר הטלפון משויך לחשבון אחר. לחידוש המנוי יש לפנות לתמיכה.' },
              { status: 400 }
            );
          }
        }
        resolvedExistingUid = byEmail.uid;
        resolvedSource = 'existing-user-upgrade';
      } else {
        // 2) אם אין אימייל — בדיקת טלפון
        try {
          byPhone = await auth.getUserByPhoneNumber(phone);
        } catch (e: any) {
          if (e.code !== 'auth/user-not-found') {
            // console.error('⚠️ שגיאה בבדיקת טלפון ב-Auth:', e);
            return NextResponse.json({ error: 'שגיאה בבדיקת משתמש לפי טלפון' }, { status: 500 });
          }
        }

        if (byPhone) {
          const ownerEmailLower = (byPhone.email || '').toLowerCase();
          if (ownerEmailLower === emailLower) {
            if (!byPhone.disabled) {
              // טלפון ואימייל תואמים אך החשבון פעיל → חסימה
              return NextResponse.json(
                { error: 'חשבון עם פרטים אלו כבר פעיל. יש להתחבר למערכת ולנהל את המנוי מתוך החשבון.' },
                { status: 400 }
              );
            }
            // חשבון אותו אדם אך מושבת → החייאה/שדרוג
            resolvedExistingUid = byPhone.uid;
            resolvedSource = 'existing-user-upgrade';
          } else {
            // קונפליקט זהות: מייל חדש + טלפון של חשבון אחר
            return NextResponse.json(
              { error: 'מספר הטלפון משויך לחשבון אחר עם כתובת אימייל שונה. יש להתחבר לחשבון הקיים או לפנות לתמיכה להעברת המספר.' },
              { status: 400 }
            );
          }
        } else if (await findPhoneOwnerUid(phone)) {
          // הטלפון לא ב-Auth אבל רשום במשתמש ב-users (שם הבוט מזהה לפיו)
          return NextResponse.json(
            { error: 'מספר הטלפון משויך לחשבון אחר. יש להתחבר לחשבון הקיים או לפנות לתמיכה.' },
            { status: 400 }
          );
        }
      }
    }

    // בניית בקשה ל-Grow
    const normalizedEmail = emailLower;
    const customField = `MAGICSALE-${normalizedEmail}`;

    // הרשמה מדף MagicTouch (או מסלול MagicTouch בלבד) חוזרת לעמודים ממותגי MagicTouch
    const isMagicTouchSignup =
      source === 'magic-touch-signup' ||
      plan === 'magic_touch';

    const successPath = isMagicTouchSignup ? '/MagicTouchPaymentSuccess' : '/payment-success';

    const successUrl =
      `${APP_BASE_URL}${successPath}?fullName=${encodeURIComponent(fullName)}` +
      `&email=${encodeURIComponent(normalizedEmail)}` +
      `&phone=${encodeURIComponent(phone)}` +
      `&customField=${encodeURIComponent(customField)}` +
      `&plan=${plan}`;

    const cancelUrl = isMagicTouchSignup
      ? `${APP_BASE_URL}/MagicTouchPaymentFailed`
      : `${APP_BASE_URL}/payment-failed`;

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
   formData.append(
  'cField3',
  JSON.stringify(normalizedAddOns)
);
    formData.append('cField4', resolvedSource);               // 'existing-user-upgrade' או 'public-signup'
    if (resolvedExistingUid) formData.append('cField9', resolvedExistingUid); // UID קיים להחייאה
    formData.append(
  'cField6',
  totalPrice.toString()
);
    formData.append('cField7', idNumber);
    formData.append('cField8', GROW_PAGE_CODE);
    if (trimmedCoupon) formData.append('cField5', trimmedCoupon);
    formData.append('notifyUrl', `${APP_BASE_URL}/api/webhook`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      // const response = await axios.post(GROW_ENDPOINTS.createPayment, formData, {
      //   headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      //   signal: controller.signal,
      // });
      const response = await axios.post(
        GROW_ENDPOINTS.createPayment,
        formData.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: controller.signal }
      );
      
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
      
      // console.error('❌ Grow createPayment unexpected:', {
      //   data,
      //   sent: {
      //     sum: totalPrice,
      //     email: normalizedEmail,
      //     phone,
      //     plan,
      //     resolvedSource,
      //     hasUid: !!resolvedExistingUid,
      //     hasCoupon: !!trimmedCoupon,
      //   },
      // });
      // return NextResponse.json({ error: 'יצירת תשלום נכשלה' }, { status: 500 });
      // console.error('❌ Grow createPayment unexpected:', data);
return NextResponse.json({ error: 'Grow createPayment unexpected', details: data }, { status: 502 });

    } catch (error: any) {
      clearTimeout(timeout);
      if (error.code === 'ERR_CANCELED') {
        return NextResponse.json({ error: 'פנייה לספק נקטעה. נסו שוב.' }, { status: 504 });
      }
      // console.error('❌ Grow API error:', error.message);
      return NextResponse.json({ error: 'שגיאה בתקשורת עם Grow' }, { status: 502 });
    }
  } catch (error: any) {
    // console.error('❌ Internal error:', error);
    return NextResponse.json({ error: 'שגיאה פנימית בשרת' }, { status: 500 });
  }
}
