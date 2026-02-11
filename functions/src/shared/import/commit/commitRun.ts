// functions/src/shared/import/commit/commitRun.ts
import {FirestoreAdapter} from "./adapters";
import {CommissionSummary, PolicyCommissionSummary, RunDoc, StandardizedRow} from "../types";

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

async function writeInChunks<T>(
  adapter: FirestoreAdapter,
  items: T[],
  chunkSize: number,
  writer: (batch: any, item: T) => void
) {
  for (let i = 0; i < items.length; i += chunkSize) {
    const slice = items.slice(i, i + chunkSize);
    const batch = adapter.writeBatch();
    for (const item of slice) writer(batch, item);
    await batch.commit();
  }
}

export async function commitRun(params: {
  adapter: FirestoreAdapter;

  runDoc: RunDoc;
  rowsPrepared: StandardizedRow[];
  commissionSummaries: CommissionSummary[];
  policySummaries: PolicyCommissionSummary[];

  // update users.agentCodes
  agentCodes: string[];
}) {
  const {adapter, runDoc, rowsPrepared, commissionSummaries, policySummaries, agentCodes} = params;

  const CHUNK = 450;

  // 1) update users/{agentId}.agentCodes (כמו בידני)
  if (agentCodes.length) {
    const userRef = adapter.doc(`users/${runDoc.agentId}`);
    const userSnap = await adapter.getDoc(userRef);
    if (userSnap.exists) {
      const existing = Array.isArray(userSnap.data?.agentCodes) ? userSnap.data.agentCodes : [];
      const toAdd = agentCodes.filter((c) => c && !existing.includes(c));
      if (toAdd.length) {
        await adapter.updateDoc(userRef, {agentCodes: adapter.arrayUnion(...toAdd)});
      }
    }
  }

  // 2) externalCommissions (new docs)
  await writeInChunks(adapter, rowsPrepared, CHUNK, (batch, row) => {
    const ref = adapter.doc(adapter.collection("externalCommissions"));
    batch.set(ref, stripUndefined(row));
  });

  // 3) commissionSummaries (deterministic id)
  await writeInChunks(adapter, commissionSummaries, CHUNK, (batch, s) => {
    const id = `${s.agentId}_${s.agentCode}_${s.reportMonth}_${s.templateId}_${s.companyId}`;
    const ref = adapter.doc(`commissionSummaries/${id}`);
    batch.set(ref, {...s, updatedAt: adapter.serverTimestamp()}, {merge: true});
  });

  // 4) policyCommissionSummaries (deterministic id)
  await writeInChunks(adapter, policySummaries, CHUNK, (batch, s) => {
    const id = `${s.agentId}_${s.agentCode}_${s.reportMonth}_${s.companyId}_${s.policyNumberKey}_${s.customerId}_${s.templateId}`;
    const ref = adapter.doc(`policyCommissionSummaries/${id}`);
    batch.set(ref, stripUndefined({...s, updatedAt: adapter.serverTimestamp()}), {merge: true});
  });

  // 5) commissionImportRuns/{runId}
  const runRef = adapter.doc(`commissionImportRuns/${runDoc.runId}`);
  await adapter.setDoc(
    runRef,
    stripUndefined({
      ...runDoc,
      updatedAt: adapter.serverTimestamp(),
    }),
    {merge: true}
  );
}
