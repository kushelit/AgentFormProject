// src/lib/server/documentOwners.ts
// customerDocuments / leadDocuments get an AgentId field (the agent of the customer / lead),
// so Firestore rules can limit them per agent. Before, the link was only indirect
// (document → customerId/leadId → AgentId).

import { admin } from '@/lib/firebase/firebase-admin';

const s = (v: unknown) => String(v ?? '').trim();

/** AgentId of customer/{id} or leads/{id}, or '' when unknown. */
export async function agentIdOf(collection: 'customer' | 'leads', id: unknown): Promise<string> {
  const docId = s(id);
  if (!docId || docId.includes('/')) return '';
  const snap = await admin.firestore().collection(collection).doc(docId).get();
  return s(snap.data()?.AgentId);
}

type BackfillResult = { scanned: number; updated: number; alreadySet: number; ownerNotFound: number };

async function backfill(
  docsCollection: 'customerDocuments' | 'leadDocuments',
  parentCollection: 'customer' | 'leads',
  parentField: 'customerId' | 'leadId'
): Promise<BackfillResult> {
  const db = admin.firestore();
  const snap = await db.collection(docsCollection).get();
  const result: BackfillResult = { scanned: snap.size, updated: 0, alreadySet: 0, ownerNotFound: 0 };
  const ownerCache = new Map<string, string>();
  let batch = db.batch();
  let pending = 0;

  for (const d of snap.docs) {
    const data = d.data();
    if (s(data.AgentId)) { result.alreadySet++; continue; }
    const parentId = s(data[parentField]);
    if (!ownerCache.has(parentId)) ownerCache.set(parentId, await agentIdOf(parentCollection, parentId));
    const owner = ownerCache.get(parentId)!;
    if (!owner) { result.ownerNotFound++; continue; }
    // Adds one field only; nothing else on the document changes.
    batch.update(d.ref, { AgentId: owner });
    result.updated++;
    if (++pending === 400) { await batch.commit(); batch = db.batch(); pending = 0; }
  }
  if (pending) await batch.commit();
  return result;
}

/** One-time: add AgentId to existing customerDocuments and leadDocuments. Safe to run again. */
export async function backfillDocumentOwners() {
  return {
    customerDocuments: await backfill('customerDocuments', 'customer', 'customerId'),
    leadDocuments: await backfill('leadDocuments', 'leads', 'leadId'),
  };
}
