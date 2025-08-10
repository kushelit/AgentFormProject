import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'querystring';
import { admin } from '@/lib/firebase/firebase-admin';
import { GROW_BASE_URL, APP_BASE_URL } from '@/lib/env';
import { logRegistrationIssue } from '@/services/logRegistrationIssue';
import { SubscriptionType, AddOnType } from '@/enums/subscription';



export const dynamic = 'force-dynamic';

const formatPhone = (phone?: string) => {
  if (!phone) return undefined;
  if (phone.startsWith('0')) {
    return '+972' + phone.slice(1);
  }
  return phone;
};

const approveTransaction = async (transactionId: string, transactionToken: string, pageCode: string) => {
  console.log('📤 ApproveTransaction – התחלה');
  console.log('🧾 פרמטרים שנשלחו:', { transactionId, transactionToken, pageCode });

  try {
    const formData = new URLSearchParams();
    formData.append('transactionId', transactionId);
    formData.append('transactionToken', transactionToken);
    formData.append('pageCode', pageCode);

    // const res = await fetch('https://sandbox.meshulam.co.il/api/light/server/1.0/approveTransaction', {

      const res = await fetch(`${GROW_BASE_URL}/approveTransaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const responseText = await res.text();

    console.log('📬 תשובת Grow:', responseText);

    if (!res.ok) {
      console.error('❌ Grow החזיר שגיאה:', res.status, res.statusText);
    } else {
      console.log('✅ ApproveTransaction הצליח ✔️');
    }
  } catch (err) {
    console.error('⚠️ שגיאה בתקשורת עם Grow:', err);
  }
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
    const idNumber = (data['data[customFields][cField7]'] ?? data['customFields[cField7]'])?.toString() ?? '';
    const rawPageCode = data['data[customFields][cField8]'] ?? data['customFields[cField8]'];
    const pageCode = Array.isArray(rawPageCode) ? rawPageCode[0] : rawPageCode?.toString() ?? '';

    // const totalCharged = Number(
    //   data['data[customFields][cField6]'] || 
    //   0
    // );

    const formattedPhone = formatPhone(phone);

    const rawSum = data['data[sum]'];
    const sumStr = Array.isArray(rawSum) ? rawSum[0] : rawSum || '0';
    const totalCharged = parseFloat(sumStr.replace(',', '.'));  

    console.log('📦 Debug fields:', {
      statusCode, email, fullName, phone, processId, customField, subscriptionType
    });

    if (!statusCode || !email || !fullName || !phone || !processId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = admin.firestore();
    const auth = admin.auth();
    // const usersRef = db.collection('users');
    let agenciesValue;
    let couponUsed: {
      code: string;
      discount: number;
      date: FirebaseFirestore.Timestamp;
    } | undefined;
    
    if (couponCode) {
      try {
        const couponSnap = await db.collection('coupons').doc(couponCode.trim()).get();
        if (couponSnap.exists) {
          const couponData = couponSnap.data();
          agenciesValue = couponData?.agencies;
    
          const discount = couponData?.planDiscounts?.[subscriptionType]; // ← הכי חשוב
          const isActive = couponData?.isActive;
    
          if (typeof discount === 'number' && isActive) {
            couponUsed = {
              code: couponCode,
              discount,
              date: admin.firestore.Timestamp.now(),
            };
          }
        }
      } catch (err) {
        console.error('⚠️ שגיאה בשליפת הקופון:', err);
      }
    }
    

const snapshot = await db.collection('users').where('customField', '==', customField).get();
const paymentDate = new Date();

let userDocRef = null;
let userData = null;

if (!snapshot.empty) {
  userDocRef = snapshot.docs[0].ref;
  const userSnap = await userDocRef.get();
  userData = userSnap.data();
} else {
  // ננסה לפי email
  try {
    const existingUser = await auth.getUserByEmail(email);
    console.log('🔍 User found in Auth:', existingUser.uid);

    userDocRef = db.collection('users').doc(existingUser.uid);
    const userSnap = await userDocRef.get();

    if (userSnap.exists) {
      userData = userSnap.data();
    }
  } catch {
    console.log('ℹ️ No existing user found – will create new user');
  }
}

if (userDocRef) {
  // בדיקת כפילות ב-transactionId
  if (transactionId && transactionId === userData?.transactionId) {
    console.log('⏭ Webhook skipped – duplicate transactionId');
    return NextResponse.json({ skipped: true, reason: 'duplicate transactionId' });
  }

  if (source === 'manual-upgrade') {
    console.log('⏭ Skipping webhook update due to manual upgrade');
    return NextResponse.json({ skipped: true });
  }

  const updateFields: any = {
    isActive: true,
    phone: formattedPhone,
    cancellationDate: admin.firestore.FieldValue.delete(),
    growCancellationStatus: admin.firestore.FieldValue.delete(),
    'permissionOverrides.allow': admin.firestore.FieldValue.delete(),
    'permissionOverrides.deny': admin.firestore.FieldValue.delete(),
    'futureChargeAmount': admin.firestore.FieldValue.delete(),
    subscriptionStatus,
    totalCharged,
    subscriptionStartDate: new Date(),
    lastPaymentStatus: paymentStatus,
    lastPaymentDate: paymentDate,
    
  };
  if (fullName && fullName !== userData?.name) {
    updateFields.name = fullName;
  }  

 
  // if (agenciesValue) updateFields.agencies = agenciesValue;
  // if (couponCode) updateFields.usedCouponCode = couponCode;
  // ניהול couponCode ו-agencies
if (couponCode) {
  updateFields.usedCouponCode = couponCode;
  if (agenciesValue !== undefined) {
    updateFields.agencies = agenciesValue;
  }
  if (couponUsed) {
    updateFields.couponUsed = couponUsed;
  }
} else {
  updateFields.usedCouponCode = admin.firestore.FieldValue.delete();
  updateFields.agencies = admin.firestore.FieldValue.delete();
  updateFields.couponUsed = admin.firestore.FieldValue.delete();
}

  if (transactionId && transactionId !== userData?.transactionId) updateFields.transactionId = transactionId;
  if (transactionToken && transactionToken !== userData?.transactionToken) updateFields.transactionToken = transactionToken;
  if (asmachta && asmachta !== userData?.asmachta) updateFields.asmachta = asmachta;
  if (processId && processId !== userData?.subscriptionId) updateFields.subscriptionId = processId;
  if (subscriptionType && subscriptionType !== userData?.subscriptionType) updateFields.subscriptionType = subscriptionType;
  if (idNumber && idNumber !== userData?.idNumber) updateFields.idNumber = idNumber;
  if (pageCode && pageCode !== userData?.pageCode) {
    updateFields.pageCode = pageCode;
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

  await userDocRef.update(updateFields);
  console.log('🟢 Updated user in Firestore');


// 🆕 ✅ הוספת ApproveTransaction כאן:
if (statusCode === '2' && transactionId && transactionToken && pageCode) {
  console.log('📌 תנאים ל־ApproveTransaction מולאו – מתחיל קריאה ל־Grow');
  await approveTransaction(transactionId, transactionToken, pageCode);
}


  try {
    const user = await auth.getUserByEmail(email);

    if (formattedPhone && user.phoneNumber !== formattedPhone) {
      await auth.updateUser(user.uid, {
        phoneNumber: formattedPhone
      });
      console.log('📞 Updated phone number in Firebase Auth');
    }


    if (planChanged && !user.disabled) {
      // await fetch('https://test.magicsale.co.il/api/sendEmail', {
        await fetch(`${APP_BASE_URL}/api/sendEmail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          subject: 'עדכון תוכנית במערכת MagicSale',
          html: `שלום ${fullName},<br><br>תוכנית המנוי שלך עודכנה בהצלחה במערכת MagicSale.<br>סוג מנוי נוכחי: <strong>${subscriptionType}</strong><br><br>תוכל להתחבר למערכת כאן:<br><a href="${APP_BASE_URL}/auth/log-in">כניסה למערכת</a><br><br>בברכה,<br>צוות MagicSale`,
        }),
      });
    }

    if (user.disabled) {
      await auth.updateUser(user.uid, { disabled: false });
      console.log('✅ Firebase Auth user re-enabled');
    }

    const resetLink = await auth.generatePasswordResetLink(email);

    // await fetch('https://test.magicsale.co.il/api/sendEmail', {
      await fetch(`${APP_BASE_URL}/api/sendEmail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        subject: 'איפוס סיסמה לאחר חידוש מנוי',
        html: `שלום ${fullName},<br><br>המנוי שלך במערכת MagicSale חודש בהצלחה!<br>אם ברצונך להיכנס, באפשרותך לאפס את הסיסמה שלך כאן:<br><a href="${resetLink}">איפוס סיסמה</a><br><br>בהצלחה,<br>צוות MagicSale`,
      }),
    });
  } catch {
    console.log('⚠️ Firebase Auth user not found');
  }

  return NextResponse.json({ updated: true });
}
// אם לא נמצא משתמש קיים, ניצור משתמש חדש
    // ✳️ יצירת משתמש חדש
    const newUser = await auth.createUser({
      email,
      password: Math.random().toString(36).slice(-8),
      displayName: fullName,
      phoneNumber: formattedPhone
    });

    const resetLink = await auth.generatePasswordResetLink(email);

    // await fetch('https://test.magicsale.co.il/api/sendEmail', {
      await fetch(`${APP_BASE_URL}/api/sendEmail`, {
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
          ולאחר מכן להתחבר כאן: <a href="${APP_BASE_URL}/auth/log-in">כניסה למערכת</a><br><br>
          בהצלחה!<br>
          צוות MagicSale
        `,
      }),
    });

    // await db.collection('users').doc(newUser.uid).set({
      const newUserData: any = {
      name: fullName,
      idNumber,
      email,
      phone: formattedPhone,
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
      pageCode: pageCode || null,
      isActive: true,
    };

    
// רק אם יש ערך - נוסיף לשדה
if (agenciesValue !== undefined) {
  newUserData.agencies = agenciesValue;
}
if (couponCode) {
  newUserData.usedCouponCode = couponCode;
}
if (couponUsed) {
  newUserData.couponUsed = couponUsed;
}


await db.collection('users').doc(newUser.uid).set(newUserData);

    console.log('🆕 Created new user');

    // 📌 אם התשלום לא מאושר – נרשום בעיה
if (statusCode !== '2') {
  await logRegistrationIssue({
    email,
    phone,
    name: fullName,
    source: 'webhook',
    reason: 'disabled',
    type: 'agent', // או 'worker'
    subscriptionType,
    addOns,
    transactionId,
    processId,
    pageCode,
    couponCode,
    idNumber,
  });
  
}

    // 🆕 ✅ הוספת ApproveTransaction כאן:
if (statusCode === '2' && transactionId && transactionToken && pageCode) {
  console.log('📌 תנאים ל־ApproveTransaction מולאו – מתחיל קריאה ל־Grow');
  await approveTransaction(transactionId, transactionToken, pageCode);
}

    return NextResponse.json({ created: true });
  } catch (err: any) {
    console.error('❌ Webhook error:', err);
    
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}