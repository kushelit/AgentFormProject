/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  MagicTouchExecutionContext,
  MagicTouchFlowStep,
  MagicTouchWaitingFor,
  MagicTouchResponseOption,
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

import {
  nowTs,
} from "../shared/admin";

import {
  updateMagicTouchContactFields,
} from "../shared/magicTouchContactAutomationService";

import {
  getGoogleCalendarBookingUrl,
} from "../shared/googleCalendar";



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

    waitingFor?:
  MagicTouchWaitingFor |
  null;
}

function s(
  value: any
): string {
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

function buildBookingMessage(
  input: {
    messageBefore: string;
    bookingUrl: string;
    messageAfter: string;
  }
): string {
  const parts =
    [
      s(
        input.messageBefore
      ),

      s(
        input.bookingUrl
      ),

      s(
        input.messageAfter
      ),
    ]
      .filter(
        Boolean
      );

  return parts.join(
    "\n\n"
  );
}

function normalizeResolutionMode(
  value: any
):
  | "quick_reply_only"
  | "ai"
  | "ai_with_human_fallback" {
  const mode =
    s(value);

  if (
    mode === "ai" ||
    mode === "ai_with_human_fallback"
  ) {
    return mode;
  }

  return "quick_reply_only";
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

  case "send_booking_link": {
  const conversationId =
    s(
      context
        .run
        .conversationId
    );

  if (
    !conversationId
  ) {
    throw new Error(
      "Cannot send booking link without conversationId"
    );
  }

  const contactId =
    s(
      context
        .run
        .contactId ||
      context
        .event
        ?.contactId
    );

  if (
    !contactId
  ) {
    throw new Error(
      "Cannot send booking link without contactId"
    );
  }

  /*
   * כרגע send_booking_link הוא Microsoft Bookings.
   * בהמשך נרחיב אותו לבחירת provider.
   */
  const appointmentProvider =
    "microsoft";

  const bookingUrl =
    s(
      context
        .agent
        ?.booking
        ?.defaultServiceUrl
    );

  if (
    !bookingUrl
  ) {
    throw new Error(
      "Microsoft Bookings default service URL is missing for this agent"
    );
  }

  const messageBefore =
    resolveMagicTouchStringTemplate(
      s(
        step.config
          ?.messageBefore
      ),
      context
    );

  const messageAfter =
    resolveMagicTouchStringTemplate(
      s(
        step.config
          ?.messageAfter
      ),
      context
    );

  const message =
    buildBookingMessage({
      messageBefore,
      bookingUrl,
      messageAfter,
    });

  /*
   * קודם שולחים בפועל.
   *
   * רק אם WhatsApp הצליח,
   * נסמן את הלקוח כממתין לקביעת פגישה.
   */
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

  const timestamp =
    nowTs();

  /*
   * זה חלק מהותי מהפעולה send_booking_link.
   *
   * לא צריך Step נוסף של Update Contact
   * כדי לומר שהמערכת מחכה עכשיו לפגישה.
   */
  await updateMagicTouchContactFields({
    agentId:
      context.agentId,

    contactId,

    updates: {
      appointmentStatus:
        "link_sent",

      appointmentProvider,

      "engagement.reengagement.bookingStatus":
        "link_sent",

      "engagement.reengagement.bookingLink":
        bookingUrl,

      "engagement.reengagement.bookingLinkSentAt":
        timestamp,

      "engagement.reengagement.updatedAt":
        timestamp,
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
      sent:
        true,

      appointmentProvider,

      bookingUrl,

      bookingStatus:
        "link_sent",

      messageBefore:
        messageBefore ||
        null,

      messageAfter:
        messageAfter ||
        null,

      message,

      ...result,
    },
  };
}

case "send_google_booking_link": {
  const conversationId =
    s(
      context
        .run
        .conversationId
    );

  if (
    !conversationId
  ) {
    throw new Error(
      "Cannot send Google booking link without conversationId"
    );
  }

  const contactId =
    s(
      context
        .run
        .contactId ||
      context
        .event
        ?.contactId
    );

  if (
    !contactId
  ) {
    throw new Error(
      "Cannot send Google booking link without contactId"
    );
  }

  const appointmentProvider =
    "google";

  const bookingUrl =
    await getGoogleCalendarBookingUrl(
      context.agentId
    );

  const messageBefore =
    resolveMagicTouchStringTemplate(
      s(
        step.config
          ?.messageBefore
      ),
      context
    );

  const messageAfter =
    resolveMagicTouchStringTemplate(
      s(
        step.config
          ?.messageAfter
      ),
      context
    );

  const message =
    buildBookingMessage({
      messageBefore,
      bookingUrl,
      messageAfter,
    });

  /*
   * קודם שולחים את ההודעה.
   * רק לאחר שליחה מוצלחת מעדכנים
   * שהלקוח ממתין לפגישה דרך Google.
   */
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

  const timestamp =
    nowTs();

  await updateMagicTouchContactFields({
    agentId:
      context.agentId,

    contactId,

    updates: {
      appointmentStatus:
        "link_sent",

      appointmentProvider:
        "google",

      "engagement.reengagement.bookingStatus":
        "link_sent",

      "engagement.reengagement.bookingLink":
        bookingUrl,

      "engagement.reengagement.bookingLinkSentAt":
        timestamp,

      "engagement.reengagement.updatedAt":
        timestamp,
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
      sent:
        true,

      appointmentProvider,

      bookingUrl,

      bookingStatus:
        "link_sent",

      messageBefore:
        messageBefore ||
        null,

      messageAfter:
        messageAfter ||
        null,

      message,

      ...result,
    },
  };
}
case "wait_for_customer_response": {
  const rawExpectedActions =
    step.config?.expectedActions;

  const expectedActions =
    Array.isArray(
      rawExpectedActions
    )
      ? rawExpectedActions
          .map(
            (value: any) =>
              s(value)
          )
          .filter(Boolean)
      : [];

  /*
   * responseOptions הן הגדרות דינמיות
   * של ה-Flow הספציפי.
   *
   * הן נותנות ל-Resolver / AI משמעות
   * עסקית לכל Action אפשרי.
   */
  const rawResponseOptions =
    step.config?.responseOptions;

 const responseOptions:
  MagicTouchResponseOption[] =
  Array.isArray(
    rawResponseOptions
  )
    ? rawResponseOptions.reduce(
        (
          result:
            MagicTouchResponseOption[],
          option: any
        ) => {
          const action =
            s(
              option?.action
            );

          if (
            !action
          ) {
            return result;
          }

          const label =
            s(
              option?.label
            );

          const description =
            s(
              option?.description
            );

          const responseOption:
            MagicTouchResponseOption = {
              action,
          };

          if (
            label
          ) {
            responseOption.label =
              label;
          }

          if (
            description
          ) {
            responseOption.description =
              description;
          }

          result.push(
            responseOption
          );

          return result;
        },
        []
      )
    : [];
  /*
   * promptContext הוא ההקשר שה-Resolver
   * יצטרך כדי להבין את תשובת הלקוח.
   *
   * כרגע אנחנו שומרים את השאלה שה-Flow
   * שאל. בהמשך ניתן להרחיב את ההקשר
   * בלי לשנות את מנוע ה-Flow.
   */
  const question =
    resolveMagicTouchStringTemplate(
      s(
        step.config
          ?.promptContext
          ?.question
      ),
      context
    );

  const resolution =
  step.config?.resolution &&
  typeof step.config.resolution === "object"
    ? {
        mode:
          normalizeResolutionMode(
            step.config.resolution.mode
          ),

        minConfidence:
          Number.isFinite(
            Number(
              step.config.resolution.minConfidence
            )
          )
            ? Number(
                step.config.resolution.minConfidence
              )
            : 0.8,
      }
    : {
        mode:
          "quick_reply_only" as const,

        minConfidence:
          0.8,
      };

  return {
    status:
      "waiting",

    nextStepId:
      step.nextStepId ||
      null,

    waitingFor: {
      type:
        "customer_response",

      stepId:
        step.id,

      resumeStepId:
        step.nextStepId ||
        null,

      expectedActions,

      responseOptions,

      resolution,

      promptContext: {
        question:
          question ||
          null,
      },

      startedAt:
        nowTs(),

      context: {
        conversationId:
          context.run
            .conversationId ||
          null,

        contactId:
          context.run
            .contactId ||
          context.event
            ?.contactId ||
          null,
      },
    },

    output: {
      waiting:
        true,

      waitingFor:
        "customer_response",

      expectedActions,

      responseOptions,
      resolution,

      promptContext: {
        question:
          question ||
          null,
      },
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