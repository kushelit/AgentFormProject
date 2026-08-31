/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  safeString,
} from "./shared/magicTouchContacts";

import {
  nowTs,
} from "./shared/admin";

import {
  resolveMagicTouchFlowAccess,
} from "./shared/magicTouchFlowAccess";

export async function restoreMagicTouchFlowImpl(
  req: any
): Promise<object> {
  const {
    db,
    authUid,
    agentId,
  } =
    await resolveMagicTouchFlowAccess(
      req
    );

  const flowId =
    safeString(
      req.data?.flowId
    );

  if (!flowId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing flowId"
    );
  }

  const ref =
    (db as any).doc(
      `agents/${agentId}/magic_touch_flows/${flowId}`
    );

  const snap =
    await ref.get();

  if (!snap.exists) {
    throw new HttpsError(
      "not-found",
      "Flow not found"
    );
  }

  const data =
    snap.data() || {};

  if (
    safeString(
      data.status
    ) !== "archived"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Flow is not archived"
    );
  }

  await ref.set(
    {
      status:
        "draft",

      restoredBy:
        authUid,

      restoredAt:
        nowTs(),

      updatedBy:
        authUid,

      updatedAt:
        nowTs(),
    },
    {
      merge: true,
    }
  );

  return {
    ok: true,
    agentId,
    flowId,
    status:
      "draft",
  };
}