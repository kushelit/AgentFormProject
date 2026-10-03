// app/api/admin/update-user-phone/route.ts
// Admin-only: change a user's phone in Firebase Auth (sign-in + MFA) and users.phone together.
// The phone identifies the agent to the WhatsApp bot, so it is never changed from public sign-up.
// Always enforced (not subject to API_AUTH_MODE log mode).

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { getAuthUser, isAdminUser } from '@/lib/server/auth';
import { normalizePhoneE164 } from '@/lib/phoneE164';

export async function POST(req: NextRequest) {
  const caller = await getAuthUser(req);
  if (!caller) return NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 });
  if (!isAdminUser(caller)) return NextResponse.json({ error: 'אין הרשאה לפעולה זו' }, { status: 403 });

  try {
    const body = await req.json().catch(() => null);
    const uid = typeof body?.uid === 'string' ? body.uid.trim() : '';
    const phone = normalizePhoneE164(body?.phone);
    if (!uid || uid.includes('/')) return NextResponse.json({ error: 'מזהה משתמש לא תקין' }, { status: 400 });
    if (!phone) return NextResponse.json({ error: 'מספר טלפון לא תקין' }, { status: 400 });

    const auth = admin.auth();
    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);
    const [authUser, userSnap] = await Promise.all([auth.getUser(uid), userRef.get()]);
    if (!userSnap.exists) return NextResponse.json({ error: 'המשתמש לא נמצא' }, { status: 404 });

    // The phone must not belong to anyone else — in Auth or in users.phone (used by the bot).
    let authOwner: admin.auth.UserRecord | null = null;
    try {
      authOwner = await auth.getUserByPhoneNumber(phone);
    } catch (e: any) {
      if (e?.code !== 'auth/user-not-found') throw e;
    }
    const docOwners = (await db.collection('users').where('phone', '==', phone).limit(5).get())
      .docs.filter((d) => d.id !== uid);
    if ((authOwner && authOwner.uid !== uid) || docOwners.length) {
      const ownerUid = authOwner && authOwner.uid !== uid ? authOwner.uid : docOwners[0].id;
      const ownerSnap = await db.collection('users').doc(ownerUid).get();
      const owner = ownerSnap.data();
      return NextResponse.json({
        error: `המספר כבר משויך למשתמש אחר: ${owner?.name || ''} ${owner?.email || authOwner?.email || ownerUid}`.trim(),
      }, { status: 409 });
    }

    const previousPhone = authUser.phoneNumber || userSnap.data()?.phone || null;
    await auth.updateUser(uid, {
      phoneNumber: phone,
      multiFactor: { enrolledFactors: [{ factorId: 'phone', phoneNumber: phone, displayName: 'Main phone' }] },
    });
    // Sign the user out of existing sessions after an identity change.
    await auth.revokeRefreshTokens(uid);
    await userRef.update({
      phone,
      phoneUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      phoneUpdatedBy: caller.uid,
      phoneHistory: admin.firestore.FieldValue.arrayUnion({
        phone: previousPhone, replacedAt: new Date().toISOString(), by: caller.uid,
      }),
    });

    return NextResponse.json({ ok: true, uid, phone, previousPhone });
  } catch (e: any) {
    console.error('[admin/update-user-phone]', e);
    return NextResponse.json({ error: 'עדכון הטלפון נכשל' }, { status: 500 });
  }
}
