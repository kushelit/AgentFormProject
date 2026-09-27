// src/lib/server/drillHelpers.ts
// עזרים משותפים לדרילים של טבלת העמלות (צד שרת).
import { admin } from '@/lib/firebase/firebase-admin';

type Db = ReturnType<typeof admin.firestore>;

const IN_LIMIT = 30;

/** תבניות: שמות + תבניות היקף (פעילות, כמו בטבלה הראשית) — קריאה אחת, שדות מינימליים */
export async function loadTemplateInfo(db: Db) {
  const snap = await db.collection('commissionTemplates').select('Name', 'type', 'hekefType', 'isactive').get();
  const names: Record<string, string> = {};
  const hekef = new Set<string>();
  snap.docs.forEach((d) => {
    const t: any = d.data();
    names[d.id] = String(t.Name || t.type || d.id);
    if (t.isactive && t.hekefType) hekef.add(d.id);
  });
  return { names, hekef };
}

/** jobIds של חודש פרסום לחברה (portalImportRuns → queue.jobIds) */
export async function jobIdsForYm(db: Db, agentId: string, companyId: string, ym: string) {
  const snap = await db
    .collection('portalImportRuns')
    .where('agentId', '==', agentId)
    .where('companyId', '==', companyId)
    .where('resolvedWindow.ym', '==', ym)
    .select('queue.jobIds')
    .get();
  const ids = new Set<string>();
  snap.docs.forEach((d) => {
    const arr: any[] = (d.data() as any)?.queue?.jobIds || [];
    arr.forEach((x) => x && ids.add(String(x)));
  });
  return Array.from(ids);
}

/** שאילתה לפי runId in [...] — במקביל, בחלקים של 30, עם שדות נבחרים */
export async function queryByRunIds(params: {
  db: Db;
  collection: string;
  runIds: string[];
  where: Array<[string, FirebaseFirestore.WhereFilterOp, any]>;
  fields: string[];
}) {
  const { db, collection, runIds, where, fields } = params;
  const chunks: string[][] = [];
  for (let i = 0; i < runIds.length; i += IN_LIMIT) chunks.push(runIds.slice(i, i + IN_LIMIT));

  const snaps = await Promise.all(
    chunks.map((ids) => {
      let q: FirebaseFirestore.Query = db.collection(collection).where('runId', 'in', ids);
      where.forEach(([f, op, v]) => (q = q.where(f, op, v)));
      return q.select(...fields).get();
    })
  );
  return snaps.flatMap((s) => s.docs.map((d) => d.data() as any));
}