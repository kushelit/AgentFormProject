/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
} from "./admin";

import {
  safeString,
} from "./magicTouchContacts";

import {
  requireBackendPermission,
} from "./backendPermissions";

export interface MagicTouchFlowAccessContext {
  db: any;
  authUid: string;
  userData: any;
  agentId: string;
  isAdmin: boolean;
}

export async function resolveMagicTouchFlowAccess(
  req: any
): Promise<MagicTouchFlowAccessContext> {
  const authUid =
    safeString(
      req.auth?.uid
    );

  if (!authUid) {
    throw new HttpsError(
      "unauthenticated",
      "Login required"
    );
  }

  const db =
    adminDb();

  const userSnap =
    await (db as any)
      .collection("users")
      .doc(authUid)
      .get();

  if (!userSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "User not found"
    );
  }

  const userData =
    userSnap.data() as any;

  await requireBackendPermission({
    db: db as any,
    userId: authUid,
    userData,
    permission: "access_magic_touch",
  });

  const isAdmin =
    userData?.role === "admin" ||
    userData?.isSystem === true;

  const ownAgentId =
    safeString(userData?.agentId) ||
    authUid;

  const requestedAgentId =
    safeString(
      req.data?.agentId
    );

  const agentId =
    isAdmin && requestedAgentId
      ? requestedAgentId
      : ownAgentId;

  if (!agentId) {
    throw new HttpsError(
      "failed-precondition",
      "Unable to resolve agentId"
    );
  }

  if (
    !isAdmin &&
    requestedAgentId &&
    requestedAgentId !== ownAgentId
  ) {
    throw new HttpsError(
      "permission-denied",
      "Cannot manage flows for another agent"
    );
  }

  return {
    db,
    authUid,
    userData,
    agentId,
    isAdmin,
  };
}
