// app/api/admin-questions/route.ts
// שאלות פתוחות מול החברות — לאדמין בלבד.
// האוסף adminQuestions חסום לגמרי בחוקים (גם קריאה), כך שכל הגישה עוברת כאן.
// ⚠️ חוסם תמיד — גם כש-API_AUTH_MODE במצב log: הדוגמאות כוללות שמות לקוחות ופוליסות.

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { getAuthUser, isAdminUser, type AuthUser } from '@/lib/server/auth';
import { ADMIN_QUESTIONS_CODE, type CodeQuestion } from '@/lib/server/adminQuestionsSeed';
import type { AdminQuestion, AdminQuestionStatus } from '@/lib/adminQuestions/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COLLECTION = 'adminQuestions';
const STATUSES: AdminQuestionStatus[] = ['open', 'answered', 'closed'];
const MAX_TEXT = 4000;

const s = (v: unknown) => String(v ?? '').trim();
const text = (v: unknown) => s(v).slice(0, MAX_TEXT);
const validAnchor = (a: string) => /^[a-z0-9._-]{1,80}$/i.test(a);

async function requireAdmin(req: NextRequest): Promise<{ user: AuthUser } | { res: NextResponse }> {
  const user = await getAuthUser(req);
  if (!user) return { res: NextResponse.json({ error: 'נדרשת התחברות' }, { status: 401 }) };
  if (!isAdminUser(user)) {
    console.warn('[admin-questions] blocked non-admin', user.uid);
    return { res: NextResponse.json({ error: 'אין הרשאה לפעולה זו' }, { status: 403 }) };
  }
  return { user };
}

const who = (user: AuthUser) => s(user.data?.email) || s(user.data?.name) || user.uid;
const iso = (v: any) => (v?.toDate ? v.toDate().toISOString() : null);

function toQuestion(id: string, d: FirebaseFirestore.DocumentData): AdminQuestion {
  return {
    id,
    companyId: s(d.companyId),
    company: s(d.company),
    anchor: s(d.anchor),
    location: s(d.location),
    question: s(d.question),
    example: s(d.example),
    status: STATUSES.includes(d.status) ? d.status : 'open',
    answer: s(d.answer),
    createdAt: iso(d.createdAt),
    createdBy: s(d.createdBy),
    updatedAt: iso(d.updatedAt),
    updatedBy: s(d.updatedBy),
  };
}

// ─── סנכרון מהקוד (adminQuestionsSeed.ts) ───────────────────────────
// חדשה → נוספת. version גבוה יותר → הנוסח מתעדכן, אלא אם נערכה במסך (editedManually) — אז מדלגים ומדווחים.
// שאלה ישנה בלי seedKey מזוהה לפי הנוסח (הנוכחי או legacyQuestions) ומקבלת key — כדי שלא תיווצר כפולה.
type Doc = FirebaseFirestore.QueryDocumentSnapshot;
type SyncPlan = {
  create: CodeQuestion[];
  update: { doc: Doc; q: CodeQuestion }[];
  adopt: { doc: Doc; q: CodeQuestion; upToDate: boolean }[];
  skippedEdited: { doc: Doc; q: CodeQuestion }[];
};

function planSync(docs: Doc[]): SyncPlan {
  const plan: SyncPlan = { create: [], update: [], adopt: [], skippedEdited: [] };
  const byKey = new Map(docs.filter((d) => s(d.data().seedKey)).map((d) => [s(d.data().seedKey), d]));
  const unkeyed = docs.filter((d) => !s(d.data().seedKey));
  for (const q of ADMIN_QUESTIONS_CODE) {
    let doc = byKey.get(q.key);
    if (!doc) {
      const texts = [q.question, ...(q.legacyQuestions || [])];
      const legacy = unkeyed.find((d) => texts.includes(s(d.data().question)));
      if (legacy) {
        const upToDate = s(legacy.data().question) === q.question && s(legacy.data().example) === q.example;
        plan.adopt.push({ doc: legacy, q, upToDate });
        unkeyed.splice(unkeyed.indexOf(legacy), 1);
        if (!upToDate) {
          if (legacy.data().editedManually) plan.skippedEdited.push({ doc: legacy, q });
          else plan.update.push({ doc: legacy, q });
        }
        continue;
      }
      plan.create.push(q);
      continue;
    }
    if (Number(doc.data().seedVersion || 0) >= q.version) continue;
    if (doc.data().editedManually) plan.skippedEdited.push({ doc, q });
    else plan.update.push({ doc, q });
  }
  return plan;
}

const syncSummary = (p: SyncPlan) => ({
  newCount: p.create.length,
  updateCount: p.update.length,
  // שאלות ישנות שיקבלו key בסנכרון (כדי שעריכה עתידית שלהן לא תיצור כפולה)
  adoptCount: p.adopt.length,
  editedCount: p.skippedEdited.length,
  edited: p.skippedEdited.map(({ doc, q }) => ({ id: doc.id, key: q.key })),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('res' in auth) return auth.res;

  const snap = await admin.firestore().collection(COLLECTION).get();
  const questions = snap.docs
    .map((d) => toQuestion(d.id, d.data()))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return NextResponse.json({ questions, sync: syncSummary(planSync(snap.docs)) });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('res' in auth) return auth.res;
  const { user } = auth;

  const body = await req.json().catch(() => ({}));
  const action = s(body?.action);
  const col = admin.firestore().collection(COLLECTION);
  const now = admin.firestore.FieldValue.serverTimestamp();

  if (action === 'create') {
    const anchor = s(body.anchor);
    const question = text(body.question);
    if (!question) return NextResponse.json({ error: 'חסר נוסח שאלה' }, { status: 400 });
    if (anchor && !validAnchor(anchor)) return NextResponse.json({ error: 'מיקום לא תקין' }, { status: 400 });
    const ref = await col.add({
      companyId: s(body.companyId).slice(0, 20),
      company: text(body.company).slice(0, 60),
      anchor,
      location: text(body.location).slice(0, 200),
      question,
      example: text(body.example),
      status: 'open',
      answer: '',
      createdAt: now,
      createdBy: who(user),
      updatedAt: now,
      updatedBy: who(user),
    });
    return NextResponse.json({ ok: true, id: ref.id });
  }

  if (action === 'update') {
    const id = s(body.id);
    if (!id || id.includes('/')) return NextResponse.json({ error: 'מזהה לא תקין' }, { status: 400 });
    const p = body.patch || {};
    const update: Record<string, unknown> = { updatedAt: now, updatedBy: who(user) };
    if ('question' in p) {
      if (!text(p.question)) return NextResponse.json({ error: 'חסר נוסח שאלה' }, { status: 400 });
      update.question = text(p.question);
    }
    if ('example' in p) update.example = text(p.example);
    if ('location' in p) update.location = text(p.location).slice(0, 200);
    // נערכה במסך → הסנכרון מהקוד לא ידרוס את הנוסח
    if ('question' in p || 'example' in p) update.editedManually = true;
    if ('answer' in p) update.answer = text(p.answer);
    if ('status' in p) {
      if (!STATUSES.includes(p.status)) return NextResponse.json({ error: 'סטטוס לא תקין' }, { status: 400 });
      update.status = p.status;
    }
    if ('anchor' in p) {
      const a = s(p.anchor);
      if (a && !validAnchor(a)) return NextResponse.json({ error: 'מיקום לא תקין' }, { status: 400 });
      update.anchor = a;
    }
    const ref = col.doc(id);
    if (!(await ref.get()).exists) return NextResponse.json({ error: 'השאלה לא נמצאה' }, { status: 404 });
    await ref.update(update);
    return NextResponse.json({ ok: true });
  }

  if (action === 'sync') {
    const plan = planSync((await col.get()).docs);
    const batch = admin.firestore().batch();
    const by = who(user);
    for (const q of plan.create) {
      batch.set(col.doc(), {
        seedKey: q.key, seedVersion: q.version, editedManually: false,
        companyId: q.companyId, company: q.company, anchor: q.anchor, location: '',
        question: q.question, example: q.example,
        status: 'open', answer: '',
        createdAt: now, createdBy: by, updatedAt: now, updatedBy: by,
      });
    }
    for (const { doc, q, upToDate } of plan.adopt) {
      // מקבלת key; seedVersion=0 כשהנוסח לא עדכני — העדכון עצמו (אם מותר) בלולאה הבאה
      batch.update(doc.ref, { seedKey: q.key, seedVersion: upToDate ? q.version : 0 });
    }
    for (const { doc, q } of plan.update) {
      // רק נוסח ומיקום. סטטוס ותשובה — לעולם לא
      batch.update(doc.ref, {
        seedKey: q.key, seedVersion: q.version,
        question: q.question, example: q.example, anchor: q.anchor, companyId: q.companyId, company: q.company,
        updatedAt: now, updatedBy: `${by} (סנכרון)`,
      });
    }
    await batch.commit();
    return NextResponse.json({ ok: true, ...syncSummary(plan) });
  }

  return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 });
}
