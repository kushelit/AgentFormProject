/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
  nowTs,
} from "./admin";

import {
  PORTAL_ENC_KEY_B64,
} from "./secrets";

import {
  decryptJsonAes256Gcm,
} from "./cryptoAesGcm";

import {
  safeString,
} from "./magicTouchContacts";

import {
  resolveMagicTouchContact,
} from "./magicTouchContactLookup";

import {
  addMagicTouchTimelineEvent,
} from "./magicTouchTimelineService";

const WA_API_URL =
  "https://graph.facebook.com/v25.0";

export interface SendWhatsAppConversationTextInput {
  agentId: string;
  conversationId: string;
  text: string;

  sentBy: string;
  sentByName?: string | null;

source:
  | "user"
  | "magic_touch_automation"
  | "magic_touch_document_request";

  flowRunId?: string | null;
  flowId?: string | null;
  eventId?: string | null;
}

export interface SendWhatsAppConversationTextResult {
  ok: true;
  agentId: string;
  contactId: string | null;
  conversationId: string;
  waMessageId: string;
}

export async function sendWhatsAppConversationText({
  agentId,
  conversationId,
  text,
  sentBy,
  sentByName = null,
  source,
  flowRunId = null,
  flowId = null,
  eventId = null,
}: SendWhatsAppConversationTextInput): Promise<SendWhatsAppConversationTextResult> {
  const normalizedAgentId =
    safeString(
      agentId
    );

  const normalizedConversationId =
    safeString(
      conversationId
    );

  const normalizedText =
    safeString(
      text
    );

 const normalizedSentBy =
  safeString(
    sentBy
  ) ||
  (
    source ===
    "magic_touch_automation"
      ? "magic_touch_automation"
      : source ===
        "magic_touch_document_request"
        ? "magic_touch_document_request"
        : ""
  );

  if (!normalizedAgentId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  if (!normalizedConversationId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing conversationId"
    );
  }

  if (!normalizedText) {
    throw new HttpsError(
      "invalid-argument",
      "Missing text"
    );
  }

  if (
    normalizedText.length >
    4096
  ) {
    throw new HttpsError(
      "invalid-argument",
      "WhatsApp message is too long"
    );
  }

  if (!normalizedSentBy) {
    throw new HttpsError(
      "invalid-argument",
      "Missing sentBy"
    );
  }

  const db =
    adminDb();

  const conversationRef =
    (db as any).doc(
      `whatsapp_conversations/${normalizedConversationId}`
    );

  const conversationSnap =
    await conversationRef.get();

  if (!conversationSnap.exists) {
    throw new HttpsError(
      "not-found",
      "Conversation not found"
    );
  }

  const conversation =
    conversationSnap.data() as any;

  const conversationAgentId =
    safeString(
      conversation?.agentId
    );

  if (!conversationAgentId) {
    throw new HttpsError(
      "failed-precondition",
      "Conversation is missing agentId"
    );
  }

  /*
   * הגנה קריטית בין סביבות וסוכנים:
   * ה-Dispatcher רשאי לשלוח רק בשיחה ששייכת ל-agentId של ה-Run.
   */
  if (
    conversationAgentId !==
    normalizedAgentId
  ) {
    throw new HttpsError(
      "permission-denied",
      "Conversation does not belong to the requested agent"
    );
  }

  const customerPhone =
    safeString(
      conversation?.customerPhone
    );

  const phoneNumberId =
    safeString(
      conversation?.phoneNumberId
    );

  if (
    !customerPhone ||
    !phoneNumberId
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Conversation is missing phone data"
    );
  }

  const magicTouchContact =
    await resolveMagicTouchContact({
      db: db as any,

      agentId:
        normalizedAgentId,

      contactId:
        safeString(
          conversation?.contactId
        ) ||
        null,

      phone:
        customerPhone,
    });

  const contactId =
    magicTouchContact
      ?.contactId ||
    null;

  const waSecretSnap =
    await (db as any)
      .doc(
        `agents/${normalizedAgentId}/secrets/whatsapp`
      )
      .get();

  if (!waSecretSnap.exists) {
    throw new HttpsError(
      "failed-precondition",
      "WhatsApp token not configured"
    );
  }

  const keyB64 =
    safeString(
      PORTAL_ENC_KEY_B64.value()
    );

  if (!keyB64) {
    throw new HttpsError(
      "internal",
      "Missing encryption key"
    );
  }

  const waSecret =
    waSecretSnap.data() as any;

  const {
    accessToken,
  } =
    decryptJsonAes256Gcm(
      keyB64,
      waSecret.enc
    ) as any;

  if (!accessToken) {
    throw new HttpsError(
      "failed-precondition",
      "Invalid WhatsApp token"
    );
  }

  const waRes =
    await fetch(
      `${WA_API_URL}/${phoneNumberId}/messages`,
      {
        method:
          "POST",

        headers: {
          "Authorization":
            `Bearer ${accessToken}`,

          "Content-Type":
            "application/json",
        },

        body:
          JSON.stringify({
            messaging_product:
              "whatsapp",

            recipient_type:
              "individual",

            to:
              customerPhone,

            type:
              "text",

            text: {
              preview_url:
                true,

              body:
                normalizedText,
            },
          }),
      }
    );

  const waData: any =
    await waRes.json();

  const waMessageId =
    safeString(
      waData?.messages?.[0]?.id
    );

  if (
    !waRes.ok ||
    !waMessageId
  ) {
    console.error(
      "[sendWhatsAppConversationText] WA error",
      {
        agentId:
          normalizedAgentId,

        conversationId:
          normalizedConversationId,

        source,

        flowRunId,

        response:
          waData,
      }
    );

    throw new HttpsError(
      "failed-precondition",
      waData?.error?.message ||
        "Failed to send WhatsApp message"
    );
  }

  const timestamp =
    nowTs();

  const messageRef =
    conversationRef
      .collection("messages")
      .doc(waMessageId);

  await messageRef.set(
    {
      agentId:
        normalizedAgentId,

      contactId,

      conversationId:
        normalizedConversationId,

      direction:
        "outbound",

      fromPhoneNumberId:
        phoneNumberId,

      to:
        customerPhone,

      type:
        "text",

      text:
        normalizedText,

      waMessageId,

      status:
        "accepted",

      sentBy:
        normalizedSentBy,

      sentByName:
        safeString(
          sentByName
        ) ||
        null,

      source,

      flowRunId:
        safeString(
          flowRunId
        ) ||
        null,

      flowId:
        safeString(
          flowId
        ) ||
        null,

      eventId:
        safeString(
          eventId
        ) ||
        null,

      createdAt:
        timestamp,

      updatedAt:
        timestamp,
    },
    {
      merge:
        true,
    }
  );

  await conversationRef.set(
    {
      agentId:
        normalizedAgentId,

      contactId,

      lastMessageText:
        normalizedText,

      lastMessageType:
        "text",

      lastMessageDirection:
        "outbound",

      lastMessageAt:
        timestamp,

      unreadCount:
        0,

      needsReply:
        false,

      updatedAt:
        timestamp,
    },
    {
      merge:
        true,
    }
  );

  if (magicTouchContact) {
    await magicTouchContact
      .contactRef
      .set(
        {
          lastOutboundAt:
            timestamp,

          lastReplyText:
            normalizedText,

          lastWhatsAppMessageId:
            waMessageId,

          whatsappConversationId:
            normalizedConversationId,

          updatedAt:
            timestamp,
        },
        {
          merge:
            true,
        }
      );

   if (
  source !==
  "magic_touch_document_request"
) {
  try {
    await addMagicTouchTimelineEvent({
      agentId:
        normalizedAgentId,

      contactId:
        magicTouchContact
          .contactId,

      type:
        "whatsapp_message_sent",

      channel:
        "whatsapp",

      title:
        source ===
        "magic_touch_automation"
          ? "נשלחה הודעת WhatsApp אוטומטית"
          : "נשלחה הודעת WhatsApp",

      description:
        normalizedText,

      direction:
        "outbound",

      status:
        "completed",

      createdBy:
        normalizedSentBy,

      sourceSystem:
        source ===
        "user"
          ? "whatsapp"
          : "magic_touch",

      sourceRecordId:
        waMessageId,

      metadata: {
        waMessageId,

        conversationId:
          normalizedConversationId,

        phoneNumberId,

        customerPhone,

        sentByName:
          safeString(
            sentByName
          ) ||
          null,

        source,

        flowRunId:
          safeString(
            flowRunId
          ) ||
          null,

        flowId:
          safeString(
            flowId
          ) ||
          null,

        eventId:
          safeString(
            eventId
          ) ||
          null,
      },
    });
  } catch (
    timelineError: any
  ) {
    console.error(
      "[sendWhatsAppConversationText] Timeline event failed",
      {
        agentId:
          normalizedAgentId,

        contactId:
          magicTouchContact
            .contactId,

        conversationId:
          normalizedConversationId,

        waMessageId,

        source,

        error:
          timelineError
            ?.message ||
          String(
            timelineError
          ),
      }
    );
  }
}
  } else {
    console.warn(
      "[sendWhatsAppConversationText] Magic Touch contact not found",
      {
        agentId:
          normalizedAgentId,

        conversationId:
          normalizedConversationId,

        customerPhone,

        waMessageId,

        source,
      }
    );
  }

  return {
    ok:
      true,

    agentId:
      normalizedAgentId,

    contactId,

    conversationId:
      normalizedConversationId,

    waMessageId,
  };
}
