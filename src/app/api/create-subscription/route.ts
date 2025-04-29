import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fullName, email, phone } = body;

    if (!fullName || !email || !phone) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const formData = new URLSearchParams();
    formData.append('pageCode', '2097a1a9413e');
    formData.append('userId', '8f215caa9b2a3903');
    formData.append('sum', '120');
    formData.append('successUrl', `https://test.magicsale.co.il/payment-success?fullName=${encodeURIComponent(fullName)}&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`);
    formData.append('cancelUrl', `https://test.magicsale.co.il/payment-failed`);
    formData.append('description', 'תשלום עבור מנוי חודשי למערכת MagicSale');
    formData.append('pageField[fullName]', fullName);
    formData.append('pageField[phone]', phone);
    formData.append('pageField[email]', email);
    formData.append('cField1', `MAGICSALE-${email}`);

    const { data } = await axios.post(
      'https://sandbox.meshulam.co.il/api/light/server/1.0/createPaymentProcess',
      formData,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    if (data?.status === '1' && data?.url) {
      return NextResponse.json({ paymentUrl: data.url });
    } else {
      console.error('API Error:', data);
      return NextResponse.json({ error: 'Payment creation failed' }, { status: 500 });
    }
  } catch (error: any) {
    console.error('Internal Server Error:', error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
