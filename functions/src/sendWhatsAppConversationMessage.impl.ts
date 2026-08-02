/* eslint-disable require-jsdoc */
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  HttpsError,
} from "firebase-functions/v2/https";

import {
  adminDb,
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
    conversationAgentId !==
      loggedInAgentId
  ) {
    throw new HttpsError(
      "permission-denied",
      "Conversation does not belong to the current agent"
    );
  }

  return sendWhatsAppConversationText({
    agentId:
      conversationAgentId,

    conversationId,

    text,

    sentBy:
      authUid,

    sentByName:
      safeString(
        userData?.name
      ) ||
      null,

    source:
      "user",
  });
}