/* eslint-disable require-jsdoc */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { resolveMagicTouchFlowTemplateAccess } from "./shared/magicTouchFlowTemplateAccess";

function timestampToMillis(value: any): number {
  if (value && typeof value.toMillis === "function") return value.toMillis();
  if (value && typeof value.seconds === "number") return value.seconds * 1000;
  return 0;
}

export async function listMagicTouchFlowTemplatesImpl(req: any): Promise<object> {
  const { db } = await resolveMagicTouchFlowTemplateAccess(req);
  const snap = await (db as any).collection("magic_touch_flow_templates").get();

  const templates = snap.docs
    .map((doc: any) => ({ templateId: doc.id, ...doc.data() }))
    .filter((item: any) => item.status !== "archived")
    .sort((a: any, b: any) =>
      timestampToMillis(b.updatedAt || b.createdAt) -
      timestampToMillis(a.updatedAt || a.createdAt)
    );

  return { ok: true, templates };
}
