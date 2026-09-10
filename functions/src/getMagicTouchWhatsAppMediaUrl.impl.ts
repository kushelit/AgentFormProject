/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";
import {
  getStorage,
} from "firebase-admin/storage";

import {
  adminDb,
} from "./shared/admin";
import {
  requireBackendPermission,
} from "./shared/backendPermissions";

const SIGNED_URL_TTL_MS =
  15 * 60 * 1000;

function s(
  value: unknown
): string {
  return String(
    value ?? ""
  ).trim();
}

export async function getMagicTouchWhatsAppMediaUrlImpl(
  req: any
): Promise<object> {
  const authUid =
    s(
      req.auth?.uid
    );

  if (!authUid) {
    throw new HttpsError(
      "unauthenticated",
      "Login required"
    );
  }

  const conversationId =
    s(
      req.data
        ?.conversationId
    );

  const messageId =
    s(
      req.data
        ?.messageId
    );

  if (
    !conversationId ||
    !messageId
  ) {
    throw new HttpsError(
      "invalid-argument",
      "conversationId and messageId are required"
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

  if (
    !userSnap.exists
  ) {
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
    db.doc(
      `whatsapp_conversations/${conversationId}`
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

  const conversationData =
    conversationSnap.data() as any;

  const agentId =
    s(
      conversationData
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

  const userAgentId =
    s(
      userData
        ?.agentId
    ) ||
    authUid;

  if (
    !isAdmin &&
    agentId !==
      userAgentId
  ) {
    throw new HttpsError(
      "permission-denied",
      "Cannot access media for another agent"
    );
  }

  const messageSnap =
    await conversationRef
      .collection(
        "messages"
      )
      .doc(
        messageId
      )
      .get();

  if (
    !messageSnap.exists
  ) {
    throw new HttpsError(
      "not-found",
      "Message not found"
    );
  }

  const messageData =
    messageSnap.data() as any;

  if (
    s(
      messageData
        ?.agentId
    ) &&
    s(
      messageData
        ?.agentId
    ) !==
      agentId
  ) {
    throw new HttpsError(
      "permission-denied",
      "Message agent mismatch"
    );
  }

  const media =
    messageData
      ?.media &&
    typeof messageData
      .media ===
      "object"
      ? messageData
          .media
      : null;

  const storagePath =
    s(
      media
        ?.storagePath
    );

  if (!storagePath) {
    throw new HttpsError(
      "not-found",
      "Message does not contain stored media"
    );
  }

  const allowedPrefixes =
    [
      `agents/${agentId}/whatsapp-inbound-media/`,
      `agents/${agentId}/whatsapp-conversation-media/`,
    ];

  const isAllowedStoragePath =
    allowedPrefixes.some(
      (
        prefix
      ) =>
        storagePath.startsWith(
          prefix
        )
    );

  if (
    !isAllowedStoragePath
  ) {
    throw new HttpsError(
      "permission-denied",
      "Invalid media storage path"
    );
  }

  const expiresAt =
    Date.now() +
    SIGNED_URL_TTL_MS;

  const [url] =
    await getStorage()
      .bucket()
      .file(
        storagePath
      )
      .getSignedUrl({
        version:
          "v4",
        action:
          "read",
        expires:
          expiresAt,
      });

  return {
    ok:
      true,
    agentId,
    conversationId,
    messageId,
    url,
    expiresAt,
    media: {
      type:
        s(
          media?.type
        ) ||
        null,
      mimeType:
        s(
          media
            ?.mimeType
        ) ||
        null,
      fileName:
        s(
          media
            ?.fileName
        ) ||
        null,
      caption:
        s(
          media
            ?.caption
        ) ||
        null,
      size:
        Number(
          media?.size ||
          0
        ),
    },
  };
}
