import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'querystring';
import { admin } from '@/lib/firebase/firebase-admin';

export const dynamic = 'force-dynamic';

const formatPhone = (phone?: string) => {
  if (!phone) return undefined;
  if (phone.startsWith('0')) {
    return '+972' + phone.slice(1);
  }
  return phone;
};

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/x-www-form-urlencoded')) {
      return NextResponse.json({ error: 'Invalid content type' }, { status: 400 });
    }

    const rawBody = await req.text();
    const data = parse(rawBody);

    // קלטים מה-webhook
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

    if (!statusCode || !email || !fullName || !phone || !processId) {
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
          }
        } : {}),
      });
      return NextResponse.json({ updated: true });
    }


    let existingUser: any = null;
    try {
      existingUser = await auth.getUserByEmail(email);
      return NextResponse.json({ error: 'User already exists', uid: existingUser.uid }, { status: 409 });
    } catch (e) {
      // ממשיך רק אם לא קיים
    }

    const newUser = await auth.createUser({
      email,
      password: Math.random().toString(36).slice(-8),
      displayName: fullName,
      // phoneNumber: formatPhone(phone), // אופציונלי
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

    return NextResponse.json({ created: true });
  } catch (err: any) {
    console.error('❌ Webhook error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
