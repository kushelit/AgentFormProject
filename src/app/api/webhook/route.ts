// src/app/api/webhook/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { parse } from 'querystring';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const db = admin.firestore();
const auth = admin.auth();

export async function POST(req: NextRequest) {
  try {
    // Grow שולחים x-www-form-urlencoded, לכן נשתמש ב־text ונפענח עם querystring
    const raw = await req.text();
    const data = parse(raw);

    const status = data.status?.toString();
    const fullName = data.fullName?.toString() || data.payerFullName?.toString();
    const email = data.payerEmail?.toString();
    const phone = data.payerPhone?.toString();
    const processId = data.processId?.toString();
    const customField = data['customFields[cField1]']?.toString() ?? '';

    console.log('✅ Webhook Payload:', { status, fullName, email, phone, processId, customField });

    if (!status || !email || !fullName || !phone || !processId) {
      console.warn('⚠️ Missing fields');
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('customField', '==', customField).get();

    const paymentDate = new Date();

    if (!snapshot.empty) {
      const existingDoc = snapshot.docs[0];
      await existingDoc.ref.update({
        subscriptionStatus: status,
        lastPaymentDate: paymentDate,
      });
      console.log(`🔄 Updated user ${existingDoc.id}`);
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

    console.log(`✅ Created user ${newUser.uid}`);
    return NextResponse.json({ created: true });

  } catch (error: any) {
    console.error('❌ Webhook error:', error.message || error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
