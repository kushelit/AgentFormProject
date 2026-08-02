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

import {
  validateMagicTouchFlow,
} from "./shared/magicTouchFlowValidation";

export async function setMagicTouchFlowStatusImpl(
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

  const status =
    safeString(
      req.data?.status
    );

  if (!flowId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing flowId"
    );
  }

  if (
    ![
      "active",
      "inactive",
      "draft",
      "archived",
    ].includes(status)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid status"
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

  const flow = {
    flowId: snap.id,
    ...snap.data(),
  };

  const validation =
    validateMagicTouchFlow(
      flow
    );

  if (
    status === "active" &&
    !validation.valid
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Cannot activate an invalid flow",
      {
        validation,
      }
    );
  }

  await ref.set(
    {
      status,

      updatedBy:
        authUid,

      updatedAt:
        nowTs(),

      activatedAt:
        status === "active"
          ? nowTs()
          : flow.activatedAt ||
            null,

      deactivatedAt:
        status === "inactive"
          ? nowTs()
          : flow.deactivatedAt ||
            null,
    },
    {
      merge: true,
    }
  );

  return {
    ok: true,
    agentId,
    flowId,
    status,
    validation,
  };
}
