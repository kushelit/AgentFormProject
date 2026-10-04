// src/lib/agentScope.ts
// Client-side: which agents the logged-in user may access, from agentAccess/{uid}
// (computed by Cloud Functions — functions/src/shared/agentAccess.ts), and a helper that
// loads a collection only for those agents. Firestore rules (stage B) allow only queries
// filtered this way, except for the system admin.

import {
  collection, doc, getDoc, getDocs, query, where,
  type QueryConstraint, type QueryDocumentSnapshot, type DocumentData,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/firebase';

export type AgentScope = { all: boolean; agentIds: string[] };

const CACHE_MS = 60_000;
// Firestore allows at most 30 disjunctions per query; an "in" on the agent combined with
// another "in" (e.g. statusPolicy) multiplies, so keep agent chunks small.
const AGENT_CHUNK = 10;

let cache: { uid: string; at: number; scope: AgentScope } | null = null;

export async function getMyAgentScope(): Promise<AgentScope> {
  await auth.authStateReady();
  const uid = auth.currentUser?.uid;
  if (!uid) return { all: false, agentIds: [] };
  if (cache && cache.uid === uid && Date.now() - cache.at < CACHE_MS) return cache.scope;

  const snap = await getDoc(doc(db, 'agentAccess', uid));
  const data = snap.data();
  // No agentAccess doc yet in this environment (before the functions are deployed there):
  // keep the previous behavior instead of hiding data.
  const scope: AgentScope = !snap.exists()
    ? { all: true, agentIds: [] }
    : { all: data?.all === true, agentIds: Array.isArray(data?.agentIds) ? data!.agentIds : [] };
  cache = { uid, at: Date.now(), scope };
  return scope;
}

/**
 * getDocs on a collection limited to the agents the user may access.
 * ownerField is the agent field of that collection ('AgentId' for customer/sales/contracts,
 * 'agentId' for tasks/notes/commission collections).
 */
export async function getDocsForMyAgents(
  collectionName: string,
  ownerField: 'AgentId' | 'agentId',
  constraints: QueryConstraint[] = []
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const scope = await getMyAgentScope();
  const ref = collection(db, collectionName);
  if (scope.all) return (await getDocs(query(ref, ...constraints))).docs;

  const out: QueryDocumentSnapshot<DocumentData>[] = [];
  for (let i = 0; i < scope.agentIds.length; i += AGENT_CHUNK) {
    const chunk = scope.agentIds.slice(i, i + AGENT_CHUNK);
    out.push(...(await getDocs(query(ref, where(ownerField, 'in', chunk), ...constraints))).docs);
  }
  return out;
}

export type AgentDocs = {
  docs: QueryDocumentSnapshot<DocumentData>[];
  size: number;
  empty: boolean;
  forEach: (cb: (d: QueryDocumentSnapshot<DocumentData>) => void) => void;
};

/**
 * The selected agent's documents, or — when no agent / "all" is selected — the documents of
 * every agent the user may access. Returns a QuerySnapshot-like object (docs / forEach).
 */
export async function getAgentDocs(
  collectionName: string,
  ownerField: 'AgentId' | 'agentId',
  agentId: string | null | undefined,
  constraints: QueryConstraint[] = []
): Promise<AgentDocs> {
  const docs = agentId && agentId !== 'all'
    ? (await getDocs(query(collection(db, collectionName), where(ownerField, '==', agentId), ...constraints))).docs
    : await getDocsForMyAgents(collectionName, ownerField, constraints);
  return { docs, size: docs.length, empty: docs.length === 0, forEach: (cb) => docs.forEach(cb) };
}
