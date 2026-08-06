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

import {
  sanitizeFlowForTemplate,
} from "./shared/magicTouchFlowTemplateSanitizer";

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

export async function importMagicTouchFlowTemplateImpl(
  req: any
): Promise<object> {
  const {
    db,
    authUid,
  } =
    await resolveMagicTouchFlowTemplateAccess(
      req
    );

  const payload =
    req.data?.payload;

  const importedTemplate =
    payload?.template &&
    typeof payload.template === "object"
      ? payload.template
      : payload;

  if (
    !importedTemplate ||
    typeof importedTemplate !== "object" ||
    Array.isArray(importedTemplate)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Invalid template JSON"
    );
  }

  const schemaVersion =
    Number(
      payload?.schemaVersion ||
      importedTemplate.schemaVersion ||
      MAGIC_TOUCH_FLOW_TEMPLATE_SCHEMA_VERSION
    );

  if (
    schemaVersion !==
    MAGIC_TOUCH_FLOW_TEMPLATE_SCHEMA_VERSION
  ) {
    throw new HttpsError(
      "failed-precondition",
      `Unsupported schemaVersion: ${schemaVersion}`
    );
  }

  const templateKey =
    normalizeTemplateKey(
      safeString(
        importedTemplate.templateKey
      )
    );

  const name =
    safeString(
      importedTemplate.name
    );

  if (!templateKey || !name) {
    throw new HttpsError(
      "invalid-argument",
      "templateKey and name are required"
    );
  }

  const sanitized =
    sanitizeFlowForTemplate({
      trigger:
        importedTemplate.trigger,
      firstStepId:
        importedTemplate.firstStepId,
      steps:
        importedTemplate.steps,
    });

  if (
    !sanitized.firstStepId ||
    Object.keys(sanitized.steps).length === 0 ||
    !sanitized.steps[sanitized.firstStepId]
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The imported template has no valid first step or steps"
    );
  }

  const collection =
    (db as any)
      .collection(
        "magic_touch_flow_templates"
      );

  const existingQuery =
    await collection
      .where(
        "templateKey",
        "==",
        templateKey
      )
      .limit(1)
      .get();

  const replaceExisting =
    req.data?.replaceExisting === true;

  let templateRef: any;
  let existing: any = null;

  if (!existingQuery.empty) {
    if (!replaceExisting) {
      throw new HttpsError(
        "already-exists",
        "A template with this templateKey already exists"
      );
    }

    const existingDoc =
      existingQuery.docs[0];

    templateRef =
      existingDoc.ref;

    existing =
      existingDoc.data();
  } else {
    templateRef =
      collection.doc();
  }

  const version =
    existing
      ? Number(existing.version || 1) + 1
      : Number(importedTemplate.version || 1);

  const requestedStatus =
    safeString(
      importedTemplate.status
    );

  const document:
    MagicTouchFlowTemplateDocument = {
      schemaVersion:
        MAGIC_TOUCH_FLOW_TEMPLATE_SCHEMA_VERSION,
      templateId:
        templateRef.id,
      templateKey,
      name,
      description:
        safeString(
          importedTemplate.description
        ),
      category:
        safeString(
          importedTemplate.category
        ) || "general",
      status:
        requestedStatus === "published"
          ? "published"
          : "draft",
      version,

      sourceAgentId: "",
      sourceFlowId: "",
      sourceFlowVersion: 0,

      trigger:
        sanitized.trigger,
      firstStepId:
        sanitized.firstStepId,
      steps:
        sanitized.steps,

      variables:
        Array.isArray(
          importedTemplate.variables
        )
          ? importedTemplate.variables
          : [],
      requiredIntegrations:
        sanitized.requiredIntegrations,
      requiredPermissions:
        Array.isArray(
          importedTemplate.requiredPermissions
        )
          ? importedTemplate.requiredPermissions
          : ["access_magic_touch"],

      createdBy:
        existing?.createdBy || authUid,
      updatedBy:
        authUid,
      createdAt:
        existing?.createdAt || nowTs(),
      updatedAt:
        nowTs(),
    };

  await templateRef.set(document);

  return {
    ok: true,
    templateId:
      templateRef.id,
    templateKey,
    version,
    replaced:
      Boolean(existing),
    stepCount:
      Object.keys(sanitized.steps).length,
  };
}
