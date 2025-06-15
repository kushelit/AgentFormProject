import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'querystring';
import { admin } from '@/lib/firebase/firebase-admin';

export const dynamic = 'force-dynamic';

const formatPhone = (phone?: string) => {
  if (!phone) return undefined;
  if (phone.startsWith('0')) return '+972' + phone.slice(1);
  return phone;
};

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/x-www-form-urlencoded')) {
      return NextResponse.json({ error: 'Invalid content type' }, { status: 400 });
    }

    const rawBody = await req.text();
    console.log('📩 Raw body:', rawBody);
    const data = parse(rawBody);

    // ניתוח שדות
    const statusCode = data['data[statusCode]']?.toString();
    const paymentStatus = statusCode === '2' ? 'success' : 'failed';
    const subscriptionStatus = statusCode === '2' ? 'active' : 'failed';

    const fullName = (data['data[fullName]'] ?? data.payerFullName)?.toString();
    const email = (data['data[payerEmail]'] ?? data.payerEmail)?.toString();
    const phone = (data['data[payerPhone]'] ?? data.payerPhone)?.toString();
    const processId = (data['data[processId]'] ?? data.processId)?.toString();
    const customField = (data['data[customFields][cField1]'] ?? data['customFields[cField1]'])?.toString() ?? '';
    const subscriptionType = (data['data[customFields][cField2]'] ?? data['customFields[cField2]'])?.toString() ?? '';
    const transactionId = (data['data[transactionId]'] ?? data.transactionId)?.toString();
    const transactionToken = (data['data[transactionToken]'] ?? data.transactionToken)?.toString();
    const asmachta = (data['data[asmachta]'] ?? data.asmachta)?.toString();
    const addOnsRaw = data['data[customFields][cField3]'] || data['customFields[cField3]'];
    const addOns = addOnsRaw ? JSON.parse(addOnsRaw.toString()) : {};

    console.log('🧪 Raw cField3:', addOnsRaw);
    console.log('📬 Email:', email);

    if (!statusCode || !email || !fullName || !phone || !processId) {
      console.warn('⚠️ Missing required fields');
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = admin.firestore();
    const auth = admin.auth();
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('customField', '==', customField).get();

    const paymentDate = new Date();

    if (!snapshot.empty) {
      const docRef = snapshot.docs[0].ref;
      console.log('🔁 Updating existing user by customField');
      await docRef.update({
        subscriptionStatus,
        subscriptionType,
        lastPaymentStatus: paymentStatus,
        lastPaymentDate: paymentDate,
        ...(transactionId ? { transactionId } : {}),
        ...(transactionToken ? { transactionToken } : {}),
        ...(asmachta ? { asmachta } : {}),
        ...(addOns ? {
          addOns: {
            leadsModule: !!addOns.leadsModule,
            extraWorkers: addOns.extraWorkers || 0,
          },
        } : {}),
      });
      return NextResponse.json({ updated: true });
    }

    // 🔍 בדיקה אם המשתמש קיים ב־Auth לפי אימייל
    let existingUser: any = null;
    try {
      if (!email) throw new Error('Missing email before getUserByEmail');
      existingUser = await auth.getUserByEmail(email);
      console.log('🔍 User already exists in Firebase Auth:', existingUser.uid);

      try {
        await auth.updateUser(existingUser.uid, { disabled: false });
        console.log('✅ Firebase Auth user enabled');
      } catch (authError) {
        console.error('❌ שגיאה בהפעלה מחדש של המשתמש ב־Auth:', authError);
      }

      try {
        await db.collection('users').doc(existingUser.uid).update({
          isActive: true,
          subscriptionStatus,
          subscriptionType,
          lastPaymentStatus: paymentStatus,
          lastPaymentDate: paymentDate,
          ...(transactionId ? { transactionId } : {}),
          ...(transactionToken ? { transactionToken } : {}),
          ...(asmachta ? { asmachta } : {}),
          ...(addOns ? {
            addOns: {
              leadsModule: !!addOns.leadsModule,
              extraWorkers: addOns.extraWorkers || 0,
            },
          } : {}),
        });
        console.log('✅ Firestore user reactivated');
      } catch (dbError) {
        console.error('❌ שגיאה בעדכון פרטי המשתמש ב־Firestore:', dbError);
      }

      return NextResponse.json({ reactivated: true });
    } catch (authLookupError) {
      console.log('ℹ️ לא נמצא משתמש קיים לפי אימייל – נוצר יוזר חדש');
    }

    // 🔧 יצירת משתמש חדש
    const newUser = await auth.createUser({
      email,
      password: Math.random().toString(36).slice(-8),
      displayName: fullName,
    });

    const resetLink = await auth.generatePasswordResetLink(email);

    await fetch('https://test.magicsale.co.il/api/sendEmail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        subject: 'ברוך הבא ל-MagicSale – הגדרת סיסמה',
        html: `
          שלום ${fullName},<br><br>
          תודה על ההרשמה למערכת MagicSale!<br>
          להשלמת ההרשמה והתחברות ראשונה, נא לקבוע סיסמה דרך הקישור הבא:<br>
          <a href="${resetLink}">קביעת סיסמה</a><br><br>
          לאחר מכן, תוכלי להתחבר כאן: <a href="https://test.magicsale.co.il/auth/log-in">כניסה למערכת</a><br><br>
          בהצלחה!<br>
          צוות MagicSale
        `,
      }),
    });

    await db.collection('users').doc(newUser.uid).set({
      name: fullName,
      email,
      phone,
      subscriptionId: processId,
      transactionId: transactionId || null,
      transactionToken: transactionToken || null,
      asmachta: asmachta || null,
      subscriptionStatus,
      subscriptionType,
      addOns: {
        leadsModule: !!addOns.leadsModule,
        extraWorkers: addOns.extraWorkers || 0,
      },
      lastPaymentStatus: paymentStatus,
      lastPaymentDate: paymentDate,
      role: 'agent',
      agentId: newUser.uid,
      customField,
      isActive: true,
    });

    console.log('🎉 New user created:', newUser.uid);
    return NextResponse.json({ created: true });
  } catch (err: any) {
    console.error('❌ Webhook error:', err.message || err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
