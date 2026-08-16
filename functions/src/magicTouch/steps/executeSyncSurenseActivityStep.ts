/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  Timestamp,
} from "firebase-admin/firestore";

import {
  adminDb,
} from "../../shared/admin";

import type {
  MagicTouchExecutionContext,
  MagicTouchFlowStep,
} from "../../shared/magicTouchDispatcherTypes";

import type {
  ExecuteStepResult,
} from "../executeMagicTouchFlowStep";

import {
  resolveMagicTouchStringTemplate,
} from "../../shared/magicTouchAutomationValueResolver";

import {
  sendSurenseActivity,
} from "../../shared/surenseActivityService";


import {
  addMagicTouchTimelineEvent,
} from "../../shared/magicTouchTimelineService";


function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

export async function executeSyncSurenseActivityStep({
  context,
  step,
}: {
  context:
    MagicTouchExecutionContext;

  step:
    MagicTouchFlowStep;
}): Promise<ExecuteStepResult> {
  const contactId =
    s(
      context.run.contactId ||
      context.event?.contactId
    );

  if (!contactId) {
    throw new HttpsError(
      "failed-precondition",
      "Flow run has no contactId"
    );
  }

  const db =
    adminDb();

  const contactRef =
    (db as any).doc(
      `agents/${context.agentId}/magic_touch_contacts/${contactId}`
    );

  const contactSnap =
    await contactRef.get();

  if (!contactSnap.exists) {
    throw new HttpsError(
      "not-found",
      "MagicTouch contact not found"
    );
  }

  const contact =
    contactSnap.data() as any;

  if (
    s(
      contact?.sourceSystem
    ) !== "surense"
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Contact is not linked to Surense"
    );
  }

  /*
   * תומך גם במבנה sourceData השטוח
   * וגם במבנה sourceData.surense.
   */
  const surenseId =
    s(
      contact?.sourceRecordId ||
      contact?.sourceData
        ?.customerId ||
      contact?.sourceData
        ?.surense
        ?.customerId
    );

  const surenseWorkflowId =
    s(
      contact?.sourceData
        ?.workflowId ||
      contact?.sourceData
        ?.surense
        ?.workflowId
    ) ||
    null;

  if (!surenseId) {
    throw new HttpsError(
      "failed-precondition",
      "Contact is missing Surense sourceRecordId"
    );
  }

  const activityType =
    s(
      step.config?.activityType
    );

  const note =
    resolveMagicTouchStringTemplate(
      s(
        step.config?.note
      ),
      {
        ...context,
        contact,
      } as any
    );

  if (
    !activityType ||
    !note
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Surense step is missing activityType or note"
    );
  }

  const workflowStatus =
    s(
      step.config?.workflowStatus
    ) ||
    null;

  const syncStatusPath =
    s(
      step.config?.syncStatusPath
    ) ||
    "engagement.reengagement.surenseSyncStatus";

  const syncedAtPath =
    s(
      step.config?.syncedAtPath
    ) ||
    "engagement.reengagement.surenseSyncedAt";

  try {
    const result =
      await sendSurenseActivity({
        agentId:
          context.agentId,

        surenseId,

        fullName:
          s(
            contact?.fullName
          ),

        surenseWorkflowId,

        workflowStatus,

        activityType,

        note,
      });

    const timestamp =
      Timestamp.now();

    await contactRef.update({
      [syncStatusPath]:
        "completed",

      [syncedAtPath]:
        timestamp,

      "engagement.reengagement.surenseSyncError":
        null,

      updatedAt:
        timestamp,
    });

    try {
  await addMagicTouchTimelineEvent({
    agentId:
      context.agentId,

    contactId,

    type:
      "surense_workflow_closed",

    channel:
      "surense",

    title:
      "תהליך Surense נסגר",

    description:
      note,

    direction:
      "outbound",

    status:
      "completed",

    createdBy:
      "magic_touch_automation",

    sourceSystem:
      "surense",

    sourceRecordId:
      surenseWorkflowId ||
      surenseId,

    metadata: {
      flowRunId:
        context.run.runId,

      flowId:
        context.flow.flowId,

      eventId:
        context.run.eventId,

      stepId:
        step.id,

      surenseCustomerId:
        surenseId,

      surenseWorkflowId,

      activityType,

      workflowStatus,
    },
  });
} catch (timelineError: any) {
  console.error(
    "[executeSyncSurenseActivityStep] Timeline event failed",
    {
      agentId:
        context.agentId,

      contactId,

      surenseId,

      surenseWorkflowId,

      error:
        timelineError?.message ||
        String(timelineError),
    }
  );
}
    return {
      status:
        step.nextStepId
          ? "continue"
          : "completed",

      nextStepId:
        step.nextStepId ||
        null,

      output: {
        synced:
          true,

        contactId,

        surenseId,

        surenseWorkflowId,

        httpStatus:
          result.httpStatus,

        activityType:
          result.activityType,

        workflowStatus:
          result.workflowStatus,
      },
    };
  } catch (
    error: any
  ) {
    const errorMessage =
      error?.message ||
      String(
        error
      );

    const timestamp =
      Timestamp.now();

    /*
     * שומרים באיש הקשר שהסנכרון נכשל,
     * אך זורקים שוב את השגיאה כדי שה-Run יסומן failed.
     */
    await contactRef.update({
      [syncStatusPath]:
        "failed",

      "engagement.reengagement.surenseSyncError":
        errorMessage,

      "engagement.reengagement.surenseSyncFailedAt":
        timestamp,

      updatedAt:
        timestamp,
    });

    throw error;
  }
}