/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  Timestamp,
} from "firebase-admin/firestore";

import {
  logger,
} from "firebase-functions";

import {
  adminDb,
  nowTs,
} from "./shared/admin";

import type {
  MagicTouchExecutionContext,
  MagicTouchFlowDefinitionV2,
  MagicTouchFlowRun,
} from "./shared/magicTouchDispatcherTypes";

import {
  executeMagicTouchFlowStep,
} from "./magicTouch/executeMagicTouchFlowStep";

const MAX_IMMEDIATE_STEPS =
  25;

function s(
  value: any
): string {
  return String(
    value ?? ""
  ).trim();
}

function createHumanAttentionEventId({
  runId,
  stepId,
}: {
  runId: string;
  stepId: string;
}): string {
  return [
    "flow_human_attention",
    runId,
    stepId,
  ]
    .filter(
      Boolean
    )
    .join(
      "_"
    );
}

export async function dispatchMagicTouchFlowRunImpl({
  agentId,
  runId,
}: {
  agentId: string;
  runId: string;
}): Promise<object> {
  const normalizedAgentId =
    s(
      agentId
    );

  const normalizedRunId =
    s(
      runId
    );

  if (
    !normalizedAgentId ||
    !normalizedRunId
  ) {
    throw new Error(
      "Missing agentId or runId"
    );
  }

  const db =
    adminDb();

  const runRef =
    (db as any).doc(
      `agents/${normalizedAgentId}/magic_touch_flow_runs/${normalizedRunId}`
    );

  const claimedRun =
    await (db as any)
      .runTransaction(
        async (
          transaction: any
        ) => {
          const runSnap =
            await transaction.get(
              runRef
            );

          if (
            !runSnap.exists
          ) {
            return null;
          }

          const runData =
            runSnap.data();

          if (
            s(
              runData?.status
            ) !==
            "queued"
          ) {
            return null;
          }

          transaction.set(
            runRef,
            {
              status:
                "processing",

              processingStartedAt:
                nowTs(),

              attempts:
                Number(
                  runData?.attempts ||
                  0
                ) + 1,

              updatedAt:
                nowTs(),
            },
            {
              merge:
                true,
            }
          );

          return {
            runId:
              runSnap.id,

            ...runData,
          } as MagicTouchFlowRun;
        }
      );

  if (
    !claimedRun
  ) {
    return {
      ok:
        true,

      ignored:
        true,

      reason:
        "run_not_queued_or_missing",
    };
  }

  try {
    const flowRef =
      (db as any).doc(
        `agents/${normalizedAgentId}/magic_touch_flows/${claimedRun.flowId}`
      );

    const flowSnap =
      await flowRef.get();

    if (
      !flowSnap.exists
    ) {
      throw new Error(
        `Flow not found: ${claimedRun.flowId}`
      );
    }

    const flow = {
      flowId:
        flowSnap.id,

      ...flowSnap.data(),
    } as MagicTouchFlowDefinitionV2;

    if (
      flow.status !==
      "active"
    ) {
      throw new Error(
        `Flow is not active: ${flow.status}`
      );
    }

    if (
      !flow.steps ||
      typeof flow.steps !==
        "object"
    ) {
      throw new Error(
        "Flow steps map is missing"
      );
    }

    const executionEventId =
      s(
        claimedRun.executionEventId ||
        claimedRun.eventId
      );

    const eventRef =
      (db as any).doc(
        `agents/${normalizedAgentId}/magic_touch_events/${executionEventId}`
      );

    const microsoftBookingsConfigRef =
      (db as any).doc(
        `agents/${normalizedAgentId}/config/microsoftBookings`
      );

    const [
      eventSnap,
      microsoftBookingsConfigSnap,
    ] =
      await Promise.all([
        eventRef.get(),
        microsoftBookingsConfigRef.get(),
      ]);

    if (
      !eventSnap.exists
    ) {
      throw new Error(
        `Event not found: ${executionEventId}`
      );
    }

    const microsoftBookingsConfig =
      microsoftBookingsConfigSnap.exists
        ? microsoftBookingsConfigSnap.data()
        : {};

    const context:
      MagicTouchExecutionContext = {
        agentId:
          normalizedAgentId,

        run:
          claimedRun,

        flow,

        event: {
          eventId:
            eventSnap.id,

          ...eventSnap.data(),
        },

        agent: {
          booking: {
            defaultServiceUrl:
              s(
                microsoftBookingsConfig
                  ?.defaultBookingServiceUrl
              ) ||
              null,
          },
        },
      };

    let currentStepId =
      s(
        claimedRun.currentStepId ||
        flow.firstStepId
      );

    if (
      !currentStepId
    ) {
      throw new Error(
        "Run has no currentStepId and flow has no firstStepId"
      );
    }

    const stepHistory:
      Record<
        string,
        any
      >[] = [];

    for (
      let stepIndex = 0;
      stepIndex <
        MAX_IMMEDIATE_STEPS;
      stepIndex++
    ) {
      const step =
        flow.steps[
          currentStepId
        ];

      if (
        !step
      ) {
        throw new Error(
          `Step not found: ${currentStepId}`
        );
      }

      const startedAt =
        Timestamp.now();

      const result =
        await executeMagicTouchFlowStep({
          context,
          step,
        });

      const completedAt =
        Timestamp.now();

      stepHistory.push({
        stepId:
          currentStepId,

        stepType:
          step.type,

        stepName:
          step.name ||
          null,

        status:
          result.status,

        output:
          result.output ||
          null,

        startedAt,

        completedAt,
      });

      await runRef.set(
        {
          currentStepId,

          lastStepId:
            currentStepId,

          lastStepResult:
            result.output ||
            null,

          stepHistory,

          updatedAt:
            nowTs(),
        },
        {
          merge:
            true,
        }
      );

      if (
        result.status ===
        "waiting"
      ) {
        const waitingFor =
          result.waitingFor ||
          null;

        const waitingForType =
          s(
            waitingFor
              ?.type
          );

        const timestamp =
          nowTs();

        const batch =
          (db as any).batch();

        batch.set(
          runRef,
          {
            status:
              "waiting",

            waitingUntil:
              result.waitingUntil ||
              null,

            waitingFor,

            updatedAt:
              timestamp,
          },
          {
            merge:
              true,
          }
        );

       /*
 * Human Attention עסקי.
 *
 * לדוגמה:
 * החיפוש הפנימי ב-Surense במהלך
 * יצירת ייפוי הכוח החזיר
 * 0 התאמות או יותר מהתאמה אחת.
 *
 * אנחנו לא מסמנים את ה-Run כ-failed.
 * הוא נשאר waiting עד לטיפול אנושי.
 *
 * בנוסף יוצרים MagicTouch Event
 * שה-syncMagicTouchHumanAttention
 * הקיים יקלוט ויהפוך להתראה
 * ב-whatsapp_conversations.
 */

        if (
          waitingForType ===
          "human_attention"
        ) {
          const conversationId =
            s(
              claimedRun
                .conversationId ||
              context.event
                ?.conversationId
            );

          const contactId =
            s(
              claimedRun
                .contactId ||
              context.event
                ?.contactId
            );

          const waitingContext =
            waitingFor
              ?.context &&
            typeof waitingFor
              .context ===
              "object"
              ? waitingFor
                  .context
              : {};

          const reason =
            s(
              waitingContext
                ?.reason ||
              result.output
                ?.reason
            ) ||
            "flow_requires_human_attention";

          const humanAttentionEventId =
            createHumanAttentionEventId({
              runId:
                normalizedRunId,

              stepId:
                currentStepId,
            });

          const humanAttentionEventRef =
            (db as any).doc(
              `agents/${normalizedAgentId}/magic_touch_events/${humanAttentionEventId}`
            );

          batch.set(
            humanAttentionEventRef,
            {
              eventId:
                humanAttentionEventId,

              agentId:
                normalizedAgentId,

              contactId:
                contactId ||
                null,

              conversationId:
                conversationId ||
                null,

              channel:
                "system",

              triggerType:
                "flow_human_attention_required",

              status:
                "dispatched",

              occurredAt:
                timestamp,

              createdAt:
                timestamp,

              updatedAt:
                timestamp,

              processedAt:
                timestamp,

              dispatchedAt:
                timestamp,

              messageText:
                null,

              messageType:
                "system",

              quickReplyAction:
                null,

              flowRunIds: [
                normalizedRunId,
              ],

              routing: {
                contactState:
                  contactId
                    ? "known"
                    : "unknown",

                flowState:
                  "active",

                messageDisposition:
                  "system",

                handling:
                  "human_attention",

                activeRunId:
                  normalizedRunId,

                activeFlowId:
                  flow.flowId,

                previousRunId:
                  null,

                resolvedAction:
                  null,

                reason,

                resolutionSource:
                  "flow",
              },

              humanAttentionContext:
                waitingContext,
            },
            {
              merge:
                true,
            }
          );

          logger.info(
            "[dispatchMagicTouchFlowRun] Human attention requested",
            {
              agentId:
                normalizedAgentId,

              runId:
                normalizedRunId,

              flowId:
                flow.flowId,

              stepId:
                currentStepId,

              conversationId:
                conversationId ||
                null,

              contactId:
                contactId ||
                null,

              reason,

              eventId:
                humanAttentionEventId,
            }
          );
        }

        await batch.commit();

        return {
          ok:
            true,

          status:
            "waiting",

          runId:
            normalizedRunId,

          currentStepId,

          waitingFor,
        };
      }

      const nextStepId =
        s(
          result.nextStepId
        );

      if (
        result.status ===
          "completed" ||
        !nextStepId
      ) {
        await runRef.set(
          {
            status:
              "completed",

            currentStepId:
              null,

            waitingFor:
              null,

            waitingUntil:
              null,

            completedAt:
              nowTs(),

            updatedAt:
              nowTs(),
          },
          {
            merge:
              true,
          }
        );

        logger.info(
          "[dispatchMagicTouchFlowRun] Run completed",
          {
            agentId:
              normalizedAgentId,

            runId:
              normalizedRunId,

            completedStepCount:
              stepHistory.length,
          }
        );

        return {
          ok:
            true,

          status:
            "completed",

          runId:
            normalizedRunId,

          completedStepCount:
            stepHistory.length,
        };
      }

      currentStepId =
        nextStepId;

      context.run.currentStepId =
        currentStepId;
    }

    throw new Error(
      `Flow exceeded maximum of ${MAX_IMMEDIATE_STEPS} immediate steps`
    );
  } catch (
    error: any
  ) {
    const errorMessage =
      error?.message ||
      String(
        error
      );

    logger.error(
      "[dispatchMagicTouchFlowRun] Run failed",
      {
        agentId:
          normalizedAgentId,

        runId:
          normalizedRunId,

        error:
          errorMessage,
      }
    );

    await runRef.set(
      {
        status:
          "failed",

        error:
          errorMessage,

        failedAt:
          nowTs(),

        updatedAt:
          nowTs(),
      },
      {
        merge:
          true,
      }
    );

    throw error;
  }
}