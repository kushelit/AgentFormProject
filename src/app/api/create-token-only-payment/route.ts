import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fullName, email, phone } = body;

    if (!fullName || !email || !phone) {
      return NextResponse.json({ error: 'אנא מלא/י את כל הפרטים' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase();
    const customField = `MAGICSALE-${normalizedEmail}`;

    const successUrl = `https://test.magicsale.co.il/token-success?fullName=${encodeURIComponent(fullName)}&email=${encodeURIComponent(normalizedEmail)}&phone=${encodeURIComponent(phone)}&customField=${encodeURIComponent(customField)}`;
    const cancelUrl = `https://test.magicsale.co.il/payment-cancelled`;

    const formData = new URLSearchParams();
    formData.append('pageCode', '2097a1a9413e');
    formData.append('userId', '8f215caa9b2a3903');
    formData.append('sum', '1'); // חיוב סמלי
    formData.append('chargeType', '3'); // לא מחייב בפועל
    formData.append('saveCardToken', '1'); // שומר טוקן
    formData.append('successUrl', successUrl);
    formData.append('cancelUrl', cancelUrl);
    formData.append('description', `שמירת אמצעי תשלום ל-MagicSale`);
    formData.append('pageField[fullName]', fullName);
    formData.append('pageField[phone]', phone);
    formData.append('pageField[email]', normalizedEmail);
    formData.append('cField1', customField);
    formData.append('notifyUrl', 'https://test.magicsale.co.il/api/webhook');

    const response = await axios.post(
      'https://sandbox.meshulam.co.il/api/light/server/1.0/createPaymentProcess',
      formData,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const data = response.data;

    if (data?.status === 1 && data?.data?.url && data?.data?.processId) {
      const redirectUrl = new URL(data.data.url);
      redirectUrl.searchParams.set('processId', data.data.processId);
      return NextResponse.json({ paymentUrl: redirectUrl.toString() });
    } else {
      return NextResponse.json({ error: 'יצירת תהליך שמירת טוקן נכשלה' }, { status: 500 });
    }

  } catch (error: any) {
    console.error('❌ Token-only payment error:', error.message);
    return NextResponse.json({ error: 'שגיאה פנימית' }, { status: 500 });
  }
}
