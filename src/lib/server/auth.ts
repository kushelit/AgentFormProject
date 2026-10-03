// src/lib/server/auth.ts
// Server-side identity and agent access checks for API routes.
//
// • The caller is identified only by the Firebase ID token (Authorization: Bearer <token>),
//   never by agentId / uid sent in the request body.
// • Agent access model (same as useFetchAgentData):
//     isSystem → all agents
//     admin    → agents with the same `agencies`
//     others   → base agent (worker → its agentId, otherwise self),
//                plus the base agent's agentGroupId when holding access_all_agents_in_group
// • API_AUTH_MODE=enforce blocks; any other value (default) only logs what would be blocked.

import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/lib/firebase/firebase-admin';
import { hasPermission } from '@/lib/permissions/hasPermission';

export type AuthUser = {
  uid: string;
  role: string;
  isSystem: boolean;
  agencies: string;
  /** The agent this user works for: a worker's agentId, otherwise the user itself */
  baseAgentId: string;
  data: Record<string, any>;
};

const KNOWN_ROLES = ['agent', 'manager', 'worker', 'admin'];
const GROUP_PERMISSION = 'access_all_agents_in_group';

const isEnforcing = () => process.env.API_AUTH_MODE === 'enforce';
const s = (v: unknown) => String(v ?? '').trim();

function bearerToken(req: NextRequest | Request): string {
  return req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1] ?? '';
}

/** Verified caller, or null when there is no valid token / no registered user doc. */
export async function getAuthUser(req: NextRequest | Request): Promise<AuthUser | null> {
  const token = bearerToken(req);
  if (!token) return null;
  let uid: string;
  try {
    uid = (await admin.auth().verifyIdToken(token)).uid;
  } catch {
    return null;
  }
  const snap = await admin.firestore().collection('users').doc(uid).get();
  const data = snap.data();
  const role = s(data?.role);
  if (!data || !KNOWN_ROLES.includes(role)) return null;
  return {
    uid,
    role,
    isSystem: data.isSystem === true,
    agencies: s(data.agencies),
    baseAgentId: role === 'worker' ? s(data.agentId) : uid,
    data,
  };
}

export const isAdminUser = (user: AuthUser) => user.isSystem || user.role === 'admin';

async function userHasPermission(user: AuthUser, permission: string): Promise<boolean> {
  const db = admin.firestore();
  const [roleSnap, plansSnap] = await Promise.all([
    db.collection('roles').doc(user.role).get(),
    db.collection('subscriptions_permissions').get(),
  ]);
  const subscriptionPermissionsMap: Record<string, string[]> = {};
  plansSnap.forEach((d) => { subscriptionPermissionsMap[d.id] = d.data()?.permissions || []; });
  return hasPermission({
    user: {
      uid: user.uid,
      role: user.role,
      subscriptionId: user.data.subscriptionId,
      subscriptionType: user.data.subscriptionType,
      permissionOverrides: user.data.permissionOverrides,
      addOns: user.data.addOns,
    },
    permission,
    rolePermissions: roleSnap.data()?.permissions || [],
    subscriptionPermissionsMap,
  });
}

/** May this user read/act on agentId's data? */
export async function canAccessAgent(user: AuthUser, agentIdRaw: unknown): Promise<boolean> {
  const agentId = s(agentIdRaw);
  if (!agentId || agentId.includes('/')) return false;
  if (user.isSystem) return true;
  if (agentId === user.baseAgentId) return true;

  const users = admin.firestore().collection('users');
  if (user.role === 'admin') {
    if (!user.agencies) return false;
    const target = await users.doc(agentId).get();
    return s(target.data()?.agencies) === user.agencies;
  }

  if (!user.baseAgentId) return false;
  const [base, target] = await Promise.all([users.doc(user.baseAgentId).get(), users.doc(agentId).get()]);
  const groupId = s(base.data()?.agentGroupId);
  const t = target.data();
  if (!groupId || !t || s(t.agentGroupId) !== groupId || !['agent', 'manager'].includes(s(t.role))) return false;
  return userHasPermission(user, GROUP_PERMISSION);
}

const LOG_COLLECTION = 'apiAuthLogs';

/**
 * One document per day + route + user + agent + reason, with a counter,
 * so repeated identical calls stay a single readable row.
 */
async function logDenied(route: string, status: number, reason: string, extra: Record<string, unknown>, user?: AuthUser) {
  try {
    const day = new Date().toISOString().slice(0, 10);
    const agentId = s(extra.agentId ?? extra.ownerId ?? extra.target);
    const uid = user?.uid || 'anonymous';
    const id = [day, route, uid, agentId || '-', reason].join('_').replace(/[\/\s]+/g, '-').slice(0, 1400);
    const ref = admin.firestore().collection(LOG_COLLECTION).doc(id);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const fields = {
      day, route, reason, status, uid, agentId,
      mode: isEnforcing() ? 'enforce' : 'log',
      userName: s(user?.data.name), userRole: user?.role || '',
      extra: JSON.parse(JSON.stringify(extra)),
    };
    await ref.create({ ...fields, count: 1, firstAt: now, lastAt: now }).catch(() =>
      ref.update({ count: admin.firestore.FieldValue.increment(1), lastAt: now })
    );
  } catch (e) {
    console.error('[api-auth] failed to write log', e);
  }
}

async function deny(route: string, status: 401 | 403, reason: string, extra: Record<string, unknown> = {}, user?: AuthUser) {
  console.warn(`[api-auth] ${isEnforcing() ? 'BLOCKED' : 'would block'} ${route}: ${reason}`, extra);
  await logDenied(route, status, reason, extra, user);
  if (!isEnforcing()) return null;
  return NextResponse.json(
    { error: status === 401 ? 'נדרשת התחברות' : 'אין הרשאה לפעולה זו' },
    { status }
  );
}

// Guards: return a NextResponse to send back when the request must be blocked, otherwise null.
// Usage:  const denied = await guardAgentAccess(req, agentId, 'commission-summary'); if (denied) return denied;

export async function guardUser(req: NextRequest | Request, route: string) {
  const user = await getAuthUser(req);
  return user ? null : deny(route, 401, 'no valid token');
}

export async function guardAdmin(req: NextRequest | Request, route: string) {
  const user = await getAuthUser(req);
  if (!user) return deny(route, 401, 'no valid token');
  return isAdminUser(user) ? null : deny(route, 403, 'not admin', { uid: user.uid }, user);
}

export async function guardAgentAccess(req: NextRequest | Request, agentId: unknown, route: string) {
  const user = await getAuthUser(req);
  if (!user) return deny(route, 401, 'no valid token', { agentId: s(agentId) });
  if (await canAccessAgent(user, agentId)) return null;
  return deny(route, 403, 'agent out of scope', { uid: user.uid, agentId: s(agentId) }, user);
}

/** For requests carrying several agents (e.g. a matrix): every one must be accessible. */
export async function guardAgentsAccess(req: NextRequest | Request, agentIds: unknown[], route: string) {
  const user = await getAuthUser(req);
  if (!user) return deny(route, 401, 'no valid token');
  for (const agentId of agentIds) {
    if (!(await canAccessAgent(user, agentId))) {
      return deny(route, 403, 'agent out of scope', { uid: user.uid, agentId: s(agentId) }, user);
    }
  }
  return null;
}

/**
 * Access by the agent that owns a document, e.g. customer/{id}.AgentId, leads/{id}.AgentId,
 * importRuns/{id}.agentId. A missing document is treated as out of scope.
 */
export async function guardDocOwner(
  req: NextRequest | Request,
  ref: { collection: string; id: unknown; ownerField: string },
  route: string
) {
  const user = await getAuthUser(req);
  if (!user) return deny(route, 401, 'no valid token');
  const id = s(ref.id);
  const snap = id && !id.includes('/') ? await admin.firestore().collection(ref.collection).doc(id).get() : null;
  const ownerId = s(snap?.data()?.[ref.ownerField]);
  if (ownerId && (await canAccessAgent(user, ownerId))) return null;
  return deny(route, 403, 'document out of scope', { uid: user.uid, collection: ref.collection, id, ownerId }, user);
}

/** Admin, or the user acting on itself (subscription actions). */
export async function guardSelfOrAdmin(req: NextRequest | Request, targetUid: unknown, route: string) {
  const user = await getAuthUser(req);
  if (!user) return deny(route, 401, 'no valid token');
  if (isAdminUser(user) || s(targetUid) === user.uid) return null;
  return deny(route, 403, 'not self or admin', { uid: user.uid, target: s(targetUid) }, user);
}
