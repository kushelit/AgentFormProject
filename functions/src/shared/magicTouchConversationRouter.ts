/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  adminDb,
} from "./admin";

import {
  resolveMagicTouchAction,
} from "./magicTouchActionResolver";

import type {
  MagicTouchResponseOption,
} from "./magicTouchActionResolver";


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
}

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

async function findActiveRun({
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

  /*
   * בשלב הראשון אנחנו מגדירים כפעיל Run
   * שנמצא ב-processing או waiting.
   *
   * בהמשך נוכל להרחיב את זה ל-waitingFor
   * ולהבין בדיוק איזו תשובה ה-Flow מצפה לקבל.
   */

  if (conversationId) {
    const waitingByConversation =
      await runsRef
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
        .limit(1)
        .get();

    if (
      !waitingByConversation.empty
    ) {
      const doc =
        waitingByConversation.docs[0];

      return {
        runId:
          doc.id,

        data:
          doc.data(),
      };
    }
  }

  if (contactId) {
    const waitingByContact =
      await runsRef
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
        .limit(1)
        .get();

    if (
      !waitingByContact.empty
    ) {
      const doc =
        waitingByContact.docs[0];

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

  if (conversationId) {
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

  if (contactId) {
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
    !Array.isArray(values)
  ) {
    return [];
  }

  return values
    .map(
      (value: any) =>
        s(value)
    )
    .filter(Boolean);
}

function getResponseOptions(
  runData: any
): MagicTouchResponseOption[] {
  const values =
    runData
      ?.waitingFor
      ?.responseOptions;

  if (
    !Array.isArray(values)
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



function actionIsExpected({
  resolvedAction,
  expectedActions,
}: {
  resolvedAction: string | null;
  expectedActions: string[];
}): boolean {
  if (
    !resolvedAction
  ) {
    return false;
  }

  /*
   * אם לא הוגדרו expectedActions,
   * אנחנו לא מניחים שכל פעולה היא תקינה.
   */
  if (
    expectedActions.length ===
    0
  ) {
    return false;
  }

  return expectedActions.some(
    (expectedAction) =>
      expectedAction ===
      resolvedAction
  );
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

  const activeRun =
    await findActiveRun({
      agentId,
      contactId,
      conversationId,
    });

 if (activeRun) {
  const runStatus =
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

  const responseOptions =
    getResponseOptions(
      activeRun.data
    );

  const promptQuestion =
    getPromptQuestion(
      activeRun.data
    );

const resolution =
  activeRun.data
    ?.waitingFor
    ?.resolution ||
  {
    mode:
      "quick_reply_only" as const,

    minConfidence:
      0.8,
  };

  /*
   * Resolver מופעל רק כאשר ה-Run
   * באמת ממתין לתשובת לקוח.
   */
  if (
    runStatus ===
      "waiting" &&
    waitingForType ===
      "customer_response"
  ) {
    const resolverResult =
      await resolveMagicTouchAction({
        messageText:
          s(
            input.messageText
          ),

        quickReplyAction,

        expectedActions,

        responseOptions,
        resolution,

        context: {
          agentId,

          contactId,

          conversationId,

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

          stepId:
            s(
              activeRun.data
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
          activeRun.runId,

        activeFlowId:
          s(
            activeRun.data
              ?.flowId
          ) ||
          null,

        previousRunId:
          null,

        reason:
          "active_flow_waiting_for_expected_customer_response",
      };
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
        activeRun.runId,

      activeFlowId:
        s(
          activeRun.data
            ?.flowId
        ) ||
        null,

      previousRunId:
        null,

      reason:
        resolvedAction
          ? "customer_response_action_not_expected"
          : "customer_response_not_resolved",
    };
  }

  /*
   * יש Run פעיל, אבל הוא לא ממתין
   * לתשובת לקוח.
   *
   * לכן לא מפעילים Resolver / AI.
   */
  return {
    contactState,

    flowState:
      "active",

    messageDisposition:
      "unexpected",

    resolvedAction:
      quickReplyAction,

    handling:
      "human_attention",

    activeRunId:
      activeRun.runId,

    activeFlowId:
      s(
        activeRun.data
          ?.flowId
      ) ||
      null,

    previousRunId:
      null,

    reason:
      runStatus ===
        "processing"
        ? "active_flow_is_processing"
        : waitingForType
          ? `active_flow_waiting_for_${waitingForType}`
          : "active_flow_not_waiting_for_customer_response",
  };
}

  const previousRun =
    await findPreviousCompletedRun({
      agentId,
      contactId,
      conversationId,
    });

  if (previousRun) {
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