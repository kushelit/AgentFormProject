// File: /app/api/cancel-subscription/route.ts

import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(req: NextRequest) {
  try {
    const { subscriptionId } = await req.json();

    if (!subscriptionId) {
      return NextResponse.json({ error: 'Missing subscriptionId' }, { status: 400 });
    }

    const formData = new URLSearchParams();
    formData.append('userId', '8f215caa9b2a3903'); // ✅ מזהה חשבון ה־Grow שלך
    formData.append('directDebitId', subscriptionId); // ✅ מזהה הוראת הקבע
    formData.append('action', 'cancel'); // ✅ ביטול ההוראה

    const { data } = await axios.post(
      'https://sandbox.meshulam.co.il/api/light/server/1.0/updateDirectDebit',
      formData,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    console.log('✅ Cancel response from Grow:', data);

    if (data?.status === '1') {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: data?.err || 'Cancellation failed' }, { status: 500 });
    }
  } catch (error: any) {
    console.error('❌ Cancel subscription error:', error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
