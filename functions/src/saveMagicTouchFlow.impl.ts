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
  resolveMagicTouchFlowAccess,
} from "./shared/magicTouchFlowAccess";

import {
  validateMagicTouchFlow,
} from "./shared/magicTouchFlowValidation";

import type {
  MagicTouchFlowDocument,
  MagicTouchFlowStep,
} from "./shared/magicTouchFlowAdminTypes";




function removeUndefinedDeep(
  value: any
): any {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      (
        item
      ) =>
        removeUndefinedDeep(
          item
        )
    );
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    const result:
      Record<string, any> = {};

    for (
      const [
        key,
        nestedValue,
      ] of Object.entries(
        value
      )
    ) {
      if (
        nestedValue ===
        undefined
      ) {
        continue;
      }

      result[key] =
        removeUndefinedDeep(
          nestedValue
        );
    }

    return result;
  }

  return value;
}



function normalizeStep(
  stepId: string,
  rawStep: any
): MagicTouchFlowStep {
  return {
    id: stepId,
    type: safeString(rawStep?.type) as any,
    name: safeString(rawStep?.name) || "",
    nextStepId:
      safeString(rawStep?.nextStepId) ||
      null,
    config:
      rawStep?.config &&
      typeof rawStep.config === "object" &&
      !Array.isArray(rawStep.config)
        ? rawStep.config
        : {},
  };
}

export async function saveMagicTouchFlowImpl(
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

  const rawFlow =
    req.data?.flow;

  if (
    !rawFlow ||
    typeof rawFlow !== "object"
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing flow"
    );
  }

  const requestedFlowId =
    safeString(
      rawFlow.flowId
    );

  const flowRef =
    requestedFlowId
      ? (db as any).doc(
        `agents/${agentId}/magic_touch_flows/${requestedFlowId}`
      )
      : (db as any)
        .collection(
          `agents/${agentId}/magic_touch_flows`
        )
        .doc();

  const currentSnap =
    await flowRef.get();

  const currentData =
    currentSnap.exists
      ? currentSnap.data()
      : null;

  const rawSteps =
    rawFlow.steps &&
    typeof rawFlow.steps === "object" &&
    !Array.isArray(rawFlow.steps)
      ? rawFlow.steps
      : {};

  const normalizedSteps:
    Record<string, MagicTouchFlowStep> = {};

  for (
    const [
      rawStepId,
      rawStep,
    ] of Object.entries(
      rawSteps
    )
  ) {
    const stepId =
      safeString(
        rawStepId
      );

    if (!stepId) {
      continue;
    }

    normalizedSteps[stepId] =
      normalizeStep(
        stepId,
        rawStep
      );
  }

  const normalizedFlow:
    MagicTouchFlowDocument = {
      flowId:
        flowRef.id,

      agentId,

      name:
        safeString(
          rawFlow.name
        ),

      description:
        safeString(
          rawFlow.description
        ),

      status:
        safeString(
          rawFlow.status
        ) === "active"
          ? "active"
          : safeString(
            rawFlow.status
          ) === "inactive"
            ? "inactive"
            : "draft",

      version:
        currentSnap.exists
          ? Number(
            currentData?.version ||
            1
          ) + 1
          : 1,

      firstStepId:
        safeString(
          rawFlow.firstStepId
        ),

      trigger: {
        type:
          safeString(
            rawFlow.trigger?.type
          ),

        templateName:
          safeString(
            rawFlow.trigger
              ?.templateName
          ) ||
          undefined,

        quickReplyAction:
          safeString(
            rawFlow.trigger
              ?.quickReplyAction
          ) ||
          undefined,

        sourceSystem:
          safeString(
            rawFlow.trigger
              ?.sourceSystem
          ) ||
          undefined,

        campaignId:
          safeString(
            rawFlow.trigger
              ?.campaignId
          ) ||
          undefined,

        conditions:
          Array.isArray(
            rawFlow.trigger
              ?.conditions
          )
            ? rawFlow.trigger
              .conditions
              .map(
                (
                  condition: any
                ) => ({
                  field:
                    safeString(
                      condition?.field
                    ),

                  operator:
                    safeString(
                      condition?.operator
                    ),

                  value:
                    condition?.value,
                })
              )
            : [],
      },

      steps:
        normalizedSteps,
    };
const sanitizedFlow =
  removeUndefinedDeep(
    normalizedFlow
  ) as MagicTouchFlowDocument;


 const validation =
  validateMagicTouchFlow(
    sanitizedFlow
  );

 const requestedStatus =
  sanitizedFlow.status;

  if (
    requestedStatus ===
      "active" &&
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

 await flowRef.set({
  ...sanitizedFlow,

  createdBy:
    currentData?.createdBy ||
    authUid,

  createdAt:
    currentData?.createdAt ||
    nowTs(),

  updatedBy:
    authUid,

  updatedAt:
    nowTs(),

  activatedAt:
    requestedStatus ===
      "active"
      ? (
        currentData?.status ===
        "active"
          ? currentData
            ?.activatedAt ||
            nowTs()
          : nowTs()
      )
      : currentData
        ?.activatedAt ||
        null,

  deactivatedAt:
    requestedStatus ===
      "inactive"
      ? nowTs()
      : currentData
        ?.deactivatedAt ||
        null,
});

  return {
    ok: true,
    agentId,
    flowId: flowRef.id,
   version:
  sanitizedFlow.version,

status:
  sanitizedFlow.status,
    validation,
  };
}
