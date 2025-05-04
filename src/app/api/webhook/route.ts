import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { parse } from 'querystring'; // חשוב!

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const db = admin.firestore();
const auth = admin.auth();

export async function POST(req: NextRequest) {
  try {
    const rawText = await req.text(); // 🟡 Grow שולחים POST כ-text
    const body = parse(rawText); // 🟢 ממיר ל־object כמו JSON

    const status = body.status?.toString();
    const fullName = body.fullName?.toString() || body.payerFullName?.toString();
    const email = body.payerEmail?.toString();
    const phone = body.payerPhone?.toString();
    const processId = body.processId?.toString();
    const customField = body['customFields[cField1]']?.toString(); // אם יש לך כזה שדה

    const paymentDate = new Date();

    console.log('✅ Webhook from Grow:', { status, fullName, email, phone, processId, customField });

    if (!status || !email || !fullName || !phone || !processId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('customField', '==', customField).get();

    if (!snapshot.empty) {
      const existingDoc = snapshot.docs[0];
      await existingDoc.ref.update({
        subscriptionStatus: status,
        lastPaymentDate: paymentDate,
      });
      return NextResponse.json({ success: true, updated: true });
    }

    const tempPassword = Math.random().toString(36).slice(-8);

    const newUser = await auth.createUser({
      email,
      password: tempPassword,
      displayName: fullName,
      phoneNumber: phone,
    });

    await db.collection('users').doc(newUser.uid).set({
      name: fullName,
      email,
      phone,
      subscriptionId: processId,
      subscriptionStatus: status,
      subscriptionStart: paymentDate,
      nextBillingDate: null,
      role: 'agent',
      agentId: processId,
      customField: customField || '',
    });

    return NextResponse.json({ success: true, created: true });

  } catch (error: any) {
    console.error('❌ Webhook error:', error.message || error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
