/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  logger,
} from "firebase-functions";

import {
  nowTs,
} from "../admin";

import {
  sendWhatsAppConversationText,
} from "../sendWhatsAppConversationText";

import {
  loadCommissionAssistantConfig,
  isCommissionAssistantTarget,
} from "./commissionAssistantConfig";

import {
  findCommissionAssistantRequesterByPhone,
} from "./commissionAssistantUserLookup";

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

function timestampToMillis(
  value: any
): number {
  if (
    !value
  ) {
    return 0;
  }

  if (
    typeof value?.toMillis ===
      "function"
  ) {
    return value.toMillis();
  }

  if (
    typeof value?._seconds ===
      "number"
  ) {
    return value._seconds *
      1000;
  }

  if (
    typeof value?.seconds ===
      "number"
  ) {
    return value.seconds *
      1000;
  }

  return 0;
}

type OtpExtractionResult = {
  code:
    string |
    null;

  reason:
    | "exact"
    | "single_candidate"
    | "keyword_candidate"
    | "ambiguous"
    | "not_found";
};

function extractOtpCode(
  value: unknown
): OtpExtractionResult {
  const text =
    s(
      value
    );

  if (
    !text
  ) {
    return {
      code:
        null,
      reason:
        "not_found",
    };
  }

  /*
   * אם המשתמש שלח רק את הקוד, מאפשרים גם רווחים/מקפים:
   * 123456
   * 123-456
   * 123 456
   */
  const onlyCodeCandidate =
    text.replace(
      /[\s-]/g,
      ""
    );

  if (
    /^\d{4,8}$/.test(
      onlyCodeCandidate
    )
  ) {
    return {
      code:
        onlyCodeCandidate,
      reason:
        "exact",
    };
  }

  /*
   * SMS מלא:
   * אוספים רק רצפים של 4-8 ספרות.
   * מספרי טלפון ארוכים אינם נכנסים כרגע כמועמדים.
   */
  const candidateMatches =
    Array.from(
      text.matchAll(
        /(?<!\d)(\d{4,8})(?!\d)/g
      )
    );

  if (
    candidateMatches.length ===
      0
  ) {
    return {
      code:
        null,
      reason:
        "not_found",
    };
  }

  const uniqueCandidates =
    Array.from(
      new Map(
        candidateMatches.map(
          (
            match
          ) => [
            match[1],
            {
              code:
                match[1],

              index:
                match.index ||
                0,
            },
          ]
        )
      ).values()
    );

  if (
    uniqueCandidates.length ===
      1
  ) {
    return {
      code:
        uniqueCandidates[0]
          .code,

      reason:
        "single_candidate",
    };
  }

  /*
   * אם יש כמה מספרים ב-SMS, מעדיפים את המספר הקרוב ביותר
   * למילים שמאפיינות OTP. אין שימוש ב-AI.
   */
  const normalized =
    text.toLowerCase();

  const keywords = [
    "קוד",
    "אימות",
    "חד פעמי",
    "סיסמה",
    "otp",
    "verification",
    "verify",
    "code",
    "password",
  ];

  const keywordPositions:
    number[] = [];

  for (
    const keyword of
    keywords
  ) {
    let fromIndex =
      0;

    while (
      fromIndex <
      normalized.length
    ) {
      const found =
        normalized.indexOf(
          keyword,
          fromIndex
        );

      if (
        found <
        0
      ) {
        break;
      }

      keywordPositions.push(
        found
      );

      fromIndex =
        found +
        keyword.length;
    }
  }

  if (
    keywordPositions.length >
      0
  ) {
    const scored =
      uniqueCandidates
        .map(
          (
            candidate
          ) => {
            const distance =
              Math.min(
                ...keywordPositions.map(
                  (
                    keywordIndex
                  ) =>
                    Math.abs(
                      candidate.index -
                      keywordIndex
                    )
                )
              );

            return {
              ...candidate,
              distance,
            };
          }
        )
        .sort(
          (
            a,
            b
          ) =>
            a.distance -
            b.distance
        );

    if (
      scored[0] &&
      scored[0].distance <=
        80 &&
      (
        !scored[1] ||
        scored[0].distance <
          scored[1].distance
      )
    ) {
      return {
        code:
          scored[0].code,

        reason:
          "keyword_candidate",
      };
    }
  }

  return {
    code:
      null,

    reason:
      "ambiguous",
  };
}

async function persistSanitizedOtpInbound({
  db,
  whatsappAgentId,
  conversationId,
  phoneNumberId,
  phoneNormalized,
  inboundWaMessageId,
  runId,
  markerText,
  result,
}: {
  db:
    FirebaseFirestore.Firestore;

  whatsappAgentId:
    string;

  conversationId:
    string;

  phoneNumberId:
    string;

  phoneNormalized:
    string;

  inboundWaMessageId:
    string;

  runId:
    string;

  markerText:
    string;

  result:
    string;
}): Promise<void> {
  const timestamp =
    nowTs();

  const conversationRef =
    db.doc(
      `whatsapp_conversations/${conversationId}`
    );

  const conversationSnap =
    await conversationRef.get();

  const contactId =
    conversationSnap.exists
      ? s(
          conversationSnap
            .data()
            ?.contactId
        )
      : "";

  const messageRef =
    inboundWaMessageId
      ? conversationRef
          .collection(
            "messages"
          )
          .doc(
            inboundWaMessageId
          )
      : conversationRef
          .collection(
            "messages"
          )
          .doc();

  /*
   * אין שמירה של הקוד עצמו ואין rawJson.
   * נשמר רק marker טכני מסונן.
   */
  await Promise.all([
    conversationRef.set(
      {
        agentId:
          whatsappAgentId,

        contactId:
          contactId ||
          null,

        phoneNumberId,

        customerPhone:
          phoneNormalized,

        status:
          "open",

        lastMessageText:
          markerText,

        lastMessageType:
          "text",

        lastMessageDirection:
          "inbound",

        lastMessageAt:
          timestamp,

        lastMessageWaMessageId:
          null,

        lastMessageStatus:
          null,

        lastMessageStatusAt:
          null,

        lastMessageProviderStatus:
          null,

        lastInboundAt:
          timestamp,

        needsReply:
          false,

        updatedAt:
          timestamp,
      },
      {
        merge:
          true,
      }
    ),

    messageRef.set(
      {
        agentId:
          whatsappAgentId,

        contactId:
          contactId ||
          null,

        conversationId,

        direction:
          "inbound",

        from:
          phoneNormalized,

        toPhoneNumberId:
          phoneNumberId,

        type:
          "text",

        text:
          markerText,

        waMessageId:
          inboundWaMessageId ||
          null,

        status:
          "received",

        source:
          "commission_assistant_otp",

        sensitiveContentRedacted:
          true,

        rawJson:
          null,

        commissionAssistantOtp: {
          runId,
          result,
        },

        createdAt:
          timestamp,

        updatedAt:
          timestamp,
      },
      {
        merge:
          true,
      }
    ),

    db
      .collection(
        "whatsapp_inbound_messages"
      )
      .add({
        agentId:
          whatsappAgentId,

        contactId:
          contactId ||
          null,

        conversationId,

        phoneNumberId,

        from:
          phoneNormalized,

        type:
          "text",

        text:
          markerText,

        waMessageId:
          inboundWaMessageId ||
          null,

        mappingStatus:
          "commission_otp_redacted",

        sensitiveContentRedacted:
          true,

        rawJson:
          null,

        commissionAssistantOtp: {
          runId,
          result,
        },

        createdAt:
          timestamp,
      }),
  ]);
}

async function sendOtpAssistantMessage({
  whatsappAgentId,
  conversationId,
  text,
}: {
  whatsappAgentId:
    string;

  conversationId:
    string;

  text:
    string;
}) {
  return sendWhatsAppConversationText({
    agentId:
      whatsappAgentId,

    conversationId,

    text,

    sentBy:
      "commission_assistant",

    sentByName:
      "MagicSale עמלות",

    source:
      "commission_assistant",
  });
}

async function findActiveCommissionOtpRun({
  db,
  requesterAgentId,
  whatsappAgentId,
  conversationId,
}: {
  db:
    FirebaseFirestore.Firestore;

  requesterAgentId:
    string;

  whatsappAgentId:
    string;

  conversationId:
    string;
}): Promise<{
  runId:
    string;

  data:
    Record<
      string,
      any
    >;
} | null> {
  const snap =
    await db
      .collection(
        "portalImportRuns"
      )
      .where(
        "agentId",
        "==",
        requesterAgentId
      )
      .where(
        "status",
        "==",
        "otp_required"
      )
      .limit(
        10
      )
      .get();

  const matches =
    snap.docs
      .map(
        (
          doc: any
        ) => ({
          runId:
            doc.id,

          data:
            doc.data() as
              Record<
                string,
                any
              >,
        })
      )
      .filter(
        (
          item: {
            runId: string;
            data: Record<string, any>;
          }
        ) =>
          s(
            item.data
              ?.triggeredFrom
          ) ===
            "commission_assistant" &&
          s(
            item.data
              ?.whatsappAgentId
          ) ===
            whatsappAgentId &&
          s(
            item.data
              ?.conversationId
          ) ===
            conversationId &&
          s(
            item.data
              ?.otp
              ?.mode
          ).toLowerCase() !==
            "manual"
      )
      .sort(
        (
          a: {
            runId: string;
            data: Record<string, any>;
          },
          b: {
            runId: string;
            data: Record<string, any>;
          }
        ) =>
          timestampToMillis(
            b.data
              ?.updatedAt
          ) -
          timestampToMillis(
            a.data
              ?.updatedAt
          )
      );

  return matches[0] ||
    null;
}

export type CommissionAssistantOtpInboundResult = {
  handled:
    boolean;

  reason:
    string;

  runId?:
    string |
    null;

  requesterAgentId?:
    string |
    null;
};

export async function tryHandleCommissionAssistantOtpInbound({
  db,
  whatsappAgentId,
  phoneNumberId,
  conversationId,
  phoneNormalized,
  messageText,
  messageType,
  inboundWaMessageId,
}: {
  db:
    FirebaseFirestore.Firestore;

  whatsappAgentId:
    string;

  phoneNumberId:
    string;

  conversationId:
    string;

  phoneNormalized:
    string;

  messageText?:
    string |
    null;

  messageType?:
    string |
    null;

  inboundWaMessageId?:
    string |
    null;
}): Promise<CommissionAssistantOtpInboundResult> {
  const config =
    await loadCommissionAssistantConfig(
      db
    );

  if (
    !config ||
    !isCommissionAssistantTarget({
      config,
      whatsappAgentId,
      phoneNumberId,
    })
  ) {
    return {
      handled:
        false,
      reason:
        "not_commission_assistant_target",
    };
  }

  let requester;

  try {
    requester =
      await findCommissionAssistantRequesterByPhone({
        db,
        phoneNormalized,
      });
  } catch {
    return {
      handled:
        false,
      reason:
        "requester_lookup_failed",
    };
  }

  if (
    !requester
  ) {
    return {
      handled:
        false,
      reason:
        "requester_not_found",
    };
  }

  const active =
    await findActiveCommissionOtpRun({
      db,

      requesterAgentId:
        requester.requesterAgentId,

      whatsappAgentId:
        config.whatsappAgentId,

      conversationId,
    });

  if (
    !active
  ) {
    return {
      handled:
        false,
      reason:
        "no_active_commission_otp",

      requesterAgentId:
        requester.requesterAgentId,
    };
  }

  const runId =
    active.runId;

  const runData =
    active.data;

  const companyName =
    s(
      runData
        ?.companyName
    ) ||
    "החברה";

  const normalizedMessageType =
    s(
      messageType
    );

  if (
    normalizedMessageType !==
      "text"
  ) {
    await persistSanitizedOtpInbound({
      db,
      whatsappAgentId:
        config.whatsappAgentId,
      conversationId,
      phoneNumberId,
      phoneNormalized,
      inboundWaMessageId:
        s(
          inboundWaMessageId
        ),
      runId,
      markerText:
        "[התקבלה הודעה בזמן המתנה לקוד אימות]",
      result:
        "unsupported_message_type",
    });

    await sendOtpAssistantMessage({
      whatsappAgentId:
        config.whatsappAgentId,

      conversationId,

      text:
        `אני מחכה כרגע לקוד האימות של ${companyName}. שלח את הקוד כמספר בהודעת טקסט, או הדבק את הודעת ה-SMS המלאה.`,
    });

    return {
      handled:
        true,
      reason:
        "otp_waiting_for_text",

      runId,

      requesterAgentId:
        requester.requesterAgentId,
    };
  }

  const extraction =
    extractOtpCode(
      messageText
    );

  if (
    !extraction.code
  ) {
    await persistSanitizedOtpInbound({
      db,
      whatsappAgentId:
        config.whatsappAgentId,
      conversationId,
      phoneNumberId,
      phoneNormalized,
      inboundWaMessageId:
        s(
          inboundWaMessageId
        ),
      runId,
      markerText:
        "[הודעת אימות התקבלה - לא זוהה קוד]",
      result:
        extraction.reason,
    });

    await sendOtpAssistantMessage({
      whatsappAgentId:
        config.whatsappAgentId,

      conversationId,

      text:
        `לא הצלחתי לזהות קוד אימות חד-משמעי עבור ${companyName}. שלח רק את הקוד שקיבלת, למשל: 123456.`,
    });

    return {
      handled:
        true,
      reason:
        `otp_${extraction.reason}`,

      runId,

      requesterAgentId:
        requester.requesterAgentId,
    };
  }

  const runRef =
    db.doc(
      `portalImportRuns/${runId}`
    );

  const transactionResult =
    await db.runTransaction<
      | "written"
      | "duplicate"
      | "already_has_value"
      | "no_longer_waiting"
    >(
      async (
        transaction
      ) => {
        const snap =
          await transaction.get(
            runRef
          );

        if (
          !snap.exists
        ) {
          return "no_longer_waiting";
        }

        const current =
          snap.data() as
            Record<
              string,
              any
            >;

        if (
          s(
            current
              ?.status
          ) !==
            "otp_required" ||
          s(
            current
              ?.triggeredFrom
          ) !==
            "commission_assistant" ||
          s(
            current
              ?.conversationId
          ) !==
            conversationId
        ) {
          return "no_longer_waiting";
        }

        const currentMessageId =
          s(
            current
              ?.commissionAssistantOtp
              ?.lastInboundWaMessageId
          );

        if (
          currentMessageId &&
          currentMessageId ===
            s(
              inboundWaMessageId
            )
        ) {
          return "duplicate";
        }

        const existingOtp =
          s(
            current
              ?.otp
              ?.value
          );

        if (
          existingOtp
        ) {
          return "already_has_value";
        }

        const currentOtpMode =
          s(
            current
              ?.otp
              ?.mode
          ) ||
          "firestore";

        transaction.update(
          runRef,
          {
            "otp.state":
              "required",

            "otp.value":
              extraction.code,

            "otp.mode":
              currentOtpMode,

            "commissionAssistantOtp.lastInboundWaMessageId":
              s(
                inboundWaMessageId
              ) ||
              null,

            "commissionAssistantOtp.lastReceivedAt":
              nowTs(),

            "commissionAssistantOtp.lastSource":
              "whatsapp",

            "commissionAssistantOtp.lastExtractionReason":
              extraction.reason,

            updatedAt:
              nowTs(),
          }
        );

        return "written";
      }
    );

  if (
    transactionResult ===
      "duplicate"
  ) {
    return {
      handled:
        true,
      reason:
        "otp_duplicate_message",

      runId,

      requesterAgentId:
        requester.requesterAgentId,
    };
  }

  const markerText =
    transactionResult ===
      "written"
      ? "[קוד אימות התקבל]"
      : "[קוד אימות התקבל לאחר סיום/שליחה קודמת]";

  await persistSanitizedOtpInbound({
    db,
    whatsappAgentId:
      config.whatsappAgentId,
    conversationId,
    phoneNumberId,
    phoneNormalized,
    inboundWaMessageId:
      s(
        inboundWaMessageId
      ),
    runId,
    markerText,
    result:
      transactionResult,
  });

  if (
    transactionResult ===
      "written"
  ) {
    await sendOtpAssistantMessage({
      whatsappAgentId:
        config.whatsappAgentId,

      conversationId,

      text:
        `קוד האימות עבור ${companyName} התקבל ✅ אני מעביר אותו ל-Runner. הריצה תמשיך אוטומטית.`,
    });

    logger.info(
      "[commissionAssistantOtp] OTP received from WhatsApp",
      {
        runId,

        requesterAgentId:
          requester.requesterAgentId,

        companyId:
          s(
            runData
              ?.companyId
          ),

        extractionReason:
          extraction.reason,
      }
    );

    return {
      handled:
        true,
      reason:
        "otp_written_to_run",

      runId,

      requesterAgentId:
        requester.requesterAgentId,
    };
  }

  await sendOtpAssistantMessage({
    whatsappAgentId:
      config.whatsappAgentId,

    conversationId,

    text:
      transactionResult ===
        "already_has_value"
        ? `כבר התקבל קוד אימות עבור ${companyName}. ה-Runner מטפל בו כרגע.`
        : `כרגע ${companyName} כבר לא ממתינה לקוד אימות. הקוד שנשלח לא נשמר.`,
  });

  return {
    handled:
      true,

    reason:
      transactionResult ===
        "already_has_value"
        ? "otp_value_already_present"
        : "otp_request_no_longer_active",

    runId,

    requesterAgentId:
      requester.requesterAgentId,
  };
}

async function claimOtpPrompt({
  db,
  runRef,
  eventId,
}: {
  db:
    FirebaseFirestore.Firestore;

  runRef:
    FirebaseFirestore.DocumentReference;

  eventId:
    string;
}): Promise<boolean> {
  let claimed =
    false;

  await db.runTransaction(
    async (
      transaction
    ) => {
      const snap =
        await transaction.get(
          runRef
        );

      if (
        !snap.exists
      ) {
        return;
      }

      const data =
        snap.data() as
          Record<
            string,
            any
          >;

      if (
        s(
          data
            ?.status
        ) !==
          "otp_required"
      ) {
        return;
      }

      if (
        s(
          data
            ?.commissionAssistantOtp
            ?.promptSentEventId
        ) ===
          eventId
      ) {
        return;
      }

      const sendingEventId =
        s(
          data
            ?.commissionAssistantOtp
            ?.promptSendingEventId
        );

      const sendingAtMs =
        timestampToMillis(
          data
            ?.commissionAssistantOtp
            ?.promptSendingAt
        );

      if (
        sendingEventId ===
          eventId &&
        sendingAtMs &&
        Date.now() -
          sendingAtMs <
          2 *
            60 *
            1000
      ) {
        return;
      }

      transaction.update(
        runRef,
        {
          "commissionAssistantOtp.promptSendingEventId":
            eventId,

          "commissionAssistantOtp.promptSendingAt":
            nowTs(),

          "commissionAssistantOtp.promptError":
            null,

          updatedAt:
            nowTs(),
        }
      );

      claimed =
        true;
    }
  );

  return claimed;
}

export async function handleCommissionAssistantOtpRunChange({
  db,
  runId,
  before,
  after,
  eventId,
}: {
  db:
    FirebaseFirestore.Firestore;

  runId:
    string;

  before:
    Record<
      string,
      any
    > |
    null;

  after:
    Record<
      string,
      any
    >;

  eventId:
    string;
}): Promise<void> {
  const beforeStatus =
    s(
      before
        ?.status
    );

  const afterStatus =
    s(
      after
        ?.status
    );

  /*
   * שולחים בקשת OTP רק במעבר לתוך otp_required.
   * כתיבת otp.value עצמה משאירה את ה-status על otp_required,
   * ולכן אינה גורמת להודעת WhatsApp נוספת.
   */
  if (
    beforeStatus ===
      "otp_required" ||
    afterStatus !==
      "otp_required"
  ) {
    return;
  }

  if (
    s(
      after
        ?.triggeredFrom
    ) !==
      "commission_assistant"
  ) {
    return;
  }

  const otpMode =
    s(
      after
        ?.otp
        ?.mode
    ).toLowerCase();

  if (
    otpMode ===
      "manual"
  ) {
    return;
  }

  const whatsappAgentId =
    s(
      after
        ?.whatsappAgentId
    );

  const conversationId =
    s(
      after
        ?.conversationId
    );

  if (
    !whatsappAgentId ||
    !conversationId
  ) {
    return;
  }

  const runRef =
    db.doc(
      `portalImportRuns/${runId}`
    );

  const safeEventId =
    s(
      eventId
    ) ||
    `${runId}:${Date.now()}`;

  const claimed =
    await claimOtpPrompt({
      db,
      runRef,
      eventId:
        safeEventId,
    });

  if (
    !claimed
  ) {
    return;
  }

  const companyName =
    s(
      after
        ?.companyName
    ) ||
    "החברה";

  const hint =
    s(
      after
        ?.otp
        ?.hint
    );

  const providerStep =
    s(
      after
        ?.step
    );

  const providerStepLower =
    providerStep.toLowerCase();

  const isOtpRetry =
    providerStepLower.includes(
      "הקוד הקודם היה שגוי"
    ) ||
    (
      providerStepLower.includes(
        "קוד"
      ) &&
      providerStepLower.includes(
        "שגוי"
      ) &&
      (
        providerStepLower.includes(
          "שוב"
        ) ||
        providerStepLower.includes(
          "ניסיון"
        )
      )
    );

  const otpPromptText =
    isOtpRetry
      ? (
          `⚠️ הקוד שהוזן עבור ${companyName} שגוי.\n` +
          "יש להזין שוב את קוד האימות.\n" +
          "אם קיבלת קוד חדש ב-SMS — שלח את הקוד החדש. אם לא נשלח קוד חדש — אפשר לשלוח שוב את הקוד שכבר קיבלת." +
          (
            hint
              ? `\n\n${hint}`
              : ""
          ) +
          "\n\nאפשר גם להדביק את הודעת ה-SMS המלאה.\nמומלץ להשיב בהקדם — ה-Runner ממתין לקוד כרגע."
        )
      : (
          `🔐 נדרש קוד אימות עבור ${companyName}.\n` +
          (
            hint
              ? `\n${hint}\n`
              : ""
          ) +
          "\nשלח כאן את הקוד שקיבלת ב-SMS. אפשר גם להדביק את הודעת ה-SMS המלאה.\nמומלץ להשיב בהקדם — ה-Runner ממתין לקוד כרגע."
        );

  try {
    const result =
      await sendOtpAssistantMessage({
        whatsappAgentId,
        conversationId,

        text:
          otpPromptText,
      });

    await runRef.update({
      "commissionAssistantOtp.promptSentEventId":
        safeEventId,

      "commissionAssistantOtp.promptSentAt":
        nowTs(),

      "commissionAssistantOtp.promptWaMessageId":
        s(
          result
            ?.waMessageId
        ) ||
        null,

      "commissionAssistantOtp.promptSendingEventId":
        null,

      "commissionAssistantOtp.promptSendingAt":
        null,

      "commissionAssistantOtp.promptError":
        null,

      updatedAt:
        nowTs(),
    });

    logger.info(
      "[commissionAssistantOtp] OTP request sent to WhatsApp",
      {
        runId,

        companyId:
          s(
            after
              ?.companyId
          ),

        companyName,
      }
    );
  } catch (
    error: any
  ) {
    await runRef.update({
      "commissionAssistantOtp.promptSendingEventId":
        null,

      "commissionAssistantOtp.promptSendingAt":
        null,

      "commissionAssistantOtp.promptError": {
        message:
          s(
            error
              ?.message ||
            error
          ),

        failedAt:
          nowTs(),
      },

      updatedAt:
        nowTs(),
    });

    throw error;
  }
}
