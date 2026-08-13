/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
} from "./shared/admin";

import {
  hasSurenseApiCredentials,
} from "./shared/surenseApiSecret";

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

export async function getAgentSurenseApiConfigImpl(
  input: {
    agentId: string;
    requestedBy?: string | null;
  }
): Promise<object> {
  const agentId =
    s(
      input?.agentId
    );

  const requestedBy =
    s(
      input?.requestedBy
    );

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  if (!requestedBy) {
    throw new HttpsError(
      "unauthenticated",
      "Login required"
    );
  }

  const db =
    adminDb();

  const requesterSnap =
    await (
      db as any
    )
      .doc(
        `users/${requestedBy}`
      )
      .get();

  if (!requesterSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "User not found"
    );
  }

  const requester =
    requesterSnap.data() as any;

  const isAdmin =
    requester?.role ===
      "admin" ||
    requester?.isSystem ===
      true;

  const loggedInAgentId =
    s(
      requester?.agentId ||
      requestedBy
    );

  const canManageAgent =
    isAdmin ||
    loggedInAgentId ===
      agentId;

  if (!canManageAgent) {
    throw new HttpsError(
      "permission-denied",
      "You may only manage Surense configuration for your own agent"
    );
  }

  const credentialsConfigured =
    await hasSurenseApiCredentials(
      agentId
    );

  return {
    ok: true,

    agentId,

    directApi: {
      credentialsConfigured,

      authType:
        "oauth2",
    },
  };
}