/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

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

export async function syncMagicTouchHumanAttentionImpl(
  event: any
): Promise<void> {
  const after =
    event.data
      ?.after;

  if (
    !after ||
    !after.exists
  ) {
    return;
  }

  const agentId =
    s(
      event.params
        ?.agentId
    );

  const eventId =
    s(
      event.params
        ?.eventId
    );

  const eventData =
    after.data() as any;

  const handling =
    s(
      eventData
        ?.routing
        ?.handling
    );

  /*
   * מטפלים רק בשני מצבים:
   *
   * human_attention:
   * המערכת לא הצליחה לפתור את הודעת הלקוח אוטומטית.
   *
   * continue_flow:
   * התקבלה תשובה תקינה וה-Flow ממשיך.
   *
   * safe_reply לא סוגר Attention קיים,
   * כי Safe Reply יכול לענות ללקוח ועדיין להשאיר
   * את ה-Run ממתין לאותה תשובה עסקית.
   */
  if (
    handling !==
      "human_attention" &&
    handling !==
      "continue_flow"
  ) {
    return;
  }

  const conversationId =
    s(
      eventData
        ?.conversationId
    );

  if (
    !agentId ||
    !conversationId
  ) {
    logger.warn(
      "[syncMagicTouchHumanAttention] Missing identifiers",
      {
        agentId:
          agentId ||
          null,

        eventId:
          eventId ||
          null,

        conversationId:
          conversationId ||
          null,
      }
    );

    return;
  }

  const activeRunId =
    s(
      eventData
        ?.routing
        ?.activeRunId
    ) ||
    null;

  const activeFlowId =
    s(
      eventData
        ?.routing
        ?.activeFlowId
    ) ||
    null;

  const reason =
    s(
      eventData
        ?.routing
        ?.reason
    ) ||
    null;

  const messageText =
    s(
      eventData
        ?.messageText
    ) ||
    null;

  const waMessageId =
    s(
      eventData
        ?.waMessageId
    ) ||
    null;

  const db =
    adminDb();

  const conversationRef =
    (db as any).doc(
      `whatsapp_conversations/${conversationId}`
    );

  if (
    handling ===
    "human_attention"
  ) {
    let runData:
      Record<
        string,
        any
      > |
      null =
      null;

    if (
      activeRunId
    ) {
      const runRef =
        (db as any).doc(
          `agents/${agentId}/magic_touch_flow_runs/${activeRunId}`
        );

      const runSnap =
        await runRef.get();

      if (
        runSnap.exists
      ) {
        runData =
          runSnap.data() as
            Record<
              string,
              any
            >;
      }
    }

    const waitingFor =
      runData
        ?.waitingFor &&
      typeof runData
        .waitingFor ===
        "object"
        ? runData
            .waitingFor
        : {};

    const expectedActions =
      normalizeStringArray(
        waitingFor
          ?.expectedActions
      );

    const responseOptions =
      Array.isArray(
        waitingFor
          ?.responseOptions
      )
        ? waitingFor
            .responseOptions
            .map(
              (
                option: any
              ) => ({
                action:
                  s(
                    option?.action
                  ),

                label:
                  s(
                    option?.label
                  ) ||
                  null,

                description:
                  s(
                    option?.description
                  ) ||
                  null,
              })
            )
            .filter(
              (
                option: any
              ) =>
                Boolean(
                  option.action
                )
            )
        : [];

    const waitingQuestion =
      s(
        waitingFor
          ?.promptContext
          ?.question
      ) ||
      null;

    const waitingForType =
      s(
        waitingFor
          ?.type
      ) ||
      null;

    const waitingStepId =
      s(
        waitingFor
          ?.stepId ||
        runData
          ?.currentStepId
      ) ||
      null;

    const flowName =
      s(
        runData
          ?.flowName
      ) ||
      null;

    const timestamp =
      nowTs();

    const attention = {
      required:
        true,

      reason:
        reason ||
        "flow_response_unresolved",

      eventId:
        eventId ||
        null,

      runId:
        activeRunId,

      flowId:
        activeFlowId,

      flowName,

      stepId:
        waitingStepId,

      waitingForType,

      question:
        waitingQuestion,

      expectedActions,

      responseOptions,

      customerMessage:
        messageText,

      waMessageId,

      createdAt:
        timestamp,

      updatedAt:
        timestamp,

      resolvedAt:
        null,

      resolvedReason:
        null,
    };

    const writes:
      Promise<any>[] = [
        conversationRef.set(
          {
            needsHumanAttention:
              true,

            needsReply:
              true,

            humanAttention:
              attention,

            updatedAt:
              timestamp,
          },
          {
            merge:
              true,
          }
        ),
      ];

    if (
      activeRunId
    ) {
      const runRef =
        (db as any).doc(
          `agents/${agentId}/magic_touch_flow_runs/${activeRunId}`
        );

      writes.push(
        runRef.set(
          {
            humanAttention: {
              required:
                true,

              reason:
                attention.reason,

              eventId:
                attention.eventId,

              conversationId,

              customerMessage:
                attention.customerMessage,

              question:
                attention.question,

              expectedActions:
                attention.expectedActions,

              responseOptions:
                attention.responseOptions,

              createdAt:
                timestamp,

              updatedAt:
                timestamp,

              resolvedAt:
                null,

              resolvedReason:
                null,
            },

            updatedAt:
              timestamp,
          },
          {
            merge:
              true,
          }
        )
      );
    }

    await Promise.all(
      writes
    );

    logger.info(
      "[syncMagicTouchHumanAttention] Human attention opened",
      {
        agentId,

        eventId,

        conversationId,

        runId:
          activeRunId,

        reason:
          attention.reason,
      }
    );

    return;
  }

  /*
   * continue_flow:
   * סוגרים התראה אוטומטית רק כאשר היא שייכת
   * לאותו Run שנפתר עכשיו.
   *
   * אם Attention נוצר בלי runId ברור,
   * לא סוגרים אותו אוטומטית.
   */
  const conversationSnap =
    await conversationRef.get();

  if (
    !conversationSnap.exists
  ) {
    return;
  }

  const conversationData =
    conversationSnap.data() as any;

  const currentAttention =
    conversationData
      ?.humanAttention &&
    typeof conversationData
      .humanAttention ===
      "object"
      ? conversationData
          .humanAttention
      : null;

  const attentionRunId =
    s(
      currentAttention
        ?.runId
    ) ||
    null;

  if (
    !currentAttention ||
    currentAttention
      ?.required !==
      true ||
    !attentionRunId ||
    !activeRunId ||
    attentionRunId !==
      activeRunId
  ) {
    return;
  }

  const resolvedAt =
    nowTs();

  const writes:
    Promise<any>[] = [
      conversationRef.set(
        {
          needsHumanAttention:
            false,

          humanAttention: {
            ...currentAttention,

            required:
              false,

            resolvedAt,

            resolvedReason:
              "customer_response_resolved",

            resolvedByEventId:
              eventId ||
              null,

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

  const runRef =
    (db as any).doc(
      `agents/${agentId}/magic_touch_flow_runs/${activeRunId}`
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
              "customer_response_resolved",

            resolvedByEventId:
              eventId ||
              null,

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

  await Promise.all(
    writes
  );

  logger.info(
    "[syncMagicTouchHumanAttention] Human attention resolved",
    {
      agentId,

      eventId,

      conversationId,

      runId:
        activeRunId,
    }
  );
}
