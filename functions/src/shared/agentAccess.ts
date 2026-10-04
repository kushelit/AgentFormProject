/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

// agentAccess/{uid} = which agents' data a user may access. Read by Firestore rules
// (rules cannot evaluate plans / role permissions / overrides themselves).
//
// Same model as src/lib/server/auth.ts → canAccessAgent:
//   isSystem → all
//   admin    → agents/managers with the same `agencies`
//   others   → base agent (worker → its agentId, otherwise self),
//              plus agents/managers in the base agent's agentGroupId when holding access_all_agents_in_group

import {FieldValue} from "firebase-admin/firestore";

export const AGENT_ACCESS_COLLECTION = "agentAccess";
const KNOWN_ROLES = ["agent", "manager", "worker", "admin"];
const GROUP_PERMISSION = "access_all_agents_in_group";

/** Fields on users/{uid} that change someone's access. */
export const ACCESS_FIELDS = ["role", "isSystem", "agencies", "agentId", "agentGroupId",
  "permissionOverrides", "subscriptionType", "addOns"];

const s = (v: any) => String(v ?? "").trim();

export type AgentAccess = { all: boolean; agentIds: string[] };

/**
 * Mirrors src/lib/permissions/hasPermission.ts for a non-paid permission.
 * Keep in sync if that logic changes.
 */
async function hasGroupPermission(db: FirebaseFirestore.Firestore, user: any): Promise<boolean> {
  const deny: string[] = user.permissionOverrides?.deny || [];
  if (deny.includes(GROUP_PERMISSION)) return false;
  const allow: string[] = user.permissionOverrides?.allow || [];
  if (allow.includes(GROUP_PERMISSION)) return true;
  const role = s(user.role);
  if (role === "admin") return true;
  if (role === "agent" || role === "manager") {
    const plan = s(user.subscriptionType);
    if (!plan) return false;
    const planSnap = await db.collection("subscriptions_permissions").doc(plan).get();
    return (planSnap.data()?.permissions || []).includes(GROUP_PERMISSION);
  }
  const roleSnap = await db.collection("roles").doc(role).get();
  const rolePerms: string[] = roleSnap.data()?.permissions || [];
  return rolePerms.includes("*") || rolePerms.includes(GROUP_PERMISSION);
}

export async function computeAgentAccess(db: FirebaseFirestore.Firestore, uid: string): Promise<AgentAccess> {
  const user = (await db.collection("users").doc(uid).get()).data();
  const role = s(user?.role);
  if (!user || !KNOWN_ROLES.includes(role)) return {all: false, agentIds: []};
  if (user.isSystem === true) return {all: true, agentIds: []};

  const ids = new Set<string>();
  if (role === "admin") {
    ids.add(uid);
    const agency = s(user.agencies);
    if (agency) {
      const snap = await db.collection("users").where("agencies", "==", agency).where("role", "in", ["agent", "manager"]).get();
      snap.forEach((d) => ids.add(d.id));
    }
    return {all: false, agentIds: [...ids].sort()};
  }

  const baseAgentId = role === "worker" ? s(user.agentId) : uid;
  if (!baseAgentId) return {all: false, agentIds: []};
  ids.add(baseAgentId);

  if (await hasGroupPermission(db, user)) {
    const base = baseAgentId === uid ? user : (await db.collection("users").doc(baseAgentId).get()).data();
    const groupId = s(base?.agentGroupId);
    if (groupId) {
      const snap = await db.collection("users").where("agentGroupId", "==", groupId).where("role", "in", ["agent", "manager"]).get();
      snap.forEach((d) => ids.add(d.id));
    }
  }
  return {all: false, agentIds: [...ids].sort()};
}

/** Recompute and store agentAccess/{uid}; writes only when the result changed. */
export async function syncAgentAccess(db: FirebaseFirestore.Firestore, uid: string): Promise<boolean> {
  const next = await computeAgentAccess(db, uid);
  const ref = db.collection(AGENT_ACCESS_COLLECTION).doc(uid);
  const current = (await ref.get()).data();
  if (current && current.all === next.all &&
    JSON.stringify(current.agentIds || []) === JSON.stringify(next.agentIds)) return false;
  await ref.set({...next, updatedAt: FieldValue.serverTimestamp()});
  return true;
}

/**
 * Users whose access may change when users/{uid} changes from `before` to `after`:
 * the user, its workers, members (and their workers) of the old/new group, admins of the old/new agency.
 */
export async function affectedByUserChange(db: FirebaseFirestore.Firestore, uid: string, before: any, after: any): Promise<string[]> {
  const out = new Set<string>([uid]);
  const users = db.collection("users");
  const addQuery = async (q: FirebaseFirestore.Query) => (await q.get()).forEach((d) => out.add(d.id));

  await addQuery(users.where("agentId", "==", uid));

  const groups = [...new Set([s(before?.agentGroupId), s(after?.agentGroupId)].filter(Boolean))];
  for (const groupId of groups) {
    const members = await users.where("agentGroupId", "==", groupId).get();
    for (const m of members.docs) {
      out.add(m.id);
      await addQuery(users.where("agentId", "==", m.id));
    }
  }

  const agencies = [...new Set([s(before?.agencies), s(after?.agencies)].filter(Boolean))];
  for (const agency of agencies) {
    await addQuery(users.where("agencies", "==", agency).where("role", "==", "admin"));
  }
  return [...out];
}

export function accessFieldsChanged(before: any, after: any): boolean {
  if (!before || !after) return true;
  return ACCESS_FIELDS.some((f) => JSON.stringify(before[f] ?? null) !== JSON.stringify(after[f] ?? null));
}
