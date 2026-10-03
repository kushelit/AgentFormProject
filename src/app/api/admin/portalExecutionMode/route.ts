import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 });
  let uid: string;
  try { uid = (await admin.auth().verifyIdToken(token)).uid; }
  catch { return NextResponse.json({ error: 'ההתחברות אינה תקפה' }, { status: 401 }); }
  try {
    const body = await req.json().catch(() => null);
    const agentId = typeof body?.agentId === 'string' ? body.agentId.trim() : '';
    const mode = body?.portalExecutionMode;
    if (!agentId || agentId.includes('/') || !['runner', 'extension'].includes(mode))
      return NextResponse.json({ error: 'מזהה סוכן או כלי הרצה אינם תקינים' }, { status: 400 });
    const db = admin.firestore();
    const caller = await db.collection('users').doc(uid).get();
    if (!caller.exists || caller.data()?.role !== 'admin')
      return NextResponse.json({ error: 'אין הרשאה לשנות כלי הרצה' }, { status: 403 });
    const ref = db.collection('users').doc(agentId);
    const outcome = await db.runTransaction(async tx => {
      const target = await tx.get(ref);
      if (!target.exists) return 'missing';
      if (target.data()?.role === 'worker') return 'worker';
      tx.update(ref, { portalExecutionMode: mode,
        portalExecutionModeUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        portalExecutionModeUpdatedBy: uid });
      return 'saved';
    });
    if (outcome === 'missing') return NextResponse.json({ error: 'הסוכן לא נמצא' }, { status: 404 });
    if (outcome === 'worker') return NextResponse.json({ error: 'ההגדרה נשמרת לסוכן, ולא לעובד' }, { status: 400 });
    return NextResponse.json({ ok: true, agentId, portalExecutionMode: mode });
  } catch {
    return NextResponse.json({ error: 'שמירת כלי ההרצה נכשלה' }, { status: 500 });
  }
}
