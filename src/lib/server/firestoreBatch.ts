// ═══════════════════════════════════════════════════════════════════
// lib/server/firestoreBatch.ts
// עוטף שאילתת where(field, 'in', values) עם פיצול אוטומטי ל-batches של 30
// (המגבלה של Firestore), כדי שלא ניכשל אם יש יותר מ-30 runId-ים לאותו ym.
// ═══════════════════════════════════════════════════════════════════

import { admin } from '@/lib/firebase/firebase-admin';

const FIRESTORE_IN_LIMIT = 30;

type WhereTuple = [string, FirebaseFirestore.WhereFilterOp, any];

export async function getDocsByFieldInBatches(params: {
  collection: string;
  field: string;
  values: string[];
  extraWhere?: WhereTuple[];
}): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const { collection, field, values, extraWhere = [] } = params;
  const db = admin.firestore();

  const uniqueValues = Array.from(new Set(values.filter(Boolean)));
  if (!uniqueValues.length) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < uniqueValues.length; i += FIRESTORE_IN_LIMIT) {
    chunks.push(uniqueValues.slice(i, i + FIRESTORE_IN_LIMIT));
  }

  const results = await Promise.all(
    chunks.map(async (chunk) => {
      let q: FirebaseFirestore.Query = db.collection(collection).where(field, 'in', chunk);
      for (const [f, op, v] of extraWhere) {
        q = q.where(f, op, v);
      }
      const snap = await q.get();
      return snap.docs;
    })
  );

  return results.flat();
}