import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fullName, email, phone } = body;

    if (!fullName || !email || !phone) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    // קריאה ל-Grow (משולם) כדי ליצור קישור תשלום
    const paymentRequest = {
      sum: 120, // סכום החיוב החודשי בשקלים
      description: "דמי מנוי חודשי למערכת MagicSale",
      first_payment: true,
      interval: 1,
      period: "MONTH", // חודש
      recurring_description: "מנוי חודשי MagicSale",
      custom_field: `MAGICSALE-${email}`, // זיהוי ייחודי
      email,
      phone,
      full_name: fullName,
      success_url: `https://test.magicsale.co.il/payment-success?fullName=${encodeURIComponent(fullName)}&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}&subscriptionId=PLACEHOLDER`,
      error_url: `https://test.magicsale.co.il/payment-failed`,
    };

    const { data } = await axios.post('https://secure.meshulam.co.il/api/recurring_charge', paymentRequest, {
      headers: {
        Authorization: `Bearer YOUR_API_KEY`, // כאן לשים את ה-API KEY האמיתי שתקבלי
        'Content-Type': 'application/json',
      }
    });

    if (data?.status === 'success') {
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
