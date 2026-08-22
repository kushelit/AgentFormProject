/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  randomUUID,
} from "node:crypto";

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  logger,
} from "firebase-functions";

import {
  adminDb,
  nowTs,
} from "./shared/admin";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function normalizeStringArray(
  value: unknown
): string[] {
  if (
    !Array.isArray(
      value
    )
  ) {
    return [];
  }

  return value
    .map(
      (
        item
      ) =>
        s(
          item
        )
    )
    .filter(
      Boolean
    );
}

async function assertConversationAccess({
  authUid,
  conversationAgentId,
}: {
  authUid: string;
  conversationAgentId: string;
}) {
  const db =
    adminDb();

  const userSnap =
    await (db as any)
      .collection(
        "users"
      )
      .doc(
        authUid
      )
      .get();

  if (
    !userSnap.exists
  ) {
    throw new HttpsError(
      "permission-denied",
      "User not found"
    );
  }

  const userData =
    userSnap.data() as any;

  const isSystem =
    userData
      ?.isSystem ===
      true;

  const userAgentId =
    s(
      userData
        ?.agentId
    ) ||
    authUid;

  if (
    !isSystem &&
    userAgentId !==
      conversationAgentId
  ) {
    throw new HttpsError(
      "permission-denied",
      "Cannot resolve a conversation for another agent"
    );
  }

  return {
    userData,
    userAgentId,
    isSystem,
  };
}

export async function resolveMagicTouchHumanAttentionImpl(
  request: any
): Promise<object> {
  const authUid =
    s(
      request.auth
        ?.uid
    );

  if (
    !authUid
  ) {
    throw new HttpsError(
      "unauthenticated",
      "Login required"
    );
  }

  const conversationId =
    s(
      request.data
        ?.conversationId
    );

  const mode =
    s(
      request.data
        ?.mode
    );

  const resolvedAction =
    s(
      request.data
        ?.resolvedAction
    );

  if (
    !conversationId
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing conversationId"
    );
  }

  if (
    mode !==
      "handled" &&
    mode !==
      "continue_flow"
  ) {
    throw new HttpsError(
      "invalid-argument",
      "mode must be handled or continue_flow"
    );
  }

  if (
    mode ===
      "continue_flow" &&
    !resolvedAction
  ) {
    throw new HttpsError(
      "invalid-argument",
      "resolvedAction is required when continuing the Flow"
    );
  }

  const db =
    adminDb();

  const conversationRef =
    (db as any).doc(
      `whatsapp_conversations/${conversationId}`
    );

  const conversationSnap =
    await conversationRef.get();

  if (
    !conversationSnap.exists
  ) {
    throw new HttpsError(
      "not-found",
      "Conversation not found"
    );
  }

  const conversationData =
    conversationSnap.data() as any;

  const agentId =
    s(
      conversationData
        ?.agentId
    );

  if (
    !agentId
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Conversation is missing agentId"
    );
  }

  await assertConversationAccess({
    authUid,
    conversationAgentId:
      agentId,
  });

  const attention =
    conversationData
      ?.humanAttention &&
    typeof conversationData
      .humanAttention ===
      "object"
      ? conversationData
          .humanAttention
      : null;

  if (
    conversationData
      ?.needsHumanAttention !==
      true &&
    attention
      ?.required !==
      true
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Conversation does not currently require human attention"
    );
  }

  const runId =
    s(
      attention
        ?.runId
    );

  if (
    mode ===
    "handled"
  ) {
    const resolvedAt =
      nowTs();

    const writes:
      Promise<any>[] = [
        conversationRef.set(
          {
            needsHumanAttention:
              false,

            needsReply:
              false,

            humanAttention: {
              ...(
                attention ||
                {}
              ),

              required:
                false,

              resolvedAt,

              resolvedReason:
                "handled_by_human",

              resolvedBy:
                authUid,

              resolutionSource:
                "human",

              updatedAt:
                resolvedAt,
            },

            updatedAt:
              resolvedAt,
          },
          {
            merge:
              true,
          }
        ),
      ];

    if (
      runId
    ) {
      const runRef =
        (db as any).doc(
          `agents/${agentId}/magic_touch_flow_runs/${runId}`
        );

      const runSnap =
        await runRef.get();

      if (
        runSnap.exists
      ) {
        const runData =
          runSnap.data() as any;

        const runAttention =
          runData
            ?.humanAttention &&
          typeof runData
            .humanAttention ===
            "object"
            ? runData
                .humanAttention
            : {};

        writes.push(
          runRef.set(
            {
              humanAttention: {
                ...runAttention,

                required:
                  false,

                resolvedAt,

                resolvedReason:
                  "handled_by_human",

                resolvedBy:
                  authUid,

                resolutionSource:
                  "human",

                updatedAt:
                  resolvedAt,
              },

              updatedAt:
                resolvedAt,
            },
            {
              merge:
                true,
            }
          )
        );
      }
    }

    await Promise.all(
      writes
    );

    logger.info(
      "[resolveMagicTouchHumanAttention] Marked as handled",
      {
        agentId,

        conversationId,

        runId:
          runId ||
          null,

        resolvedBy:
          authUid,
      }
    );

    return {
      ok:
        true,

      mode:
        "handled",

      conversationId,

      agentId,

      runId:
        runId ||
        null,

      resumed:
        false,
    };
  }

  if (
    !runId
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Human attention is not linked to a Flow Run"
    );
  }

  const runRef =
    (db as any).doc(
      `agents/${agentId}/magic_touch_flow_runs/${runId}`
    );

  const manualEventId =
    `human_${randomUUID()}`;

  const eventRef =
    (db as any).doc(
      `agents/${agentId}/magic_touch_events/${manualEventId}`
    );

  const transactionResult =
    await (db as any)
      .runTransaction(
        async (
          transaction: any
        ) => {
          const [
            currentConversationSnap,
            runSnap,
          ] =
            await Promise.all([
              transaction.get(
                conversationRef
              ),

              transaction.get(
                runRef
              ),
            ]);

          if (
            !currentConversationSnap.exists
          ) {
            throw new HttpsError(
              "not-found",
              "Conversation not found"
            );
          }

          if (
            !runSnap.exists
          ) {
            throw new HttpsError(
              "not-found",
              "Flow Run not found"
            );
          }

          const currentConversation =
            currentConversationSnap.data() as any;

          const currentAttention =
            currentConversation
              ?.humanAttention &&
            typeof currentConversation
              .humanAttention ===
              "object"
              ? currentConversation
                  .humanAttention
              : null;

          if (
            currentConversation
              ?.needsHumanAttention !==
              true &&
            currentAttention
              ?.required !==
              true
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Human attention was already resolved"
            );
          }

          const currentAttentionRunId =
            s(
              currentAttention
                ?.runId
            );

          if (
            currentAttentionRunId !==
            runId
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Human attention is linked to a different Flow Run"
            );
          }

          const runData =
            runSnap.data() as any;

          const runStatus =
            s(
              runData
                ?.status
            );

          const waitingFor =
            runData
              ?.waitingFor &&
            typeof runData
              .waitingFor ===
              "object"
              ? runData
                  .waitingFor
              : null;

          const waitingForType =
            s(
              waitingFor
                ?.type
            );

          if (
            runStatus !==
              "waiting" ||
            waitingForType !==
              "customer_response"
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Flow Run is no longer waiting for a customer response"
            );
          }

          const expectedActions =
            normalizeStringArray(
              waitingFor
                ?.expectedActions
            );

          if (
            !expectedActions.includes(
              resolvedAction
            )
          ) {
            throw new HttpsError(
              "invalid-argument",
              "The selected Action is not expected by this Flow step"
            );
          }

          const resumeStepId =
            s(
              waitingFor
                ?.resumeStepId
            );

          if (
            !resumeStepId
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Flow Run is missing resumeStepId"
            );
          }

          const timestamp =
            nowTs();

          const flowId =
            s(
              runData
                ?.flowId
            ) ||
            null;

          const contactId =
            s(
              runData
                ?.contactId ||
              currentConversation
                ?.contactId
            ) ||
            null;

          const humanResolution = {
            source:
              "human",

            resolvedAction,

            resolvedBy:
              authUid,

            resolvedAt:
              timestamp,

            conversationId,

            runId,

            eventId:
              manualEventId,
          };

          transaction.set(
            eventRef,
            {
              eventId:
                manualEventId,

              agentId,

              contactId,

              conversationId,

              channel:
                "human",

              triggerType:
                "human_flow_response_resolved",

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
                s(
                  currentAttention
                    ?.customerMessage
                ) ||
                null,

              messageType:
                "human_resolution",

              quickReplyAction:
                null,

              flowRunIds: [
                runId,
              ],

              resumedRunId:
                runId,

              routing: {
                contactState:
                  contactId
                    ? "known"
                    : "unknown",

                flowState:
                  "active",

                messageDisposition:
                  "expected",

                handling:
                  "continue_flow",

                activeRunId:
                  runId,

                activeFlowId:
                  flowId,

                previousRunId:
                  null,

                resolvedAction,

                reason:
                  "human_selected_expected_action",

                resolutionSource:
                  "human",
              },

              resume: {
                resumed:
                  true,

                runId,

                resolvedAction,

                resumeStepId,

                source:
                  "human",

                resolvedBy:
                  authUid,
              },

              humanResolution,
            },
            {
              merge:
                false,
            }
          );

          transaction.set(
            runRef,
            {
              status:
                "queued",

              currentStepId:
                resumeStepId,

              executionEventId:
                manualEventId,

              waitingFor:
                null,

              waitingUntil:
                null,

              lastResumeEventId:
                manualEventId,

              lastResolvedAction:
                resolvedAction,

              lastResolutionSource:
                "human",

              lastResolvedBy:
                authUid,

              resumedAt:
                timestamp,

              humanAttention: {
                ...(
                  runData
                    ?.humanAttention &&
                  typeof runData
                    .humanAttention ===
                    "object"
                    ? runData
                        .humanAttention
                    : {}
                ),

                required:
                  false,

                resolvedAt:
                  timestamp,

                resolvedReason:
                  "human_selected_action",

                resolvedAction,

                resolvedBy:
                  authUid,

                resolutionSource:
                  "human",

                resolutionEventId:
                  manualEventId,

                updatedAt:
                  timestamp,
              },

              updatedAt:
                timestamp,
            },
            {
              merge:
                true,
            }
          );

          transaction.set(
            conversationRef,
            {
              needsHumanAttention:
                false,

              needsReply:
                false,

              humanAttention: {
                ...(
                  currentAttention ||
                  {}
                ),

                required:
                  false,

                resolvedAt:
                  timestamp,

                resolvedReason:
                  "human_selected_action",

                resolvedAction,

                resolvedBy:
                  authUid,

                resolutionSource:
                  "human",

                resolutionEventId:
                  manualEventId,

                updatedAt:
                  timestamp,
              },

              updatedAt:
                timestamp,
            },
            {
              merge:
                true,
            }
          );

          return {
            resumeStepId,

            flowId,

            contactId,
          };
        }
      );

  /*
   * אין צורך לקרוא ידנית ל-Dispatcher.
   * שינוי ה-Run ל-queued מפעיל את
   * dispatchMagicTouchFlowRun הקיים.
   */
  logger.info(
    "[resolveMagicTouchHumanAttention] Flow resumed by human",
    {
      agentId,

      conversationId,

      runId,

      resolvedAction,

      eventId:
        manualEventId,

      resumeStepId:
        transactionResult
          .resumeStepId,

      resolvedBy:
        authUid,
    }
  );

  return {
    ok:
      true,

    mode:
      "continue_flow",

    conversationId,

    agentId,

    runId,

    resolvedAction,

    eventId:
      manualEventId,

    resumeStepId:
      transactionResult
        .resumeStepId,

    resumed:
      true,
  };
}
