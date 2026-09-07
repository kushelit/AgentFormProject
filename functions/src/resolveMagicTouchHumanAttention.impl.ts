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

function normalizeRecord(
  value: unknown
): Record<string, any> {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    return {};
  }

  return value as
    Record<string, any>;
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

 /*
 * משמש לטיפול אנושי כאשר החיפוש הפנימי
 * ב-Surense במהלך יצירת ייפוי הכוח
 * לא הגיע להתאמה חד-משמעית.
 *
 * במקרה של מספר תוצאות:
 * המשתמש יבחר Customer מתוך המועמדים.
 *
 * במקרה של 0 תוצאות:
 * ניתן יהיה להזין Customer ID ידנית.
 */

  const requestedSurenseCustomerId =
    s(
      request.data
        ?.surenseCustomerId
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

  /*
   * "טופל" רק סוגר את ההתראה.
   *
   * הוא אינו ממשיך את ה-Flow.
   * ההתנהגות הקיימת נשמרת.
   */
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
            "waiting"
          ) {
            throw new HttpsError(
              "failed-precondition",
              "Flow Run is no longer waiting"
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

          /*
           * =====================================================
           * מסלול 1:
           * Human Attention שנוצר מתשובת לקוח.
           * =====================================================
           */
          if (
            waitingForType ===
            "customer_response"
          ) {
            if (
              !resolvedAction
            ) {
              throw new HttpsError(
                "invalid-argument",
                "resolvedAction is required when continuing a customer response Flow"
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

            const humanResolution = {
              source:
                "human",

              resolutionType:
                "customer_response",

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

              resolutionType:
                "customer_response",

              resolvedAction,

              surenseCustomerId:
                null,
            };
          }

          /*
           * =====================================================
           * מסלול 2:
           * החיפוש הפנימי ב-Surense במהלך
           * יצירת ייפוי הכוח לא הגיע
           * להתאמה חד-משמעית.
           *
           * 0 התאמות או יותר מהתאמה אחת.
           * =====================================================
           */
          if (
            waitingForType ===
            "human_attention"
          ) {
            const waitingContext =
              normalizeRecord(
                waitingFor
                  ?.context
              );

            const provider =
              s(
                waitingContext
                  ?.provider
              );

            const action =
              s(
                waitingContext
                  ?.action
              );

            if (
              provider !==
                "surense" ||
              action !==
                "findCustomer"
            ) {
              throw new HttpsError(
                "failed-precondition",
                "Unsupported human attention Flow type"
              );
            }

            if (
              !requestedSurenseCustomerId
            ) {
              throw new HttpsError(
                "invalid-argument",
                "surenseCustomerId is required to continue this Flow"
              );
            }

            if (
              !contactId
            ) {
              throw new HttpsError(
                "failed-precondition",
                "Flow Run is missing contactId"
              );
            }

            const matchCount =
              Number(
                waitingContext
                  ?.matchCount
              );

            const candidates =
              Array.isArray(
                waitingContext
                  ?.candidates
              )
                ? waitingContext
                    .candidates
                    .map(
                      (
                        candidate: any
                      ) =>
                        normalizeRecord(
                          candidate
                        )
                    )
                : [];

            const candidateIds =
              candidates
                .map(
                  (
                    candidate
                  ) =>
                    s(
                      candidate
                        ?.customerId
                    )
                )
                .filter(
                  Boolean
                );

            /*
             * כאשר היו כמה התאמות,
             * המשתמש חייב לבחור אחד
             * מהמזהים שחזרו מ-Surense.
             *
             * אנחנו לא מאפשרים ID שרירותי
             * במקרה הזה.
             */
            if (
              Number.isFinite(
                matchCount
              ) &&
              matchCount > 1 &&
              !candidateIds.includes(
                requestedSurenseCustomerId
              )
            ) {
              throw new HttpsError(
                "invalid-argument",
                "Selected Surense customer is not one of the returned candidates"
              );
            }

            const selectedCandidate =
              candidates.find(
                (
                  candidate
                ) =>
                  s(
                    candidate
                      ?.customerId
                  ) ===
                  requestedSurenseCustomerId
              ) ||
              null;

            const searchedFullName =
              s(
                waitingContext
                  ?.searchedFullName
              );

            const selectedFullName =
              s(
                selectedCandidate
                  ?.fullName
              ) ||
              searchedFullName ||
              null;

            const contactRef =
              (db as any).doc(
                `agents/${agentId}/magic_touch_contacts/${contactId}`
              );

            /*
             * כאן נוצר בפועל הקישור
             * בין לקוח MagicTouch/Excel
             * לבין הלקוח שנבחר ב-Surense.
             *
             * sourceSystem עצמו לא משתנה.
             */
            transaction.update(
              contactRef,
              {
                "sourceData.surense.customerId":
                  requestedSurenseCustomerId,

                "sourceData.surense.fullName":
                  selectedFullName,

                "sourceData.surense.matchMethod":
                  selectedCandidate
                    ? "human_selection"
                    : "human_manual",

                "sourceData.surense.matchedAt":
                  timestamp,

                "sourceData.surense.matchedBy":
                  authUid,

                updatedAt:
                  timestamp,
              }
            );

            const resolutionAction =
              "surense_customer_selected";

            const humanResolution = {
              source:
                "human",

              resolutionType:
                "surense_customer",

              resolvedAction:
                resolutionAction,

              surenseCustomerId:
                requestedSurenseCustomerId,

              selectedCandidate:
                selectedCandidate ||
                null,

              originalMatchCount:
                Number.isFinite(
                  matchCount
                )
                  ? matchCount
                  : null,

              searchedFullName:
                searchedFullName ||
                null,

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

                sourceSystem:
                  "surense",

                triggerType:
                  "human_surense_customer_resolved",

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
                    "known",

                  flowState:
                    "active",

                  messageDisposition:
                    "system",

                  handling:
                    "continue_flow",

                  activeRunId:
                    runId,

                  activeFlowId:
                    flowId,

                  previousRunId:
                    null,

                  resolvedAction:
                    resolutionAction,

                  reason:
                    "human_selected_surense_customer",

                  resolutionSource:
                    "human",
                },

                resume: {
                  resumed:
                    true,

                  runId,

                  resolvedAction:
                    resolutionAction,

                  resumeStepId,

                  source:
                    "human",

                  resolvedBy:
                    authUid,
                },

                surenseCustomer: {
                  customerId:
                    requestedSurenseCustomerId,

                  fullName:
                    selectedFullName,

                  selectedCandidate:
                    selectedCandidate ||
                    null,

                  searchedFullName:
                    searchedFullName ||
                    null,

                  originalMatchCount:
                    Number.isFinite(
                      matchCount
                    )
                      ? matchCount
                      : null,
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
                  resolutionAction,

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
                    "surense_customer_selected",

                  resolvedAction:
                    resolutionAction,

                  resolvedBy:
                    authUid,

                  resolutionSource:
                    "human",

                  resolutionEventId:
                    manualEventId,

                  surenseCustomerId:
                    requestedSurenseCustomerId,

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
                    "surense_customer_selected",

                  resolvedAction:
                    resolutionAction,

                  resolvedBy:
                    authUid,

                  resolutionSource:
                    "human",

                  resolutionEventId:
                    manualEventId,

                  surenseCustomerId:
                    requestedSurenseCustomerId,

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

              resolutionType:
                "surense_customer",

              resolvedAction:
                resolutionAction,

              surenseCustomerId:
                requestedSurenseCustomerId,
            };
          }

          throw new HttpsError(
            "failed-precondition",
            `Unsupported waitingFor type for human resolution: ${waitingForType || "missing"}`
          );
        }
      );

  /*
   * אין צורך לקרוא ידנית ל-Dispatcher.
   *
   * שינוי status:
   * waiting -> queued
   *
   * מפעיל את dispatchMagicTouchFlowRun
   * שכבר קיים.
   */
  logger.info(
    "[resolveMagicTouchHumanAttention] Flow resumed by human",
    {
      agentId,

      conversationId,

      runId,

      resolutionType:
        transactionResult
          .resolutionType,

      resolvedAction:
        transactionResult
          .resolvedAction,

      surenseCustomerId:
        transactionResult
          .surenseCustomerId,

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

    resolutionType:
      transactionResult
        .resolutionType,

    resolvedAction:
      transactionResult
        .resolvedAction,

    surenseCustomerId:
      transactionResult
        .surenseCustomerId,

    eventId:
      manualEventId,

    resumeStepId:
      transactionResult
        .resumeStepId,

    resumed:
      true,
  };
}