import { NextRequest, NextResponse } from 'next/server';
import { db, auth } from '@/lib/firebase/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { createUserWithEmailAndPassword } from 'firebase/auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0; // 🔒 ביטול cache למניעת בעיות auth

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

    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('customField', '==', customField));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      const userDoc = querySnapshot.docs[0];
      const userRef = doc(db, 'users', userDoc.id);

      await updateDoc(userRef, {
        subscriptionStatus: status,
        lastPaymentDate: paymentDate,
      });

      console.log(`🔄 Updated existing user ${userDoc.id} with status ${status}`);
      return NextResponse.json({ success: true });
    }

    const tempPassword = Math.random().toString(36).slice(-8);
    const newUser = await createUserWithEmailAndPassword(auth, email as string, tempPassword);

    const newUserRef = doc(db, 'users', newUser.user.uid);
    await setDoc(newUserRef, {
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

    console.log(`✅ Created new user ${newUser.user.uid}`);
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('❌ Webhook error:', error.message);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
