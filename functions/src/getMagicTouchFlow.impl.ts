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
  resolveMagicTouchFlowAccess,
} from "./shared/magicTouchFlowAccess";

export async function getMagicTouchFlowImpl(
  req: any
): Promise<object> {
  const {
    db,
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

  return {
    ok: true,
    agentId,
    flow: {
      flowId: snap.id,
      ...snap.data(),
    },
  };
}
