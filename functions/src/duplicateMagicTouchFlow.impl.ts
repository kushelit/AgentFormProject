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

export async function duplicateMagicTouchFlowImpl(
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

  const sourceRef =
    (db as any).doc(
      `agents/${agentId}/magic_touch_flows/${flowId}`
    );

  const sourceSnap =
    await sourceRef.get();

  if (!sourceSnap.exists) {
    throw new HttpsError(
      "not-found",
      "Flow not found"
    );
  }

  const sourceData =
    sourceSnap.data();

  const targetRef =
    (db as any)
      .collection(
        `agents/${agentId}/magic_touch_flows`
      )
      .doc();

  await targetRef.set({
    ...sourceData,

    flowId:
      targetRef.id,

    name:
      `${safeString(sourceData?.name)} - עותק`,

    status:
      "draft",

    version:
      1,

    createdBy:
      authUid,

    updatedBy:
      authUid,

    createdAt:
      nowTs(),

    updatedAt:
      nowTs(),

    activatedAt:
      null,

    deactivatedAt:
      null,
  });

  return {
    ok: true,
    agentId,
    sourceFlowId:
      flowId,
    flowId:
      targetRef.id,
  };
}
