/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import type {
  MagicTouchExecutionContext,
  MagicTouchFlowStep,
} from "../../shared/magicTouchDispatcherTypes";

import type {
  ExecuteStepResult,
} from "../executeMagicTouchFlowStep";

import {
  addMagicTouchTimelineEvent,
} from "../../shared/magicTouchTimelineService";

import type {
  MagicTouchTimelineDirection,
  MagicTouchTimelineStatus,
} from "../../shared/magicTouchTimelineService";

import {
  resolveMagicTouchAutomationValue,
  resolveMagicTouchStringTemplate,
} from "../../shared/magicTouchAutomationValueResolver";

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

function normalizeDirection(
  value: any
): MagicTouchTimelineDirection | undefined {
  const normalized =
    s(value);

  if (
    normalized ===
      "inbound" ||
    normalized ===
      "outbound"
  ) {
    return normalized;
  }

  return undefined;
}

function normalizeStatus(
  value: any
): MagicTouchTimelineStatus {
  const normalized =
    s(value);

  if (
    normalized ===
      "pending" ||
    normalized ===
      "completed" ||
    normalized ===
      "failed" ||
    normalized ===
      "cancelled"
  ) {
    return normalized;
  }

  return "completed";
}

export async function executeAddTimelineEventStep({
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

  const title =
    resolveMagicTouchStringTemplate(
      s(
        step.config?.title
      ),
      context
    );

  if (!title) {
    throw new HttpsError(
      "invalid-argument",
      "Timeline step is missing title"
    );
  }

  const description =
    resolveMagicTouchStringTemplate(
      s(
        step.config?.description
      ),
      context
    );

  const metadata =
    resolveMagicTouchAutomationValue(
      step.config?.metadata ||
        {},
      context
    );

  const direction =
    normalizeDirection(
      step.config?.direction
    );

  const status =
    normalizeStatus(
      step.config?.status
    );

  await addMagicTouchTimelineEvent({
    agentId:
      context.agentId,

    contactId,

    type:
      s(
        step.config?.eventType
      ) ||
      "magic_touch_flow_action",

    channel:
      s(
        step.config?.channel
      ) ||
      "automation",

    title,

    description,

    direction,

    status,

    createdBy:
      "magic_touch_automation",

    sourceSystem:
      "magic_touch",

    sourceRecordId:
      context.run.runId,

    metadata: {
      ...(
        metadata &&
        typeof metadata ===
          "object" &&
        !Array.isArray(
          metadata
        )
          ? metadata
          : {}
      ),

      flowRunId:
        context.run.runId,

      flowId:
        context.flow.flowId,

      eventId:
        context.run.eventId,

      stepId:
        step.id,
    },
  });

  return {
    status:
      step.nextStepId
        ? "continue"
        : "completed",

    nextStepId:
      step.nextStepId ||
      null,

    output: {
      contactId,
      title,
      description,
      direction:
        direction ||
        null,
      status,
    },
  };
}