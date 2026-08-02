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

export async function deleteMagicTouchFlowImpl(
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

  await ref.set(
    {
      status:
        "archived",

      archivedBy:
        authUid,

      archivedAt:
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
      "archived",
  };
}
