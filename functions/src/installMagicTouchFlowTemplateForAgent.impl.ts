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

function cleanObject(value: any): any {
  if (Array.isArray(value)) {
    return value.map(cleanObject);
  }

  if (value && typeof value === "object") {
    const result: Record<string, any> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (nestedValue === undefined) {
        continue;
      }

      result[key] = cleanObject(nestedValue);
    }

    return result;
  }

  return value;
}

export async function installMagicTouchFlowTemplateForAgentImpl(
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

  const targetAgentId =
    safeString(
      req.data?.agentId
    );

  const requestedName =
    safeString(
      req.data?.name
    );

    const whatsappTemplateName =
  safeString(
    req.data?.whatsappTemplateName
  );

  if (!templateId || !targetAgentId) {
    throw new HttpsError(
      "invalid-argument",
      "templateId and agentId are required"
    );
  }

  const templateRef =
    (db as any)
      .collection(
        "magic_touch_flow_templates"
      )
      .doc(templateId);

  const templateSnap =
    await templateRef.get();

  if (!templateSnap.exists) {
    throw new HttpsError(
      "not-found",
      "Flow template not found"
    );
  }

  const template =
    templateSnap.data() as any;

    const templateTrigger =
  template?.trigger &&
  typeof template.trigger === "object"
    ? cleanObject(template.trigger)
    : {};

const requiresWhatsAppTemplate =
  templateTrigger.type ===
    "whatsapp_quick_reply_received" &&
  !safeString(
    templateTrigger.templateName
  );

if (
  requiresWhatsAppTemplate &&
  !whatsappTemplateName
) {
  throw new HttpsError(
    "failed-precondition",
    "WhatsApp template must be selected before installing this flow"
  );
}

const installedTrigger = {
  ...templateTrigger,
  ...(requiresWhatsAppTemplate
    ? {
        templateName:
          whatsappTemplateName,
      }
    : {}),
};

  if (
    template.status === "archived"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Archived templates cannot be installed"
    );
  }

  const firstStepId =
    safeString(
      template.firstStepId
    );

  const steps =
    template.steps &&
    typeof template.steps === "object" &&
    !Array.isArray(template.steps)
      ? cleanObject(template.steps)
      : {};

  if (
    !firstStepId ||
    Object.keys(steps).length === 0 ||
    !steps[firstStepId]
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Template does not contain a valid Flow structure"
    );
  }

  const flowRef =
    (db as any)
      .collection(
        `agents/${targetAgentId}/magic_touch_flows`
      )
      .doc();

  const flowName =
    requestedName ||
    safeString(template.name) ||
    "Flow מתבנית";

  await flowRef.set({
    flowId: flowRef.id,
    agentId: targetAgentId,
    name: flowName,
    description:
      safeString(template.description),
    status: "draft",
    version: 1,
    firstStepId,
    trigger:
  installedTrigger,
    steps,

    templateId,
    templateKey:
      safeString(template.templateKey),
    templateVersion:
      Number(template.version || 1),
    installedAt: nowTs(),
    installedBy: authUid,
    localVersion: 1,
    isCustomized: false,

    createdBy: authUid,
    updatedBy: authUid,
    createdAt: nowTs(),
    updatedAt: nowTs(),
    activatedAt: null,
    deactivatedAt: null,
  });

  return {
    ok: true,
    agentId: targetAgentId,
    flowId: flowRef.id,
    flowName,
    templateId,
    templateVersion:
      Number(template.version || 1),
    stepCount:
      Object.keys(steps).length,
  };
}
