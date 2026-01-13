// /api/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'querystring';
import { admin } from '@/lib/firebase/firebase-admin';
import { GROW_BASE_URL, APP_BASE_URL } from '@/lib/env';
import { logRegistrationIssue } from '@/services/logRegistrationIssue';

export const dynamic = 'force-dynamic';

// ---- Utils ----
// מינימום שינוי: משאיר רק גורם MFA מסוג phone עם המספר החדש
async function ensureSingleMfaPhone(uid: string, phoneE164?: string) {
  if (!phoneE164 || !phoneE164.startsWith('+')) return;

  await admin.auth().updateUser(uid, {
    multiFactor: {
      enrolledFactors: [
        { factorId: 'phone' as const, phoneNumber: phoneE164, displayName: 'Main phone' },
      ],
    },
  });

  // החלת השינוי מיידית על סשנים פתוחים
  await admin.auth().revokeRefreshTokens(uid);
}


const formatPhone = (raw?: string) => {
  if (!raw) return undefined;
  let s = raw.replace(/[\s\-()]/g, '').trim();
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('+972')) return s;
  if (s.startsWith('972')) return '+' + s;
  if (s.startsWith('0')) return '+972' + s.slice(1);
  if (s.startsWith('+')) return s;
  if (/^\d{9,10}$/.test(s)) {
    if (s.length === 10 && s.startsWith('0')) s = s.slice(1);
    return '+972' + s;
  }
  return undefined;
};

const approveTransaction = async (transactionId: string, transactionToken: string, pageCode: string) => {
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
    // console.log('📬 Grow approveTransaction response:', responseText);
  } catch (err) {
    // console.error('⚠️ approveTransaction error:', err);
  }
};

// --- helpers (למעלה בקובץ /api/webhook/route.ts) ---

// טוען תבניות ברירת מחדל כפי שהגדרת ב- default_contracts
async function loadContractTemplates(db: FirebaseFirestore.Firestore) {
  const snap = await db.collection('default_contracts').get();

  return snap.docs.map(d => {
    const data = d.data() as {
      productsGroup: string;
      commissionHekef?: number | string;
      commissionNifraim?: number | string;
      minuySochen?: boolean;
      commissionNiud?: number | string; // לא חובה אצלך, ניפול ל-0
    };

    return {
      id: d.id,
      productsGroup: String(data.productsGroup || ''),
      commissionHekef: Number(data.commissionHekef ?? 0),
      commissionNifraim: Number(data.commissionNifraim ?? 0),
      commissionNiud: Number(data.commissionNiud ?? 0), // אם אין—0
      minuySochen: Boolean(data.minuySochen ?? false),
    };
  });
}

// האם כבר יש לסוכן חוזים (כדי לא להזריק פעמיים)
async function agentHasAnyContracts(db: FirebaseFirestore.Firestore, agentId: string) {
  const q = await db.collection('contracts')
    .where('AgentId', '==', agentId)
    .limit(1)
    .get();
  return !q.empty;
}

// מזריק חוזי ברירת מחדל (מבוססי productsGroup) אם אין לסוכן שום חוזים
// מחליף את ensureDefaultContractsForAgent הקיים – זהה לסכימה של הטופס
async function ensureDefaultContractsForAgent(
  db: FirebaseFirestore.Firestore,
  agentId: string
) {
  if (!agentId) return;

  // אם כבר יש חוזים לסוכן – לא מזריקים שוב
  const existSnap = await db.collection('contracts')
    .where('AgentId', '==', agentId)
    .limit(1)
    .get();
  if (!existSnap.empty) return;

  // טען תבניות מ-default_contracts (כמו שבנית)
  const snap = await db.collection('default_contracts').get();

  const batch = db.batch();
  const col = db.collection('contracts');

  snap.docs.forEach(d => {
    const t = d.data() as {
      productsGroup: string;
      commissionHekef?: number | string;
      commissionNifraim?: number | string;
      commissionNiud?: number | string;
      minuySochen?: boolean;
    };

    // 👇 בדיוק כמו בטופס: מחרוזות, ושדות company/product ריקים
    batch.set(col.doc(), {
      AgentId: agentId,
      company: '',
      product: '',
      productsGroup: String(t.productsGroup ?? ''),

      commissionHekef: String(t.commissionHekef ?? '0'),
      commissionNifraim: String(t.commissionNifraim ?? '0'),
      commissionNiud: String(t.commissionNiud ?? '0'),

      minuySochen: Boolean(t.minuySochen ?? false),

      seededBy: 'webhook-defaults',
      seededAt: new Date(),
    });
  });

  await batch.commit();
}


// ---- Webhook ----
export async function POST(req: NextRequest) {
  try {
    if (!(req.headers.get('content-type') || '').includes('application/x-www-form-urlencoded')) {
      return NextResponse.json({ error: 'Invalid content type' }, { status: 400 });
    }

    const rawBody = await req.text();
    const data = parse(rawBody);
    // console.log('📩 Raw Grow webhook payload:\n', JSON.stringify(data, null, 2));

    // Base fields
    const statusCode = data['data[statusCode]']?.toString();
    const paymentStatus = statusCode === '2' ? 'success' : 'failed';
    const subscriptionStatus = statusCode === '2' ? 'active' : 'failed';

    const fullName = (data['data[fullName]'] ?? data.payerFullName)?.toString();
    const email = (data['data[payerEmail]'] ?? data.payerEmail)?.toString();
    const phone = (data['data[payerPhone]'] ?? data.payerPhone)?.toString();
    const processId = (data['data[processId]'] ?? data.processId)?.toString();

    const customField = (data['data[customFields][cField1]'] ?? data['customFields[cField1]'])?.toString() ?? '';
    const subscriptionType = (data['data[customFields][cField2]'] ?? data['customFields[cField2]'])?.toString() ?? '';
    const addOnsRaw = (data['data[customFields][cField3]'] ?? data['customFields[cField3]']);
    const source = (data['data[customFields][cField4]'] ?? data['customFields[cField4]'])?.toString() ?? '';
    const couponCode = (data['data[customFields][cField5]'] ?? data['customFields[cField5]'])?.toString() ?? '';
    const idNumber = (data['data[customFields][cField7]'] ?? data['customFields[cField7]'])?.toString() ?? '';
    const rawPageCode = (data['data[customFields][cField8]'] ?? data['customFields[cField8]']);
    const pageCode = Array.isArray(rawPageCode) ? rawPageCode[0] : rawPageCode?.toString() ?? '';

    // ⭐️ UID של משתמש קיים (אם הגיע מה-POST)
    const rawUid = (data['data[customFields][cField9]'] ?? data['customFields[cField9]']);
    const existingUid = Array.isArray(rawUid) ? rawUid[0] : rawUid?.toString() ?? '';

    const transactionId = (data['data[transactionId]'] ?? data.transactionId)?.toString();
    const transactionToken = (data['data[transactionToken]'] ?? data.transactionToken)?.toString();
    const asmachta = (data['data[asmachta]'] ?? data.asmachta)?.toString();

    const addOns = addOnsRaw ? JSON.parse((Array.isArray(addOnsRaw) ? addOnsRaw[0] : addOnsRaw).toString()) : {};
    const formattedPhone = formatPhone(phone);

    const rawSum = data['data[sum]'];
    const sumStr = Array.isArray(rawSum) ? rawSum[0] : rawSum || '0';
    const totalCharged = parseFloat(sumStr.replace(',', '.'));

    if (!statusCode || !email || !fullName || !phone || !processId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const emailLower = email.toLowerCase();
    const db = admin.firestore();
    const auth = admin.auth();

    // --- קופון (לוגים/אג׳נסי/שימוש) ---
    let agenciesValue: any;
    let couponUsed:
    | {
        code: string;
        discount: number;
        // נשאיר גם date לתאימות אחורה (יש אצלך DB עם זה)
        date?: any;
        appliedAt: FirebaseFirestore.Timestamp;
        expiresAt?: FirebaseFirestore.Timestamp;
        lastNotifiedAt?: FirebaseFirestore.Timestamp;
        notifyFlags?: { d14?: boolean; d7?: boolean; d3?: boolean; d1?: boolean; expired?: boolean };
      }
    | undefined;
  

    if (couponCode) {
      try {
        // אם מנהלים מסמכי קופון לפי docId=code:
        let couponSnap = await db.collection('coupons').doc(couponCode.trim()).get();
        if (!couponSnap.exists) {
          // fallback אם מנהלים לפי שדה code
          const byCode = await db.collection('coupons').where('code', '==', couponCode.trim()).limit(1).get();
          if (!byCode.empty) couponSnap = byCode.docs[0];
        }
        if (couponSnap.exists) {
          const couponData = couponSnap.data()!;
          agenciesValue = couponData?.agencies;
          const discount = couponData?.planDiscounts?.[subscriptionType];
          const isActive = couponData?.isActive;
          if (typeof discount === 'number' && isActive) {
            const nowTs = admin.firestore.Timestamp.now();

            // 👇 durationDays יגיע מהקופון עצמו (תוסיפי שדה כזה למסמך הקופון)
            const durationDays =
              typeof couponData?.durationDays === 'number' ? couponData.durationDays : null;
            
            let expiresAt: FirebaseFirestore.Timestamp | undefined = undefined;
            
            if (durationDays && durationDays > 0) {
              const nowDate = nowTs.toDate();
              const expDate = new Date(nowDate);
              expDate.setDate(expDate.getDate() + durationDays);
              expiresAt = admin.firestore.Timestamp.fromDate(expDate);
            }
            
            couponUsed = {
              code: couponCode.trim(),
              discount,
              // ✅ תאימות אחורה: date נשמר כמו פעם
              date: nowTs,
              // ✅ חדש:
              appliedAt: nowTs,
              expiresAt,
              notifyFlags: {},
            };
         }
        }
      } catch (err) {
        // console.error('⚠️ coupon fetch error:', err);
      }
    }

    // --- מציאת משתמש יעד ---
    const usersCol = db.collection('users');
    let userDocRef: FirebaseFirestore.DocumentReference | null = null;
    let userData: any = null;

    // 1) אם הגיע UID קיים — ננסה קודם לפיו
    if (existingUid) {
      const docRef = usersCol.doc(existingUid);
      const docSnap = await docRef.get();
      if (docSnap.exists) {
        userDocRef = docRef;
        userData = docSnap.data();
      } else {
        // console.warn('⚠️ cField9 provided but user not found:', existingUid);
      }
    }

    // 2) אם עדיין לא מצאנו — customField
    if (!userDocRef && customField) {
      const byCustom = await usersCol.where('customField', '==', customField).limit(1).get();
      if (!byCustom.empty) {
        userDocRef = byCustom.docs[0].ref;
        userData = (await userDocRef.get()).data();
      }
    }

    // 3) אם עדיין לא — לפי email דרך Auth
    if (!userDocRef) {
      try {
        const authUser = await auth.getUserByEmail(emailLower);
        const ref = usersCol.doc(authUser.uid);
        const snap = await ref.get();
        if (snap.exists) {
          userDocRef = ref;
          userData = snap.data();
        }
      } catch {
        // ignore
      }
    }

    // ⛔️ manual-upgrade → ה-webhook מדלג
    if (source === 'manual-upgrade') {
      // console.log('⏭ Skipping webhook update due to manual-upgrade');
      return NextResponse.json({ skipped: true, reason: 'manual-upgrade' });
    }

    // ⛔️ existing-user-upgrade ללא יוזר → לא ליצור חדש
    if (!userDocRef && source === 'existing-user-upgrade') {
      // console.error('❌ existing-user-upgrade but user not found; not creating a new user');
      await logRegistrationIssue({
        email: emailLower,
        phone,
        name: fullName,
        source: 'webhook',
        reason: 'existing-user-not-found',
        type: 'agent',
        subscriptionType,
        addOns,
        transactionId,
        processId,
        pageCode,
        couponCode,
        idNumber,
      });
      return NextResponse.json({ skipped: true, reason: 'existing-user-not-found' });
    }

    // 🔹 לפני update/create: מניעת כפילות לפי טלפון
    if (!userDocRef && formattedPhone) {
      try {
        const phoneOwner = await auth.getUserByPhoneNumber(formattedPhone);
        if (phoneOwner) {
          if (phoneOwner.email?.toLowerCase() === emailLower) {
            // אותו חשבון → treat as existing
            userDocRef = usersCol.doc(phoneOwner.uid);
            const snap = await userDocRef.get();
            if (!snap.exists) {
              await userDocRef.set({
                name: fullName,
                email: emailLower,
                phone: formattedPhone,
                role: 'agent',
                agentId: phoneOwner.uid,
                customField,
                isActive: true,
                createdFrom: 'webhook-existing-phone',
                subscriptionId: processId ?? null,
              });
            }
            userData = (await userDocRef.get()).data();
          } else {
            // המספר שייך לחשבון אחר (אימייל שונה) → לא יוצרים חדש
            await logRegistrationIssue({
              email: emailLower,
              phone,
              name: fullName,
              source: 'webhook',
              reason: 'phone-already-exists',
              type: 'agent',
              subscriptionType,
              addOns,
              transactionId,
              processId,
              pageCode,
              couponCode,
              idNumber,
            });
            return NextResponse.json({ skipped: true, reason: 'phone-already-exists' });
          }
        }
      } catch (e: any) {
        if (e.code !== 'auth/user-not-found') {
          // console.error('⚠️ webhook phone lookup error:', e);
          return NextResponse.json({ error: 'שגיאה באימות טלפון' }, { status: 500 });
        }
        // user-not-found → מותר להמשיך ליצירה
      }
    }

    const paymentDate = new Date();

    // ----- UPDATE EXISTING USER -----
    if (userDocRef) {
      // הגנה מכפילויות
      if (transactionId && transactionId === userData?.transactionId) {
        // console.log('⏭ duplicate transactionId, skipping');
        return NextResponse.json({ skipped: true, reason: 'duplicate transactionId' });
      }

      // עדכון
      const updateFields: any = {
        isActive: true,
        phone: formattedPhone,
        cancellationDate: admin.firestore.FieldValue.delete(),
        growCancellationStatus: admin.firestore.FieldValue.delete(),
        'permissionOverrides.allow': admin.firestore.FieldValue.delete(),
        'permissionOverrides.deny': admin.firestore.FieldValue.delete(),
        futureChargeAmount: admin.firestore.FieldValue.delete(),
        subscriptionStatus,
        totalCharged,
        subscriptionStartDate: new Date(),
        lastPaymentStatus: paymentStatus,
        lastPaymentDate: paymentDate,
      };

      if (fullName && fullName !== userData?.name) updateFields.name = fullName;
      if (couponCode) {
        updateFields.usedCouponCode = couponCode;
        if (agenciesValue !== undefined) updateFields.agencies = agenciesValue;
        if (couponUsed) updateFields.couponUsed = couponUsed;
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
      // console.log('🟢 Updated user in Firestore');


      try {
        await ensureDefaultContractsForAgent(db, userDocRef.id);
        // console.log('🌱 Ensured default contracts on reactivation');
      } catch (e) {
        // console.warn('⚠️ seeding defaults on reactivation failed:', (e as any)?.message || e);
      }
      

      // Auto-approve grow when success
      if (statusCode === '2' && transactionId && transactionToken && pageCode) {
        await approveTransaction(transactionId, transactionToken, pageCode);
      }

      // עדכוני Auth ותקשורת
      try {
        const user = await auth.getUserByEmail(emailLower);
        if (!user.emailVerified) await auth.updateUser(user.uid, { emailVerified: true });
        if (formattedPhone && user.phoneNumber !== formattedPhone) {
          await auth.updateUser(user.uid, { phoneNumber: formattedPhone });
        }
        try { await ensureSingleMfaPhone(user.uid, formattedPhone); } 
        catch (e) { 
          // console.warn('[ensureMfaPhone] skipped:', (e as any)?.message || e);
        }

        if (planChanged && !user.disabled) {
          await fetch(`${APP_BASE_URL}/api/sendEmail`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: emailLower,
              subject: 'עדכון תוכנית במערכת MagicSale',
              html: `שלום ${fullName},<br><br>תוכנית המנוי שלך עודכנה בהצלחה במערכת MagicSale.<br>סוג מנוי נוכחי: <strong>${subscriptionType}</strong><br><br>תוכל להתחבר כאן: <a href="${APP_BASE_URL}/auth/log-in">כניסה למערכת</a>`,
            }),
          });
        }

        if (user.disabled) await auth.updateUser(user.uid, { disabled: false });

        const resetLink = await auth.generatePasswordResetLink(emailLower);
        await fetch(`${APP_BASE_URL}/api/sendEmail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: emailLower,
            subject: 'איפוס סיסמה לאחר חידוש מנוי',
            html: `שלום ${fullName},<br><br>המנוי שלך חודש בהצלחה.<br>לאיפוס סיסמה: <a href="${resetLink}">לחצי כאן</a>`,
          }),
        });
      } catch {
        // console.log('⚠️ Firebase Auth user not found for update');
      }

      return NextResponse.json({ updated: true });
    }

    // ----- CREATE NEW USER (רק אם אין userDocRef) -----
    const newUser = await auth.createUser({
      email: emailLower,
      password: Math.random().toString(36).slice(-8),
      displayName: fullName,
      phoneNumber: formattedPhone,
      emailVerified: true,
    });

    try { await ensureSingleMfaPhone(newUser.uid, formattedPhone); } catch (e) {
      //  console.warn('[ensureMfaPhone] skipped:', (e as any)?.message || e); 
      }

    const resetLink = await auth.generatePasswordResetLink(emailLower);
    await fetch(`${APP_BASE_URL}/api/sendEmail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: emailLower,
        subject: 'ברוך/ה הבא/ה ל-MagicSale – הגדרת סיסמה',
        html: `שלום ${fullName},<br>תודה על ההרשמה! לקביעת סיסמה: <a href="${resetLink}">לחצו כאן</a>`,
      }),
    });

    const newUserData: any = {
      name: fullName,
      idNumber,
      email: emailLower,
      phone: formattedPhone,
      subscriptionId: processId,
      transactionId: transactionId || null,
      transactionToken: transactionToken || null,
      asmachta: asmachta || null,
      subscriptionStatus,
      subscriptionType,
      addOns: { leadsModule: !!addOns.leadsModule, extraWorkers: addOns.extraWorkers || 0 },
      lastPaymentStatus: paymentStatus,
      lastPaymentDate: new Date(),
      totalCharged,
      subscriptionStartDate: new Date(),
      role: 'agent',
      agentId: newUser.uid,
      customField,
      pageCode: pageCode || null,
      isActive: true,
    };

    if (typeof agenciesValue !== 'undefined') newUserData.agencies = agenciesValue;
    if (couponCode) newUserData.usedCouponCode = couponCode;
    if (couponUsed) newUserData.couponUsed = couponUsed;

    await db.collection('users').doc(newUser.uid).set(newUserData);
    // console.log('🆕 Created new user');
    try {
      await ensureDefaultContractsForAgent(db, newUser.uid);
      // console.log('🌱 Default contracts seeded for new agent');
    } catch (e) {
      // console.warn('⚠️ seeding defaults failed:', (e as any)?.message || e);
    }
    
    if (statusCode !== '2') {
      await logRegistrationIssue({
        email: emailLower,
        phone,
        name: fullName,
        source: 'webhook',
        reason: 'disabled',
        type: 'agent',
        subscriptionType,
        addOns,
        transactionId,
        processId,
        pageCode,
        couponCode,
        idNumber,
      });
    }

    if (statusCode === '2' && transactionId && transactionToken && pageCode) {
      await approveTransaction(transactionId, transactionToken, pageCode);
    }

    return NextResponse.json({ created: true });
  } catch (err: any) {
    console.error('❌ Webhook error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
