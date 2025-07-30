import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'querystring';
import { admin } from '@/lib/firebase/firebase-admin';
import { GROW_BASE_URL, APP_BASE_URL } from '@/lib/env';

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
  try {
    const formData = new URLSearchParams();
    formData.append('transactionId', transactionId);
    formData.append('transactionToken', transactionToken);
    formData.append('pageCode', pageCode);

    const res = await fetch(`${GROW_BASE_URL}/approveTransaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    const responseText = await res.text();
    console.log('📬 תשובת Grow:', responseText);
  } catch (err) {
    console.error('⚠️ שגיאה בתקשורת עם Grow:', err);
  }
};

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('application/x-www-form-urlencoded')) {
      return NextResponse.json({ error: 'Invalid content type' }, { status: 400 });
    }

    const rawBody = await req.text();
    const data = parse(rawBody);

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

    const rawSum = data['data[sum]'];
    const sumStr = Array.isArray(rawSum) ? rawSum[0] : rawSum || '0';
    const totalCharged = parseFloat(sumStr.replace(',', '.'));

    if (!statusCode || !email || !fullName || !phone || !processId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = admin.firestore();
    const auth = admin.auth();
    let agenciesValue;

    if (couponCode) {
      const couponSnap = await db.collection('coupons').doc(couponCode).get();
      if (couponSnap.exists) {
        agenciesValue = couponSnap.data()?.agencies;
      }
    }

    const snapshot = await db.collection('users').where('customField', '==', customField).get();
    const paymentDate = new Date();

    let userDocRef = null;
    if (!snapshot.empty) {
      userDocRef = snapshot.docs[0].ref;
    } else {
      try {
        const existingUser = await auth.getUserByEmail(email);
        userDocRef = db.collection('users').doc(existingUser.uid);
      } catch {}
    }

    if (userDocRef) {
      const userSnap = await userDocRef.get();
      if (!userSnap.exists) {
        const newUserData: any = {
          name: fullName,
          idNumber,
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
          agentId: userDocRef.id,
          customField,
          pageCode: pageCode || null,
          isActive: true,
        };

        if (agenciesValue !== undefined) newUserData.agencies = agenciesValue;
        if (couponCode) newUserData.usedCouponCode = couponCode;

        await userDocRef.set(newUserData);

        if (statusCode === '2' && transactionId && transactionToken && pageCode) {
          await approveTransaction(transactionId, transactionToken, pageCode);
        }

        return NextResponse.json({ createdFromAuthOnly: true });
      }

      const userData = userSnap.data();

      if (transactionId && transactionId === userData?.transactionId) {
        return NextResponse.json({ skipped: true, reason: 'duplicate transactionId' });
      }

      if (source === 'manual-upgrade') {
        return NextResponse.json({ skipped: true });
      }

      const updateFields: any = {
        isActive: true,
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

      if (fullName && fullName !== userData?.name) updateFields.name = fullName;
      if (agenciesValue) updateFields.agencies = agenciesValue;
      if (couponCode) updateFields.usedCouponCode = couponCode;
      if (transactionId && transactionId !== userData?.transactionId) updateFields.transactionId = transactionId;
      if (transactionToken && transactionToken !== userData?.transactionToken) updateFields.transactionToken = transactionToken;
      if (asmachta && asmachta !== userData?.asmachta) updateFields.asmachta = asmachta;
      if (processId && processId !== userData?.subscriptionId) updateFields.subscriptionId = processId;
      if (subscriptionType && subscriptionType !== userData?.subscriptionType) updateFields.subscriptionType = subscriptionType;
      if (idNumber && idNumber !== userData?.idNumber) updateFields.idNumber = idNumber;
      if (pageCode && pageCode !== userData?.pageCode) updateFields.pageCode = pageCode;
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

      if (planChanged && !userSnap.get('disabled')) {
        const resetLink = await auth.generatePasswordResetLink(email);
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

      if (statusCode === '2' && transactionId && transactionToken && pageCode) {
        await approveTransaction(transactionId, transactionToken, pageCode);
      }

      return NextResponse.json({ updated: true });
    }

    const newUser = await auth.createUser({
      email,
      password: Math.random().toString(36).slice(-8),
      displayName: fullName,
    });

    const resetLink = await auth.generatePasswordResetLink(email);
    await fetch(`${APP_BASE_URL}/api/sendEmail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        subject: 'ברוך הבא ל-MagicSale – הגדרת סיסמה',
        html: `שלום ${fullName},<br><br>תודה על ההרשמה למערכת MagicSale!<br>להשלמת ההרשמה והתחברות ראשונה, נא לקבוע סיסמה דרך הקישור הבא:<br><a href="${resetLink}">קביעת סיסמה</a><br><br>בהצלחה!<br>צוות MagicSale`,
      }),
    });

    const newUserData: any = {
      name: fullName,
      idNumber,
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
      pageCode: pageCode || null,
      isActive: true,
    };

    if (agenciesValue !== undefined) newUserData.agencies = agenciesValue;
    if (couponCode) newUserData.usedCouponCode = couponCode;

    await db.collection('users').doc(newUser.uid).set(newUserData);

    if (statusCode === '2' && transactionId && transactionToken && pageCode) {
      await approveTransaction(transactionId, transactionToken, pageCode);
    }

    return NextResponse.json({ created: true });
  } catch (err: any) {
    console.error('❌ Webhook error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
