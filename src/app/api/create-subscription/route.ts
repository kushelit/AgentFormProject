import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import axios from 'axios';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fullName, email, phone, plan } = body;

    if (!fullName || !email || !phone || !plan) {
      return NextResponse.json({ error: 'אנא מלא/י את כל השדות הנדרשים' }, { status: 400 });
    }

    const db = admin.firestore();
    const planDoc = await db.collection('subscriptions_permissions').doc(plan).get();

    if (!planDoc.exists) {
      return NextResponse.json({ error: 'סוג מסלול לא קיים' }, { status: 400 });
    }

    const planData = planDoc.data();
    const price = planData?.price || 1;
    const normalizedEmail = email.toLowerCase();
    const customField = `MAGICSALE-${normalizedEmail}`;

    const successUrl = `https://test.magicsale.co.il/payment-success?fullName=${encodeURIComponent(fullName)}&email=${encodeURIComponent(normalizedEmail)}&phone=${encodeURIComponent(phone)}&customField=${encodeURIComponent(customField)}&plan=${plan}`;
    const cancelUrl = `https://test.magicsale.co.il/payment-failed`;

    const formData = new URLSearchParams();
    formData.append('pageCode', '2097a1a9413e');
    formData.append('userId', '8f215caa9b2a3903');
    formData.append('sum', price.toString());
    formData.append('successUrl', successUrl);
    formData.append('cancelUrl', cancelUrl);
    formData.append('description', `תשלום עבור מסלול ${plan}`);
    formData.append('pageField[fullName]', fullName);
    formData.append('pageField[phone]', phone);
    formData.append('pageField[email]', normalizedEmail);
    formData.append('cField1', customField);
    formData.append('cField2', plan);
    formData.append('notifyUrl', 'https://test.magicsale.co.il/api/webhook');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await axios.post(
        'https://sandbox.meshulam.co.il/api/light/server/1.0/createPaymentProcess',
        formData,
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: controller.signal
        }
      );

      const data = response.data;
      clearTimeout(timeout);

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
