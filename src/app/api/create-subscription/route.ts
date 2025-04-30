import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fullName, email, phone } = body;

    console.log('📥 Received subscription request with:', body);

    if (!fullName || !email || !phone) {
      console.warn('⚠️ Missing required fields');
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const customField = `MAGICSALE-${email}`;
    const successUrl = `https://test.magicsale.co.il/payment-success?fullName=${encodeURIComponent(fullName)}&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}&customField=${encodeURIComponent(customField)}`;
    const cancelUrl = `https://test.magicsale.co.il/payment-failed`;

    const formData = new URLSearchParams();
    formData.append('pageCode', '2097a1a9413e');
    formData.append('userId', '8f215caa9b2a3903');
    formData.append('sum', '1');
    formData.append('successUrl', successUrl);
    formData.append('cancelUrl', cancelUrl);
    formData.append('description', 'תשלום עבור מנוי חודשי למערכת MagicSale');
    formData.append('pageField[fullName]', fullName);
    formData.append('pageField[phone]', phone);
    formData.append('pageField[email]', email);
    formData.append('cField1', customField);

    console.log('🚀 Sending request to Meshulam with:', Object.fromEntries(formData));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // ⏱ הגדלנו ל־15 שניות

    let data;
    try {
      const response = await axios.post(
        'https://sandbox.meshulam.co.il/api/light/server/1.0/createPaymentProcess',
        formData,
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: controller.signal
        }
      );
      data = response.data;
    } catch (error: any) {
      clearTimeout(timeout);
      if (error.code === 'ERR_CANCELED') {
        console.error('🛑 Request to Grow was canceled (timeout)');
        return NextResponse.json({ error: 'Timeout contacting payment provider' }, { status: 504 });
      }

      console.error('❌ Error during request to Meshulam:', error.message || error);
      return NextResponse.json({ error: 'Failed to contact payment provider' }, { status: 502 });
    }

    clearTimeout(timeout);
    console.log('✅ Response from Meshulam:', JSON.stringify(data, null, 2));

    if (data?.status === 1 && data?.data?.url && data?.data?.processId) {
      const processId = data.data.processId;

      const redirectUrl = new URL(data.data.url);
      redirectUrl.searchParams.set('processId', processId);
      redirectUrl.searchParams.set('fullName', fullName);
      redirectUrl.searchParams.set('email', email);
      redirectUrl.searchParams.set('phone', phone);
      redirectUrl.searchParams.set('customField', customField);

      console.log('🔗 Redirecting to:', redirectUrl.toString());

      return NextResponse.json({ paymentUrl: redirectUrl.toString() });
    } else {
      console.error('❌ API Error from Meshulam:', data);
      return NextResponse.json({ error: 'Payment creation failed' }, { status: 500 });
    }

  } catch (error: any) {
    console.error('❌ Internal Server Error:', error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
