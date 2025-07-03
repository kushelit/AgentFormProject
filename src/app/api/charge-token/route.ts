import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, fullName, email, phone, sum } = body;

    if (!token || !sum || !fullName || !email || !phone) {
      return NextResponse.json({ error: 'נתונים חסרים לחיוב' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase();
    const customField = `MAGICSALE-${normalizedEmail}`;

    const formData = new URLSearchParams();
    formData.append('userId', '8f215caa9b2a3903');
    formData.append('sum', sum.toString()); // לדוג' 129
    formData.append('token', token);
    formData.append('fullName', fullName);
    formData.append('email', normalizedEmail);
    formData.append('phone', phone);
    formData.append('cField1', customField);
    formData.append('description', `חיוב חודשי עבור מנוי MagicSale`);
    formData.append('notifyUrl', 'https://test.magicsale.co.il/api/webhook');

    const response = await axios.post(
      'https://sandbox.meshulam.co.il/api/light/server/1.0/chargeToken',
      formData,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const data = response.data;

    if (data?.status === 1) {
      return NextResponse.json({ success: true, transactionId: data.data.transactionId });
    } else {
      return NextResponse.json({ success: false, error: data?.message || 'שגיאה בעת חיוב' });
    }
  } catch (error: any) {
    console.error('❌ Token charge error:', error.message);
    return NextResponse.json({ error: 'שגיאה בשרת בעת חיוב מהטוקן' }, { status: 500 });
  }
}
