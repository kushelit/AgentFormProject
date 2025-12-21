// /app/api/reviveWorker/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { APP_BASE_URL } from '@/lib/env';

const canon = (v: any) => String(v ?? '').trim();
const normEmail = (v: any) => canon(v).toLowerCase();

type AgentData = {
  role?: string;
  subscriptionId?: string | null;
  subscriptionType?: string | null;
  addOns?: {
    extraWorkers?: number;
  };
};

/** ✅ Auth: extract caller uid from Bearer token */
async function getCallerUid(req: NextRequest): Promise<string | null> {
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

async function getAllowedWorkersForAgent(
  db: FirebaseFirestore.Firestore,
  agent: AgentData
): Promise<{ allowedWorkers: number; reason: string | null }> {
  const subscriptionId = agent.subscriptionId || null;
  const subscriptionType = agent.subscriptionType || null;
// הוכנס תיקון בגלל מנויי OLD שלא ייחסמו במכסה
  // if (!subscriptionId || !subscriptionType) {
    if (!subscriptionType) {

    return { allowedWorkers: 0, reason: 'אין מנוי פעיל' };
  }

  const planSnap = await db
    .collection('subscriptions_permissions')
    .doc(String(subscriptionType))
    .get();

  const maxUsers = planSnap.exists ? Number(planSnap.data()?.maxUsers ?? 1) : 1;

  // maxUsers כולל את הסוכן עצמו => עובדים בסיס = maxUsers - 1
  const baseWorkers = Math.max(0, maxUsers - 1);
  const extraWorkers = Number(agent.addOns?.extraWorkers ?? 0);

  return { allowedWorkers: baseWorkers + extraWorkers, reason: null };
}

async function countActiveWorkers(db: FirebaseFirestore.Firestore, agentId: string) {
  const snap = await db
    .collection('users')
    .where('agentId', '==', agentId)
    .where('role', '==', 'worker')
    .get();

  // "פעיל" אם isActive !== false
  return snap.docs.filter((d) => d.data()?.isActive !== false).length;
}

export async function POST(req: NextRequest) {
  try {
    /** ✅ 0) Require authenticated caller */
    const callerUid = await getCallerUid(req);
    if (!callerUid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, email, agentId } = await req.json();

    const cleanName = canon(name);
    const cleanEmail = normEmail(email);
    const cleanAgentId = canon(agentId);

    if (!cleanName || !cleanEmail || !cleanAgentId) {
      return NextResponse.json(
        { error: 'נא למלא שם, אימייל ו-agentId' },
        { status: 400 }
      );
    }

    const db = admin.firestore();
    const auth = admin.auth();

    /** ✅ 1) Load agent/manager from DB */
    const agentRef = db.collection('users').doc(cleanAgentId);
    const agentSnap = await agentRef.get();

    if (!agentSnap.exists) {
      return NextResponse.json({ error: 'סוכן לא נמצא' }, { status: 404 });
    }

    const agent = agentSnap.data() as AgentData;

    if (agent.role !== 'agent' && agent.role !== 'manager') {
      return NextResponse.json({ error: 'אין הרשאה' }, { status: 403 });
    }

    /** ✅ 1.5) Authorization: only same agent/manager (or admin) may invite workers */
    const callerSnap = await db.collection('users').doc(callerUid).get();
    if (!callerSnap.exists) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const caller = callerSnap.data() as any;

    const isAdmin = caller.role === 'admin';
    const isSameAgent = callerUid === cleanAgentId;

    if (!isAdmin && !isSameAgent) {
      return NextResponse.json(
        { error: 'אין הרשאה להזמין עובד לסוכן אחר' },
        { status: 403 }
      );
    }

    /** ✅ 2) Compute allowed workers by plan.maxUsers + addOns.extraWorkers */
    const { allowedWorkers, reason } = await getAllowedWorkersForAgent(db, agent);

    if (allowedWorkers <= 0) {
      return NextResponse.json(
        { error: `לא ניתן להוסיף עובדים: ${reason || 'מנוי לא מאפשר עובדים'}` },
        { status: 403 }
      );
    }

    /** ✅ 3) Find auth user by email */
    let userId = '';
    let isNew = false;
    let wasRevived = false;

    let existingAuthUser: { uid: string; disabled: boolean } | null = null;
    try {
      const userRecord = await auth.getUserByEmail(cleanEmail);
      existingAuthUser = { uid: userRecord.uid, disabled: Boolean(userRecord.disabled) };
    } catch {
      existingAuthUser = null;
    }

    /** ✅ 4) If exists and active -> stop */
    if (existingAuthUser && !existingAuthUser.disabled) {
      return NextResponse.json(
        { error: 'משתמש זה כבר קיים ופעיל במערכת' },
        { status: 400 }
      );
    }

    /** ✅ 5) Enforce capacity for target agent */
    const activeWorkersCount = await countActiveWorkers(db, cleanAgentId);
    if (activeWorkersCount + 1 > allowedWorkers) {
      return NextResponse.json(
        { error: 'חרגת מהמכסה המותרת של עובדים במנוי שלך. לשדרוג פנה אלינו.' },
        { status: 403 }
      );
    }

    /** ✅ 6) Revive or create */
    if (existingAuthUser) {
      userId = existingAuthUser.uid;

      await auth.updateUser(userId, {
        displayName: cleanName,
        disabled: false,
      });

      const userDocRef = db.collection('users').doc(userId);
      const userDocSnap = await userDocRef.get();

      const payload = {
        name: cleanName,
        email: cleanEmail,
        agentId: cleanAgentId,
        role: 'worker',
        isActive: true,
        subscriptionId: agent.subscriptionId || null,
        subscriptionType: agent.subscriptionType || null,
      };

      if (userDocSnap.exists) {
        await userDocRef.update(payload);
      } else {
        await userDocRef.set(payload);
      }

      wasRevived = true;
    } else {
      const newUser = await auth.createUser({
        email: cleanEmail,
        password: Math.random().toString(36).slice(-8), // סיסמה זמנית
        displayName: cleanName,
      });

      userId = newUser.uid;
      isNew = true;

      await db.collection('users').doc(userId).set({
        name: cleanName,
        email: cleanEmail,
        agentId: cleanAgentId,
        role: 'worker',
        isActive: true,
        subscriptionId: agent.subscriptionId || null,
        subscriptionType: agent.subscriptionType || null,
      });
    }

    /** ✅ 7) Send password reset email */
    const resetLink = await auth.generatePasswordResetLink(cleanEmail);

    await fetch(`${APP_BASE_URL}/api/sendEmail`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: cleanEmail,
        subject: 'הוזמנת למערכת MagicSale',
        html: `
          שלום ${cleanName},<br><br>
          ${isNew ? 'נוצר עבורך משתמש חדש' : 'המשתמש שלך חודש'} במערכת MagicSale.<br>
          להשלמת ההתחברות, לחץ על הקישור הבא כדי לקבוע סיסמה:<br>
          <a href="${resetLink}">הגדרת סיסמה</a><br><br>
          בברכה,<br>
          צוות MagicSale
        `,
      }),
    });

    return NextResponse.json({
      success: true,
      created: isNew,
      revived: wasRevived,
      allowedWorkers,
      activeWorkersBefore: activeWorkersCount,
    });
  } catch {
    return NextResponse.json({ error: 'שגיאה בעת יצירת העובד' }, { status: 500 });
  }
}
