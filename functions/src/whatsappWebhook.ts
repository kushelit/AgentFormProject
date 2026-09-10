/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { FieldPath, FieldValue } from "firebase-admin/firestore";

import { adminDb, nowTs } from "./shared/admin";

import {
  OPENAI_API_KEY,
  PORTAL_ENC_KEY_B64,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN,
} from "./shared/secrets";

import {
  decryptJsonAes256Gcm,
} from "./shared/cryptoAesGcm";

import {
  FUNCTIONS_REGION,
  PROJECT_ID,
} from "./shared/region";


import {
  getOrCreateMagicTouchContactFromWhatsApp,
} from "./shared/getOrCreateMagicTouchContactFromWhatsApp";

import {
  addMagicTouchTimelineEvent,
} from "./shared/magicTouchTimelineService";

import {
  routeMagicTouchConversation,
} from "./shared/magicTouchConversationRouter";

import {
  downloadWhatsAppInboundMediaToStorage,
  getWhatsAppInboundMediaDescriptor,
  type StoredWhatsAppInboundMedia,
} from "./shared/downloadWhatsAppMedia";

function s(value: any): string {
  return String(value ?? "").trim();
}

const PROD_PROJECT_ID =
  "agentsale-693e8";

const TEST_WHATSAPP_PHONE_NUMBER_ID =
  "1226425417229127";

const TEST_WHATSAPP_WEBHOOK_URL =
  "https://europe-west1-magicsale-test.cloudfunctions.net/whatsappWebhook";

function splitWebhookBodyByEnvironment(
  body: any
): {
  productionBody: any | null;
  testBody: any | null;
  testChangeCount: number;
} {
  const entries =
    Array.isArray(
      body?.entry
    )
      ? body.entry
      : [];

  const productionEntries:
    any[] = [];

  const testEntries:
    any[] = [];

  let testChangeCount =
    0;

  for (
    const entry of
    entries
  ) {
    const changes =
      Array.isArray(
        entry?.changes
      )
        ? entry.changes
        : [];

    const productionChanges:
      any[] = [];

    const testChanges:
      any[] = [];

    for (
      const change of
      changes
    ) {
      if (
        change?.field !==
        "messages"
      ) {
        productionChanges.push(
          change
        );

        continue;
      }

      const phoneNumberId =
        s(
          change
            ?.value
            ?.metadata
            ?.phone_number_id
        );

      if (
        phoneNumberId ===
        TEST_WHATSAPP_PHONE_NUMBER_ID
      ) {
        testChanges.push(
          change
        );

        testChangeCount +=
          1;
      } else {
        productionChanges.push(
          change
        );
      }
    }

    if (
      productionChanges.length >
      0
    ) {
      productionEntries.push({
        ...entry,
        changes:
          productionChanges,
      });
    }

    if (
      testChanges.length >
      0
    ) {
      testEntries.push({
        ...entry,
        changes:
          testChanges,
      });
    }
  }

  const baseBody =
    body &&
    typeof body ===
      "object" &&
    !Array.isArray(
      body
    )
      ? body
      : {};

  return {
    productionBody:
      productionEntries.length >
      0
        ? {
            ...baseBody,
            entry:
              productionEntries,
          }
        : null,

    testBody:
      testEntries.length >
      0
        ? {
            ...baseBody,
            entry:
              testEntries,
          }
        : null,

    testChangeCount,
  };
}

async function forwardWebhookBodyToTest(
  body: any
): Promise<void> {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      15000
    );

  try {
    const response =
      await fetch(
        TEST_WHATSAPP_WEBHOOK_URL,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            "X-MagicTouch-Forwarded-From":
              "production",
          },

          body:
            JSON.stringify(
              body
            ),

          signal:
            controller.signal,
        }
      );

    const responseText =
      await response.text();

    if (
      !response.ok
    ) {
      throw new Error(
        `Test WhatsApp webhook returned ${response.status}: ${responseText}`
      );
    }
  } finally {
    clearTimeout(
      timeout
    );
  }
}

function normalizePhone(
  phone: string
): string {
  const digits =
    s(phone).replace(
      /\D/g,
      ""
    );

  if (
    digits.startsWith("972")
  ) {
    return digits;
  }

  if (
    digits.startsWith("0")
  ) {
    return `972${digits.slice(1)}`;
  }

  if (
    digits.length === 9
  ) {
    return `972${digits}`;
  }

  return digits;
}

function normalizeCampaignStorageKey(
  value: unknown
): string {
  return s(
    value
  )
    .replace(
      /\./g,
      "_"
    )
    .trim();
}

function resolveOutboundStatus({
  currentStatus,
  incomingStatus,
}: {
  currentStatus: string;
  incomingStatus: string;
}): string {
  const current =
    s(
      currentStatus
    ).toLowerCase();

  const incoming =
    s(
      incomingStatus
    ).toLowerCase();

  if (
    !incoming
  ) {
    return current;
  }

  if (
    current ===
      "failed" &&
    incoming !==
      "failed"
  ) {
    return current;
  }

  if (
    incoming ===
    "failed"
  ) {
    if (
      current ===
        "delivered" ||
      current ===
        "read" ||
      current ===
        "replied"
    ) {
      return current;
    }

    return "failed";
  }

  const rank:
    Record<string, number> = {
      accepted:
        0,

      sent:
        1,

      delivered:
        2,

      read:
        3,

      replied:
        4,
    };

  const currentRank =
    rank[
      current
    ] ??
    -1;

  const incomingRank =
    rank[
      incoming
    ] ??
    -1;

  if (
    incomingRank >=
    currentRank
  ) {
    return incoming;
  }

  return current ||
    incoming;
}

function getWhatsAppErrorCode(
  error: any
): string | null {
  const code =
    s(
      error
        ?.code
    );

  return code ||
    null;
}

function getWhatsAppErrorReason(
  error: any
): string | null {
  return (
    s(
      error
        ?.message
    ) ||
    s(
      error
        ?.title
    ) ||
    s(
      error
        ?.error_data
        ?.details
    ) ||
    null
  );
}

async function updateContactCampaignFields({
  db,
  agentId,
  contactId,
  campaignId,
  fields,
}: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  contactId: string;
  campaignId: string;
  fields: Record<string, any>;
}): Promise<void> {
  const campaignStorageKey =
    normalizeCampaignStorageKey(
      campaignId
    );

  if (
    !agentId ||
    !contactId ||
    !campaignStorageKey
  ) {
    return;
  }

  const contactRef =
    db.doc(
      `agents/${agentId}/magic_touch_contacts/${contactId}`
    );

  const updateArgs:
    any[] = [];

  for (
    const [
      fieldName,
      fieldValue,
    ] of Object.entries(
      fields
    )
  ) {
    updateArgs.push(
      new FieldPath(
        "engagement",
        "campaigns",
        campaignStorageKey,
        fieldName
      ),

      fieldValue
    );
  }

  if (
    updateArgs.length ===
    0
  ) {
    return;
  }

  await (
    contactRef as any
  ).update(
    ...updateArgs
  );
}


async function loadAgentWhatsAppAccessToken({
  db,
  agentId,
}: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
}): Promise<string> {
  const secretSnap =
    await db
      .doc(
        `agents/${agentId}/secrets/whatsapp`
      )
      .get();

  if (
    !secretSnap.exists
  ) {
    throw new Error(
      "WhatsApp secret was not found for agent"
    );
  }

  const keyB64 =
    s(
      PORTAL_ENC_KEY_B64
        .value()
    );

  if (
    !keyB64
  ) {
    throw new Error(
      "Missing PORTAL_ENC_KEY_B64"
    );
  }

  const secretData =
    secretSnap.data() as any;

  const decrypted =
    decryptJsonAes256Gcm(
      keyB64,
      secretData?.enc
    ) as any;

  const accessToken =
    s(
      decrypted
        ?.accessToken
    );

  if (
    !accessToken
  ) {
    throw new Error(
      "Invalid WhatsApp token for agent"
    );
  }

  return accessToken;
}

async function sendMagicTouchSafeReply({
  db,
  agentId,
  contactId,
  conversationId,
  phoneNumberId,
  to,
  replyText,
  inboundWaMessageId,
  resolvedAction,
  confidence,
}: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  contactId: string | null;
  conversationId: string;
  phoneNumberId: string;
  to: string;
  replyText: string;
  inboundWaMessageId: string;
  resolvedAction: string | null;
  confidence: number | null;
}): Promise<string> {
  const accessToken =
    await loadAgentWhatsAppAccessToken({
      db,
      agentId,
    });

  const response =
    await fetch(
      `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`,
      {
        method:
          "POST",

        headers: {
          Authorization:
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

            to,

            type:
              "text",

            text: {
              preview_url:
                false,

              body:
                replyText,
            },
          }),
      }
    );

  const responseText =
    await response.text();

  let responseBody:
    any = null;

  try {
    responseBody =
      responseText
        ? JSON.parse(
            responseText
          )
        : null;
  } catch {
    responseBody = {
      raw:
        responseText,
    };
  }

  if (
    !response.ok
  ) {
    throw new Error(
      `WhatsApp safe reply failed (${response.status}): ${responseText}`
    );
  }

  const waMessageId =
    s(
      responseBody
        ?.messages?.[0]
        ?.id
    );

  if (
    !waMessageId
  ) {
    throw new Error(
      "WhatsApp safe reply response is missing message id"
    );
  }

  const timestamp =
    nowTs();

  const conversationRef =
    db.doc(
      `whatsapp_conversations/${conversationId}`
    );

  const outboundMessageRef =
    conversationRef
      .collection(
        "messages"
      )
      .doc(
        waMessageId
      );

  await Promise.all([
    outboundMessageRef.set({
      agentId,

      contactId:
        contactId ||
        null,

      conversationId,

      direction:
        "outbound",

      fromPhoneNumberId:
        phoneNumberId,

      to,

      type:
        "text",

      text:
        replyText,

      waMessageId,

      status:
        "accepted",

      source:
        "magic_touch_ai_safe_reply",

      aiGenerated:
        true,

      aiIntent:
        resolvedAction ||
        null,

      aiConfidence:
        confidence ??
        null,

      replyToWaMessageId:
        inboundWaMessageId ||
        null,

      createdAt:
        timestamp,

      updatedAt:
        timestamp,
    }),

    conversationRef.set(
      {
        lastMessageText:
          replyText,

        lastMessageType:
          "text",

        lastMessageDirection:
          "outbound",

        lastMessageAt:
          timestamp,

        lastOutboundAt:
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
  ]);

  if (
    contactId
  ) {
    try {
      await addMagicTouchTimelineEvent({
        agentId,

        contactId,

        type:
          "whatsapp_ai_safe_reply_sent",

        channel:
          "whatsapp",

        title:
          "נשלחה תשובת WhatsApp אוטומטית",

        description:
          replyText,

        direction:
          "outbound",

        status:
          "completed",

        createdBy:
          "system:magic_touch_ai",

        sourceSystem:
          "whatsapp",

        sourceRecordId:
          waMessageId,

        metadata: {
          waMessageId,

          conversationId,

          phoneNumberId,

          customerPhone:
            to,

          inboundWaMessageId:
            inboundWaMessageId ||
            null,

          resolvedAction:
            resolvedAction ||
            null,

          confidence:
            confidence ??
            null,

          aiGenerated:
            true,
        },
      });
    } catch (
      timelineError: any
    ) {
      logger.error(
        "[whatsappWebhook] Failed to create safe reply Timeline event",
        {
          agentId,

          contactId,

          conversationId,

          waMessageId,

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

  return waMessageId;
}

function getInboundMessageText(
  message: any
): string {
  const messageType =
    s(message?.type);

  if (
    messageType === "text"
  ) {
    return s(
      message?.text?.body
    );
  }

  if (
    messageType === "button"
  ) {
    return (
      s(
        message?.button?.text
      ) ||
      s(
        message?.button?.payload
      )
    );
  }

  if (
    messageType ===
    "interactive"
  ) {
    return (
      s(
        message
          ?.interactive
          ?.button_reply
          ?.title
      ) ||
      s(
        message
          ?.interactive
          ?.button_reply
          ?.id
      ) ||
      s(
        message
          ?.interactive
          ?.list_reply
          ?.title
      ) ||
      s(
        message
          ?.interactive
          ?.list_reply
          ?.id
      )
    );
  }

  if (
    messageType === "image"
  ) {
    return (
      s(
        message
          ?.image
          ?.caption
      ) ||
      "[תמונה]"
    );
  }

  if (
    messageType === "document"
  ) {
    return (
      s(
        message
          ?.document
          ?.caption
      ) ||
      s(
        message
          ?.document
          ?.filename
      ) ||
      "[מסמך]"
    );
  }

  if (
    messageType === "audio"
  ) {
    return "[הודעה קולית]";
  }

  if (
    messageType === "video"
  ) {
    return (
      s(
        message
          ?.video
          ?.caption
      ) ||
      "[וידאו]"
    );
  }

  if (
    messageType === "sticker"
  ) {
    return "[סטיקר]";
  }

  if (
    messageType === "reaction"
  ) {
    return (
      s(
        message
          ?.reaction
          ?.emoji
      ) ||
      "[תגובה הוסרה]"
    );
  }

  if (
    messageType === "location"
  ) {
    return "[מיקום]";
  }

  if (
    messageType === "contacts"
  ) {
    return "[איש קשר]";
  }

  return messageType
    ? `[${messageType}]`
    : "[הודעה]";
}

async function findAgentByPhoneNumberId(
  db: FirebaseFirestore.Firestore,
  phoneNumberId: string
): Promise<string | null> {
  const normalizedPhoneNumberId =
    s(phoneNumberId);

  if (
    !normalizedPhoneNumberId
  ) {
    return null;
  }

  const mappingSnap =
    await db
      .doc(
        `whatsapp_phone_mappings/${normalizedPhoneNumberId}`
      )
      .get();

  if (
    !mappingSnap.exists
  ) {
    logger.warn(
      "[whatsappWebhook] WhatsApp phone mapping was not found",
      {
        phoneNumberId:
          normalizedPhoneNumberId,
      }
    );

    return null;
  }

  return (
    s(
      mappingSnap
        .data()
        ?.agentId
    ) ||
    null
  );
}

async function findOriginalMessageContext({
  db,
  conversationId,
  contextMessageId,
}: {
  db: FirebaseFirestore.Firestore;
  conversationId: string;
  contextMessageId: string;
}): Promise<{
  templateName: string;
  campaignId: string;
  campaignSource: string;
}> {
  if (
    !conversationId ||
    !contextMessageId
  ) {
    return {
      templateName:
        "",

      campaignId:
        "",

      campaignSource:
        "",
    };
  }

  const originalMessageSnap =
    await db
      .doc(
        `whatsapp_conversations/${conversationId}/messages/${contextMessageId}`
      )
      .get();

  if (
    !originalMessageSnap.exists
  ) {
    return {
      templateName:
        "",

      campaignId:
        "",

      campaignSource:
        "",
    };
  }

  const originalMessageData =
    originalMessageSnap.data() as any;

  return {
    templateName:
      s(
        originalMessageData
          ?.templateName
      ),

    campaignId:
      s(
        originalMessageData
          ?.campaignId
      ),

    campaignSource:
      s(
        originalMessageData
          ?.campaignSource
      ),
  };
}

function getNativeInteractiveAction(
  message: any
): string | null {
  const messageType =
    s(
      message?.type
    );

  if (
    messageType !==
    "interactive"
  ) {
    return null;
  }

  const buttonReplyId =
    s(
      message
        ?.interactive
        ?.button_reply
        ?.id
    );

  if (
    buttonReplyId
  ) {
    return buttonReplyId;
  }

  const listReplyId =
    s(
      message
        ?.interactive
        ?.list_reply
        ?.id
    );

  return (
    listReplyId ||
    null
  );
}

async function getQuickReplyAction({
  db,
  agentId,
  templateName,
  messageText,
}: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  templateName: string;
  messageText: string;
}): Promise<string | null> {
  if (
    !agentId ||
    !templateName ||
    !messageText
  ) {
    return null;
  }

  const templateSnap =
    await db
      .doc(
        `agents/${agentId}/whatsapp_templates/${templateName}`
      )
      .get();

  if (
    !templateSnap.exists
  ) {
    logger.warn(
      "[whatsappWebhook] Template was not found for Quick Reply mapping",
      {
        agentId,
        templateName,
        messageText,
      }
    );

    return null;
  }

  const templateData =
    templateSnap.data() as any;

  const actions =
    templateData
      ?.quickReplyActions &&
    typeof templateData
      .quickReplyActions ===
      "object" &&
    !Array.isArray(
      templateData
        .quickReplyActions
    )
      ? templateData
          .quickReplyActions
      : {};

  const action =
    s(
      actions[
        messageText
      ]
    );

  return action || null;
}


async function updateCampaignRecipientProgress({
  db,
  agentId,
  campaignId,
  contactId,
  incomingStatus,
  timestamp,
  waLastStatus,
  error,
  extraFields,
}: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  campaignId: string;
  contactId: string;
  incomingStatus: string;
  timestamp: any;
  waLastStatus?: string | null;
  error?: any;
  extraFields?: Record<string, any>;
}): Promise<void> {
  if (
    !agentId ||
    !campaignId ||
    !contactId
  ) {
    return;
  }

  const campaignRef =
    db.doc(
      `agents/${agentId}/magic_touch_campaigns/${campaignId}`
    );

  const recipientRef =
    campaignRef
      .collection(
        "recipients"
      )
      .doc(
        contactId
      );

  await db.runTransaction(
    async (
      transaction
    ) => {
      const campaignSnap =
        await transaction.get(
          campaignRef
        );

      /*
       * לא יוצרים Recipient יתום עבור campaignId
       * שאינו קמפיין אמיתי (למשל template name).
       */
      if (
        !campaignSnap.exists
      ) {
        return;
      }

      const recipientSnap =
        await transaction.get(
          recipientRef
        );

      /*
       * מונים נספרים רק עבור איש קשר שכבר שייך
       * בפועל לקמפיין. כך fallback של שיחה לא
       * יכול לייצר recipient חדש או לנפח נתונים.
       */
      if (
        !recipientSnap.exists
      ) {
        return;
      }

      const recipientData =
        recipientSnap.data() as any;

      const effectiveStatus =
        resolveOutboundStatus({
          currentStatus:
            s(
              recipientData
                ?.status
            ),
          incomingStatus,
        });

      const reachedDelivered =
        [
          "delivered",
          "read",
          "replied",
        ].includes(
          effectiveStatus
        );

      const reachedRead =
        [
          "read",
          "replied",
        ].includes(
          effectiveStatus
        );

      const reachedReplied =
        effectiveStatus ===
        "replied";

      const reachedFailed =
        effectiveStatus ===
        "failed";

      const deliveredDelta =
        reachedDelivered &&
        !recipientData
          ?.deliveredAt
          ? 1
          : 0;

      const readDelta =
        reachedRead &&
        !recipientData
          ?.readAt
          ? 1
          : 0;

      const repliedDelta =
        reachedReplied &&
        !recipientData
          ?.repliedAt
          ? 1
          : 0;

      const failedDelta =
        reachedFailed &&
        !recipientData
          ?.failedAt
          ? 1
          : 0;

      const recipientUpdate:
        Record<string, any> = {
          status:
            effectiveStatus,
          updatedAt:
            timestamp,
          ...(extraFields || {}),
        };

      if (
        waLastStatus
      ) {
        recipientUpdate.waLastStatus =
          waLastStatus;

        recipientUpdate.waLastStatusAt =
          timestamp;
      }

      if (
        deliveredDelta
      ) {
        recipientUpdate.deliveredAt =
          timestamp;
      }

      if (
        readDelta
      ) {
        recipientUpdate.readAt =
          timestamp;
      }

      if (
        repliedDelta
      ) {
        recipientUpdate.repliedAt =
          timestamp;
      }

      if (
        failedDelta
      ) {
        recipientUpdate.failedAt =
          timestamp;

        recipientUpdate.error =
          error || null;
      }

      transaction.set(
        recipientRef,
        recipientUpdate,
        {
          merge:
            true,
        }
      );

      if (
        campaignSnap.exists &&
        (
          deliveredDelta ||
          readDelta ||
          repliedDelta ||
          failedDelta
        )
      ) {
        const campaignUpdate:
          Record<string, any> = {
            updatedAt:
              timestamp,
          };

        if (
          deliveredDelta
        ) {
          campaignUpdate.deliveredCount =
            FieldValue.increment(
              deliveredDelta
            );
        }

        if (
          readDelta
        ) {
          campaignUpdate.readCount =
            FieldValue.increment(
              readDelta
            );
        }

        if (
          repliedDelta
        ) {
          campaignUpdate.repliedCount =
            FieldValue.increment(
              repliedDelta
            );
        }

        if (
          failedDelta
        ) {
          campaignUpdate.failedCount =
            FieldValue.increment(
              failedDelta
            );
        }

        transaction.set(
          campaignRef,
          campaignUpdate,
          {
            merge:
              true,
          }
        );
      }
    }
  );
}

async function updateOutboundMessageStatus({
  db,
  waMessageId,
  waStatus,
  recipientId,
  providerTimestamp,
  error,
}: {
  db: FirebaseFirestore.Firestore;
  waMessageId: string;
  waStatus: string;
  recipientId: string;
  providerTimestamp: string;
  error: any;
}): Promise<void> {
  if (
    !waMessageId
  ) {
    return;
  }

  const messageQuery =
    await db
      .collectionGroup(
        "messages"
      )
      .where(
        "waMessageId",
        "==",
        waMessageId
      )
      .limit(1)
      .get();

  if (
    messageQuery.empty
  ) {
    logger.warn(
      "[whatsappWebhook] Outbound message was not found for status update",
      {
        waMessageId,
        waStatus,
      }
    );

    return;
  }

  const messageDoc =
    messageQuery.docs[0];

  const messageData =
    messageDoc.data() as any;

  const timestamp =
    nowTs();

  const effectiveStatus =
    resolveOutboundStatus({
      currentStatus:
        s(
          messageData
            ?.waLastStatus ||
          messageData
            ?.status
        ),

      incomingStatus:
        waStatus,
    });

  const statusUpdate:
    Record<string, any> = {
      status:
        effectiveStatus,

      waLastStatus:
        waStatus,

      waLastStatusAt:
        timestamp,

      waRecipientId:
        recipientId ||
        null,

      providerStatusTimestamp:
        providerTimestamp ||
        null,

      updatedAt:
        timestamp,
    };

  if (
    waStatus === "sent"
  ) {
    statusUpdate.waSentAt =
      timestamp;
  }

  if (
    waStatus === "delivered"
  ) {
    statusUpdate.waDeliveredAt =
      timestamp;
  }

  if (
    waStatus === "read"
  ) {
    statusUpdate.waReadAt =
      timestamp;
  }

  if (
    waStatus === "failed"
  ) {
    statusUpdate.waFailedAt =
      timestamp;

    statusUpdate.waError =
      error || null;
  }

  await messageDoc.ref.set(
    statusUpdate,
    {
      merge:
        true,
    }
  );

  const campaignId =
    s(
      messageData
        ?.campaignId
    );

  const campaignSource =
    s(
      messageData
        ?.campaignSource
    );

  const agentId =
    s(
      messageData
        ?.agentId
    );

  const contactId =
    s(
      messageData
        ?.contactId
    );

  /*
   * כל שליחת תבנית שנשמרה עם campaignId
   * מעדכנת גם את הסטטוס אצל איש הקשר.
   *
   * במצב ה-MVP שלנו:
   * campaignId יכול להיות פשוט שם התבנית.
   *
   * בעתיד campaignId יכול להגיע מקמפיין
   * אמיתי ונפרד.
   */
  if (
    campaignId &&
    agentId &&
    contactId
  ) {
    const campaignStorageKey =
      normalizeCampaignStorageKey(
        campaignId
      );

    const contactRef =
      db.doc(
        `agents/${agentId}/magic_touch_contacts/${contactId}`
      );

    const contactSnap =
      await contactRef.get();

    const contactData =
      contactSnap.exists
        ? contactSnap.data() as any
        : {};

    const currentCampaignStatus =
      campaignStorageKey
        ? s(
            contactData
              ?.engagement
              ?.campaigns
              ?.[campaignStorageKey]
              ?.status
          )
        : "";

    const effectiveCampaignStatus =
      resolveOutboundStatus({
        currentStatus:
          currentCampaignStatus,

        incomingStatus:
          waStatus,
      });

    const contactCampaignUpdate:
      Record<string, any> = {
        status:
          effectiveCampaignStatus,

        deliveryStatus:
          waStatus,

        waLastStatus:
          waStatus,

        waLastStatusAt:
          timestamp,

        waMessageId,

        providerStatusTimestamp:
          providerTimestamp ||
          null,

        updatedAt:
          timestamp,
      };

    if (
      waStatus ===
        "sent"
    ) {
      contactCampaignUpdate
        .sentConfirmedAt =
        timestamp;
    }

    if (
      waStatus ===
        "delivered"
    ) {
      contactCampaignUpdate
        .deliveredAt =
        timestamp;
    }

    if (
      waStatus ===
        "read"
    ) {
      contactCampaignUpdate
        .readAt =
        timestamp;
    }

    if (
      waStatus ===
        "failed"
    ) {
      contactCampaignUpdate
        .failedAt =
        timestamp;

      contactCampaignUpdate
        .failureCode =
        getWhatsAppErrorCode(
          error
        );

      contactCampaignUpdate
        .failureReason =
        getWhatsAppErrorReason(
          error
        );

      contactCampaignUpdate
        .error =
        error ||
        null;
    }

    await updateContactCampaignFields({
      db,

      agentId,

      contactId,

      campaignId,

      fields:
        contactCampaignUpdate,
    });
  }

  /*
   * קמפיין אמיתי:
   * מעדכנים את recipient ואת מוני הקמפיין הראשי
   * ב-transaction אחד, ורק כאשר הסטטוס הגיע
   * לשלב חדש. כך webhook כפול לא מגדיל מונים שוב.
   */
  if (
    campaignId &&
    agentId &&
    contactId &&
    campaignSource !==
      "template"
  ) {
    const recipientExtraFields:
      Record<string, any> = {
        providerStatusTimestamp:
          providerTimestamp ||
          null,
      };

    if (
      waStatus ===
      "sent"
    ) {
      recipientExtraFields.sentConfirmedAt =
        timestamp;
    }

    if (
      waStatus ===
      "failed"
    ) {
      recipientExtraFields.error =
        error || null;
    }

    await updateCampaignRecipientProgress({
      db,
      agentId,
      campaignId,
      contactId,
      incomingStatus:
        waStatus,
      timestamp,
      waLastStatus:
        waStatus,
      error,
      extraFields:
        recipientExtraFields,
    });
  }
}

async function createAutomationEvent({
  db,
  agentId,
  contactId,
  conversationId,
  triggerType,
  message,
  quickReplyAction,
  templateName,
  routingResult,
}: {
  db: FirebaseFirestore.Firestore;
  agentId: string;
  contactId: string | null;
  conversationId: string;
  triggerType: string;
  message: any;
  quickReplyAction: string | null;
  templateName: string;
  routingResult: any;
}): Promise<string> {
  const eventRef =
    db
      .collection(
        `agents/${agentId}/magic_touch_events`
      )
      .doc();

  const messageText =
    getInboundMessageText(
      message
    );

  await eventRef.set({
    eventId:
      eventRef.id,

    agentId,

    contactId:
      contactId ||
      null,

    conversationId,

    triggerType,

    routing: {
  contactState:
    routingResult?.contactState ||
    null,

  flowState:
    routingResult?.flowState ||
    null,

  messageDisposition:
    routingResult?.messageDisposition ||
    null,

  resolvedAction:
    routingResult?.resolvedAction ||
    null,

  handling:
    routingResult?.handling ||
    null,

  activeRunId:
    routingResult?.activeRunId ||
    null,

  activeFlowId:
    routingResult?.activeFlowId ||
    null,

  previousRunId:
    routingResult?.previousRunId ||
    null,

  reason:
    routingResult?.reason ||
    null,

  suggestedReply:
    routingResult?.suggestedReply ||
    null,

  suggestedReplyConfidence:
    typeof routingResult?.suggestedReplyConfidence ===
      "number"
      ? routingResult
          .suggestedReplyConfidence
      : null,
},

  channel:
  "whatsapp",

sourceSystem:
  "whatsapp",

messageType:
  s(
    message?.type
  ) ||
  null,

    messageText:
      messageText ||
      null,

    waMessageId:
      s(
        message?.id
      ) ||
      null,

    contextMessageId:
      s(
        message
          ?.context
          ?.id
      ) ||
      null,

    templateName:
      templateName ||
      null,

    quickReplyAction:
      quickReplyAction ||
      null,

    status:
      "pending",

    attempts:
      0,

    rawJson:
      JSON.stringify(
        message || {}
      ),

    occurredAt:
      nowTs(),

    createdAt:
      nowTs(),

    updatedAt:
      nowTs(),
  });

  return eventRef.id;
}

async function processInboundMessage({
  db,
  phoneNumberId,
  message,
  profileName,
  waId,
}: {
  db: FirebaseFirestore.Firestore;
  phoneNumberId: string;
  message: any;
  profileName?: string | null;
  waId?: string | null;
}): Promise<void> {
  const from =
    normalizePhone(
      s(
        message?.from
      )
    );

  const messageType =
    s(
      message?.type
    ) ||
    "unknown";

  const messageText =
    getInboundMessageText(
      message
    );

  const inboundWaMessageId =
    s(
      message?.id
    );

  if (
    !from
  ) {
    logger.warn(
      "[whatsappWebhook] Inbound message is missing sender phone",
      {
        phoneNumberId,
        messageType,
        inboundWaMessageId,
      }
    );

    return;
  }

  const agentId =
    await findAgentByPhoneNumberId(
      db,
      phoneNumberId
    );

  if (
    !agentId
  ) {
    await db
      .collection(
        "whatsapp_inbound_messages"
      )
      .add({
        phoneNumberId,

        from,

        type:
          messageType,

        text:
          messageText ||
          null,

        waMessageId:
          inboundWaMessageId ||
          null,

        rawJson:
          JSON.stringify(
            message || {}
          ),

        mappingStatus:
          "agent_not_found",

        createdAt:
          nowTs(),
      });

    return;
  }

  const conversationId =
    `${agentId}_${from}`;

  const conversationRef =
    db.doc(
      `whatsapp_conversations/${conversationId}`
    );

  const conversationSnap =
    await conversationRef.get();

  const conversationData =
    conversationSnap.exists
      ? conversationSnap.data() as any
      : {};

  /*
   * אם השיחה כבר מקושרת לאיש קשר קיים,
   * נשמור את אותו קישור.
   *
   * אם אין contactId בשיחה:
   * 1. מחפשים לפי הטלפון במנגנון הקיים.
   * 2. אם לא נמצא - יוצרים איש קשר חדש
   *    תחת agents/{agentId}/magic_touch_contacts.
   */
  let contactMatch:
    {
      contactId: string;
      contactRef: FirebaseFirestore.DocumentReference;
      contactData: Record<string, any>;
      created: boolean;
    } | null =
    null;

  const existingConversationContactId =
    s(
      conversationData
        ?.contactId
    );

  if (
    existingConversationContactId
  ) {
    const existingContactRef =
      db.doc(
        `agents/${agentId}/magic_touch_contacts/${existingConversationContactId}`
      );

    const existingContactSnap =
      await existingContactRef.get();

    if (
      existingContactSnap.exists
    ) {
      contactMatch = {
        contactId:
          existingConversationContactId,

        contactRef:
          existingContactRef,

        contactData:
          existingContactSnap.data() as
            Record<string, any>,

        created:
          false,
      };
    }
  }

  if (
    !contactMatch
  ) {
    contactMatch =
      await getOrCreateMagicTouchContactFromWhatsApp({
        db,

        agentId,

        phone:
          from,

        profileName:
          s(
            profileName
          ) ||
          null,

        waId:
          s(
            waId
          ) ||
          from,

        conversationId,
      });
  }

  const contactId =
    contactMatch.contactId;

  const customerName =
    s(
      contactMatch
        .contactData
        ?.fullName
    ) ||
    s(
      profileName
    ) ||
    s(
      conversationData
        ?.customerName
    ) ||
    null;

  if (
    contactMatch.created
  ) {
    logger.info(
      "[whatsappWebhook] New MagicTouch contact created from inbound WhatsApp",
      {
        agentId,

        contactId,

        conversationId,

        phone:
          from,

        profileName:
          s(
            profileName
          ) ||
          null,
      }
    );
  }

  const conversationMessageRef =
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

  const existingMessage =
    await conversationMessageRef
      .get();

  if (
    existingMessage.exists
  ) {
    logger.info(
      "[whatsappWebhook] Duplicate inbound message ignored",
      {
        agentId,
        from,
        inboundWaMessageId,
      }
    );

    return;
  }

  const contextMessageId =
    s(
      message
        ?.context
        ?.id
    );

  const originalMessageContext =
    await findOriginalMessageContext({
      db,
      conversationId,
      contextMessageId,
    });

  const templateName =
    originalMessageContext
      .templateName;

  const replyCampaignIdFromContext =
    originalMessageContext
      .campaignId ||
    originalMessageContext
      .templateName;

  const canUseLastCampaignFallback =
    s(
      conversationData
        ?.lastMessageDirection
    ) ===
      "outbound" &&
    s(
      conversationData
        ?.lastMessageType
    ) ===
      "template";

  const replyCampaignId =
    replyCampaignIdFromContext ||
    (
      canUseLastCampaignFallback
        ? s(
            conversationData
              ?.lastCampaignId
          )
        : ""
    );

  const replyCampaignAttribution =
    replyCampaignIdFromContext
      ? "context_message"
      : replyCampaignId
        ? "last_outbound_template"
        : null;

  const nativeInteractiveAction =
    getNativeInteractiveAction(
      message
    );

  const quickReplyAction =
    nativeInteractiveAction ||
    await getQuickReplyAction({
      db,
      agentId,
      templateName,
      messageText,
    });

  const reactionEmoji =
    messageType ===
      "reaction"
      ? s(
          message
            ?.reaction
            ?.emoji
        ) ||
        null
      : null;

  const reactionToWaMessageId =
    messageType ===
      "reaction"
      ? s(
          message
            ?.reaction
            ?.message_id
        ) ||
        null
      : null;

  const inboundMediaDescriptor =
    getWhatsAppInboundMediaDescriptor(
      message
    );

  let inboundMedia:
    StoredWhatsAppInboundMedia | null =
    null;

  let mediaDownloadError:
    string | null =
    null;

  if (
    inboundMediaDescriptor
  ) {
    try {
      const accessToken =
        await loadAgentWhatsAppAccessToken({
          db,
          agentId,
        });

      inboundMedia =
        await downloadWhatsAppInboundMediaToStorage({
          agentId,
          conversationId,
          message,
          accessToken,
        });
    } catch (
      mediaError: any
    ) {
      mediaDownloadError =
        mediaError
          ?.message ||
        String(
          mediaError
        );

      logger.error(
        "[whatsappWebhook] Failed to download inbound WhatsApp media",
        {
          agentId,
          contactId,
          conversationId,
          inboundWaMessageId,
          messageType,
          mediaId:
            inboundMediaDescriptor
              .mediaId,
          error:
            mediaDownloadError,
        }
      );
    }
  }

  const inboundMediaRecord =
    inboundMedia ||
    (
      inboundMediaDescriptor
        ? {
            mediaId:
              inboundMediaDescriptor
                .mediaId,
            type:
              inboundMediaDescriptor
                .type,
            mimeType:
              inboundMediaDescriptor
                .mimeType ||
              null,
            fileName:
              inboundMediaDescriptor
                .fileName ||
              null,
            caption:
              inboundMediaDescriptor
                .caption ||
              null,
            storagePath:
              null,
            size:
              null,
            sha256:
              null,
          }
        : null
    );

  const timestamp =
    nowTs();

  const nextConversationData:
    Record<string, any> = {
      agentId,

      contactId,

      phoneNumberId,

      customerPhone:
        from,

      customerName,

      status:
        "open",

      lastMessageText:
        messageText ||
        `[${messageType}]`,

      lastMessageType:
        messageType,

      lastMessageDirection:
        "inbound",

      lastMessageAt:
        timestamp,

      lastInboundAt:
        timestamp,

      unreadCount:
        FieldValue.increment(
          1
        ),

      needsReply:
        true,

      updatedAt:
        timestamp,
    };

  if (
    !conversationSnap.exists
  ) {
    nextConversationData.createdAt =
      timestamp;
  }

  await Promise.all([
    conversationRef.set(
      nextConversationData,
      {
        merge: true,
      }
    ),

    conversationMessageRef.set({
      agentId,

      contactId,

      conversationId,

      direction:
        "inbound",

      from,

      toPhoneNumberId:
        phoneNumberId,

      type:
        messageType,

      text:
        messageText ||
        null,

      media:
        inboundMediaRecord,

      mediaDownloadError:
        mediaDownloadError ||
        null,

      reactionEmoji,

      reactionToWaMessageId,

      templateName:
        templateName ||
        null,

      campaignId:
        replyCampaignId ||
        null,

      campaignAttribution:
        replyCampaignAttribution,

      quickReplyAction:
        quickReplyAction ||
        null,

      contextMessageId:
        contextMessageId ||
        null,

      waMessageId:
        inboundWaMessageId ||
        null,

      status:
        "received",

      rawJson:
        JSON.stringify(
          message || {}
        ),

      createdAt:
        timestamp,

      updatedAt:
        timestamp,
    }),

    db
      .collection(
        "whatsapp_inbound_messages"
      )
      .add({
        agentId,

        contactId,

        conversationId,

        phoneNumberId,

        from,

        type:
          messageType,

        text:
          messageText ||
          null,

        media:
          inboundMediaRecord,

        mediaDownloadError:
          mediaDownloadError ||
          null,

        reactionEmoji,

        reactionToWaMessageId,

        templateName:
          templateName ||
          null,

        campaignId:
          replyCampaignId ||
          null,

        campaignAttribution:
          replyCampaignAttribution,

        quickReplyAction:
          quickReplyAction ||
          null,

        waMessageId:
          inboundWaMessageId ||
          null,

        rawJson:
          JSON.stringify(
            message || {}
          ),

        mappingStatus:
          contactId
            ? "contact_matched"
            : "contact_not_found",

        createdAt:
          timestamp,
      }),
  ]);

  if (
    contactMatch
  ) {
    await contactMatch
      .contactRef
      .set(
        {
          lastInboundAt:
            timestamp,

          lastReplyText:
            messageText ||
            null,

          lastWhatsAppInboundMessageId:
            inboundWaMessageId ||
            null,

          whatsappConversationId:
            conversationId,

          updatedAt:
            timestamp,
        },
        {
          merge: true,
        }
      );

    if (
      replyCampaignId
    ) {
      await updateContactCampaignFields({
        db,

        agentId,

        contactId:
          contactMatch
            .contactId,

        campaignId:
          replyCampaignId,

        fields: {
          status:
            "replied",

          repliedAt:
            timestamp,

          lastReplyAt:
            timestamp,

          replyCount:
            FieldValue.increment(
              1
            ),

          replyWaMessageId:
            inboundWaMessageId ||
            null,

          replyText:
            messageText ||
            null,

          replyMessageType:
            messageType,

          replyAttribution:
            replyCampaignAttribution,

          updatedAt:
            timestamp,
        },
      });

      /*
       * תגובה לקמפיין נחשבת גם delivered/read/replied
       * לצורכי funnel. ה-transaction מונע ספירה כפולה
       * אם אותה הודעה/תגובה מעובדת שוב.
       */
      await updateCampaignRecipientProgress({
        db,
        agentId,
        campaignId:
          replyCampaignId,
        contactId:
          contactMatch
            .contactId,
        incomingStatus:
          "replied",
        timestamp,
        extraFields: {
          replyWaMessageId:
            inboundWaMessageId ||
            null,
          replyText:
            messageText ||
            null,
          replyMessageType:
            messageType,
          replyAttribution:
            replyCampaignAttribution,
        },
      });
    }

    try {
      await addMagicTouchTimelineEvent({
        agentId,

        contactId:
          contactMatch
            .contactId,

        type:
          "whatsapp_message_received",

        channel:
          "whatsapp",

        title:
          quickReplyAction
            ? "התקבלה תגובה לתבנית WhatsApp"
            : "התקבלה הודעת WhatsApp",

        description:
          messageText ||
          `[${messageType}]`,

        direction:
          "inbound",

        status:
          "completed",

        createdBy:
          "system:whatsapp_webhook",

        sourceSystem:
          "whatsapp",

        sourceRecordId:
          inboundWaMessageId ||
          null,

        metadata: {
          waMessageId:
            inboundWaMessageId ||
            null,

          conversationId,

          phoneNumberId,

          customerPhone:
            from,

          messageType,

          media:
            inboundMediaRecord,

          mediaDownloadError:
            mediaDownloadError ||
            null,

          reactionEmoji,

          reactionToWaMessageId,

          contextMessageId:
            contextMessageId ||
            null,

          templateName:
            templateName ||
            null,

          campaignId:
            replyCampaignId ||
            null,

          campaignAttribution:
            replyCampaignAttribution,

          quickReplyAction:
            quickReplyAction ||
            null,
        },
      });
    } catch (
      timelineError: any
    ) {
      logger.error(
        "[whatsappWebhook] Failed to create inbound Timeline event",
        {
          agentId,

          contactId:
            contactMatch
              .contactId,

          conversationId,

          inboundWaMessageId,

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

  /*
   * יצירת אירוע כללי למנוע ה־Flow.
   * בשלב הזה האירוע רק נשמר במצב pending.
   * מנוע האוטומציות שנבנה בהמשך יחליט אילו פעולות לבצע.
   */


const routingResult =
  await routeMagicTouchConversation({
    agentId,

    contactId,

    conversationId,

    phoneNormalized:
      from,

    messageText:
      messageText ||
      null,

    messageType:
      messageType ||
      null,

    quickReplyAction:
      quickReplyAction ||
      null,
  });

logger.info(
  "[whatsappWebhook] Conversation routing result",
  {
    agentId,

    contactId,

    conversationId,

    inboundWaMessageId,

    routingResult,
  }
);


  const automationEventId =
    await createAutomationEvent({
      db,

      agentId,

      contactId,

      conversationId,

      triggerType:
        quickReplyAction
          ? "whatsapp_quick_reply_received"
          : "whatsapp_message_received",

      message,

      quickReplyAction,

      templateName,
       routingResult,
    });


  /*
   * Safe AI Reply:
   * שולחים רק תשובה שכבר עברה:
   * intent resolution + allowed intent + confidence + safe reply generation.
   *
   * חשוב:
   * אין כאן Resume ל-Flow ואין שינוי ב-waitingFor של ה-Run.
   */
  if (
    routingResult
      ?.handling ===
      "safe_reply"
  ) {
    const suggestedReply =
      s(
        routingResult
          ?.suggestedReply
      );

    const suggestedReplyConfidence =
      typeof routingResult
        ?.suggestedReplyConfidence ===
        "number"
        ? routingResult
            .suggestedReplyConfidence
        : null;

    if (
      suggestedReply
    ) {
      try {
        const safeReplyWaMessageId =
          await sendMagicTouchSafeReply({
            db,

            agentId,

            contactId,

            conversationId,

            phoneNumberId,

            to:
              from,

            replyText:
              suggestedReply,

            inboundWaMessageId,

            resolvedAction:
              s(
                routingResult
                  ?.resolvedAction
              ) ||
              null,

            confidence:
              suggestedReplyConfidence,
          });

        await db
          .doc(
            `agents/${agentId}/magic_touch_events/${automationEventId}`
          )
          .set(
            {
              safeReply: {
                sent:
                  true,

                text:
                  suggestedReply,

                waMessageId:
                  safeReplyWaMessageId,

                intent:
                  s(
                    routingResult
                      ?.resolvedAction
                  ) ||
                  null,

                confidence:
                  suggestedReplyConfidence,

                sentAt:
                  nowTs(),
              },

              updatedAt:
                nowTs(),
            },
            {
              merge:
                true,
            }
          );

        logger.info(
          "[whatsappWebhook] Safe AI reply sent",
          {
            agentId,

            contactId,

            conversationId,

            inboundWaMessageId,

            safeReplyWaMessageId,

            resolvedAction:
              routingResult
                ?.resolvedAction ||
              null,

            confidence:
              suggestedReplyConfidence,
          }
        );
      } catch (
        safeReplyError: any
      ) {
        logger.error(
          "[whatsappWebhook] Failed to send safe AI reply",
          {
            agentId,

            contactId,

            conversationId,

            inboundWaMessageId,

            error:
              safeReplyError
                ?.message ||
              String(
                safeReplyError
              ),
          }
        );

        await db
          .doc(
            `agents/${agentId}/magic_touch_events/${automationEventId}`
          )
          .set(
            {
              safeReply: {
                sent:
                  false,

                text:
                  suggestedReply,

                intent:
                  s(
                    routingResult
                      ?.resolvedAction
                  ) ||
                  null,

                confidence:
                  suggestedReplyConfidence,

                error:
                  safeReplyError
                    ?.message ||
                  String(
                    safeReplyError
                  ),

                failedAt:
                  nowTs(),
              },

              updatedAt:
                nowTs(),
            },
            {
              merge:
                true,
            }
          );
      }
    }
  }


  logger.info(
    "[whatsappWebhook] Inbound message processed",
    {
      agentId,

      contactId,

      conversationId,

      from,

      messageType,

      messageText,

      templateName,

      quickReplyAction,

      inboundWaMessageId,

      automationEventId,
    }
  );
}

export const whatsappWebhook =
  onRequest(
    {
      region:
        FUNCTIONS_REGION,

      secrets: [
        WHATSAPP_WEBHOOK_VERIFY_TOKEN,
        PORTAL_ENC_KEY_B64,
        OPENAI_API_KEY,
      ],

      timeoutSeconds:
        60,

      memory:
        "256MiB",
    },

    async (
      req,
      res
    ) => {
      const db =
        adminDb();

      if (
        req.method === "GET"
      ) {
        const mode =
          s(
            req.query[
              "hub.mode"
            ]
          );

        const token =
          s(
            req.query[
              "hub.verify_token"
            ]
          );

        const challenge =
          s(
            req.query[
              "hub.challenge"
            ]
          );

        if (
          mode ===
            "subscribe" &&
          token ===
            WHATSAPP_WEBHOOK_VERIFY_TOKEN
              .value()
        ) {
          logger.info(
            "[whatsappWebhook] Verification succeeded"
          );

          res
            .status(200)
            .send(
              challenge
            );

          return;
        }

        logger.warn(
          "[whatsappWebhook] Verification failed",
          {
            mode,
          }
        );

        res.sendStatus(
          403
        );

        return;
      }

      if (
        req.method !==
        "POST"
      ) {
        res.sendStatus(
          405
        );

        return;
      }

      try {
        const originalBody =
          req.body;

        const projectId =
          PROJECT_ID;

        const isProduction =
          PROJECT_ID ===
          PROD_PROJECT_ID;

        let body =
          originalBody;

        logger.info(
          "[whatsappWebhook] Payload received",
          {
            projectId:
              projectId ||
              null,

            body:
              JSON.stringify(
                originalBody
              ),
          }
        );

        if (
          isProduction
        ) {
          const {
            productionBody,
            testBody,
            testChangeCount,
          } =
            splitWebhookBodyByEnvironment(
              originalBody
            );

          if (
            testBody &&
            testChangeCount >
              0
          ) {
            logger.info(
              "[whatsappWebhook] Forwarding test WhatsApp payload to test environment",
              {
                projectId,

                testPhoneNumberId:
                  TEST_WHATSAPP_PHONE_NUMBER_ID,

                testChangeCount,

                target:
                  TEST_WHATSAPP_WEBHOOK_URL,
              }
            );

            await forwardWebhookBodyToTest(
              testBody
            );

            logger.info(
              "[whatsappWebhook] Test WhatsApp payload forwarded successfully",
              {
                testPhoneNumberId:
                  TEST_WHATSAPP_PHONE_NUMBER_ID,

                testChangeCount,
              }
            );
          }

          if (
            !productionBody
          ) {
            res.sendStatus(
              200
            );

            return;
          }

          body =
            productionBody;
        }

        const entries =
          Array.isArray(
            body?.entry
          )
            ? body.entry
            : [];

        for (
          const entry of
          entries
        ) {
          const changes =
            Array.isArray(
              entry?.changes
            )
              ? entry.changes
              : [];

          for (
            const change of
            changes
          ) {
            if (
              change?.field !==
              "messages"
            ) {
              continue;
            }

            const value =
              change?.value ||
              {};

            const phoneNumberId =
              s(
                value
                  ?.metadata
                  ?.phone_number_id
              );

            const statuses =
              Array.isArray(
                value?.statuses
              )
                ? value.statuses
                : [];

            for (
              const status of
              statuses
            ) {
              const waMessageId =
                s(
                  status?.id
                );

              const waStatus =
                s(
                  status
                    ?.status
                );

              const recipientId =
                s(
                  status
                    ?.recipient_id
                );

              const providerTimestamp =
                s(
                  status
                    ?.timestamp
                );

              const error =
                Array.isArray(
                  status?.errors
                )
                  ? status
                      .errors[0] ||
                    null
                  : null;

              logger.info(
                "[whatsappWebhook] Status received",
                {
                  phoneNumberId,

                  waMessageId,

                  waStatus,

                  recipientId,

                  error,
                }
              );

              if (
                !waMessageId ||
                !waStatus
              ) {
                continue;
              }

              await updateOutboundMessageStatus({
                db,

                waMessageId,

                waStatus,

                recipientId,

                providerTimestamp,

                error,
              });
            }

            const messages =
              Array.isArray(
                value?.messages
              )
                ? value.messages
                : [];

            const contacts =
              Array.isArray(
                value?.contacts
              )
                ? value.contacts
                : [];

            for (
              const message of
              messages
            ) {
              try {
                const messageFrom =
                  normalizePhone(
                    s(
                      message?.from
                    )
                  );

                const matchingContact =
                  contacts.find(
                    (
                      contact: any
                    ) =>
                      normalizePhone(
                        s(
                          contact?.wa_id
                        )
                      ) ===
                        messageFrom
                  ) ||
                  contacts[0] ||
                  null;

                await processInboundMessage({
                  db,

                  phoneNumberId,

                  message,

                  profileName:
                    s(
                      matchingContact
                        ?.profile
                        ?.name
                    ) ||
                    null,

                  waId:
                    s(
                      matchingContact
                        ?.wa_id
                    ) ||
                    messageFrom ||
                    null,
                });
              } catch (
                messageError: any
              ) {
                logger.error(
                  "[whatsappWebhook] Failed to process inbound message",
                  {
                    phoneNumberId,

                    waMessageId:
                      s(
                        message?.id
                      ),

                    error:
                      messageError
                        ?.message ||
                      String(
                        messageError
                      ),
                  }
                );

                /*
                 * לא מפילים את כל ה־Webhook בגלל הודעה בודדת.
                 * Meta עשויה לשלוח מספר הודעות באותו Payload.
                 */
              }
            }
          }
        }

        res.sendStatus(
          200
        );
      } catch (
        error: any
      ) {
        logger.error(
          "[whatsappWebhook] Request failed",
          {
            error:
              error
                ?.message ||
              String(
                error
              ),
          }
        );

        res.sendStatus(
          500
        );
      }
    }
  );