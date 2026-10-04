/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

// Keeps agentAccess/{uid} (used by Firestore rules) in sync — see shared/agentAccess.ts.

import {onDocumentWritten} from "firebase-functions/v2/firestore";
import {onCall, HttpsError} from "firebase-functions/v2/https";
import {adminDb} from "./shared/admin";
import {FUNCTIONS_REGION} from "./shared/region";
import {
  AGENT_ACCESS_COLLECTION,
  accessFieldsChanged,
  affectedByUserChange,
  syncAgentAccess,
} from "./shared/agentAccess";

async function syncMany(uids: string[]) {
  const db = adminDb();
  let changed = 0;
  for (const uid of uids) {
    if (await syncAgentAccess(db, uid)) changed++;
  }
  return changed;
}

async function syncAllUsers() {
  const db = adminDb();
  const snap = await db.collection("users").select().get();
  const uids = snap.docs.map((d) => d.id);
  const changed = await syncMany(uids);
  // Remove access docs of users that no longer exist.
  const access = await db.collection(AGENT_ACCESS_COLLECTION).select().get();
  const existing = new Set(uids);
  const stale = access.docs.filter((d) => !existing.has(d.id));
  for (const d of stale) await d.ref.delete();
  return {users: uids.length, changed, removed: stale.length};
}

export const syncAgentAccessOnUserWrite = onDocumentWritten(
  {document: "users/{uid}", region: FUNCTIONS_REGION},
  async (event) => {
    const uid = event.params.uid;
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    if (!accessFieldsChanged(before, after)) return;
    const db = adminDb();
    if (!after) await db.collection(AGENT_ACCESS_COLLECTION).doc(uid).delete();
    const uids = (await affectedByUserChange(db, uid, before, after)).filter((id) => id !== uid || after);
    await syncMany(uids);
  }
);

// Plan / role permission changes can grant or revoke access_all_agents_in_group for many users.
export const syncAgentAccessOnPlanWrite = onDocumentWritten(
  {document: "subscriptions_permissions/{plan}", region: FUNCTIONS_REGION, timeoutSeconds: 540},
  async () => {
    await syncAllUsers();
  }
);

export const syncAgentAccessOnRoleWrite = onDocumentWritten(
  {document: "roles/{role}", region: FUNCTIONS_REGION, timeoutSeconds: 540},
  async () => {
    await syncAllUsers();
  }
);

/** Full rebuild (initial backfill / repair). System admin only. */
export const rebuildAgentAccess = onCall(
  {region: FUNCTIONS_REGION, timeoutSeconds: 540},
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Login required");
    const me = (await adminDb().collection("users").doc(uid).get()).data();
    if (me?.isSystem !== true) throw new HttpsError("permission-denied", "System admin only");
    return syncAllUsers();
  }
);
