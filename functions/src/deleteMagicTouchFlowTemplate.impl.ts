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
  resolveMagicTouchFlowTemplateAccess,
} from "./shared/magicTouchFlowTemplateAccess";

export async function deleteMagicTouchFlowTemplateImpl(
  req: any
): Promise<object> {
  const {
    db,
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

  await templateRef.delete();

  return {
    ok: true,
    templateId,
  };
}