/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
  nowTs,
} from "./shared/admin";

import {
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

import {
  decryptJsonAes256Gcm,
} from "./shared/cryptoAesGcm";

import {
  safeString,
} from "./shared/magicTouchContacts";

import {
  requireBackendPermission,
} from "./shared/backendPermissions";

import {
  resolveMagicTouchContact,
} from "./shared/magicTouchContactLookup";

import {
  addMagicTouchTimelineEvent,
} from "./shared/magicTouchTimelineService";

const WA_API_URL =
  "https://graph.facebook.com/v25.0";

export async function sendWhatsAppConversationMessageImpl(
  req: any
): Promise<object> {
  const authUid =
    safeString(
      req.auth?.uid
    );

  if (!authUid) {
    throw new HttpsError(
      "unauthenticated",
      "Login required"
    );
  }

  const conversationId =
    safeString(
      req.data?.conversationId
    );

  const text =
    safeString(
      req.data?.text
    );

  if (!conversationId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing conversationId"
    );
  }

  if (!text) {
    throw new HttpsError(
      "invalid-argument",
      "Missing text"
    );
  }

  if (text.length > 4096) {
    throw new HttpsError(
      "invalid-argument",
      "WhatsApp message is too long"
    );
  }

  const db =
    adminDb();

  const userSnap =
    await (db as any)
      .collection("users")
      .doc(authUid)
      .get();

  if (!userSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "User not found"
    );
  }

  const userData =
    userSnap.data() as any;

  /*
   * שליחת WhatsApp דורשת הרשאת שליחה.
   * ההרשאה יכולה להגיע ממנוי, Role או Override ידני.
   */
  await requireBackendPermission({
    db: db as any,
    userId:
      authUid,
    userData,
    permission:
  "access_magic_touch",
  });

  const conversationRef =
    (db as any).doc(
      `whatsapp_conversations/${conversationId}`
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

  const isAdmin =
    userData?.role === "admin" ||
    userData?.isSystem === true;

  const loggedInAgentId =
    safeString(
      userData?.agentId
    ) ||
    authUid;

  /*
   * עובד יכול לשלוח עבור הסוכן שאליו הוא משויך.
   * Admin יכול לעבוד עבור סוכן נבחר.
   */
  if (
    !isAdmin &&
    conversationAgentId !==
      loggedInAgentId
  ) {
    throw new HttpsError(
      "permission-denied",
      "Conversation does not belong to the current agent"
    );
  }

  const agentId =
    conversationAgentId;

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

  /*
   * קודם משתמשים ב-contactId שכבר נשמר בשיחה.
   * עבור שיחות ישנות נחפש לפי מספר הטלפון.
   */
  const magicTouchContact =
    await resolveMagicTouchContact({
      db: db as any,
      agentId,

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
        `agents/${agentId}/secrets/whatsapp`
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
                false,

              body:
                text,
            },
          }),
      }
    );

  const waData: any =
    await waRes.json();

  const waMessageId =
    safeString(
      waData?.messages?.[0]?.id
    ) ||
    null;

  if (
    !waRes.ok ||
    !waMessageId
  ) {
    console.error(
      "[sendWhatsAppConversationMessage] WA error:",
      JSON.stringify(
        waData
      )
    );

    throw new HttpsError(
      "failed-precondition",
      waData?.error?.message ||
        "Failed to send WhatsApp message"
    );
  }

  const messageRef =
    conversationRef
      .collection("messages")
      .doc(waMessageId);

  const timestamp =
    nowTs();

  await messageRef.set(
    {
      agentId,

      contactId,

      conversationId,

      direction:
        "outbound",

      fromPhoneNumberId:
        phoneNumberId,

      to:
        customerPhone,

      type:
        "text",

      text,

      waMessageId,

      status:
        "accepted",

      sentBy:
        authUid,

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
      agentId,

      contactId,

      lastMessageText:
        text,

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
            text,

          lastWhatsAppMessageId:
            waMessageId,

          whatsappConversationId:
            conversationId,

          updatedAt:
            timestamp,
        },
        {
          merge:
            true,
        }
      );

    /*
     * Meta כבר קיבלה את ההודעה.
     * כשל ב-Timeline לא צריך לגרום ללקוח לחשוב שהשליחה נכשלה.
     */
    try {
      await addMagicTouchTimelineEvent({
        agentId,

        contactId:
          magicTouchContact
            .contactId,

        type:
          "whatsapp_message_sent",

        channel:
          "whatsapp",

        title:
          "נשלחה הודעת WhatsApp",

        description:
          text,

        direction:
          "outbound",

        status:
          "completed",

        createdBy:
          authUid,

        sourceSystem:
          "whatsapp",

        sourceRecordId:
          waMessageId,

        metadata: {
          waMessageId,
          conversationId,
          phoneNumberId,
          customerPhone,
          sentByName:
            safeString(
              userData?.name
            ) ||
            null,
        },
      });
    } catch (
      timelineError: any
    ) {
      console.error(
        "[sendWhatsAppConversationMessage] Timeline event failed",
        {
          agentId,
          contactId:
            magicTouchContact
              .contactId,
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
  } else {
    console.warn(
      "[sendWhatsAppConversationMessage] Magic Touch contact not found",
      {
        agentId,
        conversationId,
        customerPhone,
        waMessageId,
      }
    );
  }

  return {
    ok:
      true,

    agentId,
    contactId,

    conversationId,
    waMessageId,
  };
}