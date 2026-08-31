/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { HttpsError } from "firebase-functions/v2/https";

import { nowTs } from "./shared/admin";
import { safeString } from "./shared/magicTouchContacts";

import {
  resolveMagicTouchFlowTemplateAccess,
} from "./shared/magicTouchFlowTemplateAccess";

import {
  sanitizeFlowForTemplate,
} from "./shared/magicTouchFlowTemplateSanitizer";

import {
  MAGIC_TOUCH_FLOW_TEMPLATE_SCHEMA_VERSION,
} from "./shared/magicTouchFlowTemplateTypes";

export async function updateMagicTouchFlowTemplateImpl(
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

  const name =
    safeString(
      req.data?.name
    );

  const description =
    safeString(
      req.data?.description
    );

  const requestedStatus =
    safeString(
      req.data?.status
    );

  if (
    !templateId ||
    !name
  ) {
    throw new HttpsError(
      "invalid-argument",
      "templateId and name are required"
    );
  }

  const templateRef =
    (db as any).doc(
      `magic_touch_flow_templates/${templateId}`
    );

  const templateSnap =
    await templateRef.get();

  if (
    !templateSnap.exists
  ) {
    throw new HttpsError(
      "not-found",
      "Template not found"
    );
  }

  const existing =
    templateSnap.data() as any;

  if (
    existing?.status ===
    "archived"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Archived template cannot be edited"
    );
  }

  /*
   * בונים אובייקט Flow זמני רק כדי להשתמש
   * באותו sanitizer של פרסום Flow לספרייה.
   */
  const flowForSanitizer = {
    flowId:
      existing.sourceFlowId ||
      templateId,

    agentId:
      existing.sourceAgentId ||
      "",

    name,

    description,

    status:
      requestedStatus ===
      "published"
        ? "active"
        : "draft",

    trigger:
      req.data?.trigger ||
      {},

    firstStepId:
      safeString(
        req.data?.firstStepId
      ),

    steps:
      req.data?.steps ||
      {},

    variables:
      Array.isArray(
        req.data?.variables
      )
        ? req.data.variables
        : (
            Array.isArray(
              existing?.variables
            )
              ? existing.variables
              : []
          ),
  };

  const sanitized =
    sanitizeFlowForTemplate(
      flowForSanitizer
    );

  if (
    !sanitized.firstStepId ||
    Object.keys(
      sanitized.steps ||
      {}
    ).length ===
      0
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Template has no valid first step or steps"
    );
  }

  const version =
    Number(
      existing?.version ||
      1
    ) + 1;

  /*
   * אנחנו משמרים את metadata המקורי:
   * templateKey
   * sourceAgentId
   * sourceFlowId
   * createdBy / createdAt
   *
   * ומעדכנים רק את תוכן ה-Flow.
   */
  const updatedDocument = {
    ...existing,

    schemaVersion:
      MAGIC_TOUCH_FLOW_TEMPLATE_SCHEMA_VERSION,

    templateId,

    name,

    description,

    status:
      requestedStatus ===
      "published"
        ? "published"
        : "draft",

    version,

    trigger:
      sanitized.trigger,

    firstStepId:
      sanitized.firstStepId,

    steps:
      sanitized.steps,

    variables:
      Array.isArray(
        req.data?.variables
      )
        ? req.data.variables
        : (
            Array.isArray(
              existing?.variables
            )
              ? existing.variables
              : []
          ),

    requiredIntegrations:
      sanitized.requiredIntegrations,

    requiredPermissions:
      Array.isArray(
        existing?.requiredPermissions
      )
        ? existing.requiredPermissions
        : [
            "access_magic_touch",
          ],

    updatedBy:
      authUid,

    updatedAt:
      nowTs(),
  };

  await templateRef.set(
    updatedDocument
  );

  return {
    ok:
      true,

    templateId,

    version,

    status:
      updatedDocument.status,

    requiredIntegrations:
      updatedDocument.requiredIntegrations,
  };
}