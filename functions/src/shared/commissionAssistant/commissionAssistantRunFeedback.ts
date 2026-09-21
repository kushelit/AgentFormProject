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

function getRunErrorMessage(
  runData: Record<string, any>
): string {
  const error =
    runData?.error;

  if (
    typeof error ===
      "string"
  ) {
    return s(
      error
    );
  }

  if (
    error &&
    typeof error ===
      "object"
  ) {
    return (
      s(
        error?.message
      ) ||
      s(
        error?.details
      ) ||
      s(
        error?.reason
      ) ||
      ""
    );
  }

  return (
    s(
      runData
        ?.result
        ?.error
        ?.message
    ) ||
    s(
      runData
        ?.result
        ?.error
    ) ||
    ""
  );
}

type FailureKind =
  | "credentials_invalid"
  | "otp_rejected_twice"
  | "otp_timeout"
  | "no_files"
  | "generic";

function classifyFailure({
  errorMessage,
  step,
}: {
  errorMessage:
    string;

  step:
    string;
}): FailureKind {
  const haystack =
    `${errorMessage}\n${step}`
      .toLowerCase();

  if (
    haystack.includes(
      "פרטי ההתחברות"
    ) ||
    haystack.includes(
      "שם המשתמש או הסיסמא שגויים"
    ) ||
    haystack.includes(
      "שם המשתמש או הסיסמה שגויים"
    ) ||
    (
      haystack.includes(
        "username"
      ) &&
      haystack.includes(
        "password"
      ) &&
      (
        haystack.includes(
          "invalid"
        ) ||
        haystack.includes(
          "incorrect"
        )
      )
    )
  ) {
    return "credentials_invalid";
  }

  if (
    haystack.includes(
      "קוד הזיהוי שגוי גם בניסיון השני"
    ) ||
    haystack.includes(
      "הקוד שהוזן אינו תקין"
    ) ||
    haystack.includes(
      "otp"
    ) &&
    haystack.includes(
      "second"
    ) &&
    (
      haystack.includes(
        "wrong"
      ) ||
      haystack.includes(
        "invalid"
      )
    )
  ) {
    return "otp_rejected_twice";
  }

  if (
    haystack.includes(
      "otp timeout"
    ) ||
    haystack.includes(
      "קוד לא התקבל"
    ) ||
    haystack.includes(
      "ניסיון שני"
    ) &&
    haystack.includes(
      "timeout"
    )
  ) {
    return "otp_timeout";
  }

  if (
    haystack.includes(
      "no downloads"
    ) ||
    haystack.includes(
      "no files"
    ) ||
    haystack.includes(
      "לא נמצאו קבצים"
    )
  ) {
    return "no_files";
  }

  return "generic";
}

function buildFailureMessage({
  companyName,
  kind,
  errorMessage,
}: {
  companyName:
    string;

  kind:
    FailureKind;

  errorMessage:
    string;
}): string {
  if (
    kind ===
      "credentials_invalid"
  ) {
    return (
      `❌ ${companyName} – ההתחברות נכשלה.\n` +
      "הפורטל זיהה שפרטי ההתחברות (שם משתמש / ת.ז. / סיסמה) אינם תקינים.\n" +
      "יש לעדכן את פרטי ההתחברות לפני ניסיון נוסף."
    );
  }

  if (
    kind ===
      "otp_rejected_twice"
  ) {
    return (
      `❌ ${companyName} – קוד האימות נדחה גם בניסיון השני.\n` +
      "הריצה של החברה הופסקה. אפשר לנסות להריץ אותה מחדש לאחר קבלת קוד חדש."
    );
  }

  if (
    kind ===
      "otp_timeout"
  ) {
    return (
      `⌛ ${companyName} – לא התקבל קוד אימות בזמן.\n` +
      "הריצה של החברה הופסקה. אפשר להפעיל אותה מחדש ולשלוח את הקוד כשהוא מתקבל."
    );
  }

  if (
    kind ===
      "no_files"
  ) {
    return (
      `⚠️ ${companyName} – הריצה הסתיימה בלי קבצים להורדה.\n` +
      "ייתכן שהדוחות עדיין לא פורסמו בפורטל או שלא נמצאו נתונים זמינים."
    );
  }

  const safeProviderMessage =
    errorMessage &&
    /[\u0590-\u05FF]/.test(
      errorMessage
    ) &&
    errorMessage.length <=
      280
      ? errorMessage
      : "";

  return (
    `❌ ${companyName} – הריצה הסתיימה עם שגיאה.` +
    (
      safeProviderMessage
        ? `\n${safeProviderMessage}`
        : "\nאפשר לנסות שוב. אם הבעיה חוזרת, כדאי לבדוק את פרטי הריצה במערכת."
    )
  );
}

async function claimFailureNotification({
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
          Record<string, any>;

      const currentStatus =
        s(
          data?.status
        );

      if (
        currentStatus !==
          "error" &&
        currentStatus !==
          "failed"
      ) {
        return;
      }

      const sentStatus =
        s(
          data
            ?.commissionAssistantFeedback
            ?.failureNotificationStatus
        );

      const sentEventId =
        s(
          data
            ?.commissionAssistantFeedback
            ?.failureNotificationEventId
        );

      if (
        sentStatus ===
          currentStatus &&
        sentEventId
      ) {
        return;
      }

      const sendingEventId =
        s(
          data
            ?.commissionAssistantFeedback
            ?.failureNotificationSendingEventId
        );

      const sendingAtMs =
        timestampToMillis(
          data
            ?.commissionAssistantFeedback
            ?.failureNotificationSendingAt
        );

      if (
        sendingEventId &&
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
          "commissionAssistantFeedback.failureNotificationSendingEventId":
            eventId,

          "commissionAssistantFeedback.failureNotificationSendingAt":
            nowTs(),

          "commissionAssistantFeedback.failureNotificationError":
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

export async function handleCommissionAssistantRunFailureChange({
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
    Record<string, any> |
    null;

  after:
    Record<string, any>;

  eventId:
    string;
}): Promise<void> {
  if (
    s(
      after?.triggeredFrom
    ) !==
      "commission_assistant"
  ) {
    return;
  }

  const afterStatus =
    s(
      after?.status
    );

  if (
    afterStatus !==
      "error" &&
    afterStatus !==
      "failed"
  ) {
    return;
  }

  const beforeStatus =
    s(
      before?.status
    );

  if (
    beforeStatus ===
      afterStatus
  ) {
    return;
  }

  const whatsappAgentId =
    s(
      after?.whatsappAgentId
    );

  const conversationId =
    s(
      after?.conversationId
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
    await claimFailureNotification({
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
      after?.companyName
    ) ||
    "החברה";

  const step =
    s(
      after?.step
    );

  const errorMessage =
    getRunErrorMessage(
      after
    );

  const kind =
    classifyFailure({
      errorMessage,
      step,
    });

  const text =
    buildFailureMessage({
      companyName,
      kind,
      errorMessage,
    });

  try {
    const result =
      await sendWhatsAppConversationText({
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

    await runRef.update({
      "commissionAssistantFeedback.failureNotificationStatus":
        afterStatus,

      "commissionAssistantFeedback.failureNotificationKind":
        kind,

      "commissionAssistantFeedback.failureNotificationEventId":
        safeEventId,

      "commissionAssistantFeedback.failureNotificationSentAt":
        nowTs(),

      "commissionAssistantFeedback.failureNotificationWaMessageId":
        s(
          result?.waMessageId
        ) ||
        null,

      "commissionAssistantFeedback.failureNotificationSendingEventId":
        null,

      "commissionAssistantFeedback.failureNotificationSendingAt":
        null,

      "commissionAssistantFeedback.failureNotificationError":
        null,

      updatedAt:
        nowTs(),
    });

    logger.info(
      "[commissionAssistantRunFeedback] Failure notification sent",
      {
        runId,
        companyId:
          s(
            after?.companyId
          ),
        companyName,
        status:
          afterStatus,
        kind,
      }
    );
  } catch (
    error: any
  ) {
    await runRef.update({
      "commissionAssistantFeedback.failureNotificationSendingEventId":
        null,

      "commissionAssistantFeedback.failureNotificationSendingAt":
        null,

      "commissionAssistantFeedback.failureNotificationError": {
        message:
          s(
            error?.message ||
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
