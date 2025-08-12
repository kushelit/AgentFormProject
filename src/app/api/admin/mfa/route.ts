// /app/api/admin/mfa/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import type { auth as AdminAuth } from 'firebase-admin';

// === Type guards ===
type MFInfo = AdminAuth.MultiFactorInfo;
type PhoneMFInfo = AdminAuth.PhoneMultiFactorInfo;

function isPhoneFactor(f: MFInfo): f is PhoneMFInfo {
  // טיפוסי: MFA מסוג טלפון מזוהה ע"י factorId === 'phone'
  return (f as any)?.factorId === 'phone';
}

// === Whitelist guard (email-based) ===
function isWhitelisted(email: string | null | undefined) {
  const list = (process.env.SUPER_ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  return !!email && list.includes(email.toLowerCase());
}

async function requireWhitelisted(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }
  const idToken = authHeader.substring('Bearer '.length).trim();
  const decoded = await admin.auth().verifyIdToken(idToken);

  if (!isWhitelisted(decoded.email)) {
    throw new Error('Forbidden');
  }
  return decoded; // { uid, email, ... }
}

// === Audit log (Firestore) ===
async function writeAudit({
  adminUid, action, targetUid, targetEmail, payload,
}: { adminUid: string; action: string; targetUid: string; targetEmail?: string | null; payload?: any }) {
  await admin.firestore().collection('mfaAdminActions').add({
    action,
    targetUid,
    targetEmail: targetEmail || null,
    payload: payload || null,
    adminUid,
    ts: admin.firestore.FieldValue.serverTimestamp(),
  });
}

export async function GET(req: NextRequest) {
  try {
    const acting = await requireWhitelisted(req);
    const { searchParams } = new URL(req.url);
    const email = searchParams.get('email');
    const uid = searchParams.get('uid');

    const userRecord = email
      ? await admin.auth().getUserByEmail(email)
      : uid
      ? await admin.auth().getUser(uid)
      : null;

    if (!userRecord) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const mfa = userRecord.multiFactor?.enrolledFactors ?? [];

    await writeAudit({
      adminUid: acting.uid,
      action: 'READ_MFA',
      targetUid: userRecord.uid,
      targetEmail: userRecord.email,
    });

    return NextResponse.json({
      uid: userRecord.uid,
      email: userRecord.email,
      mfa,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}

type PostBody =
  | { action: 'removeAll'; email?: string; uid?: string }
  | { action: 'remove'; email?: string; uid?: string; mfaUid: string }
  | { action: 'add'; email?: string; uid?: string; phoneNumber: string; displayName?: string };

export async function POST(req: NextRequest) {
  try {
    const acting = await requireWhitelisted(req);
    const body = (await req.json()) as PostBody;

    const userRecord =
      'email' in body && body.email
        ? await admin.auth().getUserByEmail(body.email!)
        : 'uid' in body && body.uid
        ? await admin.auth().getUser(body.uid!)
        : null;

    if (!userRecord) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // גורמים נוכחיים כפי שמוחזרים מ-Firebase
    const current = userRecord.multiFactor?.enrolledFactors ?? [];

    // ----- removeAll -----
    if (body.action === 'removeAll') {
      const updated = await admin.auth().updateUser(userRecord.uid, {
        multiFactor: { enrolledFactors: null }, // או []
      });

      await writeAudit({
        adminUid: acting.uid,
        action: 'REMOVE_ALL',
        targetUid: userRecord.uid,
        targetEmail: userRecord.email,
      });

      return NextResponse.json({
        message: 'All MFA factors removed',
        mfa: updated.multiFactor?.enrolledFactors ?? [],
      });
    }

    // ----- remove (by mfaUid) -----
    if (body.action === 'remove') {
      if (!('mfaUid' in body) || !body.mfaUid) {
        return NextResponse.json({ error: 'mfaUid is required' }, { status: 400 });
      }

      // נשמרים *כל* הגורמים האחרים. תומך כרגע רק ב-phone.
      const updatedList = current
        .filter(f => f.uid !== body.mfaUid)
        .map(f => {
          if (isPhoneFactor(f)) {
            return {
              uid: f.uid,                               // טוב לשמר
              phoneNumber: f.phoneNumber,               // חובה לטיפוס העדכון
              displayName: f.displayName ?? undefined,  // אופציונלי
              factorId: 'phone' as const,               // חובה
            };
          }
          // אם בעתיד יהיו סוגים אחרים (TOTP וכו') — כאן אפשר לשמר או להחליט על שגיאה.
          throw new Error(`Unsupported MFA factor type: ${f.factorId}`);
        });

      const updated = await admin.auth().updateUser(userRecord.uid, {
        multiFactor: { enrolledFactors: updatedList },
      });

      await writeAudit({
        adminUid: acting.uid,
        action: 'REMOVE_ONE',
        targetUid: userRecord.uid,
        targetEmail: userRecord.email,
        payload: { mfaUid: body.mfaUid },
      });

      return NextResponse.json({
        message: 'Factor removed',
        mfa: updated.multiFactor?.enrolledFactors ?? [],
      });
    }

    // ----- add (phone) -----
    if (body.action === 'add') {
      if (!('phoneNumber' in body) || !body.phoneNumber) {
        return NextResponse.json({ error: 'phoneNumber is required' }, { status: 400 });
      }

      // משמרים את הקיימים (תומך רק ב-phone כרגע) ומוסיפים חדש
      const keepExisting = current.map(f => {
        if (isPhoneFactor(f)) {
          return {
            uid: f.uid,
            phoneNumber: f.phoneNumber,
            displayName: f.displayName ?? undefined,
            factorId: 'phone' as const,
          };
        }
        throw new Error(`Unsupported MFA factor type: ${f.factorId}`);
      });

      const updatedList = [
        ...keepExisting,
        {
          phoneNumber: body.phoneNumber,               // E.164 (למשל +9725...)
          displayName: body.displayName || 'Phone',
          factorId: 'phone' as const,
        },
      ];

      const updated = await admin.auth().updateUser(userRecord.uid, {
        multiFactor: { enrolledFactors: updatedList },
      });

      await writeAudit({
        adminUid: acting.uid,
        action: 'ADD_PHONE',
        targetUid: userRecord.uid,
        targetEmail: userRecord.email,
        payload: { phoneNumber: body.phoneNumber, displayName: body.displayName || 'Phone' },
      });

      return NextResponse.json({
        message: 'Factor added',
        mfa: updated.multiFactor?.enrolledFactors ?? [],
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 });
  }
}
