import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const db = admin.firestore();
const auth = admin.auth();

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData(); // ✅ לא req.json()!

    const status = formData.get('status')?.toString();
    const fullName = formData.get('fullName')?.toString() || formData.get('payerFullName')?.toString();
    const email = formData.get('payerEmail')?.toString();
    const phone = formData.get('payerPhone')?.toString();
    const processId = formData.get('processId')?.toString();
    const customField = formData.get('customFields[cField1]')?.toString();

    const paymentDate = new Date();

    if (!status || !customField || !email || !fullName || !phone || !processId) {
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
      return NextResponse.json({ success: true });
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

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Webhook error:', error.message || error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
