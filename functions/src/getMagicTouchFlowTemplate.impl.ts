/* eslint-disable require-jsdoc */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import { safeString } from "./shared/magicTouchContacts";
import { resolveMagicTouchFlowTemplateAccess } from "./shared/magicTouchFlowTemplateAccess";

export async function getMagicTouchFlowTemplateImpl(req: any): Promise<object> {
  const { db } = await resolveMagicTouchFlowTemplateAccess(req);
  const templateId = safeString(req.data?.templateId);

  if (!templateId) {
    throw new HttpsError("invalid-argument", "Missing templateId");
  }

  const snap = await (db as any)
    .collection("magic_touch_flow_templates")
    .doc(templateId)
    .get();

  if (!snap.exists) {
    throw new HttpsError("not-found", "Template not found");
  }

  return { ok: true, template: { templateId: snap.id, ...snap.data() } };
}
