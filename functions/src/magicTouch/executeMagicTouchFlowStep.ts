/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  MagicTouchExecutionContext,
  MagicTouchFlowStep,
} from "../shared/magicTouchDispatcherTypes";

import {
  sendWhatsAppConversationText,
} from "../shared/sendWhatsAppConversationText";

import {
  executeUpdateContactStep,
} from "./steps/executeUpdateContactStep";

import {
  executeAddTimelineEventStep,
} from "./steps/executeAddTimelineEventStep";

import {
  executeSyncSurenseActivityStep,
} from "./steps/executeSyncSurenseActivityStep";

import {
  executeCreateSurensePowerOfAttorneyStep,
} from "./steps/executeCreateSurensePowerOfAttorneyStep";

import {
  executeRequestDocumentsStep,
} from "./steps/executeRequestDocumentsStep";

import {
  getMagicTouchContextValue,
  resolveMagicTouchStringTemplate,
} from "../shared/magicTouchAutomationValueResolver";

export interface ExecuteStepResult {
  status:
    | "continue"
    | "waiting"
    | "completed";

  nextStepId?:
    string |
    null;

  waitingUntil?:
    any;

  output?:
    Record<string, any> |
    null;
}

function s(value: any): string {
  return String(
    value ?? ""
  ).trim();
}

function eq(
  left: any,
  right: any
): boolean {
  if (
    typeof left === "string" ||
    typeof right === "string"
  ) {
    return (
      s(left).toLowerCase() ===
      s(right).toLowerCase()
    );
  }

  return left === right;
}

export async function executeMagicTouchFlowStep({
  context,
  step,
}: {
  context:
    MagicTouchExecutionContext;

  step:
    MagicTouchFlowStep;
}): Promise<ExecuteStepResult> {
  switch (
    step.type
  ) {
    case "condition": {
      const field =
        s(
          step.config?.field
        );

      const operator =
        s(
          step.config?.operator
        );

      const expected =
        step.config?.value;

      const actual =
        getMagicTouchContextValue(
          context,
          field
        );

      let matched =
        false;

      if (
        operator ===
        "equals"
      ) {
        matched =
          eq(
            actual,
            expected
          );
      } else if (
        operator ===
        "not_equals"
      ) {
        matched =
          !eq(
            actual,
            expected
          );
      } else if (
        operator ===
        "exists"
      ) {
        matched =
          actual != null &&
          s(
            actual
          ) !==
            "";
      } else if (
        operator ===
        "not_exists"
      ) {
        matched =
          actual == null ||
          s(
            actual
          ) ===
            "";
      } else {
        throw new Error(
          `Unsupported condition operator: ${operator}`
        );
      }

      const nextStepId =
        matched
          ? s(
            step.config
              ?.trueStepId
          )
          : s(
            step.config
              ?.falseStepId
          );

      return {
        status:
          nextStepId
            ? "continue"
            : "completed",

        nextStepId:
          nextStepId ||
          null,

        output: {
          field,

          operator,

          expected:
            expected ??
            null,

          actual:
            actual ??
            null,

          matched,
        },
      };
    }

    case "send_whatsapp": {
      const message =
        resolveMagicTouchStringTemplate(
          s(
            step.config
              ?.message
          ),
          context
        );

      const conversationId =
        s(
          context
            .run
            .conversationId
        );

      if (
        !message
      ) {
        throw new Error(
          "WhatsApp text step is missing message"
        );
      }

      if (
        !conversationId
      ) {
        throw new Error(
          "Cannot send WhatsApp without conversationId"
        );
      }

      const result =
        await sendWhatsAppConversationText({
          agentId:
            context.agentId,

          conversationId,

          text:
            message,

          sentBy:
            "magic_touch_automation",

          sentByName:
            "MagicTouch",

          source:
            "magic_touch_automation",

          flowRunId:
            context.run.runId,

          flowId:
            context.flow.flowId,

          eventId:
            context.run.eventId,
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
          sent:
            true,

          message,

          ...result,
        },
      };
    }

    case "request_documents":
      return executeRequestDocumentsStep({
        context,
        step,
      });

    case "update_contact":
      return executeUpdateContactStep({
        context,
        step,
      });

    case "add_timeline_event":
      return executeAddTimelineEventStep({
        context,
        step,
      });

    case "sync_surense_activity":
      return executeSyncSurenseActivityStep({
        context,
        step,
      });

    case "create_surense_power_of_attorney":
      return executeCreateSurensePowerOfAttorneyStep({
        context,
        step,
      });

    case "end":
      return {
        status:
          "completed",

        nextStepId:
          null,

        output: {
          message:
            step.config
              ?.message ||
            null,
        },
      };

    default:
      throw new Error(
        `Unsupported MagicTouch step type: ${step.type}`
      );
  }
}
