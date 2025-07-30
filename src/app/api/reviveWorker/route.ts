import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { APP_BASE_URL } from '@/lib/env';
import { logRegistrationIssue } from '@/services/logRegistrationIssue';


export async function POST(req: NextRequest) {
  try {
    const {
      email,
      name,
      agentId,
      password,
      subscriptionType,
      subscriptionId,
    } = await req.json();

    if (!email || !name || !agentId) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
    }

    const db = admin.firestore();
    const auth = admin.auth();

    let uid = '';
    let userRecord;
    let existsInFirestore = false;

    try {
      // 🔍 ננסה למצוא את המשתמש לפי אימייל
      userRecord = await auth.getUserByEmail(email);
      uid = userRecord.uid;

      const firestoreSnap = await db.collection('users').doc(uid).get();
      existsInFirestore = firestoreSnap.exists;

      // ❗ אם המשתמש לא disabled או קיים כבר במסד – זה מצב בעייתי
      if (!userRecord.disabled || existsInFirestore) {
        await logRegistrationIssue({
            email,
            name,
            type: 'worker',
            agentId,
            reason: 'alreadyExists',
            source: 'signUpForm',
            additionalInfo: {
              subscriptionType,
              subscriptionId,
              existsInFirestore,
              disabled: userRecord.disabled === true ? true : false,
            },
          });
        return NextResponse.json({
          error:
            'עובד עם אימייל זה כבר קיים חלקית במערכת. יש לפנות לתמיכה לעזרה בשחזור/הסרה.',
        }, { status: 400 });
      }

      // ✅ המשתמש disabled – מחיים אותו
      await auth.updateUser(uid, { disabled: false });
      console.log('✅ המשתמש הוחזר לפעולה');
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        // 🆕 יצירת משתמש חדש ב־Auth
        const newUser = await auth.createUser({
          email,
          password,
          displayName: name,
        });
        uid = newUser.uid;
        userRecord = newUser;
        console.log('🆕 נוצר משתמש חדש ב־Auth');
      } else {
        console.error('⚠️ שגיאה בבדיקת המשתמש:', err);
        return NextResponse.json({ error: 'Auth error' }, { status: 500 });
      }
    }

    const newWorkerData = {
      name,
      email,
      role: 'worker',
      agentId,
      isActive: true,
      subscriptionId,
      subscriptionType,
    };

    await db.collection('users').doc(uid).set(newWorkerData, { merge: true });
    console.log('📁 נשמרו נתוני העובד במסד');

    const resetLink = await auth.generatePasswordResetLink(email);

    await fetch(`${APP_BASE_URL}/api/sendEmail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        subject: 'הגדרת סיסמה למערכת MagicSale',
        html: `
          שלום ${name},<br><br>
          חשבונך במערכת MagicSale הופעל או נוצר.<br>
          נא להגדיר סיסמה בקישור הבא:<br>
          <a href="${resetLink}">הגדרת סיסמה</a><br><br>
          בהצלחה!<br>
          צוות MagicSale
        `,
      }),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('❌ reviveWorker error:', err);
    return NextResponse.json({ error: 'שגיאה פנימית. אנא נסה שוב.' }, { status: 500 });
  }
}
