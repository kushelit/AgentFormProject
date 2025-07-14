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
    console.log('📥 Webhook triggered');

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/x-www-form-urlencoded')) {
      return NextResponse.json({ error: 'Invalid content type' }, { status: 400 });
    }

    const rawBody = await req.text();
    const data = parse(rawBody);

    console.log('📩 Raw Grow webhook payload:\n', JSON.stringify(data, null, 2));


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
    const source = (data['data[customFields][cField4]'] ?? data['customFields[cField4]'])?.toString() ?? '';
    const addOns = addOnsRaw ? JSON.parse(addOnsRaw.toString()) : {};
    const couponCode = (data['data[customFields][cField5]'] ?? data['customFields[cField5]'])?.toString() ?? '';
    const totalCharged = Number(data['customField6'] || 0);

    console.log('📦 Debug fields:', {
      statusCode, email, fullName, phone, processId, customField, subscriptionType
    });

    if (!statusCode || !email || !fullName || !phone || !processId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = admin.firestore();
    const auth = admin.auth();
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('customField', '==', customField).get();

    const paymentDate = new Date();

    
  
    // ✳️ אם קיים משתמש לפי customField – עדכון והחייאה
    if (!snapshot.empty) {
      if (source === 'manual-upgrade') {
        console.log('⏭ Skipping webhook update due to manual upgrade');
        return NextResponse.json({ skipped: true });
      }
 const docRef = snapshot.docs[0].ref;
     // קריאה לדאטה קיים
const userSnap = await docRef.get();
const userData = userSnap.data();
const updateFields: any = {
  isActive: true,
  cancellationDate: admin.firestore.FieldValue.delete(),
  growCancellationStatus: admin.firestore.FieldValue.delete(),
  'permissionOverrides.allow': admin.firestore.FieldValue.delete(),
  'permissionOverrides.deny': admin.firestore.FieldValue.delete(),
  subscriptionStatus,
  lastPaymentStatus: paymentStatus,
  lastPaymentDate: paymentDate,
};
if (couponCode) {
  updateFields.usedCouponCode = couponCode;
}

// עדכון רק אם יש שינוי בפועל
if (transactionId && transactionId !== userData?.transactionId) {
  updateFields.transactionId = transactionId;
}
if (transactionToken && transactionToken !== userData?.transactionToken) {
  updateFields.transactionToken = transactionToken;
}
if (asmachta && asmachta !== userData?.asmachta) {
  updateFields.asmachta = asmachta;
}
if (processId && processId !== userData?.subscriptionId) {
  updateFields.subscriptionId = processId;
}
if (subscriptionType && subscriptionType !== userData?.subscriptionType) {
  updateFields.subscriptionType = subscriptionType;
}
if (addOns && JSON.stringify(addOns) !== JSON.stringify(userData?.addOns)) {
  updateFields.addOns = {
    leadsModule: !!addOns.leadsModule,
    extraWorkers: addOns.extraWorkers || 0,
  };
}
const planChanged =
(subscriptionType && subscriptionType !== userData?.subscriptionType) ||
(addOns && JSON.stringify(addOns) !== JSON.stringify(userData?.addOns));

await docRef.update(updateFields);

 console.log('🟢 Updated user in Firestore');


      try {
        const user = await auth.getUserByEmail(email);

        // שליחת מייל על עדכון תוכנית רק אם שונה subscriptionType או addOns והיוזר לא הוחייה עכשיו

if (planChanged && !user.disabled) {
await fetch('https://test.magicsale.co.il/api/sendEmail', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: email,
    subject: 'עדכון תוכנית במערכת MagicSale',
    html: `
      שלום ${fullName},<br><br>
      תוכנית המנוי שלך עודכנה בהצלחה במערכת MagicSale.<br>
      סוג מנוי נוכחי: <strong>${subscriptionType}</strong><br><br>
      תוכל להתחבר למערכת כאן:<br>
      <a href="https://test.magicsale.co.il/auth/log-in">כניסה למערכת</a><br><br>
      בברכה,<br>
      צוות MagicSale
    `,
  }),
});
}

        if (user.disabled) {
          await auth.updateUser(user.uid, { disabled: false });
          console.log('✅ Firebase Auth user re-enabled');
        } else {
          console.log('ℹ️ Firebase user already active');
        }
 // ✅ יצירת לינק איפוס סיסמה
 const resetLink = await auth.generatePasswordResetLink(email);

 // ✅ שליחת מייל
 await fetch('https://test.magicsale.co.il/api/sendEmail', {
   method: 'POST',
   headers: { 'Content-Type': 'application/json' },
   body: JSON.stringify({
     to: email,
     subject: 'איפוס סיסמה לאחר חידוש מנוי',
     html: `
       שלום ${fullName},<br><br>
       המנוי שלך במערכת MagicSale חודש בהצלחה!<br>
       אם ברצונך להיכנס, באפשרותך לאפס את הסיסמה שלך כאן:<br>
       <a href="${resetLink}">איפוס סיסמה</a><br><br>
       בהצלחה,<br>
       צוות MagicSale
     `,
   }),
 });


      } catch (e) {
        console.warn('⚠️ Firebase user not found for email');
      }

      return NextResponse.json({ updated: true });
    }

    // ✳️ לא קיים לפי customField – נבדוק אם קיים ב־Auth לפי אימייל
    let existingUser: any = null;

    try {
      existingUser = await auth.getUserByEmail(email);
      console.log('🔍 User already exists in Auth:', existingUser.uid);

      if (source === 'manual-upgrade') {
        console.log('⏭ Skipping webhook update for existing Auth user due to manual upgrade');
        return NextResponse.json({ skipped: true });
      }

      await auth.updateUser(existingUser.uid, { disabled: false });
      console.log('✅ Firebase Auth user re-enabled');

      const userRef = db.collection('users').doc(existingUser.uid);
      const userSnap = await userRef.get();
      const userData = userSnap.data();
      const updateFields: any = {
        isActive: true,
        cancellationDate: admin.firestore.FieldValue.delete(),
        growCancellationStatus: admin.firestore.FieldValue.delete(),
        'permissionOverrides.allow': admin.firestore.FieldValue.delete(),
        'permissionOverrides.deny': admin.firestore.FieldValue.delete(),
        subscriptionStatus,
        lastPaymentStatus: paymentStatus,
        lastPaymentDate: paymentDate,
      };
      
      if (transactionId && transactionId !== userData?.transactionId) {
        updateFields.transactionId = transactionId;
      }
      if (transactionToken && transactionToken !== userData?.transactionToken) {
        updateFields.transactionToken = transactionToken;
      }
      if (asmachta && asmachta !== userData?.asmachta) {
        updateFields.asmachta = asmachta;
      }
      if (processId && processId !== userData?.subscriptionId) {
        updateFields.subscriptionId = processId;
      }
      if (subscriptionType && subscriptionType !== userData?.subscriptionType) {
        updateFields.subscriptionType = subscriptionType;
      }
      if (addOns && JSON.stringify(addOns) !== JSON.stringify(userData?.addOns)) {
        updateFields.addOns = {
          leadsModule: !!addOns.leadsModule,
          extraWorkers: addOns.extraWorkers || 0,
        };
      }
      
      await userRef.update(updateFields);
      
      console.log('🔥 Updating user document with data:', {
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
          }
        } : {}),
      });
      
      console.log('✅ Firestore user reactivated');

// ✅ יצירת לינק איפוס סיסמה
const resetLink = await auth.generatePasswordResetLink(email);

// ✅ שליחת מייל
await fetch('https://test.magicsale.co.il/api/sendEmail', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: email,
    subject: 'איפוס סיסמה לאחר חידוש מנוי',
    html: `
      שלום ${fullName},<br><br>
      המנוי שלך במערכת MagicSale חודש בהצלחה!<br>
      אם ברצונך להיכנס, באפשרותך לאפס את הסיסמה שלך כאן:<br>
      <a href="${resetLink}">איפוס סיסמה</a><br><br>
      בהצלחה!<br>
      צוות MagicSale
    `,
  }),
});

return NextResponse.json({ reactivated: true });


    } catch (e) {
      console.log('ℹ️ No Auth user found – creating new user');
    }

    // ✳️ יצירת משתמש חדש
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
      totalCharged,
      subscriptionStartDate: new Date(), 
      role: 'agent',
      agentId: newUser.uid,
      customField,
      isActive: true,
    });

    console.log('🆕 Created new user');

    return NextResponse.json({ created: true });
  } catch (err: any) {
    console.error('❌ Webhook error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
