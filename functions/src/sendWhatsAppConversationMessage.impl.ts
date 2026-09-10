/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  randomUUID,
} from "node:crypto";

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  getStorage,
} from "firebase-admin/storage";

import {
  adminDb,
  nowTs,
} from "./shared/admin";

import {
  safeString,
} from "./shared/magicTouchContacts";

import {
  requireBackendPermission,
} from "./shared/backendPermissions";

import {
  sendWhatsAppConversationText,
} from "./shared/sendWhatsAppConversationText";

import {
  PORTAL_ENC_KEY_B64,
} from "./shared/secrets";

import {
  decryptJsonAes256Gcm,
} from "./shared/cryptoAesGcm";

import {
  addMagicTouchTimelineEvent,
} from "./shared/magicTouchTimelineService";

const WA_API_URL =
  "https://graph.facebook.com/v25.0";

const MAX_OUTBOUND_FILE_SIZE_BYTES =
  18 * 1024 * 1024;

type SendAction =
  | "text"
  | "media"
  | "reaction";

type OutboundMediaType =
  | "image"
  | "document"
  | "video"
  | "audio";

type AuthorizedConversationContext = {
  db: FirebaseFirestore.Firestore;
  authUid: string;
  userData: any;
  conversationId: string;
  conversationRef: FirebaseFirestore.DocumentReference;
  conversation: any;
  agentId: string;
  contactId: string | null;
  phoneNumberId: string;
  customerPhone: string;
};

function normalizePhone(
  value: unknown
): string {
  const digits =
    safeString(
      value
    ).replace(
      /\D/g,
      ""
    );

  if (
    digits.startsWith(
      "972"
    )
  ) {
    return digits;
  }

  if (
    digits.startsWith(
      "0"
    )
  ) {
    return `972${digits.slice(1)}`;
  }

  if (
    digits.length ===
    9
  ) {
    return `972${digits}`;
  }

  return digits;
}

function timestampToMillis(
  value: any
): number | null {
  if (!value) {
    return null;
  }

  if (
    typeof value ===
      "number"
  ) {
    return value;
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

  return null;
}

function ensureServiceWindowOpen(
  conversation: any
): void {
  const lastInboundAt =
    timestampToMillis(
      conversation
        ?.lastInboundAt
    );

  if (
    !lastInboundAt ||
    Date.now() -
      lastInboundAt >=
      24 *
        60 *
        60 *
        1000
  ) {
    throw new HttpsError(
      "failed-precondition",
      "חלפו יותר מ־24 שעות מהודעת הלקוח האחרונה. יש לשלוח תבנית WhatsApp מאושרת."
    );
  }
}

function sanitizeFileName(
  value: unknown
): string {
  const normalized =
    safeString(
      value
    )
      .replace(
        /[\/\\:*?"<>|]+/g,
        "_"
      )
      .replace(
        /\s+/g,
        "_"
      )
      .replace(
        /_+/g,
        "_"
      )
      .replace(
        /^_+|_+$/g,
        ""
      );

  return (
    normalized ||
    "attachment"
  );
}

function resolveMediaType(
  mimeType: string,
  requestedType: unknown
): OutboundMediaType {
  const explicit =
    safeString(
      requestedType
    ).toLowerCase();

  if (
    [
      "image",
      "document",
      "video",
      "audio",
    ].includes(
      explicit
    )
  ) {
    return explicit as
      OutboundMediaType;
  }

  const mime =
    safeString(
      mimeType
    ).toLowerCase();

  if (
    mime.startsWith(
      "image/"
    )
  ) {
    return "image";
  }

  if (
    mime.startsWith(
      "video/"
    )
  ) {
    return "video";
  }

  if (
    mime.startsWith(
      "audio/"
    )
  ) {
    return "audio";
  }

  return "document";
}

async function resolveAuthorizedConversation(
  req: any
): Promise<AuthorizedConversationContext> {
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

  if (!conversationId) {
    throw new HttpsError(
      "invalid-argument",
      "Missing conversationId"
    );
  }

  const db =
    adminDb();

  const userSnap =
    await (db as any)
      .collection(
        "users"
      )
      .doc(
        authUid
      )
      .get();

  if (!userSnap.exists) {
    throw new HttpsError(
      "permission-denied",
      "User not found"
    );
  }

  const userData =
    userSnap.data() as any;

  await requireBackendPermission({
    db:
      db as any,

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
    await conversationRef
      .get();

  if (!conversationSnap.exists) {
    throw new HttpsError(
      "not-found",
      "Conversation not found"
    );
  }

  const conversation =
    conversationSnap.data() as any;

  const agentId =
    safeString(
      conversation
        ?.agentId
    );

  if (!agentId) {
    throw new HttpsError(
      "failed-precondition",
      "Conversation is missing agentId"
    );
  }

  const isAdmin =
    userData?.role ===
      "admin" ||
    userData?.isSystem ===
      true;

  const loggedInAgentId =
    safeString(
      userData?.agentId
    ) ||
    authUid;

  if (
    !isAdmin &&
    agentId !==
      loggedInAgentId
  ) {
    throw new HttpsError(
      "permission-denied",
      "Conversation does not belong to the current agent"
    );
  }

  const phoneNumberId =
    safeString(
      conversation
        ?.phoneNumberId
    );

  const customerPhone =
    normalizePhone(
      conversation
        ?.customerPhone
    );

  if (
    !phoneNumberId ||
    !customerPhone
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Conversation is missing WhatsApp sending details"
    );
  }

  return {
    db:
      db as any,

    authUid,

    userData,

    conversationId,

    conversationRef,

    conversation,

    agentId,

    contactId:
      safeString(
        conversation
          ?.contactId
      ) ||
      null,

    phoneNumberId,

    customerPhone,
  };
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
    throw new HttpsError(
      "failed-precondition",
      "WhatsApp token was not found for this agent"
    );
  }

  const keyB64 =
    safeString(
      PORTAL_ENC_KEY_B64
        .value()
    );

  if (!keyB64) {
    throw new HttpsError(
      "internal",
      "Missing encryption key"
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
    safeString(
      decrypted
        ?.accessToken
    );

  if (!accessToken) {
    throw new HttpsError(
      "failed-precondition",
      "Invalid WhatsApp access token"
    );
  }

  return accessToken;
}

async function parseMetaResponse(
  response: Response
): Promise<any> {
  const responseText =
    await response.text();

  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(
      responseText
    );
  } catch {
    return {
      raw:
        responseText,
    };
  }
}

async function sendWhatsAppReaction({
  context,
  targetWaMessageId,
  emoji,
}: {
  context: AuthorizedConversationContext;
  targetWaMessageId: string;
  emoji: string;
}): Promise<object> {
  ensureServiceWindowOpen(
    context.conversation
  );

  if (
    !targetWaMessageId ||
    !emoji
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing reaction target or emoji"
    );
  }

  const targetQuery =
    await context
      .conversationRef
      .collection(
        "messages"
      )
      .where(
        "waMessageId",
        "==",
        targetWaMessageId
      )
      .limit(1)
      .get();

  if (
    targetQuery.empty
  ) {
    throw new HttpsError(
      "not-found",
      "The message selected for reaction was not found"
    );
  }

  const accessToken =
    await loadAgentWhatsAppAccessToken({
      db:
        context.db,

      agentId:
        context.agentId,
    });

  const response =
    await fetch(
      `${WA_API_URL}/${context.phoneNumberId}/messages`,
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

            to:
              context
                .customerPhone,

            type:
              "reaction",

            reaction: {
              message_id:
                targetWaMessageId,

              emoji,
            },
          }),
      }
    );

  const responseData =
    await parseMetaResponse(
      response
    );

  const waMessageId =
    safeString(
      responseData
        ?.messages?.[0]
        ?.id
    );

  if (
    !response.ok ||
    !waMessageId
  ) {
    throw new HttpsError(
      "failed-precondition",
      responseData
        ?.error
        ?.message ||
        "Failed to send WhatsApp reaction"
    );
  }

  const timestamp =
    nowTs();

  await context
    .conversationRef
    .collection(
      "messages"
    )
    .doc(
      waMessageId
    )
    .set({
      agentId:
        context.agentId,

      contactId:
        context.contactId,

      conversationId:
        context.conversationId,

      direction:
        "outbound",

      fromPhoneNumberId:
        context.phoneNumberId,

      to:
        context.customerPhone,

      type:
        "reaction",

      text:
        emoji,

      reactionEmoji:
        emoji,

      reactionToWaMessageId:
        targetWaMessageId,

      waMessageId,

      status:
        "accepted",

      source:
        "user",

      sentBy:
        context.authUid,

      sentByName:
        safeString(
          context.userData
            ?.name
        ) ||
        null,

      createdAt:
        timestamp,

      updatedAt:
        timestamp,
    });

  await context
    .conversationRef
    .set(
      {
        updatedAt:
          timestamp,
      },
      {
        merge:
          true,
      }
    );

  return {
    ok:
      true,

    action:
      "reaction",

    agentId:
      context.agentId,

    contactId:
      context.contactId,

    conversationId:
      context.conversationId,

    waMessageId,

    reactionEmoji:
      emoji,

    reactionToWaMessageId:
      targetWaMessageId,
  };
}

async function sendWhatsAppMedia({
  context,
  mediaInput,
  caption,
}: {
  context: AuthorizedConversationContext;
  mediaInput: any;
  caption: string;
}): Promise<object> {
  ensureServiceWindowOpen(
    context.conversation
  );

  const fileName =
    safeString(
      mediaInput
        ?.fileName
    );

  const mimeType =
    safeString(
      mediaInput
        ?.mimeType
    ).toLowerCase();

  const base64 =
    safeString(
      mediaInput
        ?.base64
    );

  if (
    !fileName ||
    !mimeType ||
    !base64
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing media file data"
    );
  }

  let fileBuffer:
    Buffer;

  try {
    fileBuffer =
      Buffer.from(
        base64,
        "base64"
      );
  } catch {
    throw new HttpsError(
      "invalid-argument",
      "Invalid media file data"
    );
  }

  if (
    !fileBuffer.length
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The selected file is empty"
    );
  }

  if (
    fileBuffer.length >
    MAX_OUTBOUND_FILE_SIZE_BYTES
  ) {
    throw new HttpsError(
      "invalid-argument",
      "הקובץ גדול מדי לשליחה ידנית. ניתן לשלוח קובץ עד 18MB."
    );
  }

  const mediaType =
    resolveMediaType(
      mimeType,
      mediaInput
        ?.type
    );

  const storagePath =
    [
      "agents",
      context.agentId,
      "whatsapp-conversation-media",
      context.conversationId,
      `${randomUUID()}-${sanitizeFileName(
        fileName
      )}`,
    ].join("/");

  const storageFile =
    getStorage()
      .bucket()
      .file(
        storagePath
      );

  await storageFile.save(
    fileBuffer,
    {
      resumable:
        false,

      contentType:
        mimeType,

      metadata: {
        contentType:
          mimeType,

        metadata: {
          agentId:
            context.agentId,

          conversationId:
            context.conversationId,

          originalFileName:
            fileName,

          mediaType,

          source:
            "whatsapp_outbound_manual",

          uploadedBy:
            context.authUid,
        },
      },
    }
  );

  try {
    const accessToken =
      await loadAgentWhatsAppAccessToken({
        db:
          context.db,

        agentId:
          context.agentId,
      });

    const formData =
      new FormData();

    formData.append(
      "messaging_product",
      "whatsapp"
    );

    formData.append(
      "type",
      mimeType
    );

    formData.append(
      "file",
      new Blob(
        [
          fileBuffer,
        ],
        {
          type:
            mimeType,
        }
      ),
      fileName
    );

    const uploadResponse =
      await fetch(
        `${WA_API_URL}/${context.phoneNumberId}/media`,
        {
          method:
            "POST",

          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },

          body:
            formData,
        }
      );

    const uploadData =
      await parseMetaResponse(
        uploadResponse
      );

    const mediaId =
      safeString(
        uploadData
          ?.id
      );

    if (
      !uploadResponse.ok ||
      !mediaId
    ) {
      throw new HttpsError(
        "failed-precondition",
        uploadData
          ?.error
          ?.message ||
          "Failed to upload WhatsApp media"
      );
    }

    const mediaObject:
      Record<string, any> = {
        id:
          mediaId,
      };

    if (
      mediaType ===
        "document"
    ) {
      mediaObject.filename =
        fileName;
    }

    if (
      caption &&
      mediaType !==
        "audio"
    ) {
      mediaObject.caption =
        caption;
    }

    const sendResponse =
      await fetch(
        `${WA_API_URL}/${context.phoneNumberId}/messages`,
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

              to:
                context.customerPhone,

              type:
                mediaType,

              [mediaType]:
                mediaObject,
            }),
        }
      );

    const sendData =
      await parseMetaResponse(
        sendResponse
      );

    const waMessageId =
      safeString(
        sendData
          ?.messages?.[0]
          ?.id
      );

    if (
      !sendResponse.ok ||
      !waMessageId
    ) {
      throw new HttpsError(
        "failed-precondition",
        sendData
          ?.error
          ?.message ||
          "Failed to send WhatsApp media"
      );
    }

    const timestamp =
      nowTs();

    const displayText =
      caption ||
      (
        mediaType ===
          "image"
          ? "[תמונה]"
          : mediaType ===
              "video"
            ? "[וידאו]"
            : mediaType ===
                "audio"
              ? "[הודעה קולית]"
              : fileName
      );

    const messageRef =
      context
        .conversationRef
        .collection(
          "messages"
        )
        .doc(
          waMessageId
        );

    const contactRef =
      context.contactId
        ? context.db.doc(
            `agents/${context.agentId}/magic_touch_contacts/${context.contactId}`
          )
        : null;

    const writes:
      Promise<any>[] = [
        messageRef.set({
          agentId:
            context.agentId,

          contactId:
            context.contactId,

          conversationId:
            context.conversationId,

          direction:
            "outbound",

          fromPhoneNumberId:
            context.phoneNumberId,

          to:
            context.customerPhone,

          type:
            mediaType,

          text:
            caption ||
            null,

          media: {
            mediaId,

            type:
              mediaType,

            mimeType,

            fileName,

            caption:
              caption ||
              null,

            storagePath,

            size:
              fileBuffer.length,

            sha256:
              null,
          },

          waMessageId,

          status:
            "accepted",

          source:
            "user",

          sentBy:
            context.authUid,

          sentByName:
            safeString(
              context.userData
                ?.name
            ) ||
            null,

          createdAt:
            timestamp,

          updatedAt:
            timestamp,
        }),

        context
          .conversationRef
          .set(
            {
              lastMessageText:
                displayText,

              lastMessageType:
                mediaType,

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
      ];

    if (
      contactRef
    ) {
      writes.push(
        contactRef.set(
          {
            lastOutboundAt:
              timestamp,

            lastWhatsAppMessageId:
              waMessageId,

            whatsappConversationId:
              context.conversationId,

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

    if (
      context.contactId
    ) {
      try {
        await addMagicTouchTimelineEvent({
          agentId:
            context.agentId,

          contactId:
            context.contactId,

          type:
            "whatsapp_message_sent",

          channel:
            "whatsapp",

          title:
            "נשלחה הודעת WhatsApp עם קובץ",

          description:
            displayText,

          direction:
            "outbound",

          status:
            "completed",

          createdBy:
            context.authUid,

          sourceSystem:
            "whatsapp",

          sourceRecordId:
            waMessageId,

          metadata: {
            waMessageId,

            conversationId:
              context.conversationId,

            phoneNumberId:
              context.phoneNumberId,

            customerPhone:
              context.customerPhone,

            messageType:
              mediaType,

            media: {
              mediaId,

              mimeType,

              fileName,

              storagePath,

              size:
                fileBuffer.length,
            },
          },
        });
      } catch (
        timelineError: any
      ) {
        console.error(
          "[sendWhatsAppConversationMessage] Failed to create media Timeline event",
          timelineError
            ?.message ||
          String(
            timelineError
          )
        );
      }
    }

    return {
      ok:
        true,

      action:
        "media",

      agentId:
        context.agentId,

      contactId:
        context.contactId,

      conversationId:
        context.conversationId,

      waMessageId,

      media: {
        mediaId,

        type:
          mediaType,

        mimeType,

        fileName,

        caption:
          caption ||
          null,

        storagePath,

        size:
          fileBuffer.length,
      },
    };
  } catch (
    error
  ) {
    try {
      await storageFile
        .delete({
          ignoreNotFound:
            true,
        });
    } catch {
      // לא מסתירים את שגיאת השליחה המקורית.
    }

    throw error;
  }
}

export async function sendWhatsAppConversationMessageImpl(
  req: any
): Promise<object> {
  const context =
    await resolveAuthorizedConversation(
      req
    );

  const action =
    (
      safeString(
        req.data
          ?.action
      ) ||
      "text"
    ).toLowerCase() as
      SendAction;

  if (
    action ===
      "text"
  ) {
    const text =
      safeString(
        req.data?.text
      );

    if (!text) {
      throw new HttpsError(
        "invalid-argument",
        "Missing text"
      );
    }

    ensureServiceWindowOpen(
      context.conversation
    );

    return sendWhatsAppConversationText({
      agentId:
        context.agentId,

      conversationId:
        context.conversationId,

      text,

      sentBy:
        context.authUid,

      sentByName:
        safeString(
          context.userData
            ?.name
        ) ||
        null,

      source:
        "user",
    });
  }

  if (
    action ===
      "reaction"
  ) {
    return sendWhatsAppReaction({
      context,

      targetWaMessageId:
        safeString(
          req.data
            ?.reaction
            ?.messageId
        ),

      emoji:
        safeString(
          req.data
            ?.reaction
            ?.emoji
        ),
    });
  }

  if (
    action ===
      "media"
  ) {
    return sendWhatsAppMedia({
      context,

      mediaInput:
        req.data
          ?.media,

      caption:
        safeString(
          req.data
            ?.text
        ),
    });
  }

  throw new HttpsError(
    "invalid-argument",
    "Unsupported WhatsApp conversation action"
  );
}
