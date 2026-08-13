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
  saveSurenseApiCredentials,
} from "./shared/surenseApiSecret";

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

export async function saveAgentSurenseApiCredentialsImpl(
  input: {
    agentId: string;
    clientId: string;
    clientSecret: string;
    tokenEndpoint?: string;
    updatedBy?: string | null;
  }
): Promise<object> {
  const agentId =
    s(
      input?.agentId
    );

  const clientId =
    s(
      input?.clientId
    );

  const clientSecret =
    s(
      input?.clientSecret
    );

  const tokenEndpoint =
    s(
      input?.tokenEndpoint
    ) ||
    "https://auth.surense.com/oauth/token";

  const updatedBy =
    s(
      input?.updatedBy
    );

  if (!agentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  if (!clientId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing Surense Client ID"
    );
  }

  if (!clientSecret) {
    throw new HttpsError(
      "invalid-argument",
      "Missing Surense Client Secret"
    );
  }

  if (!updatedBy) {
    throw new HttpsError(
      "unauthenticated",
      "Login required"
    );
  }

  const db =
    adminDb();

  /*
   * המשתמש שמבצע את הפעולה.
   */
  const requesterSnap =
    await (
      db as any
    )
      .doc(
        `users/${updatedBy}`
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
      updatedBy
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

  /*
   * בדיקת קיום הסוכן.
   */
  const agentSnap =
    await (
      db as any
    )
      .doc(
        `users/${agentId}`
      )
      .get();

  if (!agentSnap.exists) {
    throw new HttpsError(
      "not-found",
      "Agent not found"
    );
  }

  await saveSurenseApiCredentials({
    agentId,
    clientId,
    clientSecret,
    tokenEndpoint,
    updatedBy,
  });

  /*
   * לעולם לא כותבים Client Secret ללוג.
   */
  console.info(
    "[saveAgentSurenseApiCredentials] Surense OAuth credentials stored",
    {
      agentId,
      updatedBy,
      tokenEndpoint,
    }
  );

  return {
    ok: true,

    agentId,

    credentialsConfigured:
      true,

    authType:
      "oauth2",
  };
}