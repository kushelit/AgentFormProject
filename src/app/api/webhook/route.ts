import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0; // ביטול cache למניעת בעיות auth

const db = admin.firestore();
const auth = admin.auth();

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const status = formData.get('status');
    const fullName = formData.get('fullName') || formData.get('payerFullName');
    const email = formData.get('payerEmail');
    const phone = formData.get('payerPhone');
    const processId = formData.get('processId');
    const customField = formData.get('customFields[cField1]');

    console.log('✅ Webhook received with:', {
      status,
      fullName,
      email,
      phone,
      processId,
      customField,
    });

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

      console.log(`🔄 Updated existing user ${existingDoc.id} with status ${status}`);
      return NextResponse.json({ success: true });
    }

    const tempPassword = Math.random().toString(36).slice(-8);

    const newUser = await auth.createUser({
      email: email as string,
      password: tempPassword,
      displayName: fullName as string,
      phoneNumber: phone as string,
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

    console.log(`✅ Created new user ${newUser.uid}`);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Webhook error:', error.message || error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
