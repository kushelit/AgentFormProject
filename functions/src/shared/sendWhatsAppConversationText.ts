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

export interface SendWhatsAppConversationButton {
  id: string;
  title: string;
}

export interface SendWhatsAppConversationTextInput {
  agentId: string;
  conversationId: string;
  text: string;

  buttons?:
    SendWhatsAppConversationButton[];

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
  messageType:
    | "text"
    | "interactive";
}

function normalizeButtons(
  value: unknown
): SendWhatsAppConversationButton[] {
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
        button: any
      ) => ({
        id:
          safeString(
            button?.id
          ),

        title:
          safeString(
            button?.title
          ),
      })
    )
    .filter(
      (
        button
      ) =>
        Boolean(
          button.id &&
          button.title
        )
    );
}

function validateButtons(
  buttons:
    SendWhatsAppConversationButton[]
): void {
  if (
    buttons.length ===
    0
  ) {
    return;
  }

  if (
    buttons.length >
    3
  ) {
    throw new HttpsError(
      "invalid-argument",
      "WhatsApp interactive message supports up to 3 reply buttons"
    );
  }

  const ids =
    new Set<string>();

  for (
    const button of
    buttons
  ) {
    if (
      button.title.length >
      20
    ) {
      throw new HttpsError(
        "invalid-argument",
        `WhatsApp button title is too long: ${button.title}`
      );
    }

    if (
      button.id.length >
      256
    ) {
      throw new HttpsError(
        "invalid-argument",
        `WhatsApp button action is too long: ${button.id}`
      );
    }

    if (
      ids.has(
        button.id
      )
    ) {
      throw new HttpsError(
        "invalid-argument",
        `Duplicate WhatsApp button action: ${button.id}`
      );
    }

    ids.add(
      button.id
    );
  }
}

export async function sendWhatsAppConversationText({
  agentId,
  conversationId,
  text,
  buttons = [],
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

  const normalizedButtons =
    normalizeButtons(
      buttons
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

  if (
    !normalizedAgentId
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing agentId"
    );
  }

  if (
    !normalizedConversationId
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing conversationId"
    );
  }

  if (
    !normalizedText
  ) {
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

  if (
    !normalizedSentBy
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing sentBy"
    );
  }

  validateButtons(
    normalizedButtons
  );

  const db =
    adminDb();

  const conversationRef =
    (db as any).doc(
      `whatsapp_conversations/${normalizedConversationId}`
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

  const conversation =
    conversationSnap.data() as any;

  const conversationAgentId =
    safeString(
      conversation?.agentId
    );

  if (
    !conversationAgentId
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Conversation is missing agentId"
    );
  }

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
      conversation
        ?.customerPhone
    );

  const phoneNumberId =
    safeString(
      conversation
        ?.phoneNumberId
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
      db:
        db as any,

      agentId:
        normalizedAgentId,

      contactId:
        safeString(
          conversation
            ?.contactId
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

  if (
    !waSecretSnap.exists
  ) {
    throw new HttpsError(
      "failed-precondition",
      "WhatsApp token not configured"
    );
  }

  const keyB64 =
    safeString(
      PORTAL_ENC_KEY_B64
        .value()
    );

  if (
    !keyB64
  ) {
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

  if (
    !accessToken
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Invalid WhatsApp token"
    );
  }

  const messageType:
    | "text"
    | "interactive" =
    normalizedButtons.length >
    0
      ? "interactive"
      : "text";

  const providerBody =
    messageType ===
    "interactive"
      ? {
          messaging_product:
            "whatsapp",

          recipient_type:
            "individual",

          to:
            customerPhone,

          type:
            "interactive",

          interactive: {
            type:
              "button",

            body: {
              text:
                normalizedText,
            },

            action: {
              buttons:
                normalizedButtons.map(
                  (
                    button
                  ) => ({
                    type:
                      "reply",

                    reply: {
                      id:
                        button.id,

                      title:
                        button.title,
                    },
                  })
                ),
            },
          },
        }
      : {
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
        };

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
          JSON.stringify(
            providerBody
          ),
      }
    );

  const waData: any =
    await waRes.json();

  const waMessageId =
    safeString(
      waData
        ?.messages?.[0]
        ?.id
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

        messageType,

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
      .collection(
        "messages"
      )
      .doc(
        waMessageId
      );

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
        messageType,

      text:
        normalizedText,

      buttons:
        normalizedButtons.length >
        0
          ? normalizedButtons
          : null,

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
        messageType,

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

  if (
    magicTouchContact
  ) {
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
          "magic_touch_document_request"
            ? "נשלחה בקשת מסמכים ב-WhatsApp"
            : source ===
              "magic_touch_automation"
              ? (
                  messageType ===
                  "interactive"
                    ? "נשלחה הודעת WhatsApp עם כפתורי תשובה"
                    : "נשלחה הודעת WhatsApp אוטומטית"
                )
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

          messageType,

          buttons:
            normalizedButtons.length >
            0
              ? normalizedButtons
              : null,

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

    messageType,
  };
}
