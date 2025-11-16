import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { APP_BASE_URL } from '@/lib/env';

export async function POST(req: NextRequest) {
  try {
    const { name, email, agentId, subscriptionId, subscriptionType } = await req.json();

    const db = admin.firestore();
    const auth = admin.auth();
    let userId = '';
    let isNew = false;

    try {
      // ניסיון להביא את המשתמש לפי אימייל
      const userRecord = await auth.getUserByEmail(email);

      // 🛑 אם המשתמש פעיל – עצירה מיידית
      if (!userRecord.disabled) {
        return NextResponse.json({
          error: 'משתמש זה כבר קיים ופעיל במערכת',
        }, { status: 400 });
      }

      // ✅ המשתמש מושבת – נבצע החייאה
      userId = userRecord.uid;

      await auth.updateUser(userId, {
        displayName: name,
        disabled: false,
      });

      await db.collection('users').doc(userId).update({
        name,
        agentId,
        role: 'worker',
        isActive: true,
        subscriptionId: subscriptionId || null,
        subscriptionType: subscriptionType || null,
      });

      // console.log('🔄 עובד מחודש');
    } catch {
      // 👤 משתמש חדש – ניצור אותו
      const newUser = await auth.createUser({
        email,
        password: Math.random().toString(36).slice(-8), // סיסמה זמנית
        displayName: name,
      });

      userId = newUser.uid;
      isNew = true;

      await db.collection('users').doc(userId).set({
        name,
        email,
        agentId,
        role: 'worker',
        isActive: true,
        subscriptionId: subscriptionId || null,
        subscriptionType: subscriptionType || null,
      });

      // console.log('🆕 עובד חדש נוצר');
    }

    // ✉️ שליחת מייל לאיפוס סיסמה
    const resetLink = await auth.generatePasswordResetLink(email);
    await fetch(`${APP_BASE_URL}/api/sendEmail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        subject: 'הוזמנת למערכת MagicSale',
        html: `
          שלום ${name},<br><br>
          ${isNew ? 'נוצר עבורך משתמש חדש' : 'המשתמש שלך חודש'} במערכת MagicSale.<br>
          להשלמת ההתחברות, לחץ על הקישור הבא כדי לקבוע סיסמה:<br>
          <a href="${resetLink}">הגדרת סיסמה</a><br><br>
          בברכה,<br>
          צוות MagicSale
        `,
      }),
    });

    return NextResponse.json({ success: true, created: isNew, revived: !isNew });
  } catch (err: any) {
    // console.error('❌ שגיאה בהקמה/החייאה:', err);
    return NextResponse.json({ error: 'שגיאה בעת יצירת העובד' }, { status: 500 });
  }
}
