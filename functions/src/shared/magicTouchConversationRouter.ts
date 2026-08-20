/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  adminDb,
} from "./admin";

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

  /*
   * כרגע ה-resolvedAction מגיע
   * מ-Quick Reply.
   *
   * בעתיד בדיוק כאן אפשר להכניס
   * Intent Resolver / AI.
   */
  const resolvedAction =
    quickReplyAction;

  /*
   * Run יכול להיות active,
   * אבל זה לא אומר שהוא מחכה
   * לתשובת WhatsApp.
   */
  if (
    runStatus ===
      "waiting" &&
    waitingForType ===
      "customer_response"
  ) {
    const expected =
      actionIsExpected({
        resolvedAction,
        expectedActions,
      });

    if (expected) {
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

    /*
     * ה-Flow באמת מחכה לתשובת לקוח,
     * אבל ההודעה לא נפתרה לפעולה צפויה.
     *
     * בשלב הזה:
     * human attention.
     *
     * בעתיד AI יוכל לנסות לפתור אותה
     * לפני שנגיע לכאן.
     */
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
   * יש Run פעיל,
   * אבל הוא לא מחכה לתשובת לקוח.
   *
   * למשל:
   * document / booking /
   * signature / external event.
   *
   * לכן הודעת WhatsApp לא ממשיכה
   * אוטומטית את אותו Flow.
   */
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