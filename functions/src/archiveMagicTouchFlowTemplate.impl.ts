/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  nowTs,
} from "./shared/admin";

import {
  safeString,
} from "./shared/magicTouchContacts";

import {
  resolveMagicTouchFlowTemplateAccess,
} from "./shared/magicTouchFlowTemplateAccess";

export async function archiveMagicTouchFlowTemplateImpl(
  req: any
): Promise<object> {
  const {
    db,
    authUid,
  } =
    await resolveMagicTouchFlowTemplateAccess(
      req
    );

  const templateId =
    safeString(
      req.data?.templateId
    );

  if (!templateId) {
    throw new HttpsError(
      "invalid-argument",
      "templateId is required"
    );
  }

  const templateRef =
    (db as any).doc(
      `magic_touch_flow_templates/${templateId}`
    );

  const templateSnap =
    await templateRef.get();

  if (!templateSnap.exists) {
    throw new HttpsError(
      "not-found",
      "Template not found"
    );
  }

  await templateRef.set(
    {
      status:
        "archived",

      archivedAt:
        nowTs(),

      archivedBy:
        authUid,

      updatedAt:
        nowTs(),

      updatedBy:
        authUid,
    },
    {
      merge:
        true,
    }
  );

  return {
    ok:
      true,

    templateId,
  };
}