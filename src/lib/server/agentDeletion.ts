// src/lib/server/agentDeletion.ts
// מחיקה מלאה של סוכן שעזב: כל הנתונים שלו, קבצי Storage, העובדים שלו והחשבון עצמו.
//
// • רק סוכן בסטטוס עזיבה (subscriptionStatus === 'canceled'). לא עובד, לא admin, לא מנהלת מערכת.
// • נוגע אך ורק במסמכים שמשויכים לסוכן: לפי שדה agentId / AgentId, או מזהה מסמך שהוא ה-uid שלו
//   או שמתחיל ב-`${uid}_`. טבלאות משותפות (חברות, מוצרים, תבניות) לא נמחקות.
// • רץ בשלבים עם תקציב זמן: כל קריאה מתקדמת ככל שאפשר ומחזירה done=false עד שהכול נמחק.
//   סדר השלבים: קבצי לקוחות/לידים (לפני שהלקוחות והלידים נמחקים) ← נתונים ← Storage ← עובדים ← החשבון.
// • רישום ב-agentDeletionLogs/{agentId}: מי מחק, מתי, וכמה נמחק מכל מקום. מספרים בלבד.

import { admin } from '@/lib/firebase/firebase-admin';

type Target = {
  collection: string;
  /** שדות שמכילים את ה-uid של הסוכן */
  fields?: string[];
  /** מזהה המסמך הוא ה-uid של הסוכן */
  idExact?: boolean;
  /** מזהה המסמך מתחיל ב-`${uid}_` */
  idPrefix?: boolean;
  /** למסמכים יש תתי-אוספים (נמחקים איתם) */
  recursive?: boolean;
};

const BOTH = ['agentId', 'AgentId'];

const TARGETS: Target[] = [
  // לקוחות, לידים ומכירות
  { collection: 'customer', fields: BOTH },
  { collection: 'sales', fields: BOTH },
  { collection: 'contracts', fields: BOTH },
  { collection: 'leads', fields: BOTH },
  { collection: 'sourceLead', fields: BOTH },
  { collection: 'customerTasks', fields: BOTH },
  { collection: 'customerNotes', fields: BOTH },
  { collection: 'goalsSuccess', fields: BOTH },
  { collection: 'promotion', fields: BOTH },
  { collection: 'stars', fields: BOTH },
  { collection: 'statusLeadList', fields: BOTH },
  { collection: 'statusPolicy', fields: BOTH },
  { collection: 'agentReferrers', fields: BOTH },
  { collection: 'mdPaymentStatus', fields: BOTH },
  { collection: 'mdDepositStatus', fields: BOTH },
  { collection: 'elementaryPolicies', fields: BOTH },
  { collection: 'elementaryContracts', fields: BOTH },
  { collection: 'taxReturnClients', fields: BOTH },
  // עמלות וטעינות
  { collection: 'policyCommissionSummaries', fields: BOTH },
  { collection: 'externalCommissions', fields: BOTH },
  { collection: 'commissionSummaries', fields: BOTH },
  { collection: 'ymCommissionSummaries', fields: BOTH },
  { collection: 'commissionSplits', fields: BOTH },
  { collection: 'commissionLinks', fields: BOTH },
  { collection: 'commissionImportRuns', fields: BOTH },
  { collection: 'commissionImportQueue', fields: BOTH },
  { collection: 'importRuns', fields: BOTH },
  { collection: 'customerImportRuns', fields: BOTH },
  { collection: 'portalImportRuns', fields: BOTH },
  { collection: 'portalRunBatches', fields: BOTH },
  { collection: 'portalImportLocks', fields: BOTH, idPrefix: true },
  { collection: 'hekefStatements', fields: BOTH, idPrefix: true },
  { collection: 'hekefMonthCache', fields: BOTH, idPrefix: true },
  { collection: 'tierCalcRuns', fields: BOTH },
  { collection: 'tierThresholds', idExact: true },
  { collection: 'agentInsightsCache', fields: BOTH, idPrefix: true },
  { collection: 'premiumKpiCache', fields: BOTH, idPrefix: true },
  { collection: 'policy_usage_logs', fields: ['agentUid'] },
  // פורטלים וטעינה אוטומטית
  { collection: 'portalCredentials', fields: BOTH, idPrefix: true },
  { collection: 'portalAgentCodeIncludeList', fields: BOTH, idPrefix: true },
  { collection: 'agentPortalFilters', fields: BOTH, idPrefix: true },
  { collection: 'agentImportState', idExact: true },
  { collection: 'runnerPairings', fields: ['uid', ...BOTH] },
  // וואטסאפ, MagicTouch ואינטגרציות
  { collection: 'whatsapp_conversations', fields: BOTH, idPrefix: true, recursive: true },
  { collection: 'agents', idExact: true, recursive: true },
  { collection: 'microsoft_bookings_connections', idExact: true },
  { collection: 'google_calendar_connections', idExact: true },
  { collection: 'userPreferences', idExact: true, recursive: true },
];

const STORAGE_PREFIXES = (agentId: string) => [`commission-imports/${agentId}/`, `portalRuns/${agentId}/`];

const BATCH = 300;
const TIME_BUDGET_MS = 40_000;
const LOG_COLLECTION = 'agentDeletionLogs';

const s = (v: unknown) => String(v ?? '').trim();
const db = () => admin.firestore();
const docId = admin.firestore.FieldPath.documentId();

export class AgentDeletionError extends Error {}

// ─── בדיקת הסוכן ─────────────────────────────────────────────

export type DeletionCandidate = {
  agentId: string;
  name: string;
  email: string;
  role: string;
  cancellationDate: string | null;
  daysSinceCancellation: number | null;
};

function toCandidate(id: string, d: Record<string, any>): DeletionCandidate {
  const raw = d.cancellationDate;
  const date: Date | null = raw?.toDate ? raw.toDate() : raw ? new Date(raw) : null;
  const valid = date && !isNaN(date.getTime());
  return {
    agentId: id,
    name: s(d.name),
    email: s(d.email),
    role: s(d.role),
    cancellationDate: valid ? date!.toISOString() : null,
    daysSinceCancellation: valid ? Math.floor((Date.now() - date!.getTime()) / 86_400_000) : null,
  };
}

/** סוכנים בסטטוס עזיבה בלבד */
export async function listDeletionCandidates(): Promise<DeletionCandidate[]> {
  const snap = await db().collection('users').where('subscriptionStatus', '==', 'canceled').get();
  return snap.docs
    .filter((d) => isDeletableAgent(d.data()))
    .map((d) => toCandidate(d.id, d.data()))
    .sort((a, b) => (b.daysSinceCancellation ?? -1) - (a.daysSinceCancellation ?? -1));
}

function isDeletableAgent(d: Record<string, any> | undefined) {
  return !!d && d.subscriptionStatus === 'canceled' && ['agent', 'manager'].includes(s(d.role)) && d.isSystem !== true;
}

async function loadAgent(agentId: string, callerUid: string) {
  if (!agentId || agentId.includes('/')) throw new AgentDeletionError('מזהה סוכן לא תקין');
  if (agentId === callerUid) throw new AgentDeletionError('אי אפשר למחוק את המשתמש המחובר');
  const snap = await db().collection('users').doc(agentId).get();
  const data = snap.data();
  if (!snap.exists || !data) throw new AgentDeletionError('הסוכן לא נמצא');
  if (!isDeletableAgent(data)) throw new AgentDeletionError('אפשר למחוק רק סוכן בסטטוס עזיבה (מנוי מבוטל)');
  return { ref: snap.ref, data, candidate: toCandidate(snap.id, data) };
}

// ─── שאילתות ─────────────────────────────────────────────────

function targetQueries(t: Target, agentId: string): { label: string; query: FirebaseFirestore.Query }[] {
  const col = db().collection(t.collection);
  const out: { label: string; query: FirebaseFirestore.Query }[] = [];
  for (const f of t.fields ?? []) out.push({ label: `${t.collection} (${f})`, query: col.where(f, '==', agentId) });
  if (t.idExact) out.push({ label: `${t.collection} (מזהה)`, query: col.where(docId, '==', agentId) });
  if (t.idPrefix) {
    const p = `${agentId}_`;
    out.push({ label: `${t.collection} (מזהה uid_…)`, query: col.orderBy(docId).startAt(p).endAt(`${p}`) });
  }
  return out;
}

async function idsOf(collections: string[], agentId: string): Promise<string[]> {
  const ids = new Set<string>();
  for (const c of collections) {
    for (const f of BOTH) {
      const snap = await db().collection(c).where(f, '==', agentId).select().get();
      snap.docs.forEach((d) => ids.add(d.id));
    }
  }
  return Array.from(ids);
}

const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** מסמכי קבצים של לקוחות/לידים של הסוכן: לפי AgentId, או לפי לקוח/ליד ששייך לו (מסמכים ישנים בלי AgentId) */
async function fileDocQueries(agentId: string) {
  const out: { label: string; query: FirebaseFirestore.Query }[] = [];
  const add = (collection: string, parentField: string, parentIds: string[]) => {
    for (const f of BOTH) out.push({ label: `${collection} (${f})`, query: db().collection(collection).where(f, '==', agentId) });
    chunk(parentIds, 30).forEach((ids, i) =>
      out.push({ label: `${collection} (${parentField} #${i + 1})`, query: db().collection(collection).where(parentField, 'in', ids) })
    );
  };
  add('customerDocuments', 'customerId', await idsOf(['customer'], agentId));
  add('leadDocuments', 'leadId', await idsOf(['leads', 'sourceLead'], agentId));
  return out;
}

// ─── Storage ─────────────────────────────────────────────────

async function storageBuckets() {
  const raw = s(process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET).replace(/^gs:\/\//, '');
  if (!raw) return [];
  const names = new Set([raw]);
  if (raw.endsWith('.appspot.com')) names.add(raw.replace('.appspot.com', '.firebasestorage.app'));
  if (raw.endsWith('.firebasestorage.app')) names.add(raw.replace('.firebasestorage.app', '.appspot.com'));
  const out = [];
  for (const name of names) {
    const b = admin.storage().bucket(name);
    const [exists] = await b.exists().catch(() => [false]);
    if (exists) out.push(b);
  }
  return out;
}

async function deleteStoredFile(bucketName: string, path: string) {
  if (!path) return;
  const bucket = bucketName ? admin.storage().bucket(bucketName) : (await storageBuckets())[0];
  if (!bucket) return;
  await bucket.file(path).delete({ ignoreNotFound: true });
}

// ─── תצוגה מקדימה ────────────────────────────────────────────

export type PreviewRow = { label: string; count: number };

export async function previewAgentDeletion(agentId: string, callerUid: string) {
  const { candidate } = await loadAgent(agentId, callerUid);
  const rows: PreviewRow[] = [];
  const countQuery = async (label: string, q: FirebaseFirestore.Query) => {
    const n = (await q.count().get()).data().count;
    if (n) rows.push({ label, count: n });
  };

  for (const { label, query } of await fileDocQueries(agentId)) await countQuery(label, query);
  for (const t of TARGETS) for (const { label, query } of targetQueries(t, agentId)) await countQuery(label, query);
  // תתי-אוספים מתחת ל-agents/{uid} וכו' — קיימים גם כשמסמך האב עצמו לא קיים
  for (const t of TARGETS.filter((x) => x.idExact && x.recursive)) {
    for (const sub of await db().collection(t.collection).doc(agentId).listCollections()) {
      await countQuery(`${t.collection}/{uid}/${sub.id}`, sub);
    }
  }

  for (const bucket of await storageBuckets()) {
    for (const prefix of STORAGE_PREFIXES(agentId)) {
      const [files] = await bucket.getFiles({ prefix, maxResults: 5000 });
      if (files.length) rows.push({ label: `Storage: ${prefix}${files.length >= 5000 ? ' (5000+)' : ''}`, count: files.length });
    }
  }

  const workers = await db().collection('users').where('agentId', '==', agentId).where('role', '==', 'worker').get();
  const workerList = workers.docs.map((d) => ({ uid: d.id, name: s(d.get('name')), email: s(d.get('email')) }));

  return { agent: candidate, rows, workers: workerList };
}

// ─── מחיקה ───────────────────────────────────────────────────

type Counts = Record<string, number>;

/** מוחק עד שנגמר הזמן. מחזיר done=true כשהכול נמחק, כולל החשבון עצמו. */
export async function runAgentDeletion(agentId: string, caller: { uid: string; name: string }) {
  const { ref: agentRef, candidate } = await loadAgent(agentId, caller.uid);
  const deadline = Date.now() + TIME_BUDGET_MS;
  const outOfTime = () => Date.now() > deadline;
  const counts: Counts = {};
  const bump = (k: string, n: number) => { if (n) counts[k] = (counts[k] ?? 0) + n; };

  const logRef = db().collection(LOG_COLLECTION).doc(agentId);
  await logRef.set(
    {
      agentId,
      agentName: candidate.name,
      cancellationDate: candidate.cancellationDate,
      startedBy: caller.uid,
      startedByName: caller.name,
      status: 'in_progress',
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  /** מוחק את כל מה שהשאילתה מחזירה, בסבבים. false = נגמר הזמן לפני הסוף. */
  const drain = async (key: string, q: FirebaseFirestore.Query, opts: { recursive?: boolean; withFile?: boolean } = {}) => {
    while (!outOfTime()) {
      const snap = await q.limit(BATCH).get();
      if (snap.empty) return true;
      if (opts.withFile) {
        await Promise.all(snap.docs.map((d) => deleteStoredFile(s(d.get('bucket')), s(d.get('storagePath'))).catch((e) => {
          console.error('[agentDeletion] file delete failed', d.ref.path, e?.message);
        })));
      }
      if (opts.recursive) {
        for (const part of chunk(snap.docs, 20)) await Promise.all(part.map((d) => db().recursiveDelete(d.ref)));
      } else {
        const batch = db().batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      bump(key, snap.size);
    }
    return false;
  };

  const finish = async (done: boolean) => {
    const now = admin.firestore.FieldValue.serverTimestamp();
    const update: Record<string, any> = {
      status: done ? 'done' : 'in_progress',
      updatedAt: now,
      ...(done ? { finishedAt: now, finishedBy: caller.uid } : {}),
    };
    // update (ולא set) — כדי ש-counts.x ייכתב כמפה מקוננת ויצטבר בין הקריאות
    for (const [k, n] of Object.entries(counts)) {
      update[`counts.${k.replace(/[.\/:]/g, '_')}`] = admin.firestore.FieldValue.increment(n);
    }
    await logRef.update(update);
    return { done, counts };
  };

  // 1. קבצי לקוחות ולידים (לפני שהלקוחות והלידים עצמם נמחקים)
  for (const { label, query } of await fileDocQueries(agentId)) {
    if (!(await drain(label.split(' ')[0], query, { withFile: true }))) return finish(false);
  }

  // 2. נתונים
  for (const t of TARGETS) {
    for (const { query } of targetQueries(t, agentId)) {
      if (!(await drain(t.collection, query, { recursive: t.recursive }))) return finish(false);
    }
    // תתי-אוספים מתחת ל-agents/{uid} וכו' — גם כשמסמך האב לא קיים, ולכן השאילתה לא מוצאת אותו
    if (t.idExact && t.recursive) {
      const ref = db().collection(t.collection).doc(agentId);
      for (const sub of await ref.listCollections()) {
        if (!(await drain(`${t.collection}/${sub.id}`, sub, { recursive: true }))) return finish(false);
      }
    }
  }

  // 3. Storage
  for (const bucket of await storageBuckets()) {
    for (const prefix of STORAGE_PREFIXES(agentId)) {
      while (!outOfTime()) {
        const [files] = await bucket.getFiles({ prefix, maxResults: 200 });
        if (!files.length) break;
        await Promise.all(files.map((f) => f.delete({ ignoreNotFound: true })));
        bump(`storage:${prefix.split('/')[0]}`, files.length);
      }
      if (outOfTime()) return finish(false);
    }
  }

  // 4. עובדים של הסוכן
  const workers = await db().collection('users').where('agentId', '==', agentId).where('role', '==', 'worker').get();
  for (const w of workers.docs) {
    if (outOfTime()) return finish(false);
    await admin.auth().deleteUser(w.id).catch((e: any) => {
      if (e?.code !== 'auth/user-not-found') throw e;
    });
    await db().recursiveDelete(w.ref);
    bump('workers', 1);
  }

  // 5. החשבון של הסוכן — אחרון, כי הוא מה שמסמן את הסוכן כ"עזב" לבדיקה בקריאות הבאות
  if (outOfTime()) return finish(false);
  await admin.auth().deleteUser(agentId).catch((e: any) => {
    if (e?.code !== 'auth/user-not-found') throw e;
  });
  await db().recursiveDelete(agentRef);
  bump('users', 1);

  return finish(true);
}
