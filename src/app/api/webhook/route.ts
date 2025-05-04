import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const db = admin.firestore();
const auth = admin.auth();

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    // לוגים לכל השדות שמגיעים כדי לעזור באבחון
    console.log('🌐 Received form data:');
    formData.forEach((value, key) => {
      console.log(`${key}: ${value}`);
    });

    const status = formData.get('status')?.toString();
    const fullName = formData.get('fullName')?.toString() || formData.get('payerFullName')?.toString();
    const email = formData.get('payerEmail')?.toString();
    const phone = formData.get('payerPhone')?.toString();
    const processId = formData.get('processId')?.toString();
    const customField = formData.get('customFields[cField1]')?.toString(); // שם מותאם מ־Grow

    const paymentDate = new Date();

    // בדיקת שדות חובה
    if (!status || !customField || !email || !fullName || !phone || !processId) {
      console.warn('❌ Missing required fields:', {
        status, fullName, email, phone, processId, customField
      });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // חיפוש משתמש לפי customField
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('customField', '==', customField).get();

    if (!snapshot.empty) {
      const existingDoc = snapshot.docs[0];
      await existingDoc.ref.update({
        subscriptionStatus: status,
        lastPaymentDate: paymentDate,
      });

      console.log(`🔄 Updated existing user ${existingDoc.id}`);
      return NextResponse.json({ success: true });
    }

    // יצירת סיסמה זמנית
    const tempPassword = Math.random().toString(36).slice(-8);

    // יצירת יוזר ב־Firebase Auth
    const newUser = await auth.createUser({
      email,
      password: tempPassword,
      displayName: fullName,
      phoneNumber: phone,
    });

    // שמירת היוזר במסד הנתונים
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
