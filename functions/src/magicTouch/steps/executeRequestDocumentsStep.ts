/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {HttpsError} from "firebase-functions/v2/https";

import type {
  MagicTouchExecutionContext,
  MagicTouchFlowStep,
} from "../../shared/magicTouchDispatcherTypes";

import type {ExecuteStepResult} from "../executeMagicTouchFlowStep";
import {resolveMagicTouchStringTemplate} from "../../shared/magicTouchAutomationValueResolver";
import {createMagicTouchDocumentRequest} from "../../shared/magicTouchDocumentRequestService";

import {
  nowTs,
} from "../../shared/admin";

function s(value: any): string {
  return String(value ?? "").trim();
}

export async function executeRequestDocumentsStep({context, step}: {
  context: MagicTouchExecutionContext;
  step: MagicTouchFlowStep;
}): Promise<ExecuteStepResult> {
  const contactId = s(context.run.contactId || context.event?.contactId);
  const conversationId = s(context.run.conversationId || context.event?.conversationId);

  if (!contactId) {
    throw new HttpsError("failed-precondition", "Flow run has no contactId");
  }
  if (!conversationId) {
    throw new HttpsError("failed-precondition", "Flow run has no conversationId");
  }

  const rawMessage = resolveMagicTouchStringTemplate(
    s(step.config?.message),
    context
  );

  const result = await createMagicTouchDocumentRequest({
    agentId: context.agentId,
    contactId,
    conversationId,
    flowId: context.flow.flowId,
    flowRunId: context.run.runId,
    flowStepId: step.id,
    resumeNextStepId: step.nextStepId || null,
    message: rawMessage,
  });

 return {
  status: "waiting",

  nextStepId:
    step.nextStepId ||
    null,

  waitingUntil:
    null,

  waitingFor: {
    type:
      "document",

    stepId:
      step.id,

    resumeStepId:
      step.nextStepId ||
      null,

    startedAt:
      nowTs(),

    context: {
      requestId:
        result.requestId,

      documentSet:
        s(
          step.config?.documentSet
        ) ||
        "identity_card_both_sides",

      uploadUrl:
        result.uploadUrl,

      conversationId,

      contactId,
    },
  },

  output: {
    requestId:
      result.requestId,

    uploadUrl:
      result.uploadUrl,

    status:
      "requested",

    waitingFor:
      s(
        step.config?.documentSet
      ) ||
      "identity_card_both_sides",
  },
};
}
