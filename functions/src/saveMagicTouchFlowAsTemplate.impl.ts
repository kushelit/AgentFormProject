/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";
import { nowTs } from "./shared/admin";
import { safeString } from "./shared/magicTouchContacts";
import { resolveMagicTouchFlowTemplateAccess } from "./shared/magicTouchFlowTemplateAccess";
import { sanitizeFlowForTemplate } from "./shared/magicTouchFlowTemplateSanitizer";
import {
  MAGIC_TOUCH_FLOW_TEMPLATE_SCHEMA_VERSION,
  MagicTouchFlowTemplateDocument,
} from "./shared/magicTouchFlowTemplateTypes";

function normalizeTemplateKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_\-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 100);
}

export async function saveMagicTouchFlowAsTemplateImpl(req: any): Promise<object> {
  const { db, authUid } = await resolveMagicTouchFlowTemplateAccess(req);

  const agentId = safeString(req.data?.agentId);
  const flowId = safeString(req.data?.flowId);
  const requestedTemplateId = safeString(req.data?.templateId);
  const name = safeString(req.data?.name);
  const description = safeString(req.data?.description);
  const category = safeString(req.data?.category) || "general";
  const templateKey = normalizeTemplateKey(safeString(req.data?.templateKey));

  if (!agentId || !flowId || !name || !templateKey) {
    throw new HttpsError(
      "invalid-argument",
      "agentId, flowId, name and templateKey are required"
    );
  }

  const flowRef = (db as any).doc(
    `agents/${agentId}/magic_touch_flows/${flowId}`
  );
  const flowSnap = await flowRef.get();

  if (!flowSnap.exists) {
    throw new HttpsError("not-found", "Flow not found");
  }

  const flow = flowSnap.data() as any;
  const sanitized = sanitizeFlowForTemplate(flow);

  if (!sanitized.firstStepId || Object.keys(sanitized.steps).length === 0) {
    throw new HttpsError(
      "failed-precondition",
      "Flow has no valid first step or steps"
    );
  }

  const collection = (db as any).collection("magic_touch_flow_templates");
  let templateRef = requestedTemplateId
    ? collection.doc(requestedTemplateId)
    : collection.doc();

  const existingSnap = await templateRef.get();
  const existing = existingSnap.exists ? existingSnap.data() : null;

  if (!requestedTemplateId) {
    const sameKeySnap = await collection
      .where("templateKey", "==", templateKey)
      .limit(1)
      .get();

    if (!sameKeySnap.empty) {
      throw new HttpsError(
        "already-exists",
        "A template with this templateKey already exists"
      );
    }
  } else if (!existingSnap.exists) {
    throw new HttpsError("not-found", "Template not found");
  }

  const version = existingSnap.exists
    ? Number(existing?.version || 1) + 1
    : 1;

  const document: MagicTouchFlowTemplateDocument = {
    schemaVersion: MAGIC_TOUCH_FLOW_TEMPLATE_SCHEMA_VERSION,
    templateId: templateRef.id,
    templateKey,
    name,
    description,
    category,
    status: safeString(req.data?.status) === "published" ? "published" : "draft",
    version,

    sourceAgentId: agentId,
    sourceFlowId: flowId,
    sourceFlowVersion: Number(flow?.version || 1),

    trigger: sanitized.trigger,
    firstStepId: sanitized.firstStepId,
    steps: sanitized.steps,

    variables: Array.isArray(existing?.variables) ? existing.variables : [],
    requiredIntegrations: sanitized.requiredIntegrations,
    requiredPermissions: ["access_magic_touch"],

    createdBy: existing?.createdBy || authUid,
    updatedBy: authUid,
    createdAt: existing?.createdAt || nowTs(),
    updatedAt: nowTs(),
  };

  await templateRef.set(document);

  return {
    ok: true,
    templateId: templateRef.id,
    templateKey,
    version,
    requiredIntegrations: sanitized.requiredIntegrations,
  };
}
