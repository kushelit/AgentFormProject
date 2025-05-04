import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'querystring';
import { admin } from '@/lib/firebase/firebase-admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/x-www-form-urlencoded')) {
      return NextResponse.json({ error: 'Invalid content type' }, { status: 400 });
    }

    const rawBody = await req.text();
    const data = parse(rawBody);

    console.log("📦 Webhook payload:", data);

    const status = data.status?.toString();
    const fullName = data.fullName?.toString() || data.payerFullName?.toString();
    const email = data.payerEmail?.toString();
    const phone = data.payerPhone?.toString();
    const processId = data.processId?.toString();
    const customField = data['customFields[cField1]']?.toString() ?? '';

    if (!status || !email || !fullName || !phone || !processId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = admin.firestore();
    const auth = admin.auth();

    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('customField', '==', customField).get();

    const paymentDate = new Date();

    if (!snapshot.empty) {
      const docRef = snapshot.docs[0].ref;
      await docRef.update({
        subscriptionStatus: status,
        lastPaymentDate: paymentDate,
      });
      return NextResponse.json({ updated: true });
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
      customField,
    });

    return NextResponse.json({ created: true });

  } catch (err: any) {
    console.error("❌ Webhook error:", err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
