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
    const timeout = setTimeout(() => controller.abort(), 9000);

    const { data } = await axios.post(
      'https://sandbox.meshulam.co.il/api/light/server/1.0/createPaymentProcess',
      formData,
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: controller.signal
      }
    );

    clearTimeout(timeout);
    console.log('✅ Response from Meshulam:', JSON.stringify(data, null, 2));
    console.log('🔎 status:', data?.status);
    console.log('🔎 url:', data?.data?.url);
    console.log('🔎 err:', data?.err);

    if (data?.status === 1 && data?.data?.url) {
      console.log('🔗 Redirecting to:', data.data.url);
      return NextResponse.json({ paymentUrl: data.data.url });
    } else {
      console.error('❌ API Error from Meshulam:', data);
      return NextResponse.json({ error: 'Payment creation failed' }, { status: 500 });
    }

  } catch (error: any) {
    console.error('❌ Internal Server Error:', error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
