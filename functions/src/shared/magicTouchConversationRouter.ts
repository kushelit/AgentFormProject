/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  adminDb,
} from "./admin";

import {
  resolveMagicTouchAction,
  resolveMagicTouchConversationTarget,
  resolveMagicTouchSafeReplyIntent,
  generateMagicTouchSafeReply,
} from "./magicTouchActionResolver";

import type {
  MagicTouchResponseOption,
  MagicTouchConversationCandidate,
} from "./magicTouchActionResolver";

import {
  getEffectiveMagicTouchAISettings,
} from "../magicTouchAISettings.impl";

export type MagicTouchContactState =
  | "known"
  | "unknown";

export type MagicTouchFlowState =
  | "active"
  | "previous_completed"
  | "none";

export type MagicTouchMessageDisposition =
  | "expected"
  | "unexpected"
  | "new_inbound";

export type MagicTouchConversationHandling =
  | "continue_flow"
  | "start_flow"
  | "safe_reply"
  | "human_attention";

export type MagicTouchResolvedAction =
  | "booking"
  | "callback"
  | "free_text"
  | string
  | null;

export interface MagicTouchConversationRouteInput {
  agentId: string;
  contactId?: string | null;
  conversationId: string;
  phoneNormalized: string;
  messageText?: string | null;
  messageType?: string | null;
  quickReplyAction?: string | null;
}

export interface MagicTouchConversationRouteResult {
  contactState:
    MagicTouchContactState;

  flowState:
    MagicTouchFlowState;

  messageDisposition:
    MagicTouchMessageDisposition;

  resolvedAction:
    MagicTouchResolvedAction;

  handling:
    MagicTouchConversationHandling;

  activeRunId:
    string | null;

  activeFlowId:
    string | null;

  previousRunId:
    string | null;

  reason:
    string;

  suggestedReply?:
    string | null;

  suggestedReplyConfidence?:
    number | null;
}

type ActiveRunRecord = {
  runId: string;
  data: Record<string, any>;
};

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

async function findActiveRuns({
  agentId,
  contactId,
  conversationId,
}: {
  agentId: string;
  contactId: string | null;
  conversationId: string;
}): Promise<ActiveRunRecord[]> {
  const db =
    adminDb();

  const runsRef =
    db.collection(
      `agents/${agentId}/magic_touch_flow_runs`
    );

  const result =
    new Map<
      string,
      ActiveRunRecord
    >();

  async function addQueryResults(
    query:
      FirebaseFirestore.Query
  ): Promise<void> {
    const snap =
      await query.get();

    for (
      const doc of
      snap.docs
    ) {
      const data =
        doc.data() as Record<
          string,
          any
        >;

      const status =
        s(
          data?.status
        );

      if (
        status !== "waiting" &&
        status !== "processing"
      ) {
        continue;
      }

      result.set(
        doc.id,
        {
          runId:
            doc.id,

          data,
        }
      );
    }
  }

  if (
    conversationId
  ) {
    await addQueryResults(
      runsRef
        .where(
          "conversationId",
          "==",
          conversationId
        )
        .where(
          "status",
          "in",
          [
            "waiting",
            "processing",
          ]
        )
        .limit(20)
    );
  }

  /*
   * Fallback לפי contactId.
   * Map מונע כפילויות אם אותו Run
   * נמצא גם לפי conversation וגם לפי contact.
   */
  if (
    contactId
  ) {
    await addQueryResults(
      runsRef
        .where(
          "contactId",
          "==",
          contactId
        )
        .where(
          "status",
          "in",
          [
            "waiting",
            "processing",
          ]
        )
        .limit(20)
    );
  }

  return Array.from(
    result.values()
  );
}

async function findPreviousCompletedRun({
  agentId,
  contactId,
  conversationId,
}: {
  agentId: string;
  contactId: string | null;
  conversationId: string;
}) {
  const db =
    adminDb();

  const runsRef =
    db.collection(
      `agents/${agentId}/magic_touch_flow_runs`
    );

  if (
    conversationId
  ) {
    const snap =
      await runsRef
        .where(
          "conversationId",
          "==",
          conversationId
        )
        .where(
          "status",
          "==",
          "completed"
        )
        .limit(1)
        .get();

    if (
      !snap.empty
    ) {
      const doc =
        snap.docs[0];

      return {
        runId:
          doc.id,

        data:
          doc.data(),
      };
    }
  }

  if (
    contactId
  ) {
    const snap =
      await runsRef
        .where(
          "contactId",
          "==",
          contactId
        )
        .where(
          "status",
          "==",
          "completed"
        )
        .limit(1)
        .get();

    if (
      !snap.empty
    ) {
      const doc =
        snap.docs[0];

      return {
        runId:
          doc.id,

        data:
          doc.data(),
      };
    }
  }

  return null;
}

function getExpectedActions(
  runData: any
): string[] {
  const values =
    runData
      ?.waitingFor
      ?.expectedActions;

  if (
    !Array.isArray(
      values
    )
  ) {
    return [];
  }

  return values
    .map(
      (
        value: any
      ) =>
        s(value)
    )
    .filter(
      Boolean
    );
}

function getResponseOptions(
  runData: any
): MagicTouchResponseOption[] {
  const values =
    runData
      ?.waitingFor
      ?.responseOptions;

  if (
    !Array.isArray(
      values
    )
  ) {
    return [];
  }

  return values.reduce(
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
  );
}

function getPromptQuestion(
  runData: any
): string | null {
  return (
    s(
      runData
        ?.waitingFor
        ?.promptContext
        ?.question
    ) ||
    null
  );
}

function getResolution(
  runData: any
) {
  return (
    runData
      ?.waitingFor
      ?.resolution ||
    {
      mode:
        "quick_reply_only" as const,

      minConfidence:
        0.8,
    }
  );
}

function actionIsExpected({
  resolvedAction,
  expectedActions,
}: {
  resolvedAction: string | null;
  expectedActions: string[];
}): boolean {
  if (
    !resolvedAction ||
    expectedActions.length ===
      0
  ) {
    return false;
  }

  return expectedActions.some(
    (
      expectedAction
    ) =>
      expectedAction ===
      resolvedAction
  );
}

function buildConversationCandidates(
  activeRuns:
    ActiveRunRecord[]
): MagicTouchConversationCandidate[] {
  return activeRuns.map(
    (
      activeRun
    ) => {
      const waitingFor =
        activeRun.data
          ?.waitingFor ||
        null;

      return {
        runId:
          activeRun.runId,

        flowId:
          s(
            activeRun.data
              ?.flowId
          ) ||
          null,

        flowName:
          s(
            activeRun.data
              ?.flowName
          ) ||
          null,

        status:
          s(
            activeRun.data
              ?.status
          ) ||
          null,

        currentStepId:
          s(
            activeRun.data
              ?.currentStepId
          ) ||
          null,

        waitingForType:
          s(
            waitingFor
              ?.type
          ) ||
          null,

        waitingStepId:
          s(
            waitingFor
              ?.stepId
          ) ||
          null,

        prompt:
          s(
            waitingFor
              ?.promptContext
              ?.question
          ) ||
          null,

        expectedActions:
          getExpectedActions(
            activeRun.data
          ),

        responseOptions:
          getResponseOptions(
            activeRun.data
          ),
      };
    }
  );
}

function buildSafeReplyBusinessContext(
  runData: any
): Record<
  string,
  any
> {
  const waitingFor =
    runData
      ?.waitingFor ||
    {};

  const waitingContext =
    waitingFor
      ?.context &&
    typeof waitingFor
      .context ===
      "object"
      ? waitingFor
          .context
      : {};

  const lastStepResult =
    runData
      ?.lastStepResult &&
    typeof runData
      .lastStepResult ===
      "object"
      ? runData
          .lastStepResult
      : {};

  return {
    currentStepId:
      s(
        runData
          ?.currentStepId
      ) ||
      null,

    lastStepId:
      s(
        runData
          ?.lastStepId
      ) ||
      null,

    waitingFor: {
      type:
        s(
          waitingFor
            ?.type
        ) ||
        null,

      stepId:
        s(
          waitingFor
            ?.stepId
        ) ||
        null,

      resumeStepId:
        s(
          waitingFor
            ?.resumeStepId
        ) ||
        null,

      context:
        waitingContext,
    },

    lastStepResult: {
      message:
        s(
          lastStepResult
            ?.message
        ) ||
        null,

      waitingFor:
        s(
          lastStepResult
            ?.waitingFor
        ) ||
        null,

      requestId:
        s(
          lastStepResult
            ?.requestId
        ) ||
        null,

      uploadUrl:
        s(
          lastStepResult
            ?.uploadUrl
        ) ||
        null,

      status:
        s(
          lastStepResult
            ?.status
        ) ||
        null,
    },
  };
}

export async function routeMagicTouchConversation(
  input:
    MagicTouchConversationRouteInput
): Promise<MagicTouchConversationRouteResult> {
  const agentId =
    s(
      input.agentId
    );

  const contactId =
    s(
      input.contactId
    ) ||
    null;

  const conversationId =
    s(
      input.conversationId
    );

  const phoneNormalized =
    s(
      input.phoneNormalized
    );

  const quickReplyAction =
    s(
      input.quickReplyAction
    ) ||
    null;

  const messageText =
    s(
      input.messageText
    );

  if (
    !agentId ||
    !conversationId ||
    !phoneNormalized
  ) {
    throw new Error(
      "Missing required conversation routing data"
    );
  }

  const contactState:
    MagicTouchContactState =
    contactId
      ? "known"
      : "unknown";

  /*
   * מקור אמת אחד להגדרות AI:
   * system + agent.
   *
   * Quick Reply נשאר דטרמיניסטי
   * ולא דורש AI.
   */
  const aiSettings =
    await getEffectiveMagicTouchAISettings(
      agentId
    );

  const aiUnderstandingEnabled =
    aiSettings.enabled &&
    aiSettings.mode !==
      "off";

  const activeRuns =
    await findActiveRuns({
      agentId,
      contactId,
      conversationId,
    });

  if (
    activeRuns.length >
    0
  ) {
    /*
     * Quick Reply:
     * קודם מנסים התאמה דטרמיניסטית ל-Run
     * שמחכה ל-customer_response ומצפה ל-action.
     *
     * כך Quick Reply לא דורש AI.
     */
    if (
      quickReplyAction
    ) {
      const matchingRun =
        activeRuns.find(
          (
            activeRun
          ) => {
            const status =
              s(
                activeRun.data
                  ?.status
              );

            const waitingForType =
              s(
                activeRun.data
                  ?.waitingFor
                  ?.type
              );

            const expectedActions =
              getExpectedActions(
                activeRun.data
              );

            return (
              status ===
                "waiting" &&
              waitingForType ===
                "customer_response" &&
              expectedActions.includes(
                quickReplyAction
              )
            );
          }
        );

      if (
        matchingRun
      ) {
        return {
          contactState,

          flowState:
            "active",

          messageDisposition:
            "expected",

          resolvedAction:
            quickReplyAction,

          handling:
            "continue_flow",

          activeRunId:
            matchingRun.runId,

          activeFlowId:
            s(
              matchingRun.data
                ?.flowId
            ) ||
            null,

          previousRunId:
            null,

          reason:
            "quick_reply_matched_waiting_run",
        };
      }
    }

    /*
     * מכאן מדובר במלל חופשי.
     *
     * אם AI כבוי ברמת המערכת או הסוכן,
     * לא מפעילים AI ולא מנחשים לאיזה Run
     * ההודעה שייכת.
     */
    if (
      !aiUnderstandingEnabled
    ) {
      return {
        contactState,

        flowState:
          "active",

        messageDisposition:
          "unexpected",

        resolvedAction:
          null,

        handling:
          "human_attention",

        activeRunId:
          null,

        activeFlowId:
          null,

        previousRunId:
          null,

        reason:
          "ai_understanding_disabled",
      };
    }

    /*
     * הודעה חופשית כאשר יש Runs פעילים:
     * קודם בוחרים לאיזה Run ההודעה שייכת.
     */
    const candidates =
      buildConversationCandidates(
        activeRuns
      );

    const targetResult =
      await resolveMagicTouchConversationTarget({
        messageText,

        messageType:
          s(
            input.messageType
          ) ||
          null,

        candidates,

        context: {
          agentId,

          contactId,

          conversationId,
        },
      });

    const targetRunId =
      s(
        targetResult
          .targetRunId
      );

    const targetRun =
      targetRunId
        ? activeRuns.find(
            (
              activeRun
            ) =>
              activeRun.runId ===
              targetRunId
          ) ||
          null
        : null;

    /*
     * אם לא הצלחנו להבין לאיזה Run ההודעה שייכת,
     * לא מנחשים ולא ממשיכים שום Flow.
     */
    if (
      !targetRun
    ) {
      return {
        contactState,

        flowState:
          "active",

        messageDisposition:
          "unexpected",

        resolvedAction:
          null,

        handling:
          "human_attention",

        activeRunId:
          null,

        activeFlowId:
          null,

        previousRunId:
          null,

        reason:
          targetResult
            .reason ||
          "active_runs_target_not_resolved",
      };
    }

    const runStatus =
      s(
        targetRun.data
          ?.status
      );

    const waitingForType =
      s(
        targetRun.data
          ?.waitingFor
          ?.type
      );

    const trySafeReply =
      async (): Promise<
        MagicTouchConversationRouteResult |
        null
      > => {
        const safeRepliesEnabled =
          aiSettings.enabled &&
          (
            aiSettings.mode ===
              "safe_replies" ||
            aiSettings.mode ===
              "full_conversation"
          ) &&
          aiSettings.safeReplies
            .enabled;

        if (
          !safeRepliesEnabled ||
          !messageText
        ) {
          return null;
        }

        const allowedIntents =
          aiSettings.safeReplies
            .allowedIntents ||
          [];

        const safeIntentResult =
          await resolveMagicTouchSafeReplyIntent({
            messageText,

            waitingForType:
              waitingForType ||
              null,

            flowName:
              s(
                targetRun.data
                  ?.flowName
              ) ||
              null,

            stepId:
              s(
                targetRun.data
                  ?.waitingFor
                  ?.stepId ||
                targetRun.data
                  ?.currentStepId
              ) ||
              null,

            stepName:
              s(
                targetRun.data
                  ?.lastStepResult
                  ?.stepName ||
                targetRun.data
                  ?.waitingFor
                  ?.stepName
              ) ||
              null,

            prompt:
              s(
                targetRun.data
                  ?.waitingFor
                  ?.promptContext
                  ?.question ||
                targetRun.data
                  ?.lastStepResult
                  ?.message
              ) ||
              null,

            businessContext:
              buildSafeReplyBusinessContext(
                targetRun.data
              ),

            allowedIntents,

            context: {
              agentId,

              contactId,

              conversationId,

              runId:
                targetRun.runId,

              flowId:
                s(
                  targetRun.data
                    ?.flowId
                ) ||
                null,
            },
          });

        const safeIntent =
          s(
            safeIntentResult
              .intent
          ) ||
          null;

        const safeConfidence =
          safeIntentResult
            .confidence;

        const safeIntentAllowed =
          Boolean(
            safeIntent
          ) &&
          allowedIntents.some(
            (
              allowedIntent
            ) =>
              allowedIntent ===
              safeIntent
          );

        const confidencePassed =
          typeof safeConfidence ===
            "number" &&
          safeConfidence >=
            aiSettings
              .minConfidence;

        if (
          !safeIntentAllowed ||
          !confidencePassed ||
          !safeIntent
        ) {
          return null;
        }

        const businessContext =
          buildSafeReplyBusinessContext(
            targetRun.data
          );

        const replyResult =
          await generateMagicTouchSafeReply({
            messageText,

            intent:
              safeIntent,

            waitingForType:
              waitingForType ||
              null,

            flowName:
              s(
                targetRun.data
                  ?.flowName
              ) ||
              null,

            stepId:
              s(
                targetRun.data
                  ?.waitingFor
                  ?.stepId ||
                targetRun.data
                  ?.currentStepId
              ) ||
              null,

            stepName:
              s(
                targetRun.data
                  ?.lastStepResult
                  ?.stepName ||
                targetRun.data
                  ?.waitingFor
                  ?.stepName
              ) ||
              null,

            prompt:
              s(
                targetRun.data
                  ?.waitingFor
                  ?.promptContext
                  ?.question ||
                targetRun.data
                  ?.lastStepResult
                  ?.message
              ) ||
              null,

            businessContext,

            conversationProfile:
              aiSettings
                .conversationProfile,

            context: {
              agentId,

              contactId,

              conversationId,

              runId:
                targetRun.runId,

              flowId:
                s(
                  targetRun.data
                    ?.flowId
                ) ||
                null,
            },
          });

        const suggestedReply =
          s(
            replyResult
              .replyText
          ) ||
          null;

        const suggestedReplyConfidence =
          replyResult
            .confidence;

        const replyConfidencePassed =
          Boolean(
            suggestedReply
          ) &&
          typeof suggestedReplyConfidence ===
            "number" &&
          suggestedReplyConfidence >=
            aiSettings
              .minConfidence;

        if (
          !replyConfidencePassed
        ) {
          return null;
        }

        return {
          contactState,

          flowState:
            "active",

          messageDisposition:
            "unexpected",

          resolvedAction:
            safeIntent,

          handling:
            "safe_reply",

          activeRunId:
            targetRun.runId,

          activeFlowId:
            s(
              targetRun.data
                ?.flowId
            ) ||
            null,

          previousRunId:
            null,

          reason:
            "safe_reply_generated",

          suggestedReply,

          suggestedReplyConfidence,
        };
      };

    if (
      runStatus ===
        "waiting" &&
      waitingForType ===
        "customer_response"
    ) {
      const expectedActions =
        getExpectedActions(
          targetRun.data
        );

      const responseOptions =
        getResponseOptions(
          targetRun.data
        );

      const promptQuestion =
        getPromptQuestion(
          targetRun.data
        );

      const resolution =
        getResolution(
          targetRun.data
        );

      const resolverResult =
        await resolveMagicTouchAction({
          messageText,

          quickReplyAction,

          expectedActions,

          responseOptions,

          resolution,

          context: {
            agentId,

            contactId,

            conversationId,

            runId:
              targetRun.runId,

            flowId:
              s(
                targetRun.data
                  ?.flowId
              ) ||
              null,

            flowName:
              s(
                targetRun.data
                  ?.flowName
              ) ||
              null,

            stepId:
              s(
                targetRun.data
                  ?.waitingFor
                  ?.stepId
              ) ||
              null,

            lastQuestion:
              promptQuestion,
          },
        });

      const resolvedAction =
        resolverResult
          .resolvedAction;

      const expected =
        actionIsExpected({
          resolvedAction,
          expectedActions,
        });

      if (
        expected
      ) {
        return {
          contactState,

          flowState:
            "active",

          messageDisposition:
            "expected",

          resolvedAction,

          handling:
            "continue_flow",

          activeRunId:
            targetRun.runId,

          activeFlowId:
            s(
              targetRun.data
                ?.flowId
            ) ||
            null,

          previousRunId:
            null,

          reason:
            "target_run_waiting_for_expected_customer_response",
        };
      }

      const safeReplyRoute =
        await trySafeReply();

      if (
        safeReplyRoute
      ) {
        return safeReplyRoute;
      }

      return {
        contactState,

        flowState:
          "active",

        messageDisposition:
          "unexpected",

        resolvedAction,

        handling:
          "human_attention",

        activeRunId:
          targetRun.runId,

        activeFlowId:
          s(
            targetRun.data
              ?.flowId
          ) ||
          null,

        previousRunId:
          null,

        reason:
          resolvedAction
            ? "target_run_customer_response_action_not_expected"
            : "target_run_customer_response_not_resolved",
      };
    }

    const safeReplyRoute =
      await trySafeReply();

    if (
      safeReplyRoute
    ) {
      return safeReplyRoute;
    }

    /*
     * understand_only (או safe replies כבוי):
     * מבינים את ההקשר, אבל לא עונים ולא משלימים
     * את ההמתנה העסקית של ה-Run.
     */
    return {
      contactState,

      flowState:
        "active",

      messageDisposition:
        "unexpected",

      resolvedAction:
        targetResult.intent ||
        null,

      handling:
        "human_attention",

      activeRunId:
        targetRun.runId,

      activeFlowId:
        s(
          targetRun.data
            ?.flowId
        ) ||
        null,

      previousRunId:
        null,

      reason:
        waitingForType
          ? `message_related_to_run_waiting_for_${waitingForType}`
          : "message_related_to_active_run",
    };
  }

  const previousRun =
    await findPreviousCompletedRun({
      agentId,
      contactId,
      conversationId,
    });

  if (
    previousRun
  ) {
    return {
      contactState,

      flowState:
        "previous_completed",

      messageDisposition:
        "new_inbound",

      resolvedAction:
        quickReplyAction,

      handling:
        "start_flow",

      activeRunId:
        null,

      activeFlowId:
        null,

      previousRunId:
        previousRun.runId,

      reason:
        "new_message_after_completed_flow",
    };
  }

  return {
    contactState,

    flowState:
      "none",

    messageDisposition:
      "new_inbound",

    resolvedAction:
      quickReplyAction,

    handling:
      "start_flow",

    activeRunId:
      null,

    activeFlowId:
      null,

    previousRunId:
      null,

    reason:
      contactId
        ? "known_contact_without_active_flow"
        : "unknown_contact_first_conversation",
  };
}
