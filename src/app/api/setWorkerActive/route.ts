import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';

const canon = (v: any) => String(v ?? '').trim();

async function getCallerUid(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return null;

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return decoded.uid;
  } catch {
    return null;
  }
}

async function getAllowedWorkersForAgent(db: FirebaseFirestore.Firestore, agent: any) {
  const subscriptionId = agent.subscriptionId || null;
  const subscriptionType = agent.subscriptionType || null;

  if (!subscriptionId || !subscriptionType) return 0;

  const planSnap = await db.collection('subscriptions_permissions').doc(String(subscriptionType)).get();
  const maxUsers = planSnap.exists ? Number(planSnap.data()?.maxUsers ?? 1) : 1;

  const baseWorkers = Math.max(0, maxUsers - 1);
  const extraWorkers = Number(agent.addOns?.extraWorkers ?? 0);
  return baseWorkers + extraWorkers;
}

async function countActiveWorkers(db: FirebaseFirestore.Firestore, agentId: string) {
  const snap = await db
    .collection('users')
    .where('agentId', '==', agentId)
    .where('role', '==', 'worker')
    .get();

  return snap.docs.filter(d => d.data()?.isActive !== false).length;
}

export async function POST(req: NextRequest) {
  try {
    const { uid, isActive, agentId } = await req.json();

    if (!uid || typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'Missing uid or isActive' }, { status: 400 });
    }

    const db = admin.firestore();

    // ✅ אימות מבצע הפעולה
    const callerUid = await getCallerUid(req);
    if (!callerUid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const callerSnap = await db.collection('users').doc(callerUid).get();
    if (!callerSnap.exists) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const caller = callerSnap.data() as any;
    const callerRole = caller.role;

    if (!['admin', 'agent', 'manager'].includes(callerRole)) {
      return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
    }

    // טוענים את העובד
    const workerRef = db.collection('users').doc(String(uid));
    const workerSnap = await workerRef.get();

    if (!workerSnap.exists) {
      return NextResponse.json({ error: 'משתמש לא נמצא' }, { status: 404 });
    }

    const worker = workerSnap.data() as any;

    if (worker.role !== 'worker') {
      return NextResponse.json({ error: 'אפשר לשנות סטטוס רק לעובדים' }, { status: 400 });
    }

    // ✅ הרשאה: אדמין תמיד, אחרת רק אם אותו agentId
    const targetAgentId = canon(agentId) || canon(worker.agentId);

    if (callerRole !== 'admin') {
      const callerAgentId = callerRole === 'worker' ? caller.agentId : callerUid; // אצלך agent/manager הם uid שלהם
      // בפועל אצלך agentId של worker הוא uid של הסוכן, אז:
      if (canon(worker.agentId) !== canon(callerUid) && canon(targetAgentId) !== canon(callerUid)) {
        return NextResponse.json({ error: 'אין הרשאה לשנות עובד של סוכן אחר' }, { status: 403 });
      }
    }

    // ✅ אם מפעילים עובד — בדיקת מכסה לסוכן
    if (isActive) {
      const agentDoc = await db.collection('users').doc(targetAgentId).get();
      if (!agentDoc.exists) {
        return NextResponse.json({ error: 'סוכן לא נמצא' }, { status: 404 });
      }
      const agent = agentDoc.data() as any;

      const allowed = await getAllowedWorkersForAgent(db, agent);
      const current = await countActiveWorkers(db, targetAgentId);

      // אם הוא כבר פעיל, לא נספור אותו פעמיים
      const isAlreadyActive = worker.isActive !== false;
      const effectiveCurrent = isAlreadyActive ? current : current + 1;

      if (allowed <= 0 || effectiveCurrent > allowed) {
        return NextResponse.json(
          { error: 'חרגת מהמכסה המותרת של עובדים במנוי שלך. לשדרוג פנה אלינו.' },
          { status: 403 }
        );
      }
    }

    // ✅ מבצעים עדכונים: Auth + Firestore
    // disabled = !isActive
    await admin.auth().updateUser(String(uid), { disabled: !isActive });

    await workerRef.update({
      isActive,
      // אופציונלי: אם מפעילים, נוודא שהוא משויך לסוכן היעד (אם הגיע agentId)
      ...(targetAgentId ? { agentId: targetAgentId } : {}),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'שגיאה בעדכון משתמש' }, { status: 500 });
  }
}
